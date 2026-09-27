import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildInspirationPack, businessKindMatches } from "../scripts/inspiration-registry.mjs";
import { assertIndependentRoutes, familyForRoute } from "../scripts/creative-compiler.mjs";
import { assertReferenceDossierPack, loadReferenceDossier } from "../scripts/reference-dossier.mjs";
import { referenceSelectionContext } from "../scripts/launch-history.mjs";
import { buildSyncedLibraryState } from "../scripts/sync-reference-library.mjs";

const registry = JSON.parse(
  fs.readFileSync(path.resolve("data/inspiration-registry.json"), "utf8"),
);
const coreCollection = JSON.parse(
  fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"),
) as { niches: Array<{ id: string; businessKind: string; referenceIds: string[] }> };
const coreNicheCases = coreCollection.niches.map((niche) => ({ industry: niche.businessKind }));

const baseRequest = {
  seed: "intake-33-maison-orphee",
  industry: "home-care",
  styleTerms: ["care", "editorial", "human"],
  recentReferenceIds: [],
  recentRouteSignatures: [],
};

const temporaryRoots: string[] = [];

function routeSignaturesFor(ids: string[]) {
  return ids.map((id) => {
    const record = registry.records.find((item: any) => item.id === id);
    if (!record) throw new Error(`Reference ${id} is absent from the fixture registry.`);
    return [
      record.navigation,
      record.heroGeometry,
      record.servicePresentation,
      record.typographyCategory,
      record.sectionRhythm,
      record.imageStrategy,
    ].map((value) => String(value).replace(/\s+/gu, " ").trim().slice(0, 80)).join("|");
  });
}

describe("inspiration registry", () => {
  it("builds three reproducible, structurally independent creative routes", () => {
    const first = buildInspirationPack(baseRequest, registry);
    const second = buildInspirationPack(baseRequest, registry);

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

  it("avoids repeating a recent exact trio without hard-banning its references", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const core = JSON.parse(fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"));
    const homeCare = core.niches.find((niche: any) => niche.businessKind === "home-care");
    const recentTrio = homeCare.referenceIds.slice(0, 3).sort();
    const next = buildInspirationPack(
      {
        ...baseRequest,
        recentReferenceIds: recentTrio,
        recentReferenceSets: [recentTrio],
        recentRouteSignatures: routeSignaturesFor(homeCare.referenceIds),
      },
      registry,
      options,
    );

    expect(next.request.freshnessFallback).toBe("fresh");
    expect(next.routes).toHaveLength(3);
    expect(new Set(next.routes.map((route: any) => route.referenceDossier?.id)).size).toBe(3);
    expect(next.routes.map((route: any) => route.referenceDossier.id).sort()).not.toEqual(recentTrio);
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
  }, 20_000);

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

  it("matches business tags without treating visual or conversion tags as business kinds", () => {
    const record = {
      industries: ["accounting"],
      referenceTags: {
        business: ["accounting"],
        style: ["roofing"],
        composition: ["roofing"],
        conversion: ["roofing"],
        motion: ["roofing"],
        imagery: ["roofing"],
      },
    };

    expect(businessKindMatches(record, "accounting")).toBe(true);
    expect(businessKindMatches(record, "roofing")).toBe(false);
    expect(businessKindMatches({ ...record, referenceTags: {
      ...record.referenceTags,
      business: ["roofing"],
    } }, "roofing")).toBe(true);
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

  it.each([
    "home-services",
    "dental",
    "home-care",
    "fitness",
    "restaurant",
    "hospitality",
    "architecture",
    "legal-services",
    "beauty",
    "accounting",
    "auto-repair",
    "hvac",
    "roofing",
    "painting",
  ])("selects an authorable, structurally varied trio from the six-reference %s niche", (industry) => {
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
    const core = JSON.parse(fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"));
    const niche = core.niches.find((entry: any) => entry.businessKind === industry);

    expect(pack.routes).toHaveLength(3);
    expect(niche.referenceIds).toHaveLength(6);
    expect(selected.size).toBe(3);
    expect([...selected].every((id) => niche.referenceIds.includes(id))).toBe(true);
    expect(() => assertIndependentRoutes(pack.routes)).not.toThrow();
    expect(selected.has("attested-future-fitness")).toBe(false);
    expect(selected.has("direct-grlica-law")).toBe(false);
  });

  it("defines an exact 84-dossier core with six verified references per niche and production-randomizer coverage", () => {
    const corePath = path.resolve("data/reference-library/core-collection.json");
    const core = JSON.parse(fs.readFileSync(corePath, "utf8"));
    expect(core.schemaVersion).toBe(1);
    expect(core.id).toBe("local-seo-core-84");
    expect(core.niches).toHaveLength(14);
    expect(core.niches.every((niche: any) => niche.referenceIds.length === 6)).toBe(true);

    const allIds = core.niches.flatMap((niche: any) => niche.referenceIds);
    expect(allIds).toHaveLength(84);
    expect(new Set(allIds).size).toBe(84);
    const productionEligibleIds = fs.readdirSync(path.resolve("data/reference-library/dossiers"))
      .filter((id) => fs.existsSync(path.resolve(`data/reference-library/dossiers/${id}/manifest.json`)))
      .filter((id) => JSON.parse(fs.readFileSync(path.resolve(`data/reference-library/dossiers/${id}/manifest.json`), "utf8")).productionEligible);
    expect(new Set(productionEligibleIds)).toEqual(new Set(allIds));
    const sourceUrls = allIds.map((id: string) => {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(`data/reference-library/dossiers/${id}/manifest.json`), "utf8"));
      const source = new URL(manifest.source.url);
      source.hostname = source.hostname.toLowerCase().replace(/^www\./u, "");
      source.hash = "";
      source.search = "";
      source.pathname = source.pathname.replace(/\/+$/u, "") || "/";
      return source.toString();
    });
    expect(new Set(sourceUrls).size).toBe(84);

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
        expect(dossier.tags.business, id).toContain(niche.businessKind);
        expect(dossier.evidence.desktop.fullPage, id).toBe(true);
        expect(dossier.evidence.mobile.fullPage, id).toBe(true);
        for (const evidencePath of [
          "rights/requester-attestation.md",
          "rights/business-verification.md",
          "rights/capture-record.md",
        ]) {
          if (!fs.existsSync(path.resolve(record.dossierPath, evidencePath))) continue;
          if (evidencePath === dossier.source.rightsEvidencePath)
            expect(dossier.source.provenanceEvidencePaths || [], `${id}: duplicate rights record`).not.toContain(evidencePath);
          else
            expect(dossier.source.provenanceEvidencePaths, `${id}: ${evidencePath}`).toContain(evidencePath);
          expect(dossier.source.assetEvidencePaths || [], `${id}: ${evidencePath}`).not.toContain(evidencePath);
        }
      }
    }

    for (const niche of core.niches) {
      const found = new Set<string>();
      for (let index = 0; index < 40; index += 1) {
        const pack = buildInspirationPack({
          ...baseRequest,
          industry: niche.businessKind,
          seed: `${niche.businessKind}-variation-${index}`,
          styleTerms: [],
          recentReferenceIds: [],
          recentRouteSignatures: [],
        }, registry);
        for (const route of pack.routes) found.add(route.referenceIds[0]);
      }
      expect(found.size, `${niche.businessKind} should expose all six refs across seeded selections`).toBe(6);
    }
  }, 60_000);

  it("keeps the persisted core-to-registry and evidence bindings in sync", () => {
    expect(() => execFileSync(process.execPath, [
      path.resolve("scripts/sync-reference-library.mjs"),
      "--check",
    ], { cwd: process.cwd(), encoding: "utf8" })).not.toThrow();
  });

  it("binds every registered reference screenshot to its canonical dossier", () => {
    const synced = buildSyncedLibraryState({
      core: coreCollection,
      registry,
      repositoryRoot: path.resolve("."),
    });

    for (const record of synced.registry.records) {
      const manifest = synced.manifests.get(record.id)?.manifest;
      expect(manifest, record.id).toBeDefined();
      expect(record.screenshotPath, record.id).toBe(
        `${record.dossierPath}/${manifest.evidence.desktop.path}`,
      );
      expect(record.mobileScreenshotPath, record.id).toBe(
        `${record.dossierPath}/${manifest.evidence.mobile.path}`,
      );
      for (const assetEvidencePath of manifest.source.assetEvidencePaths || [])
        expect(path.basename(assetEvidencePath).toLowerCase(), `${record.id}: ${assetEvidencePath}`).not.toMatch(
          /^(?:requester-attestation|business-verification|capture-record|provenance|source-observations|source-provenance|readme|source-readme)(?:\.[^.]+)?$/iu,
        );
      for (const provenancePath of [
        "rights/requester-attestation.md",
        "rights/business-verification.md",
        "rights/capture-record.md",
      ]) {
        if (
          fs.existsSync(path.resolve(record.dossierPath, provenancePath)) &&
          provenancePath !== manifest.source.rightsEvidencePath
        )
          expect(manifest.source.provenanceEvidencePaths, `${record.id}: ${provenancePath}`).toContain(provenancePath);
      }
    }
  }, 30_000);

  it("normalizes niche kinds once when synchronizing dossier tags and registry records", () => {
    const core = structuredClone(coreCollection);
    const niche = core.niches[0];
    const normalizedKind = niche.businessKind.trim().toLowerCase();
    niche.businessKind = ` ${normalizedKind.toUpperCase()} `;

    const synced = buildSyncedLibraryState({
      core,
      registry,
      repositoryRoot: path.resolve("."),
    });

    for (const id of niche.referenceIds) {
      const manifest = synced.manifests.get(id)?.manifest;
      expect(manifest, `missing synced dossier ${id}`).toBeDefined();
      expect(
        manifest.businessKinds.filter(
          (kind: string) => kind.trim().toLowerCase() === normalizedKind,
        ),
      ).toHaveLength(1);
      expect(
        manifest.tags.business.filter(
          (kind: string) => kind.trim().toLowerCase() === normalizedKind,
        ),
      ).toHaveLength(1);
    }
  }, 30_000);

  it.each([
    ["auto-repair", "auto repair shop"],
    ["hvac", "heating and cooling contractor"],
    ["roofing", "roofing contractor"],
    ["painting", "residential painter"],
  ])("matches common business-kind aliases for %s without cross-niche bleed", (canonical, alias) => {
    expect(businessKindMatches({ industries: [canonical] }, alias)).toBe(true);
    if (canonical === "roofing")
      expect(businessKindMatches({ industries: [canonical] }, "home-services")).toBe(false);
  });

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

    expect(pack.routes).toHaveLength(3);
    expect(pack.routes.every((route: any) => niche.referenceIds.includes(route.referenceDossier.id))).toBe(true);
  }, 30_000);

  it("relaxes exact-trio history only when every feasible trio is recent", () => {
    const core = JSON.parse(fs.readFileSync(path.resolve("data/reference-library/core-collection.json"), "utf8"));
    const homeCare = core.niches.find((niche: any) => niche.businessKind === "home-care");
    const recentReferenceSets: string[][] = [];
    for (let first = 0; first < homeCare.referenceIds.length; first += 1)
      for (let second = first + 1; second < homeCare.referenceIds.length; second += 1)
        for (let third = second + 1; third < homeCare.referenceIds.length; third += 1)
          recentReferenceSets.push([
            homeCare.referenceIds[first],
            homeCare.referenceIds[second],
            homeCare.referenceIds[third],
          ]);
    const request = {
      ...baseRequest,
      recentReferenceSets,
    };
    const initial = buildInspirationPack(request, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    });
    expect(initial.request.freshnessFallback).toBe("history-relaxed");
    expect(initial.routes).toHaveLength(3);
  });

  it("chooses a feasible trio with lower reference exposure before seed/style ranking", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-exposure-selection-"));
    temporaryRoots.push(root);
    const coreDirectory = path.join(root, "data/reference-library");
    fs.mkdirSync(coreDirectory, { recursive: true });
    const families = [
      "editorial-monument",
      "market-collage",
      "spatial-object",
      "archive-rail",
      "utility-diagnostic",
      "cinematic-stage",
    ];
    const ids = families.map((_, index) => `test-home-care-${index + 1}`);
    fs.writeFileSync(
      path.join(coreDirectory, "core-collection.json"),
      JSON.stringify({
        niches: [{ id: "home-care", businessKind: "home-care", referenceIds: ids }],
      }),
    );
    const baseRecord = registry.records.find((record: any) =>
      record.id === "html5up-home-care-story",
    );
    if (!baseRecord) throw new Error("A valid reference record is required for the selection fixture.");
    const records = ids.map((id, index) => ({
      ...baseRecord,
      id,
      name: `Independent layout ${index + 1}`,
      familyId: families[index],
      referenceFamilyId: `reference-${index + 1}`,
      aliases: [],
      navigation: `navigation-${index + 1}`,
      heroGeometry: `hero-${index + 1}`,
      servicePresentation: `services-${index + 1}`,
      sectionRhythm: `rhythm-${index + 1}`,
      typographyCategory: `type-${index + 1}`,
      imageStrategy: `images-${index + 1}`,
      motionOpportunities: [`motion-${index + 1}`],
      screenshotPath: baseRecord.screenshotPath,
      mobileScreenshotPath: baseRecord.mobileScreenshotPath,
    }));
    const fixtureRegistry = { version: 1, records };
    const request = {
      ...baseRequest,
      industry: "home-care",
      styleTerms: [],
      recentReferenceIds: [],
      recentRouteSignatures: [],
    };
    const baseline = buildInspirationPack(request, fixtureRegistry, {
      repositoryRoot: root,
    });
    const overexposedIds = baseline.routes.flatMap((route: any) => route.referenceIds);
    const underexposedIds = ids.filter((id) => !overexposedIds.includes(id));
    const referenceExposure = Object.fromEntries([
      ...overexposedIds.map((id: string) => [id, 10]),
      ...underexposedIds.map((id) => [id, 0]),
    ]);

    const balanced = buildInspirationPack(
      { ...request, referenceExposure },
      fixtureRegistry,
      { repositoryRoot: root },
    );

    expect(
      balanced.routes.flatMap((route: any) => route.referenceIds).sort(),
    ).toEqual(underexposedIds.sort());
    expect(balanced.selectionReceipt.policy).toBe("attempt-rotated-exposure-balanced-style-ranked-v3");

    const differentSeeds = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      const varied = buildInspirationPack(
        { ...request, seed: `different-intake-${index}`, referenceExposure: {} },
        fixtureRegistry,
        { repositoryRoot: root },
      );
      differentSeeds.add(
        varied.routes
          .flatMap((route: any) => route.referenceIds)
          .sort()
          .join("|"),
      );
    }
    expect(differentSeeds.size).toBeGreaterThan(5);
  }, 30_000);

  it("prefers renderer-family variety within exposure-minimal trios while retaining same-family rotation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-renderer-family-selection-"));
    temporaryRoots.push(root);
    const coreDirectory = path.join(root, "data/reference-library");
    fs.mkdirSync(coreDirectory, { recursive: true });
    const ids = Array.from({ length: 6 }, (_, index) => `renderer-family-${index + 1}`);
    fs.writeFileSync(path.join(coreDirectory, "core-collection.json"), JSON.stringify({
      niches: [{ id: "home-care", businessKind: "home-care", referenceIds: ids }],
    }));
    const baseRecord = registry.records.find((record: any) => record.id === "html5up-home-care-story");
    if (!baseRecord) throw new Error("A home-care reference fixture is required.");
    const records = ids.map((id, index) => ({
      ...baseRecord,
      id,
      name: `Renderer family route ${index + 1}`,
      familyId: index < 4 ? "editorial-monument" : "source-brand-family",
      referenceFamilyId: `source-label-${index + 1}`,
      navigation: `navigation-${index}`,
      heroGeometry: index < 4 ? `hero-${index}` : `utility-diagnostic-hero-${index}`,
      servicePresentation: `service-${index}`,
      typographyCategory: `type-${index}`,
      sectionRhythm: `rhythm-${index}`,
      imageStrategy: `image-${index}`,
    }));
    const request = {
      ...baseRequest,
      seed: "prefer-renderer-family-variety",
      generationId: "0",
      styleTerms: [],
      referenceExposure: {},
    };
    const fixtureRegistry = { version: 1, records };
    const pack = buildInspirationPack(request, fixtureRegistry, { repositoryRoot: root });

    expect(pack.routes).toHaveLength(3);
    expect(() => assertIndependentRoutes(pack.routes)).not.toThrow();
    expect(new Set(pack.routes.map((route: any) => route.familyId))).toEqual(
      new Set(["editorial-monument", "utility-diagnostic"]),
    );
    expect(pack.selectionReceipt.selectedRendererFamilyIds).toEqual(
      pack.routes.map((route: any) => route.familyId),
    );
    expect(pack.selectionReceipt.selectedRendererFamilyCount).toBe(2);
    expect(pack.selectionReceipt.multiFamilyCombinationAvailable).toBe(true);
    expect(pack.selectionReceipt.maximumFeasibleRendererFamilyCount).toBe(2);

    const withHistory = buildInspirationPack({
      ...request,
      recentReferenceSets: [ids.slice(0, 3)],
      referenceExposure: Object.fromEntries(ids.map((id) => [id, 1])),
    }, fixtureRegistry, { repositoryRoot: root });
    expect(withHistory.request.freshnessFallback).toBe("fresh");
    expect(new Set(withHistory.routes.map((route: any) => route.familyId)).size).toBe(2);
    expect(withHistory.selectionReceipt.selectedRendererFamilyCount).toBe(2);

    const withHistoryFamilyCounts = new Set<number>();
    let withHistoryFamilyTotal = 0;
    for (let index = 0; index < 456; index += 1) {
      const rotated = buildInspirationPack({
        ...request,
        generationId: String(index),
        recentReferenceSets: [ids.slice(0, 3)],
        referenceExposure: Object.fromEntries(ids.map((id) => [id, 1])),
      }, fixtureRegistry, { repositoryRoot: root });
      const count = rotated.selectionReceipt.selectedRendererFamilyCount;
      withHistoryFamilyCounts.add(count);
      withHistoryFamilyTotal += count;
    }
    expect(withHistoryFamilyCounts).toEqual(new Set([1, 2]));
    expect(withHistoryFamilyTotal / 456).toBeGreaterThan(35 / 19);

    const realisticHistory = [
      { businessKind: "home-care", referenceIds: ids.slice(0, 3), routeSignatures: [] },
      { businessKind: "home-care", referenceIds: [ids[0], ids[4], ids[5]], routeSignatures: [] },
    ];
    const realisticContext = referenceSelectionContext({ launches: realisticHistory }, "home-care");
    expect(realisticContext.recentReferenceSets).toHaveLength(2);
    expect(new Set(ids.map((id) => realisticContext.referenceExposure[id] || 0)).size).toBeGreaterThan(1);
    let realisticFamilyTotal = 0;
    for (let index = 0; index < 42; index += 1) {
      const rotated = buildInspirationPack({
        ...request,
        generationId: String(index),
        ...realisticContext,
      }, fixtureRegistry, { repositoryRoot: root });
      expect(rotated.selectionReceipt.selectedExposureScore).toBe(2);
      realisticFamilyTotal += rotated.selectionReceipt.selectedRendererFamilyCount;
    }
    expect(realisticFamilyTotal / 42).toBeGreaterThan(11 / 6);

    const familyCounts = new Set<number>();
    let familyTotal = 0;
    for (let index = 0; index < 120; index += 1) {
      const rotated = buildInspirationPack({
        ...request,
        generationId: String(index),
      }, fixtureRegistry, { repositoryRoot: root });
      const count = new Set(rotated.routes.map((route: any) => route.familyId)).size;
      familyCounts.add(count);
      familyTotal += count;
    }
    expect(familyCounts).toEqual(new Set([1, 2]));
    expect(familyTotal / 120).toBeGreaterThan(36 / 20);
  });

  it("allows materially distinct routes from the same broad family instead of making family labels mandatory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-same-family-selection-"));
    temporaryRoots.push(root);
    const coreDirectory = path.join(root, "data/reference-library");
    fs.mkdirSync(coreDirectory, { recursive: true });
    const ids = Array.from({ length: 6 }, (_, index) => `same-family-${index + 1}`);
    fs.writeFileSync(path.join(coreDirectory, "core-collection.json"), JSON.stringify({
      niches: [{ id: "home-care", businessKind: "home-care", referenceIds: ids }],
    }));
    const baseRecord = registry.records.find((record: any) => record.id === "html5up-home-care-story");
    if (!baseRecord) throw new Error("A home-care reference fixture is required.");
    const sameFamilyRecords = ids.map((id, index) => ({
      ...baseRecord,
      id,
      name: `Same family route ${index + 1}`,
      familyId: "editorial-monument",
      navigation: `navigation-${index}`,
      heroGeometry: `hero-${index}`,
      servicePresentation: `service-${index}`,
      typographyCategory: `type-${index}`,
      sectionRhythm: `rhythm-${index}`,
      imageStrategy: `image-${index}`,
    }));

    const pack = buildInspirationPack({
      ...baseRequest,
      seed: "same-family-distinct-composition",
      industry: "home-care",
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, { version: 1, records: sameFamilyRecords }, { repositoryRoot: root });

    expect(pack.routes).toHaveLength(3);
    expect(new Set(pack.routes.map((route: any) => route.familyId)).size).toBe(1);
    expect(new Set(pack.routes.map((route: any) => route.signature)).size).toBe(3);
    expect(() => assertIndependentRoutes(pack.routes)).not.toThrow();
    expect(pack.selectionReceipt.selectedRendererFamilyIds).toEqual([
      "editorial-monument", "editorial-monument", "editorial-monument",
    ]);
    expect(pack.selectionReceipt.selectedRendererFamilyCount).toBe(1);
    expect(pack.selectionReceipt.multiFamilyCombinationAvailable).toBe(false);
    expect(pack.selectionReceipt.maximumFeasibleRendererFamilyCount).toBe(1);
  });

  it.each(coreNicheCases)(
    "raises expected renderer-family count across seeded %s selections",
    ({ industry }) => {
      const niche = coreCollection.niches.find((entry) => entry.businessKind === industry);
      if (!niche) throw new Error(`Core reference niche '${industry}' is missing.`);
      const families = niche.referenceIds.map((id) => {
        const record = registry.records.find((item: any) => item.id === id);
        if (!record) throw new Error(`Core reference '${id}' is missing.`);
        return familyForRoute({
          ...record,
          motionOpportunity: record.motionOpportunities[0] || "restrained-native-motion",
        });
      });
      let unweightedFamilyTotal = 0;
      for (let first = 0; first < 6; first += 1)
        for (let second = first + 1; second < 6; second += 1)
          for (let third = second + 1; third < 6; third += 1)
            unweightedFamilyTotal += new Set([
              families[first], families[second], families[third],
            ]).size;

      let selectedFamilyTotal = 0;
      for (let index = 0; index < 120; index += 1) {
        const pack = buildInspirationPack({
          ...baseRequest,
          industry,
          seed: `${industry}-attempt-${index}`,
          generationId: `${industry}-attempt-${index}`,
          styleTerms: [],
          recentReferenceSets: [],
          referenceExposure: {},
        }, registry);
        expect(pack.selectionReceipt.feasibleCombinationCount, industry).toBe(20);
        selectedFamilyTotal += pack.selectionReceipt.selectedRendererFamilyCount;
      }
      expect(selectedFamilyTotal / 120, industry).toBeGreaterThan(unweightedFamilyTotal / 20);
    },
  );

  it("improves family variety over thirty history-aware launches while balancing every niche's references", () => {
    let familyTotal = 0;
    for (const niche of coreCollection.niches) {
      const history: any[] = [];
      const exposure = new Map<string, number>();
      const trios: string[] = [];
      const styleTerms = [
        registry.records.find((record: any) => record.id === niche.referenceIds[0]).moods[0],
        "editorial", "warm", "modern",
      ].filter(Boolean);
      for (let index = 0; index < 30; index += 1) {
        const context = referenceSelectionContext({ launches: history }, niche.businessKind);
        const pack = buildInspirationPack({
          ...baseRequest,
          industry: niche.businessKind,
          seed: `${niche.businessKind}-launch-${index}`,
          generationId: `${niche.businessKind}-${index}`,
          styleTerms,
          ...context,
        }, registry);
        const ids = pack.routes.map((route: any) => route.referenceIds[0]).sort();
        const key = ids.join("|");
        expect(trios.slice(-12), `${niche.id} launch ${index} repeated a recent trio`).not.toContain(key);
        trios.push(key);
        familyTotal += pack.selectionReceipt.selectedRendererFamilyCount;
        for (const id of ids) exposure.set(id, (exposure.get(id) || 0) + 1);
        history.push({
          businessKind: niche.businessKind,
          referenceIds: ids,
          routeSignatures: pack.routes.map((route: any) => route.signature),
        });
      }
      expect(exposure.size, niche.id).toBe(6);
      expect([...exposure.values()], niche.id).toEqual([15, 15, 15, 15, 15, 15]);
    }
    // Pre-weighting selector: 1,052 family counts across these 420 launches.
    expect(familyTotal).toBeGreaterThan(1052);
  });

  it.each(coreNicheCases)(
    "keeps all six %s references in rotation without a mandatory source",
    ({ industry }) => {
      const niche = coreCollection.niches.find((entry) => entry.businessKind === industry);
      if (!niche) throw new Error(`Core reference niche '${industry}' is missing.`);
      const counts = new Map<string, number>();
      for (let index = 0; index < 100; index += 1) {
        const pack = buildInspirationPack({
          ...baseRequest,
          industry,
          seed: `${industry}-distribution-${index}`,
          styleTerms: [],
          recentReferenceIds: [],
          recentRouteSignatures: [],
        }, registry);
        for (const route of pack.routes)
          counts.set(route.referenceIds[0], (counts.get(route.referenceIds[0]) || 0) + 1);
      }
      expect(counts.size, `${industry} should expose all six references`).toBe(6);
      expect(Math.max(...counts.values()), `${industry} has a mandatory or near-mandatory source`).toBeLessThan(90);
      expect(niche.referenceIds).toEqual(expect.arrayContaining([...counts.keys()]));
    },
  );

  it.each(coreNicheCases)(
    "keeps realistic style terms from pinning %s to one reference trio",
    ({ industry }) => {
      const niche = coreCollection.niches.find((entry) => entry.businessKind === industry);
      if (!niche) throw new Error(`Core reference niche '${industry}' is missing.`);
      const styleTerms = [
        registry.records.find((record: any) => record.id === niche.referenceIds[0]).moods[0],
        "editorial",
        "warm",
        "modern",
      ].filter(Boolean);
      const trios = new Set<string>();
      for (let index = 0; index < 100; index += 1) {
        const pack = buildInspirationPack({
          ...baseRequest,
          industry,
          seed: `${industry}-real-style-${index}`,
          styleTerms,
          recentReferenceIds: [],
          recentReferenceSets: [],
          recentRouteSignatures: [],
        }, registry);
        trios.add(pack.routes.map((route: any) => route.referenceIds[0]).sort().join("|"));
      }
      expect(trios.size, `${industry} should retain style-aware trio variance`).toBeGreaterThanOrEqual(12);
    },
  );

  it.each(coreNicheCases)(
    "advances through distinct %s trios for consecutive attempts with unchanged history",
    ({ industry }) => {
      const niche = coreCollection.niches.find((entry) => entry.businessKind === industry);
      if (!niche) throw new Error(`Core reference niche '${industry}' is missing.`);
      const styleTerms = [
        registry.records.find((record: any) => record.id === niche.referenceIds[0]).moods[0],
        "editorial",
        "warm",
        "modern",
      ].filter(Boolean);
      const trios: string[] = [];
      const exposed = new Set<string>();
      for (let index = 0; index < 12; index += 1) {
        const attemptId = `1200000000-attempt-${index + 1}`;
        const pack = buildInspirationPack({
          ...baseRequest,
          industry,
          seed: attemptId,
          generationId: attemptId,
          styleTerms,
          recentReferenceIds: [],
          recentReferenceSets: [],
          recentRouteSignatures: [],
          referenceExposure: {},
        }, registry);
        const ids = pack.routes.map((route: any) => route.referenceIds[0]);
        ids.forEach((id: string) => exposed.add(id));
        trios.push(ids.sort().join("|"));
      }
      expect(new Set(trios).size, `${industry} should advance through feasible trios`).toBe(12);
      expect(exposed, `${industry} should expose its full niche core`).toEqual(new Set(niche.referenceIds));
    },
  );

  it.each(coreNicheCases)(
    "rotates beyond two complementary trios for consecutive %s generations",
    ({ industry }) => {
      const niche = coreCollection.niches.find((entry) => entry.businessKind === industry);
      if (!niche) throw new Error(`Core reference niche '${industry}' is missing.`);
      const history: any[] = [];
      const trios = new Set<string>();
      const counts = new Map<string, number>();
      for (let index = 0; index < 12; index += 1) {
        const context = referenceSelectionContext({ launches: history }, industry);
        const pack = buildInspirationPack({
          ...baseRequest,
          industry,
          seed: `${industry}-launch-${index}`,
          generationId: `${industry}-${index}`,
          styleTerms: [
            registry.records.find((record: any) => record.id === niche.referenceIds[0]).moods[0],
            "editorial",
            "warm",
            "modern",
          ].filter(Boolean),
          ...context,
        }, registry);
        const ids = pack.routes.map((route: any) => route.referenceIds[0]).sort();
        expect(pack.request.freshnessFallback, `${industry} launch ${index} should have a fresh trio`).toBe("fresh");
        trios.add(ids.join("|"));
        for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
        history.push({
          businessKind: industry,
          referenceIds: ids,
          routeSignatures: pack.routes.map((route: any) => route.signature),
        });
      }
      expect(counts.size, `${industry} should retain full six-source coverage`).toBe(6);
      expect(trios.size, `${industry} should use a new trio for each launch`).toBe(12);
      expect(Math.max(...counts.values()), `${industry} should rotate source exposure`).toBeLessThan(12);
    },
  );

  it("fails closed when fewer than the six canonical dossiers can be loaded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-incomplete-core-pool-"));
    temporaryRoots.push(root);
    const sourceRoot = path.resolve(".");
    const core = JSON.parse(fs.readFileSync(path.join(sourceRoot, "data/reference-library/core-collection.json"), "utf8"));
    const niche = core.niches.find((entry: any) => entry.businessKind === "home-care");
    core.niches = [niche];
    const referenceRoot = path.join(root, "data/reference-library");
    fs.mkdirSync(path.join(referenceRoot, "dossiers"), { recursive: true });
    fs.writeFileSync(path.join(referenceRoot, "core-collection.json"), JSON.stringify(core));
    const fiveRecords = niche.referenceIds.slice(0, 5).map((id: string) => {
      const record = registry.records.find((item: any) => item.id === id);
      if (!record) throw new Error(`Missing reference fixture ${id}.`);
      const dossierPath = `data/reference-library/dossiers/${id}`;
      fs.cpSync(path.resolve(sourceRoot, record.dossierPath), path.join(root, dossierPath), { recursive: true });
      return { ...record, dossierPath };
    });

    expect(() => buildInspirationPack({
      ...baseRequest,
      industry: "home-care",
      recentReferenceIds: [],
      recentRouteSignatures: [],
    }, { version: registry.version, records: fiveRecords }, {
      repositoryRoot: root,
      requireDossiers: true,
    })).toThrow(/exactly 6 production-eligible dossiers/iu);
  }, 30_000);

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
    expect(selectedIds).not.toContain("spicer-roofing-storm-response");
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
      "home-services", "local-trades", "home-repair", "handyman",
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
      "web-hospitality-long-story-short-hudson",
      "web-hospitality-six-bells-inn",
      "web-hospitality-wm-farmer-and-sons",
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

  it("relaxes stale-history exclusions when they would make the three-route contract impossible", () => {
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
            ].map((value) => String(value).slice(0, 80)).join("|"),
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
    ).toThrow("three structurally independent creative routes");
  });
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
