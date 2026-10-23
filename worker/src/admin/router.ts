import type { Env } from "../index";
import { renderAdminDashboardHtml } from "../admin-dashboard";
import { renderAdminLoginShell } from "./neon-auth";
import { serveAdminAsset } from "./asset-handler";
import {
  accessAdminEmail,
  requireAdminContext,
  resolveAdminAuthMode,
  toAdminAuthError,
  withAdminCookies,
} from "./auth";
import { handlePreviewProxy } from "../preview-proxy";

const WORKSPACE_PATH = "/admin/onboarding-invites";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function shellHeaders() {
  return {
    ...NO_STORE_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  };
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function authMisconfigured() {
  return new Response("Admin authentication is misconfigured.", {
    status: 503,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function denied(request: Request, env: Env) {
  if (env.ADMIN_AUTH_MODE === "neon") {
    const url = new URL(request.url);
    const returnTo = `${WORKSPACE_PATH}${url.search}`;
    return new Response(null, {
      status: 303,
      headers: {
        ...NO_STORE_HEADERS,
        Location: `/admin/login?returnTo=${encodeURIComponent(returnTo)}`,
      },
    });
  }
  return new Response("Access denied.", {
    status: 403,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * The same-origin admin boundary. Assets are public and data-free; the
 * workspace HTML is guarded by Cloudflare Access in `access` mode and by the
 * central Neon session + active-membership guard in `neon` mode. Unknown
 * /admin paths return 404 rather than an HTML or SPA fallback.
 */
export async function routeAdminRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/admin-assets" || path.startsWith("/admin-assets/"))
    return serveAdminAsset(request, env);

  if (path === "/admin/preview" || path.startsWith("/admin/preview/"))
    return handlePreviewProxy(request, env, ctx);

  if (path === "/admin/login") {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...NO_STORE_HEADERS, Allow: "GET, HEAD" },
      });
    let mode: "access" | "neon";
    try {
      mode = resolveAdminAuthMode(env);
    } catch {
      return authMisconfigured();
    }
    if (mode !== "neon") return notFound();
    return renderAdminLoginShell();
  }

  let mode: "access" | "neon";
  try {
    mode = resolveAdminAuthMode(env);
  } catch {
    if (path === WORKSPACE_PATH) return authMisconfigured();
    if (path === "/admin" || path.startsWith("/admin/")) return notFound();
    return null;
  }

  if (path === WORKSPACE_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...NO_STORE_HEADERS, Allow: "GET, HEAD" },
      });

    if (mode === "neon") {
      try {
        const guard = await requireAdminContext(request, env, ctx);
        return withAdminCookies(
          new Response(
            request.method === "HEAD" ? null : renderAdminDashboardHtml(),
            { status: 200, headers: shellHeaders() },
          ),
          guard.setCookies,
        );
      } catch (error) {
        const denial = toAdminAuthError(error);
        if (denial.status === 401)
          return withAdminCookies(denied(request, env), denial.setCookies);
        return withAdminCookies(
          new Response(
            denial.status === 503
              ? "Workspace authorization is temporarily unavailable."
              : "Access denied.",
            {
              status: denial.status,
              headers: {
                ...NO_STORE_HEADERS,
                "Content-Type": "text/plain; charset=utf-8",
              },
            },
          ),
          denial.setCookies,
        );
      }
    }

    let email = "";
    try {
      email = await accessAdminEmail(ctx, env);
    } catch {
      return new Response(
        "Workspace authorization is temporarily unavailable.",
        {
          status: 503,
          headers: {
            ...NO_STORE_HEADERS,
            "Content-Type": "text/plain; charset=utf-8",
          },
        },
      );
    }
    if (!email) return denied(request, env);
    return new Response(
      request.method === "HEAD" ? null : renderAdminDashboardHtml(),
      { status: 200, headers: shellHeaders() },
    );
  }

  if (path === "/admin" || path.startsWith("/admin/")) return notFound();
  return null;
}
