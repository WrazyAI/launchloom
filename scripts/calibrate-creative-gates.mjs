/**
 * Creative gate calibration harness.
 *
 * Collects rendered-judge samples from stored QA evidence (and, optionally,
 * fresh candidates), splits them by candidate group into a calibration and a
 * holdout partition, derives discriminating score bars at a requested pass
 * rate, and verifies the derived bars and near-miss margins on the holdout.
 *
 * The output is a committed report artifact. It never edits thresholds: a bar
 * change is a separate, reviewed step that cites the report.
 *
 * Determinism: the same inputs, seed, and options produce the same report
 * byte-for-byte. No wall-clock fields are emitted.
 *
 * Usage:
 *   node scripts/calibrate-creative-gates.mjs \
 *     --evidence <launchloom-or-repair-dir> [--evidence ...] \
 *     [--seed 2026-10-16] [--min-pass-rate 0.05] \
 *     [--near-miss-target 0.8] [--out docs/calibration/<file>.json] [--json]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RENDERED_REFERENCE_THRESHOLDS } from "./rendered-reference-fidelity.mjs";
import { collectEvidenceSamples, quantile } from "./gate-health.mjs";

export const CALIBRATION_VERSION = 1;

/**
 * Deterministic PRNG (mulberry32) seeded from a string.
 * @param {string} seed
 * @returns {() => number}
 */
export function seededRandom(seed) {
  let hash = 2166136261;
  for (let index = 0; index < String(seed).length; index += 1) {
    hash ^= String(seed).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by a seeded random source.
 * @template T
 * @param {T[]} values
 * @param {() => number} random
 * @returns {T[]}
 */
export function shuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** @param {Record<string, any>} sample */
export function sampleGroupKey(sample) {
  return `${sample.runId ?? "unknown"}::${sample.candidateId ?? "unknown"}`;
}

/**
 * Split samples by candidate group so no candidate (and therefore no
 * correlated round of the same candidate) crosses the partition boundary.
 *
 * @param {Array<Record<string, any>>} samples
 * @param {{seed?: string, calibrationShare?: number}} [options]
 * @returns {{calibration: Array<Record<string, any>>, holdout: Array<Record<string, any>>, calibrationGroups: string[], holdoutGroups: string[]}}
 */
export function splitByGroup(
  samples,
  { seed = "2026-10-16", calibrationShare = 0.7 } = {},
) {
  const groups = new Map();
  for (const sample of samples) {
    const key = sampleGroupKey(sample);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  // Stratify by run: split each run's candidate groups independently so both
  // partitions contain every run, then order deterministically.
  const byRun = new Map();
  for (const key of [...groups.keys()].sort()) {
    const runId = key.split("::")[0];
    if (!byRun.has(runId)) byRun.set(runId, []);
    byRun.get(runId).push(key);
  }
  const calibrationGroups = [];
  const holdoutGroups = [];
  for (const runId of [...byRun.keys()].sort()) {
    const keys = shuffle(
      byRun.get(runId),
      seededRandom(`split::${seed}::${runId}`),
    );
    const take = Math.max(1, Math.round(keys.length * calibrationShare));
    calibrationGroups.push(
      ...keys.slice(0, Math.min(take, Math.max(1, keys.length - 1))),
    );
    holdoutGroups.push(
      ...keys.slice(Math.min(take, Math.max(1, keys.length - 1))),
    );
  }
  calibrationGroups.sort();
  holdoutGroups.sort();
  // When a run has a single group it stays in calibration; holdout may be
  // empty for very small sample sets and the caller reports that honestly.
  const calibration = calibrationGroups.flatMap((key) => groups.get(key) || []);
  const holdout = holdoutGroups.flatMap((key) => groups.get(key) || []);
  return { calibration, holdout, calibrationGroups, holdoutGroups };
}

/** Dimension keys that participate in the judged conjunction. */
export function scoredDimensionKeys() {
  const keys = new Set(["overall"]);
  for (const [key, value] of Object.entries(RENDERED_REFERENCE_THRESHOLDS)) {
    if (typeof value === "number" && key !== "pairwiseDistinctiveness")
      keys.add(key);
  }
  return [...keys].sort();
}

/** @param {Record<string, any>} sample @param {string} key */
function scoreValue(sample, key) {
  return key === "overall"
    ? Number(sample.overall)
    : Number(sample.scores?.[key]);
}

/**
 * Judge-conjunction pass for one sample against derived bars.
 * @param {Record<string, any>} sample
 * @param {{perDimension: Record<string, number>, overall: number, majorsStrict: number}} bars
 */
export function judgePass(sample, bars) {
  if ((sample.majors || []).length > bars.majorsStrict) return false;
  if (Number(sample.overall) < bars.overall) return false;
  for (const [dimension, bar] of Object.entries(bars.perDimension)) {
    if (scoreValue(sample, dimension) < bar) return false;
  }
  return true;
}

/**
 * Near-miss eligibility: hard gates clean, majors within the relaxed bound,
 * the overall score within the overall margin, and only a bounded number of
 * dimensions below their bars (each not further than the shortfall ceiling).
 *
 * A margin applied to every dimension at once is itself a twelve-way
 * conjunction and the measured data never satisfies it; draws miss a few
 * dimensions rather than all of them equally, so the policy bounds the count
 * and the depth instead.
 *
 * @param {Record<string, any>} sample
 * @param {{bars: {perDimension: Record<string, number>, overall: number}, overallMargin: number, maxDimMisses: number, maxShortfall: number, majors: number}} options
 */
export function nearMissEligible(
  sample,
  { bars, overallMargin, maxDimMisses, maxShortfall, majors },
) {
  if ((sample.hardFailures || []).length > 0) return false;
  if ((sample.majors || []).length > majors) return false;
  if (Number(sample.overall) < bars.overall - overallMargin) return false;
  let misses = 0;
  for (const [dimension, bar] of Object.entries(bars.perDimension)) {
    const value = scoreValue(sample, dimension);
    if (value >= bar) continue;
    if (value < bar - maxShortfall) return false;
    misses += 1;
    if (misses > maxDimMisses) return false;
  }
  return true;
}

/** @param {Array<Record<string, any>>} samples @param {(sample: Record<string, any>) => boolean} predicate */
function shareMatching(samples, predicate) {
  if (!samples.length) return 0;
  return (
    Math.round((samples.filter(predicate).length / samples.length) * 10000) /
    10000
  );
}

/** @param {Array<Record<string, any>>} samples */
function runIdsWith(samples, predicate) {
  const runs = new Set();
  for (const sample of samples) if (predicate(sample)) runs.add(sample.runId);
  return runs;
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

/**
 * Derive bars and near-miss margins from the calibration split and verify them
 * on the holdout split.
 *
 * @param {{
 *   samples: Array<Record<string, any>>,
 *   skipped?: Array<Record<string, any>>,
 *   sources?: string[],
 *   seed?: string,
 *   minPassRate?: number,
 *   nearMissTarget?: number,
 *   calibrationShare?: number,
 * }} input
 * @returns {Record<string, any>}
 */
export function deriveCalibration({
  samples,
  skipped = [],
  sources = [],
  seed = "2026-10-16",
  minPassRate = 0.05,
  nearMissTarget = 0.8,
  calibrationShare = 0.7,
}) {
  const { calibration, holdout, calibrationGroups, holdoutGroups } =
    splitByGroup(samples, { seed, calibrationShare });
  const dimensionKeys = scoredDimensionKeys();

  // Policy (measured, decided after the first real run): bars are the highest
  // percentile at which a minimum pass-rate floor is still met, with the
  // smallest strict-majors allowance that reaches the floor. Targeting a fixed
  // 15% pass rate instead pushed the bars down to the distribution median,
  // which would be a quality giveaway; the floor keeps the bars at the top of
  // the observed range and reports the honest pass rate. The full rate curve
  // is reported so any later target change is informed by data.
  const rateCurve = [];
  let chosen = null;
  let bestEffort = null;
  for (let percentile = 70; percentile <= 98; percentile += 1) {
    const perDimension = {};
    for (const dimension of dimensionKeys) {
      const value = quantile(
        calibration.map((sample) => scoreValue(sample, dimension)),
        percentile,
      );
      perDimension[dimension] = value ?? 0;
    }
    const overall = perDimension.overall ?? 0;
    let reached = null;
    for (let majorsStrict = 0; majorsStrict <= 3; majorsStrict += 1) {
      const bars = { perDimension, overall, majorsStrict };
      const rate = shareMatching(calibration, (sample) =>
        judgePass(sample, bars),
      );
      rateCurve.push({ percentile, majorsStrict, rate });
      const candidate = { percentile, majorsStrict, bars, rate };
      if (
        !bestEffort ||
        rate > bestEffort.rate + 1e-9 ||
        (Math.abs(rate - bestEffort.rate) <= 1e-9 &&
          (majorsStrict < bestEffort.majorsStrict ||
            (majorsStrict === bestEffort.majorsStrict &&
              percentile > bestEffort.percentile)))
      )
        bestEffort = candidate;
      if (!reached && rate >= minPassRate) reached = candidate;
    }
    if (reached) chosen = reached;
  }
  const resolved = /** @type {NonNullable<typeof chosen>} */ (
    chosen || bestEffort
  );
  const bars = resolved.bars;

  // Near-miss configuration: the most conservative (maxDimMisses,
  // overallMargin) pair at which the requested share of runs has at least one
  // near-miss-eligible draw on the calibration split. Draws bypass individual
  // dimensions by small amounts; the search finds the tightest bounds that
  // still let the observed good draws through.
  const NEAR_MISS_SHORTFALL_CEILING = 15;
  const NEAR_MISS_MISSES_CEILING = 6;
  const NEAR_MISS_MARGIN_CEILING = 20;
  const nearMissMajors = Math.max(
    0,
    Math.min(
      8,
      Number(
        quantile(
          calibration.map((sample) => (sample.majors || []).length),
          90,
        ),
      ) || 0,
    ),
  );
  const calibrationRuns = [
    ...new Set(calibration.map((sample) => sample.runId)),
  ];
  let nearMissConfig = {
    overallMargin: NEAR_MISS_MARGIN_CEILING,
    maxDimMisses: NEAR_MISS_MISSES_CEILING,
    maxShortfall: NEAR_MISS_SHORTFALL_CEILING,
  };
  let marginRate = 0;
  let nearMissCeilingReached = true;
  outer: for (let misses = 0; misses <= NEAR_MISS_MISSES_CEILING; misses += 1) {
    for (
      let overallMargin = 0;
      overallMargin <= NEAR_MISS_MARGIN_CEILING;
      overallMargin += 1
    ) {
      const runs = runIdsWith(calibration, (sample) =>
        nearMissEligible(sample, {
          bars,
          overallMargin,
          maxDimMisses: misses,
          maxShortfall: NEAR_MISS_SHORTFALL_CEILING,
          majors: nearMissMajors,
        }),
      );
      const rate = calibrationRuns.length
        ? runs.size / calibrationRuns.length
        : 0;
      if (rate >= nearMissTarget) {
        nearMissConfig = {
          overallMargin,
          maxDimMisses: misses,
          maxShortfall: NEAR_MISS_SHORTFALL_CEILING,
        };
        marginRate = round4(rate);
        nearMissCeilingReached = false;
        break outer;
      }
      marginRate = round4(rate);
    }
  }

  const distribution = {};
  for (const dimension of dimensionKeys) {
    const values = samples
      .map((sample) => scoreValue(sample, dimension))
      .filter((value) => Number.isFinite(value));
    distribution[dimension] = {
      min: values.length ? Math.min(...values) : null,
      p50: quantile(values, 50),
      p75: quantile(values, 75),
      p90: quantile(values, 90),
      max: values.length ? Math.max(...values) : null,
      currentBar: Number(RENDERED_REFERENCE_THRESHOLDS[dimension]) || null,
      sampleCount: values.length,
    };
  }

  // Decision support: the measured per-dimension conjunction fails at every
  // bar height, so the report also evaluates scalar-overall gate shapes with
  // optional absolute dimension floors against the same samples.
  const allRuns = [...new Set(samples.map((sample) => sample.runId))];
  const dimensionOnlyKeys = dimensionKeys.filter((key) => key !== "overall");
  const alternatives = {};
  const shapes = {
    overallOnly_p90: { overallPercentile: 90, majors: 0, floor: null },
    overallOnly_p90_majors1: { overallPercentile: 90, majors: 1, floor: null },
    overallOnly_p95_majors1: { overallPercentile: 95, majors: 1, floor: null },
    floor40_p90_majors1: { overallPercentile: 90, majors: 1, floor: 40 },
    floor50_p90_majors1: { overallPercentile: 90, majors: 1, floor: 50 },
  };
  for (const [name, shape] of Object.entries(shapes)) {
    const overallBar = quantile(
      samples.map((sample) => Number(sample.overall)),
      shape.overallPercentile,
    );
    const passes = (sample) => {
      if ((sample.hardFailures || []).length > 0) return false;
      if ((sample.majors || []).length > shape.majors) return false;
      if (Number(sample.overall) < (overallBar ?? 0)) return false;
      if (shape.floor != null) {
        for (const dimension of dimensionOnlyKeys)
          if (scoreValue(sample, dimension) < shape.floor) return false;
      }
      return true;
    };
    alternatives[name] = {
      overallBar,
      majors: shape.majors,
      floor: shape.floor,
      sampleRate: shareMatching(samples, passes),
      runRate: allRuns.length
        ? round4(runIdsWith(samples, passes).size / allRuns.length)
        : 0,
    };
  }

  const holdoutRuns = [...new Set(holdout.map((sample) => sample.runId))];
  const familyBreakdown = {};
  for (const family of new Set(
    holdout.map((sample) => sample.familyId || "unknown"),
  )) {
    const familySamples = holdout.filter(
      (sample) => (sample.familyId || "unknown") === family,
    );
    familyBreakdown[family] = {
      samples: familySamples.length,
      judgePassRate: shareMatching(familySamples, (sample) =>
        judgePass(sample, bars),
      ),
      nearMissRate: shareMatching(familySamples, (sample) =>
        nearMissEligible(sample, {
          bars,
          ...nearMissConfig,
          majors: nearMissMajors,
        }),
      ),
    };
  }

  return {
    version: CALIBRATION_VERSION,
    seed,
    targets: { minPassRate, nearMiss: nearMissTarget },
    sources: [...sources].sort(),
    samples: {
      total: samples.length,
      skipped: skipped.length,
      calibration: calibration.length,
      holdout: holdout.length,
      calibrationGroups,
      holdoutGroups,
      runs: [...new Set(samples.map((sample) => sample.runId))].sort(),
    },
    derived: {
      percentile: resolved.percentile,
      bars,
      floorMet: Boolean(chosen),
      calibrationJudgePassRate: round4(resolved.rate),
      calibrationDeliverableStrictRate: shareMatching(
        calibration,
        (sample) =>
          judgePass(sample, bars) && (sample.hardFailures || []).length === 0,
      ),
      nearMiss: {
        ...nearMissConfig,
        majors: nearMissMajors,
        calibrationRunRate: marginRate,
        ceilingReached: nearMissCeilingReached,
      },
    },
    holdout: {
      judgePassRate: shareMatching(holdout, (sample) =>
        judgePass(sample, bars),
      ),
      deliverableStrictRate: shareMatching(
        holdout,
        (sample) =>
          judgePass(sample, bars) && (sample.hardFailures || []).length === 0,
      ),
      nearMissSampleRate: shareMatching(holdout, (sample) =>
        nearMissEligible(sample, {
          bars,
          ...nearMissConfig,
          majors: nearMissMajors,
        }),
      ),
      nearMissRunRate: holdoutRuns.length
        ? round4(
            runIdsWith(holdout, (sample) =>
              nearMissEligible(sample, {
                bars,
                ...nearMissConfig,
                majors: nearMissMajors,
              }),
            ).size / holdoutRuns.length,
          )
        : 0,
      families: familyBreakdown,
    },
    fullSet: {
      judgePassRate: shareMatching(samples, (sample) =>
        judgePass(sample, bars),
      ),
      nearMissRunRate: (() => {
        const runs = [...new Set(samples.map((sample) => sample.runId))];
        return runs.length
          ? round4(
              runIdsWith(samples, (sample) =>
                nearMissEligible(sample, {
                  bars,
                  ...nearMissConfig,
                  majors: nearMissMajors,
                }),
              ).size / runs.length,
            )
          : 0;
      })(),
      hardCleanSamples: samples.filter(
        (sample) => (sample.hardFailures || []).length === 0,
      ).length,
      zeroMajorSamples: samples.filter(
        (sample) => (sample.majors || []).length === 0,
      ).length,
    },
    distribution,
    rateCurve,
    alternatives,
    skippedDetail: skipped.slice(0, 50),
  };
}

/**
 * Collect samples from several evidence directories. Each directory's runId is
 * its own name, or the parent directory name when the path points at a
 * `.launchloom` (or `creative-repair`) evidence container.
 * @param {string[]} evidenceDirs
 * @returns {Promise<{samples: Array<Record<string, any>>, skipped: Array<Record<string, any>>, sources: string[]}>}
 */
export async function collectFromEvidenceDirs(evidenceDirs) {
  const samples = [];
  const skipped = [];
  const sources = [];
  for (const dir of evidenceDirs) {
    const resolved = path.resolve(dir);
    let runId = path.basename(resolved);
    if ([".launchloom", "creative-repair"].includes(runId))
      runId = path.basename(path.dirname(resolved));
    const collected = await collectEvidenceSamples(resolved, { runId });
    samples.push(...collected.samples);
    skipped.push(
      ...collected.skipped.map((entry) => ({ ...entry, source: runId })),
    );
    sources.push(runId);
  }
  return { samples, skipped, sources };
}

function humanSummary(report) {
  const lines = [];
  lines.push(
    `calibration samples: ${report.samples.total} (${report.samples.runs.length} runs, ${report.samples.skipped} skipped)`,
  );
  lines.push(
    `derived percentile p${report.derived.percentile}, majors<=${report.derived.bars.majorsStrict}, floor met: ${report.derived.floorMet}`,
  );
  lines.push("derived bars vs current:");
  for (const [dimension, bar] of Object.entries(
    report.derived.bars.perDimension,
  )) {
    const current = report.distribution[dimension]?.currentBar;
    lines.push(
      `  ${dimension.padEnd(22)} ${String(bar).padStart(3)} (current ${current ?? "-"}, max ${report.distribution[dimension]?.max ?? "-"})`,
    );
  }
  const strictCurve = (report.rateCurve || []).filter(
    (point) => point.majorsStrict === 0,
  );
  const curveHighlights = [80, 85, 88, 90, 92, 95]
    .map((p) => {
      const point = strictCurve.find((entry) => entry.percentile === p);
      return point ? `p${p}=${point.rate}` : null;
    })
    .filter(Boolean)
    .join(" ");
  if (curveHighlights)
    lines.push(`strict pass rate curve (majors<=0): ${curveHighlights}`);
  lines.push(
    `near-miss: overallMargin ${report.derived.nearMiss.overallMargin}, maxDimMisses ${report.derived.nearMiss.maxDimMisses}, maxShortfall ${report.derived.nearMiss.maxShortfall}, majors<=${report.derived.nearMiss.majors}, calibration run rate ${report.derived.nearMiss.calibrationRunRate}${report.derived.nearMiss.ceilingReached ? " (ceiling reached)" : ""}`,
  );
  lines.push(
    `holdout: judge pass ${report.holdout.judgePassRate}, deliverable strict ${report.holdout.deliverableStrictRate}, near-miss run rate ${report.holdout.nearMissRunRate}`,
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { evidence: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--evidence") args.evidence.push(argv[++index]);
    else if (value === "--seed") args.seed = argv[++index];
    else if (value === "--min-pass-rate")
      args.minPassRate = Number(argv[++index]);
    else if (value === "--near-miss-target")
      args.nearMissTarget = Number(argv[++index]);
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--json") args.json = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.evidence.length) {
    console.error(
      "Usage: node scripts/calibrate-creative-gates.mjs --evidence <dir> [--evidence ...] [--out <file>] [--json]",
    );
    process.exitCode = 1;
    return;
  }
  const { samples, skipped, sources } = await collectFromEvidenceDirs(
    args.evidence,
  );
  if (!samples.length) {
    console.error(
      "No judged samples found in the provided evidence directories.",
    );
    process.exitCode = 1;
    return;
  }
  const report = deriveCalibration({
    samples,
    skipped,
    sources,
    seed: args.seed ?? "2026-10-16",
    minPassRate: Number.isFinite(args.minPassRate)
      ? Number(args.minPassRate)
      : 0.05,
    nearMissTarget: Number.isFinite(args.nearMissTarget)
      ? Number(args.nearMissTarget)
      : 0.8,
  });
  if (args.out) {
    await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
    await fs.writeFile(
      path.resolve(args.out),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(humanSummary(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
