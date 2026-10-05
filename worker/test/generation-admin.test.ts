import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const apiOrigin = "https://api.launchloom.wrazyos.com";
const secret = "test-generation-tracking-secret";
const testEnv = env as unknown as Env;

function accessContext(
  email: string,
  aud = "launchloom-local-onboarding-admin",
) {
  return {
    access: {
      aud,
      getIdentity: async () => ({ email }),
    },
  } as unknown as ExecutionContext;
}

async function seedGeneration(generationId: string) {
  const started = await SELF.fetch(
    "https://api.launchloom.test/api/internal/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "start",
        generation: {
          generationId,
          issueNumber: 777,
          businessName: "Fern & Forge",
          siteId: "launchloom-777-fern-and-forge",
          repo: "WrazyAI/launchloom-777-fern-and-forge",
          clientEmail: "client@example.test",
        },
      }),
    },
  );
  expect(started.status).toBe(200);
  const evented = await SELF.fetch(
    "https://api.launchloom.test/api/internal/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "event",
        generationId,
        events: [
          {
            eventKey: "cost:seo_research",
            stage: "seo_research",
            status: "recorded",
            costUsd: 0.5,
            costKind: "actual",
          },
        ],
      }),
    },
  );
  expect(evented.status).toBe(200);
  const hero = await SELF.fetch(
    `https://api.launchloom.test/api/internal/generations/hero?id=${generationId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "image/png",
      },
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    },
  );
  expect(hero.status).toBe(200);
}

describe("Access-protected generation tracking administration", () => {
  it("renders the operations dashboard with generations and invitations", async () => {
    const page = await worker.fetch(
      new Request(`${apiOrigin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Client generations");
    expect(html).toContain("Create private link");
    expect(html).toContain("Recent invitations");
    expect(html).toContain("/api/admin/generations");
    expect(page.headers.get("Cache-Control")).toBe("no-store");
    expect(page.headers.get("Content-Security-Policy")).toContain("img-src 'self'");
    expect(page.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("denies the generations API without a verified administrator", async () => {
    const anonymous = await SELF.fetch(`${apiOrigin}/api/admin/generations`);
    expect(anonymous.status).toBe(403);
    const other = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generations`, {
        headers: { Origin: apiOrigin },
      }),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(other.status).toBe(403);
  });

  it("lists generations with costs and serves detail and hero through Access", async () => {
    const generationId = `submission-${crypto.randomUUID()}`;
    await seedGeneration(generationId);
    const context = accessContext("admin@example.test");

    const listing = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generations`, {
        headers: { Origin: apiOrigin },
      }),
      testEnv,
      context,
    );
    expect(listing.status).toBe(200);
    const body = (await listing.json()) as {
      generations: Array<Record<string, unknown>>;
    };
    const summary = body.generations.find(
      (item) => item.generationId === generationId,
    );
    expect(summary).toMatchObject({
      businessName: "Fern & Forge",
      clientEmail: "client@example.test",
      totalCostUsd: 0.5,
      heroUpdatedAt: expect.any(Number),
    });

    const detail = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generations?id=${generationId}`, {
        headers: { Origin: apiOrigin },
      }),
      testEnv,
      context,
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      generation: { generationId, issueNumber: 777 },
      events: [expect.objectContaining({ stage: "seo_research" })],
    });

    const hero = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generation-hero?id=${generationId}`),
      testEnv,
      context,
    );
    expect(hero.status).toBe(200);
    expect(hero.headers.get("Content-Type")).toBe("image/png");
    expect((await hero.arrayBuffer()).byteLength).toBe(8);

    const heroAnonymous = await SELF.fetch(
      `${apiOrigin}/api/admin/generation-hero?id=${generationId}`,
    );
    expect(heroAnonymous.status).toBe(403);
  });

  it("keeps generation administration same-origin for writes and rejects cross-origin reads", async () => {
    const crossOrigin = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generations`, {
        headers: { Origin: "https://untrusted.pages.dev" },
      }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(crossOrigin.status).toBe(403);

    const crossOriginHero = await worker.fetch(
      new Request(`${apiOrigin}/api/admin/generation-hero?id=issue:999`),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(crossOriginHero.status).toBe(404);
  });
});
