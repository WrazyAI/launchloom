import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const templateRoot = path.resolve("templates/client-site");
const copyScript = path.resolve("scripts/prepare-client-build-copy.mjs");

function copyClient(source: string, target: string) {
  return spawnSync(
    process.execPath,
    [copyScript, "--source", source, "--target", target],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}

describe("prepare client build copy", () => {
  it("supplies the trusted lockfile for a matching legacy client manifest", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-lock-copy-"),
    );
    const source = path.join(root, "source");
    const target = path.join(root, "build");
    const trustedManifest = JSON.parse(
      await fs.readFile(path.join(templateRoot, "package.json"), "utf8"),
    );
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(
      path.join(source, "package.json"),
      `${JSON.stringify(trustedManifest, null, 2)}\n`,
    );

    try {
      const result = copyClient(source, target);

      expect(result.status).toBe(0);
      expect(await fs.readFile(path.join(target, "package-lock.json"))).toEqual(
        await fs.readFile(path.join(templateRoot, "package-lock.json")),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not borrow the template lockfile for a different dependency manifest", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-lock-mismatch-"),
    );
    const source = path.join(root, "source");
    const target = path.join(root, "build");
    const customManifest = JSON.parse(
      await fs.readFile(path.join(templateRoot, "package.json"), "utf8"),
    );
    customManifest.dependencies.astro = "7.2.11";
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(
      path.join(source, "package.json"),
      `${JSON.stringify(customManifest, null, 2)}\n`,
    );

    try {
      const result = copyClient(source, target);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "cannot use the trusted template lockfile because the dependency manifest differs",
      );
      await expect(
        fs.access(path.join(target, "package-lock.json")),
      ).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("replaces an unusable copied lockfile only for the matching template manifest", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-invalid-lock-"),
    );
    const source = path.join(root, "source");
    const target = path.join(root, "build");
    const trustedManifest = JSON.parse(
      await fs.readFile(path.join(templateRoot, "package.json"), "utf8"),
    );
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(
      path.join(source, "package.json"),
      `${JSON.stringify(trustedManifest, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(source, "package-lock.json"),
      '{"lockfileVersion":0}\n',
    );

    try {
      const result = copyClient(source, target);

      expect(result.status).toBe(0);
      const copiedLock = JSON.parse(
        await fs.readFile(path.join(target, "package-lock.json"), "utf8"),
      );
      const trustedLock = JSON.parse(
        await fs.readFile(path.join(templateRoot, "package-lock.json"), "utf8"),
      );
      expect(copiedLock).toEqual(trustedLock);
      expect(result.stdout).toContain(
        `client_build_lockfile source=trusted-template version=${trustedLock.lockfileVersion}`,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("removes an unusable shrinkwrap that would shadow a valid client lockfile", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-client-invalid-shrinkwrap-"),
    );
    const source = path.join(root, "source");
    const target = path.join(root, "build");
    const trustedManifest = JSON.parse(
      await fs.readFile(path.join(templateRoot, "package.json"), "utf8"),
    );
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(
      path.join(source, "package.json"),
      `${JSON.stringify(trustedManifest, null, 2)}\n`,
    );
    await fs.copyFile(
      path.join(templateRoot, "package-lock.json"),
      path.join(source, "package-lock.json"),
    );
    await fs.writeFile(
      path.join(source, "npm-shrinkwrap.json"),
      '{"lockfileVersion":0}\n',
    );

    try {
      const result = copyClient(source, target);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("source=client-package-lock version=3");
      await expect(
        fs.access(path.join(target, "npm-shrinkwrap.json")),
      ).rejects.toThrow();
      const copiedLock = JSON.parse(
        await fs.readFile(path.join(target, "package-lock.json"), "utf8"),
      );
      expect(copiedLock.lockfileVersion).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
