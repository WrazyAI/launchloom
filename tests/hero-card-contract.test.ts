import { describe, expect, it } from "vitest";
import {
  HERO_CARD_THRESHOLDS,
  heroCardCoverageFinding,
  routeRequiresFloatingHeroCopy,
} from "../scripts/hero-card-contract.mjs";
import { hardFailures } from "../scripts/run-creative-bakeoff.mjs";
import { targetedRepairGuidance } from "../scripts/creative-repair-loop.mjs";

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
    heroBottom: 685,
    heroActionBottom: 636,
    viewportHeight: 844,
    overflow: false,
    brokenImages: 0,
    emDashes: 0,
    creativeRenderer: "creative-candidate",
    heroCopyAreaRatio: 0.466,
    heroCopyWidthRatio: 0.897,
    heroCopyHeightRatio: 0.519,
    heroCopyMobileAreaRatio: 0.466,
    heroCopyHasBorder: true,
    heroCopyHasOpaqueBackground: true,
    ...overrides,
  };
}

const desktopCard = evidence({
  heroCopyAreaRatio: 0.198,
  heroCopyWidthRatio: 0.344,
  heroCopyHeightRatio: 0.576,
  heroCopyMobileAreaRatio: 0,
  heroBottom: 761,
  heroActionBottom: 674,
  viewportHeight: 864,
});

describe("hero-card fidelity contract", () => {
  it("applies only to media-overlay routes whose copy sits over the image", () => {
    expect(
      routeRequiresFloatingHeroCopy({
        compositionTopology: {
          hero: "media-overlay",
          mediaRelation: "copy-over-media",
        },
      }),
    ).toBe(true);
    // media-leads-copy means the image leads and the copy follows, so a
    // framed copy field below the image is faithful, not a floating hero.
    expect(
      routeRequiresFloatingHeroCopy({
        compositionTopology: {
          hero: "image-led-stage",
          mediaRelation: "media-leads-copy",
        },
        heroGeometry:
          "a full-bleed evening exterior photograph above a dark editorial canvas",
      }),
    ).toBe(false);
    expect(
      routeRequiresFloatingHeroCopy({
        compositionTopology: {
          hero: "centered-field",
          mediaRelation: "copy-over-media",
        },
      }),
    ).toBe(false);
  });

  it("does not apply to split, utility-panel, or text-led references", () => {
    for (const topology of [
      { hero: "split-media", mediaRelation: "side-by-side-fields" },
      { hero: "utility-panel", mediaRelation: "task-panel-in-opening" },
      { hero: "type-led-statement", mediaRelation: "copy-leads-opening" },
      { hero: "editorial-stack", mediaRelation: "vertical-copy-media-stack" },
    ])
      expect(
        routeRequiresFloatingHeroCopy({ compositionTopology: topology }),
      ).toBe(false);
  });

  it("does not apply when the reference explicitly frames its copy", () => {
    for (const geometry of [
      "full-bleed photograph with a bordered card holding the promise",
      "a city panorama behind a centered translucent text panel",
      "a framed editorial statement beside a multi-window image mosaic",
      "a bordered dispatch-status console",
    ])
      expect(
        routeRequiresFloatingHeroCopy({
          compositionTopology: {
            hero: "media-overlay",
            mediaRelation: "copy-over-media",
          },
          heroGeometry: geometry,
        }),
      ).toBe(false);
  });

  it("flags the observed desktop and mobile bordered cards", () => {
    expect(
      heroCardCoverageFinding(desktopCard, {
        mobile: false,
        requiresFloatingCopy: true,
      }),
    ).toContain("large bordered card");
    expect(
      heroCardCoverageFinding(evidence(), {
        mobile: true,
        requiresFloatingCopy: true,
      }),
    ).toContain("large bordered card");
  });

  it("passes a compact scrim behind text only, even when it is opaque", () => {
    for (const hasOpaqueBackground of [false, true])
      expect(
        heroCardCoverageFinding(
          evidence({
            heroCopyAreaRatio: 0.149,
            heroCopyWidthRatio: 0.769,
            heroCopyHeightRatio: 0.194,
            heroCopyMobileAreaRatio: 0.149,
            heroCopyHasBorder: false,
            heroCopyHasOpaqueBackground: hasOpaqueBackground,
          }),
          { mobile: true, requiresFloatingCopy: true },
        ),
      ).toBe("");
  });

  it("names an opaque card when no border is present", () => {
    const finding = heroCardCoverageFinding(
      evidence({ heroCopyHasBorder: false, heroCopyHasOpaqueBackground: true }),
      { mobile: true, requiresFloatingCopy: true },
    );
    expect(finding).toContain("large opaque card");
    expect(finding).not.toContain("large bordered card");
  });

  it("does not flag a bordered card on a text-led or split route", () => {
    expect(
      heroCardCoverageFinding(desktopCard, {
        mobile: false,
        requiresFloatingCopy: false,
      }),
    ).toBe("");
  });

  it("keeps the coverage thresholds explicit and above the observed card", () => {
    expect(desktopCard.heroCopyAreaRatio).toBeLessThan(
      HERO_CARD_THRESHOLDS.desktopArea,
    );
    expect(desktopCard.heroCopyHeightRatio).toBeGreaterThan(
      HERO_CARD_THRESHOLDS.desktopHeight,
    );
    expect(evidence().heroCopyMobileAreaRatio).toBeGreaterThan(
      HERO_CARD_THRESHOLDS.mobileArea,
    );
  });

  it("adds the hero-card finding to the mobile hard failures only for a floating-copy route", () => {
    const failures = hardFailures(evidence(), { name: "mobile" }, {
      requiresFloatingCopy: true,
    });
    expect(failures.join("\n")).toContain("large bordered card");
    const textLed = hardFailures(evidence(), { name: "mobile" }, {
      requiresFloatingCopy: false,
    });
    expect(textLed.join("\n")).not.toContain("large bordered card");
  });

  it("sends the hero-card repair guidance only for a hero-card finding", () => {
    const guidance = targetedRepairGuidance([
      "hero copy is a large bordered card covering 47% of the hero area",
    ]);
    expect(guidance.join("\n")).toContain("HERO CARD FIDELITY");
    expect(guidance.join("\n")).toContain("compact gradient scrim");
    expect(
      targetedRepairGuidance(["missing FAQs section"]).join("\n"),
    ).not.toContain("HERO CARD FIDELITY");
  });
});
