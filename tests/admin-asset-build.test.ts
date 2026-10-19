import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const tempDirectories: string[] = [];

async function tempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "launchloom-admin-build-"));
  tempDirectories.push(directory);
  return directory;
}

async function outputMap(directory: string) {
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  const map = new Map<string, Buffer>();
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    const relative = path.relative(directory, absolute).split(path.sep).join("/");
    map.set(relative, await readFile(absolute));
  }
  return map;
}

async function exists(target: string) {
  return stat(target).then(
    () => true,
    () => false,
  );
}

afterEach(async () => {
  while (tempDirectories.length)
    await rm(tempDirectories.pop()!, { recursive: true, force: true });
});

describe("admin workspace asset build", () => {
  it("emits data-free assets without an accessible HTML fallback", async () => {
    const outDir = await tempDirectory();
    const manifest = await buildAdminWorkspace({ outDir, production: true });

    expect(manifest.files).toContain("admin-assets/app.js");
    expect(manifest.files).toContain("admin-assets/app.css");
    expect(manifest.files.some((file) => file.endsWith(".html"))).toBe(false);
    expect(manifest.files.some((file) => file.endsWith(".map"))).toBe(false);
    expect(manifest.sourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.files.every((file) => file.startsWith("admin-assets/"))).toBe(
      true,
    );
    expect(
      manifest.files.every((file) =>
        [".js", ".css", ".woff2", ".txt"].includes(path.extname(file)),
      ),
    ).toBe(true);
    expect(manifest.files).toContain("admin-assets/fonts/LICENSE-Manrope.txt");
    expect(manifest.files).toContain(
      "admin-assets/fonts/LICENSE-SourceSans3.txt",
    );
    expect(manifest.files).toContain(
      "admin-assets/fonts/manrope-latin.woff2",
    );
    expect(manifest.files).toContain(
      "admin-assets/fonts/source-sans-3-latin.woff2",
    );

    const outputs = await outputMap(outDir);
    for (const file of manifest.files) expect(outputs.has(file)).toBe(true);
    expect(outputs.has(".admin-build.json")).toBe(true);

    const javascript = outputs.get("admin-assets/app.js")!.toString("utf8");
    const css = outputs.get("admin-assets/app.css")!.toString("utf8");
    const all = [...outputs.entries()]
      .filter(([file]) => file !== ".admin-build.json")
      .map(([, content]) => content.toString("utf8"))
      .join("\n");

    expect(css).toContain("@font-face");
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/iu);
    expect(css).not.toMatch(/url\(\s*['"]?https?:/iu);
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("fonts.gstatic.com");
    expect(javascript).not.toMatch(/\beval\s*\(/u);
    expect(javascript).not.toMatch(/\bnew\s+Function\s*\(/u);
    expect(javascript).not.toContain("document.write");
    expect(all).not.toContain("fonts.googleapis.com");
    expect(all).not.toContain("fonts.gstatic.com");
    expect(all).not.toContain("unpkg.com");
    expect(all).not.toContain("cdn.jsdelivr.net");
    expect(all).not.toContain("cdnjs.cloudflare.com");
    expect(all).not.toContain("localStorage");
    expect(all).not.toContain("sessionStorage");
    expect(all).not.toContain("sourceMappingURL");
    expect(all).not.toContain("client@example.test");
    expect(all).not.toContain("owner@example.test");
    expect(all).not.toContain("Fern & Forge");
    expect(all).not.toContain("test-onboarding-invite-secret");
    expect(all).not.toContain("BEGIN PRIVATE KEY");
    expect(all).not.toContain("NEON_AUTH_COOKIE_SECRET");
    expect(all).toMatch(/Operations workspace/u);
    expect(all).toMatch(/Not connected/u);
    expect(all).toContain("SIL OPEN FONT LICENSE");
  });

  it("produces reproducible bytes and a stable source digest", async () => {
    const first = await tempDirectory();
    const second = await tempDirectory();
    const firstManifest = await buildAdminWorkspace({
      outDir: first,
      production: true,
    });
    const secondManifest = await buildAdminWorkspace({
      outDir: second,
      production: true,
    });

    expect(firstManifest.files).toEqual(secondManifest.files);
    expect(firstManifest.sourceDigest).toBe(secondManifest.sourceDigest);
    const firstOutputs = await outputMap(first);
    const secondOutputs = await outputMap(second);
    expect([...firstOutputs.keys()]).toEqual([...secondOutputs.keys()]);
    for (const [file, content] of firstOutputs) {
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        createHash("sha256").update(secondOutputs.get(file)!).digest("hex"),
      );
    }
  });

  it("refuses a dirty unowned directory and replaces only its own prior output", async () => {
    const dirty = await tempDirectory();
    await writeFile(path.join(dirty, "stale.html"), "<!doctype html>");
    await expect(
      buildAdminWorkspace({ outDir: dirty, production: true }),
    ).rejects.toThrow(/Refusing to write/u);
    expect(await exists(path.join(dirty, "stale.html"))).toBe(true);
    expect(await exists(path.join(dirty, ".admin-build.json"))).toBe(false);

    const forged = await tempDirectory();
    await writeFile(
      path.join(forged, ".admin-build.json"),
      JSON.stringify({ generator: "someone-else", version: 1 }),
    );
    await expect(
      buildAdminWorkspace({ outDir: forged, production: true }),
    ).rejects.toThrow(/Refusing to write/u);

    const owned = await tempDirectory();
    const first = await buildAdminWorkspace({ outDir: owned, production: true });
    await writeFile(
      path.join(owned, "admin-assets", "stale.html"),
      "<!doctype html>",
    );
    const second = await buildAdminWorkspace({ outDir: owned, production: true });
    expect(await exists(path.join(owned, "admin-assets", "stale.html"))).toBe(
      false,
    );
    expect(second.files).toEqual(first.files);
    expect(second.sourceDigest).toBe(first.sourceDigest);
  });

  it("does not add a public Astro admin route", async () => {
    const pages = await readdir(path.join(ROOT, "src", "pages"), {
      withFileTypes: true,
    });
    expect(
      pages.some((entry) => /^admin(?:\.|$)/iu.test(entry.name)),
    ).toBe(false);
    expect(await exists(path.join(ROOT, "src", "pages", "admin"))).toBe(false);
    expect(await exists(path.join(ROOT, "src", "pages", "admin.astro"))).toBe(
      false,
    );

    const wrangler = await readFile(path.join(ROOT, "wrangler.jsonc"), "utf8");
    expect(wrangler).toMatch(/"binding":\s*"ADMIN_STATIC"/u);
    expect(wrangler).toMatch(/"directory":\s*"\.\/worker\/admin-dist"/u);
    expect(wrangler).toMatch(/"run_worker_first":\s*true/u);
    expect(wrangler).toMatch(
      /"r2_buckets":\s*\[\s*\{\s*"binding":\s*"ASSETS"/u,
    );
  });

  it("builds admin assets before Worker tests and Worker deployment", async () => {
    const validate = await readFile(
      path.join(ROOT, ".github", "workflows", "validate.yml"),
      "utf8",
    );
    const deploy = await readFile(
      path.join(ROOT, ".github", "workflows", "deploy-platform.yml"),
      "utf8",
    );
    expect(validate).toContain("npm run build:admin");
    expect(validate.indexOf("npm run build:admin")).toBeLessThan(
      validate.indexOf("npm run test:worker"),
    );
    expect(deploy).toContain("npm run build:admin");
    expect(deploy.indexOf("npm run build:admin")).toBeLessThan(
      deploy.indexOf("npx wrangler deploy"),
    );
  });
});
