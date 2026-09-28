import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildRevisionAllowedPaths,
  assertRevisionChangedPathsAllowed,
} from "./revision-change-scope.mjs";

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

function gitPaths(client, args) {
  const output = execFileSync("git", args, {
    cwd: client,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.toString("utf8").split("\0").filter(Boolean);
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.client || !args["template-report"])
    throw new Error("--client and --template-report are required.");
  const client = path.resolve(args.client);
  const baseRef = String(args.base || "").trim();
  if (!baseRef || /\s/u.test(baseRef))
    throw new Error("--base must name the trusted PR base ref or commit.");
  const config = JSON.parse(
    await fs.readFile(path.join(client, "src/site.config.json"), "utf8"),
  );
  const templateReport = JSON.parse(
    await fs.readFile(path.resolve(args["template-report"]), "utf8"),
  );
  if (templateReport?.version !== 1 || !Array.isArray(templateReport.files))
    throw new Error("Revision template sync report is missing or invalid.");

  const mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
    cwd: client,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!mergeBase)
    throw new Error(`Could not find a trusted merge base for '${baseRef}'.`);
  const changedPaths = [
    ...gitPaths(client, [
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      mergeBase,
      "HEAD",
    ]),
    ...gitPaths(client, ["diff", "--no-renames", "--name-only", "-z", "HEAD"]),
    ...gitPaths(client, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  const allowedPaths = buildRevisionAllowedPaths({
    templateFiles: templateReport.files,
    creativeSourceRepairRequired:
      config.revisionReport?.creativeSourceRepairRequired === true,
    creativeSourceRepairVerified:
      config.revisionReport?.creativeSourceRepairVerified || null,
    selectedCandidateId: config.design?.experience?.candidateId || "",
  });
  const approvedChanges = assertRevisionChangedPathsAllowed(
    changedPaths,
    allowedPaths,
  );
  console.log(
    JSON.stringify({
      status: "passed",
      changedPaths: approvedChanges,
      creativeBundleAllowed: allowedPaths.includes(
        "src/generated-experiences/selected/Experience.jsx",
      ),
    }),
  );
}

await main();
