import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runHumanRevisionGate } from "../scripts/human-revision-gate.mjs";

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
  for (const viewport of ["desktop", "compact", "mobile"])
    await fs.writeFile(
      path.join(screenshotsDir, `${viewport}.png`),
      `${viewport}-pixels`,
    );
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
