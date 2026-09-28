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
const lockExists = await Promise.any([
  fs.access(targetLockPath),
  fs.access(targetShrinkwrapPath),
]).then(
  () => true,
  () => false,
);
if (!lockExists) {
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
      "Client build copy has no lockfile and cannot use the trusted template lockfile because the dependency manifest differs.",
    );
  await fs.copyFile(
    path.join(trustedClientRoot, "package-lock.json"),
    targetLockPath,
    fs.constants.COPYFILE_EXCL,
  );
}
