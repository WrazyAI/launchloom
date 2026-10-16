import { describe, expect, it } from "vitest";
import {
  classifyFailureLine,
  classifyJudgeFinding,
  HARD_JUDGE_CATEGORIES,
  nearMissAssessment,
  splitFailureLines,
} from "../scripts/creative-gate-severity.mjs";

describe("creative gate severity classification", () => {
  it.each([
    ["rendered-reference: The opening is a flat pale-sage field", "open"],
    [
      "rendered composition: Split-media topology requires a substantial visible hero image.",
      "open",
    ],
    [
      "mobile: rendered composition: Media-overlay topology requires an image field occupying a substantial part of the hero.",
      "open",
    ],
    ["source: Missing required signature editorial-monument.", "hard"],
    ["repaired source: The authored section sequence is off.", "hard"],
    [
      "contrast fail: / desktop default body > main (1.200; required 4.5)",
      "hard",
    ],
    [
      "contrast unresolved: / desktop default body > main (unresolved; required 4.5); foreground unknown, background variable; filter, blend",
      "open",
    ],
    ["desktop: horizontal overflow", "hard"],
    ["mobile: hero exceeds desktop viewport", "hard"],
    ["compact: broken image", "hard"],
    ["desktop: browser error", "hard"],
    ["desktop: expected one h1", "hard"],
    ["desktop: missing services section", "hard"],
    ["desktop: missing required fragment target", "hard"],
    ["desktop: navigation does not expose required targets", "hard"],
    ["desktop: image is missing alt text", "hard"],
    ["desktop: interactive control has no accessible name", "hard"],
    ["desktop: em dash found", "hard"],
    ["service-page mobile: horizontal overflow", "hard"],
    [
      "service-page mobile: supported page brief content is missing after hydration.",
      "open",
    ],
    ["an entirely new failure format", "hard"],
    ["", "hard"],
    [undefined, "hard"],
  ])("classifies %j as %s", (line, expected) => {
    expect(classifyFailureLine(line)).toBe(expected);
  });

  it("splits failure lists without reordering", () => {
    const { hard, open } = splitFailureLines([
      "desktop: horizontal overflow",
      "rendered-reference: composition drift",
      "contrast unresolved: / mobile (unresolved; required 4.5)",
      "mobile: hero exceeds desktop viewport",
    ]);
    expect(hard).toEqual([
      "desktop: horizontal overflow",
      "mobile: hero exceeds desktop viewport",
    ]);
    expect(open).toEqual([
      "rendered-reference: composition drift",
      "contrast unresolved: / mobile (unresolved; required 4.5)",
    ]);
  });
});

describe("judge finding classification", () => {
  it.each([
    [{ severity: "critical", category: "hero-geometry" }, "critical"],
    [{ severity: "critical", category: "content-integrity" }, "critical"],
    [{ severity: "major", category: "content-integrity" }, "hard"],
    [{ severity: "major", category: "accessibility" }, "hard"],
    [{ severity: "major", category: "hero-geometry" }, "open"],
    [{ severity: "major", category: "imagery" }, "open"],
    [{ severity: "minor", category: "content-integrity" }, "open"],
    [{ severity: "", category: "" }, "open"],
    [undefined, "open"],
  ])("classifies %j as %s", (finding, expected) => {
    expect(classifyJudgeFinding(finding as any)).toBe(expected);
  });

  it("declares the hard judge categories", () => {
    expect(HARD_JUDGE_CATEGORIES).toEqual(["content-integrity", "accessibility"]);
  });
});

describe("near-miss assessment", () => {
  function candidate(overrides: Record<string, any> = {}) {
    return {
      candidateId: "candidate-a",
      failures: [],
      renderedReferenceFidelity: {
        audit: {
          overallScore: 62,
          scores: { spatialRhythm: 60, imagery: 55, paletteAdherence: 90 },
          findings: [{ severity: "major", category: "hero-geometry", evidence: "drift" }],
        },
      },
      ...overrides,
    };
  }

  it("delivers a clean-gate candidate with fidelity findings as open", () => {
    const assessment = nearMissAssessment(candidate());
    expect(assessment.eligible).toBe(true);
    expect(assessment.reasons).toEqual([]);
    expect(assessment.overall).toBe(62);
    expect(assessment.openFindings).toEqual([
      "major hero-geometry: drift",
    ]);
  });

  it("blocks hard failures, critical findings, low overall, and floor misses", () => {
    expect(
      nearMissAssessment(
        candidate({ failures: ["desktop: horizontal overflow"] }),
      ).eligible,
    ).toBe(false);
    expect(
      nearMissAssessment(
        candidate({ failures: ["contrast unresolved: / desktop (unresolved; required 4.5)"] }),
      ).eligible,
    ).toBe(true);
    const critical = candidate();
    critical.renderedReferenceFidelity.audit.findings = [
      { severity: "critical", category: "content-integrity", evidence: "sealed content" },
    ];
    expect(nearMissAssessment(critical).eligible).toBe(false);
    expect(nearMissAssessment(critical).criticalFindings).toHaveLength(1);
    const hardMajor = candidate();
    hardMajor.renderedReferenceFidelity.audit.findings = [
      { severity: "major", category: "accessibility", evidence: "contrast" },
    ];
    expect(nearMissAssessment(hardMajor).eligible).toBe(false);
    expect(
      nearMissAssessment(candidate({}), { overallBar: 70 }).eligible,
    ).toBe(false);
    const floored = candidate();
    (floored.renderedReferenceFidelity.audit as Record<string, any>).scores = {
      spatialRhythm: 60,
      imagery: 20,
    };
    const flooredAssessment = nearMissAssessment(floored);
    expect(flooredAssessment.eligible).toBe(false);
    expect(flooredAssessment.reasons.join(" ")).toContain("imagery 20");
  });

  it("keeps hard failure lines out of the open findings list", () => {
    const assessment = nearMissAssessment(
      candidate({
        failures: [
          "desktop: horizontal overflow",
          "rendered-reference: composition drift",
        ],
      }),
    );
    expect(assessment.openFindings).toEqual([
      "rendered-reference: composition drift",
      "major hero-geometry: drift",
    ]);
    expect(assessment.hardFailures).toEqual(["desktop: horizontal overflow"]);
  });
});
