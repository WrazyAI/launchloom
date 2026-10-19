import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(ROOT, "worker", "admin-dist");
const MARKER_NAME = ".admin-build.json";
const MARKER = {
  generator: "launchloom-admin-workspace",
  version: 1,
};
const ALLOWED_EXTENSIONS = new Set([".js", ".css", ".woff2", ".txt"]);

async function pathRecord(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function validateOutputDirectory(outDir) {
  const resolved = path.resolve(outDir);
  if (
    resolved === ROOT ||
    ROOT.startsWith(`${resolved}${path.sep}`) ||
    resolved === path.parse(resolved).root
  )
    throw new Error("Refusing to use the repository root as an admin output directory.");

  const record = await pathRecord(resolved);
  if (!record) return { owned: false, exists: false };
  if (record.isSymbolicLink())
    throw new Error("Refusing to use a symbolic link as an admin output directory.");
  if (!record.isDirectory())
    throw new Error("The admin output path must be a directory.");

  const entries = await readdir(resolved);
  if (entries.length === 0) return { owned: false, exists: true };

  let marker = null;
  try {
    marker = JSON.parse(await readFile(path.join(resolved, MARKER_NAME), "utf8"));
  } catch {
    marker = null;
  }
  if (
    !marker ||
    marker.generator !== MARKER.generator ||
    marker.version !== MARKER.version
  )
    throw new Error(
      "Refusing to write into a non-empty directory that is not an owned admin build output.",
    );
  return { owned: true, exists: true };
}

async function clearOwnedDirectory(outDir) {
  const entries = await readdir(outDir);
  for (const entry of entries)
    await rm(path.join(outDir, entry), { recursive: true, force: true });
}

async function collectFiles(outDir) {
  const files = [];
  async function walk(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Refusing to publish a symbolic link: ${relative}`);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!entry.isFile())
        throw new Error(`Unexpected admin build entry: ${relative}`);
      if (relative === MARKER_NAME) continue;
      if (relative.includes("\\") || relative.split("/").includes(".."))
        throw new Error(`Unsafe admin build path: ${relative}`);
      if (!relative.startsWith("admin-assets/"))
        throw new Error(`Admin build file escaped admin-assets: ${relative}`);
      if (!ALLOWED_EXTENSIONS.has(path.extname(relative)))
        throw new Error(`Unsupported admin build artifact: ${relative}`);
      files.push(relative);
    }
  }
  await walk(outDir, "");
  files.sort((left, right) => left.localeCompare(right, "en"));
  return files;
}

async function copyFontLicenses(assetsDir) {
  const fontsDir = path.join(ROOT, "src", "admin", "fonts");
  const entries = await readdir(fontsDir, { withFileTypes: true });
  const outputFonts = path.join(assetsDir, "fonts");
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
    await mkdir(outputFonts, { recursive: true });
    await copyFile(
      path.join(fontsDir, entry.name),
      path.join(outputFonts, entry.name),
    );
  }
}

async function digestFiles(outDir, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.join(outDir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Build the data-free same-origin admin assets. The output directory is either
 * empty, absent, or a previously generated directory carrying our marker. Any
 * other non-empty directory is refused rather than recursively deleted.
 */
export async function buildAdminWorkspace({
  outDir = DEFAULT_OUT_DIR,
  production = true,
} = {}) {
  const resolvedOut = path.resolve(outDir);
  const state = await validateOutputDirectory(resolvedOut);
  if (state.owned) await clearOwnedDirectory(resolvedOut);
  await mkdir(resolvedOut, { recursive: true });
  const assetsDir = path.join(resolvedOut, "admin-assets");

  await build({
    absWorkingDir: ROOT,
    entryPoints: { app: path.join(ROOT, "src", "admin", "main.tsx") },
    outdir: assetsDir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    jsx: "automatic",
    jsxImportSource: "react",
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "fonts/[name]",
    loader: { ".woff2": "file" },
    minify: production,
    sourcemap: false,
    legalComments: "none",
    treeShaking: true,
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
    },
  });

  await copyFontLicenses(assetsDir);

  const files = await collectFiles(resolvedOut);
  if (!files.includes("admin-assets/app.js"))
    throw new Error("The admin build did not emit admin-assets/app.js.");
  if (!files.includes("admin-assets/app.css"))
    throw new Error("The admin build did not emit admin-assets/app.css.");
  if (files.some((file) => file.endsWith(".html")))
    throw new Error("The admin build must not emit HTML.");
  if (files.some((file) => file.endsWith(".map")))
    throw new Error("The admin build must not emit source maps.");

  const sourceDigest = await digestFiles(resolvedOut, files);
  await writeFile(
    path.join(resolvedOut, MARKER_NAME),
    `${JSON.stringify(MARKER, null, 2)}\n`,
  );
  return { files, sourceDigest };
}

const invokedAsScript =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  const manifest = await buildAdminWorkspace();
  console.log(
    JSON.stringify(
      { files: manifest.files, sourceDigest: manifest.sourceDigest },
      null,
      2,
    ),
  );
}
