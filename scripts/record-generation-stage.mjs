import {
  buildAttemptTrackingPayload,
  postAttemptTracking,
  postOperationsEvent,
} from "./record-generation-event.mjs";

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
  if (env.OPERATION_ID) {
    await postOperationsEvent({ stage, 'stage-status': status }, { env, fetchImpl });
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
  return postAttemptTracking(payload, {
    secret,
    api: env.LAUNCHLOOM_API_URL,
    fetchImpl,
  });
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
