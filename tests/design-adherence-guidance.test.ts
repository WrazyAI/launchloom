import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  designAdherencePromptBlock,
  FRONTEND_DESIGN_SKILL_PATH,
  frontendDesignGuidance,
  frontendDesignGuidanceBlock,
  TEMPLATE_ADHERENCE_CONTRACT,
} from "../scripts/design-adherence-guidance.mjs";

describe("design adherence guidance", () => {
  it("reads the pinned in-repo frontend-design review copy without network access", () => {
    const retained = fs.readFileSync(FRONTEND_DESIGN_SKILL_PATH, "utf8").trim();
    expect(retained.length).toBeGreaterThan(4_000);
    expect(frontendDesignGuidance()).toBe(retained);
    const block = frontendDesignGuidanceBlock();
    expect(block).toContain("PINNED FRONTEND-DESIGN GUIDANCE");
    expect(block).toContain("Apache-2.0");
    expect(block).toContain("docs/design-guidance/anthropic/frontend-design");
    // The block embeds the retained review copy itself, not a paraphrase.
    expect(block).toContain(retained.slice(0, 400));
  });

  it("states the preserve, adapt, and prohibited boundaries", () => {
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("section order");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Adapt freely");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Prohibited");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("generic layout");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("contrast fixes");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Never drift toward a LaunchLoom house style");
  });

  it("combines both blocks for prompt injection", () => {
    const combined = designAdherencePromptBlock();
    expect(combined).toContain(TEMPLATE_ADHERENCE_CONTRACT);
    expect(combined).toContain("PINNED FRONTEND-DESIGN GUIDANCE");
  });
});
