import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  runPipelineTest,
  sendPipelineTestNotification,
  focusedSeoReadiness,
  currentRunCostInputs,
  currentRunCostSummary,
  assertPipelineTestFacts,
  assertTestPreviewIndexingPolicy,
  assertTestPreviewAccessPolicy,
  verifyTestPreviewAccess,
  resolveTestPreviewProject,
  assertCompatibleTestAssets,
  pagesDeploymentUrl,
  pushPipelineTestEvidence,
} from "../scripts/run-pipeline-test.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";
import { summarizeGenerationCosts } from "../scripts/generation-cost-summary.mjs";
import * as privatePreview from "../scripts/run-pipeline-test.mjs";

const input = {
  eventName: "workflow_dispatch",
  profile: "seo-only",
  issue: "152",
  sourceSha: "a".repeat(40),
  runId: "123-1",
};
async function makePrivateDiagnosticDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ll-private-diagnostic-"));
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<html><head><meta name="robots" content="noindex, nofollow"></head></html>',
  );
  await fs.writeFile(path.join(directory, "robots.txt"), "User-agent: *\nAllow: /\n");
  await fs.writeFile(
    path.join(directory, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
  );
  return directory;
}
function adapter(fail = "", authoredCandidateCount = 3) {
  const calls: string[] = [];
  const dependencies: Record<string, any> = Object.fromEntries(
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
        if (stage === "reuse") return { reused: true, candidateCount: 1 };
        if (stage === "author")
          return { candidateCount: authoredCandidateCount };
        if (stage === "deploy") return { url: "https://qa.pages.dev" };
        return {};
      },
    ]),
  );
  return { calls, dependencies };
}
describe("focused pipeline orchestration", () => {
  it("treats a Cloudflare Access challenge as readiness only in protected-preview mode", () => {
    expect(privatePreview.classifyPagesPreviewResponse).toBeTypeOf("function");
    expect(
      privatePreview.classifyPagesPreviewResponse({
        status: 302,
        location: "/cdn-cgi/access/login/preview",
        protectedPreview: true,
      }),
    ).toBe("access-challenge");
    expect(
      privatePreview.classifyPagesPreviewResponse({
        status: 200,
        protectedPreview: true,
      }),
    ).toBe("unsafe-public");
    expect(
      privatePreview.classifyPagesPreviewResponse({
        status: 302,
        location: "/ordinary-login",
        protectedPreview: true,
      }),
    ).toBe("retry");
  });
  it("waits for an Access challenge rather than demanding a public 2xx from private previews", async () => {
    expect(privatePreview.waitForPagesPreview).toBeTypeOf("function");
    const ready = await privatePreview.waitForPagesPreview({
      url: "https://candidate-hash.launchloom-private-test.pages.dev",
      protectedPreview: true,
      timeoutSeconds: 10,
      intervalSeconds: 1,
      send: async () => new Response(null, {
        status: 302,
        headers: { location: "/cdn-cgi/access/login/preview" },
      }),
      wait: async () => {},
    });
    expect(ready).toEqual({ state: "access-challenge", status: 302 });
    await expect(privatePreview.waitForPagesPreview({
      url: "https://candidate-hash.launchloom-private-test.pages.dev",
      protectedPreview: true,
      timeoutSeconds: 10,
      intervalSeconds: 1,
      send: async () => new Response("public HTML", { status: 200 }),
      wait: async () => {},
    })).rejects.toThrow(/without an Access challenge/i);
  });
  it("never deploys diagnostic content until a no-data private preview probe passes", async () => {
    expect(privatePreview.deployPrivatePagesPreview).toBeTypeOf("function");
    const events: string[] = [];
    const candidateDirectory = await makePrivateDiagnosticDirectory();
    await fs.writeFile(path.join(candidateDirectory, "index.html"), '<html><head><meta name="robots" content="noindex"></head><body>candidate-specific content</body></html>');
    try {
    const deployed = await privatePreview.deployPrivatePagesPreview({
      projectName: "launchloom-private-test",
      directory: candidateDirectory,
      sourceSha: "a".repeat(40),
      branch: "creative-diagnostic-123",
      ensureProject: async () => { events.push("ensure-project"); },
      deploy: async ({ directory, branch }: { directory: string; branch: string }) => {
        if (branch === "access-probe") {
          const probe = await import("node:fs/promises");
          const html = await probe.readFile(`${directory}/index.html`, "utf8");
          expect(html).toContain("contains no client or business data");
          expect(html).not.toContain("candidate-specific content");
        }
        events.push(`deploy:${branch}`);
        return { url: branch === "access-probe"
          ? "https://probe-hash.launchloom-private-test.pages.dev"
          : "https://candidate-hash.launchloom-private-test.pages.dev" };
      },
      waitForReady: async (url: string, options: { protectedPreview: boolean }) => {
        expect(options.protectedPreview).toBe(true);
        events.push(`wait:${url.includes("probe-hash") ? "probe" : "candidate"}`);
      },
      verifyAccess: async (url: string) => {
        events.push(`verify:${url.includes("probe-hash") ? "probe" : "candidate"}`);
      },
    });
    expect(deployed.url).toBe("https://candidate-hash.launchloom-private-test.pages.dev");
    expect(events).toEqual([
      "ensure-project",
      "deploy:access-probe",
      "wait:probe",
      "verify:probe",
      "deploy:creative-diagnostic-123",
      "wait:candidate",
      "verify:candidate",
    ]);
    } finally {
      await fs.rm(candidateDirectory, { recursive: true, force: true });
    }
  });
  it("fails closed without uploading candidate content when the access probe is public", async () => {
    expect(privatePreview.deployPrivatePagesPreview).toBeTypeOf("function");
    const deployments: string[] = [];
    const candidateDirectory = await makePrivateDiagnosticDirectory();
    await fs.writeFile(path.join(candidateDirectory, "index.html"), '<html><head><meta name="robots" content="noindex"></head><body>must remain private</body></html>');
    try {
    await expect(privatePreview.deployPrivatePagesPreview({
      projectName: "launchloom-private-test",
      directory: candidateDirectory,
      sourceSha: "b".repeat(40),
      branch: "creative-diagnostic-456",
      ensureProject: async () => {},
      deploy: async ({ branch }: { branch: string }) => {
        deployments.push(branch);
        return { url: `https://${branch}.launchloom-private-test.pages.dev` };
      },
      waitForReady: async () => {},
      verifyAccess: async () => { throw new Error("not protected behind Cloudflare Access"); },
    })).rejects.toThrow(/not protected behind Cloudflare Access/i);
    expect(deployments).toEqual(["access-probe"]);
    } finally {
      await fs.rm(candidateDirectory, { recursive: true, force: true });
    }
  });
  it("requires private diagnostic output to be noindex, crawler-allowed, and sitemap-free before deployment", async () => {
    expect(privatePreview.assertPrivateDiagnosticOutput).toBeTypeOf("function");
    const directory = await makePrivateDiagnosticDirectory();
    try {
      await expect(privatePreview.assertPrivateDiagnosticOutput(directory)).resolves.toBe(true);
      await fs.writeFile(path.join(directory, "robots.txt"), "User-agent: *\nDisallow: /\n");
      await expect(privatePreview.assertPrivateDiagnosticOutput(directory)).rejects.toThrow(/robots\.txt must allow crawling/i);
      await fs.writeFile(path.join(directory, "robots.txt"), "User-agent: *\nAllow: /\n");
      await fs.writeFile(path.join(directory, "sitemap.xml"), "");
      await expect(privatePreview.assertPrivateDiagnosticOutput(directory)).rejects.toThrow(/must not contain a sitemap/i);
      await fs.rm(path.join(directory, "sitemap.xml"));
      await fs.writeFile(path.join(directory, "_headers"), "/*\n");
      await expect(privatePreview.assertPrivateDiagnosticOutput(directory)).rejects.toThrow(/X-Robots-Tag noindex/i);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("requires an Access challenge for anonymous preview traffic and a successful authenticated check", async () => {
    expect(assertTestPreviewAccessPolicy).toBeTypeOf("function");
    expect(assertTestPreviewAccessPolicy({
      anonymousStatus: 302,
      anonymousLocation: "/cdn-cgi/access/login/preview",
      authenticatedStatus: 200,
    })).toBe(true);
    expect(() => assertTestPreviewAccessPolicy?.({
      anonymousStatus: 200,
      anonymousLocation: "",
      authenticatedStatus: 200,
    })).toThrow(/not protected behind Cloudflare Access/i);
    expect(() => assertTestPreviewAccessPolicy?.({
      anonymousStatus: 302,
      anonymousLocation: "/cdn-cgi/access/login/preview",
      authenticatedStatus: 403,
    })).toThrow(/authorize.*developer request/i);
  });
  it("probes preview access anonymously and with only the configured service token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await verifyTestPreviewAccess({
      url: "https://hash.launchloom-pipeline-preview.pages.dev",
      clientId: "synthetic-client-id",
      clientSecret: "synthetic-client-secret",
      send: async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return calls.length === 1
          ? new Response(null, { status: 302, headers: { location: "/cdn-cgi/access/login/test" } })
          : new Response("ok", { status: 200 });
      },
    });
    expect(result).toEqual({ anonymousStatus: 302, authenticatedStatus: 200 });
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers).toBeUndefined();
    expect(calls[1].init.headers).toEqual({
      "CF-Access-Client-Id": "synthetic-client-id",
      "CF-Access-Client-Secret": "synthetic-client-secret",
    });
  });
  it("accepts only a stable safe Pages project slug", () => {
    expect(resolveTestPreviewProject()).toBe("launchloom-pipeline-preview");
    expect(resolveTestPreviewProject("LLQA-Previews")).toBe("llqa-previews");
    expect(() => resolveTestPreviewProject("https://evil.test/x")).toThrow(/project name/i);
  });
  it("requires crawler-accessible noindex headers and no deployed sitemap", () => {
    expect(
      assertTestPreviewIndexingPolicy({
        robotsTxt: "User-agent: *\nAllow: /\n",
        sitemapXml: "",
        xRobotsTag: "noindex, nofollow, noarchive",
      }),
    ).toBe(true);
    expect(() =>
      assertTestPreviewIndexingPolicy({
        robotsTxt: "User-agent: *\nDisallow: /\n",
        sitemapXml: "",
        xRobotsTag: "noindex, nofollow",
      }),
    ).toThrow(/robots\.txt must allow crawling/i);
    expect(() =>
      assertTestPreviewIndexingPolicy({
        robotsTxt: "User-agent: *\nAllow: /\n",
        sitemapXml: "<urlset></urlset>",
        xRobotsTag: "noindex, nofollow",
      }),
    ).toThrow(/must not publish a sitemap/i);
    expect(() =>
      assertTestPreviewIndexingPolicy({
        robotsTxt: "User-agent: *\nAllow: /\n",
        sitemapXml: "",
        xRobotsTag: "index, follow",
      }),
    ).toThrow(/noindex/i);
  });
  it("retries a transient GitHub evidence push without regenerating the site", async () => {
    let calls = 0;
    const waits: number[] = [];
    await pushPipelineTestEvidence({ cwd: "/unused", branch: "qa/seo-only/123-1",
      push: async () => { if (++calls < 3) throw new Error("remote: Internal Server Error\nremote rejected: Internal Server Error"); },
      wait: async (ms: number) => { waits.push(ms); },
    });
    expect(calls).toBe(3);
    expect(waits).toEqual([1000, 3000]);
  });
  it.each(["Authentication failed", "Permission denied", "non-fast-forward", "large files exceed GitHub limit"])("does not retry unsafe or permanent evidence rejection: %s", async error => {
    let calls = 0;
    await expect(pushPipelineTestEvidence({ cwd: "/unused", branch: "qa/seo-only/123-1",
      push: async () => { calls++; throw new Error(error); }, wait: async () => { throw new Error("Unexpected retry"); },
    })).rejects.toThrow(error);
    expect(calls).toBe(1);
  });
  it("bounds persistent GitHub evidence failures to three pushes", async () => {
    let calls = 0;
    await expect(pushPipelineTestEvidence({ cwd: "/unused", branch: "qa/creative-only/123-1",
      push: async () => { calls++; throw new Error("RPC failed; HTTP 503"); }, wait: async () => {},
    })).rejects.toThrow(/503/);
    expect(calls).toBe(3);
  });
  it("uses the provider's immutable URL rather than guessing a long branch alias", () => {
    expect(pagesDeploymentUrl("✨ Deployment complete! Take a peek over at https://abc123ef.example.pages.dev\n✨ Deployment alias URL: https://short.example.pages.dev")).toBe("https://abc123ef.example.pages.dev");
    expect(() => pagesDeploymentUrl("Upload pending https://wrong.pages.dev")).toThrow(/deployment/i);
  });
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
  it("includes configured FAL image prices in a focused generation cost summary", () => {
    const costs = {
      generatedAssets: {
        provider: "fal.ai",
        model: "fal-ai/minimax/image-01",
        placements: [{ path: "/images/generated/hero.webp" }, { path: "/images/generated/services.webp" }],
      },
    };
    const report = { stages: { author: { status: "not_run" } } };
    const summary = currentRunCostSummary(costs, report, "0.03");
    expect(summary.stages.find((stage) => stage.stage === "images")).toMatchObject({
      costUsd: 0.06,
      costKind: "estimated",
      complete: true,
    });
    const unknownPrice = currentRunCostSummary(costs, report, "unset");
    expect(unknownPrice.stages.find((stage) => stage.stage === "images")).toMatchObject({
      costUsd: null,
      costKind: "unreported",
      complete: false,
    });
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
    const { calls, dependencies } = adapter("", 1);
    dependencies.reuse = async () => ({ reused: false });
    const report = await runPipelineTest(input, dependencies);
    expect(calls).toContain("author");
    expect(report.candidateCount).toBe(1);
    expect(report.candidateTarget).toBe(1);
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
    expect(report.candidateTarget).toBe(3);
    expect(report.stages.creative.status).toBe("failed");
    expect(report.stages.research.status).toBe("not_run");
    expect(report.verdict).toBe("failed");
    expect(report.previewDelivered).toBe(true);
  });
  it("full-preview runs research and creative and passes only when both lanes pass", async () => {
    const { calls, dependencies } = adapter();
    const report = await runPipelineTest(
      { ...input, profile: "full-preview" },
      dependencies,
    );
    expect(calls).toEqual([
      "prepare",
      "research",
      "configure",
      "author",
      "creative",
      "select",
      "technical",
      "seo",
      "deploy",
      "notify",
      "persist",
    ]);
    expect(report.candidateCount).toBe(3);
    expect(report.candidateTarget).toBe(3);
    expect(report.stages.research.status).toBe("passed");
    expect(report.stages.creative.status).toBe("passed");
    expect(report.stages.seo.status).toBe("passed");
    expect(report.verdict).toBe("passed");
    expect(report.previewDelivered).toBe(true);
  });
  it.each(["creative", "seo"])(
    "full-preview does not deploy when the %s quality lane fails",
    async (failedLane) => {
      const { calls, dependencies } = adapter(failedLane);
      const report = await runPipelineTest(
        { ...input, profile: "full-preview" },
        dependencies,
      );
      expect(report.verdict).toBe("failed");
      expect(report.previewDelivered).toBe(false);
      expect(calls).not.toContain("deploy");
      expect(calls).not.toContain("notify");
      expect(calls.at(-1)).toBe("persist");
    },
  );
  it("fails full-preview before creative evaluation when fewer than three candidates were authored", async () => {
    const { calls, dependencies } = adapter("", 2);
    const report = await runPipelineTest(
      { ...input, profile: "full-preview" },
      dependencies,
    );
    expect(report.candidateCount).toBe(2);
    expect(report.candidateTarget).toBe(3);
    expect(report.stages.author.status).toBe("failed");
    expect((report.stages.author as any).error).toMatch(/expected 3 authored candidates, received 2/i);
    expect(calls).not.toContain("creative");
    expect(calls).not.toContain("select");
    expect(calls).not.toContain("deploy");
    expect(calls).not.toContain("notify");
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
