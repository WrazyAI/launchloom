import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  assertCodeAuthoringModel,
  creativeLaneDefaultModel,
  creativeLaneProvider,
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

  it("defaults production lanes to OpenCode Go and rejects OpenRouter", () => {
    expect(creativeLaneProvider({})).toBe("opencode-go");
    expect(() =>
      creativeLaneProvider({ CREATIVE_EXPERIENCE_PROVIDER: "openrouter" }),
    ).toThrow(/OpenRouter is disabled/);
  });

  it("rejects OpenRouter site copy outside test mode", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `process.env.SITE_COPY_PROVIDER = "openrouter";
process.env.NODE_ENV = "production";
delete process.env.VITEST;
const { generateSiteConfigWithModel } = await import("./scripts/generate-site-config.mjs");
try {
  await generateSiteConfigWithModel({ business: {} });
  console.log("NO_ERROR");
} catch (error) {
  console.log(String(error.message));
}`,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.stdout).toContain("OpenRouter is disabled");
    expect(result.stdout).not.toContain("NO_ERROR");
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
    expect(workflow).toContain("CREATIVE_EXPERIENCE_PROVIDER: opencode-go");
    expect(workflow).toContain("SITE_COPY_PROVIDER: opencode-go");
    expect(workflow).not.toContain("OPENROUTER_API_KEY");
    const focused = await readFile(
      ".github/workflows/test-generation.yml",
      "utf8",
    );
    expect(focused).toContain("CREATIVE_EXPERIENCE_PROVIDER: opencode-go");
    expect(focused).toContain("SITE_COPY_PROVIDER: opencode-go");
    expect(focused).not.toContain("OPENROUTER_API_KEY");
  });
});
