import type { Env } from "./index";
import {
  AdminAuthError,
  requireAdminContext,
  toAdminAuthError,
  withAdminCookies,
} from "./admin/auth";
import {
  PREVIEW_PROXY_PREFIX,
  isAllowedPreviewHost,
  previewHostSuffixes,
  previewProxyPath,
} from "../../src/lib/preview-proxy-contract.mjs";

export { previewProxyPath };

/**
 * Authenticated preview proxy.
 *
 * Focused and diagnostic previews live behind the legacy Cloudflare Access
 * application. Access terminates the request before the site or Worker runs,
 * so a Neon admin session on the API origin can never satisfy it. This module
 * serves the same preview through the Worker origin: the admin session is
 * checked first, then the Worker fetches the preview with the Access service
 * token and rewrites same-site URLs back through the proxy.
 *
 * The proxied document is sandboxed into an opaque origin. Generated sites are
 * untrusted input; without that isolation their scripts would run on the admin
 * origin and could call admin APIs with the operator's cookies.
 */

const MAX_REWRITE_BYTES = 4 * 1024 * 1024;
const NO_STORE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

const HTML_CSP = [
  "default-src 'self' data: blob: https:",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https:",
  "media-src 'self' https:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
].join("; ");

export interface PreviewProxyGuard {
  setCookies: string[];
}

export type PreviewProxyAuthorize = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Promise<PreviewProxyGuard>;

export interface PreviewProxyDeps {
  authorize?: PreviewProxyAuthorize;
  fetch?: typeof fetch;
}

export interface PreviewProxyTarget {
  host: string;
  path: string;
  token?: string;
}

const TOKEN_TTL_MS = 60 * 60 * 1000;
const TOKEN_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TOKEN_LENGTH = 512;
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{20,400}\.[A-Za-z0-9_-]{20,200}$/u;

function base64UrlEncode(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replace(/-/gu, "+").replace(/_/gu, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function previewTokenKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * A short-lived, host-bound token carried in proxied URLs. The HTML document is
 * sandboxed into an opaque origin, so its subresource requests do not send the
 * admin session cookie. The token authenticates those requests without opening
 * the preview to anonymous callers, and it cannot be used against admin APIs.
 */
export async function mintPreviewToken(
  host: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  if (!secret)
    throw new Error("Preview token signing secret is not configured.");
  const payload = JSON.stringify({ h: host, e: now + TOKEN_TTL_MS });
  const encoded = base64UrlEncode(new TextEncoder().encode(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await previewTokenKey(secret),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64UrlEncode(signature)}`;
}

export async function verifyPreviewToken(
  token: string,
  host: string,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!secret || !token || token.length > MAX_TOKEN_LENGTH) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  let payload: { h?: unknown; e?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  } catch {
    return false;
  }
  if (payload.h !== host || typeof payload.e !== "number") return false;
  if (payload.e <= now || payload.e > now + TOKEN_TTL_MS + TOKEN_CLOCK_SKEW_MS)
    return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await previewTokenKey(secret),
      base64UrlDecode(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
  } catch {
    return false;
  }
}

function defaultPreviewPrefix(host: string) {
  return `${PREVIEW_PROXY_PREFIX}${host}`;
}

/** Parse `/admin/preview/[<token>/]<pages-host>/<path>`. */
export function parsePreviewProxyTarget(
  url: URL,
  env?: Env,
): PreviewProxyTarget | null {
  if (!url.pathname.startsWith(PREVIEW_PROXY_PREFIX)) return null;
  const rest = url.pathname.slice(PREVIEW_PROXY_PREFIX.length);
  if (!rest) return null;
  const slash = rest.indexOf("/");
  const first = slash === -1 ? rest : rest.slice(0, slash);
  const suffixes = previewHostSuffixes(env?.PREVIEW_PROXY_HOSTS);
  if (isAllowedPreviewHost(first, suffixes)) {
    const path = slash === -1 ? "/" : rest.slice(slash);
    return { host: first.toLowerCase(), path };
  }
  if (!TOKEN_SEGMENT.test(first)) return null;
  const afterToken = slash === -1 ? "" : rest.slice(slash + 1);
  const hostSlash = afterToken.indexOf("/");
  const rawHost = hostSlash === -1 ? afterToken : afterToken.slice(0, hostSlash);
  let host = "";
  try {
    host = decodeURIComponent(rawHost);
  } catch {
    return null;
  }
  if (!isAllowedPreviewHost(host, suffixes)) return null;
  const path = hostSlash === -1 ? "/" : afterToken.slice(hostSlash);
  return { host: host.toLowerCase(), path, token: first };
}

function isPassthroughUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower.startsWith("#") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("sms:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("about:")
  );
}

function rewriteUrlValue(value: string, host: string, prefix: string): string {
  const trimmed = value.trim();
  if (isPassthroughUrl(trimmed)) return value;
  if (trimmed.startsWith("//")) {
    try {
      const absolute = new URL(`https:${trimmed}`);
      if (
        absolute.hostname.toLowerCase() === host &&
        !absolute.username &&
        !absolute.password
      )
        return `${prefix}${absolute.pathname}${absolute.search}${absolute.hash}`;
    } catch {
      return value;
    }
    return value;
  }
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith(PREVIEW_PROXY_PREFIX)) return value;
    return `${prefix}${trimmed}`;
  }
  try {
    const absolute = new URL(trimmed);
    if (absolute.protocol !== "https:" && absolute.protocol !== "http:")
      return value;
    if (
      absolute.hostname.toLowerCase() === host &&
      !absolute.username &&
      !absolute.password
    )
      return `${prefix}${absolute.pathname}${absolute.search}${absolute.hash}`;
  } catch {
    return value;
  }
  return value;
}

function rewriteSrcset(value: string, host: string, prefix: string): string {
  return value
    .split(",")
    .map((part) => {
      const match = /^(\s*)(\S+)([\s\S]*)$/u.exec(part);
      if (!match) return part;
      return `${match[1]}${rewriteUrlValue(match[2], host, prefix)}${match[3]}`;
    })
    .join(",");
}

export function rewritePreviewCss(
  css: string,
  host: string,
  prefix = defaultPreviewPrefix(host),
): string {
  return String(css)
    .replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/giu,
      (match, quote: string, value: string) => {
        const rewritten = rewriteUrlValue(value, host, prefix);
        return rewritten === value
          ? match
          : `url(${quote}${rewritten}${quote})`;
      },
    )
    .replace(
      /(@import\s+)(['"])([^'"]+)\2/giu,
      (match, directive: string, quote: string, value: string) => {
        const rewritten = rewriteUrlValue(value, host, prefix);
        return rewritten === value
          ? match
          : `${directive}${quote}${rewritten}${quote}`;
      },
    );
}

export function rewritePreviewHtml(
  html: string,
  host: string,
  prefix = defaultPreviewPrefix(host),
): string {
  let output = String(html).replace(/<base\b[^>]*>/giu, "");
  output = output.replace(
    /(\s(?:href|src|action|poster|formaction|data-src|data-href|xlink:href)\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, attribute: string, quote: string, value: string) =>
      `${attribute}${quote}${rewriteUrlValue(value, host, prefix)}${quote}`,
  );
  output = output.replace(
    /(\s(?:srcset|data-srcset)\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, attribute: string, quote: string, value: string) =>
      `${attribute}${quote}${rewriteSrcset(value, host, prefix)}${quote}`,
  );
  output = output.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/giu,
    (_match, open: string, css: string, close: string) =>
      `${open}${rewritePreviewCss(css, host, prefix)}${close}`,
  );
  output = output.replace(
    /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, attribute: string, quote: string, value: string) =>
      `${attribute}${quote}${rewritePreviewCss(value, host, prefix)}${quote}`,
  );
  output = output.replace(
    /(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*)(["'])([^"']*)(["'])/giu,
    (_match, attribute: string, quote: string, content: string, close: string) => {
      const rewritten = content.replace(
        /(url\s*=\s*)([^\s"';]+)/giu,
        (_value, label: string, url: string) =>
          `${label}${rewriteUrlValue(url, host, prefix)}`,
      );
      return `${attribute}${quote}${rewritten}${close}`;
    },
  );
  // Relative URLs resolve against the document URL, which has no token. The
  // base element keeps them inside the token-scoped proxy path.
  const base = `<base href="${prefix}/">`;
  output = /<head\b[^>]*>/iu.test(output)
    ? output.replace(/(<head\b[^>]*>)/iu, `$1${base}`)
    : `${base}${output}`;
  return output;
}

export function rewritePreviewLocation(
  location: string,
  host: string,
  prefix = defaultPreviewPrefix(host),
): string {
  return rewriteUrlValue(location, host, prefix);
}

function isAccessLoginRedirect(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("Location") || "";
  try {
    const target = new URL(location, "https://preview.invalid");
    return (
      /(?:^|\.)cloudflareaccess\.com$/iu.test(target.hostname) ||
      /\/cdn-cgi\/access\/login(?:\/|$)/iu.test(target.pathname)
    );
  } catch {
    return false;
  }
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function loginRedirect(url: URL, setCookies: string[]): Response {
  const login = new URL("/admin/login", url);
  login.searchParams.set("returnTo", `${url.pathname}${url.search}`);
  return withAdminCookies(
    new Response(null, {
      status: 303,
      headers: {
        ...NO_STORE,
        Location: `${login.pathname}${login.search}`,
      },
    }),
    setCookies,
  );
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      ...NO_STORE,
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function notFound(): Response {
  return textResponse(404, "Not found");
}

async function rewritePreviewResponse(
  upstream: Response,
  host: string,
  prefix: string,
  method: string,
): Promise<Response> {
  const contentType = (
    upstream.headers.get("Content-Type") || ""
  ).toLowerCase();
  const isHtml = contentType.includes("text/html");
  const isCss = contentType.includes("text/css");
  const headers = new Headers(NO_STORE);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  const location = upstream.headers.get("Location");
  if (location)
    headers.set("Location", rewritePreviewLocation(location, host, prefix));

  if (isHtml) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Content-Security-Policy", HTML_CSP);
  } else if (isCss) {
    headers.set("Content-Type", "text/css; charset=utf-8");
  } else {
    const type = upstream.headers.get("Content-Type");
    if (type) headers.set("Content-Type", type);
    const disposition = upstream.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    const acceptRanges = upstream.headers.get("Accept-Ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) headers.set("Content-Range", contentRange);
  }

  if (
    method === "HEAD" ||
    upstream.status === 204 ||
    upstream.status === 205 ||
    upstream.status === 304
  )
    return new Response(null, { status: upstream.status, headers });

  if (isHtml || isCss) {
    const declared = Number(upstream.headers.get("Content-Length") || 0);
    if (declared > MAX_REWRITE_BYTES)
      return textResponse(
        502,
        "The preview response is too large to render safely.",
      );
    const source = await upstream.text();
    if (new TextEncoder().encode(source).byteLength > MAX_REWRITE_BYTES)
      return textResponse(
        502,
        "The preview response is too large to render safely.",
      );
    const body = isHtml
      ? rewritePreviewHtml(source, host, prefix)
      : rewritePreviewCss(source, host, prefix);
    headers.set(
      "Content-Length",
      String(new TextEncoder().encode(body).byteLength),
    );
    return new Response(body, { status: upstream.status, headers });
  }

  const length = upstream.headers.get("Content-Length");
  if (length && !upstream.headers.get("Content-Encoding"))
    headers.set("Content-Length", length);
  return new Response(upstream.body, { status: upstream.status, headers });
}

function validHttpsOrigin(value: string | undefined): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

const PREVIEW_COOKIE = "__ll_preview";

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return "";
}

function previewCookie(token: string): string {
  return `${PREVIEW_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`;
}

function redirectTo(location: string, setCookies: string[] = []): Response {
  return withAdminCookies(
    new Response(null, {
      status: 303,
      headers: { ...NO_STORE, Location: location },
    }),
    setCookies,
  );
}

function previewAuthUrl(
  env: Env,
  target: PreviewProxyTarget,
  search: string,
): string | null {
  const origin = validHttpsOrigin(env.ADMIN_PUBLIC_ORIGIN);
  if (!origin) return null;
  return `${origin}${PREVIEW_PROXY_PREFIX}${target.host}${target.path}${search}`;
}

async function fetchPreview(
  url: URL,
  target: PreviewProxyTarget,
  request: Request,
  env: Env,
  deps: PreviewProxyDeps,
): Promise<Response> {
  const headers = new Headers({
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "LaunchLoomPreviewProxy/1.0",
  });
  if (env.CLOUDFLARE_ACCESS_CLIENT_ID && env.CLOUDFLARE_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.CLOUDFLARE_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.CLOUDFLARE_ACCESS_CLIENT_SECRET);
  }
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  const fetchUpstream = deps.fetch ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchUpstream(
      `https://${target.host}${target.path}${url.search}`,
      {
        method: request.method,
        headers,
        redirect: "manual",
      },
    );
  } catch {
    return textResponse(502, "The preview could not be reached.");
  }

  if (isAccessLoginRedirect(upstream))
    return textResponse(
      502,
      "The preview proxy could not authenticate with the preview host.",
    );

  return rewritePreviewResponse(
    upstream,
    target.host,
    `${PREVIEW_PROXY_PREFIX}${target.host}`,
    request.method,
  );
}

/**
 * API-origin entry point. Verifies the Neon session, then hands the browser to
 * the preview origin with a short-lived token. The preview itself never runs on
 * the admin origin.
 */
export async function handlePreviewProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: PreviewProxyDeps = {},
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return methodNotAllowed();

  const url = new URL(request.url);
  const target = parsePreviewProxyTarget(url, env);
  if (!target) return notFound();

  const previewOrigin = validHttpsOrigin(env.PREVIEW_ORIGIN);
  if (!previewOrigin)
    return textResponse(503, "Preview origin is not configured.");
  const secret = env.REVIEW_SIGNING_SECRET;
  if (!secret) return textResponse(503, "Preview access is not configured.");

  const authorize = deps.authorize ?? requireAdminContext;
  let guard: PreviewProxyGuard;
  try {
    guard = await authorize(request, env, ctx);
  } catch (error) {
    const mapped = toAdminAuthError(error);
    if (mapped.status === 401) return loginRedirect(url, mapped.setCookies);
    return withAdminCookies(
      textResponse(mapped.status, mapped.message),
      mapped.setCookies,
    );
  }

  const token = await mintPreviewToken(target.host, secret);
  return redirectTo(
    `${previewOrigin}${PREVIEW_PROXY_PREFIX}${token}/${target.host}${target.path}${url.search}`,
    guard.setCookies,
  );
}

/**
 * Preview-origin entry point. Exchanges the one-time token for an HttpOnly
 * preview cookie, then serves the preview from a separate origin with the full
 * site JavaScript. Keeping this origin separate from the admin origin means
 * generated-site scripts cannot reach admin APIs with the operator's cookies.
 */
export async function handlePreviewOrigin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: PreviewProxyDeps = {},
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return methodNotAllowed();

  const url = new URL(request.url);
  const target = parsePreviewProxyTarget(url, env);
  if (!target) return null;

  const previewOrigin = validHttpsOrigin(env.PREVIEW_ORIGIN);
  if (!previewOrigin)
    return textResponse(503, "Preview origin is not configured.");
  const secret = env.REVIEW_SIGNING_SECRET;
  if (!secret) return textResponse(503, "Preview access is not configured.");
  const authUrl = previewAuthUrl(env, target, url.search);
  if (!authUrl)
    return textResponse(503, "Admin origin is not configured.");

  const cleanPath = `${PREVIEW_PROXY_PREFIX}${target.host}${target.path}${url.search}`;
  if (target.token) {
    const valid = await verifyPreviewToken(target.token, target.host, secret);
    if (!valid) return redirectTo(authUrl);
    return redirectTo(cleanPath, [previewCookie(target.token)]);
  }

  const cookie = readCookie(request, PREVIEW_COOKIE);
  const valid = cookie
    ? await verifyPreviewToken(cookie, target.host, secret)
    : false;
  if (!valid) return redirectTo(authUrl);

  return fetchPreview(url, target, request, env, deps);
}

/** Re-export for tests and callers that need the typed denial. */
export { AdminAuthError };
