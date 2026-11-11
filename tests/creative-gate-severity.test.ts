import { describe, expect, it } from "vitest";
import {
  classifyFailureLine,
  classifyJudgeFinding,
  classifyVisualGateReport,
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
    ["compact: hero exceeds desktop viewport", "open"],
    ["mobile: hero action exceeds mobile viewport", "hard"],
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
      "compact: hero exceeds desktop viewport",
      "mobile: hero action exceeds mobile viewport",
    ]);
    expect(hard).toEqual([
      "desktop: horizontal overflow",
      "mobile: hero action exceeds mobile viewport",
    ]);
    expect(open).toEqual([
      "rendered-reference: composition drift",
      "contrast unresolved: / mobile (unresolved; required 4.5)",
      "compact: hero exceeds desktop viewport",
    ]);
  });
});

describe("judge finding classification", () => {
  it.each([
    [{ severity: "critical", category: "hero-geometry" }, "open"],
    [{ severity: "critical", category: "content-integrity" }, "critical"],
    [{ severity: "major", category: "content-integrity" }, "hard"],
    [{ severity: "major", category: "accessibility" }, "hard"],
    [{ severity: "major", category: "hero-geometry" }, "open"],
    [{ severity: "major", category: "imagery" }, "open"],
    [{ severity: "minor", category: "content-integrity" }, "open"],
    [{ severity: "major", category: "unmapped-new-category" }, "hard"],
    [{ severity: "urgent", category: "hero-geometry" }, "hard"],
    [{ severity: "", category: "" }, "hard"],
    [undefined, "hard"],
  ])("classifies %j as %s", (finding, expected) => {
    expect(classifyJudgeFinding(finding as any)).toBe(expected);
  });

  it("warns on clipped or malformed copy but keeps fabricated facts critical", () => {
    expect(
      classifyJudgeFinding({
        severity: "critical",
        category: "content-integrity",
        evidence: "The hero eyebrow is clipped by the sticky header.",
      }),
    ).toBe("open");
    expect(
      classifyJudgeFinding({
        severity: "critical",
        category: "content-integrity",
        evidence: "The footer shows a fabricated phone number.",
      }),
    ).toBe("critical");
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

  it("can carry a provable preview contrast finding as a warning", () => {
    const preview = nearMissAssessment(
      candidate({ failures: ["contrast fail: / desktop default button"] }),
      { allowContrastWarnings: true },
    );
    expect(preview.eligible).toBe(true);
    expect(preview.openFindings).toContain(
      "contrast fail: / desktop default button",
    );
    expect(
      nearMissAssessment(
        candidate({ failures: ["contrast fail: / desktop default button"] }),
      ).eligible,
    ).toBe(false);
  });

  it("allows a desktop hero height overage as an open design finding", () => {
    const assessment = nearMissAssessment(
      candidate({
        failures: ["compact: hero exceeds desktop viewport"],
      }),
    );
    expect(assessment.eligible).toBe(true);
    expect(assessment.openFindings).toContain(
      "compact: hero exceeds desktop viewport",
    );
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

describe("visual gate report classification", () => {
  function report(overrides: Record<string, any> = {}) {
    return {
      version: 1,
      mode: "verify",
      status: "quality-blocked",
      audit: { verdict: "revise", findings: [], operations: [] },
      blockers: [],
      ...overrides,
    };
  }

  it("marks a passing report with no findings as clean", () => {
    expect(
      classifyVisualGateReport(
        report({ status: "ok", audit: { verdict: "pass", findings: [] } }),
      ),
    ).toMatchObject({ decision: "clean", hard: [], warnings: [] });
  });

  it("marks open design findings as a warned preview", () => {
    const result = classifyVisualGateReport(
      report({
        audit: {
          verdict: "revise",
          findings: [
            {
              severity: "major",
              category: "hero-geometry",
              viewport: "both",
              evidence: "hero geometry drifts",
              recommendation: "tighten the hero",
            },
          ],
        },
        blockers: [
          {
            severity: "major",
            category: "hero-geometry",
            viewport: "both",
            evidence: "hero geometry drifts",
            recommendation: "tighten the hero",
          },
        ],
      }),
    );
    expect(result.decision).toBe("warned");
    expect(result.hard).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects critical findings, hard majors, and unknown blockers", () => {
    expect(
      classifyVisualGateReport(
        report({
          audit: {
            verdict: "revise",
            findings: [
              { severity: "critical", category: "content-integrity" },
            ],
          },
        }),
      ).decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(
        report({
          audit: {
            verdict: "revise",
            findings: [{ severity: "major", category: "accessibility" }],
          },
        }),
      ).decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(report({ blockers: [{ unexpected: true }] }))
        .decision,
    ).toBe("reject");
  });

  it("rejects missing evidence and unknown finding categories", () => {
    expect(
      classifyVisualGateReport(report({ audit: { verdict: "revise" } }))
        .decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(
        report({
          audit: {
            verdict: "revise",
            findings: [
              { severity: "major", category: "unmapped-new-category" },
            ],
          },
        }),
      ).decision,
    ).toBe("reject");
    expect(
      classifyVisualGateReport(report({ blockers: undefined })).decision,
    ).toBe("reject");
  });

  it("rejects a missing, errored, or unknown report", () => {
    expect(classifyVisualGateReport(null).decision).toBe("reject");
    expect(classifyVisualGateReport(report({ status: "error" })).decision).toBe(
      "reject",
    );
    expect(
      classifyVisualGateReport(report({ audit: { verdict: "unknown" } }))
        .decision,
    ).toBe("reject");
  });
});
