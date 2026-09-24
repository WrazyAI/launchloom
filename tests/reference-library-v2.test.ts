import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import {
  loadReferenceLibraryV2,
  normalizeReferenceLibraryV2,
} from "../scripts/reference-library-v2.mjs";
import {
  enrichInspirationPack,
} from "../scripts/analyze-reference-dna.mjs";
import { promptImageDimensions } from "../scripts/prompt-evidence.mjs";

const root = path.resolve(".");
const raw = JSON.parse(
  fs.readFileSync("data/reference-library-v2.json", "utf8"),
);

describe("Reference Library v2", () => {
  it("ships exactly 30 production-grade owned references", () => {
    const library = normalizeReferenceLibraryV2(raw, {
      repositoryRoot: root,
    });
    expect(library.records).toHaveLength(30);
    expect(new Set(library.records.map((record: any) => record.id)).size).toBe(30);
    expect(
      library.records.every(
        (record: any) =>
          record.rights === "owned" &&
          record.evidenceTier === "production" &&
          record.sourceCategory === "owned-normalized-reference",
      ),
    ).toBe(true);
  });

  it("requires unique desktop and mobile evidence for every reference", () => {
    const library = normalizeReferenceLibraryV2(raw, {
      repositoryRoot: root,
    });
    const paths = library.records.flatMap((record: any) => [
      record.screenshotPath,
      record.mobileScreenshotPath,
    ]);
    expect(paths).toHaveLength(60);
    expect(new Set(paths).size).toBe(60);
    for (const evidencePath of paths) {
      expect(evidencePath).toMatch(/^data\/inspiration-evidence\/reference-v2\//u);
      expect(fs.existsSync(path.resolve(evidencePath))).toBe(true);
    }
  });

  it("covers local service industries directly instead of relying on generic all-industry tags", () => {
    const library = normalizeReferenceLibraryV2(raw, {
      repositoryRoot: root,
    });
    expect(
      library.records.filter((record: any) =>
        record.industries.includes("home-services"),
      ).length,
    ).toBeGreaterThanOrEqual(8);
    for (const industry of [
      "painting",
      "hvac",
      "plumbing",
      "roofing",
      "landscaping",
      "automotive",
      "dental",
      "real-estate",
    ]) {
      expect(
        library.records.some((record: any) => record.industries.includes(industry)),
      ).toBe(true);
    }
  });

  it("keeps curated research provenance separate from owned production evidence", () => {
    const library = normalizeReferenceLibraryV2(raw, {
      repositoryRoot: root,
    });
    expect(library.researchSources.galleries).toEqual(
      expect.arrayContaining([
        "https://www.a1.gallery/",
        "https://www.lapa.ninja/",
        "https://www.siteinspire.com/",
        "https://www.awwwards.com/",
      ]),
    );
    for (const record of library.records) {
      expect(record.provenance.externalInfluences.length).toBeGreaterThan(0);
      expect(
        record.provenance.externalInfluences.every((value: string) =>
          value.startsWith("https://"),
        ),
      ).toBe(true);
      expect(record.screenshotPath).toContain(
        "data/inspiration-evidence/reference-v2/",
      );
      expect(record.sourceCategory).toBe("owned-normalized-reference");
    }
  });

  it("stores a structured template and canonical DNA on every reference", () => {
    const library = normalizeReferenceLibraryV2(raw, {
      repositoryRoot: root,
    });
    for (const record of library.records) {
      expect(record.designTemplate).toMatchObject({
        layoutArchetype: expect.any(String),
        navigationPattern: expect.any(String),
        servicePattern: expect.any(String),
        surfaceSystem: expect.any(Object),
        typeSystem: expect.any(Object),
        imageSystem: expect.any(Object),
        spacingSystem: expect.any(Object),
        conversionSystem: expect.any(Object),
        responsiveSystem: expect.any(Object),
        compositionSystem: expect.any(Object),
        desktopBlueprint: expect.any(Object),
        mobileBlueprint: expect.any(Object),
        sectionBlueprint: expect.any(Array),
        interactionSystem: expect.any(Object),
        signatureRequirements: expect.any(Array),
        acceptanceChecks: expect.any(Array),
        adaptationRules: expect.any(Object),
      });
      expect(record.designTemplate.sectionBlueprint.length).toBeGreaterThanOrEqual(4);
      expect(record.designTemplate.mobileBlueprint.targetViewport).toBe("390x844");
      expect(record.canonicalReferenceDna).toMatchObject({
        canonical: true,
        familyId: record.familyId,
        referenceName: record.name,
        measurements: expect.any(Object),
      });
    }
  });

  it("rejects reused visual evidence even when the paths differ", () => {
    const broken = structuredClone(raw);
    broken.records[1].screenshotPath = broken.records[0].screenshotPath;
    expect(() =>
      normalizeReferenceLibraryV2(broken, { repositoryRoot: root }),
    ).toThrow(/reuses visual evidence|byte-identical visual evidence/iu);
  });

  it("rejects duplicate structural signatures", () => {
    const broken = structuredClone(raw);
    for (const key of [
      "navigation",
      "heroGeometry",
      "servicePresentation",
      "typographyCategory",
      "sectionRhythm",
      "imageStrategy",
    ])
      broken.records[1][key] = broken.records[0][key];
    expect(() =>
      normalizeReferenceLibraryV2(broken, { repositoryRoot: root }),
    ).toThrow(/structural signature/iu);
  });

  it("renders SVG desktop and mobile evidence through the prompt pipeline", async () => {
    const library = await loadReferenceLibraryV2(
      "data/reference-library-v2.json",
      { repositoryRoot: root },
    );
    const desktop = await promptImageDimensions(
      library.records[0].screenshotPath,
    );
    const mobile = await promptImageDimensions(
      library.records[0].mobileScreenshotPath,
    );
    expect(desktop).toEqual({ width: 1200, height: 1200 });
    expect(mobile).toEqual({ width: 390, height: 844 });
  });

  it("keeps canonical DNA stable without an OpenRouter analyzer call", async () => {
    const priorKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const library = await loadReferenceLibraryV2(
        "data/reference-library-v2.json",
        { repositoryRoot: root },
      );
      const pack = buildInspirationPack(
        {
          seed: "canonical-reference-test",
          industry: "home-services",
          styleTerms: ["technical", "structured"],
          styleText: "",
          recentReferenceIds: [],
          recentFamilyIds: [],
          recentRouteSignatures: [],
          referenceCalibration: library.calibration,
        },
        library,
      );
      const before = structuredClone(pack.routes[0].referenceDna);
      const enriched = await enrichInspirationPack(pack, {
        fetchImpl: async () => {
          throw new Error("canonical references must not call OpenRouter");
        },
      });
      const after = enriched.routes[0].referenceDna;
      expect(after.analyzerModel).toBe("canonical-reference-v2");
      expect(after.heroGeometry).toEqual(before.heroGeometry);
      expect(after.servicePresentation).toEqual(before.servicePresentation);
      expect(after.mobileRecomposition).toEqual(before.mobileRecomposition);
      expect(after.measurements).toEqual(before.measurements);
      expect(after.evidence.captureDimensions).toMatchObject({
        desktop: { width: 1200, height: 1200 },
        mobile: { width: 390, height: 844 },
      });
    } finally {
      if (priorKey) process.env.OPENROUTER_API_KEY = priorKey;
      else delete process.env.OPENROUTER_API_KEY;
    }
  });

  it.each([
    [
      "automotive",
      "Use the A1 MCKP Object Stage reference mechanics.",
      "a1-mckp-object-stage",
    ],
    [
      "home-services",
      "Use the A1 SCS Kinetic Command reference mechanics.",
      "a1-scs-kinetic-command",
    ],
    [
      "home-services",
      "Use the A1 Craft Collage Field reference mechanics.",
      "a1-craft-collage-field",
    ],
  ])(
    "preserves explicit reference requests in the production library: %s",
    async (industry, styleText, expectedReference) => {
      const library = await loadReferenceLibraryV2(
        "data/reference-library-v2.json",
        { repositoryRoot: root },
      );
      const pack = buildInspirationPack(
        {
          seed: `explicit-${expectedReference}`,
          industry,
          styleTerms: styleText
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, " ")
            .split(/\s+/u)
            .filter(Boolean),
          styleText,
          recentReferenceIds: [expectedReference],
          recentFamilyIds: [],
          recentRouteSignatures: [],
        },
        library,
      );
      expect(pack.routes[0].referenceIds).toEqual([expectedReference]);
      expect(pack.routes[0].explicitReferenceMatch).toBe(true);
    },
  );

  it("selects actual local-service families for a home-services request", async () => {
    const library = await loadReferenceLibraryV2(
      "data/reference-library-v2.json",
      { repositoryRoot: root },
    );
    const pack = buildInspirationPack(
      {
        seed: "hvac-library-coverage",
        industry: "home-services",
        styleTerms: ["technical", "precise", "service"],
        styleText: "",
        recentReferenceIds: [],
        recentFamilyIds: [],
        recentRouteSignatures: [],
      },
      library,
    );
    expect(pack.routes).toHaveLength(3);
    expect(
      pack.routes.some((route) =>
        [
          "emergency-command",
          "blueprint-ledger",
          "kinetic-command",
          "roofline",
          "route-map",
        ].includes(route.familyId),
      ),
    ).toBe(true);
  });
});
