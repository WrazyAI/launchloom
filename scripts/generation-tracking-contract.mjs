// Pure wire boundary shared by trusted Node producers and Worker ingestion.
export const TRACKING_REPOSITORY = "WrazyAI/launchloom";
export const GENERATION_PROFILES = [
  "full",
  "full-preview",
  "creative-only",
  "seo-only",
];
const executions = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "unknown",
];
const deliveries = [
  "none",
  "diagnostic",
  "attention",
  "preview_ready",
  "published",
];
const sources = ["callback", "github-reconcile", "legacy-import"];
const fail = () => {
  throw new Error("invalid tracking evidence");
};
const record = (v) => v && typeof v === "object" && !Array.isArray(v);
export function strictKeys(value, keys) {
  if (!record(value) || Object.keys(value).some((k) => !keys.includes(k)))
    fail();
}
export function safeEvidenceUrl(value) {
  if (typeof value !== "string") return null;
  return /^https:\/\/github\.com\/WrazyAI\/launchloom\/(?:actions\/runs\/\d+(?:\/attempts\/\d+)?|issues\/\d+|pull\/\d+)$/u.test(
    value,
  )
    ? value
    : null;
}
export function redactTrackingText(value, limit = 500) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 10000) fail();
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .replace(
        /"(?:token|secret|password|api[_-]?key|authorization|signature)"\s*:\s*"[^"\n]*"/giu,
        '"credential":"[redacted]"',
      )
      .replace(
        /https?:\/\/[^\s<>"']+/giu,
        (u) => safeEvidenceUrl(u) ?? "[link redacted]",
      )
      .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [redacted]")
      .replace(
        /\b(?:[A-Za-z0-9_]*_)?(?:token|secret|password|api[_-]?key|authorization|signature)\s*[:=]\s*[^\s,;]+/giu,
        "[credential redacted]",
      )
      .replace(
        /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gu,
        "[credential redacted]",
      )
      .slice(0, limit)
      .trim() || null
  );
}
const time = (v, nullable = false) => {
  if (nullable && (v === undefined || v === null)) return null;
  if (!Number.isSafeInteger(v) || v < 0) fail();
  return v;
};
const ref = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/u.test(v))
    fail();
  return v;
};
export function buildAttemptObservation(input) {
  strictKeys(input, [
    "repository",
    "runId",
    "runAttempt",
    "requestId",
    "attemptId",
    "profile",
    "issueNumber",
    "triggeringActor",
    "executionStatus",
    "deliveryStatus",
    "observedAt",
    "source",
    "failure",
    "createdAt",
    "startedAt",
    "completedAt",
  ]);
  if (
    input.repository !== TRACKING_REPOSITORY ||
    typeof input.runId !== "string" ||
    !/^[1-9]\d{0,19}$/u.test(input.runId) ||
    !Number.isSafeInteger(input.runAttempt) ||
    input.runAttempt < 1 ||
    input.runAttempt > 1000
  )
    fail();
  if (
    !GENERATION_PROFILES.includes(input.profile) ||
    !executions.includes(input.executionStatus) ||
    !deliveries.includes(input.deliveryStatus)
  )
    fail();
  const source = input.source ?? "callback";
  if (!sources.includes(source)) fail();
  const actor = input.triggeringActor ?? null;
  if (
    actor !== null &&
    (typeof actor !== "string" ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/u.test(actor))
  )
    fail();
  const issue = input.issueNumber ?? null;
  if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) fail();
  const failure = input.failure ?? {};
  strictKeys(failure, [
    "category",
    "stage",
    "summary",
    "evidenceUrl",
    "nextStep",
  ]);
  return {
    repository: input.repository,
    runId: input.runId,
    runAttempt: input.runAttempt,
    requestId: ref(input.requestId),
    attemptId: ref(input.attemptId),
    profile: input.profile,
    issueNumber: issue,
    triggeringActor: actor,
    executionStatus: input.executionStatus,
    deliveryStatus: input.deliveryStatus,
    observedAt: time(input.observedAt),
    source,
    createdAt: time(input.createdAt, true),
    startedAt: time(input.startedAt, true),
    completedAt: time(input.completedAt, true),
    failure: {
      category: redactTrackingText(failure.category, 80),
      stage: redactTrackingText(failure.stage, 80),
      summary: redactTrackingText(failure.summary),
      evidenceUrl: safeEvidenceUrl(failure.evidenceUrl),
      nextStep: redactTrackingText(failure.nextStep),
    },
  };
}
export function buildAttemptEvents(events, observation) {
  if (!Array.isArray(events) || events.length > 100) fail();
  return events.map((e) => {
    strictKeys(e, [
      "eventKey",
      "stage",
      "status",
      "provider",
      "model",
      "costUsd",
      "costKind",
      "detail",
      "createdAt",
      "observedAt",
      "source",
    ]);
    for (const k of ["eventKey", "stage", "status"])
      if (typeof e[k] !== "string" || !/^[a-zA-Z0-9:_./-]{1,120}$/u.test(e[k]))
        fail();
    if (
      ["execution", "delivery"].includes(e.stage) ||
      ["execution", "delivery"].includes(e.eventKey)
    )
      fail(); // only the observation owns outcome projection
    if (e.source !== undefined && e.source !== observation.source) fail();
    if (
      e.costUsd !== undefined &&
      e.costUsd !== null &&
      (typeof e.costUsd !== "number" ||
        !Number.isFinite(e.costUsd) ||
        e.costUsd < 0 ||
        e.costUsd > 100000)
    )
      fail();
    if (
      e.costKind !== undefined &&
      !["actual", "estimated", "unreported"].includes(e.costKind)
    )
      fail();
    return {
      ...e,
      provider: redactTrackingText(e.provider, 120),
      model: redactTrackingText(e.model, 120),
      detail: redactTrackingText(
        typeof e.detail === "object" ? JSON.stringify(e.detail) : e.detail,
        2000,
      ),
      createdAt: time(e.createdAt ?? observation.observedAt),
      observedAt: time(e.observedAt ?? observation.observedAt),
      source: observation.source,
    };
  });
}
export function parseGenerationRunName(value) {
  const match =
    /^LLGEN issue=([1-9]\d*) profile=(full|full-preview|creative-only|seo-only) request=(none|[A-Za-z0-9][A-Za-z0-9_-]{7,119})$/u.exec(
      value ?? "",
    );
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return {
    issueNumber: Number(match[1]),
    profile: match[2],
    requestId: match[3] === "none" ? null : match[3],
  };
}
