import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const apiBase = "https://api.launchloom.test";
const secret = "test-generation-tracking-secret";

function track(
  body: unknown,
  options: { token?: string; raw?: string } = {},
): Promise<Response> {
  return SELF.fetch(`${apiBase}/api/internal/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token ?? secret}`,
      "Content-Type": "application/json",
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

function ledger() {
  return env.GENERATION_LEDGER.getByName("launchloom-generations");
}

describe("generation tracking ingestion", () => {
  it("rejects missing and incorrect credentials", async () => {
    const missing = await SELF.fetch(`${apiBase}/api/internal/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    expect(missing.status).toBe(401);
    const wrong = await track(
      { action: "start", generation: { generationId: "issue:500" } },
      { token: "wrong-secret" },
    );
    expect(wrong.status).toBe(401);
  });

  it("rejects malformed generation and event fields", async () => {
    const noId = await track({ action: "start", generation: {} });
    expect(noId.status).toBe(400);
    const badStatus = await track({
      action: "start",
      generation: { generationId: "issue:501", status: "made-up" },
    });
    expect(badStatus.status).toBe(400);
    const badEmail = await track({
      action: "start",
      generation: { generationId: "issue:501", clientEmail: "not-an-email" },
    });
    expect(badEmail.status).toBe(400);
    const badCost = await track({
      action: "event",
      generationId: "issue:501",
      events: [
        { eventKey: "cost:x", stage: "images", status: "recorded", costUsd: -4 },
      ],
    });
    expect(badCost.status).toBe(400);
    const badUrl = await track({
      action: "start",
      generation: { generationId: "issue:501", previewUrl: "javascript:alert(1)" },
    });
    expect(badUrl.status).toBe(400);
  });

  it("records start, events and completion for a generation", async () => {
    const generationId = `submission-${crypto.randomUUID()}`;
    const started = await track({
      action: "start",
      generation: {
        generationId,
        submissionId: generationId,
        issueNumber: 640,
        businessName: "Cedar & Stone",
        slug: "cedar-and-stone",
        siteId: "launchloom-640-cedar-and-stone",
        repo: "WrazyAI/launchloom-640-cedar-and-stone",
        clientEmail: "owner@example.test",
        startedAt: Date.now(),
      },
    });
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      ok: true,
      created: true,
    });

    const eventResponse = await track({
      action: "event",
      generationId,
      events: [
        {
          eventKey: "cost:seo_research",
          stage: "seo_research",
          status: "recorded",
          provider: "dataforseo",
          costUsd: 0.12136,
          costKind: "actual",
          detail: { mode: "researched", tasks: 2 },
        },
      ],
    });
    expect(eventResponse.status).toBe(200);

    const completeResponse = await track({
      action: "complete",
      generationId,
      generation: {
        status: "preview_ready",
        previewUrl: "https://review-initial.launchloom-640-cedar-and-stone.pages.dev",
        reviewPr: 12,
        reviewedSha: "b".repeat(40),
      },
      events: [
        {
          eventKey: "cost:authoring",
          stage: "authoring",
          status: "recorded",
          provider: "openrouter",
          model: "openai/gpt-6-luna",
          costUsd: 2.4,
          costKind: "actual",
        },
      ],
    });
    expect(completeResponse.status).toBe(200);

    const stored = await ledger().get(generationId);
    expect(stored?.generation).toMatchObject({
      status: "preview_ready",
      businessName: "Cedar & Stone",
      reviewPr: 12,
    });
    expect(stored?.generation.completedAt).toBeGreaterThan(0);
    expect(stored?.events).toHaveLength(2);

    const [summary] = await ledger().list();
    expect(summary).toMatchObject({
      generationId,
      totalCostUsd: 2.52136,
      actualCostUsd: 2.52136,
      eventCount: 2,
    });
  });

  it("rejects oversized payloads", async () => {
    const response = await track(
      { action: "event", generationId: "issue:503" },
      { raw: `{"action":"event","padding":"${"x".repeat(520_000)}"}` },
    );
    expect(response.status).toBe(413);
  });

  it("stores a bounded hero thumbnail and rejects unsupported types", async () => {
    const generationId = `submission-${crypto.randomUUID()}`;
    await track({
      action: "start",
      generation: { generationId, status: "preview_ready" },
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const uploaded = await SELF.fetch(
      `${apiBase}/api/internal/generations/hero?id=${generationId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "image/png",
        },
        body: png,
      },
    );
    expect(uploaded.status).toBe(200);
    const hero = await ledger().getHero(generationId);
    expect(hero?.contentType).toBe("image/png");
    expect(hero?.bytes.byteLength).toBe(png.byteLength);

    const wrongType = await SELF.fetch(
      `${apiBase}/api/internal/generations/hero?id=${generationId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "text/plain",
        },
        body: "nope",
      },
    );
    expect(wrongType.status).toBe(415);

    const noAuth = await SELF.fetch(
      `${apiBase}/api/internal/generations/hero?id=${generationId}`,
      { method: "POST", headers: { "Content-Type": "image/png" }, body: png },
    );
    expect(noAuth.status).toBe(401);
  });
});
