#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const MAX_PUSH_ATTEMPTS = 3;

function fail(message, details = "") {
  console.error(message);
  if (details.trim()) console.error(details.trim());
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) fail(`Could not run git ${args.join(" ")}`, result.error.message);
  return result;
}

function requireGit(args) {
  const result = git(args);
  if (result.status !== 0)
    fail(`git ${args.join(" ")} failed`, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function isAncestor(older, newer) {
  return git(["merge-base", "--is-ancestor", older, newer]).status === 0;
}

const branchIndex = process.argv.indexOf("--branch");
const branch = branchIndex >= 0 ? process.argv[branchIndex + 1] : "";
if (!branch || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes(".."))
  fail("Usage: push-client-review-branch.mjs --branch <existing-remote-branch>");

const currentBranch = requireGit(["branch", "--show-current"]);
if (currentBranch !== branch)
  fail(`Refusing to push ${currentBranch || "detached HEAD"} as ${branch}`);

const remoteRef = `refs/remotes/origin/${branch}`;
const fetchRefspec = `refs/heads/${branch}:${remoteRef}`;

for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
  requireGit(["fetch", "--no-tags", "origin", fetchRefspec]);
  const localHead = requireGit(["rev-parse", "HEAD"]);
  const remoteHead = requireGit(["rev-parse", "--verify", remoteRef]);

  // The remote may already contain this commit if another retry completed it.
  if (isAncestor(localHead, remoteHead)) {
    const status = requireGit(["status", "--porcelain"]);
    if (status)
      fail(
        `Refusing to fast-forward dirty ${branch}; local uncommitted work was left untouched.`,
        status,
      );
    requireGit(["merge", "--ff-only", remoteRef]);
    const synchronizedHead = requireGit(["rev-parse", "HEAD"]);
    if (synchronizedHead !== remoteHead)
      fail(`Could not synchronize local ${branch} to its remote head ${remoteHead}.`);
    console.log(`Fast-forwarded local ${branch} to remote head (${remoteHead}).`);
    process.exit(0);
  }

  // If the branch advanced while Luna was authoring, replay our local commits
  // on top of it. Conflicts abort and preserve both the remote edit and local
  // generated evidence for diagnosis; this helper never force-pushes.
  if (!isAncestor(remoteHead, localHead)) {
    const rebase = git(["rebase", remoteRef]);
    if (rebase.status !== 0) {
      git(["rebase", "--abort"]);
      fail(
        `REMOTE_BRANCH_CONFLICT: ${branch} advanced with overlapping changes; local evidence was preserved without pushing.`,
        `${rebase.stdout ?? ""}\n${rebase.stderr ?? ""}`,
      );
    }
    console.log(`Rebased local review changes onto ${remoteHead}.`);
  }

  const push = git(["push", "origin", `HEAD:refs/heads/${branch}`]);
  if (push.status === 0) {
    process.stdout.write(push.stdout ?? "");
    process.stderr.write(push.stderr ?? "");
    process.exit(0);
  }

  const pushOutput = `${push.stdout ?? ""}\n${push.stderr ?? ""}`;
  const rejectedForRace = /non-fast-forward|fetch first|rejected/i.test(pushOutput);
  if (!rejectedForRace || attempt === MAX_PUSH_ATTEMPTS)
    fail(`Could not safely push ${branch} after ${attempt} attempt(s).`, pushOutput);

  console.warn(`Review branch changed during push; refreshing before retry ${attempt + 1}.`);
}

fail(`Could not safely push ${branch} after ${MAX_PUSH_ATTEMPTS} attempts.`);
