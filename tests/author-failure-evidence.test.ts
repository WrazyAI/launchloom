import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { prepareCreativeRecovery } from "../scripts/prepare-creative-recovery.mjs";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
describe("failed author evidence boundary", () => {
  it("does not delete input files when failure evidence points at their parent", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-output-guard-"),
    );
    roots.push(root);
    const config = path.join(root, "config.json");
    const inspiration = path.join(root, "inspiration.json");
    await fs.writeFile(config, "{");
    await fs.writeFile(inspiration, "{}");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/author-production-experiences.mjs"),
        "--config",
        config,
        "--inspiration",
        inspiration,
        "--out",
        root,
        "--failure-mode",
        "throw",
      ],
      {
        env: { ...process.env, OPENROUTER_API_KEY: "test-only-no-network" },
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "may not contain the workspace or input files",
    );
    expect(await fs.readFile(config, "utf8")).toBe("{");
    expect(await fs.readFile(inspiration, "utf8")).toBe("{}");
  });
  it("rejects a symlink output without deleting its target", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-output-link-"),
    );
    roots.push(root);
    await fs.writeFile(path.join(root, "config.json"), "{");
    await fs.writeFile(path.join(root, "inspiration.json"), "{}");
    const target = path.join(root, "retained");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "sentinel"), "retained");
    const out = path.join(root, "generated-experiences");
    await fs.symlink(target, out);
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/author-production-experiences.mjs"),
        "--config",
        path.join(root, "config.json"),
        "--inspiration",
        path.join(root, "inspiration.json"),
        "--out",
        out,
        "--failure-mode",
        "throw",
      ],
      {
        env: { ...process.env, OPENROUTER_API_KEY: "test-only-no-network" },
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("may not be a symbolic link");
    expect(await fs.readFile(path.join(target, "sentinel"), "utf8")).toBe(
      "retained",
    );
  });
  it.each([
    "sk-or-v1-" + "d".repeat(64),
    "data:image/webp;base64," + "A".repeat(16000),
  ])(
    "redacts asset/key literals from parse-failure evidence %#",
    async (input) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-private-failure-"),
      );
      roots.push(root);
      await fs.writeFile(path.join(root, "config.json"), input);
      await fs.writeFile(path.join(root, "inspiration.json"), "{}");
      const out = path.join(root, "generated-experiences");
      const result = spawnSync(
        process.execPath,
        [
          path.resolve("scripts/author-production-experiences.mjs"),
          "--config",
          path.join(root, "config.json"),
          "--inspiration",
          path.join(root, "inspiration.json"),
          "--out",
          out,
          "--failure-mode",
          "throw",
        ],
        {
          env: { ...process.env, OPENROUTER_API_KEY: "test-only-no-network" },
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
      const manifest = JSON.parse(
        await fs.readFile(path.join(out, "creative-run.json"), "utf8"),
      );
      expect(manifest.error).not.toContain("sk-or-v1-");
      expect(manifest.error).not.toContain("data:image");
      expect(result.stderr).not.toContain("sk-or-v1-");
      expect(result.stderr).not.toContain("data:image");
      expect(manifest.error.length).toBeLessThanOrEqual(4000);
    },
  );
  it("retains a failure manifest while throw mode still exits nonzero", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-failed-author-"),
    );
    roots.push(root);
    const config = path.join(root, "site.config.json");
    const inspiration = path.join(root, "inspiration.json");
    const out = path.join(root, "generated-experiences");
    await fs.writeFile(config, "{");
    await fs.writeFile(inspiration, "{}");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/author-production-experiences.mjs"),
        "--config",
        config,
        "--inspiration",
        inspiration,
        "--out",
        out,
        "--failure-mode",
        "throw",
      ],
      {
        env: { ...process.env, OPENROUTER_API_KEY: "test-only-no-network" },
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/at (?:JSON\.)?parse \(<anonymous>\)/u);
    const manifest = JSON.parse(
      await fs.readFile(path.join(out, "creative-run.json"), "utf8"),
    );
    expect(manifest.status).toBe("failed");
    expect(manifest.usage).toEqual([]);
    expect(manifest.cacheSummary.cost).toBe(0);
    expect((await fs.readdir(out)).sort()).toEqual([
      "creative-run.json",
      "prompt-evidence.json",
    ]);
  });
  it("does not create a recovery offer from old render evidence after current authorship failed", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-stale-recovery-"),
    );
    roots.push(root);
    const candidateDir = path.join(root, ".launchloom/generated-experiences");
    const round = path.join(root, ".launchloom/creative-repair/round-01");
    await fs.mkdir(candidateDir, { recursive: true });
    await fs.mkdir(round, { recursive: true });
    await fs.writeFile(
      path.join(candidateDir, "creative-run.json"),
      JSON.stringify({
        version: 1,
        status: "failed",
        error: "Current authorship failed",
      }),
    );
    await fs.writeFile(
      path.join(round, "creative-bakeoff.json"),
      JSON.stringify({
        candidates: [
          {
            candidateId: "candidate-a",
            directory: "candidate-a",
            score: 95,
            viewports: [],
          },
        ],
      }),
    );
    await expect(prepareCreativeRecovery({ siteDir: root })).rejects.toThrow(
      /current authorship failed/i,
    );
    await expect(
      fs.access(path.join(root, ".launchloom/creative-recovery.json")),
    ).rejects.toThrow();
  });
});
