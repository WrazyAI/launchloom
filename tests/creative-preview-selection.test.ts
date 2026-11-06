import { describe, expect, it } from "vitest";
import { validateCreativePreviewSelection } from "../scripts/validate-creative-preview-selection.mjs";

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
          blockers: [
            { severity: "critical", category: "content-integrity" },
          ],
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
              { severity: "major", category: "hero-geometry", evidence: "drift" },
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
              { severity: "major", category: "hero-geometry", evidence: "drift" },
            ],
          },
          blockers: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        }),
      }).decision,
    ).toBe("reject");
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
              { severity: "major", category: "hero-geometry", evidence: "drift" },
            ],
          },
          blockers: [
            { severity: "major", category: "hero-geometry", evidence: "drift" },
          ],
        }),
      }).decision,
    ).toBe("reject");
  });
});
