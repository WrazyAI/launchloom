import { describe, expect, it } from "vitest";
import { imageOverlayHeroContract } from "../scripts/hero-overlay-contract.mjs";
import { hardFailures } from "../scripts/run-creative-bakeoff.mjs";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    h1Count: 1,
    hasHero: true,
    hasEarlyConversion: true,
    hasServices: true,
    hasFaqs: true,
    hasContact: true,
    missingFragments: 0,
    missingNavTargets: 0,
    hasLeadForm: true,
    missingAlt: 0,
    unnamedControls: 0,
    heroBottom: 937,
    heroActionBottom: 900,
    viewportHeight: 844,
    overflow: false,
    brokenImages: 0,
    emDashes: 0,
    creativeRenderer: "creative-candidate",
    ...overrides,
  };
}

describe("image-overlay hero contract", () => {
  it("applies to image-led routes and not text-led routes", () => {
    expect(
      imageOverlayHeroContract({
        route: { heroArchetype: "image-overlay" },
      }),
    ).toContain("IMAGE-OVERLAY HERO CONTRACT");
    expect(
      imageOverlayHeroContract({
        route: {
          heroGeometry:
            "a full-bleed evening exterior photograph above a dark editorial canvas",
        },
      }),
    ).toContain("full-stage container");
    expect(
      imageOverlayHeroContract({
        route: {
          heroGeometry: "a text-led editorial statement on white",
        },
      }),
    ).toBe("");
  });

  it("fails a mobile image-overlay hero that exceeds the viewport", () => {
    const failures = hardFailures(
      evidence(),
      { name: "mobile" },
      { requiresImageOverlay: true },
    );
    expect(failures).toContain(
      "hero action exceeds mobile viewport for an image-overlay route",
    );
    expect(
      hardFailures(
        evidence(),
        { name: "mobile" },
        { requiresImageOverlay: false },
      ),
    ).not.toContain(
      "hero action exceeds mobile viewport for an image-overlay route",
    );
  });

  it("does not fail an image-led mobile hero that fits", () => {
    expect(
      hardFailures(
        evidence({ heroActionBottom: 844 }),
        { name: "mobile" },
        { requiresImageOverlay: true },
      ),
    ).not.toContain(
      "hero action exceeds mobile viewport for an image-overlay route",
    );
  });
});
