import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve("scripts/prepare-safe-static-output.mjs");
const CLIENT_DEPLOY_WORKFLOWS = [
  ".github/workflows/generate-client.yml",
  ".github/workflows/repair-creative-candidate.yml",
  ".github/workflows/process-feedback.yml",
  ".github/workflows/process-client-feedback.yml",
  ".github/workflows/publish-site.yml",
];

function copyStaticOutput(source: string, parent: string) {
  return spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--source", source, "--parent", parent],
    { encoding: "utf8" },
  );
}

describe("safe static deploy output", () => {
  it("copies only regular output files into a fresh runner-owned directory", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "launchloom-safe-output-test-"),
    );
    const source = path.join(root, "build", "dist");
    const parent = path.join(root, "runner-temp");
    await mkdir(path.join(source, "assets"), { recursive: true });
    await mkdir(parent);
    await writeFile(path.join(source, "index.html"), "<h1>Preview</h1>");
    await writeFile(path.join(source, "assets", "mark.svg"), "<svg />");

    try {
      const result = copyStaticOutput(source, parent);
      expect(result.status, result.stderr).toBe(0);

      const deployPath = result.stdout.trim();
      expect(path.dirname(deployPath)).toBe(parent);
      expect(await readFile(path.join(deployPath, "index.html"), "utf8")).toBe(
        "<h1>Preview</h1>",
      );
      expect(
        await readFile(path.join(deployPath, "assets", "mark.svg"), "utf8"),
      ).toBe("<svg />");
      const deployStat = await lstat(deployPath);
      expect(deployStat.isDirectory()).toBe(true);
      if (typeof process.getuid !== "function")
        throw new Error("Safe static output verification requires Linux.");
      expect(deployStat.uid).toBe(process.getuid());
      expect(deployStat.mode & 0o777).toBe(0o700);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an output symlink without copying or disclosing its sentinel", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "launchloom-safe-symlink-test-"),
    );
    const source = path.join(root, "dist");
    const parent = path.join(root, "runner-temp");
    const sentinel = path.join(root, "outside-sentinel.txt");
    const sentinelContents = "synthetic-outside-dist-sentinel-not-for-deploy";
    await mkdir(source);
    await mkdir(parent);
    await writeFile(path.join(source, "index.html"), "safe preview shell");
    await writeFile(sentinel, sentinelContents);
    await symlink(sentinel, path.join(source, "leak.txt"));

    try {
      const result = copyStaticOutput(source, parent);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/symbolic link|symlink/iu);
      expect(result.stderr).not.toContain(sentinelContents);
      expect(await readdir(parent)).toEqual([]);
      expect(await readFile(sentinel, "utf8")).toBe(sentinelContents);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects special files instead of copying non-regular output", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "launchloom-safe-special-test-"),
    );
    const source = path.join(root, "dist");
    const parent = path.join(root, "runner-temp");
    await mkdir(source);
    await mkdir(parent);

    try {
      execFileSync("mkfifo", [path.join(source, "named-pipe")]);
      const result = copyStaticOutput(source, parent);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/special|unsupported|regular file/iu);
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("routes each client Pages deploy through the validated static-output copy", () => {
    for (const workflowPath of CLIENT_DEPLOY_WORKFLOWS) {
      const source = readFileSync(path.resolve(workflowPath), "utf8");
      const deployTargets = [
        ...source.matchAll(/pages deploy\s+("[^"]*"|\S+)/gu),
      ].map((match) => match[1]);

      expect(deployTargets.length, workflowPath).toBeGreaterThan(0);
      expect(deployTargets, workflowPath).toEqual(
        deployTargets.map(() => '"$SAFE_DEPLOY_DIR"'),
      );
      expect(source, workflowPath).toMatch(
        /SAFE_DEPLOY_DIR=\$\(node "\$GITHUB_WORKSPACE\/scripts\/prepare-safe-static-output\.mjs" --source "\$BUILD_DIR\/dist" --parent "\$RUNNER_TEMP"\)/u,
      );
      expect(source, workflowPath).toMatch(
        /echo "safe_deploy_dir=\$SAFE_DEPLOY_DIR" >> "\$GITHUB_OUTPUT"/u,
      );
      expect(source, workflowPath).toMatch(
        /SAFE_DEPLOY_DIR: \$\{\{ steps\.[\w-]+\.outputs\.safe_deploy_dir \}\}/u,
      );
    }
  });
});
