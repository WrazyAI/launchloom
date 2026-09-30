import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  findRevisionCheckpoint,
  prepareRevisionReplay,
} from "../scripts/revision-checkpoint.mjs";

const roots: string[] = [];

async function createRepository() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-checkpoint-"),
  );
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "LaunchLoom Tests");
  git("config", "user.email", "tests@example.invalid");
  await fs.writeFile(path.join(root, "site.txt"), "base\n");
  git("add", "site.txt");
  git("commit", "-m", "base");
  return { root, git };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it("finds only an exact request checkpoint and returns its parent plus sealed scope", async () => {
  const { root, git } = await createRepository();
  const baseSha = git("rev-parse", "HEAD");
  await fs.writeFile(path.join(root, "site.txt"), "verified\n");
  git("add", "site.txt");
  const scope = {
    version: 1,
    baseSha,
    allowedPaths: ["site.txt", "docs/site-generation-guidelines.md"],
  };
  const encodedScope = Buffer.from(JSON.stringify(scope)).toString("base64");
  git(
    "commit",
    "-m",
    "Apply verified revision",
    "-m",
    "LaunchLoom-Revision-Request: request_42",
    "-m",
    `LaunchLoom-Revision-Scope: ${encodedScope}`,
  );
  await fs.writeFile(path.join(root, "unrelated.txt"), "later\n");
  git("add", "unrelated.txt");
  git("commit", "-m", "Unrelated later commit");

  const checkpoint = findRevisionCheckpoint({
    repo: root,
    requestId: "request_42",
  });

  expect(checkpoint).toMatchObject({
    found: true,
    baseSha,
    scopeManifest: scope,
  });
  expect(checkpoint?.commitSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(checkpoint?.changedPaths).toEqual(["site.txt"]);
  await expect(
    prepareRevisionReplay({
      repo: root,
      checkpoint: checkpoint!,
      restoreDir: path.join(root, "restore"),
    }),
  ).rejects.toThrow("current branch-tip");
});

it("restores the original scoped manifest, feedback, and outcome for a tip retry", async () => {
  const { root, git } = await createRepository();
  const baseSha = git("rev-parse", "HEAD");
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({
      revisionReport: {
        feedback: ["Make the service area clearer."],
        results: [
          {
            feedbackIndex: 0,
            status: "fulfilled",
            operationKinds: ["set_copy"],
          },
          {
            feedbackIndex: 1,
            status: "creative",
            feedback: "Keep the hero asymmetrical.",
          },
        ],
        creativeSourceRepairVerified: {
          pass: true,
          candidateId: "candidate_a",
        },
      },
    }),
  );
  await fs.writeFile(path.join(root, "site.txt"), "verified\n");
  git("add", "site.txt", "src/site.config.json");
  const scope = {
    version: 1,
    baseSha,
    allowedPaths: ["site.txt", "src/site.config.json"],
  };
  const encodedScope = Buffer.from(JSON.stringify(scope)).toString("base64");
  git(
    "commit",
    "-m",
    "Apply verified revision",
    "-m",
    "LaunchLoom-Revision-Request: request_43",
    "-m",
    `LaunchLoom-Revision-Scope: ${encodedScope}`,
  );
  const checkpoint = findRevisionCheckpoint({
    repo: root,
    requestId: "request_43",
  });
  expect(checkpoint?.isTip).toBe(true);
  const restoreDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-replay-"),
  );
  roots.push(restoreDir);

  await prepareRevisionReplay({
    repo: root,
    checkpoint: checkpoint!,
    restoreDir,
  });

  expect(
    JSON.parse(
      await fs.readFile(path.join(restoreDir, "revision-scope.json"), "utf8"),
    ),
  ).toEqual(scope);
  expect(
    JSON.parse(
      await fs.readFile(
        path.join(restoreDir, "guidelines-written.json"),
        "utf8",
      ),
    ),
  ).toEqual(["docs/site-generation-guidelines.md"]);
  expect(
    await fs.readFile(path.join(restoreDir, "revision-feedback.txt"), "utf8"),
  ).toBe("Make the service area clearer.");
  expect(
    await fs.readFile(path.join(restoreDir, "revision-outcome.txt"), "utf8"),
  ).toContain("Item 1: fulfilled. Applied set_copy.");
  expect(
    await fs.readFile(path.join(restoreDir, "revision-outcome.txt"), "utf8"),
  ).toContain(
    "Item 2: creative. Authored creative revision passed rendered review on candidate candidate_a.",
  );
  expect(
    await fs.readFile(path.join(restoreDir, "revision-outcome.txt"), "utf8"),
  ).toContain(
    "Creative source refinement: candidate candidate_a passed rendered human verification.",
  );
});

it("does not match a request ID that is only a substring of another request", async () => {
  const { root, git } = await createRepository();
  await fs.writeFile(path.join(root, "site.txt"), "verified\n");
  git("add", "site.txt");
  git(
    "commit",
    "-m",
    "Apply verified revision",
    "-m",
    "LaunchLoom-Revision-Request: request_420",
  );

  expect(
    findRevisionCheckpoint({ repo: root, requestId: "request_42" }),
  ).toBeNull();
});

it("rejects invalid request IDs rather than interpolating them into Git lookups", async () => {
  const { root } = await createRepository();
  expect(() =>
    findRevisionCheckpoint({ repo: root, requestId: "request\n42" }),
  ).toThrow("Invalid revision request ID");
});
