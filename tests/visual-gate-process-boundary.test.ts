import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runVisualGateProcess } from "../scripts/run-rendered-creative-repair.mjs";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
const finding = {
  category: "content-integrity",
  severity: "major",
  viewport: "both",
  evidence: "Process repeated in adjacent sections",
  recommendation: "Keep one process sequence",
};
const qualityReport = {
  version: 1,
  mode: "verify",
  status: "quality-blocked",
  changed: false,
  appliedOperations: [],
  blockers: [finding],
  audit: {
    summary: "Duplicated content",
    verdict: "revise",
    findings: [finding],
    operations: [],
  },
};
async function invoke(report: unknown, exit: number) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-qa-boundary-"),
  );
  roots.push(root);
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "screenshots"));
  await fs.writeFile(path.join(root, "src/site.config.json"), "{}");
  const script = path.join(root, "gate.mjs");
  await fs.writeFile(
    script,
    `import fs from 'node:fs'; const i=process.argv.indexOf('--report'); fs.writeFileSync(process.argv[i+1],${JSON.stringify(JSON.stringify(report))}); process.exit(${exit});`,
  );
  return runVisualGateProcess({
    siteDir: root,
    screenshotsDir: path.join(root, "screenshots"),
    reportPath: path.join(root, "report.json"),
    visualGateScript: script,
  });
}
describe("visual gate subprocess quality outcome", () => {
  it("preserves findings from the real QA CLI with only provider transport replaced", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-real-qa-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "src"));
    const screenshotsDir = path.join(root, "screenshots");
    await fs.mkdir(screenshotsDir);
    for (const viewport of ["desktop", "compact", "mobile"])
      await fs.writeFile(path.join(screenshotsDir, `${viewport}.png`), "fixture pixels");
    await fs.writeFile(path.join(root, "src/site.config.json"), JSON.stringify({
      businessName: "Controlled QA fixture",
      design: { experience: { renderer: "creative-candidate", candidateId: "candidate-a" } },
    }));
    const script = path.join(root, "gate.mjs");
    await fs.writeFile(script, `
process.env.OPENROUTER_API_KEY = 'test-only-no-network';
globalThis.fetch = async () => Response.json({choices:[{finish_reason:'stop',message:{content:${JSON.stringify(JSON.stringify(qualityReport.audit))}}}]});
await import(${JSON.stringify(path.resolve("scripts/visual-quality-gate.mjs"))});
`);
    const result = await runVisualGateProcess({
      siteDir: root,
      screenshotsDir,
      reportPath: path.join(root, "report.json"),
      visualGateScript: script,
    });
    expect(result.processExitCode).toBe(2);
    expect(result.status).toBe("quality-blocked");
    expect(result.audit.verdict).toBe("revise");
    expect(result.blockers).toEqual([finding]);
  });
  it("returns actionable failed quality to the repair caller without calling it a pass", async () => {
    const result = await invoke(qualityReport, 2);
    expect(result.audit.verdict).toBe("revise");
    expect(result.blockers).toHaveLength(1);
    expect(result.processExitCode).toBe(2);
  });
  it.each([1, 3])(
    "rejects an ordinary process failure even beside a quality report: %i",
    async (exit) => {
      await expect(invoke(qualityReport, exit)).rejects.toThrow(
        /could not run/,
      );
    },
  );
  it.each([
    { ...qualityReport, status: "error" },
    { ...qualityReport, mode: "plan" },
    { ...qualityReport, changed: true },
    { ...qualityReport, blockers: [] },
    {
      ...qualityReport,
      audit: { verdict: "pass", findings: [], operations: [] },
    },
    { ...qualityReport, audit: { ...qualityReport.audit, findings: null } },
  ])(
    "rejects a malformed or contradictory quality outcome %#",
    async (report) => {
      await expect(invoke(report, 2)).rejects.toThrow(/could not run/);
    },
  );
});
