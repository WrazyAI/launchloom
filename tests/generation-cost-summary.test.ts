import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readGenerationCostInputs,
  summarizeGenerationCosts,
} from "../scripts/generation-cost-summary.mjs";
import { buildGenerationTrackingPayload } from "../scripts/record-generation-event.mjs";

function visualGateReport(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    mode: "verify",
    status: "ok",
    model: "openai/gpt-6-luna",
    durationMs: 1200,
    changed: false,
    appliedOperations: [],
    blockers: [],
    audit: { verdict: "pass", findings: [], operations: [] },
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.05 },
    cache: { cost: 0.05 },
    responseCache: null,
    sessionId: "launchloom:visual-quality-gate:round-gate",
    provider: "openai",
    attempt: 1,
    ...overrides,
  };
}

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

  it("counts rejected FAL attempts and visual-review inference separately", () => {
    const summary = summarizeGenerationCosts(
      {
        generatedAssets: {
          provider: "fal.ai",
          model: "fal-ai/minimax/image-01",
          generationRequests: 2,
          placements: [],
          skipped: [
            {
              placement: "hero",
              reason: "image-review-rejected",
              imageReviews: [
                {
                  status: "rejected",
                  model: "z-ai/glm-5.3-flash",
                  usage: {
                    prompt_tokens: 120,
                    completion_tokens: 20,
                    total_tokens: 140,
                    cost: 0.001,
                  },
                },
                {
                  status: "rejected",
                  model: "z-ai/glm-5.3-flash",
                  usage: {
                    prompt_tokens: 120,
                    completion_tokens: 20,
                    total_tokens: 140,
                    cost: 0.001,
                  },
                },
              ],
            },
          ],
        },
      },
      { falImageUsdPerImage: 0.08 },
    );
    const stages = Object.fromEntries(
      summary.stages.map((stage) => [stage.stage, stage]),
    );

    expect(stages.images).toMatchObject({
      costUsd: 0.16,
      costKind: "estimated",
      detail: { requests: 2, acceptedImages: 0 },
    });
    expect(stages.image_review).toMatchObject({
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
      costUsd: 0.002,
      costKind: "actual",
      detail: { calls: 2, rejected: 2, promptTokens: 240 },
    });
  });

  it("does not count reused placements as current image review spend", () => {
    const summary = summarizeGenerationCosts({
      generatedAssets: {
        provider: "fal.ai",
        model: "fal-ai/minimax/image-01",
        generationRequests: 0,
        placements: [
          {
            placement: "hero",
            reused: true,
            imageReview: {
              status: "approved",
              model: "z-ai/glm-5.3-flash",
              usage: { prompt_tokens: 400, completion_tokens: 30, cost: 0.001 },
            },
          },
        ],
        skipped: [],
      },
    });

    expect(summary.stages.some((stage) => stage.stage === "image_review")).toBe(
      false,
    );
    expect(summary.actualUsd).toBe(0);
  });

  it("omits stages with no activity", () => {
    const summary = summarizeGenerationCosts({}, {});
    expect(summary.stages).toEqual([]);
    expect(summary.totalUsd).toBe(0);
    expect(summary.incomplete).toBe(false);
  });

  it("counts a copied final gate report once instead of twice", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    const report = visualGateReport();
    await fs.mkdir(path.join(root, "round-01"), { recursive: true });
    await fs.mkdir(path.join(root, "final"), { recursive: true });
    await fs.writeFile(
      path.join(root, "round-01", "visual-gate.json"),
      JSON.stringify(report, null, 2),
    );
    // The producer copies the round report byte for byte into final evidence.
    await fs.copyFile(
      path.join(root, "round-01", "visual-gate.json"),
      path.join(root, "final", "visual-gate.json"),
    );
    await fs.writeFile(
      path.join(root, "repair-usage.json"),
      JSON.stringify({
        version: 1,
        model: "openai/gpt-6-luna",
        records: [{ usage: { cost: 0.4 } }],
      }),
    );

    const input = await readGenerationCostInputs({ repairDir: root });
    const summary = summarizeGenerationCosts(input);
    const repair = summary.stages.find(
      (stage: any) => stage.stage === "repair_qa",
    );
    expect(input.repair.visualGateFiles).toHaveLength(1);
    expect(repair).toMatchObject({
      costUsd: 0.45,
      costKind: "actual",
      complete: true,
      detail: { calls: 2, pricedCalls: 2, unpricedCalls: 0 },
    });
    expect(repair?.detail.sources).toEqual(["round-01/visual-gate.json"]);
    expect(summary.totalUsd).toBe(0.45);
    expect(summary.exact.stages.repair_qa).toMatchObject({
      amountUsd: "0.45",
      costKind: "actual",
      coverageComplete: true,
    });
    await fs.rm(root, { recursive: true, force: true });
  });

  it("counts the same evidence file once when two roots reach it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    const evidence = path.join(root, "creative-repair");
    await fs.mkdir(path.join(evidence, "round-01"), { recursive: true });
    await fs.writeFile(
      path.join(evidence, "round-01", "visual-gate.json"),
      JSON.stringify(visualGateReport()),
    );

    // Broad revision roots and the repair root can both discover one file.
    const input = await readGenerationCostInputs({
      repairDir: evidence,
      revisionDir: root,
    });
    const summary = summarizeGenerationCosts(input);
    expect(
      input.repair.visualGateFiles.map((file: any) => file.name),
    ).toHaveLength(1);
    expect(
      summary.stages.find((stage: any) => stage.stage === "repair_qa"),
    ).toMatchObject({ costUsd: 0.05, complete: true, detail: { calls: 1 } });
    await fs.rm(root, { recursive: true, force: true });
  });

  it("recognizes a final copy written with a different key order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    const report = visualGateReport();
    const reordered = Object.fromEntries(Object.entries(report).reverse());
    await fs.mkdir(path.join(root, "round-01"), { recursive: true });
    await fs.mkdir(path.join(root, "final"), { recursive: true });
    await fs.writeFile(
      path.join(root, "round-01", "visual-gate.json"),
      JSON.stringify(report, null, 2),
    );
    await fs.writeFile(
      path.join(root, "final", "visual-gate.json"),
      JSON.stringify(reordered),
    );

    const summary = summarizeGenerationCosts(
      await readGenerationCostInputs({ repairDir: root }),
    );
    expect(
      summary.stages.find((stage: any) => stage.stage === "repair_qa"),
    ).toMatchObject({ costUsd: 0.05, complete: true, detail: { calls: 1 } });
    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps identical-looking gate calls from separate rounds", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    const report = visualGateReport();
    for (const round of ["round-01", "round-02"]) {
      await fs.mkdir(path.join(root, round), { recursive: true });
      // Two paid gate invocations can report the same amount and, in a
      // synthetic run, even the same bytes. They are still separate calls.
      await fs.writeFile(
        path.join(root, round, "visual-gate.json"),
        JSON.stringify(report),
      );
    }

    const summary = summarizeGenerationCosts(
      await readGenerationCostInputs({ repairDir: root }),
    );
    expect(
      summary.stages.find((stage: any) => stage.stage === "repair_qa"),
    ).toMatchObject({ costUsd: 0.1, complete: true, detail: { calls: 2 } });
    expect(summary.exact.stages.repair_qa).toMatchObject({
      amountUsd: "0.1",
      coverageComplete: true,
    });
    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps an unreported gate call unreported after removing its copy", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    const report = visualGateReport({
      usage: { prompt_tokens: 100 },
      cache: {},
    });
    await fs.mkdir(path.join(root, "round-01"), { recursive: true });
    await fs.mkdir(path.join(root, "final"), { recursive: true });
    await fs.writeFile(
      path.join(root, "round-01", "visual-gate.json"),
      JSON.stringify(report),
    );
    await fs.copyFile(
      path.join(root, "round-01", "visual-gate.json"),
      path.join(root, "final", "visual-gate.json"),
    );

    const summary = summarizeGenerationCosts(
      await readGenerationCostInputs({ repairDir: root }),
    );
    expect(
      summary.stages.find((stage: any) => stage.stage === "repair_qa"),
    ).toMatchObject({
      costUsd: null,
      costKind: "unreported",
      complete: false,
      detail: { calls: 1, unpricedCalls: 1 },
    });
    expect(summary.exact.stages.repair_qa).toMatchObject({
      amountUsd: null,
      costKind: "unreported",
      coverageComplete: false,
    });
    expect(summary.incomplete).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps the paid round report when its copied final report is malformed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-cost-"));
    await fs.mkdir(path.join(root, "round-01"), { recursive: true });
    await fs.mkdir(path.join(root, "final"), { recursive: true });
    await fs.writeFile(
      path.join(root, "round-01", "visual-gate.json"),
      JSON.stringify(visualGateReport()),
    );
    await fs.writeFile(
      path.join(root, "final", "visual-gate.json"),
      '{"usage": {"cost": 0.05',
    );

    const input = await readGenerationCostInputs(
      { repairDir: root },
      { bounded: true, partial: true },
    );
    const summary = summarizeGenerationCosts(input);
    expect(
      summary.stages.find((stage: any) => stage.stage === "repair_qa"),
    ).toMatchObject({ costUsd: 0.05, complete: true, detail: { calls: 1 } });
    // The unreadable copy is still unknown evidence, not a silent zero.
    expect(input.collectionIncomplete).toBe(true);
    expect(
      summary.stages.find((stage: any) => stage.stage === "usage_collection"),
    ).toMatchObject({ costKind: "unreported", complete: false });
    await fs.rm(root, { recursive: true, force: true });
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
