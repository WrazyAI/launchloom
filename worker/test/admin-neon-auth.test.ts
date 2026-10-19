import { NEON_AUTH_COOKIE_PREFIX } from "@neondatabase/auth/server";
import { env } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthConfigError,
  AdminAuthDependencyError,
  proxyAdminAuth,
  readNeonSession,
  type AdminAuthEnv,
} from "../src/admin/neon-auth";
import worker, { type Env } from "../src/index";
import { network } from "./network";

let authOrigin = "https://auth.example.test";
const publicOrigin = "https://api.example.test";
let addressCounter = 1;

function syntheticAddress() {
  addressCounter += 1;
  return `203.0.113.${(addressCounter % 250) + 1}`;
}

beforeEach(() => {
  authOrigin = `https://auth-${crypto.randomUUID()}.example.test`;
});
const cookieSecret = "synthetic-neon-cookie-secret-at-least-32-chars";
const sessionCookieName = "__Secure-neon-auth.session_token";
const sessionDataCookieName = "__Secure-neon-auth.local.session_data";
const sessionPath = "/api/admin/onboarding-invites/auth";

function neonEnv(overrides: Partial<AdminAuthEnv> = {}): AdminAuthEnv {
  return {
    ADMIN_AUTH_MODE: "neon",
    NEON_AUTH_BASE_URL: authOrigin,
    NEON_AUTH_COOKIE_SECRET: cookieSecret,
    ADMIN_PUBLIC_ORIGIN: publicOrigin,
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`${publicOrigin}${path}`, init);
}

function sessionRequest(cookie = `${sessionCookieName}=opaque-session`) {
  return request("/admin/onboarding-invites", {
    headers: { Cookie: cookie },
  });
}

function sessionPayload(
  overrides: {
    expiresAt?: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    subject?: string;
  } = {},
) {
  return {
    session: {
      id: "synthetic-session",
      token: "opaque-session",
      userId: overrides.subject ?? "synthetic-user",
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      ipAddress: "127.0.0.1",
      userAgent: "synthetic-test",
    },
    user: {
      id: overrides.subject ?? "synthetic-user",
      email: overrides.email ?? "owner@example.test",
      emailVerified: overrides.emailVerified ?? true,
      name: overrides.name ?? "Synthetic Owner",
      image: null,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function jsonBody(body: unknown) {
  return {
    method: "POST",
    headers: {
      Origin: publicOrigin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": syntheticAddress(),
    },
    body: JSON.stringify(body),
  };
}


function failingBodyResponse(message: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error(message));
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("Neon same-origin session adapter", () => {
  it("pins the SDK cookie prefix used by the adapter boundary", () => {
    expect(NEON_AUTH_COOKIE_PREFIX).toBe("__Secure-neon-auth");
  });

  it("rejects an unauthenticated request without calling the provider", async () => {
    let providerCalls = 0;
    network.use(
      http.get(`${authOrigin}/get-session`, () => {
        providerCalls += 1;
        return HttpResponse.json(sessionPayload());
      }),
    );

    await expect(readNeonSession(request("/admin/onboarding-invites"), neonEnv())).resolves.toEqual({
      session: null,
      setCookies: [],
    });
    expect(providerCalls).toBe(0);
  });

  it("does not authenticate a forwarded email header", async () => {
    let providerCalls = 0;
    network.use(
      http.get(`${authOrigin}/get-session`, () => {
        providerCalls += 1;
        return HttpResponse.json(sessionPayload());
      }),
    );

    const forged = request("/admin/onboarding-invites", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "owner@example.test",
        "X-Forwarded-Email": "owner@example.test",
        "X-Auth-Request-Email": "owner@example.test",
      },
    });
    await expect(readNeonSession(forged, neonEnv())).resolves.toEqual({
      session: null,
      setCookies: [],
    });
    expect(providerCalls).toBe(0);
  });

  it("returns the verified upstream session without using the cookie cache", async () => {
    let observed: { cookie: string | null; query: string | null; framework: string | null } | null = null;
    network.use(
      http.get(`${authOrigin}/get-session`, ({ request: providerRequest }) => {
        const url = new URL(providerRequest.url);
        observed = {
          cookie: providerRequest.headers.get("cookie"),
          query: url.searchParams.get("disableCookieCache"),
          framework: providerRequest.headers.get("x-neon-auth-proxy"),
        };
        return HttpResponse.json(
          sessionPayload({
            subject: "neon-user-1",
            email: "Owner@Example.Test",
            name: "Owner Example",
          }),
        );
      }),
    );

    const { session, setCookies } = await readNeonSession(
      sessionRequest(`${sessionCookieName}=first; ${sessionDataCookieName}=forged-cache`),
      neonEnv(),
    );

    expect(setCookies).toEqual([]);
    expect(observed).toEqual({
      cookie: `${sessionCookieName}=first; ${sessionDataCookieName}=forged-cache`,
      query: "true",
      framework: "cloudflare-worker",
    });
    expect(session).toMatchObject({
      subject: "neon-user-1",
      email: "owner@example.test",
      emailVerified: true,
      displayName: "Owner Example",
    });
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("keeps an unverified provider session but exposes the verified flag", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json(sessionPayload({ emailVerified: false })),
      ),
    );

    const { session } = await readNeonSession(sessionRequest(), neonEnv());
    expect(session).toMatchObject({ emailVerified: false, email: "owner@example.test" });
  });

  it("rejects expired, revoked, or signed-out sessions", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json(sessionPayload({ expiresAt: new Date(Date.now() - 1_000).toISOString() })),
      ),
    );
    await expect(readNeonSession(sessionRequest(), neonEnv())).resolves.toEqual({
      session: null,
      setCookies: [],
    });

    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json({ session: null, user: null }),
      ),
    );
    await expect(readNeonSession(sessionRequest(), neonEnv())).resolves.toEqual({
      session: null,
      setCookies: [],
    });

    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json({ message: "Invalid session" }, { status: 401 }),
      ),
    );
    await expect(readNeonSession(sessionRequest(), neonEnv())).resolves.toEqual({
      session: null,
      setCookies: [],
    });
  });

  it("types provider outages as dependency-unavailable instead of signed out", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json({ message: "provider private detail" }, { status: 503 }),
      ),
    );

    const error = await readNeonSession(sessionRequest(), neonEnv()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdminAuthDependencyError);
    expect(error).toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
    expect(String((error as Error).message)).not.toContain("provider private detail");
  });

  it("fails closed when neon configuration is missing or partial", async () => {
    const cases: Array<Partial<AdminAuthEnv>> = [
      { ADMIN_AUTH_MODE: "neon" },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_BASE_URL: authOrigin },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_BASE_URL: authOrigin, NEON_AUTH_COOKIE_SECRET: cookieSecret },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_COOKIE_SECRET: cookieSecret, ADMIN_PUBLIC_ORIGIN: publicOrigin },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_BASE_URL: authOrigin, NEON_AUTH_COOKIE_SECRET: "short", ADMIN_PUBLIC_ORIGIN: publicOrigin },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_BASE_URL: "http://auth.example.test", NEON_AUTH_COOKIE_SECRET: cookieSecret, ADMIN_PUBLIC_ORIGIN: publicOrigin },
      { ADMIN_AUTH_MODE: "neon", NEON_AUTH_BASE_URL: authOrigin, NEON_AUTH_COOKIE_SECRET: cookieSecret, ADMIN_PUBLIC_ORIGIN: "https://api.example.test/admin" },
    ];

    for (const config of cases) {
      const response = await proxyAdminAuth(
        request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
        config as AdminAuthEnv,
      );
      expect(response.status).toBe(503);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe("dependency_unavailable");
      expect(JSON.stringify(body)).not.toContain(cookieSecret);
    }

    const error = await readNeonSession(sessionRequest(), { ADMIN_AUTH_MODE: "neon" }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdminAuthConfigError);
    expect(error).toMatchObject({ code: "auth_not_configured", status: 503 });
  });

  it("does not fall back to Access routes or context when neon mode is unavailable", async () => {
    const accessOnly = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, {
        ...jsonBody({ email: "owner@example.test", password: "password" }),
        headers: {
          Origin: publicOrigin,
          "Content-Type": "application/json",
          "Cf-Access-Authenticated-User-Email": "owner@example.test",
        },
      }),
      { ADMIN_AUTH_MODE: "access" },
    );
    expect(accessOnly.status).toBe(404);

    const unavailable = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
      { ADMIN_AUTH_MODE: "neon" },
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("Access");

    const read = await readNeonSession(
      request("/admin/onboarding-invites", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "owner@example.test",
          Cookie: `${sessionCookieName}=opaque`,
        },
      }),
      { ADMIN_AUTH_MODE: "access" },
    ).catch((reason: unknown) => reason);
    expect(read).toBeInstanceOf(AdminAuthConfigError);
  });

  it("preserves multiple Set-Cookie headers without comma merging", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () => HttpResponse.json(sessionPayload())),
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json(
          { token: "synthetic" },
          {
            headers: [
              ["Set-Cookie", `${sessionCookieName}=first; Path=/; HttpOnly; Secure; SameSite=Lax`],
              [
                "Set-Cookie",
                `${sessionDataCookieName}=second; Path=/; HttpOnly; Secure; Expires=Wed, 21 Oct 2026 07:28:00 GMT`,
              ],
            ],
          },
        ),
      ),
    );

    const response = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
      neonEnv(),
    );

    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThanOrEqual(2);
    expect(cookies[0]).toContain(`${sessionCookieName}=first`);
    expect(cookies[1]).toContain(`${sessionDataCookieName}=second`);
    expect(cookies[1]).toContain("Expires=Wed, 21 Oct 2026 07:28:00 GMT");
    const body = await response.text();
    expect(body).not.toContain("password");
  });

  it("forces HTTPS host-scoped HttpOnly cookies and removes upstream Domain/Partitioned flags", async () => {
    const providerHost = new URL(authOrigin).hostname;
    network.use(
      http.get(`${authOrigin}/get-session`, () => HttpResponse.json(sessionPayload())),
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json(
          { ok: true },
          {
            headers: [
              [
                "Set-Cookie",
                `${sessionCookieName}=token; Path=/; HttpOnly; Secure; SameSite=None; Domain=${providerHost}; Partitioned`,
              ],
            ],
          },
        ),
      ),
    );

    const response = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
      neonEnv(),
    );

    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toMatch(/Domain=/iu);
    expect(cookie).not.toMatch(/Partitioned/iu);
  });

  it("preserves the request cookie jar but drops caller bearer credentials", async () => {
    let forwarded = "";
    let authorization: string | null = null;
    network.use(
      http.post(`${authOrigin}/sign-out`, ({ request: providerRequest }) => {
        forwarded = providerRequest.headers.get("cookie") || "";
        authorization = providerRequest.headers.get("authorization");
        return HttpResponse.json({ success: true });
      }),
    );

    await proxyAdminAuth(
      request(`${sessionPath}/sign-out`, {
        method: "POST",
        headers: {
          Origin: publicOrigin,
          Authorization: "Bearer forged-admin-token",
          Cookie: `${sessionCookieName}=one; ${sessionDataCookieName}=two`,
          "CF-Connecting-IP": syntheticAddress(),
        },
      }),
      neonEnv(),
    );

    expect(forwarded).toBe(`${sessionCookieName}=one; ${sessionDataCookieName}=two`);
    expect(authorization).toBeNull();
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/admin/%2f%2fevil.example/steal",
    "/admin/%5c%5cevil.example/steal",
    "/admin/ok%0d%0aSet-Cookie:%20owned=1",
    "javascript:alert(1)",
  ])("rejects an unsafe returnTo/callback value: %s", async (callback) => {
    let providerCalls = 0;
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () => {
        providerCalls += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    const response = await proxyAdminAuth(
      request(
        `${sessionPath}/sign-in/email`,
        jsonBody({
          email: "owner@example.test",
          password: "password",
          callbackURL: callback,
        }),
      ),
      neonEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("evil.example");
    expect(providerCalls).toBe(0);
  });

  it("accepts a same-origin admin callback and applies the secure default", async () => {
    const forwarded: Array<Record<string, unknown>> = [];
    network.use(
      http.post(`${authOrigin}/sign-in/email`, async ({ request: providerRequest }) => {
        forwarded.push(JSON.parse(await providerRequest.text()) as Record<string, unknown>);
        return HttpResponse.json({ ok: true });
      }),
    );

    const valid = await proxyAdminAuth(
      request(
        `${sessionPath}/sign-in/email`,
        jsonBody({
          email: "owner@example.test",
          password: "password",
          callbackURL: "/admin/onboarding-invites?view=generations",
        }),
      ),
      neonEnv(),
    );
    expect(valid.status).toBe(200);

    const absent = await proxyAdminAuth(
      request(
        `${sessionPath}/sign-in/email`,
        jsonBody({ email: "owner@example.test", password: "password" }),
      ),
      neonEnv(),
    );
    expect(absent.status).toBe(200);

    expect(forwarded[0]).toMatchObject({
      callbackURL: "/admin/onboarding-invites?view=generations",
    });
    expect(forwarded[1]).toMatchObject({ callbackURL: "/admin/onboarding-invites" });
  });

  it("rejects cross-origin, originless, and oversized mutations before upstream", async () => {
    let providerCalls = 0;
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () => {
        providerCalls += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    const crossOrigin = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, {
        ...jsonBody({ email: "owner@example.test", password: "password" }),
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
      }),
      neonEnv(),
    );
    expect(crossOrigin.status).toBe(403);

    const originless = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": syntheticAddress() },
        body: JSON.stringify({ email: "owner@example.test", password: "password" }),
      }),
      neonEnv(),
    );
    expect(originless.status).toBe(403);

    const oversized = await proxyAdminAuth(
      request(`${sessionPath}/forget-password`, {
        method: "POST",
        headers: {
          Origin: publicOrigin,
          "Content-Type": "application/json",
          "CF-Connecting-IP": syntheticAddress(),
        },
        body: JSON.stringify({ email: "owner@example.test", padding: "x".repeat(20_000) }),
      }),
      neonEnv(),
    );
    expect(oversized.status).toBe(413);
    expect(providerCalls).toBe(0);
  });

  it("rate limits repeated sensitive auth attempts per client", async () => {
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () => HttpResponse.json({ ok: true })),
    );

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await proxyAdminAuth(
        request(`${sessionPath}/sign-in/email`, {
          ...jsonBody({ email: "owner@example.test", password: "password" }),
          headers: {
            Origin: publicOrigin,
            "Content-Type": "application/json",
            "CF-Connecting-IP": "198.51.100.77",
          },
        }),
        neonEnv(),
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 200));
    expect(statuses[10]).toBe(429);
  });

  it("passes through identical provider reset responses without a local member lookup", async () => {
    network.use(
      http.post(`${authOrigin}/forget-password`, () =>
        HttpResponse.json({ status: true }),
      ),
    );

    const admin = await proxyAdminAuth(
      request(`${sessionPath}/forget-password`, jsonBody({ email: "owner@example.test" })),
      neonEnv(),
    );
    const stranger = await proxyAdminAuth(
      request(`${sessionPath}/forget-password`, jsonBody({ email: "stranger@example.test" })),
      neonEnv(),
    );

    expect(admin.status).toBe(stranger.status);
    expect(await admin.text()).toBe(await stranger.text());
  });

  it("does not log or return the submitted password", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json({ error: { message: "Invalid credentials" } }, { status: 401 }),
      ),
    );

    const response = await proxyAdminAuth(
      request(
        `${sessionPath}/sign-in/email`,
        jsonBody({ email: "owner@example.test", password: "unique-password-value" }),
      ),
      neonEnv(),
    );

    const body = await response.text();
    expect(body).not.toContain("unique-password-value");
    const logged = [...log.mock.calls, ...error.mock.calls].map((call) => JSON.stringify(call)).join("\n");
    expect(logged).not.toContain("unique-password-value");
    log.mockRestore();
    error.mockRestore();
  });

  it("returns a generic dependency error when the provider fails a proxied mutation", async () => {
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json({ message: "provider internal detail" }, { status: 503 }),
      ),
    );

    const response = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
      neonEnv(),
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("dependency_unavailable");
    expect(body).not.toContain("provider internal detail");
  });

  it("keeps the auth route closed unless neon mode is explicit", async () => {
    const requestBody = jsonBody({ email: "owner@example.test", password: "password" });
    const accessMode = await worker.fetch(
      request(`${sessionPath}/sign-in/email`, requestBody),
      { ...(env as unknown as Env), ADMIN_AUTH_MODE: "access" },
      {} as ExecutionContext,
    );
    expect(accessMode.status).toBe(404);

    network.use(
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json({ message: "synthetic provider outage" }, { status: 503 }),
      ),
    );
    const neonMode = await worker.fetch(
      request(`${sessionPath}/sign-in/email`, requestBody),
      { ...(env as unknown as Env), ...neonEnv() },
      {} as ExecutionContext,
    );
    expect(neonMode.status).toBe(503);
  });

  it("serves only a public data-free login shell in neon mode", async () => {
    const login = await worker.fetch(
      request("/admin/login"),
      { ...(env as unknown as Env), ...neonEnv() },
      {} as ExecutionContext,
    );
    expect(login.status).toBe(200);
    expect(login.headers.get("Cache-Control")).toBe("no-store");
    expect(login.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(login.headers.getSetCookie()).toHaveLength(0);
    const html = await login.text();
    expect(html).toContain("LaunchLoom admin");
    expect(html).not.toContain("owner@example.test");

    const closed = await worker.fetch(
      request("/admin/login"),
      { ...(env as unknown as Env), ADMIN_AUTH_MODE: "access" },
      {} as ExecutionContext,
    );
    expect(closed.status).toBe(404);
  });

  it("rejects non-allowlisted provider administration endpoints", async () => {
    for (const path of [
      `${sessionPath}/admin/set-role`,
      `${sessionPath}/admin/impersonate-user`,
      `${sessionPath}/organization/create`,
      `${sessionPath}/list-users`,
      `${sessionPath}/set-user-password`,
      `${sessionPath}/get-access-token`,
      `${sessionPath}/../sign-in/email`,
    ]) {
      const response = await proxyAdminAuth(request(path, jsonBody({})), neonEnv());
      expect(response.status).toBe(404);
    }
  });
  it("types malformed successful provider payloads as dependency-unavailable", async () => {
    const payloads: Array<() => Response> = [
      () =>
        new HttpResponse("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => new HttpResponse(null, { status: 200 }),
      () => HttpResponse.json({ unexpected: true }),
      () =>
        HttpResponse.json({
          session: { id: "synthetic-session", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
          user: { id: "synthetic-user" },
        }),
      () => HttpResponse.json({ session: null }),
      () => HttpResponse.json({ session: { id: "synthetic-session" }, user: null }),
    ];

    for (const payload of payloads) {
      network.use(http.get(`${authOrigin}/get-session`, () => payload()));
      const error = await readNeonSession(sessionRequest(), neonEnv()).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(AdminAuthDependencyError);
      expect(error).toMatchObject({ code: "dependency_unavailable", status: 503 });
    }
  });

  it("preserves the explicit supported signed-out provider shapes", async () => {
    for (const payload of [
      () => new HttpResponse("null", { status: 200, headers: { "Content-Type": "application/json" } }),
      () => HttpResponse.json({ session: null, user: null }),
    ]) {
      network.use(http.get(`${authOrigin}/get-session`, () => payload()));
      await expect(readNeonSession(sessionRequest(), neonEnv())).resolves.toEqual({
        session: null,
        setCookies: [],
      });
    }
  });

  it("strips provider credential headers and session tokens from browser responses", async () => {
    network.use(
      http.post(`${authOrigin}/sign-in/email`, () =>
        HttpResponse.json(
          {
            token: "secret-bearer",
            refreshToken: "secret-refresh",
            user: { id: "u1", email: "owner@example.test", emailVerified: true, name: "Owner" },
            session: {
              token: "secret-session",
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
          },
          {
            headers: [
              ["Set-Cookie", `${sessionCookieName}=cookie-only; Path=/; HttpOnly; Secure`],
              ["set-auth-token", "secret-bearer"],
              ["set-auth-jwt", "secret-jwt"],
            ],
          },
        ),
      ),
      http.get(`${authOrigin}/get-session`, () => HttpResponse.json(sessionPayload())),
    );

    const signIn = await proxyAdminAuth(
      request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
      neonEnv(),
    );
    expect(signIn.headers.get("set-auth-token")).toBeNull();
    expect(signIn.headers.get("set-auth-jwt")).toBeNull();
    expect(signIn.headers.getSetCookie()).toHaveLength(1);
    const signInBody = await signIn.text();
    for (const secret of ["secret-bearer", "secret-session", "secret-refresh", "secret-jwt"]) {
      expect(signInBody).not.toContain(secret);
    }
    expect(signInBody).toContain('"ok":true');

    const browserSession = await proxyAdminAuth(
      request(`${sessionPath}/get-session`, {
        headers: { Cookie: `${sessionCookieName}=opaque-session` },
      }),
      neonEnv(),
    );
    const sessionBody = await browserSession.text();
    expect(sessionBody).not.toContain("opaque-session");
    expect(sessionBody).toContain('"ok":true');
  });

  it("never follows an upstream redirect and emits only a validated browser Location", async () => {
    let followed = 0;
    network.use(
      http.get(`${authOrigin}/verify-email`, () =>
        new HttpResponse(null, {
          status: 302,
          headers: [
            ["Location", "https://evil.example/steal"],
            ["Set-Cookie", `${sessionCookieName}=renewed; Path=/; HttpOnly; Secure`],
            ["Set-Cookie", `${sessionDataCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure`],
          ],
        }),
      ),
      http.get("https://evil.example/steal", () => {
        followed += 1;
        return HttpResponse.json({});
      }),
    );

    const response = await proxyAdminAuth(
      request(`${sessionPath}/verify-email?token=synthetic-verify-token`),
      neonEnv(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/onboarding-invites");
    expect(followed).toBe(0);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain(`${sessionCookieName}=renewed`);
    expect(cookies[1]).toContain("Max-Age=0");
  });

  it("accepts an absolute same-origin admin redirect Location", async () => {
    network.use(
      http.get(`${authOrigin}/verify-email`, () =>
        new HttpResponse(null, {
          status: 302,
          headers: { Location: `${publicOrigin}/admin/onboarding-invites?view=clients` },
        }),
      ),
    );

    const response = await proxyAdminAuth(
      request(`${sessionPath}/verify-email?token=synthetic-verify-token`),
      neonEnv(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/onboarding-invites?view=clients");
  });

  it("returns provider renewal and clearing cookies from the session read", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        HttpResponse.json(sessionPayload(), {
          headers: [
            ["Set-Cookie", `${sessionCookieName}=renewed; Path=/; HttpOnly; Secure`],
            ["Set-Cookie", `${sessionDataCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure`],
          ],
        }),
      ),
    );

    const result = await readNeonSession(sessionRequest(), neonEnv());

    expect(result.session).toMatchObject({ email: "owner@example.test", emailVerified: true });
    expect(result.setCookies).toHaveLength(2);
    expect(result.setCookies[0]).toContain(`${sessionCookieName}=renewed`);
    expect(result.setCookies[0]).toContain("Secure");
    expect(result.setCookies[0]).toContain("HttpOnly");
    expect(result.setCookies[1]).toContain("Max-Age=0");
  });

  it("returns clearing cookies even when the provider rejects the session", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        new HttpResponse(JSON.stringify({ message: "Invalid session" }), {
          status: 401,
          headers: [
            ["Content-Type", "application/json"],
            ["Set-Cookie", `${sessionCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure`],
          ],
        }),
      ),
    );

    const result = await readNeonSession(sessionRequest(), neonEnv());

    expect(result.session).toBeNull();
    expect(result.setCookies).toHaveLength(1);
    expect(result.setCookies[0]).toContain("Max-Age=0");
  });

  it("fails closed when the provider response is oversized", async () => {
    network.use(
      http.get(`${authOrigin}/get-session`, () =>
        new HttpResponse("x".repeat(300_000), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error = await readNeonSession(sessionRequest(), neonEnv()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdminAuthDependencyError);
  });

  it("normalizes a rejected session response-body stream into a typed dependency error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failingBodyResponse("raw session stream failure"));

    try {
      const error = await readNeonSession(sessionRequest(), neonEnv()).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(AdminAuthDependencyError);
      expect(error).toMatchObject({ code: "dependency_unavailable", status: 503 });
      expect(String((error as Error).message)).not.toContain("raw session stream failure");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns a generic 503 when a proxied response-body stream fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failingBodyResponse("raw proxy stream failure"));

    try {
      const response = await proxyAdminAuth(
        request(`${sessionPath}/sign-in/email`, jsonBody({ email: "owner@example.test", password: "password" })),
        neonEnv(),
      );
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).toContain("dependency_unavailable");
      expect(body).not.toContain("raw proxy stream failure");
    } finally {
      fetchSpy.mockRestore();
    }
  });

});
