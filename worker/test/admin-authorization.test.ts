import { env } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import {
  AdminAuthError,
  actorFromPrincipal,
  guardedAdminRoute,
  requireAdmin,
  requireAdminContext,
  requireVerifiedSession,
  withAdminCookies,
} from "../src/admin/auth";
import { proxyAdminAuth } from "../src/admin/neon-auth";
import {
  accountsApi,
  acceptEnrollmentApi,
} from "../src/admin/accounts-api";
import {
  MembershipError,
  type AdminMember,
  type CreatedEnrollment,
  type MembershipStore,
} from "../src/admin/membership-store";
import type { AdminPrincipal } from "../../src/lib/admin-contracts";
import type { VerifiedSession } from "../src/admin/neon-auth";
import { network } from "./network";

const bindings = env as unknown as Env;
const apiOrigin = "https://api.example.test";
const accessOrigin = "https://api.launchloom.test";
const workspace = `${apiOrigin}/api/admin/onboarding-invites/workspace`;
const cookieSecret = "synthetic-neon-cookie-secret-at-least-32-chars";
const sessionCookieName = "__Secure-neon-auth.session_token";
const session = (overrides: Partial<VerifiedSession> = {}): VerifiedSession => ({
  subject: "neon-owner",
  email: "owner@example.test",
  emailVerified: true,
  displayName: "Neon Owner",
  expiresAt: Date.now() + 3_600_000,
  ...overrides,
});

const neonEnv = (overrides: Partial<Env> = {}) =>
  ({
    ...bindings,
    ADMIN_AUTH_MODE: "neon",
    NEON_AUTH_BASE_URL: "https://auth.example.test",
    NEON_AUTH_COOKIE_SECRET: cookieSecret,
    ADMIN_PUBLIC_ORIGIN: apiOrigin,
    ...overrides,
  }) as Env;

const accessEnv = (overrides: Partial<Env> = {}) => ({ ...bindings, ...overrides });

function accessContext(
  email = "admin@example.test",
  aud = "launchloom-local-onboarding-admin",
) {
  return {
    access: {
      aud,
      getIdentity: async () => ({ email }),
    },
  } as unknown as ExecutionContext;
}

function request(path = "/api/admin/onboarding-invites/workspace/me", init: RequestInit = {}) {
  return new Request(`${apiOrigin}${path}`, init);
}

function member(overrides: Partial<AdminMember> = {}): AdminMember {
  const displayName = overrides.displayName ?? "Neon Owner";
  return {
    id: "neon-owner",
    email: "owner@example.test",
    displayName,
    role: "owner",
    authSource: "neon",
    active: true,
    createdAt: 1,
    updatedAt: 2,
    initials: "NO",
    avatarKey: null,
    ...overrides,
  };
}

type CallCounts = { findActive: number; session: number; get: number; list: number };

function fakeStore(
  initial: AdminMember[] = [member()],
  options: { failFindActive?: unknown; failGet?: unknown } = {},
) {
  let members = initial.map((item) => ({ ...item }));
  const usedTokens = new Set<string>();
  const calls: CallCounts = { findActive: 0, session: 0, get: 0, list: 0 };
  const store: MembershipStore = {
    async findActive(subject) {
      calls.findActive += 1;
      if (options.failFindActive) throw options.failFindActive;
      const found = members.find((item) => item.id === subject && item.active);
      return found
        ? {
            id: found.id,
            email: found.email,
            displayName: found.displayName,
            role: found.role,
            authSource: "neon",
          }
        : null;
    },
    async get(subject) {
      calls.get += 1;
      if (options.failGet) throw options.failGet;
      return members.find((item) => item.id === subject) ?? null;
    },
    async list() {
      calls.list += 1;
      return members.map((item) => ({ ...item }));
    },
    async createEnrollment(ownerId, email): Promise<CreatedEnrollment> {
      if (!members.some((item) => item.id === ownerId && item.active && item.role === "owner"))
        throw new MembershipError("forbidden", "Only an owner can manage workspace membership.");
      return {
        enrollmentId: "enrollment-1",
        url: `/admin/login?enrollment=${"t".repeat(43)}`,
        expiresAt: Date.now() + 60_000,
      };
    },
    async acceptEnrollment(verified, token) {
      if (!verified.emailVerified)
        throw new MembershipError("forbidden", "Verify your email before accepting the invitation.");
      if (token !== "t".repeat(43))
        throw new MembershipError("invalid", "This invitation is not valid.");
      if (usedTokens.has(token))
        throw new MembershipError("enrollment_used", "This invitation has already been used.");
      usedTokens.add(token);
      const accepted = member({
        id: verified.subject,
        email: verified.email,
        displayName: verified.displayName,
        role: "admin",
      });
      members = [...members.filter((item) => item.id !== accepted.id), accepted];
      return {
        id: accepted.id,
        email: accepted.email,
        displayName: accepted.displayName,
        role: accepted.role,
        authSource: "neon",
      };
    },
    async updateOwnProfile(subject, input) {
      const found = members.find((item) => item.id === subject);
      if (!found) throw new MembershipError("not_found", "Member not found.");
      if (!input.displayName && !input.avatarKey)
        throw new MembershipError("invalid", "Choose a profile change.");
      found.displayName = input.displayName ?? found.displayName;
      found.avatarKey = input.avatarKey ?? found.avatarKey;
      return { ...found };
    },
    async changeMember(ownerId, targetId, input) {
      const actor = members.find((item) => item.id === ownerId && item.active);
      if (!actor || actor.role !== "owner")
        throw new MembershipError("forbidden", "Only an owner can manage workspace membership.");
      const target = members.find((item) => item.id === targetId);
      if (!target) throw new MembershipError("not_found", "Member not found.");
      if (input.role !== undefined) target.role = input.role;
      if (input.active !== undefined) target.active = input.active;
      return { ...target };
    },
  };
  return { store, calls, members: () => members, setMembers: (next: AdminMember[]) => (members = next) };
}

function sessionReader(verified: VerifiedSession | null, setCookies: string[] = []) {
  return vi.fn(async () => ({ session: verified, setCookies }));
}

async function denial(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as AdminAuthError;
  }
  throw new Error("expected rejection");
}

describe("central admin authorization matrix", () => {
  it("preserves verified Access audience and allowlist behavior", async () => {
    const allowed = await requireAdmin(request(), accessEnv(), accessContext());
    expect(allowed).toMatchObject({
      role: "admin",
      authSource: "cloudflare-access",
      email: "admin@example.test",
    });
    expect(allowed.id).toMatch(/^access:[a-f0-9]{64}$/u);

    expect(
      await denial(requireAdmin(request(), accessEnv(), {} as ExecutionContext)),
    ).toMatchObject({ status: 403, code: "forbidden" });

    expect(
      await denial(
        requireAdmin(
          request(),
          accessEnv(),
          accessContext("admin@example.test", "wrong-audience"),
        ),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });

    expect(
      await denial(
        requireAdmin(request(), accessEnv(), accessContext("other@example.test")),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });

    const failingIdentity = {
      access: {
        aud: "launchloom-local-onboarding-admin",
        getIdentity: async () => {
          throw new Error("private upstream credential");
        },
      },
    } as unknown as ExecutionContext;
    const outage = await denial(requireAdmin(request(), accessEnv(), failingIdentity));
    expect(outage).toMatchObject({ status: 503, code: "dependency_unavailable" });
    expect(String(outage.message)).not.toContain("private upstream credential");
  });

  it("never accepts forged Access headers without a verified context", async () => {
    const forged = request("/api/admin/onboarding-invites/workspace/me", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "admin@example.test",
        "X-Forwarded-Email": "admin@example.test",
        "X-Auth-Request-Email": "admin@example.test",
      },
    });
    expect(
      await denial(requireAdmin(forged, accessEnv(), {} as ExecutionContext)),
    ).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("requires an uncached verified Neon session and active membership every request", async () => {
    const { store, calls } = fakeStore();
    const readSession = sessionReader(session(), ["renewed=1"]);
    const guard = await requireAdminContext(request(), neonEnv(), accessContext(), {
      store,
      readSession,
    });
    expect(guard.principal).toMatchObject({
      id: "neon-owner",
      role: "owner",
      authSource: "neon",
    });
    expect(guard.setCookies).toEqual(["renewed=1"]);
    expect(calls.findActive).toBe(1);
    expect(readSession).toHaveBeenCalledTimes(1);

    await requireAdmin(request(), neonEnv(), accessContext(), { store, readSession });
    expect(calls.findActive).toBe(2);
    expect(readSession).toHaveBeenCalledTimes(2);
  });

  it("returns typed signed-out, unverified, nonmember and inactive denials", async () => {
    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore().store,
          readSession: sessionReader(null),
        }),
      ),
    ).toMatchObject({ status: 401, code: "signed_out" });

    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore().store,
          readSession: sessionReader(session({ emailVerified: false })),
        }),
      ),
    ).toMatchObject({ status: 403, code: "email_unverified" });

    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore([]).store,
          readSession: sessionReader(session()),
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });

    const { store } = fakeStore([member({ active: false })]);
    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store,
          readSession: sessionReader(session()),
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("denies a deactivated member on the next request with no role cache", async () => {
    const { store, setMembers } = fakeStore();
    const readSession = sessionReader(session());
    await expect(
      requireAdmin(request(), neonEnv(), accessContext(), { store, readSession }),
    ).resolves.toMatchObject({ role: "owner" });

    setMembers([member({ active: false })]);
    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), { store, readSession }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });
    expect(readSession).toHaveBeenCalledTimes(2);
  });

  it("does not let a valid Access context rescue rejected Neon auth", async () => {
    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore().store,
          readSession: sessionReader(null),
        }),
      ),
    ).toMatchObject({ status: 401, code: "signed_out" });

    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore([]).store,
          readSession: sessionReader(session()),
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("maps provider and membership store outages to safe 503s", async () => {
    const providerOutage = await denial(
      requireAdmin(request(), neonEnv(), accessContext(), {
        store: fakeStore().store,
        readSession: async () => {
          throw new Error("provider private detail");
        },
      }),
    );
    expect(providerOutage).toMatchObject({
      status: 503,
      code: "dependency_unavailable",
    });
    expect(String(providerOutage.message)).not.toContain("provider private detail");

    const databaseOutage = await denial(
      requireAdmin(request(), neonEnv(), accessContext(), {
        store: fakeStore([], { failFindActive: new Error("connection refused secret") }).store,
        readSession: sessionReader(session(), ["clear=1"]),
      }),
    );
    expect(databaseOutage).toMatchObject({
      status: 503,
      code: "dependency_unavailable",
    });
    expect(databaseOutage.setCookies).toEqual(["clear=1"]);
    expect(String(databaseOutage.message)).not.toContain("connection refused");

    expect(
      await denial(
        requireAdmin(request(), neonEnv({ ADMIN_DATABASE_URL: "" }), accessContext(), {
          readSession: sessionReader(session(), ["clear=2"]),
        }),
      ),
    ).toMatchObject({ status: 503, code: "dependency_unavailable" });
  });

  it("rejects a membership whose stored email differs from the verified session email", async () => {
    expect(
      await denial(
        requireAdmin(request(), neonEnv(), accessContext(), {
          store: fakeStore([member({ email: "other@example.test" })]).store,
          readSession: sessionReader(session({ email: "owner@example.test" })),
        }),
      ),
    ).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("fails readiness before any route can fall back", async () => {
    expect(
      await denial(
        requireAdmin(request(), neonEnv({ NEON_AUTH_COOKIE_SECRET: "short" }), accessContext(), {
          store: fakeStore().store,
          readSession: sessionReader(session()),
        }),
      ),
    ).toMatchObject({ status: 503, code: "auth_not_configured" });
  });

  it("requires a verified session for enrollment acceptance without membership", async () => {
    const { store } = fakeStore();
    const readSession = sessionReader(session({ subject: "invitee" }), [
      "renewed=2",
    ]);
    const accepted = await requireVerifiedSession(request(), neonEnv(), {
      store,
      readSession,
    });
    expect(accepted.session.subject).toBe("invitee");
    expect(accepted.setCookies).toEqual(["renewed=2"]);

    expect(
      await denial(
        requireVerifiedSession(request(), neonEnv(), {
          store,
          readSession: sessionReader(null),
        }),
      ),
    ).toMatchObject({ status: 401, code: "signed_out" });

    expect(
      await denial(
        requireVerifiedSession(request(), neonEnv(), {
          store,
          readSession: sessionReader(session({ emailVerified: false })),
        }),
      ),
    ).toMatchObject({ status: 403, code: "email_unverified" });

    expect(
      await denial(
        requireVerifiedSession(request(), accessEnv(), {
          store,
          readSession: sessionReader(session()),
        }),
      ),
    ).toMatchObject({ status: 403, code: "not_enabled" });
  });

  it("propagates provider set-cookies onto the browser response", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const propagated = withAdminCookies(response, ["a=1; Secure", "b=2; Secure"]);
    expect(propagated.status).toBe(200);
    expect(propagated.headers.getSetCookie()).toEqual([
      "a=1; Secure",
      "b=2; Secure",
    ]);
    expect(propagated.headers.get("Cache-Control")).toBe("no-store");
    expect(await propagated.json()).toEqual({ ok: true });
    expect(withAdminCookies(response, [])).toBe(response);
  });

  it("propagates provider cookies on successful legacy admin responses", async () => {
    const { store } = fakeStore();
    const readSession = sessionReader(session(), ["renewed=1", "cleared=2"]);
    const successResponses: Array<{
      name: string;
      handler: () => Promise<Response>;
      check: (response: Response) => Promise<void>;
    }> = [
      {
        name: "invite list",
        handler: async () =>
          new Response(JSON.stringify({ invites: [] }), { status: 200 }),
        check: async (response) => {
          expect(response.status).toBe(200);
          await expect(response.json()).resolves.toEqual({ invites: [] });
        },
      },
      {
        name: "generation list",
        handler: async () =>
          new Response(JSON.stringify({ generations: [] }), { status: 200 }),
        check: async (response) => {
          expect(response.status).toBe(200);
          await expect(response.json()).resolves.toEqual({ generations: [] });
        },
      },
      {
        name: "private hero",
        handler: async () =>
          new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
        check: async (response) => {
          expect(response.status).toBe(200);
          expect(response.headers.get("Content-Type")).toBe("image/png");
          expect((await response.arrayBuffer()).byteLength).toBe(4);
        },
      },
    ];

    for (const { name, handler, check } of successResponses) {
      const response = await guardedAdminRoute(
        request(),
        neonEnv(),
        accessContext(),
        handler,
        { store, readSession },
      );
      expect(response.headers.getSetCookie(), name).toEqual([
        "renewed=1",
        "cleared=2",
      ]);
      await check(response);
    }
  });

  it("fails closed for an unknown admin auth mode", async () => {
    const unknown = {
      ...accessEnv(),
      ADMIN_AUTH_MODE: "typo" as never,
    };
    const denied = await denial(requireAdmin(request(), unknown, accessContext()));
    expect(denied).toMatchObject({
      status: 503,
      code: "auth_not_configured",
    });
    expect(
      await denial(requireVerifiedSession(request(), unknown)),
    ).toMatchObject({ status: 503, code: "auth_not_configured" });

    const proxy = await proxyAdminAuth(
      request("/api/admin/onboarding-invites/auth/get-session"),
      unknown,
    );
    expect(proxy.status).toBe(503);
  });

  it("creates an event-time actor snapshot from the server principal only", () => {
    const principal: AdminPrincipal = {
      id: "neon-owner",
      email: "owner@example.test",
      displayName: "Neon Owner",
      role: "owner",
      authSource: "neon",
    };
    const snapshot = actorFromPrincipal(principal);
    expect(snapshot).toEqual({
      kind: "admin",
      id: "neon-owner",
      name: "Neon Owner",
      email: "owner@example.test",
      source: "neon",
    });
    principal.displayName = "Changed Later";
    expect(snapshot.name).toBe("Neon Owner");
  });
});

describe("accounts handlers behind the central guard", () => {
  const principal = (role: "owner" | "admin" = "owner"): AdminPrincipal => ({
    id: "neon-owner",
    email: "owner@example.test",
    displayName: "Neon Owner",
    role,
    authSource: "neon",
  });

  it("returns the membership principal for /me and never accepts browser identity", async () => {
    const { store } = fakeStore();
    const ok = await accountsApi(request(), { store, principal: principal() });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({
      principal: { id: "neon-owner", role: "owner", active: true },
    });

    const injected = await accountsApi(
      request(undefined, {
        method: "PATCH",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Renamed",
          role: "owner",
          email: "attacker@example.test",
          active: true,
        }),
      }),
      { store, principal: principal("admin") },
    );
    expect(injected.status).toBe(400);
  });

  it("shows active team members to admins and owners", async () => {
    const { store } = fakeStore([
      member(),
      member({ id: "neon-admin", email: "admin@example.test", role: "admin" }),
      member({ id: "neon-inactive", email: "inactive@example.test", active: false }),
    ]);
    for (const role of ["admin", "owner"] as const) {
      const response = await accountsApi(
        request("/api/admin/onboarding-invites/workspace/team"),
        { store, principal: principal(role) },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { members: AdminMember[] };
      expect(body.members.map((item) => item.id).sort()).toEqual([
        "neon-admin",
        "neon-owner",
      ]);
    }
  });

  it("allows only owners to create invitations and change members", async () => {
    const create = (role: "owner" | "admin") =>
      accountsApi(
        request("/api/admin/onboarding-invites/workspace/team/enrollments", {
          method: "POST",
          headers: { Origin: apiOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invitee@example.test" }),
        }),
        { store: fakeStore().store, principal: principal(role) },
      );
    expect((await create("admin")).status).toBe(403);
    const created = await create("owner");
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      enrollment: {
        id: "enrollment-1",
        url: `/admin/login?enrollment=${"t".repeat(43)}`,
      },
    });

    const change = (role: "owner" | "admin") =>
      accountsApi(
        request("/api/admin/onboarding-invites/workspace/team/neon-admin", {
          method: "PATCH",
          headers: { Origin: apiOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
        }),
        {
          store: fakeStore([
            member(),
            member({ id: "neon-admin", email: "admin@example.test", role: "admin" }),
          ]).store,
          principal: principal(role),
        },
      );
    expect((await change("admin")).status).toBe(403);
    expect((await change("owner")).status).toBe(200);
  });

  it("accepts a one-use enrollment only with a verified session and same origin", async () => {
    const { store } = fakeStore();
    const cross = await acceptEnrollmentApi(
      request("/api/admin/onboarding-invites/workspace/enrollments/accept", {
        method: "POST",
        headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43) }),
      }),
      { store, session: session({ subject: "invitee", email: "invitee@example.test" }) },
    );
    expect(cross.status).toBe(403);

    const unverified = await acceptEnrollmentApi(
      request("/api/admin/onboarding-invites/workspace/enrollments/accept", {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43) }),
      }),
      { store, session: session({ emailVerified: false }) },
    );
    expect(unverified.status).toBe(403);

    const accepted = await acceptEnrollmentApi(
      request("/api/admin/onboarding-invites/workspace/enrollments/accept", {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43), role: "owner" }),
      }),
      { store, session: session({ subject: "invitee", email: "invitee@example.test" }) },
    );
    expect(accepted.status).toBe(400);

    const valid = await acceptEnrollmentApi(
      request("/api/admin/onboarding-invites/workspace/enrollments/accept", {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43) }),
      }),
      { store, session: session({ subject: "invitee", email: "invitee@example.test" }) },
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({
      principal: { id: "invitee", email: "invitee@example.test", role: "admin" },
    });

    const reused = await acceptEnrollmentApi(
      request("/api/admin/onboarding-invites/workspace/enrollments/accept", {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t".repeat(43) }),
      }),
      { store, session: session({ subject: "invitee", email: "invitee@example.test" }) },
    );
    expect(reused.status).toBe(409);
    await expect(reused.json()).resolves.toMatchObject({
      error: { code: "enrollment_used" },
    });
  });
});

describe("existing admin routes keep access-mode behavior and never fall back in neon mode", () => {
  it("keeps the Access /me shape and denies membership management", async () => {
    const me = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/onboarding-invites/workspace/me`),
      accessEnv(),
      accessContext(),
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      principal: {
        email: "admin@example.test",
        displayName: null,
        role: "admin",
        authSource: "cloudflare-access",
      },
    });

    const team = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/onboarding-invites/workspace/team`),
      accessEnv(),
      accessContext(),
    );
    expect(team.status).toBe(403);

    const accept = await worker.fetch(
      new Request(
        `${accessOrigin}/api/admin/onboarding-invites/workspace/enrollments/accept`,
        {
          method: "POST",
          headers: { Origin: accessOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ token: "t".repeat(43) }),
        },
      ),
      accessEnv(),
      accessContext(),
    );
    expect(accept.status).toBe(403);
  });

  it("keeps generation and invite admin routes Access-protected", async () => {
    const allowed = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/generations`),
      accessEnv(),
      accessContext(),
    );
    expect(allowed.status).toBe(200);
    const denied = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/generations`),
      accessEnv(),
      accessContext("other@example.test"),
    );
    expect(denied.status).toBe(403);
    const anonymous = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/generations`),
      accessEnv(),
      {} as ExecutionContext,
    );
    expect(anonymous.status).toBe(403);

    const hero = await worker.fetch(
      new Request(`${accessOrigin}/api/admin/generation-hero?id=issue:123`),
      accessEnv(),
      accessContext(),
    );
    expect(hero.status).toBe(404);
  });

  it("returns a signed-out 401 in neon mode with no Access fallback", async () => {
    const response = await worker.fetch(
      new Request(`${workspace}/me`),
      neonEnv(),
      accessContext(),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "signed_out", traceId: expect.any(String) },
    });

    for (const path of [
      "/api/admin/generations",
      "/api/admin/generation-hero?id=issue:123",
      "/api/admin/onboarding-invites/generations",
      "/api/admin/onboarding-invites",
    ]) {
      const denied = await worker.fetch(
        new Request(`${apiOrigin}${path}`),
        neonEnv(),
        accessContext(),
      );
      expect(denied.status).toBe(401);
    }
  });

  it("restricts the login shell to GET/HEAD and fails closed on unknown modes", async () => {
    const posted = await worker.fetch(
      new Request(`${apiOrigin}/admin/login`, { method: "POST" }),
      neonEnv(),
      accessContext(),
    );
    expect(posted.status).toBe(405);
    expect(posted.headers.get("Allow")).toBe("GET, HEAD");

    const unknown = { ...neonEnv(), ADMIN_AUTH_MODE: "typo" as never };
    const login = await worker.fetch(
      new Request(`${apiOrigin}/admin/login`),
      unknown,
      accessContext(),
    );
    expect(login.status).toBe(503);
    for (const path of [
      `${workspace}/me`,
      `${workspace}/team`,
      `${apiOrigin}/api/admin/generations`,
      `${apiOrigin}/api/admin/onboarding-invites`,
    ]) {
      const response = await worker.fetch(
        new Request(path),
        unknown,
        accessContext(),
      );
      expect(response.status).toBe(503);
    }
  });

  it("rate limits enrollment acceptance before touching the provider or database", async () => {
    const address = `198.51.100.${(crypto.getRandomValues(new Uint8Array(1))[0] % 200) + 1}`;
    const accept = () =>
      worker.fetch(
        new Request(`${workspace}/enrollments/accept`, {
          method: "POST",
          headers: {
            Origin: apiOrigin,
            "Content-Type": "application/json",
            "CF-Connecting-IP": address,
          },
          body: JSON.stringify({ token: "t".repeat(43) }),
        }),
        neonEnv(),
        accessContext(),
      );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await accept();
      expect(response.status).toBe(401);
    }
    const limited = await accept();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "rate_limited" },
    });
  });

  it("returns a safe 503 when the membership store is unavailable in neon mode", async () => {    const authOrigin = `https://auth-${crypto.randomUUID()}.example.test`;
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json({
          session: {
            id: "s1",
            userId: "neon-owner",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          user: {
            id: "neon-owner",
            email: "owner@example.test",
            emailVerified: true,
            name: "Neon Owner",
          },
        }),
      ),
    );
    const response = await worker.fetch(
      new Request(`${workspace}/me`, {
        headers: { Cookie: `${sessionCookieName}=opaque-session` },
      }),
      neonEnv({
        NEON_AUTH_BASE_URL: authOrigin,
        ADMIN_PUBLIC_ORIGIN: apiOrigin,
        ADMIN_DATABASE_URL: undefined,
      }),
      accessContext(),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "dependency_unavailable", traceId: expect.any(String) },
    });
  }, 20_000);
});
