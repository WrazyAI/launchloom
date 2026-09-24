import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";

const registry = JSON.parse(
  fs.readFileSync(path.resolve("data/inspiration-registry.json"), "utf8"),
);
const a1Registry = JSON.parse(
  fs.readFileSync(path.resolve("data/a1-reference-library.json"), "utf8"),
);
const mergedRegistry = {
  ...registry,
  records: [
    ...registry.records,
    ...a1Registry.records.filter(
      (record: any) =>
        !registry.records.some((existing: any) => existing.id === record.id),
    ),
  ],
};

const jewelryRequest = {
  seed: "intake-33-maison-orphee",
  industry: "fine-jewelry",
  styleTerms: ["luxury", "nocturnal", "editorial", "precise"],
  recentReferenceIds: [],
  recentRouteSignatures: [],
};

describe("inspiration registry", () => {
  it("builds three reproducible, structurally independent creative routes", () => {
    const first = buildInspirationPack(jewelryRequest, registry);
    const second = buildInspirationPack(jewelryRequest, registry);

    expect(first).toEqual(second);
    expect(first.routes).toHaveLength(3);
    expect(
      new Set(first.routes.flatMap((route: any) => route.referenceIds)).size,
    ).toBe(first.routes.flatMap((route: any) => route.referenceIds).length);
    for (const field of [
      "navigation",
      "heroGeometry",
      "servicePresentation",
      "typographyCategory",
    ]) {
      expect(new Set(first.routes.map((route: any) => route[field])).size).toBe(
        3,
      );
    }
    expect(
      new Set(first.routes.map((route: any) => route.signature)).size,
    ).toBe(3);
  });

  it("excludes recently used references and route signatures", () => {
    const initial = buildInspirationPack(jewelryRequest, registry);
    const next = buildInspirationPack(
      {
        ...jewelryRequest,
        recentReferenceIds: initial.routes.flatMap(
          (route: any) => route.referenceIds,
        ),
        recentRouteSignatures: [initial.routes[0].signature],
      },
      registry,
    );

    expect(next.routes.flatMap((route: any) => route.referenceIds)).not.toEqual(
      expect.arrayContaining(
        initial.routes.flatMap((route: any) => route.referenceIds),
      ),
    );
    expect(next.routes.map((route: any) => route.signature)).not.toContain(
      initial.routes[0].signature,
    );
  });

  it("excludes recently attempted route families while fresh alternatives exist", () => {
    const initial = buildInspirationPack(jewelryRequest, mergedRegistry);
    const recentFamily = initial.routes[0].familyId;
    const next = buildInspirationPack(
      {
        ...jewelryRequest,
        recentFamilyIds: [recentFamily],
      },
      mergedRegistry,
    );

    expect(next.request.freshnessFallback).toBe("fresh");
    expect(next.routes.map((route: any) => route.familyId)).not.toContain(
      recentFamily,
    );
  });

  it("preserves reference-only rights and never exposes source assets as usable site assets", () => {
    const pack = buildInspirationPack(jewelryRequest, registry);

    expect(pack.routes.flatMap((route: any) => route.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rights: "reference-only" }),
      ]),
    );
    expect(JSON.stringify(pack)).not.toContain("assetUrl");
    expect(JSON.stringify(pack)).not.toContain("downloadUrl");
  });

  it("relaxes stale-history exclusions when they would make the three-route contract impossible", () => {
    const pack = buildInspirationPack(
      {
        ...jewelryRequest,
        recentRouteSignatures: registry.records
          .map((record: any) =>
            [
              record.navigation,
              record.heroGeometry,
              record.servicePresentation,
              record.typographyCategory,
              record.sectionRhythm,
              record.imageStrategy,
            ].join("|"),
          ),
      },
      registry,
    );

    expect(pack.routes).toHaveLength(3);
    expect([
      "route-signatures-relaxed",
      "families-relaxed",
      "history-relaxed",
    ]).toContain(pack.request.freshnessFallback);
  });

  it.each([
    [
      "Apex Air Conditioning & Heating",
      "home-services",
      "Art direction: A1 SCS Kinetic Command mechanics, translated for a desert HVAC concept.",
      "a1-scs-kinetic-command",
    ],
    [
      "Precision Auto Care",
      "automotive",
      "Art direction: an object-led precision workshop, guided by the A1 MCKP Object Stage reference mechanics.",
      "a1-mckp-object-stage",
    ],
    [
      "Coastal Brush Painting Co.",
      "home-services",
      "Art direction: tactile craft collage inspired by A1 Craft Collage Field.",
      "a1-craft-collage-field",
    ],
  ])(
    "keeps explicit intake reference intent for %s",
    (_business, industry, styleText, expectedReference) => {
      const pack = buildInspirationPack(
        {
          seed: _business,
          industry,
          styleTerms: styleText
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, " ")
            .split(/\s+/u)
            .filter(Boolean),
          styleText,
          recentReferenceIds: [],
          recentRouteSignatures: [],
        },
        mergedRegistry,
      );

      expect(pack.routes[0].referenceIds).toEqual([expectedReference]);
      expect(pack.routes[0].explicitReferenceMatch).toBe(true);
    },
  );

  it.each([
    "Do not use A1 MCKP Object Stage for this client.",
    "Avoid the A1 MCKP Object Stage reference.",
    "Use a clean workshop direction, not A1 MCKP Object Stage.",
    "Choose another design rather than A1 MCKP Object Stage.",
    "Use another reference instead of A1 MCKP Object Stage.",
  ])("does not treat a negated reference mention as an explicit request: %s", (styleText) => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-negated",
        industry: "automotive",
        styleTerms: ["clean", "modern", "workshop"],
        styleText,
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).not.toContain(
      "a1-mckp-object-stage",
    );
    expect(
      pack.routes.flatMap((route: any) => route.referenceIds),
    ).not.toContain("a1-mckp-object-stage");
  });

  it.each([
    "Rather than a grid layout, use A1 MCKP Object Stage.",
    "Instead of generic card walls, use A1 MCKP Object Stage mechanics.",
  ])("treats the request after a rejected design as affirmative: %s", (styleText) => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-rejected-alternative",
        industry: "automotive",
        styleTerms: ["object", "stage"],
        styleText,
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentFamilyIds: ["a1-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).toContain(
      "a1-mckp-object-stage",
    );
    expect(pack.routes[0].referenceIds).toEqual([
      "a1-mckp-object-stage",
    ]);
  });

  it("keeps a later-sentence explicit reference request after an earlier negation", () => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-sentence-scope",
        industry: "automotive",
        styleTerms: ["clean", "modern", "object", "stage"],
        styleText:
          "Don't make it cluttered. Use A1 MCKP Object Stage.",
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).toContain(
      "a1-mckp-object-stage",
    );
    expect(pack.routes[0].referenceIds).toEqual([
      "a1-mckp-object-stage",
    ]);
  });

  it("recognizes curly-apostrophe negation for a named reference", () => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-curly-negation",
        industry: "automotive",
        styleTerms: ["clean", "modern", "workshop"],
        styleText: "Don’t use A1 MCKP Object Stage.",
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).not.toContain(
      "a1-mckp-object-stage",
    );
    expect(
      pack.routes.flatMap((route: any) => route.referenceIds),
    ).not.toContain("a1-mckp-object-stage");
  });

  it("treats a positive request after 'but' as affirmative", () => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-contrast",
        industry: "automotive",
        styleTerms: ["object", "stage"],
        styleText:
          "Do not use A1 MCKP Object Stage as a generic card wall, but use A1 MCKP Object Stage mechanics.",
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentFamilyIds: ["a1-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).toContain(
      "a1-mckp-object-stage",
    );
    expect(pack.routes[0].referenceIds).toEqual([
      "a1-mckp-object-stage",
    ]);
  });

  it.each([
    "Rather use A1 MCKP Object Stage.",
    "Instead use A1 MCKP Object Stage.",
  ])("keeps affirmative contrast phrasing explicit: %s", (styleText) => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-affirmative-contrast",
        industry: "automotive",
        styleTerms: ["object", "stage"],
        styleText,
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentFamilyIds: ["a1-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.request.explicitReferenceIds).toContain(
      "a1-mckp-object-stage",
    );
    expect(pack.routes[0].referenceIds).toEqual([
      "a1-mckp-object-stage",
    ]);
  });

  it("normalizes hyphenated style terms for direct registry callers", () => {
    const target = structuredClone(
      mergedRegistry.records.find(
        (record: any) => record.id === "a1-mckp-object-stage",
      ),
    );
    const craft = structuredClone(
      mergedRegistry.records.find(
        (record: any) => record.id === "a1-craft-collage-field",
      ),
    );
    const kinetic = structuredClone(
      mergedRegistry.records.find(
        (record: any) => record.id === "a1-scs-kinetic-command",
      ),
    );
    target.industries = ["all"];
    target.sourceStyles = ["clean-modern-precision"];
    craft.industries = ["all"];
    craft.sourceStyles = ["tactile-collage"];
    kinetic.industries = ["all"];
    kinetic.sourceStyles = ["kinetic-command"];

    const pack = buildInspirationPack(
      {
        seed: "hyphenated-style-term",
        industry: "all",
        styleTerms: ["clean-modern"],
        styleText: "",
        recentReferenceIds: [],
        recentFamilyIds: [],
        recentRouteSignatures: [],
      },
      { version: 1, records: [craft, kinetic, target] },
    );

    expect(pack.routes[0].referenceIds).toEqual([
      "a1-mckp-object-stage",
    ]);
  });

  it("prioritizes an explicitly named reference even when history recently used it", () => {
    const pack = buildInspirationPack(
      {
        seed: "precision-auto-explicit",
        industry: "automotive",
        styleTerms: ["clean", "modern", "object", "stage", "precision"],
        styleText:
          "Art direction: an object-led workshop guided by the A1 MCKP Object Stage reference mechanics.",
        recentReferenceIds: ["a1-mckp-object-stage"],
        recentRouteSignatures: [],
      },
      mergedRegistry,
    );

    expect(pack.routes[0]).toMatchObject({
      referenceIds: ["a1-mckp-object-stage"],
      explicitReferenceMatch: true,
    });
    expect(pack.request.explicitReferenceIds).toContain(
      "a1-mckp-object-stage",
    );
  });

  it("fails clearly when the registry cannot supply three independent routes", () => {
    expect(() =>
      buildInspirationPack(jewelryRequest, {
        version: 1,
        records: registry.records.slice(0, 2),
      }),
    ).toThrow("three structurally independent creative routes");
  });
});
