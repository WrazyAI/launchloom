import { renderAdminLoginHtml } from "../admin-dashboard";

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
// test pins the current SDK value so a provider rename cannot pass silently.
const NEON_AUTH_COOKIE_PREFIX_VALUE = "__Secure-neon-auth";
const NEON_AUTH_COOKIE_PATTERN = new RegExp(
  `(?:^|;\\s*)${NEON_AUTH_COOKIE_PREFIX_VALUE}`,
  "u",
);

const AUTH_PATH_PREFIX = "/api/admin/onboarding-invites/auth/";
const SECURE_DEFAULT_CALLBACK = "/admin/onboarding-invites";
const MIN_COOKIE_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_UPSTREAM_BYTES = 256 * 1024;
const MAX_RESPONSE_COOKIES = 8;
const MAX_COOKIE_LENGTH = 4 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_MAX_KEYS = 5_000;

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

export interface NeonSessionRead {
  session: VerifiedSession | null;
  setCookies: string[];
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
    baseUrl: isHttpsUrl(env.NEON_AUTH_BASE_URL, true)!,
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET!,
    publicOrigin: isHttpsUrl(env.ADMIN_PUBLIC_ORIGIN, false)!,
  };
}

function responseJson(body: unknown, status: number, headers: HeadersInit = {}) {
  const merged = new Headers(headers);
  if (!merged.has("Content-Type")) merged.set("Content-Type", "application/json; charset=utf-8");
  if (!merged.has("Cache-Control")) merged.set("Cache-Control", "no-store");
  if (!merged.has("X-Content-Type-Options")) merged.set("X-Content-Type-Options", "nosniff");
  if (!merged.has("Referrer-Policy")) merged.set("Referrer-Policy", "no-referrer");
  return new Response(JSON.stringify(body), { status, headers: merged });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function safeAdminReturnLocation(value: unknown, publicOrigin: string): string | null {
  const relative = safeAdminReturnPath(value);
  if (relative) return relative;
  if (typeof value !== "string" || !value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.origin !== publicOrigin) return null;
    return safeAdminReturnPath(`${url.pathname}${url.search}`);
  } catch {
    return null;
  }
}

function readCallback(value: unknown) {
  if (value === undefined) return { value: SECURE_DEFAULT_CALLBACK };
  const safe = safeAdminReturnPath(value);
  return safe === null ? null : { value: safe };
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
  if (!isRecord(body)) return { error: "invalid_body" };

  if (!route.callbackField) return { text: JSON.stringify(body) };

  const acceptedKeys = ["callbackURL", "callbackUrl", "redirectTo", "returnTo"];
  const supplied = acceptedKeys
    .filter((key) => body[key] !== undefined)
    .map((key) => ({ key, value: body[key] }));

  let callback = SECURE_DEFAULT_CALLBACK;
  for (const candidate of supplied) {
    const safe = readCallback(candidate.value);
    if (!safe) return { error: "invalid_callback" };
    callback = safe.value;
  }

  for (const key of acceptedKeys) if (key !== route.callbackField) delete body[key];
  body[route.callbackField] = callback;
  return { text: JSON.stringify(body) };
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

async function readUpstreamText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_UPSTREAM_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new AdminAuthDependencyError();
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

/**
 * Single-hop upstream call with `redirect: "manual"` so a provider redirect can
 * never be followed server-side. There is no retry, proxy, or caller-supplied
 * upstream target.
 */
async function fetchUpstream(
  url: URL,
  method: string,
  headers: Headers,
  body?: string,
): Promise<{ status: number; headers: Headers; text: string }> {
  try {
    const response = await fetch(url.href, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    // Body consumption is part of the transport boundary: a reset, truncated
    // stream, or abort while reading must not escape as a raw TypeError.
    const text = await readUpstreamText(response);
    return { status: response.status, headers: response.headers, text };
  } catch (error) {
    if (error instanceof AdminAuthDependencyError) throw error;
    throw new AdminAuthDependencyError();
  }
}

function upstreamUrl(baseUrl: string, path: string, search: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  url.search = search;
  return url;
}

function upstreamHeaders(publicOrigin: string, cookieHeader: string, json: boolean) {
  const headers = new Headers({
    Origin: publicOrigin,
    Accept: "application/json",
    "x-neon-auth-proxy": "cloudflare-worker",
    "x-neon-auth-middleware": "true",
  });
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  if (json) headers.set("Content-Type", "application/json");
  return headers;
}

function sanitizeSetCookies(rawCookies: string[], authModule: NeonAuthModule): string[] {
  const result: string[] = [];
  for (const raw of rawCookies) {
    for (const cookie of authModule.parseSetCookies(raw)) {
      if (!cookie.name.startsWith(authModule.NEON_AUTH_COOKIE_PREFIX)) continue;
      const serialized = authModule.serializeSetCookie({
        ...cookie,
        domain: undefined,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        partitioned: undefined,
      });
      if (serialized.length > MAX_COOKIE_LENGTH) continue;
      result.push(serialized);
      if (result.length >= MAX_RESPONSE_COOKIES) return result;
    }
  }
  return result;
}

function browserHeaders(setCookies: string[], extra: Record<string, string> = {}) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    Vary: "Cookie",
    ...extra,
  });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return headers;
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

function sessionExpiry(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function publicUser(value: Record<string, unknown>) {
  const id = cleanText(value.id, 200);
  const email = cleanEmail(value.email);
  if (!id || !email) return null;
  return {
    id,
    email,
    emailVerified: value.emailVerified === true,
    name: cleanText(value.name, 100),
  };
}

function publicSession(value: Record<string, unknown>) {
  const expiresAt = sessionExpiry(value.expiresAt);
  return Number.isFinite(expiresAt) ? { expiresAt } : null;
}

/**
 * Deliberately public browser schema: user display fields and a session expiry,
 * never a bearer token, refresh token, JWT, or provider session token.
 */
function publicAuthPayload(value: unknown) {
  if (value === null || value === undefined) return { ok: true, user: null, session: null };
  if (!isRecord(value)) return null;
  return {
    ok: true,
    user: isRecord(value.user) ? publicUser(value.user) : null,
    session: isRecord(value.session) ? publicSession(value.session) : null,
  };
}

function providerErrorMessage(value: unknown) {
  if (!isRecord(value)) return "The request could not be completed.";
  const direct = typeof value.message === "string" ? value.message : "";
  const nested = isRecord(value.error) && typeof value.error.message === "string" ? value.error.message : "";
  return cleanText(direct || nested, 240) || "The request could not be completed.";
}

function verifiedSessionFrom(raw: unknown): VerifiedSession | null {
  if (!isRecord(raw)) throw new AdminAuthDependencyError();
  // Explicit supported signed-out shape.
  if (raw.session === null && raw.user === null) return null;
  const session = isRecord(raw.session) ? raw.session : null;
  const user = isRecord(raw.user) ? raw.user : null;
  if (!session || !user) throw new AdminAuthDependencyError();

  const subject = cleanText(user.id, 200);
  const email = cleanEmail(user.email);
  const expiresAt = sessionExpiry(session.expiresAt);
  if (!subject || !email || !Number.isFinite(expiresAt))
    throw new AdminAuthDependencyError();
  // A well-formed but expired session is a supported signed-out result.
  if (expiresAt <= Date.now()) return null;

  return {
    subject,
    email,
    emailVerified: user.emailVerified === true,
    displayName: cleanText(user.name, 100),
    expiresAt,
  };
}

function parseUpstreamJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AdminAuthDependencyError();
  }
}

/**
 * Proxy only the baseline email auth surface through a controlled single-hop
 * transport. This is not a generic reverse proxy: paths, methods, callbacks,
 * request bodies, cookies, and redirects are validated here, and the browser
 * response excludes provider credential fields.
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

  let authModule: NeonAuthModule;
  try {
    authModule = await loadNeonAuth();
  } catch {
    return dependencyUnavailable();
  }

  const cookieHeader = authModule.extractNeonAuthCookies(request.headers.get("cookie") ?? "");
  let upstream: { status: number; headers: Headers; text: string };
  try {
    upstream = await fetchUpstream(
      upstreamUrl(config.baseUrl, path, proxyUrl.search),
      request.method,
      upstreamHeaders(config.publicOrigin, cookieHeader, body !== undefined),
      body,
    );
  } catch (error) {
    if (error instanceof AdminAuthDependencyError) return dependencyUnavailable();
    return dependencyUnavailable();
  }

  const setCookies = sanitizeSetCookies(upstream.headers.getSetCookie(), authModule);

  if (upstream.status >= 500 || upstream.status === 429) return dependencyUnavailable();

  if (upstream.status >= 300 && upstream.status < 400) {
    const location =
      safeAdminReturnLocation(upstream.headers.get("location"), config.publicOrigin) ??
      SECURE_DEFAULT_CALLBACK;
    return new Response(null, {
      status: 302,
      headers: browserHeaders(setCookies, { Location: location }),
    });
  }

  let parsed: unknown;
  try {
    parsed = parseUpstreamJson(upstream.text);
  } catch (error) {
    if (upstream.status >= 200 && upstream.status < 300) return dependencyUnavailable();
    parsed = null;
  }

  if (upstream.status >= 200 && upstream.status < 300) {
    const payload = publicAuthPayload(parsed);
    if (!payload) return dependencyUnavailable();
    return responseJson(payload, 200, browserHeaders(setCookies));
  }

  return responseJson(
    { error: { code: "auth_failed", message: providerErrorMessage(parsed) } },
    upstream.status,
    browserHeaders(setCookies),
  );
}

/**
 * Read the current provider session without the signed session-data cookie
 * cache. Malformed successful payloads, wrong shapes, incomplete sessions and
 * invalid JSON are typed dependency failures, never signed-out. The returned
 * `setCookies` are sanitized provider renewal/clearing cookies the caller must
 * apply to the browser response (task 6 contract).
 */
export async function readNeonSession(
  request: Request,
  env: AdminAuthEnv,
): Promise<NeonSessionRead> {
  const config = requireNeonConfig(env);
  const cookieHeader = request.headers.get("cookie") || "";
  if (!NEON_AUTH_COOKIE_PATTERN.test(cookieHeader)) return { session: null, setCookies: [] };

  let authModule: NeonAuthModule;
  try {
    authModule = await loadNeonAuth();
  } catch {
    throw new AdminAuthDependencyError();
  }

  const upstream = await fetchUpstream(
    upstreamUrl(config.baseUrl, "get-session", "?disableCookieCache=true"),
    "GET",
    upstreamHeaders(
      config.publicOrigin,
      authModule.extractNeonAuthCookies(cookieHeader),
      false,
    ),
  );
  const setCookies = sanitizeSetCookies(upstream.headers.getSetCookie(), authModule);

  if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403 || upstream.status === 422)
    return { session: null, setCookies };
  if (upstream.status < 200 || upstream.status >= 300 || upstream.status === 429)
    throw new AdminAuthDependencyError();
  // A successful session read must carry an explicit JSON body; empty or
  // non-JSON output cannot be treated as signed-out.
  if (!upstream.text.trim()) throw new AdminAuthDependencyError();
  const parsed = parseUpstreamJson(upstream.text);
  // Better Auth returns JSON `null` for a supported signed-out session.
  if (parsed === null) return { session: null, setCookies };
  const session = verifiedSessionFrom(parsed);
  return { session, setCookies };
}

/**
 * Public, data-free login shell. It mounts the same compiled admin entry as the
 * workspace and contains no client data, localStorage token or provider
 * credentials. Account forms arrive with the accounts UI task.
 */
export function renderAdminLoginShell(): Response {
  return new Response(renderAdminLoginHtml(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
    },
  });
}
