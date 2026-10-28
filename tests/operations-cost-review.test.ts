import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import {
  summarizeGenerationCosts,
  readGenerationCostInputs,
} from "../scripts/generation-cost-summary.mjs";
import { buildOperationsCostEvents } from "../scripts/record-generation-event.mjs";
import { buildAttemptEvents } from "../scripts/generation-tracking-contract.mjs";
import { runOperationsClient } from "../scripts/operations-client.mjs";

const attempt = "11111111-1111-4111-8111-111111111111";
describe("review: production cost evidence", () => {
  it("keeps incomplete coverage distinct from a known actual subtotal", () => {
    const summary = summarizeGenerationCosts({
      siteConfigUsage: {
        records: [{ usage: { cost: "0.10000001" } }, { usage: {} }],
      },
    });
    const [event] = buildOperationsCostEvents(attempt, summary);
    expect(event.costKind).toBe("actual");
    expect(event.amount).toBe("0.10000001");
    expect(event.coverageComplete).toBe(false);
    expect(summary.events[0].status).toBe("recorded-incomplete");
  });
  it("never promotes contradictory or unknown coverage into complete coverage", () => {
    for (const source of [
      { status: "recorded-incomplete", detail: { complete: true } },
      { status: "recorded", detail: { complete: false } },
      {},
    ]) {
      const [event] = buildOperationsCostEvents(attempt, {
        events: [
          { stage: "authoring", costKind: "actual", costUsd: 0.1, ...source },
        ],
      });
      expect(event.coverageComplete).toBe(false);
    }
  });
  it("aggregates exact decimals through the actual summary-to-converter path, without changing legacy numeric output", () => {
    const summary = summarizeGenerationCosts({
      siteConfigUsage: {
        records: [
          { usage: { cost: "0.10000001" } },
          { usage: { cost: "0.20000002" } },
        ],
      },
      creativeRun: {
        usage: [{ cost: "0.100000000000000001" }, { cost: "0.2" }],
      },
    });
    const events = buildOperationsCostEvents(attempt, summary);
    expect(events.find((event) => event.stage === "site_config")?.amount).toBe(
      "0.30000003",
    );
    expect(events.find((event) => event.stage === "authoring")?.amount).toBe(
      "0.300000000000000001",
    );
    expect(typeof summary.actualUsd).toBe("number");
    expect(summary.stages[0].costUsd).toBe(0.3); // retained legacy six-place field
    expect(summary.exact.actualUsd).toBe("0.600000030000000001");
  });
  it("preserves JSON numeric monetary lexemes before arithmetic and covers every production source", async () => {
    const dir = await mkdtemp("/tmp/opencode/task5-exact-");
    try {
      await writeFile(
        `${dir}/usage.json`,
        '{"records":[{"usage":{"cost":0.100000000000000001}},{"usage":{"cost":2e-8}}]}',
      );
      const input = await readGenerationCostInputs(
        { siteConfigUsage: `${dir}/usage.json` },
        { exactDecimals: true },
      );
      const summary = summarizeGenerationCosts(
        {
          ...input,
          seoResearch: {
            cost: { usd: "0.10000001" },
            fallbackSearch: { costUsd: "0.20000002" },
          },
          preflight: { usage: { costUsd: "0.10000001" } },
          generatedAssets: {
            generationRequests: 3,
            placements: [],
            skipped: [
              {
                imageReviews: [
                  { usage: { cost: "0.10000001" } },
                  { usage: {} },
                ],
              },
            ],
          },
          repair: { usage: [{ cost: "0.10000001" }, { cost: "0.20000002" }] },
          runner: { minutes: "0.5", usdPerMinute: "0.10000001" },
        },
        { falImageUsdPerImage: "0.10000001" },
      );
      const events = buildOperationsCostEvents(attempt, summary);
      const amount = (stage: string) =>
        events.find((event) => event.stage === stage)?.amount;
      expect(amount("site_config")).toBe("0.100000020000000001");
      expect(amount("seo_research")).toBe("0.30000003");
      expect(amount("reasoning_preflight")).toBe("0.10000001");
      expect(amount("images")).toBe("0.30000003");
      expect(amount("image_review")).toBe("0.10000001");
      expect(
        events.find((event) => event.stage === "image_review")
          ?.coverageComplete,
      ).toBe(false);
      expect(amount("repair_qa")).toBe("0.30000003");
      expect(amount("runner")).toBe("0.050000005");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("prefers provider per-call decimals over rounded cache totals for authoring and rendered QA", () => {
    const summary = summarizeGenerationCosts({
      creativeRun: {
        cacheSummary: { cost: 0.3 },
        usage: [{ usage: { cost: "0.30000003" } }],
      },
      repair: {
        visualGateFiles: [
          {
            name: "visual-gate.json",
            report: { cache: { cost: 0.3 }, usage: { cost: "0.30000003" } },
          },
        ],
      },
    });
    expect(
      buildOperationsCostEvents(attempt, summary).map((event) => event.amount),
    ).toEqual(["0.30000003", "0.30000003"]);
  });
  it("keeps legacy numeric events accepted by the unchanged strict legacy producer", () => {
    const summary = summarizeGenerationCosts({
      siteConfigUsage: { records: [{ usage: { cost: "0.10000001" } }] },
    });
    expect(() =>
      buildAttemptEvents(summary.events, {
        source: "workflow",
        observedAt: Date.now(),
      }),
    ).not.toThrow();
    expect(summary.events[0].costUsd).toBe(0.1);
    expect(buildOperationsCostEvents(attempt, summary)[0].amount).toBe(
      "0.10000001",
    );
  });
  it("manual operations event CLI preserves decimal text and explicit incomplete coverage", async () => {
    let saved: any;
    const exit = await runOperationsClient(
      [
        "event",
        "--api",
        "https://worker.test",
        "--attempt",
        attempt,
        "--event-key",
        `${attempt}:cost:authoring:1`,
        "--stage",
        "authoring",
        "--transition",
        "observed",
        "--cost-kind",
        "actual",
        "--amount",
        "0.100000000000000001",
        "--currency",
        "USD",
        "--coverage-complete",
        "false",
      ],
      {
        token: "token",
        stdout: () => {},
        fetchImpl: async (_url, init) => {
          saved = JSON.parse(String(init?.body));
          return Response.json({ status: "inserted" });
        },
      },
    );
    expect(exit).toBe(0);
    expect(saved).toMatchObject({
      amount: "0.100000000000000001",
      coverageComplete: false,
    });
  });
});
