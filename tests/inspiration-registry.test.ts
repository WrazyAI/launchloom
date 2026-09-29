import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildInspirationPack,
  referenceStructuralDistance,
} from "../scripts/inspiration-registry.mjs";
import {
  assertReferenceDossierMatchesRecord,
  assertReferenceDossierPack,
  loadReferenceDossier,
} from "../scripts/reference-dossier.mjs";

const registry = JSON.parse(
  fs.readFileSync(path.resolve("data/inspiration-registry.json"), "utf8"),
);

const baseRequest = {
  seed: "intake-33-maison-orphee",
  industry: "home-care",
  styleTerms: ["care", "editorial", "human"],
  recentReferenceIds: [],
  recentRouteSignatures: [],
};

const temporaryRoots: string[] = [];

describe("inspiration registry", () => {
  it("scores genuinely different reference mechanics farther apart", () => {
    const shared = {
      familyId: "family-a",
      navigation: "compact top navigation",
      heroGeometry: "wide image hero",
      servicePresentation: "service ledger",
      typographyCategory: "editorial serif",
      imageStrategy: "documentary photography",
      canonicalReferenceDna: {
        sectionSequence: ["hero", "services", "process", "proof", "contact"],
        requiredSignatureElements: [
          { id: "hero-image", description: "wide documentary hero image" },
          { id: "service-ledger", description: "linear service ledger" },
        ],
      },
    };
    const nearby = {
      ...shared,
      familyId: "family-b",
      navigation: "compact header navigation",
      heroGeometry: "wide photographic hero",
      servicePresentation: "services ledger",
      typographyCategory: "editorial display serif",
      imageStrategy: "documentary imagery",
    };
    const distant = {
      ...shared,
      familyId: "family-c",
      navigation: "floating corner menu",
      heroGeometry: "oversized typographic monument",
      servicePresentation: "horizontal program bands",
      typographyCategory: "condensed grotesk poster type",
      imageStrategy: "cropped object collage",
      canonicalReferenceDna: {
        sectionSequence: ["poster-hero", "image-mosaic", "program-bands", "story-rail", "contact"],
        requiredSignatureElements: [
          { id: "type-collision", description: "oversized type collides with image crop" },
          { id: "mosaic-rail", description: "asymmetric image mosaic and horizontal rail" },
        ],
      },
    };

    expect(referenceStructuralDistance(shared, distant)).toBeGreaterThan(
      referenceStructuralDistance(shared, nearby),
    );
  });

  it("adds signature-specific acceptance checks to otherwise generic dossiers", () => {
    const av = loadReferenceDossier(
      "data/reference-library/dossiers/web-painting-av",
    );
    const concept = loadReferenceDossier(
      "data/reference-library/dossiers/web-painting-concept-pro",
    );

    expect(av.referenceDna.acceptanceChecks).toContainEqual(
      expect.stringContaining("dusk-house-hero"),
    );
    expect(concept.referenceDna.acceptanceChecks).toContainEqual(
      expect.stringContaining("dark-home-quote-hero"),
    );
    expect(av.referenceDna.acceptanceChecks).not.toEqual(
      concept.referenceDna.acceptanceChecks,
    );
  });

  it("builds three reproducible, structurally independent creative routes", () => {
    const first = buildInspirationPack(baseRequest, registry);
    const second = buildInspirationPack(baseRequest, registry);

    expect(first).toEqual(second);
    expect(first.routes).toHaveLength(3);
    expect(
      new Set(first.routes.flatMap((route: any) => route.referenceIds)).size,
    ).toBe(first.routes.flatMap((route: any) => route.referenceIds).length);
    const structuralFields = [
      "navigation",
      "heroGeometry",
      "servicePresentation",
      "typographyCategory",
    ];
    for (let left = 0; left < first.routes.length; left += 1) {
      for (let right = left + 1; right < first.routes.length; right += 1) {
        const sharedFields = structuralFields.filter(
          (field) => (first.routes[left] as any)[field] === (first.routes[right] as any)[field],
        );
        expect(sharedFields.length).toBeLessThanOrEqual(2);
        expect(
          referenceStructuralDistance(first.routes[left], first.routes[right]),
        ).toBeGreaterThanOrEqual(65);
      }
    }
    expect(
      new Set(first.routes.map((route: any) => route.signature)).size,
    ).toBe(3);
  });

  it("varies the eligible trio across bounded seeds in every core niche", () => {
    const core = JSON.parse(fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"));
    const repositoryRoot = path.resolve(".");
    for (const niche of core.niches) {
      const nicheIds = new Set(niche.referenceIds);
      const selectionRegistry = {
        ...registry,
        records: registry.records.map((record: any) => {
          if (!nicheIds.has(record.id)) return record;
          const dossier = loadReferenceDossier(record.dossierPath, { repositoryRoot });
          expect(dossier.id, `${niche.id}:${record.id}`).toBe(record.id);
          expect(dossier.productionEligible, `${niche.id}:${record.id}`).toBe(true);
          expect(dossier.familyId, `${niche.id}:${record.id}`).toBe(
            record.referenceFamilyId || record.familyId,
          );
          expect(dossier.source.rights, `${niche.id}:${record.id}`).toBe(record.rights);
          assertReferenceDossierMatchesRecord(dossier, record, { repositoryRoot });
          return { ...record, canonicalReferenceDna: dossier.referenceDna };
        }),
      };
      const options = { repositoryRoot, requireDossiers: false };
      const sets = new Set<string>();
      for (const index of [1, 2, 3, 4, 5, 6]) {
        const request = { ...baseRequest, industry: niche.businessKind, styleTerms: [], seed: `rotation-${index}` };
        const first = buildInspirationPack(request, selectionRegistry, options);
        const second = buildInspirationPack(request, selectionRegistry, options);
        expect(first.routes.map((route: any) => route.referenceIds[0]), niche.id).toEqual(
          second.routes.map((route: any) => route.referenceIds[0]),
        );
        const ids = first.routes.map((route: any) => route.referenceIds[0]);
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size, niche.id).toBe(3);
        expect(ids.every((id: string) => niche.referenceIds.includes(id)), niche.id).toBe(true);
        const structuralFields = [
          "navigation",
          "heroGeometry",
          "servicePresentation",
          "typographyCategory",
        ];
        for (let left = 0; left < first.routes.length; left += 1) {
          for (let right = left + 1; right < first.routes.length; right += 1) {
            const sharedFields = structuralFields.filter(
              (field) => (first.routes[left] as any)[field] === (first.routes[right] as any)[field],
            );
            expect(sharedFields.length, `${niche.id}:shared-fields`).toBeLessThanOrEqual(2);
            expect(
              referenceStructuralDistance(first.routes[left], first.routes[right]),
              `${niche.id}:structural-distance`,
            ).toBeGreaterThanOrEqual(65);
          }
        }
        sets.add(ids.sort().join("|"));
      }
      expect(sets.size, niche.id).toBeGreaterThanOrEqual(2);
    }
  }, 120_000);

  it("keeps every core niche balanced over deterministic seed runs", () => {
    const core = JSON.parse(
      fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"),
    );

    for (const niche of core.niches) {
      const counts = new Map<string, number>(
        niche.referenceIds.map((id: string) => [id, 0]),
      );
      const trios = new Set<string>();
      const idsForNiche = new Set(niche.referenceIds);
      const selectionRegistry = {
        ...registry,
        records: registry.records.map((record: any) => {
          if (!idsForNiche.has(record.id)) return record;
          const dossier = loadReferenceDossier(record.dossierPath);
          return { ...record, canonicalReferenceDna: dossier.referenceDna };
        }),
      };

      for (let index = 0; index < 30; index += 1) {
        const pack = buildInspirationPack({
          ...baseRequest,
          industry: niche.businessKind,
          styleTerms: [],
          seed: `long-run-${niche.businessKind}-${index}`,
        }, selectionRegistry, {
          repositoryRoot: path.resolve("."),
          requireDossiers: false,
        });
        const ids = pack.routes.map((route: any) => route.referenceIds[0]);
        expect(ids, niche.businessKind).toHaveLength(3);
        expect(new Set(ids).size, niche.businessKind).toBe(3);
        expect(ids.every((id: string) => idsForNiche.has(id)), niche.businessKind).toBe(true);
        expect(pack.request.selectionHistory.validTrioCount, `${niche.businessKind} eligible trios`).toBeGreaterThanOrEqual(16);
        ids.forEach((id: string) => counts.set(id, (counts.get(id) || 0) + 1));
        trios.add([...ids].sort().join("|"));
      }

      const exposures = [...counts.values()];
      expect(Math.min(...exposures), `${niche.businessKind} minimum exposure`).toBeGreaterThanOrEqual(5);
      expect(Math.max(...exposures), `${niche.businessKind} maximum exposure`).toBeLessThanOrEqual(25);
      expect(trios.size, `${niche.businessKind} unique trios`).toBeGreaterThanOrEqual(9);
    }
  }, 120_000);

  it("uses persisted recent trios to avoid an exact repeat and report the choice", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const first = buildInspirationPack({ ...baseRequest, styleTerms: [], seed: "repeat-risk" }, registry, options);
    const firstIds = first.routes.map((route: any) => route.referenceDossier.id);
    const next = buildInspirationPack({
      ...baseRequest,
      styleTerms: [],
      seed: "repeat-risk",
      recentLaunches: [{ businessKind: "home-care", referenceIds: firstIds, routeSignatures: first.routes.map((route: any) => route.signature) }],
    }, registry, options);
    const nextIds = next.routes.map((route: any) => route.referenceDossier.id);
    expect(buildInspirationPack({
      ...baseRequest,
      styleTerms: [],
      seed: "repeat-risk",
      recentLaunches: [{ businessKind: "home-care", referenceIds: firstIds, routeSignatures: first.routes.map((route: any) => route.signature) }],
    }, registry, options)).toEqual(next);
    expect(nextIds.sort()).not.toEqual([...firstIds].sort());
    expect(next.request.selectedReferenceIds).toEqual(next.routes.map((route: any) => route.referenceDossier.id));
    expect(next.request.selectionHistory).toMatchObject({ recentTrioCount: 1, repeatedRecentTrio: false });
    expect(next.request.selectionHistory.rationale).toMatch(/recent trio/iu);
  });

  it("ignores a mixed-niche history entry instead of treating its matching IDs as a trio", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const initial = buildInspirationPack({ ...baseRequest, styleTerms: [], seed: "mixed-history" }, registry, options);
    const ids = initial.routes.map((route: any) => route.referenceDossier.id);
    const next = buildInspirationPack({
      ...baseRequest,
      styleTerms: [],
      seed: "mixed-history",
      recentReferenceIds: ids,
      recentLaunches: [{ businessKind: "dental", referenceIds: [...ids, "web-dental-gartside-street"] }],
    }, registry, options);
    expect(next.request.recentReferenceSets).toEqual([]);
    expect(next.request.recentReferenceIds).toEqual([]);
    expect(next.routes.map((route: any) => route.referenceDossier.id)).toEqual(ids);
  });

  it("rotates away from a legacy recent trio recorded only by route signatures", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const initial = buildInspirationPack({ ...baseRequest, styleTerms: [], seed: "legacy-patterns" }, registry, options);
    const next = buildInspirationPack({
      ...baseRequest,
      styleTerms: [],
      seed: "legacy-patterns",
      recentRouteSignatures: initial.routes.map((route: any) => route.signature),
    }, registry, options);
    expect(next.routes.map((route: any) => route.referenceDossier.id).sort()).not.toEqual(
      initial.routes.map((route: any) => route.referenceDossier.id).sort(),
    );
  });

  it("explains when a partial recent ID changes exposure ranking", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const seed = "partial-history-rationale";
    const initial = buildInspirationPack({ ...baseRequest, seed, styleTerms: [] }, registry, options);
    const recentId = initial.routes[0].referenceDossier?.id;
    if (!recentId) throw new Error("The initial route is missing its dossier ID.");
    const next = buildInspirationPack({
      ...baseRequest,
      seed,
      styleTerms: [],
      recentLaunches: [{ businessKind: "home-care", referenceIds: [recentId] }],
    }, registry, options);
    expect(next.request.recentReferenceIds).toEqual([recentId]);
    expect(next.request.recentReferenceSets).toEqual([]);
    expect(next.routes.map((route: any) => route.referenceDossier.id)).not.toContain(recentId);
    expect(next.request.selectionHistory.rationale).toMatch(/recent reference.*exposure/iu);
    expect(next.request.selectionHistory.rationale).not.toMatch(/No recent matching trio or pattern/iu);
  });

  it("balances cumulative exposure ahead of one latest-trio overlap", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const seed = "exposure-regression";
    const first = buildInspirationPack({ ...baseRequest, seed, styleTerms: [] }, registry, options);
    const firstIds = first.routes.map((route: any) => route.referenceDossier.id);
    const second = buildInspirationPack({
      ...baseRequest, seed, styleTerms: [],
      recentLaunches: [{ businessKind: "home-care", referenceIds: firstIds }],
    }, registry, options);
    const secondIds = second.routes.map((route: any) => route.referenceDossier.id);
    expect(firstIds.filter((id: string) => secondIds.includes(id))).toHaveLength(0);
    const recentLaunches = [
      ...Array.from({ length: 29 }, () => ({ businessKind: "home-care", referenceIds: firstIds })),
      { businessKind: "home-care", referenceIds: secondIds },
    ];
    const next = buildInspirationPack({ ...baseRequest, seed, styleTerms: [], recentLaunches }, registry, options);
    // This hand-checked independent trio uses one first-set reference and two
    // second-set references, for total exposure 29 + 1 + 1 = 31.
    const lowerExposureAlternative = [
      "attested-angels-on-call-homecare",
      "web-home-care-hp-homecare",
      "web-home-care-ivy-homecare",
    ];
    expect(lowerExposureAlternative.every((id) => [...firstIds, ...secondIds].includes(id))).toBe(true);
    expect(next.request.selectionHistory.repeatedRecentTrio).toBe(false);
    expect(next.request.selectionHistory.selectedExposure).toBeLessThanOrEqual(31);
  });

  it("avoids repeating the recent trio when a niche has more core references", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const initial = buildInspirationPack(baseRequest, registry, options);
    const recentIds = initial.routes.map((route: any) => route.referenceDossier.id);
    const next = buildInspirationPack(
      {
        ...baseRequest,
        recentReferenceIds: recentIds,
        recentRouteSignatures: initial.routes.map((route: any) => route.signature),
      },
      registry,
      options,
    );

    expect(next.request.freshnessFallback).toBe("fresh");
    expect(next.routes.map((route: any) => route.referenceDossier?.id).sort()).not.toEqual(
      [...recentIds].sort(),
    );
  });

  it("anchors the architecture canary to the real McAlpine dossier", () => {
    const pack = buildInspirationPack(
      {
        ...baseRequest,
        seed: "architecture-reference-library-canary",
        industry: "architecture",
        styleTerms: ["McAlpine Sanctuary Index", "editorial", "architectural opening"],
        styleText:
          "Use McAlpine Sanctuary Index mechanics: a full-bleed architectural opening, oversized restrained typography, a narrow project/service index, and a dark contact close.",
      },
      registry,
      { repositoryRoot: path.resolve("."), requireDossiers: true },
    );

    expect(pack.routes[0].referenceDossier?.id).toBe("lapa-mcalpine-sanctuary");
    expect(pack.routes[0].referenceDna.sectionSequence).toEqual(
      expect.arrayContaining([
        "architectural-opening",
        "presentation-frame",
        "vertical-index",
        "dark-navigation-contact",
      ]),
    );
  });

  it("selects only cleared core references and never exposes source assets as usable site assets", () => {
    const pack = buildInspirationPack(baseRequest, registry);

    expect(pack.routes.flatMap((route: any) => route.evidence).every((item: any) =>
      ["licensed", "owned", "permission-cleared"].includes(item.rights),
    )).toBe(true);
    expect(JSON.stringify(pack)).not.toContain("assetUrl");
    expect(JSON.stringify(pack)).not.toContain("downloadUrl");
  });

  it("maps every owned design-family reference to the screenshot produced by that exact variant", () => {
    const expected = {
      "care-image-mosaic": [
        "data/reference-library/dossiers/care-image-mosaic/screenshots/desktop.png",
        "care-modern-clinic-mosaic",
      ],
      "care-concierge-cinematic": [
        "data/reference-library/dossiers/care-concierge-cinematic/screenshots/desktop.png",
        "care-concierge-cinematic",
      ],
      "care-wellness-journal": [
        "data/reference-library/dossiers/care-wellness-journal/screenshots/desktop.png",
        "care-wellness-journal",
      ],
      "trade-project-showcase": [
        "data/reference-library/dossiers/trade-project-showcase/screenshots/desktop.png",
        "trades-project-led",
      ],
      "trades-field-report": [
        "data/reference-library/dossiers/trades-field-report/screenshots/desktop.png",
        "trades-field-report",
      ],
      "quiet-care-consultation": [
        "data/reference-library/dossiers/quiet-care-consultation/screenshots/desktop.png",
        "quiet-care-consultation",
      ],
    };

    for (const [id, [screenshotPath, referenceFamilyId]] of Object.entries(expected)) {
      const record = registry.records.find((item: any) => item.id === id);
      expect(record, id).toMatchObject({ screenshotPath, referenceFamilyId });
      expect(fs.existsSync(path.resolve(screenshotPath)), id).toBe(true);
    }
  });

  it("registers every production-eligible dossier so the randomizer can actually select it", () => {
    const registeredIds = new Set(registry.records.map((record: any) => record.id));
    const dossierRoot = path.resolve("data/reference-library/dossiers");
    const missing: string[] = [];
    for (const entry of fs.readdirSync(dossierRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dossierPath = `data/reference-library/dossiers/${entry.name}`;
      const manifestPath = path.resolve(dossierPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (!manifest.productionEligible) continue;
      const dossier = loadReferenceDossier(dossierPath);
      if (!registeredIds.has(dossier.id)) missing.push(dossier.id);
    }
    expect(missing).toEqual([]);
  });

  it.each([
    ["home-services", new Set(["home-services", "local-trades", "home-repair", "handyman", "roofing", "plumbing", "electrical", "landscaping"])],
    ["beauty", new Set(["beauty", "barbershop", "barber", "mens-grooming", "hair-salon", "hair-stylist", "hair-colorist", "cosmetology", "independent-beauty", "medical-spa", "aesthetic-clinic", "cosmetic-treatment", "med-spa", "clinical-beauty"])],
    ["hospitality", new Set(["hospitality", "boutique-hotel", "design-hotel", "guesthouse", "lodging", "inn", "destination-stay", "resort", "motel"])],
  ])("selects only business-compatible dossiers for the %s niche", (industry, acceptedKinds) => {
    const pack = buildInspirationPack({
      ...baseRequest,
      industry,
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    });
    expect(pack.routes).toHaveLength(3);
    for (const route of pack.routes) {
      const dossier = route.referenceDossier;
      if (!dossier) throw new Error(`Route ${route.id} has no selected dossier.`);
      const businessTags = dossier.tags.business.map((tag: string) =>
        tag.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""),
      );
      expect(businessTags.some((tag: string) => acceptedKinds.has(tag))).toBe(true);
    }
  });

  it.each(["automotive", "jewelry", "event-venue", "wellness", "healthcare"])("fails closed for the out-of-core %s niche rather than borrowing unrelated designs", (industry) => {
    expect(() => buildInspirationPack({
      ...baseRequest,
      industry,
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    })).toThrow(/0 eligible dossier\(s\) matched to/iu);
  });

  it.each(["all", "general", "local-business", "small-business"])("fails closed when business kind %s is too broad", (industry) => {
    expect(() => buildInspirationPack({
      ...baseRequest,
      industry,
    }, registry)).toThrow(/a specific business kind is required/iu);
  });

  it.each(["auto-repair", "hvac", "roofing", "painting"])(
    "selects a business-matched route trio from the six-reference %s niche",
    (industry) => {
      const core = JSON.parse(
        fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"),
      );
      const niche = core.niches.find((entry: any) => entry.businessKind === industry);
      if (!niche) throw new Error(`Missing core niche '${industry}'.`);
      const pack = buildInspirationPack({
        ...baseRequest,
        industry,
        recentReferenceIds: [],
        recentRouteSignatures: [],
      }, registry, {
        repositoryRoot: path.resolve("."),
        requireDossiers: true,
      });
      const selected = new Set(pack.routes.map((route: any) => route.referenceDossier.id));

      expect(pack.routes).toHaveLength(3);
      expect(niche.referenceIds).toHaveLength(6);
      expect(selected.size).toBe(3);
      expect([...selected].every((id) => niche.referenceIds.includes(id))).toBe(true);
      expect(selected.has("attested-future-fitness")).toBe(false);
      expect(selected.has("direct-grlica-law")).toBe(false);
    },
  );

  it("defines an exact 96-dossier core with six verified references per niche and production-randomizer coverage", () => {
    const corePath = path.resolve("data/reference-library/core-collection.json");
    const core = JSON.parse(fs.readFileSync(corePath, "utf8"));
    expect(core.schemaVersion).toBe(1);
    expect(core.id).toBe("local-seo-core-96");
    expect(core.niches).toHaveLength(16);
    expect(core.niches.every((niche: any) => niche.referenceIds.length === 6)).toBe(true);

    const allIds = core.niches.flatMap((niche: any) => niche.referenceIds);
    expect(allIds).toHaveLength(96);
    expect(new Set(allIds).size).toBe(96);

    for (const niche of core.niches) {
      const pack = buildInspirationPack({
        ...baseRequest,
        industry: niche.businessKind,
        recentReferenceIds: [],
        recentRouteSignatures: [],
      }, registry, {
        repositoryRoot: path.resolve("."),
        requireDossiers: true,
      });
      assertReferenceDossierPack(pack, { repositoryRoot: path.resolve(".") });
      const selected = pack.routes.map((route: any) => route.referenceDossier.id);
      expect(selected).toHaveLength(3);
      expect(new Set(selected).size, niche.id).toBe(3);
      expect(selected.every((id: string) => niche.referenceIds.includes(id)), niche.id).toBe(true);

      for (const id of niche.referenceIds) {
        const record = registry.records.find((item: any) => item.id === id);
        expect(record, id).toBeTruthy();
        const dossier = loadReferenceDossier(record.dossierPath);
        expect(dossier.productionEligible, id).toBe(true);
        expect(dossier.source.name, id).not.toMatch(/launchloom owned design study/iu);
        expect(["licensed", "permission-cleared", "owned"], id).toContain(dossier.source.rights);
        expect(dossier.evidence.desktop.fullPage, id).toBe(true);
        expect(dossier.evidence.mobile.fullPage, id).toBe(true);
        if (dossier.source.rights === "permission-cleared") {
          expect(dossier.source.assetEvidencePaths || [], id).not.toContain(
            dossier.source.rightsEvidencePath,
          );
        }
        if (dossier.source.rights === "licensed") {
          expect(dossier.source.assetEvidencePaths?.length || 0, id).toBeGreaterThan(0);
        }
      }
    }
  }, 60_000);

  it("compiles the selected core niche without requiring archived dossier assets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-core-only-checkout-"));
    temporaryRoots.push(root);
    const sourceRoot = path.resolve(".");
    const core = JSON.parse(
      fs.readFileSync(path.join(sourceRoot, "data/reference-library/core-collection.json"), "utf8"),
    );
    const niche = core.niches.find((entry: any) => entry.businessKind === "home-care");
    if (!niche) throw new Error("The core home-care niche is missing.");
    core.niches = [niche];
    const coreDirectory = path.join(root, "data/reference-library");
    const dossierDirectory = path.join(coreDirectory, "dossiers");
    fs.mkdirSync(dossierDirectory, { recursive: true });
    fs.writeFileSync(path.join(coreDirectory, "core-collection.json"), JSON.stringify(core));
    for (const id of niche.referenceIds) {
      const record = registry.records.find((item: any) => item.id === id);
      if (!record) throw new Error(`Core dossier ${id} is not registered.`);
      fs.cpSync(
        path.resolve(sourceRoot, record.dossierPath),
        path.join(dossierDirectory, id),
        { recursive: true },
      );
    }

    const pack = buildInspirationPack({
      ...baseRequest,
      industry: "home-care",
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, registry, { repositoryRoot: root, requireDossiers: true });

    const selectedIds = pack.routes.map((route: any) => route.referenceDossier.id);
    expect(selectedIds).toHaveLength(3);
    expect(new Set(selectedIds).size).toBe(3);
    expect(selectedIds.every((id: string) => niche.referenceIds.includes(id))).toBe(true);
  }, 30_000);

  it("records when history must be relaxed to satisfy the three-route contract", () => {
    const core = JSON.parse(
      fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"),
    );
    const niche = core.niches.find((entry: any) => entry.businessKind === "home-care");
    if (!niche) throw new Error("The home-care core niche is missing.");
    const request = {
      ...baseRequest,
      recentReferenceIds: niche.referenceIds,
    };
    const initial = buildInspirationPack(request, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    });
    expect(initial.request.freshnessFallback).toBe("history-relaxed");
    expect(initial.routes).toHaveLength(3);
    expect(initial.routes.every((route: any) => niche.referenceIds.includes(route.referenceDossier.id))).toBe(true);
  });

  it("uses new approved source dossiers and never recycles the historical LaunchLoom studies", () => {
    const pack = buildInspirationPack(
      { ...baseRequest, industry: "home-services", recentReferenceIds: [], recentRouteSignatures: [] },
      registry,
      { repositoryRoot: path.resolve("."), requireDossiers: true },
    );
    const selectedIds = pack.routes.map((route: any) => route.referenceDossier.id);
    expect(selectedIds).toHaveLength(3);
    expect(new Set(selectedIds).size).toBe(3);
    const selectedRecords = selectedIds.map((id: string) =>
      registry.records.find((record: any) => record.id === id),
    );
    for (const record of selectedRecords) {
      expect(record?.dossierPath).toBeTruthy();
      expect(loadReferenceDossier(record.dossierPath).productionEligible).toBe(true);
    }
    expect(selectedRecords.some((record: any) =>
      record.industries.some((industry: string) => ["home-services", "local-trades", "roofing", "plumbing"].includes(industry)),
    )).toBe(true);
    expect(selectedIds).not.toEqual(expect.arrayContaining([
      "nightjar-cinematic-salon",
      "care-image-mosaic",
      "care-concierge-cinematic",
      "trades-field-report",
      "care-wellness-journal",
      "trade-project-showcase",
      "urgent-trade-service-poster",
      "quiet-care-consultation",
      "neighborhood-table-collage",
      "kinetic-club-program-bands",
      "clear-counsel-ledger",
    ]));
    expect(pack.routes.every((route: any) =>
      ["licensed", "permission-cleared", "owned"].includes(route.referenceDossier.source.rights),
    )).toBe(true);
  });

  it("restricts production references to the requested business kind instead of filling with stylish mismatches", () => {
    const request = {
      ...baseRequest,
      industry: "home-services",
      styleTerms: ["restaurant", "editorial", "warm", "cinematic"],
    };
    const pack = buildInspirationPack(request, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    });
    const acceptedKinds = new Set([
      "home-services", "local-trades", "home-repair", "handyman", "roofing",
      "plumbing", "electrical", "landscaping", "garage-door-repair", "construction",
      "civil-engineering", "groundworks", "storm-repair", "contractor",
    ]);
    expect(pack.routes.every((route: any) =>
      route.referenceDossier.tags.business.some((industry: string) => acceptedKinds.has(industry)),
    )).toBe(true);
    expect(pack.routes.map((route: any) => route.referenceDossier.id)).not.toEqual(
      expect.arrayContaining(["direct-amrit-palace-restaurant", "colorlib-tavola-restaurant"]),
    );

    const narrowRegistry = {
      ...registry,
      records: registry.records.filter((record: any) => [
        "colorlib-caseworth-legal-ledger",
        "colorlib-tavola-restaurant",
        "colorlib-forecourt-showroom",
      ].includes(record.id)),
    };
    expect(() => buildInspirationPack({
      ...request,
      industry: "legal-services",
    }, narrowRegistry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    })).toThrow(/1 eligible dossier\(s\) matched to 'legal-services'.*unrelated industries are not used as filler/iu);
  });

  it("selects distinct production-approved licensed dossiers and rejects stale prompt packs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-approved-library-"));
    temporaryRoots.push(root);
    const allowedIds = [
      "direct-casa-cedo-boutique-hotel",
      "direct-mahala-desert-boutique-hotel",
      "direct-fogo-island-inn-hospitality",
    ];
    fs.mkdirSync(path.join(root, "data/reference-library"), { recursive: true });
    fs.copyFileSync(
      path.resolve("data/reference-library/core-collection.json"),
      path.join(root, "data/reference-library/core-collection.json"),
    );
    const approvedRecords = allowedIds.map((id) => {
      const source = registry.records.find((record: any) => record.id === id);
      if (!source) throw new Error(`Missing test dossier record ${id}.`);
      const dossierRelative = `data/reference-library/dossiers/${id}`;
      const destination = path.join(root, dossierRelative);
      fs.cpSync(path.resolve(source.dossierPath), destination, { recursive: true });
      const manifestPath = path.join(destination, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.productionEligible = true;
      manifest.tags = {
        business: source.industries,
        style: source.moods,
        composition: [source.heroGeometry],
        conversion: [source.servicePresentation],
        motion: source.motionOpportunities,
        imagery: [source.imageStrategy],
      };
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      return {
        ...source,
        dossierPath: dossierRelative,
        screenshotPath: `${dossierRelative}/screenshots/desktop.png`,
        mobileScreenshotPath: `${dossierRelative}/screenshots/mobile.png`,
      };
    });
    const pack = buildInspirationPack(
      {
        ...baseRequest,
        industry: "hospitality",
        recentReferenceIds: [],
        recentRouteSignatures: [],
      },
      { version: 1, updatedAt: "test", records: approvedRecords },
      { repositoryRoot: root, requireDossiers: true },
    );

    expect(assertReferenceDossierPack(pack, { repositoryRoot: root })).toBe(pack);
    expect(pack.routes).toHaveLength(3);
    for (const route of pack.routes) {
      const dossier = route.referenceDossier;
      if (!dossier) throw new Error(`Route ${route.id} has no selected dossier.`);
      expect(dossier).toMatchObject({
        id: expect.any(String),
        source: { rights: expect.stringMatching(/^(?:licensed|permission-cleared)$/u) },
      });
      expect(dossier.designPrompt.length).toBeGreaterThan(900);
      expect(dossier.tags).toMatchObject({
        business: expect.any(Array),
        style: expect.any(Array),
        composition: expect.any(Array),
        conversion: expect.any(Array),
        motion: expect.any(Array),
        imagery: expect.any(Array),
      });
      expect(route.referenceDna.evidence.desktopScreenshot.path).toContain(
        "data/reference-library/dossiers/",
      );
      expect(route.referenceDna.evidence.mobileScreenshot.path).toContain(
        "data/reference-library/dossiers/",
      );
      expect(route.referenceDna.evidence.mobileScreenshot.fullPage).toBe(true);
      expect(route.evidence.every((item: any) => item.rights !== "reference-only")).toBe(true);
    }

    const stalePack = structuredClone(pack);
    const firstRoute = stalePack.routes[0];
    if (!firstRoute?.referenceDossier)
      throw new Error("The generated pack unexpectedly omitted its dossier.");
    firstRoute.referenceDossier.designPrompt += "\nUpdated without recompiling.";
    expect(() => assertReferenceDossierPack(stalePack, { repositoryRoot: root })).toThrow(/design prompt differs/iu);

    const tamperedRights = structuredClone(pack);
    tamperedRights.routes[0]!.referenceDossier!.source.rights = "owned";
    expect(() => assertReferenceDossierPack(tamperedRights, { repositoryRoot: root })).toThrow(/stale or mismatched Reference Dossier/iu);

    const tamperedDna = structuredClone(pack);
    tamperedDna.routes[0].referenceDna.sectionSequence[0] = "generic-replacement";
    expect(() => assertReferenceDossierPack(tamperedDna, { repositoryRoot: root })).toThrow(/curated Reference DNA differs/iu);

    const tamperedViewport = structuredClone(pack);
    tamperedViewport.routes[0].referenceDna.evidence.mobileScreenshot.width += 1;
    expect(() => assertReferenceDossierPack(tamperedViewport, { repositoryRoot: root })).toThrow(/curated Reference DNA differs/iu);
  });

  it("fails closed when a selected core dossier is missing", () => {
    const broken = structuredClone(registry);
    const owned = broken.records.find((item: any) => item.id === "html5up-home-care-story");
    owned.dossierPath = "data/reference-library/dossiers/missing-dossier";
    expect(() => buildInspirationPack(baseRequest, broken, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    })).toThrow(/(?:folder|manifest) is missing/iu);
  });

  it("keeps a fresh route trio when expanded references provide alternatives to old signatures", () => {
    const pack = buildInspirationPack(
      {
        ...baseRequest,
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
    expect(pack.request.freshnessFallback).toBe("fresh");
  });

  it("fails clearly when the registry cannot supply three independent routes", () => {
    expect(() =>
      buildInspirationPack(baseRequest, {
        version: 1,
        records: registry.records.slice(0, 2),
      }),
    ).toThrow("three structurally independent business-matched dossiers");
  });
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
