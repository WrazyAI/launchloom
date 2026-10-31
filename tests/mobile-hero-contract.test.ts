import { describe, expect, it } from "vitest";
import {
  MOBILE_HERO_MEDIA_MIN_VISIBLE,
  mobileHeroFitContract,
  routeRequiresMobileMedia,
} from "../scripts/mobile-hero-contract.mjs";
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
    heroBottom: 900,
    heroActionBottom: 700,
    heroMediaVisibleHeight: 154,
    viewportHeight: 844,
    overflow: false,
    brokenImages: 0,
    emDashes: 0,
    creativeRenderer: "creative-candidate",
    ...overrides,
  };
}

describe("mobile hero media contract", () => {
  it("applies to split-media and typographic-poster routes", () => {
    expect(
      routeRequiresMobileMedia({
        compositionTopology: { hero: "split-media" },
      }),
    ).toBe(true);
    expect(
      routeRequiresMobileMedia({ familyId: "typographic-poster" }),
    ).toBe(true);
    expect(
      routeRequiresMobileMedia({
        compositionTopology: { hero: "image-led-stage" },
      }),
    ).toBe(true);
  });

  it("does not apply to a utility-panel quote desk or a text-led statement", () => {
    expect(
      routeRequiresMobileMedia({
        compositionTopology: { hero: "utility-panel" },
      }),
    ).toBe(false);
    expect(
      routeRequiresMobileMedia({
        compositionTopology: { hero: "type-led-statement" },
      }),
    ).toBe(false);
  });

  it("fails a mobile split-media hero with only 154px of visible media", () => {
    expect(
      hardFailures(evidence(), { name: "mobile" }, {
        requiresMobileMedia: true,
      }),
    ).toContain(
      "hero media is not visible enough in the mobile first viewport",
    );
  });

  it("passes a mobile hero with enough visible media", () => {
    expect(
      hardFailures(
        evidence({ heroMediaVisibleHeight: 240 }),
        { name: "mobile" },
        { requiresMobileMedia: true },
      ),
    ).not.toContain(
      "hero media is not visible enough in the mobile first viewport",
    );
  });

  it("does not apply the media gate to a utility-panel route", () => {
    expect(
      hardFailures(evidence(), { name: "mobile" }, {
        requiresMobileMedia: false,
      }),
    ).not.toContain(
      "hero media is not visible enough in the mobile first viewport",
    );
  });

  it("states the visible media minimum and the above-the-fold rule", () => {
    const contract = mobileHeroFitContract({
      route: { compositionTopology: { hero: "split-media" } },
    });
    expect(contract).toContain("MOBILE HERO FIT CONTRACT");
    expect(contract).toContain(String(MOBILE_HERO_MEDIA_MIN_VISIBLE));
    expect(contract).toContain("first viewport");
    expect(contract).toContain("Do not push the media below the copy");
    expect(
      mobileHeroFitContract({
        route: { compositionTopology: { hero: "utility-panel" } },
      }),
    ).toBe("");
  });
});
