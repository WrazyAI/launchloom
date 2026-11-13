#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[a-f0-9]{40}$/u;
const REPO =
  /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const PROJECT = /^[a-z0-9][a-z0-9-]{1,62}$/u;
const CANDIDATE = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const RENDERERS = new Set(["creative", "foundation", "pack"]);
const IMAGE = /\.(?:png|jpe?g|webp)$/iu;
const EXCLUDED_SOURCE = new Set(["node_modules", ".git", "dist", ".astro"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function copyCandidate(source, target) {
  await fs.cp(source, path.join(target, "candidate"), {
    recursive: true,
    filter: (entry) => !EXCLUDED_SOURCE.has(path.basename(entry)),
  });
}

async function copyScreenshots(source, target) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  const images = entries.filter(
    (entry) => entry.isFile() && IMAGE.test(entry.name),
  );
  if (!images.length) return null;
  const directory = path.join(target, "screenshots");
  await fs.mkdir(directory, { recursive: true });
  for (const image of images)
    await fs.copyFile(
      path.join(source, image.name),
      path.join(directory, image.name),
    );
  return "screenshots";
}

async function copyFindings(sources, target) {
  const directory = path.join(target, "findings");
  const names = new Set();
  const copied = [];
  for (const source of sources) {
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.isFile()) continue;
    await fs.mkdir(directory, { recursive: true });
    const base =
      path.basename(source).replace(/[^A-Za-z0-9_.-]/gu, "_") || "finding";
    let name = base;
    let index = 2;
    while (names.has(name)) {
      name = `${index}-${base}`;
      index += 1;
    }
    names.add(name);
    await fs.copyFile(source, path.join(directory, name));
    copied.push(`findings/${name}`);
  }
  return copied.length ? copied : null;
}

/**
 * Package the selected build for a local design repair agent.
 *
 * The bundle is private evidence: candidate source, screenshots, config,
 * findings, and the exact redeploy command. The manifest never contains
 * credentials or private configuration values.
 *
 * @param {Record<string, any>} [input]
 */
export async function buildRepairBundle({
  outputDir,
  attemptId,
  clientRepo,
  projectName,
  buildSha,
  renderer,
  candidateId = null,
  previewUrl = null,
  candidateDir = null,
  screenshotsDir = null,
  configPath = null,
  findingsPaths = [],
  createdAt = new Date().toISOString(),
} = {}) {
  assert(
    typeof outputDir === "string" && outputDir.trim(),
    "A bundle output directory is required.",
  );
  assert(
    typeof attemptId === "string" &&
      attemptId.length > 0 &&
      attemptId.length <= 200 &&
      !/[/\\]/u.test(attemptId),
    "A safe attempt id is required.",
  );
  assert(
    typeof clientRepo === "string" && REPO.test(clientRepo),
    "A GitHub owner/repository is required.",
  );
  assert(
    typeof projectName === "string" && PROJECT.test(projectName),
    "A safe Pages project name is required.",
  );
  assert(
    typeof buildSha === "string" && SHA.test(buildSha),
    "A full lowercase build SHA is required.",
  );
  assert(RENDERERS.has(renderer), "Unknown effective renderer.");
  assert(
    candidateId === null ||
      (typeof candidateId === "string" && CANDIDATE.test(candidateId)),
    "A safe candidate id is required.",
  );
  if (previewUrl !== null)
    assert(
      typeof previewUrl === "string" && previewUrl.startsWith("https://"),
      "Preview URL must be HTTPS.",
    );

  const target = path.resolve(outputDir);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  const files = {};

  if (candidateDir) {
    const stat = await fs.stat(candidateDir).catch(() => null);
    assert(stat?.isDirectory(), "Candidate source directory is missing.");
    await copyCandidate(candidateDir, target);
    files.candidate = "candidate";
  }
  if (screenshotsDir) {
    const stat = await fs.stat(screenshotsDir).catch(() => null);
    if (stat?.isDirectory()) {
      const copied = await copyScreenshots(screenshotsDir, target);
      if (copied) files.screenshots = copied;
    }
  }
  if (configPath) {
    const stat = await fs.stat(configPath).catch(() => null);
    if (stat?.isFile()) {
      await fs.copyFile(configPath, path.join(target, "site.config.json"));
      files.config = "site.config.json";
    }
  }
  const findings = await copyFindings(
    Array.isArray(findingsPaths) ? findingsPaths : [],
    target,
  );
  if (findings) files.findings = findings;

  const repairBranch = `repair-${String(attemptId).replace(
    /[^A-Za-z0-9._-]/gu,
    "-",
  )}`;
  const redeployCommand = [
    `git clone https://github.com/${clientRepo}.git ${projectName}`,
    `cd ${projectName}`,
    `git checkout ${buildSha}`,
    `git switch -c ${repairBranch}`,
    "cp -R ../candidate/. src/generated-experiences/selected/",
    "cp ../site.config.json src/site.config.json",
    "git add src/generated-experiences/selected src/site.config.json",
    `git commit -m "Apply repaired design ${attemptId}"`,
    "npm ci",
    "npm run build",
    `npx wrangler pages deploy dist --project-name ${projectName} --branch review-initial --commit-hash "$(git rev-parse HEAD)" --commit-message "Repair redeploy ${attemptId}"`,
  ].join(" && ");

  const manifest = {
    version: 1,
    attemptId,
    clientRepo,
    projectName,
    buildSha,
    renderer,
    candidateId,
    previewUrl: previewUrl || null,
    createdAt,
    files,
    redeployCommand,
  };
  await fs.writeFile(
    path.join(target, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(target, "README.md"),
    [
      "# LaunchLoom repair bundle",
      "",
      `Private evidence for attempt ${attemptId}. This bundle contains private client source and must not be published or attached to a public issue.`,
      "",
      "## Contents",
      "",
      "- `candidate/`: selected candidate source, when present.",
      "- `screenshots/`: rendered desktop, compact, and mobile evidence, when present.",
      "- `site.config.json`: the selected site configuration, when present.",
      "- `findings/`: gate and warning evidence, when present.",
      "",
      "## Redeploy",
      "",
      "Run the command in `manifest.json` from a machine with Wrangler access:",
      "",
      "```bash",
      redeployCommand,
      "```",
      "",
    ].join("\n"),
  );
  return manifest;
}

export function parseRepairBundleArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = String(argv[index + 1] || "");
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    if (key === "findings") args.findings = [...(args.findings || []), value];
    else args[key] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseRepairBundleArgs(process.argv.slice(2));
  const manifest = await buildRepairBundle({
    outputDir: args.out || args.output || args.outputDir,
    attemptId: args.attempt || args.attemptId,
    clientRepo: args.repo || args.clientRepo,
    projectName: args.project || args.projectName,
    buildSha: args.sha || args.buildSha,
    renderer: args.renderer,
    candidateId: args.candidate || null,
    previewUrl: args.preview || null,
    candidateDir: args.candidateDir || null,
    screenshotsDir: args.screenshotsDir || null,
    configPath: args.config || null,
    findingsPaths: args.findings || [],
  });
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
