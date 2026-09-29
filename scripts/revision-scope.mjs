import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { revisionTemplateWritePaths } from "./revision-template-paths.mjs";

const [action, ...rawArgs] = process.argv.slice(2);
const args = {};
for (let index = 0; index < rawArgs.length; index++) {
  const flag = rawArgs[index];
  if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
  const next = rawArgs[index + 1];
  args[flag.slice(2)] =
    next === undefined || next.startsWith("--") ? "true" : next;
  if (next !== undefined && !next.startsWith("--")) index++;
}
const client = path.resolve(String(args.client || ""));
if (
  !args.client ||
  !["create", "create-empty", "preflight", "validate"].includes(action)
)
  throw new Error(
    "Usage: revision-scope.mjs create|create-empty|preflight|validate --client <repo> ...",
  );

function git(parameters, input) {
  const result = spawnSync("git", ["-C", client, ...parameters], {
    input,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`git ${parameters.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function names(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function validPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !path.posix.isAbsolute(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function validateManifest(manifest) {
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.baseSha || "") ||
    !Array.isArray(manifest.allowedPaths) ||
    !manifest.allowedPaths.every(validPath) ||
    new Set(manifest.allowedPaths).size !== manifest.allowedPaths.length
  )
    throw new Error("Invalid manifest path or revision scope manifest.");
  const actualBase = git([
    "rev-parse",
    "--verify",
    `${manifest.baseSha}^{commit}`,
  ])
    .toString()
    .trim();
  if (actualBase !== manifest.baseSha)
    throw new Error("Revision base SHA is not a commit.");
  git(["merge-base", "--is-ancestor", manifest.baseSha, "HEAD"]);
}

async function outsideClient(file) {
  const clientRoot = await fs.realpath(client);
  const absoluteFile = path.resolve(file);
  const fileInfo = await fs.lstat(absoluteFile).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (fileInfo?.isSymbolicLink() || (fileInfo?.isFile() && fileInfo.nlink > 1))
    throw new Error(
      "Revision scope manifest must be a non-linked file outside the client repository.",
    );
  const canonicalParent = await fs.realpath(path.dirname(absoluteFile));
  const canonicalFile = path.join(canonicalParent, path.basename(absoluteFile));
  const relative = path.relative(clientRoot, canonicalFile);
  if (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`))
  )
    throw new Error(
      "Revision scope manifest must be outside the client repository.",
    );
}

if (action === "create-empty") {
  if (!args.base || !args.out)
    throw new Error("create-empty requires --base and --out.");
  await outsideClient(args.out);
  const manifest = { version: 1, baseSha: args.base, allowedPaths: [] };
  validateManifest(manifest);
  await fs.writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("revision_scope_allowed=0");
} else if (action === "preflight") {
  if (!args.base) throw new Error("preflight requires --base.");
  const baseSha = git(["rev-parse", "--verify", `${args.base}^{commit}`])
    .toString()
    .trim();
  const headSha = git(["rev-parse", "HEAD"]).toString().trim();
  if (baseSha !== args.base || headSha !== baseSha)
    throw new Error(
      "Revision preflight base SHA must match the clean client HEAD.",
    );
  const status = git(["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (status.length)
    throw new Error("Revision preflight requires a clean client checkout.");
  const operationKinds = [
    "set_social_proof",
    "show_brand_name",
    "set_color_palette",
    "set_conversion_feature",
    "set_section_enabled",
  ];
  const potentialWrites = [
    "AGENTS.md",
    "docs/site-generation-guidelines.md",
    "src/site.config.json",
    "src/generated-experiences/selected/Experience.jsx",
    "src/generated-experiences/selected/styles.css",
    "src/generated-experiences/selected/motion.js",
    ...revisionTemplateWritePaths({
      business: { primaryCta: "get directions" },
      design: { experience: { packId: "preflight" } },
      revisionReport: {
        operations: [
          ...operationKinds.map((kind) => ({ kind })),
          { kind: "set_copy", field: "heroHeading" },
        ],
      },
    }),
  ];
  const trees = [
    git(["ls-tree", "-r", "-z", baseSha]),
    git(["ls-files", "--stage", "-z"]),
  ];
  assertNoLinkedDestinations(potentialWrites, trees);
  await assertNoLinkedFilesystemDestinations(potentialWrites);
  console.log(`revision_scope_preflight_paths=${potentialWrites.length}`);
} else if (action === "create") {
  if (
    !args.base ||
    !args.out ||
    !args["guidelines-written"] ||
    !["true", "false"].includes(args["repair-required"])
  )
    throw new Error(
      "create requires --base, --out, --guidelines-written and --repair-required.",
    );
  const guidelines = JSON.parse(
    await fs.readFile(args["guidelines-written"], "utf8"),
  );
  if (
    !Array.isArray(guidelines) ||
    !guidelines.every((entry) =>
      ["AGENTS.md", "docs/site-generation-guidelines.md"].includes(entry),
    ) ||
    !guidelines.includes("docs/site-generation-guidelines.md")
  )
    throw new Error("Invalid guidelines-written evidence.");
  const config = JSON.parse(
    await fs.readFile(path.join(client, "src/site.config.json"), "utf8"),
  );
  const repairRequired =
    config.design?.experience?.renderer === "creative-candidate" &&
    Boolean(config.revisionReport?.creativeSourceRepairRequired);
  if ((args["repair-required"] === "true") !== repairRequired)
    throw new Error(
      "Creative repair scope does not match the prepared revision state.",
    );
  const selectedCandidateId = String(
    config.design?.experience?.candidateId || "",
  );
  const repairVerification = config.revisionReport?.creativeSourceRepairVerified;
  const repairVerified = Boolean(
    repairRequired &&
      repairVerification?.pass === true &&
      selectedCandidateId &&
      repairVerification.candidateId === selectedCandidateId,
  );
  if (repairRequired && !repairVerified)
    throw new Error(
      "Creative source repair is not verified for the selected candidate; authored files cannot enter the revision scope.",
    );
  const candidates =
    repairVerified
      ? [
          "src/generated-experiences/selected/Experience.jsx",
          "src/generated-experiences/selected/styles.css",
          "src/generated-experiences/selected/motion.js",
        ]
      : [];
  const manifest = {
    version: 1,
    baseSha: args.base,
    allowedPaths: [
      ...new Set([
        "src/site.config.json",
        ...revisionTemplateWritePaths(config),
        ...guidelines,
        ...candidates,
      ]),
    ].sort(),
  };
  validateManifest(manifest);
  await outsideClient(args.out);
  await fs.writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`revision_scope_allowed=${manifest.allowedPaths.length}`);
} else {
  if (!args.manifest) throw new Error("validate requires --manifest.");
  await outsideClient(args.manifest);
  const manifest = JSON.parse(await fs.readFile(args.manifest, "utf8"));
  validateManifest(manifest);
  const allowed = new Set(manifest.allowedPaths);
  const sinceBase = names(
    git(["diff", "--name-only", "-z", "--no-renames", manifest.baseSha, "--"]),
  );
  const trackedWorking = names(
    git(["diff", "--name-only", "-z", "--no-renames", "HEAD", "--"]),
  );
  const untracked = names(
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
  );
  const staged = names(
    git([
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--no-renames",
      "HEAD",
      "--",
    ]),
  );
  const changed = [
    ...new Set([...sinceBase, ...trackedWorking, ...untracked, ...staged]),
  ].sort();
  for (const entry of changed) {
    if (!validPath(entry)) throw new Error(`Invalid changed path: ${entry}`);
    if (!allowed.has(entry))
      throw new Error(`Path outside revision scope: ${entry}`);
  }
  const trees = [
    git(["ls-tree", "-r", "-z", manifest.baseSha]),
    git(["ls-files", "--stage", "-z"]),
  ];
  assertNoLinkedDestinations([...changed, ...allowed], trees);
  await assertNoLinkedFilesystemDestinations([...changed, ...allowed]);
  if (args.stage === "true") {
    const toStage = [
      ...new Set([...trackedWorking, ...untracked, ...staged]),
    ].sort();
    if (toStage.length)
      git(
        [
          "--literal-pathspecs",
          "add",
          "-A",
          "--pathspec-from-file=-",
          "--pathspec-file-nul",
        ],
        Buffer.from(`${toStage.join("\0")}\0`),
      );
    const actual = names(
      git([
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--no-renames",
        "HEAD",
        "--",
      ]),
    );
    if (actual.some((entry) => !allowed.has(entry)))
      throw new Error("Staged path outside revision scope.");
    console.log(`revision_scope_paths=${actual.length}`);
  } else {
    console.log(`revision_scope_valid=${changed.length}`);
  }
}

function symlinkPaths(tree) {
  return names(tree)
    .map((record) => {
      const separator = record.indexOf("\t");
      return {
        metadata: record.slice(0, separator),
        entry: record.slice(separator + 1),
      };
    })
    .filter(({ metadata }) => metadata.startsWith("120000 "))
    .map(({ entry }) => entry);
}

function assertNoLinkedDestinations(paths, trees) {
  for (const tree of trees) {
    for (const linkedPath of symlinkPaths(tree)) {
      if (
        paths.some(
          (entry) => entry === linkedPath || entry.startsWith(`${linkedPath}/`),
        )
      )
        throw new Error(
          `Revision destination reaches a tracked symlink: ${linkedPath}`,
        );
    }
  }
}

async function assertNoLinkedFilesystemDestinations(paths) {
  for (const entry of paths) {
    let current = client;
    for (const segment of entry.split("/")) {
      current = path.join(current, segment);
      const stat = await fs.lstat(current).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (stat?.isSymbolicLink())
        throw new Error(`Revision destination reaches a symlink: ${entry}`);
      if (!stat) break;
    }
  }
}
