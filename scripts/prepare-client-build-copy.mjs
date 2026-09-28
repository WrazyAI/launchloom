import fs from "node:fs/promises";
import path from "node:path";
import { copyClientBuildInput } from "./client-build-environment.mjs";

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
