import { describe, expect, it } from "vitest";
import { applyCreativeVisualSafetyRepairs, runCreativeRepairLoop } from "../scripts/creative-repair-loop.mjs";

describe("creative repair loop", () => {
  it("repairs at most two cycles and returns the passing source", async () => {
    let calls = 0;
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async ({ cycle }: any) => { calls += 1; return { experience: `fixed-${cycle}`, styles: "fixed", motion: "fixed" }; },
      evaluate: async (files: any) => ({ pass: files.experience === "fixed-2", findings: files.experience === "fixed-2" ? [] : ["still generic"] }),
      maxCycles: 2,
    });
    expect(calls).toBe(2);
    expect(result.pass).toBe(true);
    expect(result.cyclesUsed).toBe(2);
  });

  it("fails closed after the retry budget", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async () => ({ experience: "still-old", styles: "still-old", motion: "still-old" }),
      evaluate: async () => ({ pass: false, findings: ["not fixed"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
  });

  it("applies only scoped repairs for measured footer and mobile CTA defects", () => {
    const result = applyCreativeVisualSafetyRepairs(
      { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" },
      [
        {
          category: "content-integrity",
          evidence: "Footer brand is unreadable against the dark background and clipped at the top edge.",
        },
        {
          category: "conversion",
          evidence: "Floating CTA pill overlaps footer content on mobile.",
        },
        {
          category: "content-integrity",
          evidence: "Hero heading is white-on-white on a light panel.",
        },
        {
          category: "conversion",
          evidence: "On mobile the navigation is hidden and no menu is visible.",
        },
        {
          category: "hierarchy",
          evidence: "The services intro is an oversized five-line display heading that dwarfs the service rows.",
        },
      ],
    );
    expect(result.styles).toContain("launchloom-visual-repair: footer-contrast");
    expect(result.styles).toContain("launchloom-visual-repair: conversion-clearance");
    expect(result.styles).toContain("launchloom-visual-repair: hero-host-collision");
    expect(result.styles).toContain("launchloom-visual-repair: mobile-navigation-visibility");
    expect(result.styles).toContain('body:has([data-creative-host="true"]) .quick-answers');
    expect(result.styles).toContain('[data-creative-host="true"] a[data-navigation-geometry="fixed-bottom-conversation-pill"]');
    expect(result.styles).toContain("launchloom-visual-repair: service-intro-hierarchy");
    expect(result.styles).not.toContain("data-experience-pack");
  });

  it("keeps visual findings when the structural evaluator already passes", async () => {
    let repairFindings: unknown[] = [];
    const result = await runCreativeRepairLoop({
      files: { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" },
      findings: [{ category: "content-integrity", evidence: "Footer text is unreadable against the dark background." }],
      referenceDna: { familyId: "test" },
      generate: async ({ findings }: any) => {
        repairFindings = findings;
        return { experience: "<main></main>", styles: ".footer { color: #111; }", motion: "" };
      },
      evaluate: async () => ({ pass: true, findings: [] }),
      maxCycles: 2,
    });
    expect(repairFindings).toHaveLength(1);
    expect(result.pass).toBe(true);
    expect(result.files.styles).toContain("launchloom-visual-repair: footer-contrast");
  });

  it("uses only deterministic safety repairs when the author returns malformed output", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "<main></main>", styles: ".hero { background: var(--cream); }", motion: "" },
      findings: [{ category: "content-integrity", evidence: "Hero heading is white-on-white on a light panel." }],
      referenceDna: { familyId: "test" },
      generate: async () => { throw new Error("OpenRouter returned malformed JSON"); },
      evaluate: async (files: any) => ({
        pass: files.styles.includes("hero-host-collision"),
        findings: files.styles.includes("hero-host-collision") ? [] : ["hero still collides"],
      }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(true);
    expect(result.cyclesUsed).toBe(1);
    expect(result.cycles[0].generationError).toContain("malformed JSON");
  });
});
