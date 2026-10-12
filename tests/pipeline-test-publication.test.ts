import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it, expect } from "vitest";

const guard = path.resolve("scripts/assert-production-site.mjs");
it.each([
  "seo-only",
  "creative-only",
  "report",
  "malformed",
  "full",
  "wrong-sha",
])("checks exact publication source before deployment: %s", (mode) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-production-guard-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, ".launchloom"));
    const config =
      mode === "seo-only" || mode === "creative-only"
        ? { pipelineTest: { version: 1, profile: mode, testOnly: true } }
        : mode === "malformed"
          ? { pipelineTest: null }
          : {};
    fs.writeFileSync(
      path.join(dir, "src/site.config.json"),
      JSON.stringify(config),
    );
    if (mode === "report")
      fs.writeFileSync(
        path.join(dir, ".launchloom/pipeline-test-report.json"),
        "{}",
      );
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Synthetic",
        "-c",
        "user.email=synthetic@example.test",
        "commit",
        "-qm",
        "Synthetic approved source",
      ],
      { cwd: dir },
    );
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    const result = spawnSync(
      process.execPath,
      [
        guard,
        "--site",
        dir,
        "--approved-sha",
        mode === "wrong-sha" ? "f".repeat(40) : sha,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(mode === "full" ? 0 : 1);
    if (!["full", "wrong-sha"].includes(mode))
      expect(result.stderr).toContain("test-only");
    if (mode === "wrong-sha")
      expect(result.stderr).toContain("checkout mismatch");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
