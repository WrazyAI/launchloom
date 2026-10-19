import fs from "node:fs/promises";
import {
  buildAttemptObservation,
  parseGenerationRunName,
  TRACKING_REPOSITORY,
} from "./generation-tracking-contract.mjs";

const workflows = ["generate-client.yml", "test-generation.yml"];
const api = `https://api.github.com/repos/${TRACKING_REPOSITORY}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestamp = (v) => {
  const n = Date.parse(v);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("invalid GitHub timestamp");
  return n;
};
const conclusion = (run) =>
  run.status !== "completed"
    ? run.status === "in_progress"
      ? "running"
      : "queued"
    : ({
        success: "succeeded",
        failure: "failed",
        cancelled: "cancelled",
        skipped: "skipped",
        timed_out: "failed",
        action_required: "failed",
        startup_failure: "failed",
        neutral: "skipped",
      }[run.conclusion] ?? "unknown");

/** GET-only retained metadata reader. No logs, private source/artifacts, dispatch,
 * notifications or providers. Writes are restricted to the injected batch sink.
 * Incremental traversals repeat all retained pages (including older reruns), with
 * overlap of the current page on failure. A budget resumes, never skips, a page.
 */
export async function reconcileGenerationHistory({
  mode = "incremental",
  from = 0,
  dryRun = true,
  pageBudget = 10,
  deadlineMs = 90000,
  fetchImpl = fetch,
  postImpl,
  checkpoint = null,
  sleepImpl = sleep,
  now = Date.now,
  token = process.env.GH_TOKEN,
} = {}) {
  if (
    !["incremental", "backfill"].includes(mode) ||
    !Number.isSafeInteger(pageBudget) ||
    pageBudget < 1 ||
    pageBudget > 100 ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 90000
  )
    throw new Error("invalid reconciliation options");
  const start = now();
  const deadline = start + deadlineMs;
  const initial = checkpoint
    ? typeof checkpoint === "string"
      ? JSON.parse(checkpoint)
      : { ...checkpoint }
    : {
        workflow: 0,
        page: 1,
        from: typeof from === "number" ? from : timestamp(from),
      };
  if (
    !Number.isInteger(initial.workflow) ||
    initial.workflow < 0 ||
    initial.workflow > 1 ||
    !Number.isInteger(initial.page) ||
    initial.page < 1 ||
    initial.page > 100000 ||
    !Number.isSafeInteger(initial.from) ||
    initial.from < 0 ||
    (initial.partial !== undefined && typeof initial.partial !== "boolean")
  )
    throw new Error("invalid checkpoint");
  let cursor = { ...initial };
  let pages = 0;
  const report = {
    complete: false,
    nextCheckpoint: JSON.stringify(cursor),
    coverageStart: null,
    readCount: 0,
    upsertCount: 0,
    warnings: [],
    errors: [],
  };
  if (initial.partial)
    report.warnings.push("Earlier pages have incomplete evidence.");
  const seen = new Set();
  async function get(url, allowExpired = false) {
    for (let retry = 0; retry < 3; retry++) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error("deadline exceeded");
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(15000, remaining))),
      });
      report.readCount++;
      if (response.ok) return response.json();
      if (allowExpired && [404, 410].includes(response.status)) return null;
      if (![429, 500, 502, 503, 504].includes(response.status) || retry === 2)
        throw new Error(`GitHub metadata unavailable (${response.status})`);
      await sleepImpl(
        Math.min(1000 * (retry + 1), Math.max(0, deadline - now())),
      );
    }
  }
  async function jobsFor(run) {
    const jobs = [];
    const ids = new Set();
    let total = null;
    for (let page = 1; page <= 10; page++) {
      const body = await get(
        `${api}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
        true,
      );
      if (body === null) {
        report.warnings.push(
          "Job evidence expired; failure details not recorded.",
        );
        return [];
      }
      if (
        !body ||
        !Array.isArray(body.jobs) ||
        body.jobs.length > 100 ||
        !Number.isSafeInteger(body.total_count) ||
        body.total_count < 0 ||
        (total !== null && total !== body.total_count)
      )
        throw new Error("invalid GitHub jobs page");
      total = body.total_count;
      for (const job of body.jobs) {
        if (
          !job ||
          typeof job !== "object" ||
          Array.isArray(job) ||
          !Number.isSafeInteger(job.id) ||
          job.id < 1 ||
          ids.has(job.id)
        )
          throw new Error("invalid GitHub jobs page");
        ids.add(job.id);
      }
      jobs.push(...body.jobs);
      // Counts represent distinct jobs, not raw page lengths. A short/duplicate
      // page must never advance the enclosing run-page cursor or invent its end.
      if (
        jobs.length > total ||
        (body.jobs.length < 100 && jobs.length < total)
      )
        throw new Error("invalid GitHub jobs page");
      if (jobs.length === total) return jobs;
    }
    throw new Error("job page budget exceeded");
  }
  try {
    const repository = await get(api);
    if (
      repository.full_name !== TRACKING_REPOSITORY ||
      !Number.isSafeInteger(repository.id)
    )
      throw new Error("unverified repository");
    const definitions = [];
    for (const file of workflows) {
      const definition = await get(`${api}/actions/workflows/${file}`);
      if (
        !Number.isSafeInteger(definition.id) ||
        definition.path !== `.github/workflows/${file}`
      )
        throw new Error("unverified workflow");
      definitions.push(definition);
    }
    while (
      cursor.workflow < definitions.length &&
      pages < pageBudget &&
      now() < deadline
    ) {
      const definition = definitions[cursor.workflow];
      const filter =
        mode === "backfill" && cursor.from
          ? `&created=${encodeURIComponent(">=" + new Date(cursor.from).toISOString())}`
          : "";
      const body = await get(
        `${api}/actions/workflows/${definition.id}/runs?per_page=100&page=${cursor.page}${filter}`,
      );
      if (!Array.isArray(body.workflow_runs) || body.workflow_runs.length > 100)
        throw new Error("invalid GitHub run page");
      if (
        body.workflow_runs.length < 100 &&
        Number.isSafeInteger(body.total_count) &&
        body.total_count > (cursor.page - 1) * 100 + body.workflow_runs.length
      )
        throw new Error(
          "GitHub result window incomplete; narrow the requested range.",
        );
      const attempts = [];
      for (const listed of body.workflow_runs) {
        const metadata = parseGenerationRunName(listed.display_title);
        // Reusable workflows normally share the parent's run identity; distinct
        // workflow_call entries are not another execution of the generation.
        if (listed.event === "workflow_call") continue;
        if (!metadata) {
          report.warnings.push(
            "Run routing not recorded or excluded; left unassociated.",
          );
          continue;
        }
        if (
          listed.repository?.id !== repository.id ||
          listed.repository?.full_name !== TRACKING_REPOSITORY ||
          listed.workflow_id !== definition.id ||
          listed.path?.split("@")[0] !== definition.path
        ) {
          report.warnings.push(
            "Unverified repository/workflow identity excluded.",
          );
          continue;
        }
        if (
          !Number.isSafeInteger(listed.id) ||
          listed.id < 1 ||
          !Number.isInteger(listed.run_attempt) ||
          listed.run_attempt < 1 ||
          listed.run_attempt > 1000
        )
          throw new Error("invalid GitHub run identity");
        for (let attempt = 1; attempt <= listed.run_attempt; attempt++) {
          const key = `${listed.id}:${attempt}`;
          if (seen.has(key)) continue;
          const run =
            attempt === listed.run_attempt
              ? listed
              : await get(
                  `${api}/actions/runs/${listed.id}/attempts/${attempt}`,
                );
          if (
            run.id !== listed.id ||
            run.run_attempt !== attempt ||
            run.workflow_id !== definition.id ||
            run.repository?.id !== repository.id ||
            parseGenerationRunName(run.display_title)?.issueNumber !==
              metadata.issueNumber ||
            parseGenerationRunName(run.display_title)?.profile !==
              metadata.profile ||
            parseGenerationRunName(run.display_title)?.requestId !==
              metadata.requestId
          )
            throw new Error("conflicting run attempt evidence");
          const jobs = await jobsFor(run);
          const observedAt = timestamp(run.updated_at);
          const createdAt = timestamp(run.created_at);
          const finished = jobs
            .filter((j) => j.completed_at)
            .map((j) => timestamp(j.completed_at));
          const started = jobs
            .filter((j) => j.started_at)
            .map((j) => timestamp(j.started_at));
          // Never ingest job names, raw errors/logs, or infer diagnostic delivery
          // from a successful deploy step. Absent structured evidence stays null.
          const observation = buildAttemptObservation({
            repository: TRACKING_REPOSITORY,
            runId: String(run.id),
            runAttempt: attempt,
            ...metadata,
            triggeringActor: run.triggering_actor?.login ?? null,
            executionStatus: conclusion(run),
            deliveryStatus: "none",
            observedAt,
            createdAt,
            startedAt: started.length ? Math.min(...started) : null,
            completedAt:
              run.status === "completed" && finished.length
                ? Math.max(...finished)
                : null,
            source: "github-reconcile",
            failure: {
              evidenceUrl: `https://github.com/${TRACKING_REPOSITORY}/actions/runs/${run.id}/attempts/${attempt}`,
            },
          });
          attempts.push({ observation, events: [] });
          seen.add(key);
          report.coverageStart =
            report.coverageStart === null
              ? createdAt
              : Math.min(report.coverageStart, createdAt);
        }
      }
      const next =
        body.workflow_runs.length === 100
          ? { ...cursor, page: cursor.page + 1 }
          : { ...cursor, workflow: cursor.workflow + 1, page: 1 };
      next.partial = Boolean(cursor.partial || report.warnings.length);
      const complete = next.workflow === definitions.length;
      if (!dryRun) {
        if (typeof postImpl !== "function")
          throw new Error("reconciliation sink required for writes");
        // A large rerun history may exceed the bounded endpoint batch size.
        // Intermediate chunks retain the current page cursor; exact replay is safe.
        for (
          let offset = 0;
          offset < Math.max(1, attempts.length);
          offset += 100
        ) {
          const last = offset + 100 >= attempts.length;
          if (now() >= deadline) throw new Error("deadline exceeded");
          await postImpl({
            attempts: attempts.slice(offset, offset + 100),
            checkpoint: last
              ? complete
                ? null
                : JSON.stringify(next)
              : JSON.stringify(cursor),
            health: {
              lastSyncAt: now(),
              coverageStart: report.coverageStart,
              partial: !last || !complete || report.warnings.length > 0,
              lastError: null,
            },
          });
        }
      }
      report.upsertCount += attempts.length;
      pages++;
      cursor = next;
      report.nextCheckpoint = complete ? null : JSON.stringify(cursor);
      report.complete = complete;
    }
  } catch (error) {
    // Errors never echo private upstream bodies or URLs/tokens.
    report.errors.push(
      /^(GitHub metadata unavailable \(\d+\)|GitHub result window incomplete; narrow the requested range\.|deadline exceeded|invalid GitHub [a-z ]+|unverified [a-z]+|conflicting run attempt evidence|job page budget exceeded|reconciliation sink required for writes)$/u.test(
        error.message,
      )
        ? error.message
        : "Reconciliation unavailable.",
    );
    report.nextCheckpoint = JSON.stringify(cursor);
    report.complete = false;
    if (!dryRun && typeof postImpl === "function") {
      try {
        await postImpl({
          attempts: [],
          checkpoint: JSON.stringify(cursor),
          health: {
            lastSyncAt: now(),
            coverageStart: report.coverageStart,
            partial: true,
            lastError: report.errors[0],
          },
        });
      } catch {
        /* failed health sink leaves prior checkpoint unchanged */
      }
    }
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((v) => v.startsWith("--"))
      .map((v) => [v.slice(2), true]),
  );
  for (let i = 2; i < process.argv.length; i++)
    if (
      process.argv[i].startsWith("--") &&
      process.argv[i + 1] &&
      !process.argv[i + 1].startsWith("--")
    )
      args[process.argv[i].slice(2)] = process.argv[++i];
  const dryRun = args["dry-run"] !== undefined || args.write !== true;
  let fetchImpl = fetch;
  if (args.fixture) {
    const fixture = JSON.parse(await fs.readFile(args.fixture, "utf8"));
    fetchImpl = async (url) => {
      const item = fixture[url];
      if (!item) throw new Error("missing fixture");
      return Response.json(item);
    };
  }
  const postImpl = async (body) => {
    const origin = new URL(
      process.env.LAUNCHLOOM_API_URL || "https://api.launchloom.wrazyos.com",
    );
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      !process.env.GENERATION_TRACKING_SECRET
    )
      throw new Error("invalid sink configuration");
    for (let retry = 0; retry < 3; retry++) {
      const response = await fetch(
        `${origin.origin}/api/internal/generation-reconciliation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GENERATION_TRACKING_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.ok) return;
      if (![429, 500, 502, 503, 504].includes(response.status) || retry === 2)
        throw new Error("sink unavailable");
      await sleep(500 * (retry + 1));
    }
  };
  const report = await reconcileGenerationHistory({
    mode: args.mode || "incremental",
    from: args.from || 0,
    dryRun,
    pageBudget: Number(args["page-budget"] || 10),
    checkpoint: args.checkpoint || null,
    fetchImpl,
    postImpl,
  });
  if (args.out) await fs.writeFile(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.errors.length) process.exitCode = 1;
}
