import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  HUMAN_REVISION_IMAGE_MAX_BYTES,
  runHumanRevisionGate,
} from "../scripts/human-revision-gate.mjs";

const roots: string[] = [];

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-human-revision-gate-"),
  );
  roots.push(root);
  const screenshotsDir = path.join(root, "screenshots");
  await fs.mkdir(screenshotsDir, { recursive: true });
  for (const [viewport, width, height] of [
    ["desktop", 1440, 1000],
    ["compact", 1366, 768],
    ["mobile", 390, 844],
  ] as const)
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 240, g: 242, b: 244 },
      },
    })
      .png()
      .toFile(path.join(screenshotsDir, `${viewport}.png`));
  const configPath = path.join(root, "site.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      preset: "general",
      industry: "professional-services",
      businessKind: "local-service",
      business: {
        name: "Canary Studio",
        tagline: "Designed around real work",
        description: "A local creative studio.",
        primaryCta: "Start a project",
        serviceAreas: ["Accra"],
      },
      services: [],
      differentiators: [],
      copy: {},
      design: {
        experience: {
          renderer: "creative-candidate",
          candidateId: "candidate-a",
          familyId: "editorial-monument",
          visualScore: 91,
          distinctivenessScore: 88,
        },
      },
      conversion: { process: [], faqs: [] },
      revisionReport: {
        stage: "developer",
        operations: [],
        results: [
          {
            feedbackIndex: 0,
            status: "creative",
            deferred: ["layout"],
          },
        ],
      },
    }),
  );
  return { root, screenshotsDir, configPath };
}

describe("human revision rendered gate", () => {
  it("sends the exact triggering feedback and all rendered viewports to the judge", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "The requested asymmetry is visible.",
                verdict: "pass",
                findings: [],
              }),
            },
          },
        ],
        usage: { total_tokens: 123 },
        provider: "test",
      }),
    );

    const report = await runHumanRevisionGate({
      configPath,
      screenshotsDir,
      feedback:
        "Make the hero more cinematic and asymmetrical without changing the copy.",
      reportPath: path.join(screenshotsDir, "human-gate.json"),
      fetchImpl: fetchImpl as any,
    });

    expect(report.audit.verdict).toBe("pass");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const user = body.messages[1].content;
    const prompt = user.find((part: any) => part.type === "text").text;
    expect(prompt).toContain(
      "Make the hero more cinematic and asymmetrical without changing the copy.",
    );
    expect(prompt).toContain('"status":"creative"');
    expect(user.filter((part: any) => part.type === "image_url")).toHaveLength(
      3,
    );
  });

  it("normalizes oversized screenshots before sending them to OpenRouter", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const width = 1800;
    const height = 1200;
    const noisyPixels = randomBytes(width * height * 3);
    const desktopPath = path.join(screenshotsDir, "desktop.png");
    await sharp(noisyPixels, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toFile(desktopPath);
    expect((await fs.stat(desktopPath)).size).toBeGreaterThan(
      HUMAN_REVISION_IMAGE_MAX_BYTES,
    );

    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "The request is satisfied.",
                verdict: "pass",
                findings: [],
              }),
            },
          },
        ],
      }),
    );

    await runHumanRevisionGate({
      configPath,
      screenshotsDir,
      feedback: "Keep the visual change as requested.",
      fetchImpl: fetchImpl as any,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const images = body.messages[1].content.filter(
      (part: any) => part.type === "image_url",
    );
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image.image_url.url).toMatch(/^data:image\/webp;base64,/u);
      const encoded = image.image_url.url.split(",", 2)[1];
      expect(Buffer.from(encoded, "base64").byteLength).toBeLessThanOrEqual(
        HUMAN_REVISION_IMAGE_MAX_BYTES,
      );
    }
  });

  it("rejects a pass verdict that still contains a major request mismatch", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "Not actually complete.",
                verdict: "pass",
                findings: [
                  {
                    category: "requirement-mismatch",
                    severity: "major",
                    viewport: "desktop",
                    evidence: "The CTA is still above the gallery.",
                    recommendation: "Move it below the gallery.",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );

    await expect(
      runHumanRevisionGate({
        configPath,
        screenshotsDir,
        feedback: "Move the CTA below the gallery.",
        fetchImpl: fetchImpl as any,
      }),
    ).rejects.toThrow(/cannot pass with critical or major findings/iu);
  });
});
