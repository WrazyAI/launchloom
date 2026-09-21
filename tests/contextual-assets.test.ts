import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { generateContextualAssets } from "../scripts/generate-contextual-assets.mjs";

const generate = generateContextualAssets as any;

function fixture(): any {
  return {
    businessKind: "bicycle workshop",
    industry: "home-services",
    business: {
      name: "Arc and Alder Cycle Atelier",
      serviceAreas: ["Minneapolis", "Saint Paul"],
    },
    style: {
      tone: "confident",
      preference: "bold-premium",
      visualDirection: "dark workshop, warm wood, precise editorial detail",
    },
    services: [
      { name: "Precision bicycle fitting" },
      { name: "Workshop diagnostics" },
    ],
    seoResearch: {
      copyVocabulary: ["bike fitting Minneapolis", "appointment bicycle repair"],
      customerQuestions: ["What should I bring to a fitting?"],
    },
    images: {},
    assets: {},
  };
}

async function fakeImageResponse() {
  const buffer = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 36, g: 42, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  return new Response(buffer, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("contextual image generation", () => {
  it("writes local optimized WebP assets and keeps provider URLs out of site config", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const manifestPath = join(outputDir, "generated-assets.json");
    const requests: string[] = [];
    const result = await generate({
      site: fixture(),
      inspiration: { routes: [{ signature: "editorial workshop" }] },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe(_model: string, options: { input: { aspect_ratio: string } }) {
          requests.push(options.input.aspect_ratio);
          return {
            requestId: `req-${requests.length}`,
            data: { images: [{ url: "https://fal.example/generated.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(requests).toEqual(["16:9", "4:3", "3:2"]);
    expect(result.manifest.placements).toHaveLength(3);
    expect(result.site.images.hero).toMatch(/^\/images\/generated\/hero-/);
    expect(result.site.assetReport.used).toHaveLength(3);
    expect(JSON.stringify(result.site)).not.toContain("fal.example");
    expect(JSON.stringify(JSON.parse(await readFile(manifestPath, "utf8")))).toContain(
      "https://fal.example/generated.jpg",
    );
    for (const entry of result.manifest.placements as Array<{ path: string }>) {
      const fileName = entry.path.split("/").pop();
      expect(fileName).toBeTruthy();
      expect((await stat(join(outputDir, fileName!))).isFile()).toBe(true);
    }

    const reused = await generate({
      site: fixture(),
      inspiration: { routes: [{ signature: "editorial workshop" }] },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          throw new Error("A prompt-hash match should reuse the local asset.");
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });
    expect(reused.manifest.placements.every((entry: { reused?: boolean }) => entry.reused)).toBe(true);
    expect(reused.requests).toBe(0);
  });

  it("preserves client photos and only fills missing placements", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const site = fixture();
    site.assets = {
      photoOne: "/uploads/client-hero.webp",
      photoTwo: "/uploads/client-secondary.webp",
    };
    const calls: string[] = [];
    const result = await generate({
      site,
      outputDir,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          calls.push("request");
          return { data: { images: [{ url: "https://fal.example/detail.jpg" }] } };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(calls).toHaveLength(1);
    expect(result.site.images.hero).toBeUndefined();
    expect(result.site.images.secondary).toBeUndefined();
    expect(result.site.images.tertiary).toMatch(/^\/images\/generated\/tertiary-/);
    expect(result.site.assets.photoOne).toBe("/uploads/client-hero.webp");
    expect(result.site.assets.photoTwo).toBe("/uploads/client-secondary.webp");
  });

  it("fails soft without a key and retains reviewed fallback assets", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const site = fixture();
    site.images = {
      hero: "/images/packs/workshop-hero.webp",
      secondary: "/images/packs/workshop-secondary.webp",
    };
    let called = false;
    const result = await generate({
      site,
      outputDir,
      key: "",
      falClient: {
        config() {},
        async subscribe() {
          called = true;
          return { data: { images: [] } };
        },
      },
    });

    expect(called).toBe(false);
    expect(result.requests).toBe(0);
    expect(result.site.images.hero).toBe("/images/packs/workshop-hero.webp");
    expect(result.site.images.secondary).toBe("/images/packs/workshop-secondary.webp");
    expect(result.manifest.skipped).toHaveLength(3);
    expect(result.site.assetReport.skipped).toHaveLength(3);
  });

  it("generates independent creative assets for every reference route", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const site = fixture();
    const inspiration = {
      routes: [
        {
          id: "route-01",
          familyId: "editorial-monument",
          signature: "editorial route",
          referenceDna: {
            familyId: "kokoro-editorial-architecture",
            heroGeometry: { mode: "typographic-monument" },
            imageTreatment: { mode: "architectural-tableaux", crop: "vertical-editorial" },
            palette: { contrastIntent: "dark editorial" },
          },
        },
        {
          id: "route-02",
          familyId: "spatial-object",
          signature: "object route",
          referenceDna: {
            familyId: "3d-portfolio-object-led",
            heroGeometry: { mode: "oversized-wordmark-with-object-focus" },
            imageTreatment: { mode: "object-led-3d-collage", crop: "deep-focus" },
            palette: { contrastIntent: "object stage" },
          },
        },
        {
          id: "route-03",
          familyId: "cinematic-stage",
          signature: "cinematic route",
          referenceDna: {
            familyId: "skyelite-cinematic-luxury",
            heroGeometry: { mode: "centered-copy-over-motion-landscape" },
            imageTreatment: { mode: "atmospheric-motion-background", crop: "wide-cinematic" },
            palette: { contrastIntent: "quiet premium" },
          },
        },
      ],
    };
    let requestNumber = 0;
    const result = await generate({
      site,
      inspiration,
      outputDir,
      key: "test-fal-key",
      maxImages: 99,
      maxRequests: 12,
      falClient: {
        config() {},
        async subscribe() {
          requestNumber += 1;
          return {
            requestId: `route-request-${requestNumber}`,
            data: { images: [{ url: `https://fal.example/generated-${requestNumber}.jpg` }] },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(Object.keys(result.site.creativeAssets)).toEqual([
      "route-01",
      "route-02",
      "route-03",
    ]);
    expect(new Set(Object.values(result.site.creativeAssets).map((assets: any) => assets.hero)).size).toBe(3);
    expect(result.manifest.strategy).toBe("client-first-per-route-reference-directed");
    expect(result.manifest.routes).toHaveLength(3);
    expect(result.manifest.placements).toHaveLength(3);
    for (const manifest of result.manifest.routes)
      expect(manifest.placements).toHaveLength(1);
  });

  it.each([6, 7])("reserves requests for later routes despite retries with a cap of %i", async (maxRequests) => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const routes = [1, 2, 3].map((number) => ({
      id: `route-0${number}`,
      signature: `budget-route-${number}`,
    }));
    const calls: string[] = [];
    const result = await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      key: "test-fal-key",
      maxRequests,
      falClient: {
        config() {},
        async subscribe(_model: string, options: { input: { prompt: string } }) {
          calls.push(options.input.prompt.match(/budget-route-\d/)![0]);
          if (!options.input.prompt.includes("Make the subject simpler"))
            throw new Error("Retry this placement.");
          return { data: { images: [{ url: "https://fal.example/retry.jpg" }] } };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(calls).toEqual(routes.flatMap((route) => Array(2).fill(route.signature)));
    expect(result.requests).toBe(6);
    expect(result.requests).toBeLessThanOrEqual(maxRequests);
    for (const manifest of result.manifest.routes) {
      expect(manifest.placements.map((entry: any) => entry.placement)).toEqual([
        "hero",
      ]);
      expect(manifest.skipped).toEqual([
        expect.objectContaining({ placement: "secondary", reason: "image-budget-exhausted" }),
        expect.objectContaining({ placement: "tertiary", reason: "image-budget-exhausted" }),
      ]);
    }
  });

  it.each([2, 1, 0, -1])("preserves the global cap when the budget is smaller than the route count: %i", async (maxRequests) => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const routes = [1, 2, 3].map((number) => ({
      id: `route-0${number}`,
      signature: `budget-route-${number}`,
    }));
    const site = fixture();
    site.images = { hero: "/images/packs/workshop-hero.webp" };
    const calls: string[] = [];
    const result = await generate({
      site,
      inspiration: { routes },
      outputDir,
      key: "test-fal-key",
      maxRequests,
      falClient: {
        config() {},
        async subscribe(_model: string, options: { input: { prompt: string } }) {
          calls.push(options.input.prompt.match(/budget-route-\d/)![0]);
          throw new Error("Provider unavailable.");
        },
      },
    });

    expect(calls).toEqual(routes.slice(0, Math.max(0, maxRequests)).map((route) => route.signature));
    expect(result.requests).toBe(Math.max(0, maxRequests));
    expect(result.manifest.routes).toHaveLength(3);
    expect(result.manifest.placements).toHaveLength(0);
    expect(result.manifest.skipped).toHaveLength(9);
    for (const route of routes)
      expect(result.site.creativeAssets[route.id].hero).toBe(site.images.hero);
  });

  it("reuses route-specific aggregate manifest assets without new requests", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const manifestPath = join(outputDir, "generated-assets.json");
    const routes = [1, 2, 3].map((number) => ({
      id: `route-0${number}`,
      signature: `reuse-route-${number}`,
    }));
    let requests = 0;
    await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          requests += 1;
          return { data: { images: [{ url: `https://fal.example/reuse-${requests}.jpg` }] } };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });
    expect(requests).toBe(3);

    let reuseRequests = 0;
    const reused = await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          reuseRequests += 1;
          throw new Error("Route assets should be reused from the aggregate manifest.");
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(reuseRequests).toBe(0);
    expect(reused.requests).toBe(0);
    expect(reused.manifest.placements).toHaveLength(3);
    expect(reused.manifest.placements.every((entry: any) => entry.reused)).toBe(true);
  });

});
