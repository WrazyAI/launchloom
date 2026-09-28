import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildBusinessVariationConfig,
  buildBusinessVariationPack,
  businessVariationPreviewEnvironment,
  runBusinessVariationSeoReview,
} from "../scripts/business-variation-canary.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "../scripts/a1-reference-library.mjs";
import {
  copyClientSite,
  isDirectExecution,
  requireSelectedCandidate,
  stageReusableAssets,
} from "../scripts/run-business-variation-canary.mjs";

const root = process.cwd();
const baseRegistry = JSON.parse(
  fs.readFileSync("data/inspiration-registry.json", "utf8"),
);
let registry: ReturnType<typeof mergeInspirationRegistries>;

beforeAll(async () => {
  registry = mergeInspirationRegistries(
    baseRegistry,
    await loadA1ReferenceLibrary("data/a1-reference-library.json", {
      repositoryRoot: root,
    }),
  );
});

describe("business variation canary", () => {
  it("recognizes direct CLI execution for encoded paths and ignores a missing entrypoint", () => {
    const entry = path.join(
      os.tmpdir(),
      "launch loom",
      "run-business-variation-canary.mjs",
    );

    expect(isDirectExecution(pathToFileURL(entry).href, entry)).toBe(true);
    expect(isDirectExecution(pathToFileURL(entry).href, undefined)).toBe(false);
  });

  it("fails clearly instead of creating a dangling client dependency symlink", async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "launchloom-client-site-without-deps-"),
    );
    const source = path.join(tempRoot, "client-site");
    const destination = path.join(tempRoot, "preview");
    try {
      fs.mkdirSync(source);
      await expect(copyClientSite(source, destination)).rejects.toThrow(
        /client-site dependencies.*node_modules/iu,
      );
      expect(fs.existsSync(path.join(destination, "node_modules"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not accept a repair result without its selected candidate", () => {
    expect(() => requireSelectedCandidate({
      status: "passed",
      selectedCandidateId: null,
      bakeoff: { candidates: [] },
    })).toThrow(/did not select a candidate/u);
    expect(() => requireSelectedCandidate({
      status: "passed",
      selectedCandidateId: "candidate-a",
      bakeoff: { candidates: [] },
    })).toThrow(/that candidate is missing/u);
  });

  it("reuses generated assets from a business variation canary output", async () => {
    const source = fs.mkdtempSync(
      path.join(os.tmpdir(), "launchloom-reuse-variation-assets-"),
    );
    const target = path.join(source, "next-site", "public/images/generated");
    const manifestPath = path.join(source, "next-generated-assets.json");
    const assetPath = path.join(
      source,
      "site/public/images/generated/hero-example.webp",
    );
    const asset = Buffer.from("fake-webp-image");

    try {
      fs.mkdirSync(path.dirname(assetPath), { recursive: true });
      fs.writeFileSync(assetPath, asset);
      fs.writeFileSync(
        path.join(source, "generated-assets.json"),
        JSON.stringify({
          provider: "fal.ai",
          placements: [{ placement: "hero", path: "/images/generated/hero-example.webp" }],
        }),
      );

      const reused = await stageReusableAssets(source, target, manifestPath);

      expect(reused).toBe(1);
      expect(fs.readFileSync(path.join(target, "hero-example.webp"))).toEqual(asset);
      expect(JSON.parse(fs.readFileSync(manifestPath, "utf8")).placements).toHaveLength(1);
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
    }
  });

  it("sets the local canary build to noindex review mode without mutating the parent environment", () => {
    const original = {
      PATH: "/usr/bin",
      HOME: "/runner/home",
      PUBLIC_REVIEW_MODE: "false",
      CUSTOM_VALUE: "not-for-client-builds",
      OPENROUTER_API_KEY: "model-secret",
      FAL_KEY: "image-secret",
    };
    const preview = businessVariationPreviewEnvironment(original);

    expect(preview).toEqual({
      PATH: "/usr/bin",
      PUBLIC_REVIEW_MODE: "true",
    });
    expect(original.PUBLIC_REVIEW_MODE).toBe("false");
  });

  it("keeps only an explicitly isolated HOME for the local canary build", () => {
    const preview = businessVariationPreviewEnvironment(
      { PATH: "/usr/bin", HOME: "/runner/home", GITHUB_TOKEN: "secret" },
      {
        HOME: "/tmp/launchloom-canary-home",
        TMPDIR: "/tmp/launchloom-canary-home",
      },
    );

    expect(preview).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/launchloom-canary-home",
      TMPDIR: "/tmp/launchloom-canary-home",
      PUBLIC_REVIEW_MODE: "true",
    });
    expect(preview).not.toHaveProperty("GITHUB_TOKEN");
  });

  it("runs the SEO review gate against the built isolated preview", async () => {
    let invocation: { file: string; args: string[]; options: any } | undefined;
    const result = await runBusinessVariationSeoReview({
      repositoryRoot: "/workspace/launchloom",
      siteDir: "/tmp/variation/site",
      execFileImpl: async (file: string, args: string[], options: any) => {
        invocation = { file, args, options };
        return { stdout: "SEO review release gate passed." };
      },
    });

    expect(invocation).toEqual({
      file: process.execPath,
      args: [
        "/workspace/launchloom/scripts/seo-release-gate.mjs",
        "--mode",
        "review",
        "--config",
        "/tmp/variation/site/src/site.config.json",
        "--dist",
        "/tmp/variation/site/dist",
      ],
      options: expect.objectContaining({ cwd: "/tmp/variation/site" }),
    });
    expect(result).toEqual({
      status: "passed",
      mode: "review",
      configPath: "/tmp/variation/site/src/site.config.json",
      distPath: "/tmp/variation/site/dist",
    });
  });

  it("does not convert an SEO gate failure into a passing canary receipt", async () => {
    await expect(
      runBusinessVariationSeoReview({
        repositoryRoot: "/workspace/launchloom",
        siteDir: "/tmp/variation/site",
        execFileImpl: async () => {
          throw new Error("/services/brakes/: meta description is missing");
        },
      }),
    ).rejects.toThrow(/meta description is missing/iu);
  });

  it("replaces prior-client facts and imagery with the HVAC scenario", () => {
    const config = buildBusinessVariationConfig(
      {
        business: { name: "Harbor Glow Wellness", phone: "old" },
        services: [{ name: "Injectables" }],
        images: { hero: "old-client-image" },
        assets: { photoOne: "old-client-photo" },
        style: { tone: "calm" },
      },
      "hvac",
    );

    expect(config.business.name).toBe("Boreal Heating & Cooling");
    expect(config.business.phone).toBe("(612) 555-0148");
    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual([
      "Furnace diagnostics and repair",
      "Air conditioning repair",
      "Heat pump service",
    ]);
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(config.assets).toEqual({});
    expect(config.seoResearch.targetKeywords).toContain(
      "furnace repair St. Paul",
    );
  });

  it("builds an auto-repair scenario from its own business inputs and reference niche", () => {
    const config = buildBusinessVariationConfig(
      {
        business: { name: "Boreal Heating & Cooling" },
        services: [{ name: "Furnace diagnostics and repair" }],
        images: { hero: "/old-hvac.webp" },
      },
      "auto-repair",
    );
    const { scenario, pack } = buildBusinessVariationPack(
      root,
      registry,
      "auto-repair",
      { seed: "auto-repair-var-0" },
    );
    const niche = JSON.parse(
      fs.readFileSync("data/reference-library/core-collection.json", "utf8"),
    ).niches.find((entry: { id: string }) => entry.id === "auto-repair-shops");

    expect(scenario.industry).toBe("auto-repair");
    expect(config.business.name).toBe("Juniper Motor & Garage");
    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual([
      "Brake service and repair",
      "Check-engine diagnostics",
      "Scheduled vehicle maintenance",
    ]);
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(pack.routes).toHaveLength(3);
    expect(
      new Set(pack.routes.map((route: { familyId: string }) => route.familyId))
        .size,
    ).toBe(3);
    for (const route of pack.routes) {
      expect(niche.referenceIds).toContain(route.referenceIds[0]);
      expect(route.referenceDossier.tags.business).toContain("auto-repair");
    }
    expect(config.seoResearch.targetKeywords).toContain("brake repair Denver");
  });

  it("builds a painting scenario with distinct service, SEO, and renderer-family inputs", () => {
    const config = buildBusinessVariationConfig(
      {
        business: { name: "Juniper Motor & Garage" },
        services: [{ name: "Brake service and repair" }],
        images: { hero: "/old-auto.webp" },
      },
      "painting",
    );
    const { scenario, pack } = buildBusinessVariationPack(
      root,
      registry,
      "painting",
      { seed: "painting-var-0" },
    );
    const niche = JSON.parse(
      fs.readFileSync("data/reference-library/core-collection.json", "utf8"),
    ).niches.find(
      (entry: { id: string }) => entry.id === "painting-contractors",
    );

    expect(scenario.industry).toBe("painting");
    expect(config.business.name).toBe("Colorwork Painting Studio");
    expect(config.business.serviceAreas).toEqual([
      "Atlanta",
      "Decatur",
      "Marietta",
    ]);
    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual([
      "Interior painting",
      "Exterior repainting",
      "Cabinet refinishing",
    ]);
    expect(config.seoResearch.targetKeywords).toContain(
      "interior painter Atlanta",
    );
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(pack.routes).toHaveLength(3);
    expect(
      new Set(pack.routes.map((route: { familyId: string }) => route.familyId))
        .size,
    ).toBe(3);
    for (const route of pack.routes) {
      expect(niche.referenceIds).toContain(route.referenceIds[0]);
      expect(route.referenceDossier.tags.business).toContain("painting");
    }
    expect(
      pack.routes.flatMap(
        (route: { referenceIds: string[] }) => route.referenceIds,
      ),
    ).not.toContain("web-auto-repair-ade-auto-repairs");
  });

  it("builds a roofing scenario from the roofing niche with distinct local SEO inputs", () => {
    const config = buildBusinessVariationConfig(
      {
        business: { name: "Colorwork Painting Studio" },
        services: [{ name: "Interior painting" }],
        images: { hero: "/old-painting.webp" },
      },
      "roofing",
    );
    const { scenario, pack } = buildBusinessVariationPack(
      root,
      registry,
      "roofing",
      { seed: "roofing-reference-library-canary" },
    );
    const niche = JSON.parse(
      fs.readFileSync("data/reference-library/core-collection.json", "utf8"),
    ).niches.find(
      (entry: { id: string }) => entry.id === "roofing-contractors",
    );

    expect(scenario.industry).toBe("roofing");
    expect(config.business.name).toBe("Rainmark Roofworks");
    expect(config.business.serviceAreas).toEqual([
      "Tacoma",
      "Federal Way",
      "Puyallup",
    ]);
    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual([
      "Roof leak assessment and repair",
      "Roof replacement planning",
      "Storm damage inspection",
    ]);
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(config.seoResearch.targetKeywords).toContain("roof repair Tacoma");
    expect(pack.routes).toHaveLength(3);
    for (const route of pack.routes) {
      expect(niche.referenceIds).toContain(route.referenceIds[0]);
      expect(route.referenceDossier.tags.business).toContain("roofing");
    }
  });

  it("selects three production references from the requested business niche", () => {
    const { scenario, pack } = buildBusinessVariationPack(
      root,
      registry,
      "hvac",
      { seed: "hvac-variation-canary-2026-09-27" },
    );
    const collection = JSON.parse(
      fs.readFileSync("data/reference-library/core-collection.json", "utf8"),
    );
    const nicheIds = new Set(
      collection.niches.find(
        (niche: { id: string }) => niche.id === "hvac-contractors",
      ).referenceIds,
    );

    expect(scenario.industry).toBe("hvac");
    expect(pack.routes).toHaveLength(3);
    expect(
      new Set(pack.routes.map((route: { familyId: string }) => route.familyId))
        .size,
    ).toBeGreaterThan(1);
    const nextPack = buildBusinessVariationPack(root, registry, "hvac", {
      seed: "hvac-variation-canary-alternate-seed",
    });
    expect(
      nextPack.pack.routes.flatMap(
        (route: { referenceIds: string[] }) => route.referenceIds,
      ),
    ).not.toEqual(
      pack.routes.flatMap(
        (route: { referenceIds: string[] }) => route.referenceIds,
      ),
    );
    for (const route of pack.routes) {
      expect(route.referenceIds).toHaveLength(1);
      expect(nicheIds.has(route.referenceIds[0])).toBe(true);
      const dossier = JSON.parse(
        fs.readFileSync(
          path.join(root, route.referenceDossier.path, "manifest.json"),
          "utf8",
        ),
      );
      expect(dossier.productionEligible).toBe(true);
      expect(route.referenceDossier.tags.business).toContain("hvac");
    }
    expect(
      pack.routes.flatMap(
        (route: { referenceIds: string[] }) => route.referenceIds,
      ),
    ).not.toContain("kokoro-spatial-editorial");
  });

  it("requires screenshot-analyzed Reference DNA for every variation route before authoring", async () => {
    const { prepareBusinessVariationPack } =
      await import("../scripts/business-variation-canary.mjs");
    expect(prepareBusinessVariationPack).toBeTypeOf("function");

    const { pack } = buildBusinessVariationPack(root, registry, "auto-repair", {
      seed: "auto-repair-analysis-contract",
    });
    const analyzedPack = {
      ...structuredClone(pack),
      referenceDnaAnalyzed: true,
      referenceDnaAnalyzerModel: "openai/gpt-6-luna",
    };
    const measurements = {
      headlineWidthRatio: 0.62,
      headlineHeightRatio: 0.24,
      heroImageOccupancyRatio: 0.48,
      contentColumnWidthRatio: 0.56,
      navTopRatio: 0.02,
      navSideInsetRatio: 0.06,
      ctaTopRatio: 0.66,
      dominantSectionHeightRatios: [0.72, 0.9, 1.1],
      imageAspectRatios: [1.7],
      overlapRelationships: [],
      surfaceTransitions: ["cream to black"],
      mobile: {
        headlineWidthRatio: 0.84,
        imageOccupancyRatio: 0.42,
        ctaTopRatio: 0.79,
        contentInsetRatio: 0.06,
      },
    };
    for (const route of analyzedPack.routes) {
      route.referenceDna = {
        ...route.referenceDna,
        analyzedFromEvidence: true,
        analyzerModel: "openai/gpt-6-luna",
        measurements,
        evidence: {
          ...route.referenceDna.evidence,
          captureDimensions: {
            desktop: { width: 1440, height: 5000 },
            mobile: { width: 390, height: 8000 },
          },
        },
      };
    }

    let analyzerInput: unknown;
    const prepared = await prepareBusinessVariationPack(pack, {
      analyze: async (input: unknown) => {
        analyzerInput = input;
        return analyzedPack;
      },
    });

    expect(analyzerInput).toBe(pack);
    expect(prepared).toBe(analyzedPack);
    expect(prepared.referenceDnaAnalyzed).toBe(true);
    expect(
      prepared.routes.every(
        (route: any) =>
          route.referenceDna.analyzedFromEvidence === true &&
          route.referenceDna.measurements !== null &&
          route.referenceDna.evidence.captureDimensions.desktop &&
          route.referenceDna.evidence.captureDimensions.mobile,
      ),
    ).toBe(true);

    const incompletePack = structuredClone(analyzedPack);
    incompletePack.routes[1].referenceDna.measurements = null;
    await expect(
      prepareBusinessVariationPack(pack, {
        analyze: async () => incompletePack,
      }),
    ).rejects.toThrow(/Reference DNA analysis is incomplete for route-02/iu);
  });

  it("rejects unknown business variation scenarios", () => {
    expect(() => buildBusinessVariationConfig({}, "koko-ro")).toThrow(
      /unknown business variation scenario/iu,
    );
  });
});
