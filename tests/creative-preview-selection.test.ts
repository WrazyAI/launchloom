import { describe, expect, it } from "vitest";
import { validateCreativePreviewSelection } from "../scripts/validate-creative-preview-selection.mjs";
import { filterRecordedContrastWarnings } from "../scripts/rendered-contrast.mjs";

function config(overrides: Record<string, any> = {}) {
  return {
    design: {
      experience: {
        renderer: "creative-candidate",
        candidateId: "candidate-a",
        selectionMode: "creative-preview",
      },
    },
    ...overrides,
  };
}

function bakeoff(overrides: Record<string, any> = {}) {
  return {
    selectedCandidateId: "candidate-a",
    fallback: false,
    candidates: [
      {
        candidateId: "candidate-a",
        failures: [],
        renderedReferenceFidelity: {
          audit: {
            overallScore: 72,
            scores: { spatialRhythm: 60, imagery: 55, paletteAdherence: 90 },
            findings: [],
          },
        },
      },
    ],
    ...overrides,
  };
}

function gate(overrides: Record<string, any> = {}) {
  return {
    version: 1,
    mode: "verify",
    status: "ok",
    audit: { verdict: "pass", findings: [] },
    blockers: [],
    ...overrides,
  };
}

describe("creative preview selection", () => {
  it("accepts a clean strict selection", () => {
    expect(
      validateCreativePreviewSelection({
        config: config(),
        bakeoff: bakeoff(),
        gate: gate(),
      }),
    ).toMatchObject({ decision: "clean", candidateId: "candidate-a" });
  });

  it("accepts a near-miss with open findings as warned", () => {
    const result = validateCreativePreviewSelection({
      config: config({
        design: {
          experience: {
            renderer: "creative-candidate",
            candidateId: "candidate-a",
            selectionMode: "creative-near-miss",
          },
        },
      }),
      bakeoff: bakeoff({ nearMissSelection: true, fallback: true }),
      gate: gate({
        status: "quality-blocked",
        audit: {
          verdict: "revise",
          findings: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        },
        blockers: [
          { severity: "major", category: "hero-geometry", evidence: "drift" },
        ],
      }),
    });
    expect(result.decision).toBe("warned");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects a strict selection with fallback true", () => {
    expect(
      validateCreativePreviewSelection({
        config: config(),
        bakeoff: bakeoff({ fallback: true }),
        gate: gate(),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a near-miss without nearMissSelection", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: "candidate-a",
              selectionMode: "creative-near-miss",
            },
          },
        }),
        bakeoff: bakeoff({ fallback: true }),
        gate: gate(),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a near-miss with a hard blocker", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: "candidate-a",
              selectionMode: "creative-near-miss",
            },
          },
        }),
        bakeoff: bakeoff({ nearMissSelection: true, fallback: true }),
        gate: gate({
          status: "quality-blocked",
          audit: {
            verdict: "revise",
            findings: [{ severity: "critical", category: "content-integrity" }],
          },
          blockers: [{ severity: "critical", category: "content-integrity" }],
        }),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a missing candidate or unknown selection mode", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: null,
              selectionMode: "creative-preview",
            },
          },
        }),
        bakeoff: bakeoff(),
        gate: gate(),
      }).decision,
    ).toBe("reject");
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: "candidate-a",
              selectionMode: "unknown",
            },
          },
        }),
        bakeoff: bakeoff(),
        gate: gate(),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a selected candidate with a hard deterministic failure", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: "candidate-a",
              selectionMode: "creative-near-miss",
            },
          },
        }),
        bakeoff: bakeoff({
          nearMissSelection: true,
          fallback: true,
          candidates: [
            {
              candidateId: "candidate-a",
              failures: ["desktop: horizontal overflow"],
              renderedReferenceFidelity: { audit: { findings: [] } },
            },
          ],
        }),
        gate: gate({
          status: "quality-blocked",
          audit: {
            verdict: "revise",
            findings: [
              {
                severity: "major",
                category: "hero-geometry",
                evidence: "drift",
              },
            ],
          },
          blockers: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        }),
      }).decision,
    ).toBe("reject");
  });

  it("rejects a near-miss without selected-candidate audit evidence", () => {
    expect(
      validateCreativePreviewSelection({
        config: config({
          design: {
            experience: {
              renderer: "creative-candidate",
              candidateId: "candidate-a",
              selectionMode: "creative-near-miss",
            },
          },
        }),
        bakeoff: bakeoff({
          nearMissSelection: true,
          fallback: true,
          candidates: [{ candidateId: "candidate-a", failures: [] }],
        }),
        gate: gate({
          status: "quality-blocked",
          audit: {
            verdict: "revise",
            findings: [
              {
                severity: "major",
                category: "hero-geometry",
                evidence: "drift",
              },
            ],
          },
          blockers: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        }),
      }).decision,
    ).toBe("reject");
  });

  it("accepts a near-miss with contrast warnings as warned while still rejecting non-contrast hard failures", () => {
    const result = validateCreativePreviewSelection({
      config: config({
        design: {
          experience: {
            renderer: "creative-candidate",
            candidateId: "candidate-a",
            selectionMode: "creative-near-miss",
          },
        },
      }),
      bakeoff: bakeoff({
        nearMissSelection: true,
        fallback: true,
        candidates: [
          {
            candidateId: "candidate-a",
            failures: [
              "contrast fail: / desktop default a.cta measured 2.8:1 (required 4.5)",
            ],
            renderedReferenceFidelity: {
              audit: { overallScore: 55, findings: [] },
            },
          },
        ],
      }),
      gate: gate(),
    });
    expect(result.decision).toBe("warned");
    expect(result.warnings).toContain(
      "contrast fail: / desktop default a.cta measured 2.8:1 (required 4.5)",
    );

    const layoutWarned = validateCreativePreviewSelection({
      config: config({
        design: {
          experience: {
            renderer: "creative-candidate",
            candidateId: "candidate-a",
            selectionMode: "creative-near-miss",
          },
        },
      }),
      bakeoff: bakeoff({
        nearMissSelection: true,
        fallback: true,
        candidates: [
          {
            candidateId: "candidate-a",
            failures: [
              "desktop: empty media frame has no image, label, or caption",
              "mobile: hero action exceeds mobile viewport for an image-overlay route",
            ],
            renderedReferenceFidelity: {
              audit: { overallScore: 55, findings: [] },
            },
          },
        ],
      }),
      gate: gate(),
    });
    expect(layoutWarned.decision).toBe("warned");
    expect(layoutWarned.warnings).toContain(
      "desktop: empty media frame has no image, label, or caption",
    );
  });

  it("rejects a strict selection whose gate only has open findings", () => {
    expect(
      validateCreativePreviewSelection({
        config: config(),
        bakeoff: bakeoff(),
        gate: gate({
          status: "quality-blocked",
          audit: {
            verdict: "revise",
            findings: [
              {
                severity: "major",
                category: "hero-geometry",
                evidence: "drift",
              },
            ],
          },
          blockers: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        }),
      }).decision,
    ).toBe("reject");
  });

  it("suppresses only contrast failures matching recorded warned delivery warnings", () => {
    const warnings = {
      decision: "warned",
      warnings: [
        'contrast fail: / mobile default body > main > p:nth-of-type(1) text "Residential electricians" (3.026; required 4.5); foreground #5e6360, background variable',
      ],
    };
    const result = filterRecordedContrastWarnings(
      [
        'contrast fail: / mobile default body > main > p:nth-of-type(1) text "Residential electricians" (2.705; required 4.5); foreground #5e6360, background variable',
        'contrast fail: / desktop menu-open body > aside > button text "Got questions?" (1.407; required 4.5); foreground #14201d, background #1e3a4c',
        'contrast unresolved: / mobile default body > main > p:nth-of-type(1) text "Residential electricians" (unresolved; required 4.5); foreground #5e6360, background variable',
      ],
      warnings,
    );
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0]).toContain("2.705");
    expect(result.blocking).toHaveLength(2);
    expect(result.blocking[0]).toContain("Got questions?");
    expect(result.blocking[1]).toContain("contrast unresolved:");
  });
});

describe("creative repair evidence in developer handoff", () => {
  const nearMissConfig = config({
    design: {
      experience: {
        renderer: "creative-candidate",
        candidateId: "candidate-a",
        selectionMode: "creative-near-miss",
      },
    },
  });
  const nearMissBakeoff = bakeoff({ nearMissSelection: true, fallback: true });
  const openFindings = [
    "Mobile hero copy does not overlap the image.",
    ...Array.from(
      { length: 14 },
      (_, index) => `Design observation ${index + 1}.`,
    ),
  ];
  const repairSummary = {
    status: "previewed-with-open-findings",
    selectedCandidateId: "candidate-a",
    promotionReady: false,
    nearMiss: { candidateId: "candidate-a", overall: 47, openFindings },
  };

  it("reports the exact near-miss warnings even when the hard visual gate passed", () => {
    const result = validateCreativePreviewSelection({
      config: nearMissConfig,
      bakeoff: nearMissBakeoff,
      gate: gate(),
      repairSummary,
    });
    expect(result.decision).toBe("warned");
    expect(result.warnings[0]).toContain("15 open findings");
    expect(result.warnings).toContain(`Creative review: ${openFindings[0]}`);
  });

  it("does not call a near-miss clean if the matching repair evidence is unavailable", () => {
    const result = validateCreativePreviewSelection({
      config: nearMissConfig,
      bakeoff: nearMissBakeoff,
      gate: gate(),
      repairSummary: {
        ...repairSummary,
        selectedCandidateId: "candidate-b",
        nearMiss: { ...repairSummary.nearMiss, candidateId: "candidate-b" },
      },
    });
    expect(result.decision).toBe("warned");
    expect(result.warnings.join(" ")).not.toContain(openFindings[0]);
  });

  it("does not convert report-only contrast notes into deterministically recorded waivers", () => {
    const contrast =
      "contrast fail: / mobile default a.cta measured 2.8:1 (required 4.5)";
    const result = validateCreativePreviewSelection({
      config: nearMissConfig,
      bakeoff: nearMissBakeoff,
      gate: gate(),
      repairSummary: {
        ...repairSummary,
        nearMiss: { ...repairSummary.nearMiss, openFindings: [contrast] },
      },
    });
    expect(filterRecordedContrastWarnings([contrast], result)).toEqual({
      blocking: [contrast],
      suppressed: [],
    });
  });

  it("does not attach stale repair warnings to a strict selection", () => {
    expect(
      validateCreativePreviewSelection({
        config: config(),
        bakeoff: bakeoff(),
        gate: gate(),
        repairSummary,
      }),
    ).toMatchObject({ decision: "clean", warnings: [] });
  });
});
