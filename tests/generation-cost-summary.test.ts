import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readGenerationCostInputs,
  summarizeGenerationCosts,
} from "../scripts/generation-cost-summary.mjs";
import { buildGenerationTrackingPayload } from "../scripts/record-generation-event.mjs";

describe("generation cost summary", () => {
  it("includes query-planner cost and cache telemetry in measured SEO spend", () => {
    const summary = summarizeGenerationCosts({
      seoResearch: {
        mode: "researched",
        publishReady: true,
        cost: { usd: 0.1, tasks: 3, complete: true, unreportedTasks: 0 },
        fallbackSearch: {
          status: "not-needed",
          costUsd: 0,
          costComplete: true,
        },
        intentPlanning: {
          attempted: true,
          status: "model",
          model: "z-ai/glm-5.3-flash",
          acceptedPhraseCount: 4,
          usage: {
            costUsd: 0.002,
            promptTokens: 100,
            completionTokens: 30,
            cachedTokens: 20,
            cacheStatus: "HIT",
          },
        },
        validatedQueries: [],
      },
    });

    expect(summary.stages[0]).toMatchObject({
      stage: "seo_research",
      provider: "dataforseo+openrouter",
      costUsd: 0.102,
      costKind: "actual",
      complete: true,
      detail: {
        queryPlannerModel: "z-ai/glm-5.3-flash",
        queryPlannerCostUsd: 0.002,
        queryPlannerPromptTokens: 100,
        queryPlannerCompletionTokens: 30,
        queryPlannerCachedTokens: 20,
        queryPlannerCacheStatus: "HIT",
      },
    });
  });

  it("marks SEO stage spend incomplete when query-planner cost is unreported", () => {
    const summary = summarizeGenerationCosts({
      seoResearch: {
        cost: { usd: 0.1, tasks: 3, complete: true, unreportedTasks: 0 },
        fallbackSearch: {
          status: "not-needed",
          costUsd: 0,
          costComplete: true,
        },
        intentPlanning: {
          attempted: true,
          status: "model",
          usage: { costUsd: null },
        },
      },
    });

    expect(summary.stages[0]).toMatchObject({
      stage: "seo_research",
      complete: false,
      costUsd: 0.1,
    });
  });

  it("summarizes provider-reported and estimated stage costs", () => {
    const summary = summarizeGenerationCosts(
      {
        seoResearch: {
          mode: "researched",
          publishReady: true,
          cost: {
            usd: 0.12136,
            tasks: 3,
            complete: false,
            unreportedTasks: 1,
          },
          fallbackSearch: {
            costUsd: 0.01617,
            costComplete: true,
            status: "complete",
            queriesAttempted: 3,
          },
          validatedQueries: [{ keyword: "plumber" }],
        },
        siteConfigUsage: {
          records: [
            {
              label: "site-copy",
              model: "openai/gpt-6-luna",
              usage: {
                cost: 0.084,
                prompt_tokens: 1000,
                completion_tokens: 200,
              },
            },
          ],
        },
        referenceDnaUsage: {
          records: [
            {
              label: "reference-dna",
              model: "openai/gpt-6-luna",
              usage: { cost: 0.031 },
            },
          ],
        },
        preflight: {
          mode: "shadow",
          reasoningEffort: "xhigh",
          usage: {
            costUsd: 0.05,
            estimatedCostUsd: 0.05,
            costSource: "estimated",
            inputTokens: 900,
          },
        },
        generatedAssets: {
          provider: "fal.ai",
          model: "fal-ai/minimax/image-01",
          placements: [
            { placement: "hero" },
            { placement: "secondary" },
            { placement: "tertiary" },
          ],
          skipped: [],
        },
        creativeRun: {
          status: "authored",
          model: "openai/gpt-6-luna",
          cacheSummary: { cost: 1.94, responseCount: 9, cacheHitPercent: 40 },
          usage: [{ usage: { cost: 1.94 } }],
          candidates: [{}, {}],
        },
        repair: {
          usage: [
            {
              label: "creative-repair",
              model: "openai/gpt-6-luna",
              usage: { cost: 0.2 },
            },
          ],
          visualGateFiles: [
            {
              name: "final/visual-gate.json",
              report: { usage: { cost: 0.1 }, cache: { cost: 0.1 } },
            },
          ],
          rounds: 2,
        },
      },
      { falImageUsdPerImage: 0.03 },
    );
    const stages = Object.fromEntries(
      summary.stages.map((stage) => [stage.stage, stage]),
    );
    expect(stages.seo_research).toMatchObject({
      costUsd: 0.13753,
      costKind: "actual",
      complete: false,
    });
    expect(stages.site_config).toMatchObject({
      costUsd: 0.084,
      costKind: "actual",
    });
    expect(stages.reference_dna).toMatchObject({
      costUsd: 0.031,
      costKind: "actual",
    });
    expect(stages.reasoning_preflight).toMatchObject({
      costUsd: 0.05,
      costKind: "estimated",
    });
    expect(stages.images).toMatchObject({
      costUsd: 0.09,
      costKind: "estimated",
      complete: true,
    });
    expect(stages.authoring).toMatchObject({
      costUsd: 1.94,
      costKind: "actual",
    });
    expect(stages.repair_qa).toMatchObject({
      costUsd: 0.3,
      costKind: "actual",
    });
    expect(summary.incomplete).toBe(true);
    expect(summary.totalUsd).toBeCloseTo(2.63253, 5);
    expect(summary.actualUsd).toBeCloseTo(2.49253, 5);
    expect(summary.estimatedUsd).toBeCloseTo(0.14, 5);
    expect(
      summary.events.map((event: { eventKey: string }) => event.eventKey),
    ).toEqual([
      "cost:seo_research",
      "cost:site_config",
      "cost:reference_dna",
      "cost:reasoning_preflight",
      "cost:images",
      "cost:authoring",
      "cost:repair_qa",
    ]);
  });

  it("marks unpriced stages as unreported instead of zero", () => {
    const summary = summarizeGenerationCosts(
      {
        generatedAssets: {
          provider: "fal.ai",
          model: "fal-ai/minimax/image-01",
          placements: [{ placement: "hero" }],
        },
        runner: { minutes: 52, usdPerMinute: null },
      },
      { falImageUsdPerImage: null },
    );
    const stages = Object.fromEntries(
      summary.stages.map((stage) => [stage.stage, stage]),
    );
    expect(stages.images).toMatchObject({
      costUsd: null,
      costKind: "unreported",
      complete: false,
    });
    expect(stages.runner).toMatchObject({
      costUsd: null,
      costKind: "unreported",
    });
    expect(summary.totalUsd).toBe(0);
    expect(summary.incomplete).toBe(true);
    expect(
      summary.events.every(
        (event: { costUsd: number | null }) => event.costUsd === null,
      ),
    ).toBe(true);
  });

  it("omits stages with no activity", () => {
    const summary = summarizeGenerationCosts({}, {});
    expect(summary.stages).toEqual([]);
    expect(summary.totalUsd).toBe(0);
    expect(summary.incomplete).toBe(false);
  });

  it("reads repair and visual gate evidence from disk", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    await fs.mkdir(path.join(root, "round-01"), { recursive: true });
    await fs.writeFile(
      path.join(root, "repair-usage.json"),
      JSON.stringify({
        version: 1,
        model: "openai/gpt-6-luna",
        records: [{ usage: { cost: 0.4 } }],
      }),
    );
    await fs.writeFile(
      path.join(root, "round-01", "visual-gate.json"),
      JSON.stringify({ usage: { cost: 0.05 }, cache: { cost: 0.05 } }),
    );
    await fs.writeFile(
      path.join(root, "summary.json"),
      JSON.stringify({ repairCycles: { "candidate-a": 1 } }),
    );
    const input = await readGenerationCostInputs({ repairDir: root });
    const summary = summarizeGenerationCosts(input);
    expect(summary.stages).toHaveLength(1);
    expect(summary.stages[0]).toMatchObject({
      stage: "repair_qa",
      costUsd: 0.45,
      costKind: "actual",
    });
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe("generation tracking payload", () => {
  it("derives a stable issue id and sends only populated fields", () => {
    const payload = buildGenerationTrackingPayload({
      "submission-id": "abc123def456ghi789",
      issue: "640",
      business: "Cedar & Stone",
      site: "launchloom-640-cedar-and-stone",
      repo: "WrazyAI/launchloom-640-cedar-and-stone",
      status: "preview_ready",
      "preview-url": "https://review-initial.example.pages.dev",
      pr: "12",
      action: "complete",
    });
    expect(payload.generationId).toBe("issue:640");
    expect(payload.action).toBe("complete");
    expect(payload.generation).toMatchObject({
      generationId: "issue:640",
      submissionId: "abc123def456ghi789",
      issueNumber: 640,
      businessName: "Cedar & Stone",
      reviewPr: 12,
      status: "preview_ready",
    });
    expect(payload.generation).not.toHaveProperty("clientEmail");
    expect(payload.generation).not.toHaveProperty("failureReason");
  });

  it("falls back to an issue id for manual runs", () => {
    const payload = buildGenerationTrackingPayload({
      issue: "701",
      action: "start",
    });
    expect(payload.generationId).toBe("issue:701");
  });

  it("falls back to the submission id when no issue is known", () => {
    const payload = buildGenerationTrackingPayload({
      "submission-id": "abc123def456ghi789",
      action: "start",
    });
    expect(payload.generationId).toBe("abc123def456ghi789");
  });

  it("rejects a payload without an identity", () => {
    expect(() => buildGenerationTrackingPayload({ action: "start" })).toThrow(
      /generation id/iu,
    );
  });
});
