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
