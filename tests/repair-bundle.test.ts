import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepairBundle } from "../scripts/build-repair-bundle.mjs";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-bundle-"));
  dirs.push(root);
  const candidate = path.join(root, "candidates", "candidate-a");
  const screenshots = path.join(root, "screenshots");
  const findings = path.join(root, "findings");
  await fs.mkdir(candidate, { recursive: true });
  await fs.mkdir(screenshots, { recursive: true });
  await fs.mkdir(findings, { recursive: true });
  await fs.writeFile(
    path.join(candidate, "index.astro"),
    "---\nconst title = 'Private source';\n---\n<h1>{title}</h1>\n",
  );
  await fs.writeFile(path.join(screenshots, "desktop.png"), "png-bytes");
  await fs.writeFile(path.join(screenshots, "notes.txt"), "not an image");
  await fs.writeFile(
    path.join(findings, "visual-gate.json"),
    JSON.stringify({ status: "quality-blocked", findings: [] }),
  );
  const config = path.join(root, "site.config.json");
  await fs.writeFile(
    config,
    JSON.stringify({ business: { name: "Fixture" }, lead: { token: "secret" } }),
  );
  return { root, candidate, screenshots, findings, config };
}

describe("repair bundle", () => {
  it("copies the selected build evidence and writes a manifest", async () => {
    const { root, candidate, screenshots, findings, config } = await fixture();
    const outputDir = path.join(root, "bundle");
    const manifest = await buildRepairBundle({
      outputDir,
      attemptId: "attempt-1",
      clientRepo: "WrazyAI/client-fixture",
      projectName: "client-fixture",
      buildSha: "a".repeat(40),
      renderer: "creative",
      candidateId: "candidate-a",
      previewUrl: "https://review-initial.client-fixture.pages.dev",
      candidateDir: candidate,
      screenshotsDir: screenshots,
      configPath: config,
      findingsPaths: [path.join(findings, "visual-gate.json")],
      createdAt: "2026-11-09T16:00:00.000Z",
    });

    expect(manifest).toMatchObject({
      version: 1,
      attemptId: "attempt-1",
      clientRepo: "WrazyAI/client-fixture",
      buildSha: "a".repeat(40),
      renderer: "creative",
      candidateId: "candidate-a",
      previewUrl: "https://review-initial.client-fixture.pages.dev",
      createdAt: "2026-11-09T16:00:00.000Z",
      files: {
        candidate: "candidate",
        screenshots: "screenshots",
        config: "site.config.json",
        findings: ["findings/visual-gate.json"],
      },
    });
    expect(manifest.redeployCommand).toContain("WrazyAI/client-fixture");
    expect(manifest.redeployCommand).toContain("a".repeat(40));
    expect(manifest.redeployCommand).toContain("client-fixture");
    const written = JSON.parse(
      await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"),
    );
    expect(written).toEqual(manifest);
    expect(
      await fs.readFile(path.join(outputDir, "candidate", "index.astro"), "utf8"),
    ).toContain("Private source");
    expect(
      await fs.readFile(path.join(outputDir, "screenshots", "desktop.png"), "utf8"),
    ).toBe("png-bytes");
    await expect(
      fs.stat(path.join(outputDir, "screenshots", "notes.txt")),
    ).rejects.toThrow();
    expect(
      await fs.readFile(path.join(outputDir, "README.md"), "utf8"),
    ).toContain("private");
    expect(JSON.stringify(manifest)).not.toContain("secret");
  });

  it("rejects an invalid build SHA, repository, renderer or candidate", async () => {
    const { root } = await fixture();
    const base = {
      outputDir: path.join(root, "bundle"),
      attemptId: "attempt-1",
      clientRepo: "WrazyAI/client-fixture",
      projectName: "client-fixture",
      buildSha: "a".repeat(40),
      renderer: "creative",
      candidateId: "candidate-a",
    };
    await expect(
      buildRepairBundle({ ...base, buildSha: "not-a-sha" }),
    ).rejects.toThrow(/build sha/iu);
    await expect(
      buildRepairBundle({ ...base, clientRepo: "../escape" }),
    ).rejects.toThrow(/repository/iu);
    await expect(
      buildRepairBundle({ ...base, renderer: "legacy" }),
    ).rejects.toThrow(/renderer/iu);
    await expect(
      buildRepairBundle({ ...base, candidateId: "../escape" }),
    ).rejects.toThrow(/candidate/iu);
  });

  it("omits optional evidence that is not present", async () => {
    const { root } = await fixture();
    const manifest = await buildRepairBundle({
      outputDir: path.join(root, "bundle"),
      attemptId: "attempt-1",
      clientRepo: "WrazyAI/client-fixture",
      projectName: "client-fixture",
      buildSha: "b".repeat(40),
      renderer: "pack",
      candidateId: null,
    });
    expect(manifest.files).toEqual({});
    expect(manifest.candidateId).toBeNull();
  });
});
