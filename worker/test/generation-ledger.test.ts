import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type {
  GenerationEventInput,
  GenerationRecordInput,
} from "../src/generation-ledger";

function generation(
  overrides: Partial<GenerationRecordInput> = {},
): GenerationRecordInput {
  return {
    generationId: `submission-${crypto.randomUUID()}`,
    submissionId: `submission-${crypto.randomUUID()}`,
    issueNumber: 321,
    businessName: "Northwind Plumbing",
    slug: "northwind-plumbing",
    siteId: "launchloom-321-northwind-plumbing",
    repo: "WrazyAI/launchloom-321-northwind-plumbing",
    clientEmail: "owner@example.test",
    status: "generating",
    startedAt: Date.now(),
    ...overrides,
  };
}

function event(
  eventKey: string,
  overrides: Partial<GenerationEventInput> = {},
): GenerationEventInput {
  return {
    eventKey,
    stage: "seo_research",
    status: "recorded",
    provider: "dataforseo",
    costUsd: 0.12,
    costKind: "actual",
    detail: JSON.stringify({ tasks: 3 }),
    ...overrides,
  };
}

describe("GenerationLedger", () => {
  it("upserts a generation and merges later workflow fields", async () => {
    const ledger = env.GENERATION_LEDGER.getByName(
      `ledger-upsert-${crypto.randomUUID()}`,
    );
    const input = generation();
    await ledger.upsertGeneration(input);
    const created = await ledger.get(input.generationId);
    expect(created?.generation).toMatchObject({
      generationId: input.generationId,
      businessName: "Northwind Plumbing",
      clientEmail: "owner@example.test",
      status: "generating",
      previewUrl: null,
    });

    await ledger.upsertGeneration({
      generationId: input.generationId,
      status: "preview_ready",
      previewUrl: "https://review-initial.example.pages.dev",
      reviewPr: 4,
      reviewedSha: "a".repeat(40),
      repairSessionId: "repair-session-abcdef",
    });
    const updated = await ledger.get(input.generationId);
    expect(updated?.generation).toMatchObject({
      businessName: "Northwind Plumbing",
      status: "preview_ready",
      previewUrl: "https://review-initial.example.pages.dev",
      reviewPr: 4,
      reviewedSha: "a".repeat(40),
      repairSessionId: "repair-session-abcdef",
    });
  });

  it("keeps cost events idempotent and rolls them up per stage", async () => {
    const ledger = env.GENERATION_LEDGER.getByName(
      `ledger-events-${crypto.randomUUID()}`,
    );
    const input = generation();
    await ledger.upsertGeneration(input);
    await ledger.recordEvents(input.generationId, [
      event("cost:seo_research"),
      event("cost:authoring", {
        stage: "authoring",
        provider: "openrouter",
        costUsd: 1.5,
        costKind: "actual",
      }),
      event("cost:images", {
        stage: "images",
        provider: "fal.ai",
        costUsd: 0.09,
        costKind: "estimated",
      }),
    ]);
    // A retried workflow replays the same keys with the final amounts.
    await ledger.recordEvents(input.generationId, [
      event("cost:seo_research", { costUsd: 0.2 }),
    ]);
    const summaries = await ledger.list();
    const summary = summaries.find(
      (item) => item.generationId === input.generationId,
    );
    expect(summary).toMatchObject({
      totalCostUsd: 1.79,
      actualCostUsd: 1.7,
      estimatedCostUsd: 0.09,
      eventCount: 3,
    });
    const seo = summary?.stages.find((stage) => stage.stage === "seo_research");
    expect(seo).toMatchObject({
      costUsd: 0.2,
      actualCount: 1,
      eventCount: 1,
    });
    const images = summary?.stages.find((stage) => stage.stage === "images");
    expect(images).toMatchObject({ costUsd: 0.09, estimatedCount: 1 });
  });

  it("reports unpriced stages as unreported instead of a zero cost", async () => {
    const ledger = env.GENERATION_LEDGER.getByName(
      `ledger-unreported-${crypto.randomUUID()}`,
    );
    const input = generation();
    await ledger.upsertGeneration(input);
    await ledger.recordEvents(input.generationId, [
      event("cost:images", {
        stage: "images",
        provider: "fal.ai",
        costUsd: null,
        costKind: "unreported",
      }),
    ]);
    const [summary] = await ledger.list();
    expect(summary).toMatchObject({
      totalCostUsd: 0,
      unreportedCount: 1,
    });
    expect(summary.stages[0]).toMatchObject({
      stage: "images",
      costUsd: 0,
      unreportedCount: 1,
    });
  });

  it("stores and serves a bounded hero preview", async () => {
    const ledger = env.GENERATION_LEDGER.getByName(
      `ledger-hero-${crypto.randomUUID()}`,
    );
    const input = generation();
    await ledger.upsertGeneration(input);
    const bytes = new TextEncoder().encode("fake-webp-bytes").buffer as ArrayBuffer;
    await ledger.storeHero(input.generationId, "image/webp", bytes);
    const hero = await ledger.getHero(input.generationId);
    expect(hero?.contentType).toBe("image/webp");
    expect(new TextDecoder().decode(hero?.bytes)).toBe("fake-webp-bytes");
    const detail = await ledger.get(input.generationId);
    expect(detail?.generation.heroUpdatedAt).toBeGreaterThan(0);
  });

  it("returns null for an unknown generation", async () => {
    const ledger = env.GENERATION_LEDGER.getByName(
      `ledger-missing-${crypto.randomUUID()}`,
    );
    await expect(ledger.get("issue:999999")).resolves.toBeNull();
    await expect(ledger.getHero("issue:999999")).resolves.toBeNull();
  });
});
