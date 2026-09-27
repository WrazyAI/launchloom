import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildBusinessVariationConfig,
  buildBusinessVariationPack,
} from "../scripts/business-variation-canary.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "../scripts/a1-reference-library.mjs";

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
    expect(config.services.map((service: { name: string }) => service.name)).toEqual([
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
    expect(config.services.map((service: { name: string }) => service.name)).toEqual([
      "Brake service and repair",
      "Check-engine diagnostics",
      "Scheduled vehicle maintenance",
    ]);
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(pack.routes).toHaveLength(3);
    expect(new Set(pack.routes.map((route: { familyId: string }) => route.familyId)).size)
      .toBe(3);
    for (const route of pack.routes) {
      expect(niche.referenceIds).toContain(route.referenceIds[0]);
      expect(route.referenceDossier.tags.business).toContain("auto-repair");
    }
    expect(config.seoResearch.targetKeywords).toContain(
      "brake repair Denver",
    );
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
    ).niches.find((entry: { id: string }) => entry.id === "painting-contractors");

    expect(scenario.industry).toBe("painting");
    expect(config.business.name).toBe("Colorwork Painting Studio");
    expect(config.business.serviceAreas).toEqual([
      "Atlanta",
      "Decatur",
      "Marietta",
    ]);
    expect(config.services.map((service: { name: string }) => service.name)).toEqual([
      "Interior painting",
      "Exterior repainting",
      "Cabinet refinishing",
    ]);
    expect(config.seoResearch.targetKeywords).toContain(
      "interior painter Atlanta",
    );
    expect(config.images).toEqual({ hero: "", secondary: "", tertiary: "" });
    expect(pack.routes).toHaveLength(3);
    expect(new Set(pack.routes.map((route: { familyId: string }) => route.familyId)).size)
      .toBe(3);
    for (const route of pack.routes) {
      expect(niche.referenceIds).toContain(route.referenceIds[0]);
      expect(route.referenceDossier.tags.business).toContain("painting");
    }
    expect(pack.routes.flatMap((route: { referenceIds: string[] }) => route.referenceIds))
      .not.toContain("web-auto-repair-ade-auto-repairs");
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
      collection.niches
        .find((niche: { id: string }) => niche.id === "hvac-contractors")
        .referenceIds,
    );

    expect(scenario.industry).toBe("hvac");
    expect(pack.routes).toHaveLength(3);
    expect(new Set(pack.routes.map((route: { familyId: string }) => route.familyId)).size)
      .toBeGreaterThan(1);
    const nextPack = buildBusinessVariationPack(root, registry, "hvac", {
      seed: "hvac-variation-canary-alternate-seed",
    });
    expect(
      nextPack.pack.routes.flatMap((route: { referenceIds: string[] }) => route.referenceIds),
    ).not.toEqual(
      pack.routes.flatMap((route: { referenceIds: string[] }) => route.referenceIds),
    );
    for (const route of pack.routes) {
      expect(route.referenceIds).toHaveLength(1);
      expect(nicheIds.has(route.referenceIds[0])).toBe(true);
      const dossier = JSON.parse(
        fs.readFileSync(path.join(root, route.referenceDossier.path, "manifest.json"), "utf8"),
      );
      expect(dossier.productionEligible).toBe(true);
      expect(route.referenceDossier.tags.business).toContain("hvac");
    }
    expect(pack.routes.flatMap((route: { referenceIds: string[] }) => route.referenceIds))
      .not.toContain("kokoro-spatial-editorial");
  });

  it("rejects unknown business variation scenarios", () => {
    expect(() =>
      buildBusinessVariationConfig({}, "koko-ro"),
    ).toThrow(/unknown business variation scenario/iu);
  });
});
