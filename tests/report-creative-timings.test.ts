import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compareCreativeRuns,
  formatComparison,
  formatCreativeRunReport,
  summarizeCreativeRun,
} from "../scripts/report-creative-timings.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function writeEvidence(dir: string, files: Record<string, unknown>) {
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(dir, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    );
  }
}

async function fixtureRun({
  verdict = "failed",
  repairCycles,
}: { verdict?: string; repairCycles?: Record<string, number> } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-timings-"));
  roots.push(root);
  await writeEvidence(root, {
    "pipeline-test-report.json": {
      version: 1,
      profile: "creative-only",
      runId: "38620904674-1",
      sourceSha: "abc123",
      verdict,
      stages: {
        prepare: { status: "passed", durationMs: 12_000 },
        author: { status: "passed", durationMs: 1_086_000 },
        creative: { status: "failed", durationMs: 5_316_000 },
        select: { status: "passed", durationMs: 1_000 },
      },
    },
    "creative-repair/timing.json": {
      version: 1,
      categories: {},
      entries: [
        {
          category: "bakeoff",
          name: "round-00",
          startedAt: 1000,
          durationMs: 300_000,
          status: "ok",
        },
        {
          category: "judge",
          name: "candidate-a",
          startedAt: 1100,
          durationMs: 120_000,
          status: "ok",
        },
        {
          category: "judge",
          name: "candidate-b",
          startedAt: 1150,
          durationMs: 130_000,
          status: "ok",
        },
        {
          category: "repair",
          name: "candidate-a",
          startedAt: 1300,
          durationMs: 200_000,
          status: "ok",
          details: { round: 0, reason: "candidate-render-failure" },
        },
        {
          category: "gate",
          name: "round-00",
          startedAt: 1400,
          durationMs: 90_000,
          status: "ok",
          details: { verdict: "revise" },
        },
      ],
    },
    "creative-repair/round-00/creative-bakeoff.json": {
      candidates: [
        {
          candidateId: "candidate-a",
          timings: { totalMs: 250_000, judge: 120_000 },
          renderedReferenceFidelity: { durationMs: 115_000, pass: false },
        },
        {
          candidateId: "candidate-b",
          timings: { totalMs: 260_000, judge: 130_000 },
          renderedReferenceFidelity: { durationMs: 125_000, pass: true },
        },
      ],
      visualDiversity: { durationMs: 150_000, pass: false },
      selectedCandidateId: null,
    },
    "creative-repair/repair-usage.json": {
      version: 1,
      model: "openai/gpt-6-luna",
      records: [
        { label: "creative-repair", durationMs: 200_000, at: 1 },
        { label: "creative-repair", durationMs: 180_000, at: 2 },
      ],
    },
    "creative-repair/summary.json": {
      version: 1,
      status: "promotion-pending",
      ...(repairCycles ? { repairCycles } : {}),
    },
    "generated-experiences/creative-run.json": {
      usage: [{ durationMs: 60_000 }, { durationMs: 80_000 }],
    },
  });
  return root;
}

describe("creative timing report", () => {
  it("summarizes stages, creative totals, calls and rounds", async () => {
    const run = await summarizeCreativeRun(await fixtureRun());
    expect(run.verdict).toBe("failed");
    expect(run.profile).toBe("creative-only");
    expect(run.stages.creative.durationMs).toBe(5_316_000);
    expect(run.stageTotalMs).toBe(6_415_000);
    expect(run.creative.rounds).toBe(1);
    expect(run.creative.totals).toMatchObject({
      bakeoffMs: 300_000,
      judgeMs: 250_000,
      repairMs: 200_000,
      gateMs: 90_000,
    });
    expect(run.creative.calls.judge.count).toBe(2);
    expect(run.creative.calls.judge.averageMs).toBe(125_000);
    expect(run.creative.calls.diversity.count).toBe(1);
    expect(run.creative.calls.repair).toMatchObject({
      count: 2,
      averageMs: 190_000,
      maxMs: 200_000,
    });
    expect(run.creative.authoringRequests).toBe(2);
    expect(run.rounds[0]).toMatchObject({
      round: "round-00",
      bakeoffMs: 300_000,
      selectedCandidateId: null,
    });
    expect(run.rounds[0].repairs).toEqual([
      {
        candidateId: "candidate-a",
        durationMs: 200_000,
        status: "ok",
        reason: "candidate-render-failure",
      },
    ]);
  });

  it("renders a readable report and a comparison with deltas", async () => {
    const left = await summarizeCreativeRun(await fixtureRun());
    const rightRoot = await fixtureRun({ verdict: "passed" });
    // The right run is faster: halve the creative stage and drop a judge call.
    const rightReportPath = path.join(rightRoot, "pipeline-test-report.json");
    const rightReport = JSON.parse(await fs.readFile(rightReportPath, "utf8"));
    rightReport.stages.creative.durationMs = 1_000_000;
    await fs.writeFile(rightReportPath, JSON.stringify(rightReport));
    const timingPath = path.join(rightRoot, "creative-repair/timing.json");
    const timing = JSON.parse(await fs.readFile(timingPath, "utf8"));
    timing.entries = timing.entries.filter(
      (entry: any) => !(entry.category === "judge"),
    );
    await fs.writeFile(timingPath, JSON.stringify(timing));
    const right = await summarizeCreativeRun(rightRoot);

    const text = formatCreativeRunReport(left);
    expect(text).toContain("Pipeline stages:");
    expect(text).toContain("round-00");
    expect(text).toContain("candidate-a");

    const comparison = compareCreativeRuns(left, right);
    const creative = comparison.stages.find(
      (stage) => stage.name === "creative",
    );
    expect(creative?.deltaMs).toBe(1_000_000 - 5_316_000);
    expect(comparison.calls.judge.left.count).toBe(2);
    expect(comparison.calls.judge.right.count).toBe(2); // falls back to round reports

    const comparisonText = formatComparison(comparison);
    expect(comparisonText).toContain("Stage");
    expect(comparisonText).toContain("creative");
  });

  it("reports missing evidence without throwing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-timings-empty-"));
    roots.push(root);
    const run = await summarizeCreativeRun(root);
    expect(run.verdict).toBe("unknown");
    expect(run.stages).toEqual({});
    expect(run.creative.rounds).toBe(0);
    expect(formatCreativeRunReport(run)).toContain("Rounds:");
  });
});
