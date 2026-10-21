import type { AdminPrincipal } from "../../../src/lib/admin-contracts";
import type { VerifiedSession } from "./neon-auth";
import {
  MembershipError,
  toMembershipError,
  type MembershipStore,
} from "./membership-store";

/**
 * Membership-aware account routes below the existing workspace boundary.
 * These handlers accept an already-verified `AdminPrincipal`; they never read
 * an actor, role or email from the browser. Accounts Task 6 wires them behind
 * `requireAdmin`, so they stay unexposed until that guard exists.
 */

export const ACCOUNTS_PATH_PREFIX = "/api/admin/onboarding-invites/workspace";
const MAX_BODY_BYTES = 8 * 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export type AccountsApiDependencies = {
  store: MembershipStore;
  principal: AdminPrincipal;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(error: unknown) {
  const mapped = toMembershipError(error);
  return json(
    { error: { code: mapped.code, message: mapped.message } },
    mapped.status,
  );
}

function requireSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  let requestOrigin = "";
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new MembershipError("forbidden", "Invalid request origin.");
  }
  if (!origin || origin !== requestOrigin)
    throw new MembershipError("forbidden", "Invalid request origin.");
}

async function readJsonBody(request: Request) {
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new MembershipError("invalid", "Request body is too large.");
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType && !contentType.toLowerCase().includes("application/json"))
    throw new MembershipError("invalid", "Use application/json.");
  const text = await request.text();
  if (!text || text.length > MAX_BODY_BYTES)
    throw new MembershipError("invalid", "Request body is not valid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MembershipError("invalid", "Request body is not valid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new MembershipError("invalid", "Request body is not valid.");
  return parsed as Record<string, unknown>;
}

function strictKeys(body: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key))
      throw new MembershipError(
        "invalid",
        "The request contains fields that cannot be changed here.",
      );
  }
}

function requireOwner(principal: AdminPrincipal) {
  if (principal.role !== "owner")
    throw new MembershipError(
      "forbidden",
      "Only an owner can manage workspace membership.",
    );
}

function suffixOf(request: Request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(ACCOUNTS_PATH_PREFIX))
    return "";
  return path.slice(ACCOUNTS_PATH_PREFIX.length) || "/";
}

export async function accountsApi(
  request: Request,
  deps: AccountsApiDependencies,
): Promise<Response> {
  try {
    const suffix = suffixOf(request);
    const method = request.method.toUpperCase();
    if (method !== "GET") requireSameOrigin(request);

    if (suffix === "/me" && method === "GET") {
      const member = await deps.store.get(deps.principal.id);
      if (!member || !member.active)
        throw new MembershipError("forbidden", "This membership is inactive.");
      return json({ principal: member });
    }

    if (suffix === "/me" && method === "PATCH") {
      const body = await readJsonBody(request);
      strictKeys(body, ["displayName", "avatarKey"]);
      const member = await deps.store.updateOwnProfile(deps.principal.id, {
        displayName:
          body.displayName === undefined
            ? undefined
            : (body.displayName as string),
        avatarKey:
          body.avatarKey === undefined || body.avatarKey === null
            ? (body.avatarKey as null | undefined)
            : (body.avatarKey as string),
      });
      return json({ principal: member });
    }

    if (suffix === "/team" && method === "GET") {
      const members = await deps.store.list();
      return json({ members: members.filter((member) => member.active) });
    }

    if (suffix === "/team/enrollments" && method === "POST") {
      requireOwner(deps.principal);
      const body = await readJsonBody(request);
      strictKeys(body, ["email"]);
      if (typeof body.email !== "string")
        throw new MembershipError("invalid", "Enter a valid email address.");
      const enrollment = await deps.store.createEnrollment(
        deps.principal.id,
        body.email,
      );
      return json(
        {
          enrollment: {
            id: enrollment.enrollmentId,
            url: enrollment.url,
            expiresAt: enrollment.expiresAt,
          },
        },
        201,
      );
    }

    const memberChange = /^\/team\/([^/]+)$/u.exec(suffix);
    if (memberChange && method === "PATCH") {
      requireOwner(deps.principal);
      let target = "";
      try {
        target = decodeURIComponent(memberChange[1]);
      } catch {
        throw new MembershipError("invalid", "Member is not valid.");
      }
      const body = await readJsonBody(request);
      strictKeys(body, ["role", "active"]);
      if (body.role !== undefined && body.role !== "owner" && body.role !== "admin")
        throw new MembershipError("invalid", "Choose a valid role.");
      if (body.active !== undefined && typeof body.active !== "boolean")
        throw new MembershipError("invalid", "Choose an active state.");
      const member = await deps.store.changeMember(
        deps.principal.id,
        target,
        {
          role:
            body.role === undefined
              ? undefined
              : (body.role as "owner" | "admin"),
          active:
            body.active === undefined ? undefined : (body.active as boolean),
        },
      );
      return json({ member });
    }

    return json(
      { error: { code: "not_found", message: "Route not found." } },
      404,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Invitation acceptance is the one account action available before a
 * membership exists. It requires a verified provider session and the one-use
 * token; it accepts no principal, actor, role or email from the browser.
 */
export async function acceptEnrollmentApi(
  request: Request,
  deps: { store: MembershipStore; session: VerifiedSession },
): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "POST")
      return json(
        { error: { code: "method_not_allowed", message: "Use POST." } },
        405,
      );
    requireSameOrigin(request);
    const body = await readJsonBody(request);
    strictKeys(body, ["token"]);
    if (typeof body.token !== "string")
      throw new MembershipError("invalid", "This invitation is not valid.");
    const principal = await deps.store.acceptEnrollment(
      deps.session,
      body.token,
    );
    return json({ principal });
  } catch (error) {
    return errorResponse(error);
  }
}
