import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { applyMeasuredReferenceAnalysis } from "../scripts/analyze-reference-dna.mjs";
import { buildReferenceDna, normalizeSectionSequence, validateReferenceDna } from "../scripts/reference-dna.mjs";

const registry = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8"));
const core = JSON.parse(fs.readFileSync("data/reference-library/core-collection.json", "utf8"));
const coreIds = new Set(core.niches.flatMap((niche: any) => niche.referenceIds));
const productionRegistry = {
  ...registry,
  records: registry.records.filter((record: any) => coreIds.has(record.id)),
};

describe("Reference DNA", () => {
  it("keeps registry evidence in tracked repository paths", () => {
    for (const record of productionRegistry.records) {
      expect(record.screenshotPath).toBeTruthy();
      expect(record.screenshotPath).not.toMatch(/^artifacts\//u);
      expect(fs.existsSync(path.resolve(record.screenshotPath))).toBe(true);
      if (record.mobileScreenshotPath) {
        expect(record.mobileScreenshotPath).not.toMatch(/^artifacts\//u);
        expect(fs.existsSync(path.resolve(record.mobileScreenshotPath))).toBe(true);
      }
    }
  });

  it("compiles complete evidence-backed contracts for routes", () => {
    const pack = buildInspirationPack({ seed: "dna-test", industry: "home-services", styleTerms: [], recentReferenceIds: [], recentRouteSignatures: [] }, productionRegistry);
    const dna = pack.routes[0].referenceDna;
    expect(dna.familyId).toBeTruthy();
    expect(dna.evidence.desktopScreenshot.available).toBe(true);
    expect(dna.sectionSequence.length).toBeGreaterThan(4);
    expect(dna.requiredSignatureElements.length).toBeGreaterThan(1);
    expect(validateReferenceDna(dna)).toBe(dna);
  });

  it("adds measured pixels without rewriting curated section, service, or motion intent", () => {
    const pack = buildInspirationPack(
      { seed: "dna-contract-preservation", industry: "architecture", styleTerms: [], recentReferenceIds: [], recentRouteSignatures: [] },
      productionRegistry,
    );
    const route = pack.routes.find((item: any) => item.referenceDossier.id === "lapa-mcalpine-sanctuary");
    if (!route) throw new Error("The expected architecture dossier was not selected.");
    const original = route.referenceDna;
    const measured = applyMeasuredReferenceAnalysis(route, {
      annotatedDescription: "Measured from desktop and mobile screenshots.",
      measurements: {
        headlineWidthRatio: 0.72,
        headlineHeightRatio: 0.18,
        heroImageOccupancyRatio: 0.68,
        contentColumnWidthRatio: 0.71,
        navTopRatio: 0.03,
        navSideInsetRatio: 0.04,
        ctaTopRatio: 0.68,
        dominantSectionHeightRatios: [0.7, 0.6, 0.8],
        imageAspectRatios: [1.5],
        overlapRelationships: [],
        surfaceTransitions: ["image to dark footer"],
        mobile: {
          headlineWidthRatio: 0.9,
          imageOccupancyRatio: 0.55,
          ctaTopRatio: 1.1,
          contentInsetRatio: 0.06,
        },
      },
      captureDimensions: { desktop: { width: 1440, height: 4000 }, mobile: { width: 390, height: 6000 } },
    }).referenceDna;

    expect(measured.sectionSequence).toEqual(original.sectionSequence);
    expect(measured.servicePresentation).toEqual(original.servicePresentation);
    expect(measured.ctaPlacement).toEqual(original.ctaPlacement);
    expect(measured.motion).toEqual(original.motion);
    expect(measured.requiredSignatureElements).toEqual(original.requiredSignatureElements);
    expect(measured.measurements.headlineWidthRatio).toBe(0.72);
    expect(measured.evidence.pixelAnalysisSummary).toContain("Measured from");
    expect(measured.evidence.annotatedDescription).toBe(original.evidence.annotatedDescription);
  });

  it("fails closed when the required desktop screenshot is missing", () => {
    const dna = buildReferenceDna({
      id: "missing-evidence",
      source: "test",
      rights: "reference-only",
      screenshotPath: "does-not-exist.png",
      heroGeometry: "typographic-monument",
    });
    expect(dna.complete).toBe(false);
    expect(() => validateReferenceDna(dna, { requireEvidence: true })).toThrow(/desktop reference screenshot/iu);
  });

  it("does not allow an incomplete registry to compile a creative pack", () => {
    const homeServicesIds = new Set(
      core.niches.find((niche: any) => niche.businessKind === "home-services").referenceIds,
    );
    const records = productionRegistry.records
      .filter((record: any) => homeServicesIds.has(record.id))
      .slice(0, 2);
    expect(() => buildInspirationPack({ seed: "missing-pack", industry: "home-services", styleTerms: [], recentReferenceIds: [], recentRouteSignatures: [] }, { version: 1, records })).toThrow(/business-matched dossiers/iu);
  });

  it("normalizes analyzer prose into enforceable family section IDs", () => {
    expect(normalizeSectionSequence([
      "hero monument with oversized serif title",
      "wide horizontal image collage / triptych",
      "full-width article ledger rows",
      "full-bleed cinematic architectural image",
    ], "kokoro-editorial-architecture")).toEqual([
      "hero",
      "image-mosaic",
      "magazine-archive",
      "closing-scene",
    ]);
  });

  it("selects only cleared restaurant dossiers for food and market cues", () => {
    const pack = buildInspirationPack({
      seed: "neighborhood-collage-test",
      industry: "food",
      styleTerms: ["neighborhood", "collage", "market", "shelf"],
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, productionRegistry);
    const restaurantIds = new Set(
      core.niches.find((niche: any) => niche.businessKind === "restaurant").referenceIds,
    );
    expect(pack.routes).toHaveLength(3);
    expect(pack.routes.every((route: any) => restaurantIds.has(route.referenceIds[0]))).toBe(true);
    expect(pack.routes.every((route: any) => route.referenceDna.evidence.desktopScreenshot.available)).toBe(true);
  });
});
