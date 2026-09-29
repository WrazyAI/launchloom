import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const workflowPath = path.resolve(".github/workflows/generate-client.yml");
const pushScript = fileURLToPath(
  new URL("../scripts/push-client-review-branch.mjs", import.meta.url),
);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function configureGit(cwd: string, name: string): void {
  git(cwd, ["config", "user.name", name]);
  git(cwd, ["config", "user.email", `${name.toLowerCase().replaceAll(" ", "-")}@example.test`]);
}

function setupConcurrentBranchUpdate(conflicting: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), "launchloom-branch-push-"));
  temporaryRoots.push(root);
  const remote = path.join(root, "client.git");
  const seed = path.join(root, "seed");
  const runner = path.join(root, "runner");
  const developer = path.join(root, "developer");

  execFileSync("git", ["init", "--bare", "--initial-branch=main", remote]);
  execFileSync("git", ["init", "--initial-branch=main", seed]);
  configureGit(seed, "Seed Owner");
  mkdirSync(path.join(seed, "src"), { recursive: true });
  mkdirSync(path.join(seed, ".launchloom/generated-experiences/candidate-a"), { recursive: true });
  writeFileSync(path.join(seed, "src/site.config.json"), '{"headline":"original"}\n');
  writeFileSync(
    path.join(seed, ".launchloom/generated-experiences/candidate-a/Experience.jsx"),
    "export default function Experience() { return <main>Original</main>; }\n",
  );
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "Create review branch base"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "origin", "HEAD:main"]);
  git(seed, ["switch", "-c", "review/initial"]);
  git(seed, ["push", "--set-upstream", "origin", "review/initial"]);

  execFileSync("git", ["clone", "--branch", "review/initial", remote, runner]);
  execFileSync("git", ["clone", "--branch", "review/initial", remote, developer]);
  configureGit(runner, "LaunchLoom Runner");
  configureGit(developer, "Developer");

  const candidateFile = ".launchloom/generated-experiences/candidate-a/Experience.jsx";
  const runnerFile = conflicting ? candidateFile : ".launchloom/generated-experiences/candidate-a/content-manifest.json";
  const runnerPath = path.join(runner, runnerFile);
  mkdirSync(path.dirname(runnerPath), { recursive: true });
  writeFileSync(runnerPath, conflicting
    ? "export default function Experience() { return <main>Generated</main>; }\n"
    : '{"authored":true}\n');
  git(runner, ["add", "."]);
  git(runner, ["commit", "-m", "Record authored candidate"]);
  const runnerCommit = git(runner, ["rev-parse", "HEAD"]);

  const developerFile = conflicting ? candidateFile : "src/site.config.json";
  const developerPath = path.join(developer, developerFile);
  writeFileSync(
    developerPath,
    conflicting
      ? "export default function Experience() { return <main>Developer</main>; }\n"
      : '{"headline":"developer feedback"}\n',
  );
  git(developer, ["add", developerFile]);
  git(developer, ["commit", "-m", "Apply developer feedback"]);
  const developerCommit = git(developer, ["rev-parse", "HEAD"]);
  git(developer, ["push", "origin", "HEAD:review/initial"]);

  return { developerCommit, developerPath, remote, runner, runnerCommit };
}

describe("safe client review-branch pushes", () => {
  it("rebases authored evidence over a concurrent non-conflicting developer update", () => {
    const scenario = setupConcurrentBranchUpdate(false);
    const result = spawnSync(
      process.execPath,
      [pushScript, "--branch", "review/initial"],
      { cwd: scenario.runner, encoding: "utf8" },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(git(scenario.runner, ["merge-base", "--is-ancestor", scenario.developerCommit, "HEAD"])).toBe("");
    expect(readFileSync(path.join(scenario.runner, "src/site.config.json"), "utf8")).toContain(
      "developer feedback",
    );
    expect(readFileSync(
      path.join(scenario.runner, ".launchloom/generated-experiences/candidate-a/content-manifest.json"),
      "utf8",
    )).toContain('"authored":true');
    expect(git(scenario.runner, ["rev-parse", "HEAD"])).not.toBe(scenario.runnerCommit);
    expect(git(scenario.runner, ["ls-remote", "origin", "refs/heads/review/initial"]).split(/\s+/)[0])
      .toBe(git(scenario.runner, ["rev-parse", "HEAD"]));
  }, 30_000);

  it("fails on a same-file conflict and leaves the developer branch unchanged", () => {
    const scenario = setupConcurrentBranchUpdate(true);
    const remoteHeadBefore = git(scenario.runner, ["ls-remote", "origin", "refs/heads/review/initial"])
      .split(/\s+/)[0];
    const result = spawnSync(
      process.execPath,
      [pushScript, "--branch", "review/initial"],
      { cwd: scenario.runner, encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/conflict|preserv/i);
    expect(git(scenario.runner, ["rev-parse", "HEAD"])).toBe(scenario.runnerCommit);
    expect(git(scenario.runner, ["ls-remote", "origin", "refs/heads/review/initial"])
      .split(/\s+/)[0]).toBe(remoteHeadBefore);
  }, 30_000);

  it("uses the safe push helper for generated review-branch commits", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const authoredEvidenceStart = workflow.indexOf("- name: Commit authored experience evidence");
    const laterReviewWrites = workflow.slice(authoredEvidenceStart);

    expect(authoredEvidenceStart).toBeGreaterThanOrEqual(0);
    expect(laterReviewWrites).toContain("scripts/push-client-review-branch.mjs");
    expect(laterReviewWrites).not.toContain("git push origin review/initial");
  });
});
