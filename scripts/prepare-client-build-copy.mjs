import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyClientBuildInput } from "./client-build-environment.mjs";

function dependencySignature(manifest) {
  const entries = (value) =>
    Object.entries(value || {}).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  return JSON.stringify({
    name: manifest.name || null,
    type: manifest.type || null,
    dependencies: entries(manifest.dependencies),
    devDependencies: entries(manifest.devDependencies),
  });
}

async function inspectLockfile(filePath) {
  try {
    const lockfile = JSON.parse(await fs.readFile(filePath, "utf8"));
    return {
      exists: true,
      usable:
        Number.isInteger(lockfile.lockfileVersion) &&
        lockfile.lockfileVersion >= 1,
      version: Number.isInteger(lockfile.lockfileVersion)
        ? lockfile.lockfileVersion
        : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT")
      return { exists: false, usable: false, version: null };
    if (error instanceof SyntaxError)
      return { exists: true, usable: false, version: null };
    throw error;
  }
}

const options = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);

if (!options.source || !options.target)
  throw new Error("--source and --target are required.");

const sourceRoot = path.resolve(options.source);
const targetRoot = path.resolve(options.target);
if (
  targetRoot === sourceRoot ||
  targetRoot.startsWith(`${sourceRoot}${path.sep}`) ||
  sourceRoot.startsWith(`${targetRoot}${path.sep}`)
)
  throw new Error("Client build copy must not overlap its source tree.");
const sourceStat = await fs.stat(sourceRoot);
if (!sourceStat.isDirectory())
  throw new Error("Client build source must be a directory.");
await fs.mkdir(path.dirname(targetRoot), { recursive: true });
await copyClientBuildInput(sourceRoot, targetRoot);

const targetLockPath = path.join(targetRoot, "package-lock.json");
const targetShrinkwrapPath = path.join(targetRoot, "npm-shrinkwrap.json");
const [targetLock, targetShrinkwrap] = await Promise.all([
  inspectLockfile(targetLockPath),
  inspectLockfile(targetShrinkwrapPath),
]);

// npm gives npm-shrinkwrap.json precedence over package-lock.json. An invalid
// shrinkwrap must not hide a valid package lock in the isolated build copy.
if (targetShrinkwrap.exists && !targetShrinkwrap.usable)
  await fs.rm(targetShrinkwrapPath, { force: true });

let selectedLockfile = targetShrinkwrap.usable
  ? { path: targetShrinkwrapPath, version: targetShrinkwrap.version }
  : targetLock.usable
    ? { path: targetLockPath, version: targetLock.version }
    : null;

if (!selectedLockfile) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const trustedClientRoot = path.join(repositoryRoot, "templates/client-site");
  const targetManifest = JSON.parse(
    await fs.readFile(path.join(targetRoot, "package.json"), "utf8"),
  );
  const trustedManifest = JSON.parse(
    await fs.readFile(path.join(trustedClientRoot, "package.json"), "utf8"),
  );
  if (
    dependencySignature(targetManifest) !== dependencySignature(trustedManifest)
  )
    throw new Error(
      "Client build copy has no usable lockfile and cannot use the trusted template lockfile because the dependency manifest differs.",
    );
  await fs.rm(targetLockPath, { force: true });
  await fs.rm(targetShrinkwrapPath, { force: true });
  await fs.copyFile(
    path.join(trustedClientRoot, "package-lock.json"),
    targetLockPath,
    fs.constants.COPYFILE_EXCL,
  );
  selectedLockfile = {
    path: targetLockPath,
    version: (await inspectLockfile(targetLockPath)).version,
  };
}

if (!selectedLockfile?.version || selectedLockfile.version < 1)
  throw new Error("Client build copy has no usable npm lockfile.");

process.stdout.write(
  `client_build_lockfile source=${selectedLockfile.path.endsWith("npm-shrinkwrap.json") ? "client-shrinkwrap" : selectedLockfile.path === targetLockPath && targetLock.usable ? "client-package-lock" : "trusted-template"} version=${selectedLockfile.version}\n`,
);
