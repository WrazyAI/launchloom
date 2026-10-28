#!/usr/bin/env node
// Build and run the same rendered and SEO gates the workflow runs, before
// dispatching. Form delivery is verified against an intercepted synthetic
// provider, so a local config only needs placeholder lead credentials.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function argument(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
  });
}

function copyTree(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) =>
      !entry.includes(`${path.sep}node_modules`) &&
      !entry.includes(`${path.sep}dist`),
  });
}

const argv = process.argv.slice(2);
const configPath = argument(argv, "--config");
const shouldBuild = argv.includes("--build");
if (!configPath) {
  console.error(
    "Usage: node scripts/local-release-check.mjs --config <site.config.json> (--dist <dist> | --build) [--screenshots <dir>]",
  );
  process.exit(2);
}
const resolvedConfig = path.resolve(configPath);
if (!fs.existsSync(resolvedConfig)) {
  console.error("Config path does not exist.");
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(resolvedConfig, "utf8"));
const syntheticOrigin = "https://leads.invalid";
const needsLead = !config.lead?.apiUrl || !config.lead?.token;
if (needsLead) {
  config.lead = {
    ...(config.lead || {}),
    apiUrl: config.lead?.apiUrl || `${syntheticOrigin}/api/lead`,
    token: config.lead?.token || "local-verification-token",
  };
  console.log(
    "lead=placeholder The rendered verifier intercepts synthetic delivery; no real lead is sent.",
  );
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-local-check-"));
const effectiveConfig = path.join(workdir, "site.config.json");
fs.writeFileSync(effectiveConfig, `${JSON.stringify(config, null, 2)}\n`);

let dist = argument(argv, "--dist");
if (shouldBuild) {
  const template = argument(
    argv,
    "--template",
    "templates/client-site",
  );
  const workspace = path.join(workdir, "site");
  copyTree(template, workspace);
  fs.writeFileSync(
    path.join(workspace, "src/site.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  const foundationId = config.design?.experience?.foundationId;
  if (config.design?.experience?.renderer === "foundation" && foundationId) {
    const source = path.join(
      "data/reference-library/dossiers",
      foundationId,
      "foundation",
    );
    if (fs.existsSync(source)) {
      copyTree(source, path.join(workspace, "src/foundations", foundationId));
    } else {
      console.error(`Foundation not found: ${foundationId}`);
      process.exit(2);
    }
  }
  const rootModules = path.resolve("node_modules");
  const localModules = path.join(workspace, "node_modules");
  if (!fs.existsSync(localModules)) fs.symlinkSync(rootModules, localModules);
  run("npm", ["run", "build"], {
    cwd: workspace,
    env: {
      PUBLIC_REVIEW_MODE: "true",
      PUBLIC_LAUNCHLOOM_API_URL: syntheticOrigin,
    },
  });
  dist = path.join(workspace, "dist");
}

if (!dist || !fs.existsSync(path.resolve(dist))) {
  console.error("Dist path does not exist. Pass --dist or --build.");
  process.exit(2);
}
const resolvedDist = path.resolve(dist);
const screenshots =
  argument(argv, "--screenshots") || path.join(workdir, "screenshots");
const report = path.join(workdir, "route-technical-report.json");

let failed = false;
try {
  console.log("gate=rendered");
  run(
    process.execPath,
    [
      "scripts/verify-rendered-revision.mjs",
      "--config",
      effectiveConfig,
      "--dist",
      resolvedDist,
      "--screenshots",
      screenshots,
    ],
    { env: { PUBLIC_REVIEW_MODE: "true" } },
  );
} catch {
  failed = true;
  console.error("gate=rendered failed");
}

if (!failed) {
  try {
    console.log("gate=seo");
    run(process.execPath, [
      "scripts/seo-release-gate.mjs",
      "--mode",
      "review",
      "--config",
      effectiveConfig,
      "--dist",
      resolvedDist,
      "--report",
      report,
    ]);
  } catch {
    failed = true;
    console.error("gate=seo failed");
  }
}

console.log(
  JSON.stringify({
    ok: !failed,
    config: resolvedConfig,
    dist: resolvedDist,
    screenshots,
    report,
  }),
);
process.exit(failed ? 1 : 0);
