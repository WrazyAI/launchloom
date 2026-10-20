import type { AdminPrincipal, ActorSnapshot } from "../../../src/lib/admin-contracts";
import type { Env } from "../index";
import {
  AdminAuthConfigError,
  AdminAuthDependencyError,
  adminAuthReadiness,
  readNeonSession,
  type AdminAuthEnv,
  type NeonSessionRead,
  type VerifiedSession,
} from "./neon-auth";
import {
  membershipStoreFromEnv,
  type MembershipStore,
} from "./membership-store";
import { legacyAccessPrincipal } from "./workspace-api";

/**
 * Central admin authorization for every shared administration boundary.
 *
 * The browser never supplies an actor, role, email or subject. In `access`
 * mode the existing Cloudflare Access audience and allowlist are the only
 * authority. In `neon` mode every protected request re-reads the upstream
 * session without the cookie cache and then re-reads the active membership
 * from the membership store. A valid Access context never rescues a rejected
 * Neon request, and there is no online fallback between modes.
 */

export type AdminAuthErrorCode =
  | "signed_out"
  | "forbidden"
  | "email_unverified"
  | "auth_not_configured"
  | "dependency_unavailable"
  | "not_enabled";

const ERROR_STATUS: Record<AdminAuthErrorCode, number> = {
  signed_out: 401,
  forbidden: 403,
  email_unverified: 403,
  auth_not_configured: 503,
  dependency_unavailable: 503,
  not_enabled: 403,
};

const ERROR_MESSAGE: Record<AdminAuthErrorCode, string> = {
  signed_out: "Sign in required.",
  forbidden: "Access denied.",
  email_unverified: "Verify your email before continuing.",
  auth_not_configured: "Admin authentication is not configured.",
  dependency_unavailable: "Admin authentication is temporarily unavailable.",
  not_enabled: "This account route is not enabled.",
};

/** Typed denial/dependency failure consumed by the admin router. */
export class AdminAuthError extends Error {
  readonly status: number;
  readonly code: AdminAuthErrorCode;
  /** Sanitized provider renewal/clearing cookies to attach to the response. */
  readonly setCookies: string[];

  constructor(
    code: AdminAuthErrorCode,
    message?: string,
    setCookies: string[] = [],
  ) {
    super(message ?? ERROR_MESSAGE[code]);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.setCookies = [...setCookies];
  }
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

/** Never expose raw provider, SQL or connection detail. */
export function toAdminAuthError(error: unknown): AdminAuthError {
  if (error instanceof AdminAuthError) return error;
  if (error instanceof AdminAuthConfigError)
    return new AdminAuthError("auth_not_configured");
  if (error instanceof AdminAuthDependencyError)
    return new AdminAuthError("dependency_unavailable");
  return new AdminAuthError("dependency_unavailable");
}

/** JSON denial/outage with a correlation trace id and no provider text. */
export function adminAuthErrorResponse(error: unknown): Response {
  const mapped = toAdminAuthError(error);
  const traceId = crypto.randomUUID();
  const response = new Response(
    JSON.stringify({
      error: { code: mapped.code, message: mapped.message, traceId },
    }),
    {
      status: mapped.status,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
  return withAdminCookies(response, mapped.setCookies);
}

/** Append sanitized provider cookies to any browser-facing response. */
export function withAdminCookies(
  response: Response,
  setCookies: string[],
): Response {
  if (setCookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Existing Access audience and allowlist verification for the legacy path. */
export async function accessAdminEmail(
  ctx: ExecutionContext,
  env: Env,
): Promise<string> {
  if (!ctx.access || !env.ONBOARDING_ACCESS_AUD || !env.ONBOARDING_ADMIN_EMAILS)
    return "";
  if (ctx.access.aud !== env.ONBOARDING_ACCESS_AUD) return "";
  const identity = await ctx.access.getIdentity();
  const email = String(identity?.email || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 240)
    .toLowerCase();
  const permitted = env.ONBOARDING_ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email && permitted.includes(email) ? email : "";
}

export type AdminGuardOptions = {
  /** Injectable for focused tests; production uses `readNeonSession`. */
  readSession?: (
    request: Request,
    env: AdminAuthEnv,
  ) => Promise<NeonSessionRead>;
  /** Injectable for focused tests; production derives it from the binding. */
  store?: MembershipStore;
};

export type AdminGuardContext = {
  principal: AdminPrincipal;
  /** Provider cookies the caller must attach to the browser response. */
  setCookies: string[];
  /** Null in access mode; a membership store in neon mode. */
  store: MembershipStore | null;
  /** Null in access mode; the verified provider session in neon mode. */
  session: VerifiedSession | null;
};

export type VerifiedSessionContext = {
  session: VerifiedSession;
  setCookies: string[];
  store: MembershipStore;
};

function resolveStore(
  env: Env,
  options: AdminGuardOptions,
): MembershipStore {
  if (options.store) return options.store;
  try {
    return membershipStoreFromEnv(env);
  } catch {
    throw new AdminAuthError("dependency_unavailable");
  }
}

/** Preserve provider renewal/clearing cookies even when storage is unavailable. */
function resolveStoreWithCookies(
  env: Env,
  options: AdminGuardOptions,
  setCookies: string[],
): MembershipStore {
  try {
    return resolveStore(env, options);
  } catch (error) {
    const mapped = toAdminAuthError(error);
    throw new AdminAuthError(mapped.code, mapped.message, setCookies);
  }
}

async function readVerifiedSession(
  request: Request,
  env: Env,
  options: AdminGuardOptions,
): Promise<NeonSessionRead> {
  const reader = options.readSession ?? readNeonSession;
  try {
    return await reader(request, env as AdminAuthEnv);
  } catch (error) {
    throw toAdminAuthError(error);
  }
}

/**
 * Resolve the server principal and provider cookies for one request. Neon
 * mode performs an uncached session read plus an active membership read on
 * every call; nothing is cached across requests.
 */
export async function requireAdminContext(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options: AdminGuardOptions = {},
): Promise<AdminGuardContext> {
  if (env.ADMIN_AUTH_MODE !== "neon") {
    // Legacy Access denies an unauthenticated caller as 403 (Access itself
    // terminates the sign-in flow before the Worker in a real deployment).
    if (!ctx.access) throw new AdminAuthError("forbidden");
    let email = "";
    try {
      email = await accessAdminEmail(ctx, env);
    } catch {
      throw new AdminAuthError("dependency_unavailable");
    }
    if (!email) throw new AdminAuthError("forbidden");
    return {
      principal: await legacyAccessPrincipal(email),
      setCookies: [],
      store: null,
      session: null,
    };
  }

  if (adminAuthReadiness(env).length > 0)
    throw new AdminAuthError("auth_not_configured");
  const read = await readVerifiedSession(request, env, options);
  if (!read.session) throw new AdminAuthError("signed_out", undefined, read.setCookies);
  if (read.session.emailVerified !== true)
    throw new AdminAuthError("email_unverified", undefined, read.setCookies);

  const store = resolveStoreWithCookies(env, options, read.setCookies);
  let principal: AdminPrincipal | null;
  try {
    principal = await store.findActive(read.session.subject);
  } catch {
    throw new AdminAuthError("dependency_unavailable", undefined, read.setCookies);
  }
  if (!principal)
    throw new AdminAuthError("forbidden", undefined, read.setCookies);
  if (
    principal.email.trim().toLowerCase() !==
    read.session.email.trim().toLowerCase()
  )
    throw new AdminAuthError("forbidden", undefined, read.setCookies);

  return {
    principal,
    setCookies: read.setCookies,
    store,
    session: read.session,
  };
}

/** Contract entry point: resolve an active admin principal or throw. */
export async function requireAdmin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options: AdminGuardOptions = {},
): Promise<AdminPrincipal> {
  return (await requireAdminContext(request, env, ctx, options)).principal;
}

/**
 * Session-only verification for the one pre-membership action (enrollment
 * acceptance). It still requires a verified email and the configured store.
 */
export async function requireVerifiedSession(
  request: Request,
  env: Env,
  options: AdminGuardOptions = {},
): Promise<VerifiedSessionContext> {
  if (env.ADMIN_AUTH_MODE !== "neon")
    throw new AdminAuthError("not_enabled");
  if (adminAuthReadiness(env).length > 0)
    throw new AdminAuthError("auth_not_configured");
  const read = await readVerifiedSession(request, env, options);
  if (!read.session) throw new AdminAuthError("signed_out", undefined, read.setCookies);
  if (read.session.emailVerified !== true)
    throw new AdminAuthError("email_unverified", undefined, read.setCookies);
  return {
    session: read.session,
    setCookies: read.setCookies,
    store: resolveStoreWithCookies(env, options, read.setCookies),
  };
}

/** Owner/admin enforcement for member administration. */
export function requireMemberRole(
  principal: AdminPrincipal,
  allowed: readonly ("owner" | "admin")[],
): AdminPrincipal {
  if (!allowed.includes(principal.role))
    throw new AdminAuthError("forbidden");
  return principal;
}

/** Immutable event-time provenance copy; body-supplied actor fields are never used. */
export function actorFromPrincipal(principal: AdminPrincipal): ActorSnapshot {
  return {
    kind: "admin",
    id: principal.id,
    name: principal.displayName,
    email: principal.email,
    source: principal.authSource,
  };
}
