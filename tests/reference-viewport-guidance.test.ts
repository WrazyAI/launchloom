import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reference viewport guidance", () => {
  it("tells screenshot analysis to preserve below-fold hero continuation", async () => {
    const { referenceAnalyzerViewportGuidance } =
      await import("../scripts/analyze-reference-dna.mjs");

    expect(referenceAnalyzerViewportGuidance).toBeTypeOf("function");
    const guidance = referenceAnalyzerViewportGuidance();
    expect(guidance).toContain(
      "may intentionally continue below the first viewport",
    );
    expect(guidance).toContain(
      "do not shrink the reference composition solely to fit",
    );
    expect(guidance).not.toContain("complete header plus hero must fit");
  });

  it("uses the assigned route's measured hero and CTA geometry for authorship", async () => {
    const { authorRules } =
      await import("../scripts/production-experience-author.mjs");

    expect(authorRules).toBeTypeOf("function");
    const rules = authorRules({
      referenceDna: {
        heroGeometry: {
          viewport:
            "A tall interior image starts near the lower fifth and continues below the fold.",
        },
        ctaPlacement: {
          primary: "Place the inquiry after the centered architectural thesis.",
          early: "Keep a quiet contact path in the desktop corner navigation.",
        },
      },
    });

    expect(rules).toContain(
      "A tall interior image starts near the lower fifth and continues below the fold.",
    );
    expect(rules).toContain(
      "Place the inquiry after the centered architectural thesis.",
    );
    expect(rules).toContain(
      "Keep a quiet contact path in the desktop corner navigation.",
    );
    expect(rules).not.toContain("complete header and hero must fit");
    expect(rules).not.toContain(
      "Put conversion in the hero or immediately after it.",
    );
  });

  it("keeps repair prompts reference-aware instead of forcing the full hero above the fold", () => {
    const source = readFileSync("scripts/creative-repair-loop.mjs", "utf8");

    expect(source).toContain(
      "allow the opening image to continue below the first viewport",
    );
    expect(source).toContain("Keep visible text and controls unclipped");
    expect(source).not.toContain(
      "The desktop header and complete hero must fit within 1536x864",
    );
  });

  it("keeps opening content usable without requiring a complete image frame above the fold", async () => {
    const { authorRules } =
      await import("../scripts/production-experience-author.mjs");

    expect(authorRules).toBeTypeOf("function");
    const rules = authorRules({ referenceDna: {} });

    expect(rules).toContain(
      "the reference's image frame may extend below the fold, so do not compress it merely to fit it above the fold",
    );
    expect(rules).toContain(
      "Keep visible text and controls unclipped and usable",
    );
  });

  it("does not let shared stage prompts override route-specific viewport and CTA placement", () => {
    const source = readFileSync(
      "scripts/author-production-experiences.mjs",
      "utf8",
    );

    expect(source).not.toContain(
      "complete desktop header and hero fit within 1536x864",
    );
    expect(source).not.toContain(
      "The header plus hero must have a measured bounding bottom",
    );
    expect(source).toContain("route.referenceDna.ctaPlacement.primary");
    expect(source).toContain("route.referenceDna.ctaPlacement.early");
    expect(source).toContain("may continue below the first viewport");
  });
});
