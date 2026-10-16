/**
 * Exact-input rendered-evidence cache for the creative bakeoff.
 *
 * The repair loop re-renders and re-judges every candidate on every round,
 * even when only one candidate changed. This module stores a candidate's
 * rendered evidence (screenshots plus the serializable bakeoff result) and its
 * judge result under a digest of every input that can change the rendered
 * artifact. A round can then reuse that evidence instead of rebuilding,
 * re-capturing, and re-judging an unchanged candidate.
 *
 * Correctness rules:
 *   - The render key covers the candidate sources, the shared site inputs that
 *     affect rendering, the render settings, and the cache version. Any change
 *     invalidates every affected candidate, not just the edited one.
 *   - The judge key additionally covers the judge model and judge-evidence
 *     version, so a judge configuration change re-judges even when pixels are
 *     identical.
 *   - Evidence is only written when the render completed and every recorded
 *     file exists; incomplete captures and failed evaluations are never
 *     cached as passes.
 *   - Managed contrast-correction blocks are stripped before hashing candidate
 *     styles: they are a deterministic function of the audited render, so the
 *     on-disk file changes while the rendered artifact does not.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stripBoundedCorrections } from "./contrast-sweep.mjs";

export const CREATIVE_EVIDENCE_CACHE_VERSION = 1;
export const CREATIVE_EVIDENCE_JUDGE_VERSION = 1;

/** Placeholder used so cached evidence can be restored into any directory. */
const EVIDENCE_DIR_PLACEHOLDER = "{{LAUNCHLOOM_EVIDENCE_DIR}}";

const DEFAULT_SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  ".launchloom",
]);

function sha256Parts(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(part));
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

function isExcludedPath(resolved, excluded) {
  for (const candidate of excluded) {
    if (!candidate) continue;
    const prefix = path.resolve(candidate);
    if (resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`))
      return true;
  }
  return false;
}

/**
 * Walk a directory tree bottom-up, returning sorted relative file paths.
 * Symbolic links are treated as leaves and skipped so shared dependency
 * checkouts are never followed or hashed.
 */
async function walkFiles(root, options = {}) {
  const { excludePaths = [], skipNames = new Set() } = options;
  const files = [];
  const walk = async (directory, relative) => {
    const resolved = path.resolve(directory);
    if (isExcludedPath(resolved, excludePaths)) return;
    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (DEFAULT_SKIPPED_DIRECTORIES.has(entry.name)) continue;
        if (skipNames.has(entry.name)) continue;
        await walk(path.join(directory, entry.name), childRelative);
      } else if (entry.isFile()) {
        files.push(childRelative);
      }
    }
  };
  await walk(root, "");
  return files.sort();
}

/**
 * Digest of the shared site inputs that affect how any candidate renders:
 * page sources, layout, styles, assets, configuration, and the build inputs.
 * `.launchloom` (candidates, evidence, reports) and build outputs are excluded.
 *
 * @param {string} root site root
 * @param {{excludePaths?: string[]}} [options]
 */
export async function computeSharedEvidenceDigest(
  root,
  { excludePaths = [] } = {},
) {
  const resolvedRoot = path.resolve(root);
  const files = await walkFiles(resolvedRoot, { excludePaths });
  const hash = createHash("sha256");
  hash.update(`shared-v${CREATIVE_EVIDENCE_CACHE_VERSION}\u0000`);
  for (const relative of files) {
    const content = await fs
      .readFile(path.join(resolvedRoot, relative))
      .catch(() => null);
    if (content === null) continue;
    hash.update(relative);
    hash.update("\u0000");
    hash.update(content);
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

/**
 * Digest of one candidate directory. Managed contrast-correction blocks are
 * stripped from styles.css so a persisted auto-repair does not invalidate the
 * evidence it was derived from.
 *
 * @param {string} candidateDir
 */
export async function computeCandidateEvidenceDigest(candidateDir) {
  const resolved = path.resolve(candidateDir);
  const files = await walkFiles(resolved);
  const hash = createHash("sha256");
  hash.update(`candidate-v${CREATIVE_EVIDENCE_CACHE_VERSION}\u0000`);
  for (const relative of files) {
    if (
      relative.startsWith(".rendered-repair-stage-") ||
      relative.startsWith(".rendered-repair-backup-")
    )
      continue;
    let content = await fs
      .readFile(path.join(resolved, relative))
      .catch(() => null);
    if (content === null) continue;
    if (relative === "styles.css")
      content = Buffer.from(stripBoundedCorrections(content.toString("utf8")));
    hash.update(relative);
    hash.update("\u0000");
    hash.update(content);
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

/**
 * Derive the render and judge cache keys for one candidate evaluation.
 *
 * @param {{version: number, candidateId: string, sharedDigest: string, candidateDigest: string, renderConfig: Record<string, any>, judgeModel: string}} input
 * @returns {{renderKey: string, judgeKey: string}}
 */
export function evidenceCacheKeys({
  version,
  candidateId,
  sharedDigest,
  candidateDigest,
  renderConfig,
  judgeModel,
}) {
  const renderKey = sha256Parts([
    "render",
    version,
    candidateId,
    sharedDigest,
    candidateDigest,
    JSON.stringify(renderConfig),
  ]);
  const judgeKey = sha256Parts([
    "judge",
    CREATIVE_EVIDENCE_JUDGE_VERSION,
    renderKey,
    String(judgeModel || ""),
  ]);
  return { renderKey, judgeKey };
}

function serializeWithPlaceholder(value, evidenceDir) {
  const text = JSON.stringify(value, null, 2);
  if (!evidenceDir) return text;
  return text.split(path.resolve(evidenceDir)).join(EVIDENCE_DIR_PLACEHOLDER);
}

function deserializeFromPlaceholder(text, evidenceDir) {
  if (!evidenceDir) return JSON.parse(text);
  return JSON.parse(
    text.split(EVIDENCE_DIR_PLACEHOLDER).join(path.resolve(evidenceDir)),
  );
}

/** List the evidence files owned by one candidate in an evidence directory. */
export async function collectCandidateEvidenceFileNames(
  evidenceDir,
  candidateId,
) {
  const entries = await fs
    .readdir(path.resolve(evidenceDir), { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith(`${candidateId}-`),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Read a cached evidence bundle, validating version, structure, and file
 * presence. Returns null when anything is missing: incomplete evidence must
 * never be reused.
 *
 * @param {string} cacheRoot
 * @param {{renderKey: string, judgeKey: string}} keys
 * @param {{evidenceDir?: string}} [options] target directory for path rewrite
 */
export async function readEvidenceBundle(
  cacheRoot,
  keys,
  { evidenceDir } = {},
) {
  const root = path.resolve(cacheRoot);
  const entryDir = path.join(root, keys.renderKey);
  const renderText = await fs
    .readFile(path.join(entryDir, "render.json"), "utf8")
    .catch(() => null);
  if (!renderText) return null;
  let render;
  try {
    render = deserializeFromPlaceholder(renderText, evidenceDir);
  } catch {
    return null;
  }
  if (
    !render ||
    render.version !== CREATIVE_EVIDENCE_CACHE_VERSION ||
    !render.candidateResult ||
    !Array.isArray(render.files) ||
    !render.files.length
  )
    return null;
  for (const name of render.files) {
    const present = await fs
      .access(path.join(entryDir, "files", name))
      .then(() => true)
      .catch(() => false);
    if (!present) return null;
  }
  let judge = null;
  const judgeText = await fs
    .readFile(path.join(entryDir, `judge-${keys.judgeKey}.json`), "utf8")
    .catch(() => null);
  if (judgeText) {
    try {
      const parsed = JSON.parse(judgeText);
      if (
        parsed?.version === CREATIVE_EVIDENCE_CACHE_VERSION &&
        parsed.renderedReferenceFidelity
      )
        judge = parsed;
    } catch {
      judge = null;
    }
  }
  return { render, judge };
}

/**
 * Copy a cached bundle's files into the target evidence directory.
 */
export async function restoreEvidenceFiles(cacheRoot, keys, evidenceDir) {
  const entryDir = path.join(path.resolve(cacheRoot), keys.renderKey);
  const names = await fs.readdir(path.join(entryDir, "files")).catch(() => []);
  await fs.mkdir(path.resolve(evidenceDir), { recursive: true });
  const restored = [];
  for (const name of names) {
    await fs.copyFile(
      path.join(entryDir, "files", name),
      path.join(path.resolve(evidenceDir), name),
    );
    restored.push(name);
  }
  return restored.sort();
}

/**
 * Persist a candidate's rendered evidence and (optionally) its judge result.
 * Writes into a temporary directory and renames into place so a crashed write
 * is never read back as valid evidence.
 *
 * @param {string} cacheRoot
 * @param {{renderKey: string, judgeKey: string}} keys
 * @param {{evidenceDir: string, files: string[], renderCandidateResult: Record<string, any>, judgeResult?: Record<string, any> | null}} options
 */
export async function writeEvidenceBundle(
  cacheRoot,
  keys,
  { evidenceDir, files, renderCandidateResult, judgeResult = null },
) {
  const root = path.resolve(cacheRoot);
  await fs.mkdir(root, { recursive: true });
  const existing = await fs
    .access(path.join(root, keys.renderKey, "render.json"))
    .then(() => true)
    .catch(() => false);
  // A cache hit never needs a rewrite; the first fresh render carries the
  // authoritative evidence for this key.
  if (existing) return false;
  const names = [...files].sort();
  const stage = path.join(
    root,
    `.tmp-${keys.renderKey}-${process.pid}-${Date.now()}`,
  );
  await fs.mkdir(path.join(stage, "files"), { recursive: true });
  try {
    for (const name of names) {
      await fs.copyFile(
        path.join(path.resolve(evidenceDir), name),
        path.join(stage, "files", name),
      );
    }
    await fs.writeFile(
      path.join(stage, "render.json"),
      `${serializeWithPlaceholder(
        {
          version: CREATIVE_EVIDENCE_CACHE_VERSION,
          candidateResult: renderCandidateResult,
          files: names,
        },
        evidenceDir,
      )}\n`,
    );
    if (judgeResult) {
      await fs.writeFile(
        path.join(stage, `judge-${keys.judgeKey}.json`),
        `${JSON.stringify(
          {
            version: CREATIVE_EVIDENCE_CACHE_VERSION,
            renderedReferenceFidelity: judgeResult,
          },
          null,
          2,
        )}\n`,
      );
    }
    await fs.rm(path.join(root, keys.renderKey), {
      recursive: true,
      force: true,
    });
    await fs.rename(stage, path.join(root, keys.renderKey));
    return true;
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
