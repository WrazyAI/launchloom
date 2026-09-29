import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  feedbackAssetPath,
  materializeFeedbackAssets,
  normalizeFeedbackImage,
} from "../scripts/feedback-assets.mjs";

const ASSET_BASE = "https://assets.example.test";
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-feedback-assets-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function imageBuffer(width = 800, height = 450, format = "png") {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 90, b: 70, alpha: 1 },
    },
  });
  return format === "webp" ? pipeline.webp().toBuffer() : pipeline.png().toBuffer();
}

function imageResponse(buffer: Buffer, contentType = "image/png") {
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("feedback image materialization", () => {
  it("downloads, normalizes, and records a generated replacement", async () => {
    const outputDir = await temporaryDirectory();
    const buffer = await imageBuffer(1600, 900);
    const url = `${ASSET_BASE}/feedback-drafts/example-client/draft-1.png`;
    const fetchImpl = vi.fn(async () => imageResponse(buffer));
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [
              {
                target: "hero",
                kind: "generated",
                url,
                prompt: "A calm workshop scene",
                model: "fal-ai/minimax/image-01",
              },
            ],
            colors: [{ role: "primary", hex: "#123456" }],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl,
    });

    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.items[0].colors).toEqual([
      { role: "primary", hex: "#123456" },
    ]);
    const [asset] = result.items[0].assets;
    expect(asset).toMatchObject({
      target: "hero",
      kind: "generated",
      source: "fal-generated",
      model: "fal-ai/minimax/image-01",
      width: 1600,
      height: 900,
    });
    expect(asset.path).toBe(
      feedbackAssetPath("hero", url),
    );
    expect(asset.path).toMatch(/^\/images\/feedback\/hero-[a-f0-9]{12}\.webp$/u);
    expect(asset.promptHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const written = await fs.readFile(
      path.join(outputDir, path.basename(asset.path)),
    );
    const metadata = await sharp(written).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1600);
  });

  it("records an uploaded client image with client provenance", async () => {
    const outputDir = await temporaryDirectory();
    const url = `${ASSET_BASE}/feedback/example-client/upload-1.webp`;
    const fetchImpl = vi.fn(async () =>
      imageResponse(await imageBuffer(600, 600, "webp"), "image/webp"),
    );
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [{ target: "logo", kind: "upload", url }],
            colors: [],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl,
    });
    expect(result.failures).toEqual([]);
    expect(result.items[0].assets[0]).toMatchObject({
      target: "logo",
      kind: "upload",
      source: "client",
    });
    expect(result.items[0].assets[0].promptHash).toBeUndefined();
  });

  it("rejects URLs outside LaunchLoom storage without fetching", async () => {
    const outputDir = await temporaryDirectory();
    const fetchImpl = vi.fn();
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [
              {
                target: "hero",
                kind: "upload",
                url: "https://evil.example.test/hero.png",
              },
            ],
            colors: [],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.items[0].assets).toEqual([]);
    expect(result.failures.join(" ")).toContain("outside LaunchLoom storage");
  });

  it("rejects non-image responses", async () => {
    const outputDir = await temporaryDirectory();
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [
              {
                target: "hero",
                kind: "upload",
                url: `${ASSET_BASE}/feedback/x/page.html`,
              },
            ],
            colors: [],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl: vi.fn(async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    });
    expect(result.items[0].assets).toEqual([]);
    expect(result.failures.join(" ")).toContain("not an image");
  });

  it("rejects images below the placement minimum", async () => {
    const outputDir = await temporaryDirectory();
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [
              {
                target: "hero",
                kind: "upload",
                url: `${ASSET_BASE}/feedback/x/tiny.png`,
              },
            ],
            colors: [],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl: vi.fn(async () => imageResponse(await imageBuffer(120, 80))),
    });
    expect(result.items[0].assets).toEqual([]);
    expect(result.failures.join(" ")).toContain("at least 640 by 360");
  });

  it("reuses one download for a repeated attachment URL", async () => {
    const outputDir = await temporaryDirectory();
    const url = `${ASSET_BASE}/feedback-drafts/x/shared.png`;
    const fetchImpl = vi.fn(async () => imageResponse(await imageBuffer()));
    const result = await materializeFeedbackAssets({
      items: [
        {
          text: "",
          structure: {
            attachments: [
              { target: "hero", kind: "upload", url },
              { target: "secondary", kind: "upload", url },
            ],
            colors: [],
          },
        },
      ],
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl,
    });
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.items[0].assets).toHaveLength(2);
  });

  it("keeps the feedback asset path deterministic per target and URL", () => {
    const one = feedbackAssetPath(
      "hero",
      `${ASSET_BASE}/feedback/x/a.webp`,
    );
    const two = feedbackAssetPath(
      "hero",
      `${ASSET_BASE}/feedback/x/a.webp`,
    );
    const other = feedbackAssetPath(
      "logo",
      `${ASSET_BASE}/feedback/x/a.webp`,
    );
    expect(one).toBe(two);
    expect(one).not.toBe(other);
  });

  it("normalizes alpha logos to webp without enlarging them", async () => {
    const normalized = await normalizeFeedbackImage(
      await imageBuffer(200, 120),
      { maxWidth: 512, minWidth: 48, minHeight: 48 },
    );
    expect(normalized.width).toBe(200);
    expect(normalized.height).toBe(120);
  });
});

describe("structured feedback wiring", () => {
  it("plans image and color operations from a parsed feedback comment", async () => {
    const { feedbackStructureFromComment, pendingFeedbackFromComments } =
      await import("../scripts/feedback-utils.mjs");
    const { planRevision } = await import("../scripts/revision-engine.mjs");
    const outputDir = await temporaryDirectory();
    const url = `${ASSET_BASE}/feedback-drafts/example-client/hero.webp`;
    const body = [
      "<!-- launchloom-feedback:developer -->",
      `<!-- launchloom-feedback-structure:${Buffer.from(
        JSON.stringify({
          attachments: [
            {
              target: "hero",
              kind: "generated",
              url,
              prompt: "A warm workshop scene",
              model: "fal-ai/minimax/image-01",
            },
          ],
          colors: [{ role: "primary", hex: "#123456" }],
        }),
      ).toString("base64url")} -->`,
      "**Developer feedback · Hero image, Colors**",
      "",
      "_Requested changes:_",
      "- Replace the hero image with a generated image.",
      "",
      "_Page: https://review.example.pages.dev/_",
    ].join("\n");
    expect(feedbackStructureFromComment(body).colors).toHaveLength(1);
    const requests = pendingFeedbackFromComments(
      [{ created_at: "2026-09-08T09:00:00Z", body }],
      "developer",
      true,
    );
    expect(requests).toHaveLength(1);
    const materialized = await materializeFeedbackAssets({
      items: requests,
      assetBaseUrl: ASSET_BASE,
      outputDir,
      fetchImpl: vi.fn(async () => imageResponse(await imageBuffer())),
    });
    expect(materialized.failures).toEqual([]);
    const planned = await planRevision(
      materialized.items,
      {
        business: { name: "Daley Hope", placeId: "" },
        style: { primaryColor: "#205d51" },
        differentiators: ["Experienced support"],
        services: [{ name: "Home care" }],
      },
      async () => [],
    );
    expect(planned.ok).toBe(true);
    expect(planned.config.style.primaryColor).toBe("#123456");
    expect(planned.config.images.hero).toMatch(
      /^\/images\/feedback\/hero-[a-f0-9]{12}\.webp$/u,
    );
    expect(planned.config.assets.photoOne).toBe(planned.config.images.hero);
  });
});
