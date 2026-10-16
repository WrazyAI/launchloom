/**
 * Report and compare creative-generation timing evidence.
 *
 * Runs read the QA evidence directory (`.launchloom`) produced by a focused
 * pipeline test:
 *   - pipeline-test-report.json   per-stage wall-clock totals
 *   - creative-repair/timing.json per-operation creative timings (newer runs)
 *   - creative-repair/round-<N>/creative-bakeoff.json  per-candidate render
 *     and judge timings (fallback for runs without timing.json)
 *   - creative-repair/repair-usage.json              per-repair model calls
 *   - creative-repair/summary.json                   rounds, repair usage
 *
 * Usage:
 *   node scripts/report-creative-timings.mjs --launchloom <dir>
 *   node scripts/report-creative-timings.mjs --compare <left> <right>
 *   node scripts/report-creative-timings.mjs --launchloom <dir> --json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function argsFrom(argv) {
  const args = { _: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--launchloom") args.launchloom = argv[++index];
    else if (value === "--compare") {
      args.compare = [argv[++index], argv[++index]];
    } else if (value === "--json") args.json = true;
    else args._.push(value);
  }
  return args;
}

async function readJsonIfPresent(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Summarize one QA evidence directory.
 * @param {string} launchloomDir path to a `.launchloom` directory
 */
export async function summarizeCreativeRun(launchloomDir) {
  const dir = path.resolve(launchloomDir);
  const pipelineReport = await readJsonIfPresent(
    path.join(dir, "pipeline-test-report.json"),
  );
  const timing = await readJsonIfPresent(
    path.join(dir, "creative-repair", "timing.json"),
  );
  const repairUsage = await readJsonIfPresent(
    path.join(dir, "creative-repair", "repair-usage.json"),
  );
  const summary = await readJsonIfPresent(
    path.join(dir, "creative-repair", "summary.json"),
  );
  const authoring = await readJsonIfPresent(
    path.join(dir, "generated-experiences", "creative-run.json"),
  );

  const stages = pipelineReport?.stages
    ? Object.fromEntries(
        Object.entries(pipelineReport.stages).map(([name, stage]) => [
          name,
          {
            status: stage?.status || "unknown",
            durationMs: Number(stage?.durationMs) || 0,
          },
        ]),
      )
    : {};

  const entries = Array.isArray(timing?.entries) ? timing.entries : [];
  const durationsByCategory = (category) =>
    entries
      .filter((entry) => entry?.category === category)
      .map((entry) => Number(entry?.durationMs) || 0);

  // Round reports provide the fallback detail for runs recorded before the
  // timing.json instrumentation existed, and per-candidate detail either way.
  const roundDirs = (
    await fs
      .readdir(path.join(dir, "creative-repair"), {
        withFileTypes: true,
      })
      .catch(() => [])
  )
    .filter((entry) => entry.isDirectory() && /^round-\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const rounds = [];
  const judgeDurations = [];
  const diversityDurations = [];
  const candidateTimings = {};
  // The bakeoff's own per-round recorder is the authoritative source for
  // judge and diversity call counts: it counts only calls made in that round,
  // so reused candidates (whose round reports carry render timings only)
  // cannot inflate totals. `timing.json` carries the orchestrator-level
  // bakeoff/gate/repair entries instead of per-call judge entries.
  const roundJudge = { count: 0, totalMs: 0 };
  const roundDiversity = { count: 0, totalMs: 0 };
  for (const roundDir of roundDirs) {
    const report = await readJsonIfPresent(
      path.join(dir, "creative-repair", roundDir, "creative-bakeoff.json"),
    );
    const roundCandidates = [];
    for (const candidate of report?.candidates || []) {
      const timings = candidate?.timings || {};
      roundCandidates.push({
        candidateId: candidate.candidateId,
        totalMs: Number(timings.totalMs) || null,
        judgeMs: Number(timings.judge) || null,
        judgeCallMs:
          Number(candidate?.renderedReferenceFidelity?.durationMs) || null,
        reused: timings.reused === true,
      });
      if (Number.isFinite(timings.judge))
        judgeDurations.push(Number(timings.judge));
      candidateTimings[candidate.candidateId] ||= [];
      if (Number.isFinite(timings.totalMs))
        candidateTimings[candidate.candidateId].push(Number(timings.totalMs));
    }
    const categories = report?.timings?.categories || {};
    if (Number.isFinite(Number(categories.judge?.count))) {
      roundJudge.count += Number(categories.judge.count);
      roundJudge.totalMs += Number(categories.judge.totalMs) || 0;
    }
    if (Number.isFinite(Number(categories.diversity?.count))) {
      roundDiversity.count += Number(categories.diversity.count);
      roundDiversity.totalMs += Number(categories.diversity.totalMs) || 0;
    }
    if (Number.isFinite(Number(report?.visualDiversity?.durationMs)))
      diversityDurations.push(Number(report.visualDiversity.durationMs));
    rounds.push({
      round: roundDir,
      bakeoffMs:
        Number(
          entries.find(
            (entry) =>
              entry?.category === "bakeoff" && entry?.name === roundDir,
          )?.durationMs,
        ) || null,
      selectedCandidateId: report?.selectedCandidateId || null,
      candidates: roundCandidates,
      repairs: [],
    });
  }

  for (const entry of entries) {
    if (entry?.category !== "repair") continue;
    const round = rounds.find(
      (item) =>
        item.round ===
        `round-${String(entry?.details?.round ?? -1).padStart(2, "0")}`,
    );
    if (round)
      round.repairs.push({
        candidateId: entry.name,
        durationMs: Number(entry.durationMs) || 0,
        status: entry.status,
        reason: entry?.details?.reason || null,
      });
  }

  const repairDurations = Array.isArray(repairUsage?.records)
    ? repairUsage.records
        .map((record) => Number(record?.durationMs))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  const stageTotal = Object.values(stages).reduce(
    (sum, stage) => sum + stage.durationMs,
    0,
  );
  const verdict =
    pipelineReport?.verdict ||
    (summary?.status === "passed" ? "passed" : summary?.status || "unknown");
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  // Call counts prefer the bakeoff's per-round recorder, then orchestrator
  // timing entries, then per-candidate round timings (pre-instrumentation
  // evidence only). Maxima come from per-call data when it exists.
  const entryJudgeDurations = durationsByCategory("judge");
  const judgeStats = roundJudge.count
    ? {
        count: roundJudge.count,
        totalMs: roundJudge.totalMs,
        maxMs: Math.max(0, ...judgeDurations),
      }
    : entryJudgeDurations.length
      ? {
          count: entryJudgeDurations.length,
          totalMs: sum(entryJudgeDurations),
          maxMs: Math.max(...entryJudgeDurations),
        }
      : {
          count: judgeDurations.length,
          totalMs: sum(judgeDurations),
          maxMs: Math.max(0, ...judgeDurations),
        };
  const diversityStats = roundDiversity.count
    ? {
        count: roundDiversity.count,
        totalMs: roundDiversity.totalMs,
        maxMs: Math.max(0, ...diversityDurations),
      }
    : {
        count: diversityDurations.length,
        totalMs: sum(diversityDurations),
        maxMs: Math.max(0, ...diversityDurations),
      };

  return {
    launchloomDir: dir,
    verdict,
    profile: pipelineReport?.profile || null,
    sourceSha: pipelineReport?.sourceSha || null,
    runId: pipelineReport?.runId || null,
    stages,
    stageTotalMs: stageTotal,
    creative: {
      rounds: rounds.length,
      repairCycles: summary?.repairCycles || null,
      status: summary?.status || null,
      totals: {
        bakeoffMs: durationsByCategory("bakeoff").reduce((a, b) => a + b, 0),
        judgeMs: judgeStats.totalMs,
        diversityMs: diversityStats.totalMs,
        repairMs: durationsByCategory("repair").reduce((a, b) => a + b, 0),
        gateMs: durationsByCategory("gate").reduce((a, b) => a + b, 0),
      },
      calls: {
        judge: {
          count: judgeStats.count,
          averageMs: roundTo(
            judgeStats.count ? judgeStats.totalMs / judgeStats.count : 0,
          ),
          maxMs: judgeStats.maxMs,
        },
        diversity: {
          count: diversityStats.count,
          averageMs: roundTo(
            diversityStats.count
              ? diversityStats.totalMs / diversityStats.count
              : 0,
          ),
          maxMs: diversityStats.maxMs,
        },
        repair: {
          count: repairDurations.length,
          averageMs: roundTo(average(repairDurations)),
          maxMs: Math.max(0, ...repairDurations),
        },
        gate: {
          count: durationsByCategory("gate").length,
          averageMs: roundTo(average(durationsByCategory("gate"))),
          maxMs: Math.max(0, ...durationsByCategory("gate")),
        },
      },
      authoringStageMs: stages?.author?.durationMs || null,
      authoringRequests: Array.isArray(authoring?.usage)
        ? authoring.usage.length
        : null,
    },
    rounds,
  };
}

function minutes(ms) {
  return `${roundTo((Number(ms) || 0) / 60_000, 1)}m`;
}

function formatCallSummary(label, call) {
  if (!call || !call.count) return `${label}: none recorded`;
  return `${label}: ${call.count} (avg ${minutes(call.averageMs)}, max ${minutes(call.maxMs)})`;
}

/**
 * Render a human-readable report for one run.
 */
export function formatCreativeRunReport(run) {
  const lines = [];
  lines.push(`LaunchLoom creative timing report`);
  lines.push(`  evidence: ${run.launchloomDir}`);
  lines.push(
    `  profile: ${run.profile || "unknown"} | verdict: ${run.verdict} | run: ${run.runId || "unknown"}`,
  );
  lines.push("");
  lines.push("Pipeline stages:");
  for (const [name, stage] of Object.entries(run.stages)) {
    lines.push(
      `  ${name.padEnd(10)} ${stage.status.padEnd(9)} ${minutes(stage.durationMs)}`,
    );
  }
  lines.push(
    `  ${"total".padEnd(10)} ${"".padEnd(9)} ${minutes(run.stageTotalMs)}`,
  );
  lines.push("");
  lines.push("Creative stage:");
  lines.push(`  rounds: ${run.creative.rounds}`);
  lines.push(`  bakeoff total: ${minutes(run.creative.totals.bakeoffMs)}`);
  lines.push(`  judge total: ${minutes(run.creative.totals.judgeMs)}`);
  lines.push(`  diversity total: ${minutes(run.creative.totals.diversityMs)}`);
  lines.push(`  repair total: ${minutes(run.creative.totals.repairMs)}`);
  lines.push(`  gate total: ${minutes(run.creative.totals.gateMs)}`);
  lines.push("");
  lines.push("Model calls:");
  lines.push(`  ${formatCallSummary("judge", run.creative.calls.judge)}`);
  lines.push(
    `  ${formatCallSummary("diversity", run.creative.calls.diversity)}`,
  );
  lines.push(`  ${formatCallSummary("repair", run.creative.calls.repair)}`);
  lines.push(`  ${formatCallSummary("gate", run.creative.calls.gate)}`);
  lines.push("");
  lines.push("Rounds:");
  for (const round of run.rounds) {
    const repairs = round.repairs.length
      ? ` | repairs: ${round.repairs
          .map(
            (repair) => `${repair.candidateId} ${minutes(repair.durationMs)}`,
          )
          .join(", ")}`
      : "";
    const candidates = round.candidates
      .map(
        (candidate) =>
          `${candidate.candidateId}${candidate.reused ? "(reused)" : ""} ${minutes(candidate.totalMs)}`,
      )
      .join(", ");
    lines.push(
      `  ${round.round}: bakeoff ${minutes(round.bakeoffMs)}${repairs}`,
    );
    lines.push(`    candidates: ${candidates}`);
  }
  return lines.join("\n");
}

/**
 * Compare two run summaries. Positive deltas mean the right run took longer.
 */
export function compareCreativeRuns(left, right) {
  const stageNames = new Set([
    ...Object.keys(left.stages),
    ...Object.keys(right.stages),
  ]);
  const stages = [];
  for (const name of stageNames) {
    const leftMs = left.stages[name]?.durationMs || 0;
    const rightMs = right.stages[name]?.durationMs || 0;
    stages.push({ name, leftMs, rightMs, deltaMs: rightMs - leftMs });
  }
  const creative = {};
  for (const key of [
    "bakeoffMs",
    "judgeMs",
    "diversityMs",
    "repairMs",
    "gateMs",
  ]) {
    const leftMs = left.creative.totals[key];
    const rightMs = right.creative.totals[key];
    creative[key] = { leftMs, rightMs, deltaMs: rightMs - leftMs };
  }
  return {
    left: { verdict: left.verdict, runId: left.runId },
    right: { verdict: right.verdict, runId: right.runId },
    stages,
    creative,
    calls: {
      judge: {
        left: left.creative.calls.judge,
        right: right.creative.calls.judge,
      },
      diversity: {
        left: left.creative.calls.diversity,
        right: right.creative.calls.diversity,
      },
      repair: {
        left: left.creative.calls.repair,
        right: right.creative.calls.repair,
      },
      gate: {
        left: left.creative.calls.gate,
        right: right.creative.calls.gate,
      },
    },
    rounds: { left: left.creative.rounds, right: right.creative.rounds },
  };
}

/**
 * Render a comparison report between two runs.
 */
export function formatComparison(comparison) {
  const lines = [];
  lines.push("LaunchLoom creative timing comparison");
  lines.push(
    `  left:  run ${comparison.left.runId || "unknown"} (${comparison.left.verdict})`,
  );
  lines.push(
    `  right: run ${comparison.right.runId || "unknown"} (${comparison.right.verdict})`,
  );
  lines.push("");
  lines.push("Stages (left -> right):");
  for (const stage of comparison.stages) {
    lines.push(
      `  ${stage.name.padEnd(10)} ${minutes(stage.leftMs).padStart(7)} -> ${minutes(stage.rightMs).padStart(7)}  (${stage.deltaMs >= 0 ? "+" : ""}${minutes(stage.deltaMs)})`,
    );
  }
  lines.push("");
  lines.push("Creative totals (left -> right):");
  for (const [key, value] of Object.entries(comparison.creative)) {
    lines.push(
      `  ${key.padEnd(12)} ${minutes(value.leftMs).padStart(7)} -> ${minutes(value.rightMs).padStart(7)}  (${value.deltaMs >= 0 ? "+" : ""}${minutes(value.deltaMs)})`,
    );
  }
  lines.push("");
  lines.push("Call counts (left -> right):");
  for (const [label, calls] of Object.entries(comparison.calls)) {
    lines.push(
      `  ${label.padEnd(10)} ${String(calls.left.count).padStart(3)} -> ${String(calls.right.count).padStart(3)}`,
    );
  }
  lines.push("");
  lines.push(
    `Rounds (left -> right): ${comparison.rounds.left} -> ${comparison.rounds.right}`,
  );
  return lines.join("\n");
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.launchloom && !args.compare) {
    console.error(
      "Usage: node scripts/report-creative-timings.mjs --launchloom <dir> [--json]\n" +
        "       node scripts/report-creative-timings.mjs --compare <left> <right> [--json]",
    );
    process.exitCode = 1;
    return;
  }
  if (args.compare) {
    const [leftDir, rightDir] = args.compare;
    const left = await summarizeCreativeRun(leftDir);
    const right = await summarizeCreativeRun(rightDir);
    const comparison = compareCreativeRuns(left, right);
    if (args.json)
      console.log(JSON.stringify({ left, right, comparison }, null, 2));
    else console.log(formatComparison(comparison));
    return;
  }
  const run = await summarizeCreativeRun(args.launchloom);
  if (args.json) console.log(JSON.stringify(run, null, 2));
  else console.log(formatCreativeRunReport(run));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
