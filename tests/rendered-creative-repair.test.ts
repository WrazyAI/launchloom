import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectAvailableScreenshots,
  colorLiterals,
  defaultRepairCandidate,
  normalizeRepair,
  findingsRequirePaletteChange,
  runRenderedCreativeRepair,
  runVisualGateProcess,
  writeCandidate,
} from "../scripts/run-rendered-creative-repair.mjs";
import { requestRepair } from "../scripts/creative-repair-loop.mjs";
import { validateProductionCandidateFiles } from "../scripts/production-experience-author.mjs";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";

const roots: string[] = [];
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

afterEach(async () => {
  if (originalOpenRouterKey === undefined)
    delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  vi.unstubAllGlobals();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(candidateIds = ["candidate-a", "candidate-b"]) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-rendered-repair-"),
  );
  roots.push(root);
  const candidates = path.join(root, "candidates");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ design: { experience: {} } }),
  );
  for (const candidateId of candidateIds) {
    const directory = path.join(candidates, candidateId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "metadata.json"),
      JSON.stringify({ candidateId, referenceDna: { familyId: candidateId } }),
    );
    await fs.writeFile(
      path.join(directory, "Experience.jsx"),
      "export default () => null;\n",
    );
    await fs.writeFile(path.join(directory, "styles.css"), "body{}\n");
    await fs.writeFile(
      path.join(directory, "motion.js"),
      "export function mountExperienceMotion(){ return () => {}; }\n",
    );
  }
  return { root, candidates };
}

async function bindCandidateSession(
  candidatesDir: string,
  creativeSession: Record<string, any>,
) {
  for (const entry of await fs.readdir(candidatesDir, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const metadataPath = path.join(candidatesDir, entry.name, "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.reasoning = {
      effort: creativeSession.reasoningEffort,
      recommendedEffort: creativeSession.recommendedEffort,
      mode: creativeSession.mode,
      sessionId: creativeSession.sessionId,
      policyVersion: creativeSession.reasoningPolicyVersion,
      selectorModelVersion: creativeSession.selectorModelVersion,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
  }
}

function candidate(
  candidateId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    candidateId,
    directory: candidateId,
    valid: true,
    eligible: true,
    visualScore: 92,
    distinctivenessScore: 91,
    referenceFidelity: { pass: true, score: 92 },
    renderedReferenceFidelity: {
      pass: true,
      audit: { findings: [] },
    },
    failures: [],
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    selectedCandidateId: "candidate-a",
    fallback: false,
    promotionReady: true,
    visualDiversity: { pass: true, pairs: [] },
    candidates: [candidate("candidate-a"), candidate("candidate-b")],
    ...overrides,
  };
}

async function writeBakeoffEvidence(options: any, value: any) {
  await fs.mkdir(options.screenshotsDir, { recursive: true });
  for (const item of value.candidates || []) {
    for (const viewport of ["desktop", "compact", "mobile"])
      await fs.writeFile(
        path.join(
          options.screenshotsDir,
          `${item.candidateId}-${viewport}.png`,
        ),
        "pixels",
      );
  }
  await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
  await fs.writeFile(options.reportPath, JSON.stringify(value));
  return value;
}

async function visualGate(options: any, verdict: "pass" | "revise") {
  const value = {
    version: 1,
    mode: "verify",
    blockers:
      verdict === "pass" ? [] : [{ severity: "major", category: "hierarchy" }],
    audit: {
      verdict,
      findings:
        verdict === "pass"
          ? []
          : [
              {
                severity: "major",
                category: "hierarchy",
                viewport: "desktop",
                evidence: "Hero geometry drifted from the assigned reference.",
                recommendation: "Restore the image/type relationship.",
              },
            ],
    },
  };
  await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
  await fs.writeFile(options.reportPath, JSON.stringify(value));
  return value;
}

describe("rendered creative repair orchestration", () => {

  it("passes a large inner-page repair through the real model adapter and rendered repair normalizer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-large-repair-contract-"));
    roots.push(root);
    const desktop = path.join(root, "desktop.png");
    await fs.writeFile(desktop, "desktop-evidence");
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const files = {
      experience: '<main><section data-reference-section="hero">Hero</section></main>',
      styles: `.service-title { font-size: 4rem; }\n/*${"x".repeat(21_000)}*/`,
      motion: "export function mountExperienceMotion() { return () => {}; }",
      servicePage: '<main data-service-page><h1 className="service-title">Service</h1></main>',
    };
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        edits: [{ file: "styles", find: "font-size: 4rem;", replace: "font-size: 3rem;" }],
      }) } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await requestRepair({
      model: "test/model",
      referenceDna: {
        familyId: "test-editorial",
        sectionSequence: ["hero", "services", "faqs", "contact"],
        evidence: { desktopScreenshot: { path: desktop } },
      },
      findings: ["service-page typography: reduce the oversized service heading"],
      files,
      screenshots: [],
      logger: () => {},
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.response_format.json_schema.name).toBe("launchloom_creative_repair_edits");
    const repaired = normalizeRepair(response, files);
    expect(repaired.styles).toBe(files.styles.replace("font-size: 4rem;", "font-size: 3rem;"));
    for (const key of ["experience", "motion", "servicePage"] as const)
      expect(repaired[key]).toBe(files[key]);
  });

  it("keeps authored inner pages when a repair response omits or empties them", () => {
    const current = {
      experience: "experience",
      styles: "styles",
      motion: "motion",
      servicePage: '<main data-service-page><h1>Service</h1></main>',
      locationPage: '<main data-location-page><h1>Location</h1></main>',
    };
    const repaired = normalizeRepair(
      {
        experience: "experience-fixed",
        styles: "styles-fixed",
        motion: "motion-fixed",
        servicePage: '<main data-service-page><h1>Service fixed</h1></main>',
        locationPage: "",
      },
      current,
    );
    expect(repaired.servicePage).toContain("Service fixed");
    expect(repaired.locationPage).toBe(current.locationPage);

    const unchanged = normalizeRepair(
      { experience: "a", styles: "b", motion: "c" },
      current,
    );
    expect(unchanged.servicePage).toBe(current.servicePage);
    expect(unchanged.locationPage).toBe(current.locationPage);
    expect(unchanged).not.toHaveProperty("servicesIndexPage");
  });
  it("rejects full-file human repair output before changing candidate files", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-repair-full-file-rejection-"),
    );
    roots.push(root);
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const desktop = path.join(root, "reference.png");
    await fs.writeFile(desktop, "reference-evidence");
    const candidateDir = path.join(root, "candidate-a");
    await fs.mkdir(candidateDir);
    const originalFiles = {
      experience: `export default function Experience({ content }) { return <main><section data-reference-section="hero"><h1>{content.hero.heading}</h1></section><section id="services" data-reference-section="services">Services</section><section id="faqs" data-reference-section="faqs">FAQs</section><section id="contact" data-reference-section="contact">Contact</section></main>; }`,
      styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    await fs.writeFile(
      path.join(candidateDir, "metadata.json"),
      JSON.stringify({
        candidateId: "candidate-a",
        referenceDna: {
          familyId: "test-editorial",
          sectionSequence: ["hero", "services", "faqs", "contact"],
          evidence: { desktopScreenshot: { path: desktop } },
        },
        creativeRepairScope: {
          version: 1,
          sectionIds: ["hero"],
          allowMotion: false,
          requestText: "Improve the hero layout.",
        },
      }),
    );
    await fs.writeFile(
      path.join(candidateDir, "content-manifest.json"),
      JSON.stringify({ values: {}, tokens: [] }),
    );
    for (const [name, value] of Object.entries({
      "Experience.jsx": originalFiles.experience,
      "styles.css": originalFiles.styles,
      "motion.js": originalFiles.motion,
    }))
      await fs.writeFile(path.join(candidateDir, name), value);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      experience: "whole replacement",
                      styles: "whole replacement",
                      motion: "whole replacement",
                    }),
                  },
                },
              ],
            }),
          ),
      ),
    );

    await expect(
      defaultRepairCandidate({
        candidateDir,
        findings: [
          {
            category: "human-review-feedback",
            message: "Improve the hero layout.",
          },
        ],
        screenshots: [],
        model: "test/model",
      }),
    ).rejects.toThrow(
      /must return bounded literal edits, not complete files/iu,
    );

    for (const [name, value] of Object.entries({
      "Experience.jsx": originalFiles.experience,
      "styles.css": originalFiles.styles,
      "motion.js": originalFiles.motion,
    }))
      expect(await fs.readFile(path.join(candidateDir, name), "utf8")).toBe(
        value,
      );
  });

  it("scopes palette changes to findings that ask for them", () => {
    expect(
      findingsRequirePaletteChange([
        { category: "imagery", message: "The later image is generic." },
      ]),
    ).toBe(false);
    expect(
      findingsRequirePaletteChange([
        "rendered-reference dimension paletteAdherence scored 32 and must reach 80.",
      ]),
    ).toBe(true);
    expect(
      findingsRequirePaletteChange([
        "Rendered-reference measurements already at their thresholds must not regress during this repair: paletteAdherence 91, imagery 88.",
      ]),
    ).toBe(false);
    expect(
      colorLiterals("a { color: #FFF; background: rgb(1, 2, 3); }"),
    ).toEqual(["#fff", "rgb(1,2,3)"]);
  });

  it("rejects an automated repair that repaints a passing palette", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-palette-guard-"),
    );
    roots.push(root);
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const desktop = path.join(root, "reference.png");
    await fs.writeFile(desktop, "reference-evidence");
    const candidateDir = path.join(root, "candidate-a");
    await fs.mkdir(candidateDir);
    const originalFiles = {
      experience: `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) { return <main><section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section><section id="services" data-reference-section="services">Services</section><section id="faqs" data-reference-section="faqs">FAQs</section><section id="contact" data-reference-section="contact"><LeadForm content={content} runtime={runtime} /></section></main>; }`,
      styles:
        ':root { --ll-creative-paper: #f8f6f0; } [data-reference-section="hero"] h1 { color: #14201d; }',
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    await fs.writeFile(
      path.join(candidateDir, "metadata.json"),
      JSON.stringify({
        candidateId: "candidate-a",
        referenceDna: {
          familyId: "test-editorial",
          sectionSequence: ["hero", "services", "faqs", "contact"],
          evidence: { desktopScreenshot: { path: desktop } },
        },
      }),
    );
    await fs.writeFile(
      path.join(candidateDir, "content-manifest.json"),
      JSON.stringify({ values: {}, tokens: [] }),
    );
    for (const [name, value] of Object.entries({
      "Experience.jsx": originalFiles.experience,
      "styles.css": originalFiles.styles,
      "motion.js": originalFiles.motion,
    }))
      await fs.writeFile(path.join(candidateDir, name), value);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      experience: originalFiles.experience,
                      styles:
                        ':root { --ll-creative-paper: #101010; } [data-reference-section="hero"] h1 { color: #000000; }',
                      motion: originalFiles.motion,
                    }),
                  },
                },
              ],
            }),
          ),
      ),
    );

    await expect(
      defaultRepairCandidate({
        candidateDir,
        findings: [
          {
            category: "imagery",
            message:
              "A generic stock image appears on an image-independent reference.",
          },
        ],
        screenshots: [],
        model: "test/model",
      }),
    ).rejects.toThrow(/palette/iu);

    expect(await fs.readFile(path.join(candidateDir, "styles.css"), "utf8")).toBe(
      originalFiles.styles,
    );
  });

  it("retries a rejected repair output once within the candidate's cycle budget", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const repairFindings: any[][] = [];
    const excludedCandidates: string[][] = [];
    let bakeoffCalls = 0;
    const rejection = new Error(
      "Creative repair output rejected by source validation: the early conversion anchor was removed.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        excludedCandidates.push(options.excludedCandidateIds || []);
        if (options.excludedCandidateIds?.includes("candidate-a"))
          throw new Error(
            "No creative candidates remain after exclusions: candidate-a.",
          );
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    failures: ["Rendered candidate needs repair."],
                  }),
                ],
              })
            : report({
                selectedCandidateId: "candidate-a",
                candidates: [candidate("candidate-a")],
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ findings }: any) => {
        repairFindings.push(findings);
        if (repairFindings.length === 1) throw rejection;
      },
      promoteImpl: async ({ candidateDir }: any) => ({
        candidateId: path.basename(candidateDir),
      }),
    });

    expect(result.status).toBe("passed");
    expect(repairFindings).toHaveLength(2);
    expect(repairFindings[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "repair-output-rejected",
          evidence: expect.stringContaining(
            "early conversion anchor was removed",
          ),
        }),
      ]),
    );
    expect(excludedCandidates).toEqual([[], []]);
  });

  it("keeps unspent applied-repair cycles after a contract rejection", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    let repairCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls <= 2
            ? report({
                selectedCandidateId: null,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    failures: ["Rendered candidate needs repair."],
                  }),
                ],
              })
            : report({
                selectedCandidateId: "candidate-a",
                candidates: [candidate("candidate-a")],
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async () => {
        repairCalls += 1;
        if (repairCalls === 1) {
          const error = new Error(
            "Creative repair edit 7 source fragment must match exactly once in experience.",
          );
          Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
          throw error;
        }
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairCalls).toBe(3);
    expect(result.rejectedCandidates).toEqual({});
  });

  it("repairs a selected candidate after the reference budget is spent", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    let gateCalls = 0;
    const repairs: any[][] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    failures: ["Rendered candidate needs repair."],
                  }),
                ],
              })
            : report({
                selectedCandidateId: "candidate-a",
                candidates: [candidate("candidate-a")],
              }),
        );
      },
      runVisualGateImpl: async (options: any) => {
        gateCalls += 1;
        return visualGate(options, gateCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ findings }: any) => {
        repairs.push(findings);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(3);
    expect(gateCalls).toBe(2);
    expect(repairs).toHaveLength(2);
    expect(
      repairs[1].some((finding: any) => finding?.category === "hierarchy"),
    ).toBe(true);
  });

  it("returns a blocking visual-gate report instead of failing the run", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-gate-report-"),
    );
    roots.push(root);
    const script = path.join(root, "gate.mjs");
    await fs.writeFile(
      script,
      `import fs from "node:fs";
const reportPath = process.argv[process.argv.indexOf("--report") + 1];
fs.writeFileSync(reportPath, JSON.stringify({
  status: "ok",
  audit: {
    verdict: "revise",
    findings: [
      {
        severity: "major",
        category: "content-integrity",
        evidence: "The process section appears twice.",
        recommendation: "Remove the duplicate process section.",
      },
    ],
  },
  blockers: 1,
}));
console.error("gate blocked");
process.exit(1);
`,
    );

    const report = await runVisualGateProcess({
      siteDir: root,
      screenshotsDir: path.join(root, "screenshots"),
      reportPath: path.join(root, "visual-gate.json"),
      visualGateScript: script,
    });

    expect(report.processExitCode).toBe(1);
    expect(report.audit.verdict).toBe("revise");
    expect(report.audit.findings[0].category).toBe("content-integrity");
  });

  it("repairs a regressed candidate from its best measured state", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const experiencePath = path.join(candidateDir, "Experience.jsx");
    const originalSource = await fs.readFile(experiencePath, "utf8");
    let bakeoffCalls = 0;
    const seenAtRepair: string[] = [];
    const repairFindings: string[] = [];

    const failing = (score: number) =>
      report({
        selectedCandidateId: null,
        candidates: [
          candidate("candidate-a", {
            valid: false,
            eligible: false,
            failures: ["Rendered candidate needs repair."],
            referenceFidelity: { pass: false, score },
            renderedReferenceFidelity: {
              pass: false,
              score,
              audit: {
                verdict: "revise",
                overallScore: score,
                scores: { servicePresentation: score, spatialRhythm: score },
                findings: [],
              },
            },
          }),
        ],
      });

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? failing(78)
            : bakeoffCalls === 2
              ? failing(60)
              : report({
                  selectedCandidateId: "candidate-a",
                  candidates: [candidate("candidate-a")],
                }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ findings }: any) => {
        seenAtRepair.push(await fs.readFile(experiencePath, "utf8"));
        repairFindings.push(findings.join("\n"));
        await fs.writeFile(
          experiencePath,
          `export default () => "repaired-${seenAtRepair.length}";\n`,
        );
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(seenAtRepair).toHaveLength(2);
    expect(seenAtRepair[1]).toBe(originalSource);
    expect(repairFindings[1]).toContain("must not regress");
    expect(repairFindings[1]).toContain("overall 78");
    expect(repairFindings[1]).not.toContain("scored 60");
  });

  it("prefers the snapshot with more passing measurements when scores tie", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const experiencePath = path.join(candidateDir, "Experience.jsx");
    let bakeoffCalls = 0;
    const seenAtBakeoff: string[] = [];

    const state = (
      scores: Record<string, number>,
      overall: number,
    ) =>
      report({
        selectedCandidateId: null,
        candidates: [
          candidate("candidate-a", {
            valid: false,
            eligible: false,
            failures: ["Rendered candidate needs repair."],
            referenceFidelity: { pass: false, score: overall },
            renderedReferenceFidelity: {
              pass: false,
              score: overall,
              audit: {
                verdict: "revise",
                overallScore: overall,
                scores,
                findings: [],
              },
            },
          }),
        ],
      });

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        seenAtBakeoff.push(await fs.readFile(experiencePath, "utf8"));
        const outcome =
          bakeoffCalls === 1
            ? state({ spatialRhythm: 76, servicePresentation: 77, paletteAdherence: 32 }, 76)
            : bakeoffCalls === 2
              ? state(
                  {
                    spatialRhythm: 76,
                    servicePresentation: 77,
                    paletteAdherence: 91,
                    interactionEvidence: 66,
                  },
                  76,
                )
              : bakeoffCalls === 3
                ? state({ spatialRhythm: 60, paletteAdherence: 30 }, 70)
                : report({
                    selectedCandidateId: "candidate-a",
                    candidates: [candidate("candidate-a")],
                  });
        return writeBakeoffEvidence(options, outcome);
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async () => {
        const step = seenAtBakeoff.length;
        await fs.writeFile(
          experiencePath,
          `export default () => "state-${step}";\n`,
        );
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    // The third bakeoff regressed the candidate; the final restore must use
    // the second state (three passing measurements), not the first (one).
    expect(seenAtBakeoff[3]).toBe(`export default () => "state-1";\n`);
  });

  it("targets repairs with the rendered fidelity dimensions that miss their thresholds", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const repairFindings: any[][] = [];
    let bakeoffCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 2,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    failures: ["Rendered candidate needs repair."],
                    renderedReferenceFidelity: {
                      pass: false,
                      audit: {
                        verdict: "revise",
                        overallScore: 74,
                        scores: {
                          heroGeometry: 87,
                          typography: 82,
                          spatialRhythm: 75,
                          imagery: 88,
                          servicePresentation: 72,
                          navigation: 78,
                          ctaPlacement: 91,
                          mobileRecomposition: 83,
                          interactionEvidence: 65,
                          paletteAdherence: 56,
                          artDirection: 84,
                        },
                        findings: [],
                      },
                    },
                  }),
                ],
              })
            : report({
                selectedCandidateId: "candidate-a",
                candidates: [candidate("candidate-a")],
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ findings }: any) => {
        repairFindings.push(findings);
      },
      promoteImpl: async ({ candidateDir }: any) => ({
        candidateId: path.basename(candidateDir),
      }),
    });

    const findings = repairFindings[0].join("\n");
    expect(findings).toContain(
      "rendered-reference overall fidelity scored 74 and must reach 78",
    );
    expect(findings).toContain(
      "rendered-reference dimension paletteAdherence scored 56 and must reach 80",
    );
    expect(findings).toContain(
      "rendered-reference dimension servicePresentation scored 72 and must reach 75",
    );
    expect(findings).not.toContain("dimension heroGeometry scored");
    expect(findings).toContain(
      "measurements already at their thresholds must not regress",
    );
    expect(findings).toContain("heroGeometry 87");
    expect(result.status).toBe("passed");
  });

  it("keeps preview available when one candidate repair violates its sealed-content contract", async () => {
    const { root, candidates } = await fixture([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    const rejectedCandidateSource = await fs.readFile(
      path.join(candidates, "candidate-c", "Experience.jsx"),
      "utf8",
    );
    const firstPass = ["candidate-a", "candidate-b", "candidate-c"].map(
      (candidateId) =>
        candidate(candidateId, {
          valid: false,
          eligible: false,
          referenceFidelity: { pass: false, score: 30 },
          renderedReferenceFidelity: { pass: false, audit: { findings: [] } },
          failures: ["Rendered candidate needs repair."],
        }),
    );
    const bakeoffExclusions: string[][] = [];
    const repairCalls: string[] = [];
    const promotions: string[] = [];
    let bakeoffCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        bakeoffExclusions.push(options.excludedCandidateIds || []);
        return writeBakeoffEvidence(
          options,
          bakeoffCalls <= 3
            ? report({ selectedCandidateId: null, candidates: firstPass })
            : report({
                selectedCandidateId: "candidate-b",
                candidates: [
                  candidate("candidate-a"),
                  candidate("candidate-b"),
                ],
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairCalls.push(candidateId);
        if (candidateId === "candidate-c") {
          const error = new Error(
            "Reference-safe source validation failed: Required sealed token content.hero.image does not flow into output.",
          );
          Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
          throw error;
        }
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-b" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-b");
    expect(bakeoffCalls).toBe(4);
    expect(repairCalls).toEqual(["candidate-a", "candidate-b", "candidate-c"]);
    expect(bakeoffExclusions[3]).toEqual(["candidate-c"]);
    expect(promotions).toEqual(["candidate-b"]);
    expect(result.rejectedCandidates["candidate-c"]).toMatch(
      /content\.hero\.image/iu,
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            root,
            "evidence",
            "round-02",
            "repairs",
            "candidate-c.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({ status: "rejected", candidateId: "candidate-c" });
    expect(
      await fs.readFile(
        path.join(candidates, "candidate-c", "Experience.jsx"),
        "utf8",
      ),
    ).toBe(rejectedCandidateSource);
  });

  it("rejects a repaired FAQList with missing sealed content and selects a passing sibling", async () => {
    const { root, candidates } = await fixture(["candidate-a", "candidate-b"]);
    const bakeoffExclusions: string[][] = [];
    const repairCalls: string[] = [];
    const promotions: string[] = [];
    let bakeoffCalls = 0;
    let visualCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        bakeoffExclusions.push(options.excludedCandidateIds || []);
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({ selectedCandidateId: "candidate-a" })
            : report({
                selectedCandidateId: "candidate-b",
                candidates: [candidate("candidate-b")],
              }),
        );
      },
      runVisualGateImpl: (options: any) => {
        visualCalls += 1;
        return visualGate(options, visualCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairCalls.push(candidateId);
        const malformedRepair = {
          experience: `import { FAQList, LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main>
    <nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <section data-hero><h1>{content.hero.heading}</h1><a data-early-conversion href="#contact">{content.hero.primaryLabel}</a></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name} {service.description}</p>)}</section>
    <section id="faqs"><p>{content.faqs.length}</p><FAQList /></section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`,
          styles: "[data-hero] { color: inherit; }",
          motion:
            "export function mountExperienceMotion() { return () => {}; }",
        };
        let validationError: Error | undefined;
        try {
          validateProductionCandidateFiles({
            files: malformedRepair,
            route: { id: candidateId },
          });
        } catch (error) {
          validationError = error as Error;
        }
        expect(validationError?.message).toMatch(
          /FAQList.*must receive sealed content.*content=\{content\}/iu,
        );
        const error = new Error(
          `Creative repair output rejected by source validation: ${validationError?.message}`,
        );
        Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
        throw error;
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-b" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-b");
    expect(bakeoffCalls).toBe(2);
    expect(visualCalls).toBe(2);
    expect(repairCalls).toEqual(["candidate-a"]);
    expect(bakeoffExclusions[1]).toEqual(["candidate-a"]);
    expect(result.rejectedCandidates["candidate-a"]).toMatch(
      /FAQList.*content=\{content\}/iu,
    );
    expect(promotions).toEqual(["candidate-b"]);
  });

  it("preserves candidate rejection reasons when every preview candidate is excluded", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    let repairCalls = 0;
    const rejection = new Error(
      "Creative repair output rejected by source validation: FAQList must receive sealed content through content={content}.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "preview",
        maxCycles: 2,
        runBakeoffImpl: async (options: any) => {
          bakeoffCalls += 1;
          if (bakeoffCalls > 1)
            throw new Error(
              "No creative candidates remain after exclusions: candidate-a.",
            );
          return writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          );
        },
        repairCandidateImpl: async () => {
          repairCalls += 1;
          throw rejection;
        },
      }),
    ).rejects.toThrow(/candidate-a.*FAQList.*content=\{content\}/iu);

    expect(bakeoffCalls).toBe(2);
    expect(repairCalls).toBe(2);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            root,
            "evidence",
            "round-00",
            "repairs",
            "candidate-a.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      status: "rejected",
      error: expect.stringMatching(/FAQList.*content=\{content\}/iu),
    });
  });

  it("bounds preview rounds using the available candidate count", async () => {
    const candidateIds = [
      "candidate-1",
      "candidate-2",
      "candidate-3",
      "candidate-4",
      "candidate-5",
    ];
    const { root, candidates } = await fixture(candidateIds);
    const exclusionsByRound: string[][] = [];
    const promotions: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        const excluded = options.excludedCandidateIds || [];
        exclusionsByRound.push(excluded);
        const available = candidateIds.filter((id) => !excluded.includes(id));
        return writeBakeoffEvidence(
          options,
          report({
            selectedCandidateId: available[0],
            candidates: available.map((id) => candidate(id)),
          }),
        );
      },
      runVisualGateImpl: (options: any) =>
        visualGate(
          options,
          options.candidateId === "candidate-5" ? "pass" : "revise",
        ),
      repairCandidateImpl: async () => {
        const error = new Error(
          "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
        );
        Object.assign(error, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });
        throw error;
      },
      promoteImpl: async ({ candidateDir }: any) => {
        promotions.push(path.basename(candidateDir));
        return { candidateId: "candidate-5" };
      },
    });

    expect(result.status).toBe("passed");
    expect(result.selectedCandidateId).toBe("candidate-5");
    expect(exclusionsByRound).toEqual([
      [],
      ["candidate-1"],
      ["candidate-1", "candidate-2"],
      ["candidate-1", "candidate-2", "candidate-3"],
      ["candidate-1", "candidate-2", "candidate-3", "candidate-4"],
    ]);
    expect(promotions).toEqual(["candidate-5"]);
  });

  it("fails closed on the same validator rejection in promotion mode", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const bakeoffOptions: any[] = [];
    const promotions: string[] = [];
    const rejection = new Error(
      "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "promote",
        maxCycles: 1,
        runBakeoffImpl: async (options: any) => {
          bakeoffOptions.push(options);
          return writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          );
        },
        repairCandidateImpl: async () => {
          throw rejection;
        },
        promoteImpl: async ({ candidateDir }: any) => {
          promotions.push(path.basename(candidateDir));
          return { candidateId: "candidate-a" };
        },
      }),
    ).rejects.toThrow(/content\.hero\.image/iu);

    expect(bakeoffOptions).toHaveLength(1);
    expect(bakeoffOptions[0].excludedCandidateIds).toEqual([]);
    expect(promotions).toEqual([]);
  });

  it("does not isolate a rejected repair when applying human feedback", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const rejection = new Error(
      "Creative repair output rejected by source validation: Required sealed token content.hero.image does not flow into output.",
    );
    Object.assign(rejection, { code: "CREATIVE_REPAIR_OUTPUT_REJECTED" });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        mode: "preview",
        maxCycles: 1,
        requestedFindings: ["Keep the supplied hero image visible."],
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({
              selectedCandidateId: null,
              candidates: [
                candidate("candidate-a", {
                  valid: false,
                  eligible: false,
                  failures: ["Rendered candidate needs repair."],
                }),
              ],
            }),
          ),
        repairCandidateImpl: async () => {
          throw rejection;
        },
      }),
    ).rejects.toThrow(/content\.hero\.image/iu);
  });

  it("restores split-heading hero markers and reviewed image alt text in the full repair flow", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const { root, candidates } = await fixture(["candidate-a"]);
    const registry = JSON.parse(
      readFileSync(
        new URL("../data/inspiration-registry.json", import.meta.url),
        "utf8",
      ),
    );
    const architectureReference = registry.records.find(
      (record: any) => record.id === "lapa-mcalpine-sanctuary",
    );
    if (!architectureReference)
      throw new Error("The canonical architecture dossier is missing.");
    const referenceDna = loadReferenceDossier(
      architectureReference.dossierPath,
    ).referenceDna;
    const content = {
      brand: {
        name: "Test Studio",
        logo: "",
        phone: "(555) 555-0100",
        email: "hello@example.com",
        address: "",
        serviceAreas: [],
      },
      hero: {
        kicker: "A considered service",
        heading: "Thoughtful work, made personal",
        body: "A clear first conversation about what you need.",
        primaryLabel: "Start a conversation",
        image: "/images/hero.webp",
        secondaryImage: "/images/ornament.webp",
        tertiaryImage: "/images/detail.webp",
      },
      services: [
        {
          name: "Consultation",
          description: "A focused first step.",
          slug: "consultation",
        },
      ],
      faqs: [
        {
          question: "What happens first?",
          answer: "We start with a conversation.",
        },
      ],
    };
    const initialExperience = `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  const headlineWords = content.hero.heading.trim().split(/\\s+/);
  return <main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal">
    <nav data-navigation-geometry="quiet-corner-links"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a><a className="nav-cta" href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><h1>{headlineWords.join(" ")}</h1><img src={content.hero.image} alt="Still-life image for the studio" /><a className="hero-cta" href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>
    <section data-reference-section="image-chapter"></section>
    <section data-reference-section="editorial-intro"></section>
    <section data-reference-section="image-mosaic"></section>
    <section id='services' data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive">{content.services}</section>
    <section data-reference-section="closing-scene" data-reference-signature="closing-scene"></section>
    <section id='faqs'>{content.faqs}</section>
    <section id='contact'><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;
    const repairedExperience = initialExperience
      .replace(" data-hero", "")
      .replace(" data-early-conversion", "")
      .replace(
        '<section data-reference-section="image-chapter"></section>',
        '<section data-reference-section="image-chapter"><section className="service-note"><p>A note about the services chapter.</p><img src={ content.hero.image } alt="" /><img src={content.hero.secondaryImage} alt="" /><img src={content.hero.tertiaryImage} alt="" /><img src={content.hero.secondaryImage} alt="" aria-hidden="true" /></section></section>',
      );
    const candidateDir = path.join(candidates, "candidate-a");
    const metadataPath = path.join(candidateDir, "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.routeId = "route-02";
    metadata.referenceDna = referenceDna;
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await fs.writeFile(
      path.join(candidateDir, "content-manifest.json"),
      JSON.stringify({
        tokens: [
          { token: "content.hero.heading" },
          { token: "content.hero.image" },
          { token: "content.hero.secondaryImage" },
          { token: "content.hero.tertiaryImage" },
          { token: "content.services" },
          { token: "content.faqs" },
        ],
        values: content,
      }),
    );
    await fs.writeFile(
      path.join(candidateDir, "Experience.jsx"),
      initialExperience,
    );

    const repairBundle = {
      experience: repairedExperience,
      styles:
        ":root { --ll-creative-ink: #fff; } @media (max-width: 700px) { main { display: block; } }",
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    let repairPrompt = "";
    const fetchMock = vi.fn(
      async (_input: unknown, init?: { body?: unknown }) => {
        repairPrompt = String(init?.body || "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(repairBundle) },
              },
            ],
            usage: { completion_tokens: 32 },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    let visualGateCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      model: "test/model",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        ),
      runVisualGateImpl: async (options: any) => {
        visualGateCalls += 1;
        return visualGate(options, visualGateCalls === 1 ? "revise" : "pass");
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(repairPrompt).toContain("ALT-TEXT CONTRACT");
    const requestBody = JSON.parse(repairPrompt);
    const repairText = requestBody.messages
      .flatMap((message: any) =>
        Array.isArray(message.content) ? message.content : [],
      )
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n");
    expect(repairText).toContain(
      'Use alt="" only when the image is purely decorative or its relevant information is fully conveyed by adjacent text',
    );
    expect(visualGateCalls).toBe(2);
    const repaired = await fs.readFile(
      path.join(candidateDir, "Experience.jsx"),
      "utf8",
    );
    expect(repaired).toMatch(
      /<section id=['"]services['"] data-reference-section=['"]magazine-archive['"]/u,
    );
    expect(repaired).toContain(
      '<a className="nav-cta" href="#contact">{content.hero.primaryLabel}</a>',
    );
    expect(repaired).toContain(
      '<a className="hero-cta" href="#contact" data-early-conversion>{content.hero.primaryLabel}</a>',
    );
    expect(repaired).toMatch(
      /<section(?=[^>]*data-reference-section="hero")(?=[^>]*\bdata-hero(?:\s|>))[^>]*><h1>\{headlineWords\.join\(" "\)\}/u,
    );
    expect(repaired).toContain(
      '<section className="service-note"><p>A note about the services chapter.</p>',
    );
    expect(
      repaired.match(/alt="Still-life image for the studio"/gu),
    ).toHaveLength(2);
    expect(repaired).toContain(
      'src={content.hero.secondaryImage} alt="" aria-hidden="true"',
    );
  });

  it("repairs the selected source only after a rendered visual failure and rerenders before passing", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    let gateCalls = 0;
    const repairs: string[] = [];
    const promotions: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(options, report());
      },
      runVisualGateImpl: async (options: any) => {
        gateCalls += 1;
        return visualGate(options, gateCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async (options: any) => {
        await fs.access(
          path.join(root, "evidence", "final", "creative-bakeoff.json"),
        );
        await fs.access(
          path.join(root, "evidence", "final", "visual-gate.json"),
        );
        await fs.access(path.join(root, "evidence", "summary.json"));
        promotions.push(options);
        return { candidateId: "candidate-a" };
      },
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(gateCalls).toBe(2);
    expect(repairs).toEqual(["candidate-a"]);
    expect(result.repairCycles).toEqual({ "candidate-a": 1 });
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-preview");
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
      ).status,
    ).toBe("passed");
  });

  it("threads one frozen creative session through repairs and summary evidence", async () => {
    const { root, candidates } = await fixture();
    let gateCalls = 0;
    const seenSessions: any[] = [];
    const creativeSession = {
      version: 1,
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      reasoningEffort: "max",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, creativeSession);

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      creativeSession,
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(options, report()),
      runVisualGateImpl: async (options: any) => {
        gateCalls += 1;
        return visualGate(options, gateCalls === 1 ? "revise" : "pass");
      },
      repairCandidateImpl: async ({ creativeSession: seen }: any) => {
        seenSessions.push(seen);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(seenSessions).toEqual([creativeSession]);
    const summary = JSON.parse(
      await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
    );
    expect(summary.creativeSession).toMatchObject({
      sessionId: creativeSession.sessionId,
      reasoningEffort: "max",
      recommendedEffort: "max",
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      selectorModelVersion: "jev-1.13.0",
    });
  });

  it("fails closed when an adaptively authored candidate loses its session artifact", async () => {
    const { root, candidates } = await fixture();
    const creativeSession = {
      version: 1,
      mode: "shadow",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:cccccccccccccccccccccccccccccccccccccccc",
      reasoningEffort: "xhigh",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, creativeSession);

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/authored with adaptive reasoning session/iu);
  });

  it("fails closed on incomplete adaptive reasoning metadata", async () => {
    const { root, candidates } = await fixture();
    const metadataPath = path.join(candidates, "candidate-a", "metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    metadata.reasoning = {
      effort: "xhigh",
      policyVersion: "adaptive-reasoning-v1",
      selectorModelVersion: "jev-1.13.0",
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/incomplete adaptive reasoning metadata/iu);
  });

  it("fails closed when candidate reasoning metadata disagrees with the frozen session", async () => {
    const { root, candidates } = await fixture();
    const creativeSession = {
      version: 1,
      mode: "enforce",
      reasoningPolicyVersion: "adaptive-reasoning-v1",
      judgmentSchemaVersion: "design-complexity-v1",
      selectorModelVersion: "jev-1.13.0",
      creativeModel: "openai/gpt-6-luna",
      sessionId: "launchloom:creative:dddddddddddddddddddddddddddddddddddddddd",
      reasoningEffort: "max",
      recommendedEffort: "max",
    };
    await bindCandidateSession(candidates, {
      ...creativeSession,
      reasoningEffort: "xhigh",
    });

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        creativeSession,
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/reasoning binding does not match/iu);
  });

  it("records a failed promotion instead of claiming the run passed", async () => {
    const { root, candidates } = await fixture();

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(options, report()),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        promoteImpl: async () => {
          throw new Error("promotion filesystem failure");
        },
      }),
    ).rejects.toThrow("promotion filesystem failure");

    const summary = JSON.parse(
      await fs.readFile(path.join(root, "evidence", "summary.json"), "utf8"),
    );
    expect(summary.status).toBe("promotion-failed");
    expect(summary.promotionError).toContain("promotion filesystem failure");
  });

  it("repairs converged preview heroes before selecting a developer preview", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: any[] = [];
    const promotions: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                fallback: true,
                promotionReady: false,
                previewDiversity: {
                  required: true,
                  pass: false,
                  strategy: "converged-blocked",
                  convergenceDetected: true,
                },
                visualDiversity: {
                  pass: false,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 38,
                      pass: false,
                      reason:
                        "Both first viewports use the same image-left split hero.",
                    },
                  ],
                },
              })
            : report({
                previewDiversity: {
                  required: true,
                  pass: true,
                  strategy: "all-distinct",
                  convergenceDetected: false,
                },
              }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async (repair: any) => {
        repairs.push(repair);
      },
      promoteImpl: async (options: any) => {
        promotions.push(options);
        return { candidateId: "candidate-a" };
      },
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(repairs.map((repair) => repair.candidateId)).toEqual([
      "candidate-a",
    ]);
    expect(repairs[0].findings.join("\n")).toContain(
      "Both first viewports use the same image-left split hero.",
    );
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-preview");
    expect(result.previewDiversityPass).toBe(true);
    expect(result.previewDiversityStrategy).toBe("all-distinct");
  });

  it("uses rendered diversity findings to repair both v2 candidates before production promotion", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: string[] = [];
    const promotions: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls <= 2
            ? report({
                promotionReady: false,
                visualDiversity: {
                  pass: false,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 48,
                      pass: false,
                      reason: "Both render as the same centered split hero.",
                    },
                  ],
                },
              })
            : report(),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async (options: any) => {
        promotions.push(options);
        return { candidateId: "candidate-a" };
      },
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(3);
    expect(repairs).toEqual(["candidate-a", "candidate-b"]);
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-bakeoff");
    expect(result.promotionReady).toBe(true);
  });

  it("preserves passing sibling diversity while repairing preview candidates", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: Array<{ candidateId: string; findings: string[] }> = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                promotionReady: false,
                candidates: [
                  candidate("candidate-a", {
                    valid: false,
                    eligible: false,
                    referenceFidelity: { pass: false, score: 52 },
                  }),
                  candidate("candidate-b", {
                    valid: false,
                    eligible: false,
                    referenceFidelity: { pass: false, score: 63 },
                  }),
                ],
                visualDiversity: {
                  pass: true,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 78,
                      pass: true,
                      reason:
                        "A is a dark full-bleed editorial stage; B is a light menu-led service index.",
                    },
                  ],
                },
              })
            : report(),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId, findings }: any) => {
        repairs.push({ candidateId, findings });
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairs.map((repair) => repair.candidateId)).toEqual([
      "candidate-b",
    ]);
    expect(repairs[0].findings.join("\n")).toContain("sibling");
    expect(repairs[0].findings.join("\n")).toMatch(/preserve/iu);
    expect(repairs[0].findings.join("\n")).toContain(
      "full-bleed editorial stage",
    );
  });

  it("passes failed sibling diversity into preview candidate repairs", async () => {
    const { root, candidates } = await fixture([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    let bakeoffCalls = 0;
    const repairs: Array<{
      candidateId: string;
      findings: string[];
      comparisonScreenshots: any[];
      bakeoffRound: number;
    }> = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "preview",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const result = await writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                selectedCandidateId: null,
                promotionReady: false,
                candidates: [
                  candidate("candidate-a", { valid: false, eligible: false }),
                  candidate("candidate-b", { valid: false, eligible: false }),
                  candidate("candidate-c", { valid: false, eligible: false }),
                ],
                visualDiversity: {
                  pass: false,
                  summary: "The candidates collapsed into a split-hero family.",
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 34,
                      pass: false,
                      reason: "Both use the same split-hero grammar.",
                    },
                    {
                      left: "candidate-a",
                      right: "candidate-c",
                      distance: 29,
                      pass: false,
                      reason: "A and C share the closest split-hero structure.",
                    },
                    {
                      left: "candidate-b",
                      right: "candidate-c",
                      distance: 32,
                      pass: false,
                      reason: "B and C also converge on that structure.",
                    },
                  ],
                },
              })
            : bakeoffCalls === 2
              ? report({
                  selectedCandidateId: null,
                  promotionReady: false,
                  candidates: [
                    candidate("candidate-a", {
                      valid: false,
                      eligible: false,
                      referenceFidelity: { pass: false, score: 49 },
                    }),
                    candidate("candidate-b", {
                      valid: false,
                      eligible: false,
                      referenceFidelity: { pass: false, score: 62 },
                    }),
                    candidate("candidate-c", {
                      valid: false,
                      eligible: false,
                      referenceFidelity: { pass: false, score: 70 },
                    }),
                  ],
                  visualDiversity: {
                    pass: false,
                    pairs: [
                      {
                        left: "candidate-a",
                        right: "candidate-b",
                        distance: 34,
                        pass: false,
                        reason: "Both use the same split-hero grammar.",
                      },
                      {
                        left: "candidate-a",
                        right: "candidate-c",
                        distance: 29,
                        pass: false,
                        reason:
                          "A and C share the closest split-hero structure.",
                      },
                      {
                        left: "candidate-b",
                        right: "candidate-c",
                        distance: 32,
                        pass: false,
                        reason: "B and C also converge on that structure.",
                      },
                    ],
                  },
                })
              : report(),
        );
        if (bakeoffCalls <= 2) {
          for (const candidateId of [
            "candidate-a",
            "candidate-b",
            "candidate-c",
          ])
            for (const viewport of ["desktop", "mobile"])
              await fs.writeFile(
                path.join(
                  options.screenshotsDir,
                  `${candidateId}-${viewport}-viewport.png`,
                ),
                `${candidateId}-${viewport}-round-${bakeoffCalls}`,
              );
        }
        return result;
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({
        candidateId,
        findings,
        comparisonScreenshots,
      }: any) => {
        repairs.push({
          candidateId,
          findings,
          comparisonScreenshots,
          bakeoffRound: bakeoffCalls,
        });
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(3);
    expect(repairs.map((repair) => repair.candidateId)).toEqual([
      "candidate-a",
      "candidate-c",
    ]);
    expect(
      repairs.map((repair) =>
        repair.comparisonScreenshots.map((item) => [
          item.candidateId,
          item.viewport,
        ]),
      ),
    ).toEqual([
      [
        ["candidate-c", "desktop"],
        ["candidate-c", "mobile"],
      ],
      [
        ["candidate-a", "desktop"],
        ["candidate-a", "mobile"],
      ],
    ]);
    for (const [index, repair] of repairs.entries()) {
      expect(repair.findings.join("\n")).toContain("Rendered diversity failed");
      expect(repair.findings.join("\n")).toContain("sibling");
      expect(repair.findings.join("\n")).toContain(
        ["split-hero grammar", "split-hero structure"][index],
      );
      for (const item of repair.comparisonScreenshots)
        await expect(fs.access(item.path)).resolves.toBeUndefined();
    }
    expect(repairs[0].bakeoffRound).toBe(1);
    expect(repairs[1].bakeoffRound).toBe(2);
    expect(
      await fs.readFile(repairs[1].comparisonScreenshots[0].path, "utf8"),
    ).toBe("candidate-a-desktop-round-2");
  });

  it("repairs the selected candidate when promotion is blocked without diversity pairs", async () => {
    const { root, candidates } = await fixture();
    let bakeoffCalls = 0;
    const repairs: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
            ? report({
                promotionReady: false,
                visualDiversity: { pass: true, pairs: [] },
              })
            : report(),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push(candidateId);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairs).toEqual(["candidate-a"]);
  });

  it("repairs each diversity candidate once per rendered round even when multiple pairs fail", async () => {
    const { root, candidates } = await fixture([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    let bakeoffCalls = 0;
    const repairs: Array<{ candidateId: string; renderedRound: number }> = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      maxCycles: 1,
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const candidatesReport = [
          candidate("candidate-a"),
          candidate("candidate-b"),
          candidate("candidate-c"),
        ];
        return writeBakeoffEvidence(
          options,
          bakeoffCalls <= 3
            ? report({
                candidates: candidatesReport,
                promotionReady: false,
                visualDiversity: {
                  pass: false,
                  pairs: [
                    {
                      left: "candidate-a",
                      right: "candidate-b",
                      distance: 40,
                      pass: false,
                      reason: "A and B share the same hero grammar.",
                    },
                    {
                      left: "candidate-a",
                      right: "candidate-c",
                      distance: 42,
                      pass: false,
                      reason: "A and C share the same section rhythm.",
                    },
                    {
                      left: "candidate-b",
                      right: "candidate-c",
                      distance: 44,
                      pass: false,
                      reason: "B and C share the same card treatment.",
                    },
                  ],
                },
              })
            : report({ candidates: candidatesReport }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      repairCandidateImpl: async ({ candidateId }: any) => {
        repairs.push({ candidateId, renderedRound: bakeoffCalls });
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(4);
    expect(repairs.map((repair) => repair.candidateId)).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    expect(repairs.map((repair) => repair.renderedRound)).toEqual([1, 2, 3]);
    expect(result.repairCycles).toEqual({
      "candidate-a": 1,
      "candidate-b": 1,
      "candidate-c": 1,
    });
  });

  it("rejects programmatic human findings that contain no request text", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        requestedFindings: [{}],
        runBakeoffImpl: async () => {
          bakeoffCalls += 1;
          return report({ candidates: [candidate("candidate-a")] });
        },
      }),
    ).rejects.toThrow(/Human feedback must contain non-empty request text/iu);

    expect(bakeoffCalls).toBe(0);
  });

  it("forces explicit human feedback through the selected creative source before acceptance", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    const repairs: any[] = [];
    let humanGateCalls = 0;

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      requestedFindings: [
        {
          category: "human-review-feedback",
          message: "Make the hero feel more cinematic and asymmetrical.",
        },
      ],
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const result = await writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        );
        if (bakeoffCalls === 1) {
          for (const viewport of ["desktop", "mobile"])
            await fs.writeFile(
              path.join(
                options.screenshotsDir,
                `candidate-a-${viewport}-viewport.png`,
              ),
              "viewport pixels",
            );
        }
        return result;
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async ({ feedback }: any) => {
        humanGateCalls += 1;
        expect(feedback).toContain("cinematic");
        return {
          audit: {
            verdict: "pass",
            findings: [],
            summary: "Request met.",
            feedbackResults: [
              {
                feedbackIndex: 0,
                feedback: "Make the hero feel more cinematic and asymmetrical.",
                verdict: "pass",
                evidence:
                  "Desktop and mobile captures show the requested hero treatment.",
                candidateId: "candidate-a",
                findings: [],
              },
            ],
          },
        };
      },
      repairCandidateImpl: async (options: any) => {
        repairs.push(options);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(repairs).toHaveLength(1);
    expect(
      repairs[0].screenshots.map((file: string) => path.basename(file)),
    ).toEqual([
      "candidate-a-desktop-viewport.png",
      "candidate-a-mobile-viewport.png",
      "candidate-a-desktop.png",
    ]);
    expect(repairs[0].findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "human-review-feedback",
        }),
      ]),
    );
    expect(humanGateCalls).toBe(1);
    expect(result.humanRevisionPass).toBe(true);
  });

  it("persists feedback-index-bound evidence after a successful multi-item human audit", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    const configPath = path.join(root, "src/site.config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.design.experience.candidateId = "candidate-a";
    config.revisionReport = {
      results: [
        {
          feedbackIndex: 2,
          feedback: "Make the hero more cinematic.",
          status: "creative",
        },
        {
          feedbackIndex: 5,
          feedback: "Move the gallery before the services.",
          status: "creative",
        },
      ],
      creativeRepairScope: {
        feedbackItems: [
          {
            feedbackIndex: 2,
            feedback: "Make the hero more cinematic.",
          },
          {
            feedbackIndex: 5,
            feedback: "Move the gallery before the services.",
          },
        ],
      },
    };
    await fs.writeFile(configPath, JSON.stringify(config));

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      requestedFindings: [
        {
          category: "human-review-feedback",
          message: "Make the hero more cinematic.",
        },
        {
          category: "human-review-feedback",
          message: "Move the gallery before the services.",
        },
      ],
      runBakeoffImpl: async (options: any) =>
        writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        ),
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async () => ({
        audit: {
          verdict: "pass",
          summary: "Each requested change is present.",
          findings: [],
          feedbackResults: [
            {
              feedbackIndex: 5,
              feedback: "Move the gallery before the services.",
              verdict: "pass",
              evidence:
                "Desktop and mobile captures show the gallery before services.",
              candidateId: "candidate-a",
              findings: [],
            },
            {
              feedbackIndex: 2,
              feedback: "Make the hero more cinematic.",
              verdict: "pass",
              evidence:
                "The hero uses the requested cinematic treatment in all captures.",
              candidateId: "candidate-a",
              findings: [],
            },
          ],
        },
      }),
      repairCandidateImpl: async () => {},
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    const persisted = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(result.status).toBe("passed");
    expect(persisted.revisionReport.creativeSourceRepairVerified).toMatchObject(
      {
        pass: true,
        candidateId: "candidate-a",
        feedbackResults: [
          {
            feedbackIndex: 2,
            feedback: "Make the hero more cinematic.",
            verdict: "pass",
            evidence:
              "The hero uses the requested cinematic treatment in all captures.",
            candidateId: "candidate-a",
          },
          {
            feedbackIndex: 5,
            feedback: "Move the gallery before the services.",
            verdict: "pass",
            evidence:
              "Desktop and mobile captures show the gallery before services.",
            candidateId: "candidate-a",
          },
        ],
      },
    );
  });

  it("rejects an aggregate human pass that omits indexed evidence", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let promoteCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        requestedFindings: [
          {
            category: "human-review-feedback",
            message: "Make the hero more cinematic.",
          },
          {
            category: "human-review-feedback",
            message: "Move the gallery before the services.",
          },
        ],
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          ),
        runVisualGateImpl: (options: any) => visualGate(options, "pass"),
        runHumanGateImpl: async () => ({
          audit: {
            verdict: "pass",
            summary: "Both requests look complete.",
            findings: [],
          },
        }),
        repairCandidateImpl: async () => {},
        promoteImpl: async () => {
          promoteCalls += 1;
          return { candidateId: "candidate-a" };
        },
      }),
    ).rejects.toThrow(/aggregate pass without per-feedbackIndex evidence/iu);

    expect(promoteCalls).toBe(0);
    const persisted = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(
      persisted.revisionReport?.creativeSourceRepairVerified,
    ).toBeUndefined();
  });

  it("reruns Luna when the rendered human request gate still sees a mismatch", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let humanGateCalls = 0;
    let repairCalls = 0;
    let bakeoffCalls = 0;
    const repairFindings: any[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      maxCycles: 2,
      requestedFindings: [
        {
          category: "human-review-feedback",
          message: "Move the CTA below the gallery and make it understated.",
        },
      ],
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async () => {
        humanGateCalls += 1;
        return humanGateCalls === 1
          ? {
              audit: {
                verdict: "revise",
                summary: "CTA is still too prominent.",
                findings: [
                  {
                    feedbackIndex: 0,
                    category: "requirement-mismatch",
                    severity: "major",
                    viewport: "desktop",
                    evidence: "CTA remains above the gallery.",
                    recommendation:
                      "Move it below the gallery and reduce its visual weight.",
                  },
                ],
              },
            }
          : {
              audit: {
                verdict: "pass",
                summary: "Request met.",
                findings: [],
                feedbackResults: [
                  {
                    feedbackIndex: 0,
                    feedback:
                      "Move the CTA below the gallery and make it understated.",
                    verdict: "pass",
                    evidence:
                      "Desktop and mobile captures show the CTA below the gallery with restrained emphasis.",
                    candidateId: "candidate-a",
                    findings: [],
                  },
                ],
              },
            };
      },
      repairCandidateImpl: async ({ findings }: any) => {
        repairCalls += 1;
        repairFindings.push(findings);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairCalls).toBe(2);
    expect(
      repairFindings.flat().some((finding) => finding.feedbackIndex === 0),
    ).toBe(true);
    expect(bakeoffCalls).toBe(3);
    expect(humanGateCalls).toBe(2);
    expect(result.repairCycles).toEqual({ "candidate-a": 2 });
  });

  it("fails closed after two rendered repair cycles for the same candidate", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let bakeoffCalls = 0;
    let repairCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        maxCycles: 2,
        runBakeoffImpl: async (options: any) => {
          bakeoffCalls += 1;
          return writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          );
        },
        runVisualGateImpl: (options: any) => visualGate(options, "revise"),
        repairCandidateImpl: async () => {
          repairCalls += 1;
        },
      }),
    ).rejects.toThrow(/still fails rendered visual QA after 2 gate repairs/iu);

    expect(repairCalls).toBe(2);
    expect(bakeoffCalls).toBe(3);
  });

  it("rejects a passing visual-gate report when the process exits nonzero", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-visual-gate-exit-"),
    );
    roots.push(root);
    const siteDir = path.join(root, "site");
    const screenshotsDir = path.join(root, "screenshots");
    const reportPath = path.join(root, "visual-gate.json");
    const scriptPath = path.join(root, "fake-visual-gate.mjs");
    await fs.mkdir(path.join(siteDir, "src"), { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "src/site.config.json"),
      JSON.stringify({ design: { experience: {} } }),
    );
    await fs.writeFile(
      scriptPath,
      `import fs from "node:fs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
fs.writeFileSync(args.report, JSON.stringify({ status: "ok", blockers: [], audit: { verdict: "pass", findings: [] } }));
process.exit(1);
`,
    );

    await expect(
      runVisualGateProcess({
        siteDir,
        screenshotsDir,
        reportPath,
        visualGateScript: scriptPath,
      }),
    ).rejects.toThrow(/Creative visual gate could not run/iu);
  });

  it("restores the original three-file bundle if a staged repair swap fails", async () => {
    const { candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const originals = Object.fromEntries(
      await Promise.all(
        ["Experience.jsx", "styles.css", "motion.js"].map(async (name) => [
          name,
          await fs.readFile(path.join(candidateDir, name), "utf8"),
        ]),
      ),
    );
    const fsImpl = {
      mkdir: fs.mkdir.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      rm: fs.rm.bind(fs),
      rename: async (source: string, destination: string) => {
        if (
          source.includes(".rendered-repair-stage-") &&
          source.endsWith("styles.css")
        )
          throw new Error("simulated staged swap failure");
        return fs.rename(source, destination);
      },
    };

    await expect(
      writeCandidate(
        candidateDir,
        {
          experience: "export default function Repaired(){ return null; }",
          styles: ".repaired { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        { fsImpl },
      ),
    ).rejects.toThrow("simulated staged swap failure");

    for (const [name, content] of Object.entries(originals))
      expect(await fs.readFile(path.join(candidateDir, name), "utf8")).toBe(
        content,
      );
    expect(
      (await fs.readdir(candidateDir)).some((name) =>
        name.startsWith(".rendered-repair-"),
      ),
    ).toBe(false);
  });

  it("rejects a stale visual-gate report when the process exits zero without writing a new report", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-stale-visual-gate-"),
    );
    roots.push(root);
    const siteDir = path.join(root, "site");
    const screenshotsDir = path.join(root, "screenshots");
    const reportPath = path.join(root, "visual-gate.json");
    const scriptPath = path.join(root, "silent-visual-gate.mjs");
    await fs.mkdir(path.join(siteDir, "src"), { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "src/site.config.json"),
      JSON.stringify({ design: { experience: {} } }),
    );
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        status: "ok",
        blockers: [],
        audit: { verdict: "pass", findings: [] },
      }),
    );
    await fs.writeFile(scriptPath, "process.exit(0);\n");

    await expect(
      runVisualGateProcess({
        siteDir,
        screenshotsDir,
        reportPath,
        visualGateScript: scriptPath,
      }),
    ).rejects.toThrow(/produced no report/iu);
  });

  it("propagates unexpected screenshot access failures but ignores missing optional screenshots", async () => {
    const denied: any = new Error("permission denied");
    denied.code = "EACCES";
    await expect(
      collectAvailableScreenshots(["/tmp/blocked.png"], {
        fsImpl: {
          async access() {
            throw denied;
          },
        },
      }),
    ).rejects.toBe(denied);

    const missing: any = new Error("missing");
    missing.code = "ENOENT";
    await expect(
      collectAvailableScreenshots(["/tmp/missing.png"], {
        fsImpl: {
          async access() {
            throw missing;
          },
        },
      }),
    ).resolves.toEqual([]);
  });

  it("preserves the recovery backup when rollback itself cannot restore an original file", async () => {
    const { candidates } = await fixture(["candidate-a"]);
    const candidateDir = path.join(candidates, "candidate-a");
    const originalExperience = await fs.readFile(
      path.join(candidateDir, "Experience.jsx"),
      "utf8",
    );
    const fsImpl = {
      mkdir: fs.mkdir.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      rm: fs.rm.bind(fs),
      rename: async (source: string, destination: string) => {
        if (
          source.includes(".rendered-repair-stage-") &&
          source.endsWith("styles.css")
        )
          throw new Error("simulated staged swap failure");
        if (
          source.includes(".rendered-repair-backup-") &&
          source.endsWith("Experience.jsx")
        )
          throw new Error("simulated rollback restore failure");
        return fs.rename(source, destination);
      },
    };

    await expect(
      writeCandidate(
        candidateDir,
        {
          experience: "export default function Repaired(){ return null; }",
          styles: ".repaired { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        { fsImpl },
      ),
    ).rejects.toThrow(/recovery backup preserved at/iu);

    const recoveryDir = (await fs.readdir(candidateDir)).find((name) =>
      name.startsWith(".rendered-repair-backup-"),
    );
    expect(recoveryDir).toBeTruthy();
    expect(
      await fs.readFile(
        path.join(candidateDir, recoveryDir!, "Experience.jsx"),
        "utf8",
      ),
    ).toBe(originalExperience);
  });

  it("never repairs source for a visual-gate infrastructure error", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let repairCalls = 0;

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({ candidates: [candidate("candidate-a")] }),
          ),
        runVisualGateImpl: async () => {
          throw new Error("visual judge provider unavailable");
        },
        repairCandidateImpl: async () => {
          repairCalls += 1;
        },
      }),
    ).rejects.toThrow("visual judge provider unavailable");

    expect(repairCalls).toBe(0);
  });

  it("rejects a bakeoff candidate directory that escapes the candidates root", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);

    await expect(
      runRenderedCreativeRepair({
        siteDir: root,
        candidatesDir: candidates,
        outDir: path.join(root, "evidence"),
        runBakeoffImpl: async (options: any) =>
          writeBakeoffEvidence(
            options,
            report({
              candidates: [
                candidate("candidate-a", { directory: "../outside" }),
              ],
            }),
          ),
        runVisualGateImpl: async () => visualGate({}, "pass"),
        promoteImpl: async () => ({ candidateId: "candidate-a" }),
      }),
    ).rejects.toThrow(/escapes the candidates root/iu);
  });

  it("routes the generation workflow through the rendered repair orchestrator and checks the freshly built DOM", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/generate-client.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("scripts/run-rendered-creative-repair.mjs");
    expect(workflow).not.toContain("for REPAIR_ROUND in 1 2");
    expect(workflow).not.toContain("for VISUAL_REPAIR_ROUND in 1 2");
    const buildIndex = workflow.indexOf(
      'PUBLIC_REVIEW_MODE=true PUBLIC_LAUNCHLOOM_API_URL="$LAUNCHLOOM_API_URL" npm run build',
    );
    const hostGuardIndex = workflow.indexOf('data-creative-host="true"');
    const candidateGuardIndex = workflow.indexOf(
      'data-creative-candidate=\\\"$CANDIDATE_ID\\\"',
    );
    expect(buildIndex).toBeGreaterThan(-1);
    expect(hostGuardIndex).toBeGreaterThan(buildIndex);
    expect(candidateGuardIndex).toBeGreaterThan(buildIndex);
  });
});
