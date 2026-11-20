import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { generationStageOutcomes } from "./generation-stage-outcomes.mjs";
import { extractFailureEvidence } from "./capture-step-failure.mjs";

const exec = promisify(execFile);
const REPOSITORY = "WrazyAI/launchloom";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultGh = async (args, { json = false } = {}) => {
  const { stdout } = await exec("gh", args, {
    maxBuffer: 30 * 1024 * 1024,
    timeout: 120_000,
  });
  return json ? JSON.parse(stdout) : stdout;
};

/**
 * Enrich recent failed attempts with a bounded reason. Never stores logs.
 * @param {{limit?: number, dryRun?: boolean, gh?: Function, post?: Function, log?: Function, pause?: Function}} [options]
 */
export async function backfillFailureReasons({
  limit = 20,
  dryRun = true,
  gh = defaultGh,
  post = async () => {
    throw new Error("failure evidence sink required");
  },
  log = () => {},
  pause = sleep,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("invalid limit");
  const runs = await gh(
    [
      "run",
      "list",
      "--repo",
      REPOSITORY,
      "--workflow",
      "generate-client.yml",
      "--status",
      "failure",
      "--limit",
      String(limit),
      "--json",
      "databaseId,attempt,displayTitle,conclusion",
    ],
    { json: true },
  );
  const report = { examined: 0, updated: 0, skipped: 0, failed: 0, dryRun };
  for (const run of runs) {
    report.examined += 1;
    try {
      const detail = await gh(
        [
          "run",
          "view",
          String(run.databaseId),
          "--repo",
          REPOSITORY,
          "--attempt",
          String(run.attempt || 1),
          "--json",
          "jobs",
        ],
        { json: true },
      );
      const outcomes = generationStageOutcomes(detail.jobs || [], Date.now());
      const stage =
        outcomes.find((outcome) => outcome.status === "failed")?.stage ??
        "workflow";
      const logText = await gh([
        "run",
        "view",
        String(run.databaseId),
        "--repo",
        REPOSITORY,
        "--attempt",
        String(run.attempt || 1),
        "--log-failed",
      ]);
      const evidence = extractFailureEvidence(logText, 1);
      const code = `LL_${stage.toUpperCase()}_${evidence.code}`.slice(0, 80);
      if (dryRun) {
        log(`${run.databaseId}:${run.attempt} would record ${code}`);
        report.updated += 1;
        continue;
      }
      const response = await post({
        repository: REPOSITORY,
        runId: String(run.databaseId),
        runAttempt: run.attempt || 1,
        code,
        detail: evidence.detail,
      });
      if (response === "not_found") report.skipped += 1;
      else report.updated += 1;
    } catch {
      report.failed += 1;
    }
    await pause(250);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? "" : args[index + 1] || "";
  };
  const limit = Number(value("limit") || 20);
  const dryRun = args.includes("--dry-run");
  const api = (
    process.env.LAUNCHLOOM_API_URL || "https://api.launchloom.wrazyos.com"
  ).replace(/\/$/u, "");
  const secret = process.env.GENERATION_TRACKING_SECRET || "";
  if (!dryRun && !secret) throw new Error("tracking secret required");
  const post = async (body) => {
    const response = await fetch(
      `${api}/api/internal/generation-failure-evidence`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (response.status === 404) return "not_found";
    if (!response.ok) throw new Error(`backfill failed ${response.status}`);
    return "updated";
  };
  const report = await backfillFailureReasons({
    limit,
    dryRun,
    post,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify(report));
}
