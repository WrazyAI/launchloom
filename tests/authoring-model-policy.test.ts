import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCodeAuthoringModel } from "../scripts/creative-lane-inference.mjs";

describe("authoring model policy", () => {
  it("allows only DeepSeek V4.1 Flash for code authoring on OpenCode Go", () => {
    expect(
      assertCodeAuthoringModel("opencode-go/deepseek-v4.1-flash", {
        provider: "opencode-go",
      }),
    ).toBe("opencode-go/deepseek-v4.1-flash");
    expect(
      assertCodeAuthoringModel("deepseek-v4.1-flash", {
        provider: "opencode-go",
      }),
    ).toBe("deepseek-v4.1-flash");
    for (const model of [
      "z-ai/glm-5.3",
      "z-ai/glm-5.3-flash",
      "opencode-go/deepseek-v4-pro",
      "openai/gpt-6-luna",
    ]) {
      expect(() =>
        assertCodeAuthoringModel(model, { provider: "opencode-go" }),
      ).toThrow(/deepseek-v4\.1-flash/u);
    }
  });

  it("keeps the legacy OpenRouter path unchanged", () => {
    expect(
      assertCodeAuthoringModel("openai/gpt-6-luna", {
        provider: "openrouter",
      }),
    ).toBe("openai/gpt-6-luna");
  });

  it("pins every generation workflow and removes the dispatch override", () => {
    for (const file of [
      "generate-client.yml",
      "test-generation.yml",
      "repair-creative-candidate.yml",
    ]) {
      const source = fs.readFileSync(`.github/workflows/${file}`, "utf8");
      expect(source, file).not.toContain("creative_model");
      expect(source, file).toContain(
        "CREATIVE_EXPERIENCE_MODEL: deepseek/deepseek-v4.1-flash",
      );
    }
  });

  it("does not default any production workflow to GLM or v4-pro authoring", () => {
    for (const file of fs.readdirSync(".github/workflows")) {
      if (!file.endsWith(".yml")) continue;
      const source = fs.readFileSync(`.github/workflows/${file}`, "utf8");
      expect(source, file).not.toMatch(
        /CREATIVE_EXPERIENCE_MODEL:[^\n]*(?:glm|v4-pro)/iu,
      );
    }
  });
});
