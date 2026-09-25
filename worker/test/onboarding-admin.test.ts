import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const apiOrigin = "https://api.launchloom.wrazyos.com";
const testEnv = env as unknown as Env;

function accessContext(email: string, aud = "launchloom-local-onboarding-admin") {
  return {
    access: {
      aud,
      getIdentity: async () => ({ email }),
    },
  } as unknown as ExecutionContext;
}

describe("Access-protected invite administration", () => {
  it("fails closed when a request arrives without a verified Access identity", async () => {
    const page = await SELF.fetch("https://api.launchloom.test/admin/onboarding-invites");
    const api = await SELF.fetch("https://api.launchloom.test/api/admin/onboarding-invites");

    expect(page.status).toBe(403);
    expect(api.status).toBe(403);
  });

  it("creates one-use links only for the configured Access audience and administrator", async () => {
    const denied = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      }),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(denied.status).toBe(403);
    const wrongAudience = await worker.fetch(
      new Request(`${apiOrigin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test", "wrong-audience"),
    );
    expect(wrongAudience.status).toBe(403);

    const adminPage = await worker.fetch(
      new Request(`${apiOrigin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(adminPage.status).toBe(200);
    expect(adminPage.headers.get("Cache-Control")).toBe("no-store");
    expect(adminPage.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(await adminPage.text()).toContain("Create private link");

    const created = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", clientEmail: "owner@example.test" }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(created.status).toBe(201);
    const result = await created.json() as { inviteId: string; clientEmail: string; url: string };
    expect(result).toMatchObject({ clientEmail: "owner@example.test" });
    expect(result.url).toMatch(/^https:\/\/onboard\.example\.test\/onboard\/#invite=/u);
    const token = new URL(result.url).hash.slice("#invite=".length);
    const validated = await SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
      method: "POST",
      headers: { Origin: "https://onboard.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(validated.status).toBe(200);
    await expect(validated.json()).resolves.toMatchObject({ valid: true, clientEmail: "owner@example.test" });

    const listing = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, { headers: { Origin: apiOrigin } }),
      testEnv,
      accessContext("admin@example.test"),
    );
    const inviteList = await listing.json() as { invites: Array<Record<string, unknown>> };
    expect(inviteList.invites).toEqual(expect.arrayContaining([
      expect.objectContaining({ inviteId: result.inviteId, status: "unused", clientEmail: "owner@example.test" }),
    ]));
    expect(JSON.stringify(inviteList)).not.toContain("#invite=");

    const revoked = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: { Origin: apiOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", inviteId: result.inviteId }),
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(revoked.status).toBe(200);
    const replay = await SELF.fetch("https://api.launchloom.test/api/onboarding-invites/validate", {
      method: "POST",
      headers: { Origin: "https://onboard.example.test", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(403);
  });

  it("keeps invite administration same-origin while allowing origin-less GETs", async () => {
    const context = accessContext("admin@example.test");
    const crossOriginGet = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        headers: { Origin: "https://untrusted.pages.dev" },
      }),
      testEnv,
      context,
    );
    expect(crossOriginGet.status).toBe(403);
    expect(crossOriginGet.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginGet.headers.get("Cache-Control")).toBe("no-store");

    const crossOriginPost = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.pages.dev",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "create" }),
      }),
      testEnv,
      context,
    );
    expect(crossOriginPost.status).toBe(403);
    expect(crossOriginPost.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginPost.headers.get("Cache-Control")).toBe("no-store");

    const crossOriginOptions = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://untrusted.pages.dev",
          "Access-Control-Request-Method": "POST",
        },
      }),
      testEnv,
      context,
    );
    expect(crossOriginOptions.status).toBe(403);
    expect(crossOriginOptions.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(crossOriginOptions.headers.get("Cache-Control")).toBe("no-store");

    const sameOriginOptions = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`, {
        method: "OPTIONS",
        headers: {
          Origin: apiOrigin,
          "Access-Control-Request-Method": "POST",
        },
      }),
      testEnv,
      context,
    );
    expect(sameOriginOptions.status).toBe(204);
    expect(sameOriginOptions.headers.get("Access-Control-Allow-Origin")).toBe(apiOrigin);
    expect(sameOriginOptions.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(sameOriginOptions.headers.get("Cache-Control")).toBe("no-store");

    const originlessGet = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/onboarding-invites`),
      testEnv,
      context,
    );
    expect(originlessGet.status).toBe(200);
    expect(originlessGet.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(originlessGet.headers.get("Cache-Control")).toBe("no-store");
  });
});
