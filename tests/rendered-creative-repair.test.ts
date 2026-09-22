import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectAvailableScreenshots, runRenderedCreativeRepair, runVisualGateProcess, writeCandidate } from "../scripts/run-rendered-creative-repair.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
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
    await fs.writeFile(path.join(directory, "Experience.jsx"), "export default () => null;\n");
    await fs.writeFile(path.join(directory, "styles.css"), "body{}\n");
    await fs.writeFile(
      path.join(directory, "motion.js"),
      "export function mountExperienceMotion(){ return () => {}; }\n",
    );
  }
  return { root, candidates };
}

function candidate(candidateId: string, overrides: Record<string, unknown> = {}) {
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
      verdict === "pass"
        ? []
        : [{ severity: "major", category: "hierarchy" }],
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
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
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
    expect(bakeoffCalls).toBe(2);
    expect(new Set(repairs)).toEqual(new Set(["candidate-a", "candidate-b"]));
    expect(promotions).toHaveLength(1);
    expect(promotions[0].selectionMode).toBe("creative-bakeoff");
    expect(result.promotionReady).toBe(true);
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
    const repairs: string[] = [];

    const result = await runRenderedCreativeRepair({
      siteDir: root,
      candidatesDir: candidates,
      outDir: path.join(root, "evidence"),
      mode: "promote",
      runBakeoffImpl: async (options: any) => {
        bakeoffCalls += 1;
        const candidatesReport = [
          candidate("candidate-a"),
          candidate("candidate-b"),
          candidate("candidate-c"),
        ];
        return writeBakeoffEvidence(
          options,
          bakeoffCalls === 1
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
        repairs.push(candidateId);
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(bakeoffCalls).toBe(2);
    expect(repairs.sort()).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
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
        return writeBakeoffEvidence(
          options,
          report({ candidates: [candidate("candidate-a")] }),
        );
      },
      runVisualGateImpl: (options: any) => visualGate(options, "pass"),
      runHumanGateImpl: async ({ feedback }: any) => {
        humanGateCalls += 1;
        expect(feedback).toContain("cinematic");
        return {
          audit: { verdict: "pass", findings: [], summary: "Request met." },
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

  it("reruns Luna when the rendered human request gate still sees a mismatch", async () => {
    const { root, candidates } = await fixture(["candidate-a"]);
    let humanGateCalls = 0;
    let repairCalls = 0;
    let bakeoffCalls = 0;

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
              },
            };
      },
      repairCandidateImpl: async () => {
        repairCalls += 1;
      },
      promoteImpl: async () => ({ candidateId: "candidate-a" }),
    });

    expect(result.status).toBe("passed");
    expect(repairCalls).toBe(2);
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
    ).rejects.toThrow(/still fails rendered visual QA after 2 repair cycles/iu);

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
          motion:
            "export function mountExperienceMotion(){ return () => {}; }",
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
          motion:
            "export function mountExperienceMotion(){ return () => {}; }",
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
              candidates: [candidate("candidate-a", { directory: "../outside" })],
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
    const hostGuardIndex = workflow.indexOf(
      'data-creative-host="true"',
      buildIndex,
    );
    const candidateGuardIndex = workflow.indexOf(
      'data-creative-candidate=\\\"$CANDIDATE_ID\\\"',
      buildIndex,
    );
    expect(buildIndex).toBeGreaterThan(-1);
    expect(hostGuardIndex).toBeGreaterThan(buildIndex);
    expect(candidateGuardIndex).toBeGreaterThan(buildIndex);
  });

});
