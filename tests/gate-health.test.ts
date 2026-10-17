import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectEvidenceSamples,
  median,
  quantile,
  sampleFromCandidate,
  summarizeGateHealth,
} from "../scripts/gate-health.mjs";
import { RENDERED_REFERENCE_THRESHOLDS } from "../scripts/rendered-reference-fidelity.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-gate-health-"));
  roots.push(root);
  return root;
}

function candidateReport({
  candidateId = "candidate-a",
  overall = 70,
  scores = {},
  majors = [],
  failures = [],
}: {
  candidateId?: string;
  overall?: number;
  scores?: Record<string, number | string>;
  majors?: string[];
  failures?: string[];
} = {}) {
  return {
    candidateId,
    failures,
    renderedReferenceFidelity: {
      audit: {
        overallScore: overall,
        scores,
        findings: majors.map((severity, index) => ({
          severity,
          category: `category-${index}`,
        })),
      },
    },
  };
}

describe("gate health statistics", () => {
  it("uses nearest-rank quantiles that return observed values", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(quantile(values, 50)).toBe(50);
    expect(quantile(values, 90)).toBe(90);
    expect(quantile(values, 100)).toBe(100);
    expect(quantile(values, 0)).toBe(10);
    expect(quantile([7], 95)).toBe(7);
    expect(quantile([], 50)).toBeNull();
    expect(quantile([1, Number.NaN, 3], 50)).toBe(1);
    expect(median([1, 2, 3, 4])).toBe(2);
  });

  it("builds samples with majors, scores, and the hard/open split", () => {
    const sample = sampleFromCandidate({
      runId: "run-1",
      round: "round-00",
      candidate: candidateReport({
        overall: 77,
        scores: { spatialRhythm: 76, typography: "n/a", imagery: 80 },
        majors: ["major", "minor", "critical"],
        failures: ["desktop: horizontal overflow", "rendered-reference: drift"],
      }),
    });
    expect(sample).toMatchObject({
      runId: "run-1",
      round: "round-00",
      candidateId: "candidate-a",
      overall: 77,
      scores: { spatialRhythm: 76, imagery: 80 },
    });
    expect(sample?.majors).toEqual([
      { category: "category-0", severity: "major" },
      { category: "category-2", severity: "critical" },
    ]);
    expect(sample?.hardFailures).toEqual(["desktop: horizontal overflow"]);
    expect(sample?.openFailures).toEqual(["rendered-reference: drift"]);
  });

  it("returns null when a candidate has no rendered audit", () => {
    expect(
      sampleFromCandidate({
        candidate: { candidateId: "candidate-b", failures: [] },
      }),
    ).toBeNull();
  });
});

describe("collecting samples from evidence", () => {
  async function writeEvidence(root: string) {
    const roundDir = path.join(root, "creative-repair", "round-00");
    await fs.mkdir(roundDir, { recursive: true });
    await fs.writeFile(
      path.join(roundDir, "creative-bakeoff.json"),
      JSON.stringify({
        candidates: [
          candidateReport({ candidateId: "candidate-a", overall: 60 }),
          candidateReport({ candidateId: "candidate-b", overall: 40 }),
          { candidateId: "candidate-c", failures: ["desktop: broken image"] },
        ],
      }),
    );
    await fs.mkdir(path.join(root, "creative-repair", "round-01"), {
      recursive: true,
    });
  }

  it("collects samples and counts skips without dropping evidence silently", async () => {
    const root = await tempRoot();
    await writeEvidence(root);
    const { samples, skipped } = await collectEvidenceSamples(root, {
      runId: "run-x",
    });
    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.candidateId)).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
    expect(skipped).toEqual([
      expect.objectContaining({
        round: "round-00",
        candidateId: "candidate-c",
        reason: "missing rendered judge audit",
      }),
      expect.objectContaining({
        round: "round-01",
        reason: expect.stringContaining("unreadable"),
      }),
    ]);
  });

  it("accepts a creative-repair directory directly", async () => {
    const root = await tempRoot();
    await writeEvidence(root);
    const { samples } = await collectEvidenceSamples(
      path.join(root, "creative-repair"),
    );
    expect(samples).toHaveLength(2);
  });
});

describe("gate health summary", () => {
  it("summarizes distributions, majors, and failure classes against the bars", () => {
    const overalls = [30, 50, 70, 77];
    const samples = overalls.map((overall, index) => ({
      runId: "run-1",
      round: `round-0${index}`,
      candidateId: `candidate-${index}`,
      scores: { spatialRhythm: overall + 1, paletteAdherence: 95 },
      overall,
      majors:
        index === 3
          ? [
              { category: "mobile-recomposition", severity: "major" },
              { category: "service-presentation", severity: "major" },
            ]
          : index === 0
            ? [{ category: "spatial-rhythm", severity: "critical" }]
            : [],
      hardFailures: index === 0 ? ["desktop: horizontal overflow"] : [],
      openFailures: ["rendered-reference: drift"],
    }));
    const health = summarizeGateHealth(samples);
    expect(health.sampleCount).toBe(4);
    expect(health.candidateCount).toBe(4);
    expect(health.perDimension.overall).toMatchObject({
      bar: RENDERED_REFERENCE_THRESHOLDS.overall,
      min: 30,
      median: 50,
      max: 77,
      // overall 30 fails the calibrated 47 bar; 50, 70, and 77 pass it.
      passCount: 3,
    });
    expect(health.perDimension.spatialRhythm).toMatchObject({
      bar: RENDERED_REFERENCE_THRESHOLDS.spatialRhythm,
      max: 78,
    });
    expect(health.perDimension.paletteAdherence.passCount).toBe(4);
    expect(health.majors.zeroCount).toBe(2);
    expect(health.majors.histogram).toEqual({ 0: 2, 1: 1, 2: 1 });
    expect(health.majors.byCategory).toEqual({
      "spatial-rhythm": 1,
      "mobile-recomposition": 1,
      "service-presentation": 1,
    });
    expect(health.hardSoft.hardFailureCount).toBe(1);
    expect(health.hardSoft.openFailureCount).toBe(4);
  });

  it("handles an empty sample set", () => {
    const health = summarizeGateHealth([]);
    expect(health.sampleCount).toBe(0);
    expect(health.perDimension.overall.passCount).toBe(0);
    expect(health.majors.zeroCount).toBe(0);
  });
});
