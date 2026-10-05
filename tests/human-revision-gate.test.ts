import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  HUMAN_REVISION_IMAGE_MAX_BYTES,
  HUMAN_REVISION_TOTAL_IMAGE_MAX_BYTES,
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
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture({
  feedback = "Make the hero more cinematic and asymmetrical.",
}: { feedback?: string } = {}) {
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
            feedback,
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
    const feedback =
      "Make the hero more cinematic and asymmetrical without changing the copy.";
    const { screenshotsDir, configPath } = await fixture({ feedback });
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "The requested asymmetry is visible.",
                verdict: "pass",
                feedbackResults: [
                  {
                    feedbackIndex: 0,
                    verdict: "pass",
                    evidence:
                      "The desktop and mobile screenshots show the requested asymmetrical hero composition.",
                    findings: [],
                  },
                ],
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
      feedback,
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
    expect(prompt).toContain('"feedbackIndex":0');
    expect(report.audit.feedbackResults).toEqual([
      expect.objectContaining({
        feedbackIndex: 0,
        verdict: "pass",
        candidateId: "candidate-a",
      }),
    ]);
    expect(report.audit.findings).toEqual([]);
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
                feedbackResults: [
                  {
                    feedbackIndex: 0,
                    verdict: "pass",
                    evidence: "The requested visual change is present.",
                    findings: [],
                  },
                ],
              }),
            },
          },
        ],
      }),
    );

    await runHumanRevisionGate({
      configPath,
      screenshotsDir,
      feedback: "Make the hero more cinematic and asymmetrical.",
      fetchImpl: fetchImpl as any,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const images = body.messages[1].content.filter(
      (part: any) => part.type === "image_url",
    );
    expect(images).toHaveLength(3);
    let totalBytes = 0;
    for (const image of images) {
      expect(image.image_url.url).toMatch(/^data:image\/webp;base64,/u);
      const encoded = image.image_url.url.split(",", 2)[1];
      const normalized = Buffer.from(encoded, "base64");
      totalBytes += normalized.byteLength;
      expect(normalized.byteLength).toBeLessThanOrEqual(
        HUMAN_REVISION_IMAGE_MAX_BYTES,
      );
      const metadata = await sharp(normalized).metadata();
      expect(metadata.width || 0).toBeLessThanOrEqual(1280);
      expect(metadata.height || 0).toBeLessThanOrEqual(1280);
    }
    expect(totalBytes).toBeLessThanOrEqual(
      HUMAN_REVISION_TOTAL_IMAGE_MAX_BYTES,
    );
  });

  it("rejects a pass verdict that still contains a major request mismatch", async () => {
    const { screenshotsDir, configPath } = await fixture({
      feedback: "Move the CTA below the gallery.",
    });
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "Not actually complete.",
                verdict: "pass",
                feedbackResults: [
                  {
                    feedbackIndex: 0,
                    verdict: "pass",
                    evidence: "The CTA position was reviewed.",
                    findings: [
                      {
                        category: "requirement-mismatch",
                        severity: "major",
                        viewport: "desktop",
                        evidence: "The CTA is still above the gallery.",
                        recommendation: "Move it below the gallery.",
                      },
                    ],
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
    ).rejects.toThrow(
      /cannot pass feedback index 0 with critical or major findings/iu,
    );
  });

  it("requires distinct evidence for every creative feedback index in a batch", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.revisionReport.results = [
      {
        feedbackIndex: 2,
        feedback: "Make the hero more cinematic and asymmetrical.",
        status: "creative",
        deferred: ["layout"],
      },
      {
        feedbackIndex: 5,
        feedback: "Move the gallery before the service list.",
        status: "creative",
        deferred: ["layout"],
      },
    ];
    config.revisionReport.creativeRepairScope = {
      feedbackItems: [
        {
          feedbackIndex: 2,
          feedback: "Make the hero more cinematic and asymmetrical.",
        },
        {
          feedbackIndex: 5,
          feedback: "Move the gallery before the service list.",
        },
      ],
    };
    await fs.writeFile(configPath, JSON.stringify(config));
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "Both requested changes are visible.",
                verdict: "pass",
                feedbackResults: [
                  {
                    feedbackIndex: 2,
                    verdict: "pass",
                    evidence:
                      "Desktop and mobile screenshots show the hero with the requested cinematic asymmetric composition.",
                    findings: [],
                  },
                  {
                    feedbackIndex: 5,
                    verdict: "pass",
                    evidence:
                      "The screenshots show the gallery section before the service list on desktop and mobile.",
                    findings: [],
                  },
                ],
              }),
            },
          },
        ],
        usage: { total_tokens: 88 },
      }),
    );

    const report = await runHumanRevisionGate({
      configPath,
      screenshotsDir,
      feedback:
        "Make the hero more cinematic and asymmetrical.\n\nMove the gallery before the service list.",
      fetchImpl: fetchImpl as any,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const prompt = body.messages[1].content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(prompt).toContain('"feedbackIndex":2');
    expect(prompt).toContain('"feedbackIndex":5');
    expect(
      report.audit.feedbackResults.map((item: any) => item.feedbackIndex),
    ).toEqual([2, 5]);
    expect(
      report.audit.feedbackResults.every(
        (item: any) => item.evidence.length > 0,
      ),
    ).toBe(true);
  });

  it("rejects an aggregate pass that omits per-item verification", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "Everything looks good.",
                verdict: "pass",
                findings: [],
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
        feedback: "Make the hero more cinematic and asymmetrical.",
        fetchImpl: fetchImpl as any,
      }),
    ).rejects.toThrow(/feedbackResults|feedback index/iu);
  });

  it("keeps a failed item attached to its own feedback index", async () => {
    const { screenshotsDir, configPath } = await fixture();
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.revisionReport.results = [
      {
        feedbackIndex: 1,
        feedback: "Make the hero more cinematic.",
        status: "creative",
      },
      {
        feedbackIndex: 4,
        feedback: "Move the gallery before the services.",
        status: "creative",
      },
    ];
    await fs.writeFile(configPath, JSON.stringify(config));
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary: "One requested change remains incomplete.",
                verdict: "revise",
                feedbackResults: [
                  {
                    feedbackIndex: 1,
                    verdict: "pass",
                    evidence: "The hero composition is visibly more cinematic.",
                    findings: [],
                  },
                  {
                    feedbackIndex: 4,
                    verdict: "revise",
                    evidence:
                      "The gallery still appears after the services section.",
                    findings: [
                      {
                        category: "requirement-mismatch",
                        severity: "major",
                        viewport: "desktop",
                        evidence:
                          "The desktop screenshot shows services before the gallery.",
                        recommendation:
                          "Place the gallery before the services section.",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    );

    const report = await runHumanRevisionGate({
      configPath,
      screenshotsDir,
      feedback:
        "Make the hero more cinematic.\n\nMove the gallery before the services.",
      fetchImpl: fetchImpl as any,
    });

    expect(report.audit.verdict).toBe("revise");
    expect(
      report.audit.feedbackResults.map((item: any) => item.feedbackIndex),
    ).toEqual([1, 4]);
    expect(report.audit.findings).toEqual([
      expect.objectContaining({
        feedbackIndex: 4,
        evidence: "The desktop screenshot shows services before the gallery.",
      }),
    ]);
  });
});
