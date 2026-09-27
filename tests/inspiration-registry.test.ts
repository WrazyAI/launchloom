import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import { assertReferenceDossierPack, loadReferenceDossier } from "../scripts/reference-dossier.mjs";

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

  it("relaxes history when the current core trio is exhausted", () => {
    const options = { repositoryRoot: path.resolve("."), requireDossiers: true };
    const initial = buildInspirationPack(baseRequest, registry, options);
    const next = buildInspirationPack(
      {
        ...baseRequest,
        recentReferenceIds: initial.routes.flatMap(
          (route: any) => route.referenceIds,
        ),
        recentRouteSignatures: [initial.routes[0].signature],
      },
      registry,
      options,
    );

    expect(next.request.freshnessFallback).toBe("history-relaxed");
    expect(next.routes.map((route: any) => route.referenceDossier?.id).sort()).toEqual(
      initial.routes.map((route: any) => route.referenceDossier?.id).sort(),
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
        "data/inspiration-evidence/design-family-demos/screenshots/image-mosaic-desktop.png",
        "care-modern-clinic-mosaic",
      ],
      "care-concierge-cinematic": [
        "data/inspiration-evidence/design-family-demos/screenshots/cinematic-premium-desktop.png",
        "care-concierge-cinematic",
      ],
      "care-wellness-journal": [
        "data/inspiration-evidence/design-family-demos/screenshots/atmospheric-editorial-desktop.png",
        "care-wellness-journal",
      ],
      "trade-project-showcase": [
        "data/inspiration-evidence/design-family-demos/screenshots/project-showcase-desktop.png",
        "trades-project-led",
      ],
      "trades-field-report": [
        "data/inspiration-evidence/design-family-demos/screenshots/studio-minimal-desktop.png",
        "trades-field-report",
      ],
      "quiet-care-consultation": [
        "data/inspiration-evidence/a1-design-showcase/screenshots/quiet-practice-desktop.png",
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

  it.each([
    ["home-care", new Set([
      "html5up-home-care-story",
      "attested-angels-on-call-homecare",
      "attested-kingsway-care-home-care",
    ])],
    ["fitness", new Set([
      "html5up-fitness-big-picture",
      "colorlib-ironworks-strength-club",
      "spicer-gym-timetable-first",
    ])],
    ["legal-services", new Set([
      "colorlib-caseworth-legal-ledger",
      "direct-robins-kaplan-law",
      "spicer-law-firm-results-ledger",
    ])],
    ["hospitality", new Set([
      "direct-mahala-desert-boutique-hotel",
      "direct-casa-cedo-boutique-hotel",
      "direct-fogo-island-inn-hospitality",
    ])],
    ["accounting", new Set([
      "spicer-accountant-deadline-calendar",
      "direct-alex-co-accountants-practice",
      "direct-change-accountants-york",
    ])],
  ])("has three registered, business-matched core references for %s", (industry, expectedIds) => {
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
    expect(selected).toEqual(expectedIds);
    expect(selected.has("attested-future-fitness")).toBe(false);
    expect(selected.has("direct-grlica-law")).toBe(false);
  });

  it("defines an exact 30-dossier core with ten niches and production-randomizer coverage", () => {
    const corePath = path.resolve("data/reference-library/core-collection.json");
    const core = JSON.parse(fs.readFileSync(corePath, "utf8"));
    expect(core.schemaVersion).toBe(1);
    expect(core.id).toBe("local-seo-core-30");
    expect(core.niches).toHaveLength(10);
    expect(core.niches.every((niche: any) => niche.referenceIds.length === 3)).toBe(true);

    const allIds = core.niches.flatMap((niche: any) => niche.referenceIds);
    expect(allIds).toHaveLength(30);
    expect(new Set(allIds).size).toBe(30);

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
      expect(new Set(selected), niche.id).toEqual(new Set(niche.referenceIds));

      for (const id of niche.referenceIds) {
        const record = registry.records.find((item: any) => item.id === id);
        expect(record, id).toBeTruthy();
        const dossier = loadReferenceDossier(record.dossierPath);
        expect(dossier.productionEligible, id).toBe(true);
        expect(dossier.source.name, id).not.toMatch(/launchloom owned design study/iu);
        expect(["licensed", "permission-cleared", "owned"], id).toContain(dossier.source.rights);
        expect(dossier.evidence.desktop.fullPage, id).toBe(true);
        expect(dossier.evidence.mobile.fullPage, id).toBe(true);
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

    expect(pack.routes.map((route: any) => route.referenceDossier.id).sort()).toEqual(
      [...niche.referenceIds].sort(),
    );
  }, 30_000);

  it("records when history must be relaxed to satisfy the three-route contract", () => {
    const request = {
      ...baseRequest,
      recentReferenceIds: [
        "html5up-home-care-story",
        "attested-angels-on-call-homecare",
        "attested-kingsway-care-home-care",
      ],
    };
    const initial = buildInspirationPack(request, registry, {
      repositoryRoot: path.resolve("."),
      requireDossiers: true,
    });
    expect(initial.request.freshnessFallback).toBe("history-relaxed");
    expect(initial.routes.map((route: any) => route.referenceIds[0]).sort()).toEqual(
      [...request.recentReferenceIds].sort(),
    );
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
            ].join("|"),
          ),
      },
      registry,
    );

    expect(pack.routes).toHaveLength(3);
    expect(["route-signatures-relaxed", "history-relaxed"]).toContain(
      pack.request.freshnessFallback,
    );
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
