import { describe, expect, it, vi } from "vitest";
import type { AdminPrincipal } from "../../src/lib/admin-contracts";
import {
  accountsApi,
  acceptEnrollmentApi,
  type AccountsApiDependencies,
} from "../src/admin/accounts-api";
import {
  MembershipError,
  createMembershipStore,
  initialsFor,
  toMembershipError,
  type AdminMember,
  type MembershipSql,
  type MembershipStore,
} from "../src/admin/membership-store";
import type { VerifiedSession } from "../src/admin/neon-auth";

const origin = "https://api.example.test";
const workspace = `${origin}/api/admin/onboarding-invites/workspace`;

const owner: AdminPrincipal = {
  id: "test-owner",
  email: "owner@example.test",
  displayName: "Workspace Owner",
  role: "owner",
  authSource: "neon",
};
const admin: AdminPrincipal = {
  ...owner,
  id: "test-admin",
  email: "admin@example.test",
  displayName: "Workspace Admin",
  role: "admin",
};
const member = (overrides: Partial<AdminMember> = {}): AdminMember => ({
  id: owner.id,
  email: owner.email,
  displayName: owner.displayName,
  role: "owner",
  authSource: "neon",
  active: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  initials: "WO",
  avatarKey: null,
  ...overrides,
});

function fakeStore(overrides: Partial<MembershipStore> = {}): MembershipStore {
  return {
    findActive: vi.fn(async () => null),
    get: vi.fn(async () => member()),
    list: vi.fn(async () => [member()]),
    createEnrollment: vi.fn(async () => ({
      enrollmentId: "enrollment-1",
      url: "/admin/login?enrollment=token",
      expiresAt: Date.now() + 72 * 60 * 60 * 1000,
    })),
    acceptEnrollment: vi.fn(async () => owner),
    updateOwnProfile: vi.fn(async (_subject, input) =>
      member({ displayName: input.displayName ?? member().displayName }),
    ),
    changeMember: vi.fn(async (_actor, target, input) =>
      member({ id: target, ...(input.active === false ? { active: false } : {}) }),
    ),
    ...overrides,
  } as MembershipStore;
}

function session(overrides: Partial<VerifiedSession> = {}): VerifiedSession {
  return {
    subject: "test-invitee",
    email: "invitee@example.test",
    emailVerified: true,
    displayName: "Invitee",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${workspace}${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function body(response: Response) {
  return (await response.json()) as Record<string, any>;
}

type Query = { text: string; params: unknown[] };

function fakeSql(
  handler: (query: Query) => unknown | Promise<unknown>,
): MembershipSql & { calls: Query[] } {
  const calls: Query[] = [];
  return {
    calls,
    async query(text: string, params: unknown[] = []) {
      const query = { text, params };
      calls.push(query);
      return (await handler(query)) as never[];
    },
  } as MembershipSql & { calls: Query[] };
}

describe("membership store token and error handling", () => {
  it("creates a 256-bit one-use token, returns it once and stores only its SHA-256 hash", async () => {
    const sql = fakeSql((query) =>
      /create_enrollment/u.test(query.text) ? [{ id: "enrollment-1" }] : [],
    );
    const store = createMembershipStore(sql, {
      now: () => 1_000_000,
    });
    const created = await store.createEnrollment(owner.id, "  New.Admin@Example.Test ");
    const token = new URL(created.url, origin).searchParams.get("enrollment") || "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(created.enrollmentId).toBe("enrollment-1");
    expect(created.expiresAt).toBe(1_000_000 + 72 * 60 * 60 * 1000);
    const write = sql.calls.find((call) => /create_enrollment/u.test(call.text));
    expect(write?.params[0]).toBe("new.admin@example.test");
    expect(write?.params[2]).toBe(owner.id);
    expect(write?.params[3]).toBe(new Date(created.expiresAt).toISOString());
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    );
    const hash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
    expect(write?.params[1]).toBe(hash);
    expect(JSON.stringify(created)).not.toContain(hash);
  });

  it.each([
    ["email_mismatch", "email_mismatch", 403],
    ["enrollment_used", "enrollment_used", 409],
    ["enrollment_expired", "expired", 410],
    ["invalid_enrollment", "invalid", 400],
    ["member_conflict", "conflict", 409],
    ["forbidden", "forbidden", 403],
    ["not_found", "not_found", 404],
    ["invalid_display_name", "invalid", 400],
    ["no_change", "invalid", 400],
    ["owner_exists", "conflict", 409],
  ])("maps database rejection %s to safe code %s/%i", (message, code, status) => {
    const mapped = toMembershipError(new Error(message));
    expect(mapped).toBeInstanceOf(MembershipError);
    expect(mapped.code).toBe(code);
    expect(mapped.status).toBe(status);
    expect(mapped.message).not.toContain("launchloom_admin");
  });

  it("maps unique violations and unknown database failures without raw details", () => {
    const duplicate = Object.assign(new Error('duplicate key value violates unique constraint "members_active_email"'), {
      code: "23505",
    });
    expect(toMembershipError(duplicate)).toMatchObject({ code: "conflict", status: 409 });
    const outage = toMembershipError(new Error("connect ECONNREFUSED postgres://secret"));
    expect(outage).toMatchObject({ code: "dependency_unavailable", status: 503 });
    expect(outage.message).not.toContain("postgres://");
    expect(outage.message).not.toContain("ECONNREFUSED");
  });

  it("does not call the database for an unverified provider session", async () => {
    const sql = fakeSql(() => []);
    const store = createMembershipStore(sql);
    await expect(
      store.acceptEnrollment(session({ emailVerified: false }), "a".repeat(43)),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(sql.calls).toHaveLength(0);
  });

  it("rejects a malformed enrollment token before the database", async () => {
    const sql = fakeSql(() => []);
    const store = createMembershipStore(sql);
    await expect(store.acceptEnrollment(session(), "not a token")).rejects.toMatchObject({
      code: "invalid",
      status: 400,
    });
    expect(sql.calls).toHaveLength(0);
  });

  it("returns no membership for an arbitrary signed-in subject", async () => {
    const sql = fakeSql(() => []);
    const store = createMembershipStore(sql);
    await expect(store.findActive("unrelated-subject")).resolves.toBeNull();
  });

  it("maps an inactive membership to null and retains it in the team list", async () => {
    const sql = fakeSql((query) =>
      /find_active_member/u.test(query.text)
        ? []
        : /list_members/u.test(query.text)
          ? [
              {
                subject: "test-inactive",
                email: "inactive@example.test",
                display_name: "Inactive Person",
                avatar_key: null,
                role: "admin",
                active: false,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-02T00:00:00.000Z",
              },
            ]
          : [],
    );
    const store = createMembershipStore(sql);
    await expect(store.findActive("test-inactive")).resolves.toBeNull();
    await expect(store.list()).resolves.toMatchObject([
      { id: "test-inactive", active: false, displayName: "Inactive Person" },
    ]);
  });

  it("validates profile names by Unicode code point and rejects arbitrary avatar URLs", async () => {
    const sql = fakeSql((query) =>
      /update_profile/u.test(query.text)
        ? [
            {
              subject: "test-admin",
              email: "admin@example.test",
              display_name: "Chloé 李雷",
              avatar_key: "initials-sage",
              role: "admin",
              active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-02T00:00:00.000Z",
            },
          ]
        : [],
    );
    const store = createMembershipStore(sql);
    await expect(
      store.updateOwnProfile("test-admin", { displayName: "Chloé 李雷", avatarKey: "initials-sage" }),
    ).resolves.toMatchObject({ displayName: "Chloé 李雷", avatarKey: "initials-sage" });
    expect(sql.calls).toHaveLength(1);
    await expect(
      store.updateOwnProfile("test-admin", { displayName: "x".repeat(101) }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.updateOwnProfile("test-admin", { avatarKey: "https://evil.example/avatar.png" }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(sql.calls).toHaveLength(1);
  });

  it("validates member changes before writing", async () => {
    const sql = fakeSql(() => []);
    const store = createMembershipStore(sql);
    await expect(
      store.changeMember(owner.id, "target", { role: "superuser" as never }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(store.changeMember(owner.id, "target", {})).rejects.toMatchObject({
      code: "invalid",
    });
    expect(sql.calls).toHaveLength(0);
  });

  it("derives accessible initials without inventing a person", () => {
    expect(initialsFor("Chloé 李雷")).toBe("C李");
    expect(initialsFor("owner@example.test")).toBe("O");
    expect(initialsFor("  ")).toBe("?");
  });
});

describe("accounts API authorization and profiles", () => {
  const deps = (
    store: MembershipStore,
    principal: AdminPrincipal,
  ): AccountsApiDependencies => ({ store, principal });

  it("lets only an owner create an enrollment", async () => {
    const store = fakeStore();
    const denied = await accountsApi(
      jsonRequest("/team/enrollments", "POST", { email: "new@example.test" }),
      deps(store, admin),
    );
    expect(denied.status).toBe(403);
    expect((await body(denied)).error.code).toBe("forbidden");
    expect(store.createEnrollment).not.toHaveBeenCalled();

    const allowed = await accountsApi(
      jsonRequest("/team/enrollments", "POST", { email: "new@example.test" }),
      deps(store, owner),
    );
    expect(allowed.status).toBe(201);
    expect(store.createEnrollment).toHaveBeenCalledWith(owner.id, "new@example.test");
  });

  it("does not accept an actor or role supplied by the browser", async () => {
    const store = fakeStore();
    const response = await accountsApi(
      jsonRequest("/team/target-subject", "PATCH", {
        active: false,
        actor: "test-evil",
        role: "owner",
      }),
      deps(store, owner),
    );
    expect(response.status).toBe(400);
    expect(store.changeMember).not.toHaveBeenCalled();
  });

  it("lets an admin read the team and edit only their own profile", async () => {
    const store = fakeStore();
    const team = await accountsApi(jsonRequest("/team", "GET"), deps(store, admin));
    expect(team.status).toBe(200);
    expect((await body(team)).members).toHaveLength(1);

    const updated = await accountsApi(
      jsonRequest("/me", "PATCH", { displayName: "Renamed Admin", avatarKey: "initials-sage" }),
      deps(store, admin),
    );
    expect(updated.status).toBe(200);
    expect(store.updateOwnProfile).toHaveBeenCalledWith(admin.id, {
      displayName: "Renamed Admin",
      avatarKey: "initials-sage",
    });
  });

  it("rejects email, role, active or subject changes through the profile API", async () => {
    const store = fakeStore();
    for (const payload of [
      { email: "attacker@example.test" },
      { role: "owner" },
      { active: false },
      { subject: "test-owner" },
    ]) {
      const response = await accountsApi(jsonRequest("/me", "PATCH", payload), deps(store, admin));
      expect(response.status).toBe(400);
      expect((await body(response)).error.code).toBe("invalid");
    }
    expect(store.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("round-trips a Unicode display name as JSON text without HTML transformation", async () => {
    const unicode = "Chloé 李雷 <not-markup>";
    const store = fakeStore({
      updateOwnProfile: vi.fn(async () => member({ displayName: unicode })),
    });
    const response = await accountsApi(
      jsonRequest("/me", "PATCH", { displayName: unicode }),
      deps(store, admin),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await body(response)).principal.displayName).toBe(unicode);
  });

  it("returns the retained inactive record to an owner and audits by principal id", async () => {
    const store = fakeStore({
      changeMember: vi.fn(async () => member({ id: "target-subject", active: false, role: "admin" })),
    });
    const response = await accountsApi(
      jsonRequest("/team/target-subject", "PATCH", { active: false }),
      deps(store, owner),
    );
    expect(response.status).toBe(200);
    expect(store.changeMember).toHaveBeenCalledWith(owner.id, "target-subject", {
      active: false,
    });
    expect((await body(response)).member).toMatchObject({
      id: "target-subject",
      active: false,
    });
  });

  it("denies member changes to an admin", async () => {
    const store = fakeStore();
    const response = await accountsApi(
      jsonRequest("/team/target-subject", "PATCH", { role: "owner" }),
      deps(store, admin),
    );
    expect(response.status).toBe(403);
    expect(store.changeMember).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations", async () => {
    const store = fakeStore();
    const response = await accountsApi(
      jsonRequest(
        "/team/enrollments",
        "POST",
        { email: "new@example.test" },
        { Origin: "https://evil.example" },
      ),
      deps(store, owner),
    );
    expect(response.status).toBe(403);
    expect(store.createEnrollment).not.toHaveBeenCalled();
  });

  it("returns no-store responses and generic dependency errors", async () => {
    const store = fakeStore({
      get: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED postgres://secret");
      }),
    });
    const response = await accountsApi(jsonRequest("/me", "GET"), deps(store, admin));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await body(response))).not.toContain("postgres://");
  });

  it("denies a signed-in subject without an active membership record", async () => {
    const store = fakeStore({ get: vi.fn(async () => null) });
    const response = await accountsApi(
      jsonRequest("/me", "GET"),
      deps(store, { ...admin, id: "unrelated-signed-in" }),
    );
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("forbidden");
  });
});

describe("enrollment acceptance API", () => {
  it("accepts only a verified provider session and returns the new principal", async () => {
    const store = fakeStore({ acceptEnrollment: vi.fn(async () => owner) });
    const verifiedSession = session();
    const request = new Request(`${workspace}/enrollments/accept`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(43) }),
    });
    const response = await acceptEnrollmentApi(request, { store, session: verifiedSession });
    expect(response.status).toBe(200);
    expect((await body(response)).principal).toMatchObject({ id: owner.id });
    expect(store.acceptEnrollment).toHaveBeenCalledWith(verifiedSession, "a".repeat(43));
  });

  it("rejects a token supplied alongside actor or email fields", async () => {
    const store = fakeStore();
    const request = new Request(`${workspace}/enrollments/accept`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(43), email: "attacker@example.test" }),
    });
    const response = await acceptEnrollmentApi(request, { store, session: session() });
    expect(response.status).toBe(400);
    expect(store.acceptEnrollment).not.toHaveBeenCalled();
  });

  it("does not require an existing membership to accept an invitation", async () => {
    const store = fakeStore();
    const request = new Request(`${workspace}/enrollments/accept`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(43) }),
    });
    // No principal is passed: the verified session is the only identity input.
    await expect(acceptEnrollmentApi(request, { store, session: session() })).resolves.toBeInstanceOf(
      Response,
    );
  });
});
