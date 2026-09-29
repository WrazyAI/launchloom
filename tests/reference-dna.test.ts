import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { buildReferenceDna, normalizeSectionSequence, validateReferenceDna } from "../scripts/reference-dna.mjs";
import { mergeInspirationRegistries, normalizeA1ReferenceLibrary } from "../scripts/a1-reference-library.mjs";

const registry = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8"));
const a1Library = JSON.parse(fs.readFileSync("data/a1-reference-library.json", "utf8"));
const fullRegistry = mergeInspirationRegistries(
  registry,
  normalizeA1ReferenceLibrary(a1Library, { repositoryRoot: path.resolve(".") }),
);

describe("Reference DNA", () => {
  it("keeps registry evidence in tracked repository paths", () => {
    for (const record of registry.records) {
      expect(record.screenshotPath).toBeTruthy();
      expect(record.screenshotPath).not.toMatch(/^artifacts\//u);
      expect(fs.existsSync(path.resolve(record.screenshotPath))).toBe(true);
      if (record.mobileScreenshotPath) {
        expect(record.mobileScreenshotPath).not.toMatch(/^artifacts\//u);
        expect(fs.existsSync(path.resolve(record.mobileScreenshotPath))).toBe(true);
      }
    }
  });

  it("binds each active screenshot to its explicit reference family rather than Kokoro fallback DNA", () => {
    const desktopPaths = fullRegistry.records.map((record: any) => record.screenshotPath);
    expect(new Set(desktopPaths).size).toBe(desktopPaths.length);

    for (const record of fullRegistry.records) {
      const referenceFamilyId = record.referenceFamilyId || record.familyId;
      expect(referenceFamilyId, `${record.id} must declare its reference family`).toBeTruthy();
      const dna = buildReferenceDna({
        ...record,
        referenceFamilyId,
        referenceName: record.referenceName || record.name,
        referenceNotes: record.referenceNotes || record.notes,
      });

      expect(dna.familyId, record.id).toBe(referenceFamilyId);
      expect(dna.evidence.desktopScreenshot.path, record.id).toBe(record.screenshotPath);
      expect(dna.evidence.desktopScreenshot.available, record.id).toBe(true);
      if (record.id !== "kokoro-spatial-editorial")
        expect(dna.referenceName, record.id).not.toBe("Kokoro-style editorial architecture");
      expect(validateReferenceDna(dna)).toBe(dna);
    }
  });

  it("keeps unsupported screenshot claims retired and outside the active pool", () => {
    const activeIds = new Set(fullRegistry.records.map((record: any) => record.id));
    const retired = new Map(registry.retiredRecords.map((record: any) => [record.id, record]));

    for (const id of ["neo-museum-object-stage", "prompt-fashion-archive"]) {
      expect(activeIds.has(id)).toBe(false);
      expect(retired.get(id)).toMatchObject({
        retiredBecause: expect.any(String),
      });
    }
  });

  it("compiles complete evidence-backed contracts for routes", () => {
    const pack = buildInspirationPack({ seed: "dna-test", industry: "fine-jewelry", styleTerms: [], recentReferenceIds: [], recentRouteSignatures: [] }, registry);
    const dna = pack.routes[0].referenceDna;
    expect(dna.familyId).toBeTruthy();
    expect(dna.evidence.desktopScreenshot.available).toBe(true);
    expect(dna.sectionSequence.length).toBeGreaterThan(4);
    expect(dna.requiredSignatureElements.length).toBeGreaterThan(1);
    expect(validateReferenceDna(dna)).toBe(dna);
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
    const records = registry.records.slice(0, 3).map((record: any) => ({ ...record, screenshotPath: "", mobileScreenshotPath: "" }));
    expect(() => buildInspirationPack({ seed: "missing-pack", industry: "all", styleTerms: [], recentReferenceIds: [], recentRouteSignatures: [] }, { version: 1, records })).toThrow(/(?:Reference DNA|three structurally independent)/iu);
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

  it("preserves section IDs and route geometry for a newly curated reference family", () => {
    expect(normalizeSectionSequence([
      "hero",
      "practice-statement",
      "project-index",
      "services",
      "contact",
    ], "newly-curated-family")).toEqual([
      "hero",
      "practice-statement",
      "project-index",
      "services",
      "contact",
    ]);

    const dna = buildReferenceDna({
      id: "newly-curated-family",
      referenceFamilyId: "newly-curated-family",
      referenceName: "Asymmetric project archive",
      source: "test reference",
      rights: "reference-only",
      screenshotPath: "tests/fixtures/reference.png",
      navigation: "micro utility row",
      heroGeometry: "full-bleed graphic color field",
      servicePresentation: "asymmetric project archive and service index",
      sectionRhythm: "graphic opening to projects to services",
      typographyCategory: "heavy grotesk with serif accents",
      imageStrategy: "varied architectural project crops",
      mobileBehavior: "stack project notes between image chapters",
      motionOpportunities: ["scroll reveal"],
    });

    expect(dna.familyId).toBe("newly-curated-family");
    expect(dna.heroGeometry.mode).toBe("full-bleed graphic color field");
    expect(dna.navigationGeometry.mode).toBe("micro utility row");
    expect(dna.sectionSequence).toEqual(["hero", "services", "faq", "contact"]);
    expect(dna.referenceName).toBe("Asymmetric project archive");
    expect(dna.referenceName).not.toBe("Kokoro-style editorial architecture");
  });

  it("selects the neighborhood collage contract for food and market cues", () => {
    const pack = buildInspirationPack({
      seed: "neighborhood-collage-test",
      industry: "food",
      styleTerms: ["neighborhood", "collage", "market", "shelf"],
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, registry);
    const route = pack.routes[0];
    expect(route.label).toBe("Neighborhood Collage");
    expect(route.referenceDna.familyId).toBe("neighborhood-table-collage");
    expect(route.familyId).toBe("market-collage");
    expect(route.referenceDna.requiredSignatureElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "collage-hero" }),
        expect.objectContaining({ id: "seasonal-shelf" }),
      ]),
    );
  });
});
