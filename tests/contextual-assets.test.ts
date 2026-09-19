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
});
