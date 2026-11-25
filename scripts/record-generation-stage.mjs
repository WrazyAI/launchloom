import {
  buildAttemptTrackingPayload,
  postAttemptTracking,
  postOperationsEvent,
} from "./record-generation-event.mjs";
import { activityFromEnv } from "./generation-activity-context.mjs";

function argsFrom(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) continue;
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[value.replace(/^--/u, "")] = "true";
      continue;
    }
    result[value.replace(/^--/u, "")] = next;
    index += 1;
  }
  return result;
}

function clean(value, limit = 500) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit);
}

function stageActivityLabel(stage) {
  return String(stage || "stage")
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stageActivityStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "started":
    case "running":
      return "started";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

/** Mirror each recorded stage into the live diagnostic trace. Best effort. */
async function emitStageActivity({ stage, status, detail, env, fetchImpl }) {
  if (env.GENERATION_ACTIVITY_ENABLED !== "true") return;
  const activityStatus = stageActivityStatus(status);
  if (!activityStatus) return;
  const producer = activityFromEnv(
    env,
    {
      stage,
      actor: { kind: "orchestrator", role: "workflow" },
    },
    { fetchImpl },
  );
  if (producer.context() === null) return;
  const summary = clean(detail, 2000);
  const payloadDetail = summary ? { kind: "text", text: summary } : null;
  try {
    if (activityStatus === "started")
      producer.emit("task_started", {
        label: stageActivityLabel(stage),
        detail: payloadDetail,
      });
    else
      producer.emit("task_finished", {
        label: stageActivityLabel(stage),
        status: activityStatus,
        detail: payloadDetail,
      });
  } finally {
    await producer.close();
  }
}

async function mirrorStageActivity(options) {
  try {
    await emitStageActivity(options);
  } catch {
    // Diagnostic activity must never fail the pipeline.
  }
}

/**
 * Emit one explicit pipeline stage transition through the trusted producer.
 * Legacy tracking is best effort; new-mode telemetry failures throw instead of
 * falling back to legacy authority.
 * @param {{stage?: string, status?: string, detail?: string, issue?: string, observedAt?: number, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch}} [options]
 */
export async function recordGenerationStage({
  stage,
  status,
  detail = "",
  issue = "",
  observedAt = Date.now(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const mirror = () => mirrorStageActivity({ stage, status, detail, env, fetchImpl });
  if (env.OPERATION_ID) {
    await postOperationsEvent({ stage, 'stage-status': status }, { env, fetchImpl });
    await mirror();
    return { ok: true };
  }
  const secret = clean(env.GENERATION_TRACKING_SECRET, 500);
  if (!secret) return { ok: true, disabled: true };
  const runId = clean(env.GITHUB_RUN_ID, 40);
  const attemptId = clean(env.TRACK_ATTEMPT, 120);
  if (!runId || !attemptId) return { ok: true, disabled: true };
  const payload = buildAttemptTrackingPayload({
    "run-id": runId,
    "run-attempt": clean(env.GITHUB_RUN_ATTEMPT, 10) || "1",
    "request-id": clean(env.TRACK_REQUEST, 120) || null,
    "attempt-id": attemptId,
    profile: clean(env.TRACK_PROFILE, 40) || "full",
    "triggering-actor": clean(env.TRACK_ACTOR, 80) || null,
    "execution-status": "running",
    "delivery-status": "none",
    "observed-at": String(observedAt),
    issue: clean(issue, 40) || null,
    stage: clean(stage, 80),
    "stage-status": clean(status, 40),
    "stage-detail": clean(detail, 2000),
  });
  if (!payload) return { ok: true, disabled: true };
  const result = await postAttemptTracking(payload, {
    secret,
    api: env.LAUNCHLOOM_API_URL,
    fetchImpl,
  });
  // The successful ledger write binds legacy activity to the verified run.
  if (result.ok) await mirror();
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv.slice(2));
  try {
    const result = await recordGenerationStage({
      stage: args.stage,
      status: args.status || args["stage-status"],
      detail: args.detail || args["stage-detail"] || "",
      issue: args.issue || process.env.TRACK_ISSUE || "",
      observedAt: Number(args["observed-at"] || Date.now()),
    });
    if (result.disabled) {
      console.log("generation_stage=disabled reason=no-tracking-context");
    } else if (!result.ok) {
      console.warn(`generation_stage=skipped reason=http-${result.status}`);
    } else {
      console.log(
        `generation_stage=recorded stage=${args.stage} status=${args.status}`,
      );
    }
  } catch (error) {
    if (process.env.OPERATION_ID) {
      console.error('operations_event=unavailable');
      process.exitCode = 1;
    } else {
    console.warn(
      `generation_stage=skipped reason=${String(error?.message || error).slice(0, 160)}`,
    );
    }
  }
}
