import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { buildReferenceDna, normalizeReferenceDna, normalizeSectionSequence, validateReferenceDna } from "../scripts/reference-dna.mjs";

const registry = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8"));

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

  it("migrates failed analyzer prose to stable IDs and keeps the visual requirements", () => {
    const migrated = normalizeReferenceDna({
      version: 2,
      familyId: "a1-collage-composition",
      sectionSequence: [
        "contained layered collage hero",
        "large off-white breathing space",
        "centered feature-introduction heading",
        "five-item annotated capability row with tiny line icons",
        "centered people-use heading",
        "colorful portrait/testimonial card row beginning at the fold",
      ],
    } as any);
    expect(migrated.sectionSequence).toEqual([
      "hero",
      "feature-atlas",
      "image-mosaic",
      "annotation-rail",
      "conversion-band",
      "contact",
    ]);
    expect(migrated.sectionSequenceEvidence[0]).toBe(
      "contained layered collage hero",
    );
    expect(migrated.sectionBlueprint.map((item: any) => item.id)).toEqual(
      migrated.sectionSequence,
    );
    expect(migrated.sectionBlueprint[0].visualRequirement).toContain(
      "contained layered collage hero",
    );
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
