import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyCreativeVisualSafetyRepairs, resolveReferenceEvidencePath, runCreativeRepairLoop } from "../scripts/creative-repair-loop.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("creative repair loop", () => {
  it("prefers an accessible absolute reference evidence path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-repair-evidence-"));
    temporaryRoots.push(root);
    const absolutePath = path.join(root, "reference.png");
    await fs.writeFile(absolutePath, "reference");

    await expect(resolveReferenceEvidencePath({
      path: "missing/repository-relative.png",
      absolutePath,
    })).resolves.toBe(absolutePath);
  });

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

  it("fits long unbroken service titles on mobile", () => {
    const result = applyCreativeVisualSafetyRepairs(
      { experience: "<main />", styles: ".archive-row-name { font-size: 4rem; }", motion: "" },
      [{
        category: "content-integrity",
        severity: "critical",
        viewport: "mobile",
        evidence: "ASTROPHOTOGRAPHY is cut off at the right viewport edge.",
        recommendation: "Allow the long service title to wrap on mobile.",
      }],
    );

    expect(result.styles).toContain("mobile-service-title-fit");
    expect(result.styles).toContain("overflow-wrap: break-word");
    expect(result.styles).toContain("word-break: normal");
    expect(result.styles).toContain('[data-creative-host="true"] .archive-row-name');
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
    expect(result.authorAttempts).toBe(0);
    expect(result.generationFailures).toBe(1);
    expect(result.cycles[0].generationError).toContain("malformed JSON");
  });

  it("keeps malformed responses bounded without spending successful author attempts", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async () => [],
      evaluate: async () => ({ pass: false, findings: ["still blocked"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
    expect(result.authorAttempts).toBe(0);
    expect(result.generationFailures).toBe(2);
  });
});
