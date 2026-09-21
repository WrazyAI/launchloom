import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const scriptsDir = path.resolve("scripts");
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

function scriptFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return scriptFiles(file);
      return entry.isFile() && file.endsWith(".mjs") ? [file] : [];
    });
}

describe("OpenRouter cache integration", () => {
  it("routes script inference through the shared cache-aware client", () => {
    const directClients = scriptFiles(scriptsDir)
      .filter((file) => path.basename(file) !== "openrouter-client.mjs")
      .filter((file) => fs.readFileSync(file, "utf8").includes(openRouterUrl))
      .map((file) => path.relative(process.cwd(), file));

    expect(directClients).toEqual([]);
  });

  it("keeps stable sessions on every high-cost production inference lane", () => {
    const expected = new Map([
      ["scripts/author-production-experiences.mjs", "creative-author"],
      ["scripts/generate-site-config.mjs", "site-copy"],
      ["scripts/seo-research.mjs", "seo-research"],
      ["scripts/revision-engine.mjs", "revision-operations"],
      ["scripts/rendered-reference-fidelity.mjs", "rendered-reference"],
      ["scripts/visual-quality-gate.mjs", "visual-quality-gate"],
      ["scripts/analyze-reference-dna.mjs", "reference-dna"],
      ["scripts/creative-repair-loop.mjs", "creative-repair"],
    ]);

    for (const [file, scope] of expected) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toContain("openRouterChatCompletion");
      expect(source, file).toContain("openRouterSessionId");
      expect(source, file).toContain(scope);
    }
  });

  it("uses xhigh as the default Luna creative reasoning effort", () => {
    const author = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    const repair = fs.readFileSync("scripts/creative-repair-loop.mjs", "utf8");
    expect(author).toContain(
      '(model === "openai/gpt-5.6-luna" ? "xhigh" : "low")',
    );
    expect(repair).toContain(
      'process.env.CREATIVE_EXPERIENCE_REASONING_EFFORT || "xhigh"',
    );
  });

  it("records cache usage even when an authored response cannot be parsed", () => {
    const source = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    expect(source).toContain("parseStatus: responseBodyError");
    expect(source).toContain('usageRecord.parseStatus = "missing-content"');
    expect(source).toContain('usageRecord.parseStatus = "parse-failed"');
    expect(source).toContain("parseStatusCounts");
    expect(source).toContain("cacheSummary: aggregateCacheUsage(usage)");
  });

  it("records HTTP-error responses before throwing and keeps prompt paths sanitized", () => {
    const source = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    const pushIndex = source.indexOf("usage.push(usageRecord)");
    const httpIndex = source.indexOf('usageRecord.parseStatus = "http-error"');
    const throwIndex = source.indexOf('OpenRouter ${response.status}: ${errorContext}');
    expect(pushIndex).toBeGreaterThan(-1);
    expect(httpIndex).toBeGreaterThan(pushIndex);
    expect(throwIndex).toBeGreaterThan(httpIndex);
    expect(source).toContain("readOpenRouterResponseEnvelope(response)");
    expect(source).not.toContain("screenshotPath: item.screenshotPath");
  });

  it("keeps explicit GPT-5.6 cache breakpoints on repeated large prefixes", () => {
    for (const file of [
      "scripts/author-production-experiences.mjs",
      "scripts/generate-site-config.mjs",
      "scripts/seo-research.mjs",
      "scripts/rendered-reference-fidelity.mjs",
      "scripts/creative-repair-loop.mjs",
    ]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toMatch(
        /promptCached(?:MessageContent|Text)/u,
      );
      expect(source, file).toContain("promptCacheRequestFields");
    }
  });

  it("keeps one stable structured-output schema across Luna author stages", () => {
    const source = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    expect(source).toContain('name: "launchloom_production_author_stage"');
    expect(source).toContain("json_schema: authorStageSchema");
    expect(source).not.toContain("schemas[request.stage]");
    expect(source).toContain(
      'required: ["stage", "designContract", "designRationale", "content"]',
    );
    expect(source).toContain(
      "For contract: fill designContract and designRationale; return content as an empty string.",
    );
    expect(source).toContain(
      "For experience, styles, or motion: fill content; return designContract and designRationale as empty strings.",
    );
  });

  it("keeps dynamic stage work after the reusable route cache breakpoint", () => {
    const source = fs.readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );
    expect(source).toContain("routePromptPrefix(request)");
    expect(source).toContain("stagePromptSuffix(request)");
    expect(source).toContain(
      "End reusable route and reference context. Stage-specific work follows.",
    );
    expect(source.indexOf("routePromptPrefix(request)")).toBeLessThan(
      source.indexOf("stagePromptSuffix(request)"),
    );
    expect(source).toContain(
      "referenceDna: cacheableReferenceDna(request.route.referenceDna)",
    );
  });

  it("keeps static Reference DNA analysis reusable across runs for 24 hours", () => {
    const source = fs.readFileSync(
      "scripts/analyze-reference-dna.mjs",
      "utf8",
    );
    expect(source).toContain('openRouterSessionId(\n    "reference-dna"');
    expect(source).toContain("responseCacheTtlSeconds: 86_400");
    expect(source).not.toContain("pack.selectionKey ||");
    expect(source).not.toMatch(
      /openRouterSessionId\([\s\S]{0,300}\brouteId\s*:/u,
    );
    expect(source).not.toMatch(/sessionId[\s\S]{0,300}\bdesktop,\s*\n\s*mobile,/u);
  });

  it("limits exact response caching to deterministic control and judge lanes", () => {
    const expectedResponseCached = [
      "scripts/analyze-reference-dna.mjs",
      "scripts/evaluate-visual-models.mjs",
      "scripts/rendered-reference-fidelity.mjs",
      "scripts/revision-engine.mjs",
      "scripts/visual-quality-gate.mjs",
    ];
    for (const file of expectedResponseCached)
      expect(fs.readFileSync(file, "utf8"), file).toContain(
        "responseCache: true",
      );

    for (const file of [
      "scripts/author-production-experiences.mjs",
      "scripts/generate-site-config.mjs",
      "scripts/creative-repair-loop.mjs",
    ])
      expect(fs.readFileSync(file, "utf8"), file).not.toContain(
        "responseCache: true",
      );
  });
});
