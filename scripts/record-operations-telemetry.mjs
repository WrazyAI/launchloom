import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { postOperationsEvent } from "./record-generation-event.mjs";

const PATH_FLAGS = {
  seo: "seo",
  siteConfigUsage: "site-config-usage",
  referenceDnaUsage: "reference-dna-usage",
  preflight: "preflight",
  generatedAssets: "assets",
  assets: "assets",
  creativeRun: "creative-run",
  repairDir: "repair-dir",
};
async function prepareSummary(paths, output, mode, env) {
  const args = [
    fileURLToPath(new URL("./generation-cost-summary.mjs", import.meta.url)),
    "--operations",
    "true",
    "--partial",
    String(mode === "failure"),
    "--output",
    output,
  ];
  for (const [key, value] of Object.entries(paths)) {
    if (!(key in PATH_FLAGS) || typeof value !== "string" || !value)
      throw Error("Invalid artifact path.");
    args.push(`--${PATH_FLAGS[key]}`, value);
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "ignore",
      timeout: 15000,
      env: { ...process.env, ...env },
    });
    child.once("error", () => reject(Error("Summary command unavailable.")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error("Summary command failed.")),
    );
  });
  const stat = await fs.lstat(output);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
    throw Error("Summary bounds exceeded.");
}

/**
 * @typedef {Partial<Record<'seo' | 'siteConfigUsage' | 'referenceDnaUsage' | 'preflight' | 'generatedAssets' | 'assets' | 'creativeRun' | 'repairDir', string>>} TelemetryPaths
 */

/** One boundary owns preparation AND posting. A killed/skipped command cannot
 * produce the positive attempt/build receipt required by the later handoff.
 * @param {({mode: 'failure', buildSha?: string} | {mode: 'preview', buildSha: string}) & {stage?: string, paths?: TelemetryPaths}} options
 * @param {import('./operations-client.mjs').OperationsDependencies} [dependencies]
 * @returns {Promise<void>}
 */
export async function recordOperationsTelemetry(
  { mode, stage = "workflow", buildSha, paths = {} },
  dependencies = {},
) {
  const { env = process.env } = dependencies;
  if (
    !["preview", "failure"].includes(mode) ||
    !env.RUNNER_TEMP ||
    !env.TRACK_ATTEMPT
  )
    throw Error("Operations telemetry preparation failed.");
  const ready = path.join(
    env.RUNNER_TEMP,
    "operations-preview-telemetry-ready",
  );
  const pending = path.join(env.RUNNER_TEMP, "operations-telemetry-preparing");
  const incomplete = path.join(
    env.RUNNER_TEMP,
    "operations-telemetry-incomplete",
  );
  const output = path.join(env.RUNNER_TEMP, `operations-cost-${mode}.json`);
  try {
    if (mode === "preview") {
      if (!/^[a-f0-9]{40}$/u.test(buildSha ?? ""))
        throw Error("Invalid build.");
      await fs.rm(ready, { force: true });
    }
    await fs.writeFile(pending, "pending\n", { mode: 0o600 });
    await prepareSummary(paths, output, mode, env);
    await postOperationsEvent(
      {
        stage: mode === "preview" ? "preview_telemetry" : stage,
        "stage-status": mode === "preview" ? "completed" : "failed",
        "cost-summary": output,
      },
      dependencies,
    );
    if (mode === "preview")
      await fs.writeFile(
        ready,
        JSON.stringify({ attemptId: env.TRACK_ATTEMPT, buildSha }),
        { mode: 0o600 },
      );
    await fs.rm(pending, { force: true });
  } catch {
    await fs.writeFile(incomplete, "incomplete\n", { mode: 0o600 });
    if (mode === "failure") {
      // Preserve the original failure even if summary preparation/cost ingestion
      // fails. No event here can change execution or delivery state.
      try {
        await postOperationsEvent(
          { stage, "stage-status": "failed" },
          dependencies,
        );
      } catch {
        /* fixed outer diagnostic only */
      }
    }
    throw Error("Operations telemetry preparation failed.");
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2)
    options[process.argv[index].replace(/^--/u, "")] = process.argv[index + 1];
  const paths = {
    seo: "/tmp/seo-research.json",
    siteConfigUsage: "/tmp/site-config-usage.json",
    referenceDnaUsage: "/tmp/reference-dna-usage.json",
    preflight: "/tmp/reasoning-preflight.json",
  };
  if (options["client-dir"])
    Object.assign(paths, {
      assets: path.join(
        options["client-dir"],
        ".launchloom/generated-assets.json",
      ),
      creativeRun: path.join(
        options["client-dir"],
        ".launchloom/generated-experiences/creative-run.json",
      ),
      repairDir: path.join(
        options["client-dir"],
        ".launchloom/creative-repair",
      ),
    });
  try {
    await recordOperationsTelemetry({
      mode: options.mode,
      stage: options.stage,
      buildSha: options["build-sha"],
      paths,
    });
    console.log("operations_telemetry=recorded");
  } catch {
    console.error("operations_telemetry=incomplete");
    process.exitCode = 1;
  }
}
