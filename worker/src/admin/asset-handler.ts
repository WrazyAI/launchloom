import type { Env } from "../index";

type AssetRule = {
  pattern: RegExp;
  contentType: string;
  immutable: boolean;
};

const RULES: AssetRule[] = [
  {
    pattern: /^\/admin-assets\/app\.js$/u,
    contentType: "text/javascript; charset=utf-8",
    immutable: false,
  },
  {
    pattern: /^\/admin-assets\/app\.css$/u,
    contentType: "text/css; charset=utf-8",
    immutable: false,
  },
  {
    pattern: /^\/admin-assets\/chunks\/[a-z0-9][a-z0-9._-]{0,120}\.js$/iu,
    contentType: "text/javascript; charset=utf-8",
    immutable: true,
  },
  {
    pattern: /^\/admin-assets\/fonts\/[a-z0-9][a-z0-9._-]{0,120}\.woff2$/iu,
    contentType: "font/woff2",
    immutable: true,
  },
  {
    pattern:
      /^\/admin-assets\/fonts\/LICENSE-[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.txt$/u,
    contentType: "text/plain; charset=utf-8",
    immutable: false,
  },
];

function headerValue(value: string | null) {
  return (value || "").split(";")[0].trim().toLowerCase();
}

function normalizedEtag(value: string) {
  return value.trim().replace(/^W\//u, "");
}

function matchesEtag(header: string | null, etag: string) {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const target = normalizedEtag(etag);
  return header
    .split(",")
    .map((candidate) => normalizedEtag(candidate))
    .includes(target);
}

function matchesLastModified(header: string | null, lastModified: string) {
  if (!header) return false;
  const requested = Date.parse(header);
  const modified = Date.parse(lastModified);
  return Number.isFinite(requested) &&
    Number.isFinite(modified) &&
    modified <= requested;
}

function assetHeaders(rule: AssetRule, upstream: Response) {
  const headers = new Headers({
    "Cache-Control": rule.immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
    "Content-Type": rule.contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (!rule.immutable) {
    const etag = upstream.headers.get("ETag");
    const lastModified = upstream.headers.get("Last-Modified");
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);
  }
  return headers;
}

function notModified(rule: AssetRule, upstream: Response) {
  return new Response(null, {
    status: 304,
    headers: assetHeaders(rule, upstream),
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function unavailable() {
  return new Response("Asset unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Serve only the reviewed, data-free admin asset allowlist. HTML, source maps,
 * index files, private fixtures and arbitrary static paths never pass through.
 */
export async function serveAdminAsset(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

  const rule = RULES.find((candidate) => candidate.pattern.test(url.pathname));
  if (!rule) return notFound();

  const binding = env.ADMIN_STATIC;
  if (!binding || typeof binding.fetch !== "function") return notFound();

  let upstream: Response;
  try {
    const forwarding = new Headers({ Accept: rule.contentType });
    for (const name of ["If-None-Match", "If-Modified-Since"]) {
      const value = request.headers.get(name);
      if (value) forwarding.set(name, value);
    }
    upstream = await binding.fetch(
      new Request(url.toString(), {
        method: request.method,
        headers: forwarding,
      }),
    );
  } catch {
    return unavailable();
  }

  if (upstream.status === 404) return notFound();
  if (upstream.status === 304) return notModified(rule, upstream);
  if (upstream.status !== 200) return unavailable();
  const contentType = headerValue(upstream.headers.get("Content-Type"));
  const expected = headerValue(rule.contentType);
  if (contentType !== expected) return notFound();

  if (!rule.immutable) {
    const etag = upstream.headers.get("ETag");
    const lastModified = upstream.headers.get("Last-Modified");
    if (
      (etag &&
        matchesEtag(request.headers.get("If-None-Match"), etag)) ||
      (lastModified &&
        matchesLastModified(
          request.headers.get("If-Modified-Since"),
          lastModified,
        ))
    )
      return notModified(rule, upstream);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers: assetHeaders(rule, upstream),
  });
}
