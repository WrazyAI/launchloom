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
      ],
    );
    expect(result.styles).toContain("launchloom-visual-repair: footer-contrast");
    expect(result.styles).toContain("launchloom-visual-repair: mobile-cta-clearance");
    expect(result.styles).toContain('main + [data-cta-placement]');
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
});
