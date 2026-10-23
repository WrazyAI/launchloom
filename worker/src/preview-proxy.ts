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
  "sandbox allow-scripts allow-forms allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-top-navigation-by-user-activation",
  "allow-downloads",
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
}

/** Parse `/admin/preview/<pages-host>/<path>` without accepting userinfo or ports. */
export function parsePreviewProxyTarget(
  url: URL,
  env?: Env,
): PreviewProxyTarget | null {
  if (!url.pathname.startsWith(PREVIEW_PROXY_PREFIX)) return null;
  const rest = url.pathname.slice(PREVIEW_PROXY_PREFIX.length);
  if (!rest) return null;
  const slash = rest.indexOf("/");
  const rawHost = slash === -1 ? rest : rest.slice(0, slash);
  let host = "";
  try {
    host = decodeURIComponent(rawHost);
  } catch {
    return null;
  }
  if (
    !isAllowedPreviewHost(host, previewHostSuffixes(env?.PREVIEW_PROXY_HOSTS))
  )
    return null;
  const path = slash === -1 ? "/" : rest.slice(slash);
  return { host: host.toLowerCase(), path };
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

function rewriteUrlValue(value: string, host: string): string {
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
        return `${PREVIEW_PROXY_PREFIX}${host}${absolute.pathname}${absolute.search}${absolute.hash}`;
    } catch {
      return value;
    }
    return value;
  }
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith(PREVIEW_PROXY_PREFIX)) return value;
    return `${PREVIEW_PROXY_PREFIX}${host}${trimmed}`;
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
      return `${PREVIEW_PROXY_PREFIX}${host}${absolute.pathname}${absolute.search}${absolute.hash}`;
  } catch {
    return value;
  }
  return value;
}

function rewriteSrcset(value: string, host: string): string {
  return value
    .split(",")
    .map((part) => {
      const match = /^(\s*)(\S+)([\s\S]*)$/u.exec(part);
      if (!match) return part;
      return `${match[1]}${rewriteUrlValue(match[2], host)}${match[3]}`;
    })
    .join(",");
}

export function rewritePreviewCss(css: string, host: string): string {
  return String(css)
    .replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/giu,
      (match, quote: string, value: string) => {
        const rewritten = rewriteUrlValue(value, host);
        return rewritten === value
          ? match
          : `url(${quote}${rewritten}${quote})`;
      },
    )
    .replace(
      /(@import\s+)(['"])([^'"]+)\2/giu,
      (match, prefix: string, quote: string, value: string) => {
        const rewritten = rewriteUrlValue(value, host);
        return rewritten === value
          ? match
          : `${prefix}${quote}${rewritten}${quote}`;
      },
    );
}

export function rewritePreviewHtml(html: string, host: string): string {
  let output = String(html).replace(/<base\b[^>]*>/giu, "");
  output = output.replace(
    /(\s(?:href|src|action|poster|formaction|data-src|data-href|xlink:href)\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteUrlValue(value, host)}${quote}`,
  );
  output = output.replace(
    /(\s(?:srcset|data-srcset)\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteSrcset(value, host)}${quote}`,
  );
  output = output.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/giu,
    (_match, open: string, css: string, close: string) =>
      `${open}${rewritePreviewCss(css, host)}${close}`,
  );
  output = output.replace(
    /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewritePreviewCss(value, host)}${quote}`,
  );
  output = output.replace(
    /(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*)(["'])([^"']*)(["'])/giu,
    (_match, prefix: string, quote: string, content: string, close: string) => {
      const rewritten = content.replace(
        /(url\s*=\s*)([^\s"';]+)/giu,
        (_value, label: string, url: string) =>
          `${label}${rewriteUrlValue(url, host)}`,
      );
      return `${prefix}${quote}${rewritten}${close}`;
    },
  );
  return output;
}

export function rewritePreviewLocation(location: string, host: string): string {
  return rewriteUrlValue(location, host);
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
  if (location) headers.set("Location", rewritePreviewLocation(location, host));

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
      ? rewritePreviewHtml(source, host)
      : rewritePreviewCss(source, host);
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
    return withAdminCookies(
      textResponse(502, "The preview could not be reached."),
      guard.setCookies,
    );
  }

  if (isAccessLoginRedirect(upstream))
    return withAdminCookies(
      textResponse(
        502,
        "The preview proxy could not authenticate with the preview host.",
      ),
      guard.setCookies,
    );

  const response = await rewritePreviewResponse(
    upstream,
    target.host,
    request.method,
  );
  return withAdminCookies(response, guard.setCookies);
}

/** Re-export for tests and callers that need the typed denial. */
export { AdminAuthError };
