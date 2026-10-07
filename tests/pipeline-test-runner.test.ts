import { describe, expect, it } from "vitest";
import {
  runPipelineTest,
  sendPipelineTestNotification,
  focusedSeoReadiness,
  currentRunCostInputs,
  assertPipelineTestFacts,
  assertCompatibleTestAssets,
} from "../scripts/run-pipeline-test.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";
import { summarizeGenerationCosts } from "../scripts/generation-cost-summary.mjs";

const input = {
  profile: "seo-only",
  issue: "152",
  sourceSha: "a".repeat(40),
  runId: "123-1",
};
function adapter(fail = "") {
  const calls: string[] = [];
  const dependencies = Object.fromEntries(
    [
      "prepare",
      "research",
      "configure",
      "reuse",
      "author",
      "creative",
      "select",
      "technical",
      "seo",
      "deploy",
      "notify",
      "persist",
    ].map((stage) => [
      stage,
      async () => {
        calls.push(stage);
        if (stage === fail) throw new Error(`${stage} failed`);
        if (stage === "reuse") return { reused: true };
        if (stage === "deploy") return { url: "https://qa.pages.dev" };
        return {};
      },
    ]),
  );
  return { calls, dependencies };
}
describe("focused pipeline orchestration", () => {
  it("rejects contradictory business facts before either lane can deliver", () => {
    expect(() => assertPipelineTestFacts({ factReadiness: { version: 1, launchReady: false } })).toThrow(/facts/i);
    expect(() => assertPipelineTestFacts({})).not.toThrow();
  });
  it("rejects reuse when a client asset has been removed or replaced", async () => {
    await expect(assertCompatibleTestAssets({ assets: {} }, { assets: { photoOne: "/images/client/old.webp" } }, {}, "/unused")).rejects.toThrow(/assets/i);
    await expect(assertCompatibleTestAssets({ assets: { photoOne: "/images/new.webp" } }, { assets: { photoOne: "/images/old.webp" } }, {}, "/unused")).rejects.toThrow(/assets/i);
  });
  it("rejects generated reuse without image checksum provenance", async () => {
    await expect(assertCompatibleTestAssets({ assets: {} }, { assets: {}, creativeAssets: { "route-01": { hero: "/images/generated/old.webp" } } }, { placements: [] }, "/unused")).rejects.toThrow(/provenance/i);
    await expect(assertCompatibleTestAssets({ assets: {} }, { assets: {}, creativeAssets: {} }, { placements: [] }, "/unused")).resolves.toBeUndefined();
  });
  it("does not bill reused historical authoring as a current provider call", () => {
    const costs = { creativeRun: { cacheSummary: { cost: 9 }, model: "previous-author" } };
    const reused = { stages: { author: { status: "not_run" } } };
    expect(summarizeGenerationCosts(currentRunCostInputs(costs, reused)).actualUsd).toBe(0);
    expect(summarizeGenerationCosts(currentRunCostInputs(costs, { stages: { author: { status: "failed" } } })).actualUsd).toBe(9);
    expect(costs.creativeRun.cacheSummary.cost).toBe(9);
  });
  it("evaluates SEO evidence separately while keeping original test provenance blocked for release", () => {
    const config = { pipelineTest: { testOnly: true, profile: "seo-only" }, seoResearch: { version: 1, mode: "researched", publishReady: true } };
    expect(focusedSeoReadiness(config).allowed).toBe(true);
    expect(seoResearchReadiness(config).allowed).toBe(false);
    expect(config.pipelineTest.testOnly).toBe(true);
    expect(focusedSeoReadiness({ ...config, seoResearch: { version: 1, mode: "context-only", publishReady: false } }).allowed).toBe(false);
  });
  it("sends developer diagnostic verdict without client approval language or link", async () => {
    let payload: any;
    const report = {
      profile: "seo-only",
      verdict: "failed",
      previewUrl: "https://qa.pages.dev",
      sourceSha: "a".repeat(40),
      runId: "123-1",
      repository: "WrazyAI/llqa-152-seo-123-1",
      branch: "qa/seo-only/123-1",
      stages: { seo: { status: "failed" }, creative: { status: "not_run" } },
      costs: { totalUsd: 0.2, incomplete: true },
    };
    const receipt = await sendPipelineTestNotification({
      report,
      to: "developer@example.com",
      from: "sender@example.com",
      key: "test-key",
      send: async (_url: any, options: any) => {
        payload = JSON.parse(options.body);
        return new Response(JSON.stringify({ id: "mail-123" }), {
          status: 200,
        });
      },
    });
    expect(payload.to).toEqual(["developer@example.com"]);
    expect(payload.subject).toContain("failed");
    expect(payload.text).toContain("creative: not_run");
    expect(payload.text).toContain(
      "Source SHA: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(payload.text).not.toMatch(/approve|signed|client review/iu);
    expect(receipt.emailId).toBe("mail-123");
  });
  it("reuses SEO source and excludes aesthetic author/repair calls", async () => {
    const { calls, dependencies } = adapter();
    const report = await runPipelineTest(input, dependencies);
    expect(calls).toEqual([
      "prepare",
      "research",
      "configure",
      "reuse",
      "select",
      "technical",
      "seo",
      "deploy",
      "notify",
      "persist",
    ]);
    expect(report.stages.creative.status).toBe("not_run");
    expect(report.stages.author.status).toBe("not_run");
    expect(report.verdict).toBe("passed");
    expect(report.previewDelivered).toBe(true);
  });
  it("authors one source only when reuse is unavailable", async () => {
    const { calls, dependencies } = adapter();
    dependencies.reuse = async () => ({ reused: false });
    const report = await runPipelineTest(input, dependencies);
    expect(calls).toContain("author");
    expect(report.candidateCount).toBe(1);
    expect(calls).not.toContain("creative");
  });
  it("creative failure can deliver a diagnostic without claiming a pass", async () => {
    const { calls, dependencies } = adapter("creative");
    const report = await runPipelineTest(
      { ...input, profile: "creative-only" },
      dependencies,
    );
    expect(calls).not.toContain("research");
    expect(calls).not.toContain("seo");
    expect(calls).not.toContain("reuse");
    expect(report.candidateCount).toBe(3);
    expect(report.stages.creative.status).toBe("failed");
    expect(report.stages.research.status).toBe("not_run");
    expect(report.verdict).toBe("failed");
    expect(report.previewDelivered).toBe(true);
  });
  it("technical failure prevents deployment and notification", async () => {
    const { calls, dependencies } = adapter("technical");
    const report = await runPipelineTest(input, dependencies);
    expect(report.verdict).toBe("failed");
    expect(report.previewDelivered).toBe(false);
    expect(calls).not.toContain("deploy");
    expect(calls).not.toContain("notify");
    expect(calls.at(-1)).toBe("persist");
  });
  it("SEO failure remains failed even when a safe preview is delivered", async () => {
    const { dependencies } = adapter("seo");
    const report = await runPipelineTest(input, dependencies);
    expect(report.verdict).toBe("failed");
    expect(report.previewDelivered).toBe(true);
  });
  it("rejects nonmanual events before external work", async () => {
    const { calls, dependencies } = adapter();
    await expect(
      runPipelineTest(
        { ...input, eventName: "repository_dispatch" },
        dependencies,
      ),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
  it("preserves failure evidence when authoring fails without deploying", async () => {
    const { calls, dependencies } = adapter("author");
    dependencies.reuse = async () => ({ reused: false });
    const report = await runPipelineTest(input, dependencies);
    expect(report.stages.author.status).toBe("failed");
    expect(report.previewDelivered).toBe(false);
    expect(calls).not.toContain("deploy");
    expect(calls.at(-1)).toBe("persist");
  });
  it.each([
    { ...input, profile: "full" },
    { ...input, issue: "1; curl bad" },
    { ...input, runId: "../unsafe" },
    { ...input, sourceSha: "main" },
    { ...input, candidateRepository: "WrazyAI/launchloom-99-other" },
  ])(
    "rejects unsafe or unfocused input before side effects: %j",
    async (bad) => {
      const { calls, dependencies } = adapter();
      await expect(runPipelineTest(bad, dependencies)).rejects.toThrow();
      expect(calls).toEqual([]);
    },
  );
});
