import fs from "node:fs/promises";
import { constants, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

function isSameObject(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertNoSymlinkComponents(absolutePath, label) {
  const parsed = path.parse(absolutePath);
  const segments = absolutePath
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  let current = parsed.root;
  let finalStat = await fs.lstat(current);

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    finalStat = await fs.lstat(current);
    if (finalStat.isSymbolicLink())
      throw new Error(`${label} path contains a symbolic link.`);
    if (index < segments.length - 1 && !finalStat.isDirectory())
      throw new Error(`${label} path has a non-directory component.`);
  }

  return finalStat;
}

async function copyDirectory(sourceHandle, targetPath, relativePath = "") {
  const pinnedSourcePath = `/proc/self/fd/${sourceHandle.fd}`;
  const entries = await fs.readdir(pinnedSourcePath);

  for (const name of entries) {
    const sourceEntry = path.join(pinnedSourcePath, name);
    const targetEntry = path.join(targetPath, name);
    const relativeEntry = relativePath ? path.join(relativePath, name) : name;
    const entryStat = await fs.lstat(sourceEntry);

    if (entryStat.isSymbolicLink())
      throw new Error(
        `Static output contains a symbolic link: ${relativeEntry}`,
      );

    if (entryStat.isDirectory()) {
      const childHandle = await fs.open(sourceEntry, DIRECTORY_FLAGS);
      try {
        const childStat = await childHandle.stat();
        if (!childStat.isDirectory() || !isSameObject(entryStat, childStat))
          throw new Error(
            `Static output directory changed during validation: ${relativeEntry}`,
          );
        await fs.mkdir(targetEntry, { mode: 0o700 });
        await copyDirectory(childHandle, targetEntry, relativeEntry);
      } finally {
        await childHandle.close();
      }
      continue;
    }

    if (!entryStat.isFile())
      throw new Error(
        `Static output contains a special file: ${relativeEntry}`,
      );

    const sourceFile = await fs.open(sourceEntry, FILE_FLAGS);
    let sourceStreamStarted = false;
    try {
      const sourceFileStat = await sourceFile.stat();
      if (!sourceFileStat.isFile() || !isSameObject(entryStat, sourceFileStat))
        throw new Error(
          `Static output file changed during validation: ${relativeEntry}`,
        );
      const sourceStream = sourceFile.createReadStream();
      sourceStreamStarted = true;
      await pipeline(
        sourceStream,
        createWriteStream(targetEntry, {
          flags: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
          mode: 0o600,
        }),
      );
    } finally {
      if (!sourceStreamStarted) await sourceFile.close();
    }
  }
}

/**
 * Validate a static build tree without following links and copy only regular
 * files/directories into a fresh private directory owned by this runner user.
 */
export async function prepareSafeStaticOutput(sourcePath, runnerTempPath) {
  if (process.platform !== "linux")
    throw new Error(
      "Safe static output preparation requires Linux procfs support.",
    );
  const source = path.resolve(sourcePath);
  const parent = path.resolve(runnerTempPath);
  const sourceStat = await assertNoSymlinkComponents(
    source,
    "Static output source",
  );
  const parentStat = await assertNoSymlinkComponents(parent, "Runner temp");
  if (!sourceStat.isDirectory())
    throw new Error("Static output source must be a directory.");
  if (!parentStat.isDirectory())
    throw new Error("Runner temp path must be a directory.");
  if (
    typeof process.getuid === "function" &&
    parentStat.uid !== process.getuid()
  )
    throw new Error(
      "Runner temp directory is not owned by the current runner user.",
    );

  const sourceHandle = await fs.open(source, DIRECTORY_FLAGS);
  let targetPath;
  try {
    const pinnedSourceStat = await sourceHandle.stat();
    if (
      !pinnedSourceStat.isDirectory() ||
      !isSameObject(sourceStat, pinnedSourceStat)
    )
      throw new Error("Static output source changed during validation.");

    targetPath = await fs.mkdtemp(
      path.join(parent, "launchloom-safe-pages-output-"),
    );
    await fs.chmod(targetPath, 0o700);
    const targetStat = await fs.lstat(targetPath);
    if (
      !targetStat.isDirectory() ||
      targetStat.isSymbolicLink() ||
      (typeof process.getuid === "function" &&
        targetStat.uid !== process.getuid())
    )
      throw new Error(
        "Fresh deploy directory is not a runner-owned directory.",
      );

    const sourceRelativeToTarget = path.relative(source, targetPath);
    const targetRelativeToSource = path.relative(targetPath, source);
    if (
      sourceRelativeToTarget === "" ||
      (!sourceRelativeToTarget.startsWith(`..${path.sep}`) &&
        sourceRelativeToTarget !== "..") ||
      targetRelativeToSource === "" ||
      (!targetRelativeToSource.startsWith(`..${path.sep}`) &&
        targetRelativeToSource !== "..")
    )
      throw new Error(
        "Fresh deploy directory must not overlap its source tree.",
      );

    await copyDirectory(sourceHandle, targetPath);
    return targetPath;
  } catch (error) {
    if (targetPath) await fs.rm(targetPath, { recursive: true, force: true });
    throw error;
  } finally {
    await sourceHandle.close();
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if ((key !== "--source" && key !== "--parent") || !value)
      throw new Error(
        "Usage: prepare-safe-static-output.mjs --source DIST --parent RUNNER_TEMP",
      );
    options[key] = value;
  }
  if (!options["--source"] || !options["--parent"])
    throw new Error("Both --source and --parent are required.");
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = await prepareSafeStaticOutput(
    options["--source"],
    options["--parent"],
  );
  process.stdout.write(`${outputPath}${os.EOL}`);
} catch (error) {
  process.stderr.write(
    `${error.message || "Safe static output preparation failed."}${os.EOL}`,
  );
  process.exitCode = 1;
}
