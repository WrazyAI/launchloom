import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, buildAttemptQuery, createAdminApi, fetchAdmin } from "../src/admin/api";

function respond(response: Response | Promise<Response>) {
  const mock = vi.fn(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin API transport", () => {
  it("returns parsed JSON for a valid success response", async () => {
    respond(json({ items: [{ attemptId: "attempt-1" }] }));
    await expect(
      fetchAdmin<{ items: Array<{ attemptId: string }> }>(
        "/api/admin/onboarding-invites/workspace/attempts",
      ),
    ).resolves.toEqual({ items: [{ attemptId: "attempt-1" }] });
  });

  it("returns undefined only for an explicit no-content response", async () => {
    respond(new Response(null, { status: 204 }));
    await expect(fetchAdmin("/api/admin/test")).resolves.toBeUndefined();

    respond(json({ ignored: true }, 200));
    await expect(
      fetchAdmin("/api/admin/test", { expectNoContent: true }),
    ).resolves.toBeUndefined();
  });

  it("throws a typed error for an empty successful response", async () => {
    respond(new Response("", { status: 200 }));
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("throws a typed error for malformed JSON", async () => {
    respond(
      new Response("{not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("requires a JSON content type for successful responses", async () => {
    respond(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("rejects a null or invalid JSON shape", async () => {
    respond(json(null));
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      code: "invalid_response",
    });

    respond(json({ items: "not-an-array" }));
    await expect(
      fetchAdmin<{ items: unknown[] }>("/api/admin/test", {
        validate: (value): value is { items: unknown[] } =>
          Boolean(
            value &&
            typeof value === "object" &&
            Array.isArray((value as { items?: unknown }).items),
          ),
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("normalizes body-read failures to a typed response error", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("synthetic stream failure"));
      },
    });
    respond(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("maps HTTP error envelopes without leaking the raw body", async () => {
    respond(
      json({ error: { code: "forbidden", message: "Access denied." } }, 403),
    );
    const error = await fetchAdmin("/api/admin/test").catch((value) => value);
    expect(error).toBeInstanceOf(ApiRequestError);
    if (!(error instanceof ApiRequestError))
      throw new Error("expected ApiRequestError");
    expect(error).toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Access denied.",
    });
    expect(error.message).not.toContain("{");
  });

  it("normalizes network failures and invalid paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("synthetic network failure");
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 0,
      code: "network_unavailable",
    });

    await expect(
      fetchAdmin("https://example.test/api/admin"),
    ).rejects.toMatchObject({ name: "ApiRequestError", code: "invalid_path" });
  });
});

const MEMBER = {
  id: "subject-owner",
  email: "owner@example.test",
  displayName: "Dev Owner",
  role: "owner" as const,
  authSource: "neon" as const,
  active: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  initials: "DO",
  avatarKey: null,
};

function recordedApi(responses: unknown[]) {
  const calls: Array<{ path: string; init: Record<string, unknown> }> = [];
  const fetcher = (async (path: string, init?: Record<string, unknown>) => {
    calls.push({ path, init: init || {} });
    if (responses.length === 0)
      throw new Error("synthetic response queue empty");
    const value = responses.shift();
    const validate = init?.validate as
      ((input: unknown) => boolean) | undefined;
    if (validate && !validate(value))
      throw new ApiRequestError(
        200,
        "invalid_response",
        "The admin response had an unexpected shape.",
      );
    return value;
  }) as unknown as typeof fetchAdmin;
  return { api: createAdminApi(fetcher), calls };
}

function bodyOf(call: { init: Record<string, unknown> }) {
  return typeof call.init.body === "string"
    ? (JSON.parse(call.init.body) as Record<string, unknown>)
    : null;
}

describe("admin account API contracts", () => {
  it("calls the membership, enrollment and auth allowlisted routes", async () => {
    const { api, calls } = recordedApi([
      { principal: MEMBER },
      { members: [MEMBER] },
      {
        enrollment: {
          id: "enrollment-1",
          url: "/admin/login#enroll=token",
          expiresAt: 1_700_000_200_000,
        },
      },
      { member: { ...MEMBER, role: "admin" } },
      {
        principal: { ...MEMBER, displayName: "Avery Owner", avatarKey: "sage" },
      },
      {
        principal: {
          id: MEMBER.id,
          email: MEMBER.email,
          displayName: MEMBER.displayName,
          role: "admin",
          authSource: "neon",
        },
      },
      {
        ok: true,
        user: {
          id: MEMBER.id,
          email: MEMBER.email,
          emailVerified: true,
          name: MEMBER.displayName,
        },
        session: { expiresAt: 1_700_000_300_000 },
      },
      { ok: true, user: null, session: null },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, user: null, session: null },
    ]);

    await expect(api.getMe()).resolves.toMatchObject({
      authSource: "neon",
      role: "owner",
    });
    await expect(api.getTeam()).resolves.toHaveLength(1);
    await expect(
      api.createEnrollment("Invitee@Example.test"),
    ).resolves.toMatchObject({
      id: "enrollment-1",
    });
    await expect(
      api.changeMember("subject-owner", { role: "admin" }),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(
      api.updateProfile({ displayName: "Avery Owner", avatarKey: "sage" }),
    ).resolves.toMatchObject({ displayName: "Avery Owner" });
    await expect(api.acceptEnrollment("token-value")).resolves.toMatchObject({
      role: "admin",
    });
    await expect(
      api.signIn("Owner@Example.test", "secret"),
    ).resolves.toMatchObject({
      user: { emailVerified: true },
    });
    await api.signOut();
    await api.requestPasswordReset("Owner@Example.test");
    await api.resetPassword("reset-token", "new-secret");
    await api.changePassword("old-secret", "new-secret");
    await api.verifyEmail("verify-token");

    expect(calls.map((call) => call.path)).toEqual([
      "/api/admin/onboarding-invites/workspace/me",
      "/api/admin/onboarding-invites/workspace/team",
      "/api/admin/onboarding-invites/workspace/team/enrollments",
      "/api/admin/onboarding-invites/workspace/team/subject-owner",
      "/api/admin/onboarding-invites/workspace/me",
      "/api/admin/onboarding-invites/workspace/enrollments/accept",
      "/api/admin/onboarding-invites/auth/sign-in/email",
      "/api/admin/onboarding-invites/auth/sign-out",
      "/api/admin/onboarding-invites/auth/request-password-reset",
      "/api/admin/onboarding-invites/auth/reset-password",
      "/api/admin/onboarding-invites/auth/change-password",
      "/api/admin/onboarding-invites/auth/verify-email?token=verify-token",
    ]);
    expect(bodyOf(calls[2])).toEqual({ email: "invitee@example.test" });
    expect(bodyOf(calls[3])).toEqual({ role: "admin" });
    expect(bodyOf(calls[4])).toEqual({
      displayName: "Avery Owner",
      avatarKey: "sage",
    });
    expect(bodyOf(calls[5])).toEqual({ token: "token-value" });
    expect(bodyOf(calls[6])).toEqual({
      email: "owner@example.test",
      password: "secret",
    });
    expect(bodyOf(calls[7])).toEqual({});
    expect(bodyOf(calls[8])).toEqual({
      email: "owner@example.test",
      redirectTo: "/admin/login",
    });
    expect(bodyOf(calls[9])).toEqual({
      token: "reset-token",
      newPassword: "new-secret",
    });
    expect(bodyOf(calls[10])).toEqual({
      currentPassword: "old-secret",
      newPassword: "new-secret",
      revokeOtherSessions: true,
    });
    expect(JSON.stringify(calls)).not.toContain("localStorage");
  });

  it("encodes the additive attention filter", () => {
    expect(buildAttemptQuery({ attention: true }).get("attention")).toBe("true");
    expect(buildAttemptQuery({ attention: false }).get("attention")).toBeNull();
  });

  it("rejects malformed membership and auth responses", async () => {
    const team = recordedApi([{ members: [{ id: "forged" }] }]);
    await expect(team.api.getTeam()).rejects.toMatchObject({
      code: "invalid_response",
    });

    const principal = recordedApi([
      { principal: { ...MEMBER, authSource: "cloudflare-access" } },
    ]);
    await expect(principal.api.getMe()).rejects.toMatchObject({
      code: "invalid_response",
    });

    const signIn = recordedApi([{ ok: true, user: null, session: null }]);
    await expect(
      signIn.api.signIn("owner@example.test", "secret"),
    ).rejects.toMatchObject({
      code: "auth_failed",
    });
  });
});
