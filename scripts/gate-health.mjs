/**
 * Passive gate-health measurement for the creative promotion gate.
 *
 * Reads bakeoff round reports and summarizes the rendered-judge score
 * distribution, major-finding rates, and the hard/open failure split. This is
 * measurement only: it never changes selection, repair, or promotion behavior.
 * The calibration harness and the pipeline-test report both build on these
 * functions, and the values are what a bar change must be justified against.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { RENDERED_REFERENCE_THRESHOLDS } from "./rendered-reference-fidelity.mjs";
import { splitFailureLines } from "./creative-gate-severity.mjs";

/**
 * Nearest-rank quantile: the smallest observed value at or above the requested
 * percentile. Returns an actual sample value (or null for empty input).
 * @param {number[]} values
 * @param {number} p percentile in [0, 100]
 * @returns {number | null}
 */
export function quantile(values, p) {
  const sorted = (values || [])
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const clamped = Math.min(100, Math.max(0, Number(p)));
  const rank = Math.ceil((clamped / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** @param {number[]} values */
export function median(values) {
  return quantile(values, 50);
}

/**
 * @param {{runId?: string, round?: string, candidate?: Record<string, any>}} input
 * @returns {Record<string, any> | null} null when the candidate has no
 * rendered judge audit (nothing to measure).
 */
export function sampleFromCandidate({ runId = null, round = null, candidate }) {
  const audit = candidate?.renderedReferenceFidelity?.audit;
  if (!audit?.scores) return null;
  const scores = {};
  for (const [key, value] of Object.entries(audit.scores)) {
    if (Number.isFinite(Number(value))) scores[key] = Number(value);
  }
  const overall = Number(audit.overallScore);
  if (!Number.isFinite(overall)) return null;
  const majors = (audit.findings || []).filter((finding) =>
    ["critical", "major"].includes(finding?.severity),
  );
  const failures = (candidate.failures || []).map(String);
  const { hard, open } = splitFailureLines(failures);
  return {
    runId,
    round,
    candidateId: candidate?.candidateId || "unknown",
    familyId: candidate?.familyId || null,
    scores,
    overall,
    majors: majors.map((finding) => ({
      category: finding?.category || "unknown",
      severity: finding?.severity,
    })),
    hardFailures: hard,
    openFailures: open,
  };
}

function numericRoundOrder(left, right) {
  return (
    Number(String(left).slice("round-".length)) -
    Number(String(right).slice("round-".length))
  );
}

/**
 * Collect gate-health samples from a `.launchloom` evidence directory (or a
 * `creative-repair` directory directly). Unreadable rounds and candidates
 * without rendered audits are counted in `skipped`, never silently dropped.
 *
 * @param {string} launchloomDir
 * @param {{runId?: string | null}} [options]
 * @returns {Promise<{samples: Array<Record<string, any>>, skipped: Array<Record<string, any>>}>}
 */
export async function collectEvidenceSamples(
  launchloomDir,
  { runId = null } = {},
) {
  const root = path.resolve(launchloomDir);
  const repairDir = await fs
    .access(path.join(root, "creative-repair"))
    .then(() => path.join(root, "creative-repair"))
    .catch(() => root);
  const entries = await fs
    .readdir(repairDir, { withFileTypes: true })
    .catch(() => []);
  const rounds = entries
    .filter((entry) => entry.isDirectory() && /^round-\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort(numericRoundOrder);
  const samples = [];
  const skipped = [];
  const resolvedRunId = runId || path.basename(root);
  for (const round of rounds) {
    const reportPath = path.join(repairDir, round, "creative-bakeoff.json");
    let report;
    try {
      report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    } catch (error) {
      skipped.push({
        round,
        reason: `unreadable report: ${error?.message || String(error)}`.slice(
          0,
          200,
        ),
      });
      continue;
    }
    for (const candidate of report.candidates || []) {
      const sample = sampleFromCandidate({
        runId: resolvedRunId,
        round,
        candidate,
      });
      if (sample) samples.push(sample);
      else
        skipped.push({
          round,
          candidateId: candidate?.candidateId || "unknown",
          reason: "missing rendered judge audit",
        });
    }
  }
  return { samples, skipped };
}

/**
 * Summarize samples into per-dimension statistics, major-finding rates, and
 * the hard/open failure split, all compared against the current bars.
 *
 * @param {Array<Record<string, any>>} samples
 * @returns {Record<string, any>}
 */
export function summarizeGateHealth(samples) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : [];
  const dimensionKeys = new Set(["overall"]);
  for (const [key, value] of Object.entries(RENDERED_REFERENCE_THRESHOLDS)) {
    if (typeof value === "number" && key !== "pairwiseDistinctiveness")
      dimensionKeys.add(key);
  }
  for (const sample of list)
    for (const key of Object.keys(sample.scores || {})) dimensionKeys.add(key);

  const perDimension = {};
  for (const key of [...dimensionKeys].sort()) {
    const values =
      key === "overall"
        ? list.map((sample) => Number(sample.overall))
        : list.map((sample) => Number(sample.scores?.[key]));
    const finite = values.filter((value) => Number.isFinite(value));
    const bar =
      key === "overall"
        ? Number(RENDERED_REFERENCE_THRESHOLDS.overall) || null
        : Number(RENDERED_REFERENCE_THRESHOLDS[key]) || null;
    perDimension[key] = {
      bar,
      sampleCount: finite.length,
      min: finite.length ? Math.min(...finite) : null,
      median: median(finite),
      max: finite.length ? Math.max(...finite) : null,
      passCount: bar ? finite.filter((value) => value >= bar).length : 0,
    };
  }

  const majorCounts = list.map((sample) => (sample.majors || []).length);
  const histogram = {};
  for (const count of majorCounts)
    histogram[count] = (histogram[count] || 0) + 1;
  const byCategory = {};
  for (const sample of list)
    for (const major of sample.majors || [])
      byCategory[major.category] = (byCategory[major.category] || 0) + 1;

  const hardFailures = {};
  const openFailures = {};
  for (const sample of list) {
    for (const line of sample.hardFailures || [])
      hardFailures[line.slice(0, 120)] =
        (hardFailures[line.slice(0, 120)] || 0) + 1;
    for (const line of sample.openFailures || [])
      openFailures[line.slice(0, 120)] =
        (openFailures[line.slice(0, 120)] || 0) + 1;
  }

  return {
    version: 1,
    sampleCount: list.length,
    runCount: new Set(list.map((sample) => sample.runId)).size,
    candidateCount: new Set(
      list.map((sample) => `${sample.runId}::${sample.candidateId}`),
    ).size,
    perDimension,
    majors: {
      zeroCount: majorCounts.filter((count) => count === 0).length,
      median: median(majorCounts),
      mean: majorCounts.length
        ? Math.round(
            (majorCounts.reduce((sum, count) => sum + count, 0) /
              majorCounts.length) *
              100,
          ) / 100
        : null,
      max: majorCounts.length ? Math.max(...majorCounts) : null,
      histogram,
      byCategory,
    },
    hardSoft: {
      hardFailureCount: Object.values(hardFailures).reduce(
        (sum, count) => sum + count,
        0,
      ),
      openFailureCount: Object.values(openFailures).reduce(
        (sum, count) => sum + count,
        0,
      ),
      hardFailureClasses: hardFailures,
      openFailureClasses: openFailures,
    },
  };
}
