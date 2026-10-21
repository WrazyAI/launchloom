import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  DEFAULT_MAX_PROMPT_LENGTH,
  generateContextualAssets,
  reviewGeneratedAsset,
} from "../scripts/generate-contextual-assets.mjs";
import { CREATIVE_FAMILIES } from "../scripts/creative-compiler.mjs";

const generate = (options: any): Promise<any> =>
  generateContextualAssets({
    imageReviewer: async () => ({
      approved: true,
      reasonCodes: [],
      model: "test-reviewer",
      usage: null,
    }),
    ...options,
  } as any) as Promise<any>;

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
      copyVocabulary: [
        "bike fitting Minneapolis",
        "appointment bicycle repair",
      ],
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

async function fakeGibberishWebsiteScreenshotResponse() {
  const screenshot = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <rect width="1280" height="720" fill="#f4f0e6"/>
      <rect width="1280" height="94" fill="#ffffff"/>
      <text x="48" y="58" font-size="30" fill="#16241e">TUREDATO</text>
      <text x="690" y="58" font-size="17" fill="#16241e">HOME   ABOT   SRVICES   CONTAC</text>
      <rect x="56" y="148" width="510" height="470" rx="20" fill="#e2e9dc"/>
      <text x="98" y="270" font-size="70" fill="#16241e">Greeb frsh</text>
      <text x="98" y="328" font-size="28" fill="#16241e">clnig whn u ned us</text>
      <rect x="98" y="382" width="188" height="54" rx="10" fill="#41695a"/>
      <text x="120" y="416" font-size="19" fill="#fff">Larn mor</text>
      <rect x="632" y="148" width="590" height="470" rx="20" fill="#c5c4b2"/>
      <rect x="682" y="205" width="490" height="175" rx="14" fill="#9ea68c"/>
      <rect x="682" y="404" width="230" height="152" rx="14" fill="#fff"/>
      <rect x="930" y="404" width="242" height="152" rx="14" fill="#fff"/>
      <text x="703" y="450" font-size="22" fill="#16241e">Prmium srvce</text>
      <text x="950" y="450" font-size="22" fill="#16241e">Bst in twn</text>
    </svg>
  `);
  const buffer = await sharp(screenshot).jpeg().toBuffer();
  return new Response(buffer, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("contextual image generation", () => {
  it("reviews the exact normalized bitmap through the multimodal structured-output transport", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-default-image-review-"),
    );
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const requests: Array<Record<string, any>> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  isStandaloneImage: true,
                  containsWebsiteOrInterface: false,
                  containsVisibleTextOrTextLikeMarks: false,
                  containsLogoOrWatermark: false,
                  containsPeople: false,
                  isRelevantToBusiness: true,
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 500,
            completion_tokens: 30,
            total_tokens: 530,
            cost: 0.0004,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-openrouter-cache-status": "MISS",
          },
        },
      );
    });

    try {
      const result = await generateContextualAssets({
        site: fixture(),
        inspiration: {
          routes: [{ id: "review-route", familyId: "utility-diagnostic" }],
        },
        outputDir,
        key: "test-fal-key",
        maxImages: 1,
        maxRequests: 1,
        falClient: {
          config() {},
          async subscribe() {
            return {
              data: { images: [{ url: "https://fal.example/approved.jpg" }] },
            };
          },
        },
        fetchImpl: async () => fakeImageResponse(),
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].response_format.json_schema.strict).toBe(true);
      const messages = requests[0].messages;
      const reviewContent = messages[1].content;
      expect(
        reviewContent.some(
          (part: any) =>
            part.type === "image_url" &&
            part.image_url.url.startsWith("data:image/webp;base64,"),
        ),
      ).toBe(true);
      expect(
        reviewContent
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join(" "),
      ).not.toContain("data:image/");
      expect(result.manifest.placements[0].imageReview).toMatchObject({
        status: "approved",
        usage: { prompt_tokens: 500, completion_tokens: 30, cost: 0.0004 },
        cacheStatus: "miss",
      });
      expect(result.site.images.hero).toMatch(/^\/images\/generated\/hero-/);
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });

  it("does not spend a FAL request when the required visual reviewer is unavailable", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-no-image-reviewer-"),
    );
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const site = fixture();
    site.images = { hero: "/images/reviewed-fallback.webp" };
    let requests = 0;

    try {
      const result = await generateContextualAssets({
        site,
        inspiration: { routes: [{ id: "no-reviewer-route" }] },
        outputDir,
        key: "test-fal-key",
        maxImages: 1,
        maxRequests: 1,
        falClient: {
          config() {},
          async subscribe() {
            requests += 1;
            throw new Error("FAL must not run without a reviewer.");
          },
        },
      });

      expect(requests).toBe(0);
      expect(result.requests).toBe(0);
      expect(result.site.images.hero).toBe("/images/reviewed-fallback.webp");
      expect(result.manifest.skipped[0]).toMatchObject({
        placement: "hero",
        reason: "OPENROUTER_API_KEY-not-configured",
        fallback: "/images/reviewed-fallback.webp",
      });
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });

  it("rejects webpage-like generated imagery, retries once, then uses the reviewed fallback", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-image-review-"));
    const manifestPath = join(outputDir, "generated-assets.json");
    const site = fixture();
    site.images = { hero: "/images/reviewed-roofing-hero.webp" };
    site.assetReport = {
      used: [
        {
          asset: site.images.hero,
          placement: "hero",
          source: "licensed-stock",
        },
      ],
      skipped: [],
    };
    const prompts: string[] = [];
    const reviewAttempts: number[] = [];
    let falRequests = 0;

    const result = await generate({
      site,
      inspiration: {
        routes: [{ id: "roofing-route", familyId: "utility-diagnostic" }],
      },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 2,
      falClient: {
        config() {},
        async subscribe(
          _model: string,
          options: { input: { prompt: string } },
        ) {
          falRequests += 1;
          prompts.push(options.input.prompt);
          return {
            data: {
              images: [
                { url: `https://fal.example/website-${falRequests}.jpg` },
              ],
            },
          };
        },
      },
      fetchImpl: async () => fakeGibberishWebsiteScreenshotResponse(),
      imageReviewer: async ({ attempt }: { attempt: number }) => {
        reviewAttempts.push(attempt);
        return {
          approved: false,
          reasonCodes: ["website_or_interface", "visible_text"],
          model: "test-reviewer",
          usage: { total_tokens: 20 },
        };
      },
    });

    expect(falRequests).toBe(2);
    expect(result.requests).toBe(2);
    expect(reviewAttempts).toEqual([1, 2]);
    expect(prompts[1]).toContain(
      "Do not create a webpage, interface, or any visible text",
    );
    expect(result.site.images.hero).toBe("/images/reviewed-roofing-hero.webp");
    expect(result.manifest.placements).toEqual([]);
    expect(result.manifest.generationRequests).toBe(2);
    expect(result.manifest.skipped[0]).toEqual(
      expect.objectContaining({
        placement: "hero",
        reason: "image-review-rejected",
        fallback: "/images/reviewed-roofing-hero.webp",
        imageReviews: [
          expect.objectContaining({
            reasonCodes: ["website_or_interface", "visible_text"],
          }),
          expect.objectContaining({
            reasonCodes: ["website_or_interface", "visible_text"],
          }),
        ],
      }),
    );
    expect(result.site.assetReport.used).toEqual([
      expect.objectContaining({ source: "licensed-stock" }),
    ]);
    expect(JSON.stringify(result.site)).not.toContain("fal.example");
    await expect(
      (await import("node:fs/promises"))
        .readdir(outputDir)
        .then((files) => files.filter((file) => file.endsWith(".webp"))),
    ).resolves.toEqual([]);
    const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(persisted.placements).toEqual([]);
    expect(JSON.stringify(persisted)).not.toContain("https://fal.example");
  });

  it("keeps the tightened retry prompt within FAL's prompt limit", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-bounded-image-retry-"),
    );
    const site = fixture();
    site.services = Array.from({ length: 6 }, (_, index) => ({
      name: `Roof service ${index} ${"s".repeat(120)}`,
    }));
    site.business.serviceAreas = Array.from(
      { length: 3 },
      (_, index) => `Area ${index} ${"a".repeat(100)}`,
    );
    site.seoResearch.copyVocabulary = Array.from(
      { length: 5 },
      (_, index) => `Search phrase ${index} ${"v".repeat(120)}`,
    );
    site.seoResearch.customerQuestions = Array.from(
      { length: 3 },
      (_, index) => `Question ${index} ${"q".repeat(120)}`,
    );
    site.style.visualDirection = "Editorial materials " + "d".repeat(170);
    const prompts: string[] = [];

    const result = await generate({
      site,
      inspiration: {
        routes: [
          {
            id: "long-roofing-route",
            familyId: "utility-diagnostic",
            referenceDna: {
              familyId: "utility-diagnostic",
              heroGeometry: { mode: "Roofing hero " + "h".repeat(170) },
              imageTreatment: {
                mode: "Service photography " + "m".repeat(170),
                crop: "Wide crop " + "c".repeat(120),
              },
              palette: { contrastIntent: "Dark green " + "p".repeat(120) },
            },
          },
        ],
      },
      outputDir,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 2,
      falClient: {
        config() {},
        async subscribe(
          _model: string,
          options: { input: { prompt: string } },
        ) {
          prompts.push(options.input.prompt);
          return {
            data: {
              images: [
                { url: `https://fal.example/attempt-${prompts.length}.jpg` },
              ],
            },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
      imageReviewer: async ({ attempt }: { attempt: number }) => ({
        approved: attempt === 2,
        reasonCodes: attempt === 1 ? ["website_or_interface"] : [],
        model: "test-reviewer",
      }),
    });

    expect(prompts[0]).toHaveLength(DEFAULT_MAX_PROMPT_LENGTH);
    expect(prompts[1].length).toBeLessThanOrEqual(DEFAULT_MAX_PROMPT_LENGTH);
    expect(prompts[1]).toContain(
      "Do not create a webpage, interface, or any visible text",
    );
    expect(result.manifest.placements).toHaveLength(1);
  });

  it("records sanitized OpenRouter visual-review failure diagnostics", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-image-review-error-"),
    );
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "private provider response must not be retained",
            },
            usage: {
              prompt_tokens: 400,
              completion_tokens: 0,
              total_tokens: 400,
              cost: 0.001,
            },
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
              "x-request-id": "router-review-request-123",
            },
          },
        ),
    );

    try {
      const result = await generateContextualAssets({
        site: fixture(),
        inspiration: { routes: [{ id: "review-error-route" }] },
        outputDir,
        key: "test-fal-key",
        maxImages: 1,
        maxRequests: 1,
        falClient: {
          config() {},
          async subscribe() {
            return {
              data: {
                images: [{ url: "https://fal.example/review-error.jpg" }],
              },
            };
          },
        },
        fetchImpl: async () => fakeImageResponse(),
      });

      const review = result.manifest.skipped[0].imageReviews[0];
      expect(review).toMatchObject({
        status: "unavailable",
        failureCode: "http_error",
        httpStatus: 503,
        requestId: "router-review-request-123",
        usage: { prompt_tokens: 400, cost: 0.001 },
      });
      expect(JSON.stringify(result.manifest)).not.toContain(
        "private provider response must not be retained",
      );
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });

  it("stops on FAL validation errors and records safe request metadata", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-fal-validation-error-"),
    );
    let requests = 0;
    const result = await generate({
      site: fixture(),
      inspiration: { routes: [{ id: "fal-validation-route" }] },
      outputDir,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 2,
      falClient: {
        config() {},
        async subscribe() {
          requests += 1;
          const error = new Error(
            "raw FAL validation body must not be retained",
          );
          error.name = "ValidationError";
          Object.assign(error, {
            status: 422,
            requestId: "fal-validation-request-456",
            fieldErrors: [
              {
                loc: ["body", "prompt"],
                msg: "raw FAL validation body must not be retained",
                type: "value_error",
              },
            ],
          });
          throw error;
        },
      },
      imageReviewer: async () => ({ approved: true, reasonCodes: [] }),
    });

    expect(requests).toBe(1);
    expect(result.requests).toBe(1);
    expect(result.manifest.skipped[0]).toMatchObject({
      placement: "hero",
      reason: "fal-validation-error-422",
      providerFailure: {
        provider: "fal.ai",
        category: "validation",
        status: 422,
        requestId: "fal-validation-request-456",
        fields: ["prompt"],
      },
    });
    expect(JSON.stringify(result.manifest)).not.toContain(
      "raw FAL validation body must not be retained",
    );
  });

  it("does not retain an older unreviewed FAL image as the fallback", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-reject-stale-fal-"),
    );
    const site = fixture();
    site.images = { hero: "/images/generated/legacy-hero.webp" };
    site.assetReport = {
      used: [
        {
          asset: site.images.hero,
          placement: "hero",
          source: "fal-generated",
        },
      ],
      skipped: [],
    };

    const result = await generate({
      site,
      inspiration: { routes: [{ id: "reject-stale-route" }] },
      outputDir,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 2,
      falClient: {
        config() {},
        async subscribe() {
          return {
            data: { images: [{ url: "https://fal.example/rejected.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeGibberishWebsiteScreenshotResponse(),
      imageReviewer: async () => ({
        approved: false,
        reasonCodes: ["website_or_interface", "visible_text"],
        model: "test-reviewer",
      }),
    });

    expect(result.site.images.hero).toBeUndefined();
    expect(result.site.assetReport.used).toEqual([]);
    expect(result.manifest.skipped[0]).toMatchObject({
      placement: "hero",
      reason: "image-review-rejected",
      fallback: "",
    });
  });

  it("does not restore a rejected legacy FAL image while merging multiple routes", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-reject-stale-routes-"),
    );
    const routes = [
      { id: "route-one", familyId: "utility-diagnostic" },
      { id: "route-two", familyId: "editorial-monument" },
    ];
    const site = fixture();
    site.images = { hero: "/images/generated/legacy-hero.webp" };
    site.assetReport = {
      used: [
        {
          asset: site.images.hero,
          placement: "hero",
          source: "fal-generated",
        },
      ],
      skipped: [],
    };

    const result = await generate({
      site,
      inspiration: { routes },
      outputDir,
      key: "test-fal-key",
      maxImages: 2,
      maxRequests: 4,
      falClient: {
        config() {},
        async subscribe() {
          return {
            data: { images: [{ url: "https://fal.example/rejected.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeGibberishWebsiteScreenshotResponse(),
      imageReviewer: async () => ({
        approved: false,
        reasonCodes: ["website_or_interface", "visible_text"],
        model: "test-reviewer",
      }),
    });

    expect(result.site.images.hero).toBeUndefined();
    expect(result.site.creativeAssets["route-one"].hero).toBe("");
    expect(result.site.creativeAssets["route-two"].hero).toBe("");
    expect(result.site.assetReport.used).toEqual([]);
  });

  it("uses distinct image art direction for every production creative family", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "launchloom-family-assets-"),
    );
    const families = Object.keys(CREATIVE_FAMILIES);
    const heroBriefs = new Map<string, string>();

    for (const familyId of families) {
      let prompt = "";
      await generate({
        site: fixture(),
        inspiration: {
          routes: [
            {
              id: `route-${familyId}`,
              familyId,
              referenceDna: { familyId },
            },
          ],
        },
        outputDir,
        key: "test-fal-key",
        maxImages: 1,
        maxRequests: 1,
        falClient: {
          config() {},
          async subscribe(
            _model: string,
            options: { input: { prompt: string } },
          ) {
            prompt = options.input.prompt;
            return {
              data: {
                images: [{ url: `https://fal.example/${familyId}.jpg` }],
              },
            };
          },
        },
        fetchImpl: async () => fakeImageResponse(),
      });

      heroBriefs.set(
        familyId,
        prompt.split("Primary request: ")[1]?.split(" Business context: ")[0] ||
          "",
      );
    }

    expect([...heroBriefs.values()]).not.toContain("");
    expect(
      [...heroBriefs.values()].some((brief) =>
        brief.includes(
          "Create a distinctive, service-relevant scene using the assigned reference's physical subject cues",
        ),
      ),
    ).toBe(false);
    expect(new Set(heroBriefs.values()).size).toBe(families.length);
  });

  it("passes its per-request limit to the FAL queue so timed-out work is cancelled", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const timeouts: number[] = [];
    await generate({
      site: fixture(),
      inspiration: { routes: [{ id: "route-timeout", signature: "bounded" }] },
      outputDir,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 1,
      timeoutMs: 7_321,
      falClient: {
        config() {},
        async subscribe(_model: string, options: { timeout?: number }) {
          timeouts.push(options.timeout ?? 0);
          return {
            data: { images: [{ url: "https://fal.example/bounded.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(timeouts).toEqual([7_321]);
  });

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
        async subscribe(
          _model: string,
          options: { input: { aspect_ratio: string } },
        ) {
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
    expect(
      JSON.stringify(JSON.parse(await readFile(manifestPath, "utf8"))),
    ).toContain("https://fal.example/generated.jpg");
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
    expect(
      reused.manifest.placements.every(
        (entry: { reused?: boolean }) => entry.reused,
      ),
    ).toBe(true);
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
          return {
            data: { images: [{ url: "https://fal.example/detail.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(calls).toHaveLength(1);
    expect(result.site.images.hero).toBeUndefined();
    expect(result.site.images.secondary).toBeUndefined();
    expect(result.site.images.tertiary).toMatch(
      /^\/images\/generated\/tertiary-/,
    );
    expect(result.site.assets.photoOne).toBe("/uploads/client-hero.webp");
    expect(result.site.assets.photoTwo).toBe("/uploads/client-secondary.webp");
  });

  it("preserves an explicit zero request budget", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const previous = process.env.FAL_IMAGE_MAX_REQUESTS;
    process.env.FAL_IMAGE_MAX_REQUESTS = "0";
    let requests = 0;
    try {
      const result = await generate({
        site: fixture(),
        inspiration: {
          routes: [{ id: "route-zero", signature: "zero-budget" }],
        },
        outputDir,
        key: "test-fal-key",
        falClient: {
          config() {},
          async subscribe() {
            requests += 1;
            throw new Error("A zero request budget must not call FAL.");
          },
        },
      });
      expect(requests).toBe(0);
      expect(result.requests).toBe(0);
      expect(result.manifest.placements).toHaveLength(0);
      expect(result.manifest.skipped).toHaveLength(3);
    } finally {
      if (previous === undefined) delete process.env.FAL_IMAGE_MAX_REQUESTS;
      else process.env.FAL_IMAGE_MAX_REQUESTS = previous;
    }
  });

  it("falls back to the default request budget for invalid multi-route input", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const routes = [1, 2, 3].map((number) => ({
      id: `route-invalid-${number}`,
      signature: `invalid-budget-${number}`,
    }));
    let requests = 0;
    const result = await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      maxRequests: "invalid",
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          requests += 1;
          return {
            data: {
              images: [{ url: `https://fal.example/invalid-${requests}.jpg` }],
            },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });
    expect(requests).toBe(3);
    expect(result.requests).toBe(3);
    expect(result.manifest.placements).toHaveLength(3);
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
    expect(result.site.images.secondary).toBe(
      "/images/packs/workshop-secondary.webp",
    );
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
            imageTreatment: {
              mode: "architectural-tableaux",
              crop: "vertical-editorial",
            },
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
            imageTreatment: {
              mode: "object-led-3d-collage",
              crop: "deep-focus",
            },
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
            imageTreatment: {
              mode: "atmospheric-motion-background",
              crop: "wide-cinematic",
            },
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
            data: {
              images: [
                { url: `https://fal.example/generated-${requestNumber}.jpg` },
              ],
            },
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
    expect(
      new Set(
        Object.values(result.site.creativeAssets).map(
          (assets: any) => assets.hero,
        ),
      ).size,
    ).toBe(3);
    expect(result.manifest.strategy).toBe(
      "client-first-per-route-reference-directed",
    );
    expect(result.manifest.routes).toHaveLength(3);
    expect(result.manifest.placements).toHaveLength(3);
    for (const manifest of result.manifest.routes)
      expect(manifest.placements).toHaveLength(1);
  });

  it("carries each painting reference's physical scene cues into its own hero image prompt", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const site = fixture();
    site.businessKind = "residential painting contractor";
    site.industry = "painting";
    site.services = [{ name: "Interior and exterior painting" }];
    site.style = {
      tone: "calm and craft-focused",
      preference: "warm residential",
      visualDirection:
        "documentary photos of completed residential painting work",
    };
    site.seoResearch = {
      copyVocabulary: ["residential painting Minneapolis"],
      customerQuestions: ["Which rooms or exterior surfaces need painting?"],
    };
    const prompts: string[] = [];
    const routes = [
      {
        id: "interior-reference",
        signature: "warm residential interior",
        referenceDna: {
          familyId: "web-painting-novak",
          heroGeometry: {
            mode: "an editorial column paired with a large refined living-room photograph",
          },
          imageTreatment: {
            mode: "calm residential interiors and project thumbnails",
          },
        },
      },
      {
        id: "coastal-exterior-reference",
        signature: "coastal finished house",
        referenceDna: {
          familyId: "web-painting-mfl",
          heroGeometry: {
            mode: "a coastal-house exterior image carries an estimate form alongside",
          },
          imageTreatment: {
            mode: "residential exterior project photography",
          },
        },
      },
      {
        id: "painted-house-reference",
        signature: "painted home scene",
        referenceDna: {
          familyId: "web-painting-southern",
          heroGeometry: {
            mode: "a full-width painted-house exterior lifestyle scene with a floating estimate form",
          },
          imageTreatment: {
            mode: "finished painted homes and room interiors",
          },
        },
      },
    ];

    await generate({
      site,
      inspiration: { routes },
      outputDir,
      key: "test-fal-key",
      maxImages: 3,
      maxRequests: 3,
      falClient: {
        config() {},
        async subscribe(
          _model: string,
          options: { input: { prompt: string } },
        ) {
          prompts.push(options.input.prompt);
          return {
            data: {
              images: [
                { url: `https://fal.example/painting-${prompts.length}.jpg` },
              ],
            },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toMatch(/living-room/i);
    expect(prompts[1]).toMatch(/coastal-house|exterior/i);
    expect(prompts[2]).toMatch(/painted-house|exterior/i);
    for (const prompt of prompts)
      expect(prompt).not.toMatch(/estimate form|floating estimate/iu);
  });

  it("keeps layout and typography labels out of standalone image prompts", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const prompts: string[] = [];
    await generate({
      site: fixture(),
      inspiration: {
        routes: [
          {
            id: "route-poster-study",
            familyId: "typographic-poster",
            heroGeometry: "typographic-monument",
            typographyCategory: "condensed-display",
            signature: "poster-like headline composition",
            referenceDna: {
              familyId: "3d-portfolio-object-led",
              heroGeometry: { mode: "typographic-monument" },
              imageTreatment: {
                mode: "sculptural-object",
                crop: "wide-studio",
              },
              palette: { contrastIntent: "quiet studio contrast" },
            },
          },
        ],
      },
      outputDir,
      key: "test-fal-key",
      maxImages: 1,
      maxRequests: 1,
      falClient: {
        config() {},
        async subscribe(
          _model: string,
          options: { input: { prompt: string } },
        ) {
          prompts.push(options.input.prompt);
          return {
            data: { images: [{ url: "https://fal.example/standalone.jpg" }] },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/standalone visual image asset/iu);
    expect(prompts[0]).toMatch(
      /never a website or webpage screenshot.*mockup.*poster/iu,
    );
    expect(prompts[0]).toMatch(/no readable text|no text-like marks/iu);
    expect(prompts[0]).not.toContain("typographic-poster");
    expect(prompts[0]).not.toContain("typographic-monument");
    expect(prompts[0]).not.toContain("poster-like headline composition");
  });

  it("binds the first supplied secondary client asset to every route", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const site = fixture();
    site.assets = { photoThree: "/uploads/client-gallery.webp" };
    const routes = [1, 2, 3].map((number) => ({
      id: `route-client-${number}`,
      signature: `client-secondary-${number}`,
    }));
    const result = await generate({
      site,
      inspiration: { routes },
      outputDir,
      key: "",
    });
    for (const route of routes)
      expect(result.site.creativeAssets[route.id].secondary).toBe(
        "/uploads/client-gallery.webp",
      );
  });

  it.each([6, 7])(
    "reserves requests for later routes despite retries with a cap of %i",
    async (maxRequests) => {
      const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
      const routes = [1, 2, 3].map((number) => ({
        id: `route-0${number}`,
        signature: `budget-route-${number}`,
      }));
      let calls = 0;
      const result = await generate({
        site: fixture(),
        inspiration: { routes },
        outputDir,
        key: "test-fal-key",
        maxRequests,
        falClient: {
          config() {},
          async subscribe(
            _model: string,
            options: { input: { prompt: string } },
          ) {
            calls += 1;
            if (!options.input.prompt.includes("Do not create a webpage"))
              throw new Error("Retry this placement.");
            return {
              data: { images: [{ url: "https://fal.example/retry.jpg" }] },
            };
          },
        },
        fetchImpl: async () => fakeImageResponse(),
      });

      expect(calls).toBe(6);
      expect(result.requests).toBe(6);
      expect(result.requests).toBeLessThanOrEqual(maxRequests);
      for (const manifest of result.manifest.routes) {
        expect(
          manifest.placements.map((entry: any) => entry.placement),
        ).toEqual(["hero"]);
        expect(manifest.skipped).toEqual([
          expect.objectContaining({
            placement: "secondary",
            reason: "image-budget-exhausted",
          }),
          expect.objectContaining({
            placement: "tertiary",
            reason: "image-budget-exhausted",
          }),
        ]);
      }
    },
  );

  it.each([2, 1, 0, -1])(
    "preserves the global cap when the budget is smaller than the route count: %i",
    async (maxRequests) => {
      const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
      const routes = [1, 2, 3].map((number) => ({
        id: `route-0${number}`,
        signature: `budget-route-${number}`,
      }));
      const site = fixture();
      site.images = { hero: "/images/packs/workshop-hero.webp" };
      let calls = 0;
      const result = await generate({
        site,
        inspiration: { routes },
        outputDir,
        key: "test-fal-key",
        maxRequests,
        falClient: {
          config() {},
          async subscribe(
            _model: string,
            _options: { input: { prompt: string } },
          ) {
            calls += 1;
            throw new Error("Provider unavailable.");
          },
        },
      });

      expect(calls).toBe(Math.max(0, maxRequests));
      expect(result.requests).toBe(Math.max(0, maxRequests));
      expect(result.manifest.routes).toHaveLength(3);
      expect(result.manifest.placements).toHaveLength(0);
      expect(result.manifest.skipped).toHaveLength(9);
      for (const route of routes)
        expect(result.site.creativeAssets[route.id].hero).toBe(
          site.images.hero,
        );
    },
  );

  it("counts reused route assets against the global three-image cap", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "launchloom-assets-"));
    const manifestPath = join(outputDir, "generated-assets.json");
    const routes = [1, 2, 3].map((number) => ({
      id: `route-0${number}`,
      signature: `mixed-reuse-route-${number}`,
    }));

    let seedRequests = 0;
    await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          seedRequests += 1;
          return {
            data: {
              images: [
                { url: `https://fal.example/mixed-seed-${seedRequests}.jpg` },
              ],
            },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });
    expect(seedRequests).toBe(3);

    const seededManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    seededManifest.routes = [seededManifest.routes[0]];
    seededManifest.placements = [
      ...seededManifest.routes[0].placements.map((entry: any) => ({
        ...entry,
        routeId: routes[0].id,
      })),
    ];
    await writeFile(
      manifestPath,
      `${JSON.stringify(seededManifest, null, 2)}\n`,
    );

    let mixedRequests = 0;
    const mixed = await generate({
      site: fixture(),
      inspiration: { routes },
      outputDir,
      manifestPath,
      key: "test-fal-key",
      falClient: {
        config() {},
        async subscribe() {
          mixedRequests += 1;
          return {
            data: {
              images: [
                { url: `https://fal.example/mixed-new-${mixedRequests}.jpg` },
              ],
            },
          };
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(mixedRequests).toBe(2);
    expect(mixed.manifest.placements).toHaveLength(3);
    expect(
      mixed.manifest.placements.filter((entry: any) => entry.reused),
    ).toHaveLength(1);
    for (const manifest of mixed.manifest.routes)
      expect(manifest.placements).toHaveLength(1);
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
          return {
            data: {
              images: [{ url: `https://fal.example/reuse-${requests}.jpg` }],
            },
          };
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
          throw new Error(
            "Route assets should be reused from the aggregate manifest.",
          );
        },
      },
      fetchImpl: async () => fakeImageResponse(),
    });

    expect(reuseRequests).toBe(0);
    expect(reused.requests).toBe(0);
    expect(reused.manifest.placements).toHaveLength(3);
    expect(reused.manifest.placements.every((entry: any) => entry.reused)).toBe(
      true,
    );
  });
});

describe("generated asset review integrity policy", () => {
  const checks = (overrides: Record<string, any> = {}) => ({
    isStandaloneImage: true,
    containsWebsiteOrInterface: false,
    containsVisibleTextOrTextLikeMarks: false,
    containsLogoOrWatermark: false,
    containsPeople: false,
    isRelevantToBusiness: true,
    ...overrides,
  });
  const completedResponse = (text: string) =>
    new Response(
      JSON.stringify({
        id: "resp_policy",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("re-reviews once when the review output is malformed", async () => {
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 10, g: 60, b: 40 } },
    })
      .webp()
      .toBuffer();
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return completedResponse(
        JSON.stringify(calls === 1 ? { isStandaloneImage: true } : checks()),
      );
    });
    try {
      const review = await reviewGeneratedAsset({
        imageData: image,
        placement: "hero",
        businessKind: "bicycle workshop",
      });
      expect(review.available).toBe(true);
      expect(review.approved).toBe(true);
      expect(calls).toBe(2);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  }, 20000);

  it("rejects generated imagery that contains people", async () => {
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .webp()
      .toBuffer();
    vi.stubGlobal("fetch", async () =>
      completedResponse(JSON.stringify(checks({ containsPeople: true }))),
    );
    try {
      const review = await reviewGeneratedAsset({
        imageData: image,
        placement: "hero",
        businessKind: "bicycle workshop",
      });
      expect(review.available).toBe(true);
      expect(review.approved).toBe(false);
      expect(review.reasonCodes).toContain("people_or_faces");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  }, 20000);
});

describe("generated asset review on OpenCode Go", () => {
  it("reviews the bitmap through the Go transport with the GLM wire model", async () => {
    vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "opencode-go");
    vi.stubEnv("OPENCODE_GO_API_KEY", "test-go-key");
    const image = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 40, g: 90, b: 70 },
      },
    })
      .webp()
      .toBuffer();
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({
          id: "resp_review_go",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    isStandaloneImage: true,
                    containsWebsiteOrInterface: false,
                    containsVisibleTextOrTextLikeMarks: false,
                    containsLogoOrWatermark: false,
                    containsPeople: false,
                    isRelevantToBusiness: true,
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 900, output_tokens: 40 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    try {
      const review = await reviewGeneratedAsset({
        imageData: image,
        placement: "hero",
        businessKind: "bicycle workshop",
        services: ["tune-ups"],
        familyId: "utility-diagnostic",
      });
      expect(review.available).toBe(true);
      expect(review.approved).toBe(true);
      expect(review.reasonCodes).toEqual([]);
      expect(review.model).toBe("z-ai/glm-5.3-flash");
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain("opencode.ai/inference/go");
      expect(requests[0].body.model).toBe("glm-5.3-flash");
      expect(requests[0].body.text?.format?.type).toBe("json_schema");
      const imagePart = (requests[0].body.input || [])
        .flatMap((item: any) => item.content || [])
        .find((part: any) => part.type === "input_image");
      expect(imagePart?.image_url).toMatch(/^data:image\/webp;base64,/u);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  }, 20000);
});
