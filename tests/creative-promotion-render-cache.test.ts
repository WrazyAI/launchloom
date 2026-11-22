import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";
import {
  cleanupTempRoots,
  makeFixture,
  makeTemplateCopy,
  makeVersionTwoCandidate,
} from "./helpers/creative-promotion-fixtures";

afterEach(cleanupTempRoots);

describe("creative candidate promotion (evidence cache)", () => {
  it("reuses unchanged candidate evidence across bakeoffs and invalidates on input changes", async () => {
    const root = await makeFixture();
    // Render as a version-two candidate so the judge path is exercised too.
    await makeVersionTwoCandidate(root);
    const siteRoot = await makeTemplateCopy();
    let contrastCalls = 0;
    let fidelityCalls = 0;
    const contrastEvaluator = async () => {
      contrastCalls += 1;
      return {
        pass: true,
        repairs: [],
        before: { findings: [] },
        after: { findings: [] },
      };
    };
    const renderedReferenceEvaluator = async () => {
      fidelityCalls += 1;
      return {
        version: 1,
        model: "test/model",
        score: 100,
        pass: true,
        audit: { scores: {}, findings: [] },
      };
    };
    const cacheDir = path.join(root, "evidence-cache");
    const bakeoff = (label: string) =>
      runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, `${label}-report.json`),
        screenshotsDir: path.join(root, `${label}-screenshots`),
        evidenceCacheDir: cacheDir,
        contrastEvaluator,
        renderedReferenceEvaluator,
        renderedDiversityEvaluator: async () => ({
          version: 1,
          model: "test/model",
          score: 92,
          pass: true,
          minimumPairDistance: 90,
          audit: {
            pairs: [],
            genericFallbackDetected: false,
            summary: "single candidate",
          },
        }),
      });

    const first = await bakeoff("first");
    expect(contrastCalls).toBe(1);
    expect(fidelityCalls).toBe(1);
    expect(first.timings.reuse).toEqual({ candidates: 1, reusedRender: 0 });

    // Unchanged inputs reuse both the rendered evidence and the judge call.
    const second = await bakeoff("second");
    expect(contrastCalls).toBe(1);
    expect(fidelityCalls).toBe(1);
    expect(second.timings.reuse).toEqual({ candidates: 1, reusedRender: 1 });
    expect(second.candidates[0].timings.reused).toBe(true);
    // A reused judge must not look like a call made in this round.
    expect(second.candidates[0].timings.judge).toBeUndefined();
    expect(second.candidates[0].timings.judgeCallMs).toBeUndefined();
    expect(second.candidates[0].failures).toEqual(
      first.candidates[0].failures,
    );
    expect(second.candidates[0].eligible).toBe(first.candidates[0].eligible);
    expect(second.candidates[0].renderedReferenceFidelity?.pass).toBe(true);
    // The restored screenshots are available in the new round's directory.
    await fs.access(
      path.join(root, "second-screenshots", "candidate-a-desktop-viewport.png"),
    );

    // A candidate source change invalidates that candidate's cached render.
    await fs.appendFile(
      path.join(root, "candidate-a/styles.css"),
      "\n/* cache-invalidation-probe */\n",
    );
    const third = await bakeoff("third");
    expect(contrastCalls).toBe(2);
    expect(third.timings.reuse.reusedRender).toBe(0);

    // A shared site change invalidates every candidate, not just an edited one.
    await fs.writeFile(
      path.join(siteRoot, "public/cache-invalidation-probe.txt"),
      "probe\n",
    );
    const fourth = await bakeoff("fourth");
    expect(contrastCalls).toBe(3);
    expect(fourth.timings.reuse.reusedRender).toBe(0);
  }, 600_000);

  it("reuses a render whose judge failed and retries the judge instead of caching a failure", async () => {
    const root = await makeFixture();
    await makeVersionTwoCandidate(root);
    const siteRoot = await makeTemplateCopy();
    let contrastCalls = 0;
    let fidelityCalls = 0;
    const contrastEvaluator = async () => {
      contrastCalls += 1;
      return {
        pass: true,
        repairs: [],
        before: { findings: [] },
        after: { findings: [] },
      };
    };
    const failingJudge = async () => {
      fidelityCalls += 1;
      throw new Error("judge transport failed");
    };
    const passingJudge = async () => {
      fidelityCalls += 1;
      return {
        version: 1,
        model: "test/model",
        score: 100,
        pass: true,
        audit: { scores: {}, findings: [] },
        durationMs: 1000,
        attempts: 1,
      };
    };
    const cacheDir = path.join(root, "evidence-cache");
    const bakeoff = (label: string, renderedReferenceEvaluator: any) =>
      runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, `${label}-report.json`),
        screenshotsDir: path.join(root, `${label}-screenshots`),
        evidenceCacheDir: cacheDir,
        contrastEvaluator,
        renderedReferenceEvaluator,
      });

    const first = await bakeoff("first", failingJudge);
    expect(fidelityCalls).toBe(1);
    expect(first.candidates[0].renderedReferenceFidelity).toBeUndefined();

    // The render is reused, but the failed judge is not cached as a pass: the
    // judge runs again for the same inputs.
    const second = await bakeoff("second", passingJudge);
    expect(contrastCalls).toBe(1);
    expect(fidelityCalls).toBe(2);
    expect(second.candidates[0].timings.reused).toBe(true);
    // The retried judge is a real call in this round and records its timing.
    expect(second.candidates[0].timings.judgeCallMs).toBe(1000);
    expect(second.candidates[0].renderedReferenceFidelity?.pass).toBe(true);
  }, 600_000);
});
