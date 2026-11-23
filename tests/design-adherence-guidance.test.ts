import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  designAdherencePromptBlock,
  FRONTEND_DESIGN_SKILL_PATH,
  frontendDesignAuthoringGuidance,
  frontendDesignAuthoringGuidanceBlock,
  frontendDesignCopyGuidance,
  frontendDesignCopyGuidanceBlock,
  frontendDesignGuidance,
  frontendDesignGuidanceBlock,
  INTERFACE_CRAFT_GUIDANCE,
  REPAIR_CRITIQUE_GUIDANCE,
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
    // The full review block embeds the retained review copy itself, not a paraphrase.
    expect(block).toContain(retained.slice(0, 400));
  });

  it("scopes the authoring guidance to visual craft without copy-invention or free-palette conflicts", () => {
    const excerpt = frontendDesignAuthoringGuidance();
    expect(excerpt).toContain("## Design principles");
    expect(excerpt).toContain("Visual structure is information.");
    expect(excerpt).toContain("Use non-user-triggered motion sparingly");
    expect(excerpt).toContain("## Restraint and self-critique");

    // Conflicting upstream sections are excluded from code authoring and repair.
    expect(excerpt).not.toContain("More on writing in design");
    expect(excerpt).not.toContain("come up with copy and placeholder content");
    expect(excerpt).not.toContain("describe the core base palette as 4");
    expect(excerpt).not.toContain("Choose your typefaces deliberately");
    expect(excerpt).not.toContain("Approach this as the design lead");

    const block = frontendDesignAuthoringGuidanceBlock();
    expect(block).toContain("PINNED FRONTEND-DESIGN GUIDANCE (LAUNCHLOOM AUTHORING SCOPE)");
    expect(block).toContain("Anthropic frontend-design skill");
    expect(block).toContain("Apache-2.0");
    expect(block).toContain("docs/design-guidance/anthropic/frontend-design");
    expect(block).toContain("TEMPLATE ADHERENCE CONTRACT");
  });

  it("scopes the writing-in-design section for the upstream copy lane with factual boundaries", () => {
    const copyGuidance = frontendDesignCopyGuidance();
    expect(copyGuidance).toContain("## More on writing in design");
    expect(copyGuidance).toContain("Write from the end user's perspective.");
    expect(copyGuidance).toContain("Use active voice as default.");

    const block = frontendDesignCopyGuidanceBlock();
    expect(block).toContain("PINNED WRITING-IN-DESIGN GUIDANCE (COPY LANE)");
    expect(block).toContain("Never invent placeholder copy");
    expect(block).toContain("never use em dashes");
    expect(block).toContain(copyGuidance);
  });

  it("states the preserve, adapt, and prohibited boundaries", () => {
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("section order");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Adapt freely");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Prohibited");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("generic layout");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("contrast fixes");
    expect(TEMPLATE_ADHERENCE_CONTRACT).toContain("Never drift toward a LaunchLoom house style");
  });

  it("includes aesthetic-neutral interface craft rules for authoring and adds structured critique discipline for repair", () => {
    expect(INTERFACE_CRAFT_GUIDANCE).toContain("Concentric border radii");
    expect(INTERFACE_CRAFT_GUIDANCE).toContain("Optical over geometric alignment");
    expect(INTERFACE_CRAFT_GUIDANCE).toContain("Never write transition: all");
    expect(INTERFACE_CRAFT_GUIDANCE).toContain(":focus-visible");
    expect(INTERFACE_CRAFT_GUIDANCE).toContain("scroll-margin-top");
    expect(INTERFACE_CRAFT_GUIDANCE).toContain("44x44px");

    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("never concealed redesign");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("Triage order");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("missing-token");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("structural-layout");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("harden:");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("align:");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("distill:");
    expect(REPAIR_CRITIQUE_GUIDANCE).toContain("polish:");

    const authorBlock = designAdherencePromptBlock();
    expect(authorBlock).toContain(TEMPLATE_ADHERENCE_CONTRACT);
    expect(authorBlock).toContain("PINNED FRONTEND-DESIGN GUIDANCE");
    expect(authorBlock).toContain(INTERFACE_CRAFT_GUIDANCE);
    expect(authorBlock).not.toContain(REPAIR_CRITIQUE_GUIDANCE);
    expect(authorBlock).not.toContain("come up with copy and placeholder content");

    const repairBlock = designAdherencePromptBlock({ mode: "repair" });
    expect(repairBlock).toContain(TEMPLATE_ADHERENCE_CONTRACT);
    expect(repairBlock).toContain(INTERFACE_CRAFT_GUIDANCE);
    expect(repairBlock).toContain(REPAIR_CRITIQUE_GUIDANCE);
    expect(repairBlock).not.toContain("come up with copy and placeholder content");
  });
});
