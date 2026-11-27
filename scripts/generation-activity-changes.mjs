import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/u;
const CANDIDATE_FILES = [
  "Experience.jsx",
  "LocationPage.jsx",
  "ServicePage.jsx",
  "ServicesIndexPage.jsx",
  "motion.js",
  "styles.css",
];
const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_RAW_PATCH_BYTES = 512 * 1024;

async function git(cwd, args, { noIndex = false, maxBuffer = 1024 * 1024 } = {}) {
  try {
    const { stdout } = await execute("git", args, { cwd, maxBuffer, timeout: 5_000 });
    return stdout;
  } catch (error) {
    if (noIndex && error.code === 1 && !error.killed && !error.stderr)
      return error.stdout;
    throw error;
  }
}

export async function captureCandidateSources(directory) {
  const files = new Map();
  for (const name of CANDIDATE_FILES) {
    const file = path.join(directory, name);
    const stat = await fs.lstat(file).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) continue;
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES)
      throw new Error("Candidate source is unavailable for comparison.");
    files.set(name, await fs.readFile(file));
  }
  return files;
}

function lineTotals(numstat) {
  const totals = { filesChanged: 0, additions: 0, deletions: 0 };
  const rows = numstat.split("\0");
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const [added, removed, name] = row.split("\t", 3);
    // --no-index emits the old and new names as separate NUL fields.
    if (name === "") index += 2;
    totals.filesChanged += 1;
    totals.additions += added === "-" ? 0 : Number(added);
    totals.deletions += removed === "-" ? 0 : Number(removed);
  }
  return totals;
}

export async function compareCandidateSources(before, after) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-diff-"));
  try {
    for (const [side, files] of [["before", before], ["after", after]]) {
      await fs.mkdir(path.join(temp, side));
      for (const name of CANDIDATE_FILES) {
        if (files.has(name))
          await fs.writeFile(path.join(temp, side, name), files.get(name));
      }
    }
    const args = ["diff", "--no-index", "--no-renames", "--no-ext-diff", "--no-textconv", "--no-color"];
    const options = { noIndex: true };
    const totals = lineTotals(await git(temp, [...args, "--numstat", "-z", "--", "before", "after"], options));
    if (!totals.filesChanged) return totals;
    const patch = await git(temp, [...args, "--unified=2", "--", "before", "after"], {
      ...options, maxBuffer: MAX_RAW_PATCH_BYTES,
    }).catch(() => null);
    return patch === null ? { ...totals, patchOmitted: true } : { ...totals, patch };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

export async function summarizeCommittedChanges(directory, repository, baseSha, headSha) {
  if (!directory || !REPOSITORY.test(repository) || !SHA.test(baseSha) || !SHA.test(headSha))
    return null;
  await git(directory, ["merge-base", "--is-ancestor", baseSha, headSha]);
  const numstat = await git(directory, [
    "diff", "--no-renames", "--no-ext-diff", "--no-textconv", "--numstat", "-z",
    baseSha, headSha, "--", "src/", ":(exclude)src/site.config.json",
  ]);
  return { repository, baseSha, headSha, ...lineTotals(numstat) };
}

export function emitChangeSummary(producer, name, result) {
  if (!result) return;
  producer.emit("action_finished", {
    actionId: randomUUID(),
    name,
    status: "succeeded",
    durationMs: null,
    result,
  });
}

/** Capture around an actual write; diagnostic errors cannot affect the write. */
export async function observeCandidateWrite(producer, directory, invoke) {
  if (!producer?.context()) return invoke();
  const before = await captureCandidateSources(directory).catch(() => null);
  const value = await invoke();
  if (!before) return value;
  try {
    const after = await captureCandidateSources(directory);
    const changes = await compareCandidateSources(before, after);
    if (changes.filesChanged) emitChangeSummary(producer, "edit_candidate_files", changes);
  } catch {
    // A missing comparison does not alter the result of an applied write.
  }
  return value;
}
