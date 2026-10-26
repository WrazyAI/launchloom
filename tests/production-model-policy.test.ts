import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  assertCodeAuthoringModel,
  creativeLaneDefaultModel,
} from "../scripts/creative-lane-inference.mjs";
import { VISUAL_GATE_MODEL } from "../scripts/visual-quality-gate-lib.mjs";

const PRODUCTION_DEFAULTS = [
  "scripts/generate-site-config.mjs",
  "scripts/generate-contextual-assets.mjs",
  "scripts/rendered-reference-fidelity.mjs",
  "scripts/visual-quality-gate-lib.mjs",
  "scripts/revision-engine.mjs",
  "scripts/seo-intent-planner.mjs",
  "scripts/analyze-reference-dna.mjs",
  "scripts/seo-research.mjs",
];

describe("production model policy", () => {
  it("uses DeepSeek V4.1 Flash on both transports", () => {
    expect(creativeLaneDefaultModel("opencode-go")).toBe(
      "opencode-go/deepseek-v4.1-flash",
    );
    expect(creativeLaneDefaultModel("openrouter")).toBe(
      "deepseek/deepseek-v4.1-flash",
    );
    expect(VISUAL_GATE_MODEL).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("does not default any production lane to GLM-5.3 or GPT-6 Luna", async () => {
    for (const file of PRODUCTION_DEFAULTS) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/\|\|\s*["']z-ai\/glm-5\.3/);
      expect(source, file).not.toMatch(/\|\|\s*["']openai\/gpt-6-luna/);
    }
  });

  it("keeps code authoring pinned to DeepSeek and rejects GLM", () => {
    expect(
      assertCodeAuthoringModel("deepseek/deepseek-v4.1-flash", {
        provider: "opencode-go",
      }),
    ).toBe("deepseek/deepseek-v4.1-flash");
    expect(() =>
      assertCodeAuthoringModel("z-ai/glm-5.3", {
        provider: "opencode-go",
      }),
    ).toThrow(/must use deepseek-v4.1-flash/);
    expect(() =>
      assertCodeAuthoringModel("openai/gpt-6-luna", {
        provider: "opencode-go",
      }),
    ).toThrow(/must use deepseek-v4.1-flash/);
  });

  it("keeps the production workflow defaults on DeepSeek", async () => {
    const workflow = await readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "SEO_QUERY_PLANNER_MODEL: ${{ vars.SEO_QUERY_PLANNER_MODEL || 'deepseek/deepseek-v4.1-flash' }}",
    );
    expect(workflow).toContain(
      "SEO_FALLBACK_SEARCH_MODEL: ${{ vars.SEO_FALLBACK_SEARCH_MODEL || 'deepseek/deepseek-v4.1-flash' }}",
    );
    expect(workflow).toContain(
      "CREATIVE_EXPERIENCE_MODEL: deepseek/deepseek-v4.1-flash",
    );
    expect(workflow).not.toContain(
      "vars.SEO_QUERY_PLANNER_MODEL || 'z-ai/glm-5.3-flash'",
    );
  });
});
