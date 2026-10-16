import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTaskLimiter } from "../scripts/task-limiter.mjs";
import {
  collectCandidateEvidenceFileNames,
  computeCandidateEvidenceDigest,
  computeSharedEvidenceDigest,
  CREATIVE_EVIDENCE_CACHE_VERSION,
  evidenceCacheKeys,
  readEvidenceBundle,
  restoreEvidenceFiles,
  writeEvidenceBundle,
} from "../scripts/creative-evidence-cache.mjs";
import { BOUNDED_CORRECTIONS_START, BOUNDED_CORRECTIONS_END } from "../scripts/contrast-sweep.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot(label: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `ll-${label}-`));
  roots.push(root);
  return root;
}

async function write(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

describe("task limiter", () => {
  it("bounds concurrency and preserves completion for all tasks", async () => {
    const schedule = createTaskLimiter(2);
    let active = 0;
    let maxActive = 0;
    const started: number[] = [];
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        schedule(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          started.push(index);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return index * 2;
        }),
      ),
    );
    expect(maxActive).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(results).toEqual([0, 2, 4, 6, 8]);
  });

  it("propagates rejections without blocking the queue", async () => {
    const schedule = createTaskLimiter(1);
    const failed = schedule(async () => {
      throw new Error("judge exploded");
    });
    const ok = schedule(async () => "fine");
    await expect(failed).rejects.toThrow("judge exploded");
    await expect(ok).resolves.toBe("fine");
  });
});

describe("creative evidence cache", () => {
  async function siteFixture() {
    const root = await tempRoot("evidence-site");
    await write(path.join(root, "src/site.config.json"), '{"brand":{"name":"A"}}');
    await write(path.join(root, "src/pages/index.astro"), "<main/>");
    await write(path.join(root, "public/images/hero.svg"), "<svg/>");
    const candidate = path.join(root, ".launchloom/generated-experiences/candidate-a");
    await write(path.join(candidate, "Experience.jsx"), "export default () => null;\n");
    await write(path.join(candidate, "styles.css"), "body{color:#111}\n");
    await write(path.join(candidate, "motion.js"), "export function mountExperienceMotion(){}\n");
    await write(path.join(candidate, "metadata.json"), '{"candidateId":"candidate-a"}');
    // Transient evidence directories exist during a run and must not affect
    // the shared digest (`.launchloom` is skipped wholesale).
    await write(path.join(root, ".launchloom/creative-repair/timing.json"), "{}");
    return { root, candidate };
  }

  it("digests shared inputs deterministically and invalidates on change", async () => {
    const { root } = await siteFixture();
    const first = await computeSharedEvidenceDigest(root);
    const second = await computeSharedEvidenceDigest(root);
    expect(first).toBe(second);
    await write(path.join(root, "src/pages/index.astro"), "<main>changed</main>");
    const changed = await computeSharedEvidenceDigest(root);
    expect(changed).not.toBe(first);
  });

  it("excludes candidate directories from the shared digest", async () => {
    const { root, candidate } = await siteFixture();
    const before = await computeSharedEvidenceDigest(root);
    await write(path.join(candidate, "Experience.jsx"), "export default () => 1;\n");
    const after = await computeSharedEvidenceDigest(root);
    expect(after).toBe(before);
  });

  it("normalizes managed contrast corrections in candidate styles", async () => {
    const { candidate } = await siteFixture();
    const digest = await computeCandidateEvidenceDigest(candidate);
    const stylesPath = path.join(candidate, "styles.css");
    const original = await fs.readFile(stylesPath, "utf8");
    await fs.writeFile(
      stylesPath,
      `${original}\n${BOUNDED_CORRECTIONS_START}\n.x{color:#fff!important}\n${BOUNDED_CORRECTIONS_END}\n`,
    );
    expect(await computeCandidateEvidenceDigest(candidate)).toBe(digest);
    await fs.writeFile(stylesPath, `${original}\n.authored{color:#222}\n`);
    expect(await computeCandidateEvidenceDigest(candidate)).not.toBe(digest);
  });

  it("derives keys that change with candidate, render config, and judge model", () => {
    const base = {
      version: 1,
      candidateId: "candidate-a",
      sharedDigest: "shared",
      candidateDigest: "candidate",
      renderConfig: { viewports: [390] },
      judgeModel: "openai/gpt-6-luna",
    };
    const keys = evidenceCacheKeys(base);
    expect(evidenceCacheKeys(base)).toEqual(keys);
    expect(
      evidenceCacheKeys({ ...base, candidateId: "candidate-b" }).renderKey,
    ).not.toBe(keys.renderKey);
    expect(
      evidenceCacheKeys({ ...base, renderConfig: { viewports: [390, 1536] } })
        .renderKey,
    ).not.toBe(keys.renderKey);
    const otherJudge = evidenceCacheKeys({ ...base, judgeModel: "other" });
    expect(otherJudge.renderKey).toBe(keys.renderKey);
    expect(otherJudge.judgeKey).not.toBe(keys.judgeKey);
  });

  it("round-trips a bundle, rewrites evidence paths, and restores files", async () => {
    const cacheRoot = await tempRoot("evidence-cache");
    const evidenceDir = await tempRoot("evidence-round0");
    const candidateId = "candidate-a";
    await fs.writeFile(
      path.join(evidenceDir, `${candidateId}-desktop-viewport.png`),
      "png-bytes",
    );
    await fs.writeFile(
      path.join(evidenceDir, `${candidateId}-contrast.json`),
      JSON.stringify({ pass: true, repairs: [] }),
    );
    await fs.writeFile(
      path.join(evidenceDir, "candidate-b-desktop-viewport.png"),
      "other-candidate",
    );
    const files = await collectCandidateEvidenceFileNames(evidenceDir, candidateId);
    expect(files).toEqual([
      `${candidateId}-contrast.json`,
      `${candidateId}-desktop-viewport.png`,
    ]);
    const keys = evidenceCacheKeys({
      version: CREATIVE_EVIDENCE_CACHE_VERSION,
      candidateId,
      sharedDigest: "shared",
      candidateDigest: "candidate",
      renderConfig: { v: 1 },
      judgeModel: "openai/gpt-6-luna",
    });
    const renderCandidateResult = {
      candidateId,
      failures: [],
      // Interaction pairs carry absolute evidence paths; the bundle must
      // rewrite them into whichever round directory restores the evidence.
      interactionEvidence: {
        pairs: [
          {
            before: path.join(
              evidenceDir,
              `${candidateId}-desktop-interaction-before.png`,
            ),
          },
        ],
      },
    };
    const wrote = await writeEvidenceBundle(cacheRoot, keys, {
      evidenceDir,
      files,
      renderCandidateResult,
      judgeResult: { pass: true, score: 91 },
    });
    expect(wrote).toBe(true);

    const newEvidenceDir = await tempRoot("evidence-round1");
    const bundle = await readEvidenceBundle(cacheRoot, keys, {
      evidenceDir: newEvidenceDir,
    });
    expect(bundle).toBeTruthy();
    expect(bundle?.render.candidateResult).toMatchObject({ candidateId, failures: [] });
    expect(
      bundle?.render.candidateResult.interactionEvidence.pairs[0].before,
    ).toBe(
      path.join(newEvidenceDir, `${candidateId}-desktop-interaction-before.png`),
    );
    expect(bundle?.judge?.renderedReferenceFidelity).toEqual({
      pass: true,
      score: 91,
    });
    const restored = await restoreEvidenceFiles(cacheRoot, keys, newEvidenceDir);
    expect(restored).toEqual(files);
    expect(
      await fs.readFile(
        path.join(newEvidenceDir, `${candidateId}-desktop-viewport.png`),
        "utf8",
      ),
    ).toBe("png-bytes");
  });

  it("rejects incomplete bundles and missing files", async () => {
    const cacheRoot = await tempRoot("evidence-cache-missing");
    const evidenceDir = await tempRoot("evidence-round2");
    const keys = evidenceCacheKeys({
      version: CREATIVE_EVIDENCE_CACHE_VERSION,
      candidateId: "candidate-a",
      sharedDigest: "shared",
      candidateDigest: "candidate",
      renderConfig: {},
      judgeModel: "m",
    });
    expect(
      await readEvidenceBundle(cacheRoot, keys, { evidenceDir }),
    ).toBeNull();
    // A bundle whose recorded file was deleted must not be reused.
    await fs.writeFile(path.join(evidenceDir, "candidate-a-x.png"), "x");
    await writeEvidenceBundle(cacheRoot, keys, {
      evidenceDir,
      files: ["candidate-a-x.png"],
      renderCandidateResult: { candidateId: "candidate-a" },
    });
    await fs.rm(
      path.join(cacheRoot, keys.renderKey, "files", "candidate-a-x.png"),
    );
    expect(
      await readEvidenceBundle(cacheRoot, keys, { evidenceDir }),
    ).toBeNull();
  });
});
