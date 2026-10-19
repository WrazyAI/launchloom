import type { NeonAuthLogger, RequestContext } from "@neondatabase/auth/server";

type NeonAuthModule = typeof import("@neondatabase/auth/server");

// The auth SDK is loaded only on an explicit neon-mode auth request. Keeping it
// out of the static module graph preserves Durable Object and legacy-route
// startup for the default access-mode deployment.
let neonAuthModulePromise: Promise<NeonAuthModule> | null = null;

function loadNeonAuth() {
  neonAuthModulePromise ??= import("@neondatabase/auth/server");
  return neonAuthModulePromise;
}

// Must match the package's public NEON_AUTH_COOKIE_PREFIX export; the focused
// test asserts the current SDK value so a provider rename cannot pass silently.
const NEON_AUTH_COOKIE_PREFIX_VALUE = "__Secure-neon-auth";
const NEON_AUTH_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${NEON_AUTH_COOKIE_PREFIX_VALUE}`, "u");

const AUTH_PATH_PREFIX = "/api/admin/onboarding-invites/auth/";
const SECURE_DEFAULT_CALLBACK = "/admin/onboarding-invites";
const MIN_COOKIE_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_MAX_KEYS = 5_000;

const silentLog: NeonAuthLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

export type AdminAuthMode = "access" | "neon";

export interface AdminAuthEnv {
  ADMIN_AUTH_MODE?: AdminAuthMode;
  NEON_AUTH_BASE_URL?: string;
  NEON_AUTH_COOKIE_SECRET?: string;
  ADMIN_PUBLIC_ORIGIN?: string;
}

export interface VerifiedSession {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  expiresAt: number;
}

export class AdminAuthConfigError extends Error {
  readonly code = "auth_not_configured";
  readonly status = 503;
  readonly missing: string[];

  constructor(missing: string[]) {
    super("Admin authentication is not configured.");
    this.name = "AdminAuthConfigError";
    this.missing = missing;
  }
}

export class AdminAuthDependencyError extends Error {
  readonly code = "dependency_unavailable";
  readonly status = 503;

  constructor() {
    super("Admin authentication is temporarily unavailable.");
    this.name = "AdminAuthDependencyError";
  }
}

type NeonConfig = {
  mode: "neon";
  baseUrl: string;
  cookieSecret: string;
  publicOrigin: string;
};

type AuthRoute = {
  method: "GET" | "POST";
  json: boolean;
  sensitive: boolean;
  callbackField: "callbackURL" | "redirectTo" | null;
};

const AUTH_ROUTES: ReadonlyMap<string, AuthRoute> = new Map([
  ["sign-up/email", { method: "POST", json: true, sensitive: true, callbackField: "callbackURL" }],
  ["sign-in/email", { method: "POST", json: true, sensitive: true, callbackField: "callbackURL" }],
  ["sign-out", { method: "POST", json: false, sensitive: false, callbackField: null }],
  ["get-session", { method: "GET", json: false, sensitive: false, callbackField: null }],
  ["request-password-reset", { method: "POST", json: true, sensitive: true, callbackField: "redirectTo" }],
  // Better Auth has used both names; keep the legacy alias explicit instead of
  // proxying an arbitrary slash-delimited path.
  ["forget-password", { method: "POST", json: true, sensitive: true, callbackField: "redirectTo" }],
  ["reset-password", { method: "POST", json: true, sensitive: true, callbackField: null }],
  ["send-verification-email", { method: "POST", json: true, sensitive: true, callbackField: "callbackURL" }],
  ["verify-email", { method: "GET", json: false, sensitive: false, callbackField: "callbackURL" }],
  ["change-password", { method: "POST", json: true, sensitive: true, callbackField: null }],
]);

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function isHttpsUrl(value: string | undefined, allowPath: boolean) {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (!allowPath && url.pathname !== "/") return null;
    if (url.pathname.includes("\\") || url.pathname.includes("..")) return null;
    return allowPath ? url.href.replace(/\/$/u, "") : url.origin;
  } catch {
    return null;
  }
}

function readiness(env: AdminAuthEnv) {
  const missing: string[] = [];
  if (env.ADMIN_AUTH_MODE !== "neon") missing.push("ADMIN_AUTH_MODE=neon");
  if (!isHttpsUrl(env.NEON_AUTH_BASE_URL, true)) missing.push("NEON_AUTH_BASE_URL");
  if (!env.NEON_AUTH_COOKIE_SECRET || env.NEON_AUTH_COOKIE_SECRET.length < MIN_COOKIE_SECRET_LENGTH)
    missing.push("NEON_AUTH_COOKIE_SECRET");
  if (!isHttpsUrl(env.ADMIN_PUBLIC_ORIGIN, false)) missing.push("ADMIN_PUBLIC_ORIGIN");
  return missing;
}

function requireNeonConfig(env: AdminAuthEnv): NeonConfig {
  const missing = readiness(env);
  if (missing.length > 0) throw new AdminAuthConfigError(missing);
  return {
    mode: "neon",
    baseUrl: isHttpsUrl(env.NEON_AUTH_BASE_URL, true)!,
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET!,
    publicOrigin: isHttpsUrl(env.ADMIN_PUBLIC_ORIGIN, false)!,
  };
}

function responseJson(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}

function dependencyUnavailable() {
  return responseJson(
    {
      error: {
        code: "dependency_unavailable",
        message: "Admin authentication is temporarily unavailable.",
      },
    },
    503,
  );
}

function notFound() {
  return responseJson({ error: { code: "not_found", message: "Not found." } }, 404);
}

/**
 * Return the validated same-origin admin destination or null. This deliberately
 * decodes repeatedly so encoded slash, backslash, or CRLF tricks cannot pass an
 * allowlist that only inspects the raw string.
 */
export function safeAdminReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2_048) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\#]/u.test(value)) return null;

  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("//") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f#]/u.test(decoded)
    )
      return null;
  }

  try {
    const url = new URL(decoded, "https://admin.invalid");
    if (url.origin !== "https://admin.invalid") return null;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function readCallback(value: unknown) {
  if (value === undefined) return { value: SECURE_DEFAULT_CALLBACK, present: false };
  const safe = safeAdminReturnPath(value);
  return safe === null ? null : { value: safe, present: true };
}

function rewriteJsonCallbacks(
  route: AuthRoute,
  text: string,
): { text: string } | { error: "invalid_body" | "invalid_callback" } {
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return { error: "invalid_body" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_body" };

  const record = body as Record<string, unknown>;
  if (!route.callbackField) return { text: JSON.stringify(record) };

  const acceptedKeys = ["callbackURL", "callbackUrl", "redirectTo", "returnTo"];
  const supplied = acceptedKeys
    .filter((key) => record[key] !== undefined)
    .map((key) => ({ key, value: record[key] }));

  let callback = SECURE_DEFAULT_CALLBACK;
  for (const candidate of supplied) {
    const safe = readCallback(candidate.value);
    if (!safe) return { error: "invalid_callback" };
    callback = safe.value;
  }

  for (const key of acceptedKeys) if (key !== route.callbackField) delete record[key];
  record[route.callbackField] = callback;
  return { text: JSON.stringify(record) };
}

function rewriteQueryCallback(
  route: AuthRoute,
  url: URL,
): { url: URL } | { error: "invalid_callback" } {
  if (!route.callbackField) return { url };
  const copy = new URL(url);
  const acceptedKeys = ["callbackURL", "callbackUrl", "redirectTo", "returnTo"];
  let callback = SECURE_DEFAULT_CALLBACK;
  for (const key of acceptedKeys) {
    const value = copy.searchParams.get(key);
    if (value === null) continue;
    const safe = readCallback(value);
    if (!safe) return { error: "invalid_callback" };
    callback = safe.value;
  }
  for (const key of acceptedKeys) copy.searchParams.delete(key);
  copy.searchParams.set(route.callbackField, callback);
  return { url: copy };
}

function clientAddress(request: Request) {
  const connecting = request.headers.get("CF-Connecting-IP")?.trim();
  return connecting || "";
}

function rateLimit(route: string, request: Request) {
  const client = clientAddress(request);
  if (!client) return null;
  const now = Date.now();
  if (rateBuckets.size > RATE_LIMIT_MAX_KEYS) {
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(key);
    }
    if (rateBuckets.size > RATE_LIMIT_MAX_KEYS) rateBuckets.clear();
  }
  const key = `${route}\n${client}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  current.count += 1;
  if (current.count <= RATE_LIMIT_MAX_ATTEMPTS) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function sanitizeAuthCookies(headers: Headers, authModule: NeonAuthModule) {
  const setCookies = headers.getSetCookie();
  if (setCookies.length === 0) return;
  headers.delete("Set-Cookie");
  for (const raw of setCookies) {
    for (const cookie of authModule.parseSetCookies(raw)) {
      if (!cookie.name.startsWith(authModule.NEON_AUTH_COOKIE_PREFIX)) continue;
      headers.append(
        "Set-Cookie",
        authModule.serializeSetCookie({
          ...cookie,
          domain: undefined,
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          partitioned: undefined,
        }),
      );
    }
  }
}

function sanitizeProxyResponse(response: Response, authModule: NeonAuthModule): Response {
  const headers = new Headers(response.headers);
  sanitizeAuthCookies(headers, authModule);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Vary", "Cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createRequestContext(
  request: Request,
  publicOrigin: string,
  extractCookies: (value: string) => string,
): RequestContext {
  return {
    getCookies: () => extractCookies(request.headers.get("cookie") ?? ""),
    setCookie: () => undefined,
    getHeader: (name) => request.headers.get(name),
    getOrigin: () => publicOrigin,
    getFramework: () => "cloudflare-worker",
  };
}

/**
 * Proxy only the baseline email auth surface. This is not a generic reverse
 * proxy: paths, methods, callback destinations, request bodies, and cookies are
 * all validated here before the toolkit sees the request.
 */
export async function proxyAdminAuth(request: Request, env: AdminAuthEnv): Promise<Response> {
  if (env.ADMIN_AUTH_MODE !== "neon") return notFound();

  let config: NeonConfig;
  try {
    config = requireNeonConfig(env);
  } catch {
    return dependencyUnavailable();
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== config.publicOrigin) return notFound();
  if (!requestUrl.pathname.startsWith(AUTH_PATH_PREFIX)) return notFound();

  const path = requestUrl.pathname.slice(AUTH_PATH_PREFIX.length).replace(/\/$/u, "");
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u.test(path) || path.length > 80) return notFound();
  const route = AUTH_ROUTES.get(path);
  if (!route) return notFound();
  if (request.method !== route.method)
    return responseJson({ error: { code: "method_not_allowed", message: "Method not allowed." } }, 405, {
      Allow: route.method,
    });

  if (route.method === "POST") {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== config.publicOrigin)
      return responseJson({ error: { code: "invalid_origin", message: "Invalid request origin." } }, 403);
  }

  if (route.sensitive) {
    const retryAfter = rateLimit(path, request);
    if (retryAfter !== null)
      return responseJson(
        { error: { code: "rate_limited", message: "Too many authentication attempts." } },
        429,
        { "Retry-After": String(retryAfter) },
      );
  }

  let proxyUrl = requestUrl;
  let body: string | undefined;
  if (route.method === "POST") {
    const raw = await readBoundedBody(request);
    if (raw === null)
      return responseJson({ error: { code: "body_too_large", message: "Request body is too large." } }, 413);
    if (route.json) {
      const contentType = request.headers.get("Content-Type") || "";
      if (!/^application\/json(?:\s*;|$)/iu.test(contentType))
        return responseJson(
          { error: { code: "unsupported_media_type", message: "JSON request body required." } },
          415,
        );
      const rewritten = rewriteJsonCallbacks(route, raw);
      if ("error" in rewritten)
        return responseJson({ error: { code: rewritten.error, message: "Invalid request." } }, 400);
      body = rewritten.text;
    } else {
      body = raw || undefined;
    }
  } else {
    const rewritten = rewriteQueryCallback(route, requestUrl);
    if ("error" in rewritten)
      return responseJson({ error: { code: "invalid_callback", message: "Invalid request." } }, 400);
    proxyUrl = rewritten.url;
  }

  const upstreamRequest = new Request(proxyUrl.href, {
    method: request.method,
    headers: (() => {
      const headers = new Headers(request.headers);
      // The provider must only see the trusted deployment origin, never a
      // caller-controlled Referer or unvalidated Origin.
      headers.set("Origin", config.publicOrigin);
      headers.delete("Referer");
      headers.delete("Content-Length");
      headers.delete("Host");
      // Protected authorization is cookie-only; a caller-supplied bearer token
      // must not be forwarded to the provider as an alternate identity.
      headers.delete("Authorization");
      if (body !== undefined) headers.set("Content-Type", "application/json");
      return headers;
    })(),
    body,
  });

  let authModule: NeonAuthModule;
  try {
    authModule = await loadNeonAuth();
  } catch {
    return dependencyUnavailable();
  }

  try {
    const upstream = await authModule.handleAuthProxyRequest({
      request: upstreamRequest,
      path,
      baseUrl: config.baseUrl,
      cookieSecret: config.cookieSecret,
      sameSite: "lax",
      log: silentLog,
    });
    if (upstream.status >= 500 || upstream.status === 429) return dependencyUnavailable();
    const sanitized = sanitizeProxyResponse(upstream, authModule);
    if (sanitized.status >= 300 && sanitized.status < 400) {
      const fallback = route.callbackField ? proxyUrl.searchParams.get(route.callbackField) : null;
      const safe = safeAdminReturnPath(fallback) || SECURE_DEFAULT_CALLBACK;
      sanitized.headers.set("Location", safe);
    }
    return sanitized;
  } catch (error) {
    if (error instanceof AdminAuthDependencyError) return dependencyUnavailable();
    return dependencyUnavailable();
  }
}

function providerSessionData(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const data = value as {
    session?: Record<string, unknown> | null;
    user?: Record<string, unknown> | null;
  };
  if (!data.session || !data.user) return null;
  return { session: data.session, user: data.user };
}

function sessionExpiry(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function cleanEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return "";
  return email;
}

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, limit);
}

/**
 * Read the current session from the provider without using the signed
 * session-data cookie cache. A provider outage is a typed 503, never a null
 * (signed-out) result and never an Access fallback.
 */
export async function readNeonSession(
  request: Request,
  env: AdminAuthEnv,
): Promise<VerifiedSession | null> {
  const config = requireNeonConfig(env);
  const cookieHeader = request.headers.get("cookie") || "";
  if (!NEON_AUTH_COOKIE_PATTERN.test(cookieHeader)) return null;

  let authModule: NeonAuthModule;
  try {
    authModule = await loadNeonAuth();
  } catch {
    throw new AdminAuthDependencyError();
  }

  const auth = authModule.createAuthServer({
    baseUrl: config.baseUrl,
    context: () =>
      createRequestContext(request, config.publicOrigin, authModule.extractNeonAuthCookies),
    cookieSecret: config.cookieSecret,
    sameSite: "lax",
    log: silentLog,
  });

  let result: {
    data: unknown;
    error: {
      status?: number;
      code?: string;
      message?: string;
    } | null;
  };
  try {
    result = (await auth.getSession({
      query: { disableCookieCache: "true" },
    })) as typeof result;
  } catch {
    throw new AdminAuthDependencyError();
  }

  if (result.error) {
    const status = result.error.status ?? 0;
    if (status === 400 || status === 401 || status === 403 || status === 422) return null;
    throw new AdminAuthDependencyError();
  }

  const data = providerSessionData(result.data);
  if (!data) return null;

  const subject = cleanText(data.user.id, 200);
  const email = cleanEmail(data.user.email);
  const expiresAt = sessionExpiry(data.session.expiresAt);
  if (!subject || !email || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  return {
    subject,
    email,
    emailVerified: data.user.emailVerified === true,
    displayName: cleanText(data.user.name, 100),
    expiresAt,
  };
}

/**
 * Public, data-free baseline login shell. The admin UI task replaces this with
 * the designed application; it deliberately contains no client data, no
 * localStorage token, and no provider credentials.
 */
export function renderAdminLoginShell(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in | LaunchLoom</title>
<style>
:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f2ea;color:#10251f;font:16px/1.5 system-ui,sans-serif}main{width:min(28rem,calc(100% - 2rem));background:#fffefa;border:1px solid #d9ddd1;border-radius:12px;padding:2rem}h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#587069;margin:0 0 1.5rem}label{display:block;font-weight:600;margin:1rem 0 .35rem}input{box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #587069;border-radius:8px;font:inherit}button{width:100%;margin-top:1rem;padding:.75rem;border:1px solid #10251f;border-radius:8px;background:#10251f;color:#fffefa;font:inherit;font-weight:600;cursor:pointer}button.secondary{background:transparent;color:#10251f}#status{min-height:1.5rem;margin-top:1rem;color:#587069}</style>
</head>
<body>
<main>
<h1>LaunchLoom admin</h1>
<p>Sign in with your approved admin account.</p>
<form id="auth-form">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button>
<button type="button" class="secondary" id="reset">Email a password reset link</button>
</form>
<div id="status" role="status" aria-live="polite"></div>
</main>
<script>
const prefix = "/api/admin/onboarding-invites/auth";
const fallback = "/admin/onboarding-invites";
const status = document.getElementById("status");
const email = document.getElementById("email");
const password = document.getElementById("password");
function safeReturn(value) {
  try {
    const url = new URL(value || fallback, location.origin);
    if (url.origin !== location.origin) return fallback;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
const returnTo = safeReturn(new URLSearchParams(location.search).get("returnTo"));
async function post(path, payload) {
  const response = await fetch(prefix + path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response;
}
document.querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Signing in\u2026";
  const response = await post("/sign-in/email", {
    email: email.value,
    password: password.value,
    callbackURL: returnTo,
  }).catch(() => null);
  password.value = "";
  if (response && response.ok) {
    location.assign(returnTo);
    return;
  }
  status.textContent = "Email or password did not match an approved account.";
});
document.getElementById("reset").addEventListener("click", async () => {
  if (!email.value) { status.textContent = "Enter your email first."; return; }
  status.textContent = "Requesting a reset link\u2026";
  await post("/request-password-reset", { email: email.value, redirectTo: returnTo }).catch(() => null);
  status.textContent = "If the account exists, a reset link has been sent.";
});
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
