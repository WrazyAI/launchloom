import { describe, expect, it } from "vitest";
import { validateCreativePreviewSelection } from "../scripts/validate-creative-preview-selection.mjs";

function base(overrides: Record<string, any> = {}) {
  return {
    config: {
      design: {
        experience: {
          renderer: "creative-candidate",
          candidateId: "candidate-a",
          selectionMode: "creative-preview",
        },
      },
    },
    bakeoff: {
      selectedCandidateId: "candidate-a",
      fallback: false,
      candidates: [
        {
          candidateId: "candidate-a",
          failures: [],
          imageCoverage: {
            hero: true,
            secondary: true,
            tertiary: false,
            count: 2,
            required: true,
          },
          viewports: [
            { name: "desktop", heroMediaRegionCount: 1, heroMediaVisualCount: 1 },
            { name: "mobile", heroMediaRegionCount: 1, heroMediaVisualCount: 1 },
          ],
          renderedReferenceFidelity: {
            audit: { overallScore: 72, findings: [] },
          },
        },
      ],
    },
    gate: {
      version: 1,
      mode: "verify",
      status: "ok",
      audit: { verdict: "pass", findings: [] },
      blockers: [],
    },
    ...overrides,
  };
}

function selected(input: any) {
  return input.bakeoff.candidates[0];
}

describe("image coverage delivery guard", () => {
  it("warns instead of calling a media-led preview clean when no imagery rendered", () => {
    const input = base();
    selected(input).imageCoverage = {
      hero: false,
      secondary: false,
      tertiary: false,
      count: 0,
      required: false,
    };
    selected(input).viewports = [
      { name: "desktop", heroMediaRegionCount: 1, heroMediaVisualCount: 0 },
      { name: "mobile", heroMediaRegionCount: 1, heroMediaVisualCount: 0 },
    ];
    const result = validateCreativePreviewSelection(input);
    expect(result.decision).toBe("warned");
    expect(result.warnings.join(" ")).toMatch(/no approved imagery/iu);
  });

  it("keeps a typographic preview clean when the composition declares no media region", () => {
    const input = base();
    selected(input).heroArchetype = "typographic-poster";
    selected(input).imageCoverage = {
      hero: false,
      secondary: false,
      tertiary: false,
      count: 0,
      required: false,
    };
    selected(input).viewports = [
      { name: "desktop", heroMediaRegionCount: 0, heroMediaVisualCount: 0 },
    ];
    expect(validateCreativePreviewSelection(input).decision).toBe("clean");
  });

  it("warns when an image-required composition has supporting media but no hero", () => {
    const input = base();
    selected(input).imageCoverage = {
      hero: false,
      secondary: true,
      tertiary: false,
      count: 1,
      required: true,
    };
    const result = validateCreativePreviewSelection(input);
    expect(result.decision).toBe("warned");
    expect(result.warnings.join(" ")).toMatch(/hero imagery/iu);
  });

  it("keeps a clean decision when the required hero rendered", () => {
    expect(validateCreativePreviewSelection(base()).decision).toBe("clean");
  });
});
