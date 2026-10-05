import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ensureClientBuildIgnores } from "./client-build-ignores.mjs";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const SCOPE_TRAILER = "LaunchLoom-Revision-Scope: ";

function runGit(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`,
    );
  return result.stdout;
}

function validateScopeManifest(manifest, baseSha) {
  if (
    manifest?.version !== 1 ||
    manifest.baseSha !== baseSha ||
    !Array.isArray(manifest.allowedPaths) ||
    manifest.allowedPaths.some(
      (entry) =>
        typeof entry !== "string" ||
        !entry ||
        entry.startsWith("/") ||
        entry.includes("\\") ||
        entry.includes("\0") ||
        entry.split("/").some((part) => !part || part === "." || part === ".."),
    ) ||
    new Set(manifest.allowedPaths).size !== manifest.allowedPaths.length
  )
    throw new Error(
      "Revision checkpoint contains an invalid write-scope manifest.",
    );
  return manifest;
}

function pathsInCommit(repo, commitSha, parentSha) {
  const args = ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z"];
  if (parentSha) args.push(parentSha, commitSha);
  else args.push(commitSha);
  return runGit(repo, args).split("\0").filter(Boolean).sort();
}

export function findRevisionCheckpoint({ repo, requestId }) {
  if (!repo || !REQUEST_ID_PATTERN.test(String(requestId || "")))
    throw new Error("Invalid revision request ID or repository path.");

  const commits = runGit(repo, ["rev-list", "-n", "80", "HEAD"])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  const expectedMarker = `LaunchLoom-Revision-Request: ${requestId}`;
  for (const commitSha of commits) {
    const details = runGit(repo, [
      "show",
      "-s",
      "--format=%P%x00%B",
      commitSha,
    ]);
    const separator = details.indexOf("\0");
    if (separator < 0)
      throw new Error("Could not parse revision checkpoint commit.");
    const parents = details
      .slice(0, separator)
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
    const body = details.slice(separator + 1);
    if (!body.split(/\r?\n/u).some((line) => line.trim() === expectedMarker))
      continue;
    if (parents.length !== 1)
      throw new Error(
        "Revision checkpoint must have exactly one parent commit.",
      );

    const scopeLine = body
      .split(/\r?\n/u)
      .find((line) => line.startsWith(SCOPE_TRAILER));
    if (!scopeLine)
      throw new Error(
        "Revision checkpoint is missing its sealed write-scope trailer.",
      );
    let scopeManifest;
    try {
      scopeManifest = JSON.parse(
        Buffer.from(
          scopeLine.slice(SCOPE_TRAILER.length).trim(),
          "base64",
        ).toString("utf8"),
      );
    } catch {
      throw new Error("Revision checkpoint write-scope trailer is malformed.");
    }
    const baseSha = parents[0];
    if (!/^[a-f0-9]{40}$/u.test(baseSha))
      throw new Error("Revision checkpoint parent SHA is invalid.");
    validateScopeManifest(scopeManifest, baseSha);
    runGit(repo, ["merge-base", "--is-ancestor", commitSha, "HEAD"]);

    const changedPaths = pathsInCommit(repo, commitSha, baseSha);
    const allowed = new Set(scopeManifest.allowedPaths);
    const outsideScope = changedPaths.filter((entry) => !allowed.has(entry));
    if (outsideScope.length)
      throw new Error(
        `Revision checkpoint contains paths outside its sealed scope: ${outsideScope.join(", ")}`,
      );

    return {
      found: true,
      commitSha,
      baseSha,
      isTip: commits[0] === commitSha,
      changedPaths,
      scopeManifest,
    };
  }
  return null;
}

function feedbackText(report) {
  const feedback = Array.isArray(report?.feedback) ? report.feedback : [];
  return feedback
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .filter(Boolean)
    .join("\n\n");
}

function outcomeText(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const lines = results
    .map((result) => {
      const detail =
        result.status === "fulfilled"
          ? `Applied ${result.operationKinds?.join(", ") || result.operation?.kind || "verified structured changes"}.`
          : result.status === "manual"
            ? `Manual attention: ${result.reason || "Requested change needs review."}`
            : result.status === "creative"
              ? report.creativeSourceRepairVerified?.pass === true
                ? `Authored creative revision passed rendered review on candidate ${report.creativeSourceRepairVerified.candidateId || "unknown"}.`
                : "Queued for authored creative source refinement and rendered verification."
              : `Unresolved: ${(result.unresolved || []).join(", ")}.`;
      return `Item ${(Number(result.feedbackIndex) || 0) + 1}: ${result.status || "unknown"}. ${detail}`;
    })
    .concat(
      report.creativeSourceRepairVerified?.pass === true
        ? [
            `Creative source refinement: candidate ${report.creativeSourceRepairVerified.candidateId || "unknown"} passed rendered human verification.`,
          ]
        : [],
    );
  return lines.join("\n");
}

export async function prepareRevisionReplay({ repo, checkpoint, restoreDir }) {
  if (!checkpoint?.found || !checkpoint.isTip)
    throw new Error(
      "Only the current branch-tip revision checkpoint can be replayed safely.",
    );
  const config = JSON.parse(
    await fs.readFile(path.join(repo, "src/site.config.json"), "utf8"),
  );
  const report = config.revisionReport || {};
  const writtenGuidelines = ["docs/site-generation-guidelines.md"];
  if (checkpoint.changedPaths.includes("AGENTS.md"))
    writtenGuidelines.push("AGENTS.md");
  await fs.mkdir(restoreDir, { recursive: true });
  await fs.writeFile(
    path.join(restoreDir, "revision-scope.json"),
    `${JSON.stringify(checkpoint.scopeManifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(restoreDir, "guidelines-written.json"),
    `${JSON.stringify(writtenGuidelines)}\n`,
  );
  await fs.writeFile(
    path.join(restoreDir, "revision-feedback.txt"),
    feedbackText(report),
  );
  await fs.writeFile(
    path.join(restoreDir, "revision-outcome.txt"),
    outcomeText(report),
  );
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}`);
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  if (
    args.action !== "prepare" ||
    !args.repo ||
    !args["request-id"] ||
    !args.out ||
    !args["restore-dir"]
  )
    throw new Error(
      "Usage: revision-checkpoint.mjs --action prepare --repo <client> --request-id <id> --out <json> --restore-dir <runner-temp>",
    );
  const checkpoint = findRevisionCheckpoint({
    repo: args.repo,
    requestId: args["request-id"],
  });
  await ensureClientBuildIgnores(args.repo);
  if (checkpoint)
    await prepareRevisionReplay({
      repo: args.repo,
      checkpoint,
      restoreDir: args["restore-dir"],
    });
  else await fs.mkdir(args["restore-dir"], { recursive: true });
  await fs.writeFile(
    args.out,
    `${JSON.stringify(checkpoint || { found: false }, null, 2)}\n`,
  );
  console.log(`revision_checkpoint_found=${checkpoint ? "true" : "false"}`);
}
