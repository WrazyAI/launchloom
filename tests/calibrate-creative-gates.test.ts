import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectFromEvidenceDirs,
  deriveCalibration,
  nearMissEligible,
  judgePass,
  scoredDimensionKeys,
  seededRandom,
  shuffle,
  splitByGroup,
} from "../scripts/calibrate-creative-gates.mjs";
import { quantile } from "../scripts/gate-health.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function makeSample(
  runId: string,
  candidateId: string,
  round: number,
  {
    overall,
    score,
    majors = 0,
    hard = false,
  }: { overall: number; score: number; majors?: number; hard?: boolean },
) {
  const scores: Record<string, number> = {};
  for (const dimension of scoredDimensionKeys()) {
    if (dimension !== "overall") scores[dimension] = score;
  }
  return {
    runId,
    candidateId,
    round: `round-0${round}`,
    scores,
    overall,
    majors: Array.from({ length: majors }, (_, index) => ({
      category: `category-${index}`,
      severity: "major",
    })),
    hardFailures: hard ? ["desktop: horizontal overflow"] : [],
    openFailures: [],
  };
}

function syntheticSamples() {
  const samples: Array<Record<string, any>> = [];
  // Four runs with two candidates each and three rounds per candidate, with a
  // spread of overall scores, majors, and occasional hard failures.
  for (let run = 0; run < 4; run += 1) {
    for (const candidate of ["candidate-a", "candidate-b"]) {
      for (let round = 0; round < 3; round += 1) {
        const base =
          40 + run * 8 + round * 4 + (candidate === "candidate-b" ? 6 : 0);
        samples.push(
          makeSample(`run-${run}`, candidate, round, {
            overall: base + 20,
            score: base + 15,
            majors: (run + round) % 3,
            hard: run === 3 && round === 2,
          }),
        );
      }
    }
  }
  return samples;
}

describe("seeded randomness", () => {
  it("is deterministic and shuffles reproducibly", () => {
    const first = seededRandom("seed-a");
    const second = seededRandom("seed-a");
    const third = seededRandom("seed-b");
    const firstValues = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(firstValues);
    expect([third(), third(), third()]).not.toEqual(firstValues);
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(values, seededRandom("x"))).toEqual(
      shuffle(values, seededRandom("x")),
    );
  });
});

describe("group splitting", () => {
  it("keeps every candidate group on one side of the split", () => {
    const samples = syntheticSamples();
    const split = splitByGroup(samples, { seed: "s" });
    expect(split.calibrationGroups.length).toBeGreaterThan(0);
    for (const group of split.calibrationGroups)
      expect(split.holdoutGroups).not.toContain(group);
    const calibrationKeys = new Set(
      split.calibration.map(
        (sample) => `${sample.runId}::${sample.candidateId}`,
      ),
    );
    for (const sample of split.holdout)
      expect(
        calibrationKeys.has(`${sample.runId}::${sample.candidateId}`),
      ).toBe(false);
    expect(split.calibration.length + split.holdout.length).toBe(
      samples.length,
    );
  });
});

describe("calibration derivation", () => {
  it("derives the same choice as an independent search over the same grid", () => {
    const samples = syntheticSamples();
    const { calibration, calibrationGroups } = splitByGroup(samples, {
      seed: "2026-10-16",
    });
    const dimensionKeys = scoredDimensionKeys();
    const minPassRate = 0.05;
    let mirror: any = null;
    let bestEffort: any = null;
    for (let percentile = 70; percentile <= 98; percentile += 1) {
      const perDimension: Record<string, number> = {};
      for (const dimension of dimensionKeys) {
        perDimension[dimension] =
          quantile(
            calibration.map((sample) =>
              dimension === "overall"
                ? sample.overall
                : sample.scores[dimension],
            ),
            percentile,
          ) ?? 0;
      }
      let reached: any = null;
      for (let majorsStrict = 0; majorsStrict <= 3; majorsStrict += 1) {
        const bars = {
          perDimension,
          overall: perDimension.overall,
          majorsStrict,
        };
        const rate =
          calibration.filter((sample) => judgePass(sample, bars)).length /
          calibration.length;
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
      if (reached) mirror = reached;
    }
    mirror = mirror || bestEffort;
    const report = deriveCalibration({ samples, seed: "2026-10-16" });
    expect(report.derived.percentile).toBe(mirror.percentile);
    expect(report.derived.bars.majorsStrict).toBe(mirror.majorsStrict);
    expect(report.derived.bars.perDimension).toEqual(mirror.bars.perDimension);
    expect(report.derived.calibrationJudgePassRate).toBeCloseTo(mirror.rate, 4);
    expect(report.samples.calibrationGroups).toEqual(calibrationGroups);
  });

  it("reports holdout and near-miss rates that reproduce from its own bars", () => {
    const samples = syntheticSamples();
    const report = deriveCalibration({ samples, seed: "2026-10-16" });
    const { calibration, holdout } = splitByGroup(samples, {
      seed: "2026-10-16",
    });
    const bars = report.derived.bars;
    const expectedHoldout =
      holdout.filter((sample) => judgePass(sample, bars)).length /
      holdout.length;
    expect(report.holdout.judgePassRate).toBeCloseTo(expectedHoldout, 4);
    // The chosen margin is minimal: one point tighter misses the target (or
    // the search saturated at the ceiling).
    const nearMiss = report.derived.nearMiss;
    if (!nearMiss.ceilingReached) {
      const runs = new Set(calibration.map((sample) => sample.runId));
      const tighterMisses = new Set(
        calibration
          .filter((sample) =>
            nearMissEligible(sample, {
              bars,
              overallMargin: nearMiss.overallMargin,
              maxDimMisses: nearMiss.maxDimMisses - 1,
              maxShortfall: nearMiss.maxShortfall,
              majors: nearMiss.majors,
            }),
          )
          .map((sample) => sample.runId),
      );
      const tighterMargin = new Set(
        calibration
          .filter((sample) =>
            nearMissEligible(sample, {
              bars,
              overallMargin: nearMiss.overallMargin - 1,
              maxDimMisses: nearMiss.maxDimMisses,
              maxShortfall: nearMiss.maxShortfall,
              majors: nearMiss.majors,
            }),
          )
          .map((sample) => sample.runId),
      );
      expect(tighterMisses.size / runs.size).toBeLessThan(0.8);
      expect(tighterMargin.size / runs.size).toBeLessThan(0.8);
    }
    expect(report.holdout.nearMissRunRate).toBeGreaterThanOrEqual(0);
    expect(report.holdout.nearMissRunRate).toBeLessThanOrEqual(1);
  });

  it("is byte-for-byte deterministic for the same inputs and seed", () => {
    const samples = syntheticSamples();
    const first = deriveCalibration({ samples, seed: "fixed" });
    const second = deriveCalibration({ samples, seed: "fixed" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // A different seed still produces a valid, complete partition.
    const other = deriveCalibration({ samples, seed: "other" });
    expect(other.samples.calibration + other.samples.holdout).toBe(
      first.samples.calibration + first.samples.holdout,
    );
    expect(
      other.samples.calibrationGroups.filter((group: string) =>
        other.samples.holdoutGroups.includes(group),
      ),
    ).toEqual([]);
  });
});

describe("near-miss eligibility", () => {
  const bars = {
    perDimension: { overall: 70, spatialRhythm: 70 },
    overall: 70,
  };
  const config = {
    bars,
    overallMargin: 10,
    maxDimMisses: 2,
    maxShortfall: 20,
    majors: 4,
  };
  it("allows bounded misses and blocks hard failures, deep misses, and excessive majors", () => {
    const clean = makeSample("run", "candidate-a", 0, {
      overall: 60,
      score: 60,
    });
    expect(nearMissEligible(clean, config)).toBe(true);
    const tooLowOverall = makeSample("run", "candidate-a", 0, {
      overall: 59,
      score: 65,
    });
    expect(nearMissEligible(tooLowOverall, config)).toBe(false);
    const tooDeep = makeSample("run", "candidate-a", 0, {
      overall: 65,
      score: 45,
    });
    expect(nearMissEligible(tooDeep, config)).toBe(false);
    const hard = makeSample("run", "candidate-a", 0, {
      overall: 65,
      score: 65,
      hard: true,
    });
    expect(nearMissEligible(hard, config)).toBe(false);
    const manyMajors = makeSample("run", "candidate-a", 0, {
      overall: 65,
      score: 65,
      majors: 5,
    });
    expect(nearMissEligible(manyMajors, config)).toBe(false);
  });
});

describe("evidence collection", () => {
  it("aggregates sources and counted skips across directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-cal-"));
    roots.push(root);
    for (const name of ["run-a", "run-b"]) {
      const roundDir = path.join(root, name, "creative-repair", "round-00");
      await fs.mkdir(roundDir, { recursive: true });
      await fs.writeFile(
        path.join(roundDir, "creative-bakeoff.json"),
        JSON.stringify({
          candidates: [
            {
              candidateId: "candidate-a",
              failures: [],
              renderedReferenceFidelity: {
                audit: {
                  overallScore: 70,
                  scores: { spatialRhythm: 70 },
                  findings: [],
                },
              },
            },
            { candidateId: "candidate-b", failures: [] },
          ],
        }),
      );
    }
    const { samples, skipped, sources } = await collectFromEvidenceDirs([
      path.join(root, "run-a"),
      path.join(root, "run-b"),
    ]);
    expect(sources.sort()).toEqual(["run-a", "run-b"]);
    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.runId).sort()).toEqual([
      "run-a",
      "run-b",
    ]);
    expect(skipped).toHaveLength(2);
    expect(
      skipped.every((entry) => entry.reason === "missing rendered judge audit"),
    ).toBe(true);
  });
});
