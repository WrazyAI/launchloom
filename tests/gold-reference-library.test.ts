import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compatibilityScore,
  goldReferenceEligibility,
  inferReferenceCompatibility,
  normalizeGoldReferenceLibrary,
  productionGoldRegistry,
} from "../scripts/gold-reference-library.mjs";

const raw = JSON.parse(
  fs.readFileSync(
    path.resolve("data/gold-reference-candidates.json"),
    "utf8",
  ),
);
const library = normalizeGoldReferenceLibrary(raw);

describe("Gold Reference Library", () => {
  it("starts with twenty unique, diverse research candidates", () => {
    expect(library.records).toHaveLength(20);
    expect(
      new Set(library.records.map((record: any) => record.id)).size,
    ).toBe(20);
    expect(
      new Set(
        library.records.map((record: any) => record.proposedFamilyId),
      ).size,
    ).toBeGreaterThanOrEqual(7);
    expect(
      new Set(
        library.records.flatMap((record: any) => record.industries),
      ).size,
    ).toBeGreaterThanOrEqual(15);
  });

  it("keeps every unreviewed candidate out of production", async () => {
    const registry = await productionGoldRegistry(raw, {
      repositoryRoot: process.cwd(),
      fsImpl: { access: async () => undefined },
    });

    expect(registry.records).toHaveLength(0);
    expect(registry.excluded).toHaveLength(20);
    expect(
      registry.excluded.every((item: any) =>
        item.reasons.includes("status is not approved"),
      ),
    ).toBe(true);
  });

  it("requires a reviewed owned translation and all evidence files", async () => {
    const reference = structuredClone(library.records[0]);
    reference.status = "approved";
    reference.admission = {
      designReviewed: true,
      mobileReviewed: true,
      assetRecipeReviewed: true,
      validationPass: true,
      desktopScreenshotPath: "desktop.png",
      compactScreenshotPath: "compact.png",
      mobileScreenshotPath: "mobile.png",
      referenceDnaPath: "reference-dna.json",
    };
    reference.ownedTranslationId = "owned-test-translation";
    const result = await goldReferenceEligibility(reference, {
      repositoryRoot: process.cwd(),
      fsImpl: { access: async () => undefined },
    });
    expect(result).toEqual({ eligible: true, reasons: [] });
  });

  it("gives every candidate an implementation-oriented asset recipe", () => {
    for (const record of library.records) {
      expect(record.assetRecipe.minimumAssets).toBeGreaterThan(0);
      expect(record.assetRecipe.preferredAssets).toBeGreaterThanOrEqual(
        record.assetRecipe.minimumAssets,
      );
      expect(record.assetRecipe.placements.length).toBeGreaterThanOrEqual(
        record.assetRecipe.minimumAssets,
      );
      expect(record.assetRecipe.cohesionRule.length).toBeGreaterThan(20);
      for (const placement of record.assetRecipe.placements) {
        expect(placement.role).not.toBe("");
        expect(placement.composition).not.toBe("");
        expect(placement.mobile).not.toBe("");
      }
    }
  });

  it("penalizes high-asset families when the business has weak imagery", () => {
    const highDemand = library.records.find(
      (record: any) => record.feasibility.assetDemand === "high",
    );
    expect(highDemand).toBeTruthy();

    const low = compatibilityScore(highDemand, {
      compatibility: { assetAvailability: "low" },
    });
    const high = compatibilityScore(highDemand, {
      compatibility: { assetAvailability: "high" },
    });
    expect(high - low).toBeGreaterThanOrEqual(36);
  });

  it("maps scheduling CTAs and single service areas correctly", () => {
    expect(
      inferReferenceCompatibility(
        {
          business: {
            primaryCta: "Schedule a Visit",
            serviceAreas: ["Greater Phoenix"],
          },
        },
        {},
      ),
    ).toMatchObject({
      conversionMode: "booking",
      locality: "service-area",
    });
  });

  it("keeps facility semantics out of locality metadata", () => {
    for (const id of [
      "gold-future-performance-health",
      "gold-google-team-usa-spatial-sport",
    ]) {
      const record = library.records.find((item: any) => item.id === id);
      expect(record?.compatibility.locality).toContain("single-location");
      expect(record?.compatibility.locality).not.toContain(
        "physical-facility",
      );
      expect(record?.compatibility.businessKinds).toContain(
        "physical-facility",
      );
    }
  });

  it("records desktop, compact, and mobile capture requirements", () => {
    for (const record of library.records) {
      expect(record.capture.viewports).toEqual(
        expect.arrayContaining([
          "1536x864",
          "1366x768",
          "390x844",
        ]),
      );
      expect(record.capture.captureFullPage).toBe(true);
      expect(record.capture.captureSectionCrops).toBe(true);
      expect(record.capture.measureGeometry).toBe(true);
    }
  });
});
