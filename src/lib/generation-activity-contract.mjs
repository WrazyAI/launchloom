/**
 * Validation and privacy boundary for the diagnostic generation activity trace.
 * Runtime contract shared by trusted Node producers, the Worker and the admin
 * bundle. Keep this module free of Node-only APIs.
 *
 * Trusted producers and Worker ingest both apply it. Payloads stay flat,
 * byte-bounded and allowlisted; credentials, exact known private values and
 * unapproved links are removed before anything reaches a spool, the network or
 * storage. Trace events never decide generation success.
 */

export const GENERATION_ACTIVITY_SCHEMA_VERSION = 1;

export const TRACE_NAMESPACES = Object.freeze(["legacy", "operations"]);
export const TRACE_ACTOR_KINDS = Object.freeze([
  "model",
  "orchestrator",
  "process",
]);
export const TRACE_EVENT_KINDS = Object.freeze([
  "task_started",
  "task_finished",
  "model_started",
  "model_finished",
  "action_started",
  "action_finished",
  "output",
  "usage",
  "retry",
  "error",
  "coverage",
  "heartbeat",
  "producer_finished",
]);

export const TRACE_LIMITS = Object.freeze({
  maxIdentifier: 200,
  maxLabel: 200,
  maxTextBytes: 8 * 1024,
  maxEventBytes: 16 * 1024,
  maxBatchBytes: 128 * 1024,
  maxQueueBytes: 1024 * 1024,
  maxRawInputBytes: 1024 * 1024,
  maxDepth: 8,
  maxNodes: 500,
  maxWidth: 100,
  maxEventsPerAttempt: 10_000,
  maxAttemptBytes: 10 * 1024 * 1024,
  controlReserve: 32,
  maxBatchEvents: 100,
  retentionDays: 30,
  flushIntervalMs: 1_000,
  flushEvents: 20,
  sendTimeoutMs: 3_000,
  closeTimeoutMs: 10_000,
  maxDeliveryAttempts: 3,
  heartbeatMs: 10_000,
  quietWarnMs: 30_000,
  quietIncompleteMs: 60_000,
  pollIntervalMs: 2_000,
  feedWindow: 500,
});

/**
 * Field names a safe action payload may carry. These are the only keys that can
 * reach storage, so an arbitrary captured object cannot smuggle new shapes in.
 */
export const TRACE_SAFE_FIELD_NAMES = Object.freeze([
  "actionId",
  "assetKind",
  "attempt",
  "bytes",
  "candidateId",
  "count",
  "exitCode",
  "kind",
  "maxAttempts",
  "method",
  "name",
  "outcome",
  "path",
  "reason",
  "repairPass",
  "route",
  "sha",
  "status",
  "step",
  "tool",
]);

const SAFE_FIELDS = new Set(TRACE_SAFE_FIELD_NAMES);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LEGACY_ATTEMPT = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,199}$/u;
const STAGE = /^[a-z0-9_]{1,80}$/u;
const ROLE = /^[a-z0-9_]{1,64}$/u;
const SEMANTIC_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/u;
const PROVIDER = /^[a-z0-9._-]{1,40}$/u;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/u;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]{0,40}$/u;
const BOUNDARY = /^[a-z0-9_.:-]{1,120}$/u;
const CODE = /^[a-z0-9_.-]{1,80}$/u;
const ACTION_NAME = /^[a-z0-9_.:-]{1,80}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 .,:;/()#_+&'’-]{0,199}$/u;
const ACTION_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const MODEL_STATUSES = new Set([
  "completed",
  "error",
  "incomplete",
  "requires-action",
  "cancelled",
  "transport",
]);
const COVERAGE_STATUSES = new Set([
  "instrumented",
  "not_applicable",
  "unsupported",
  "limited",
]);
const COST_KINDS = new Set(["actual", "estimated", "unreported"]);
const WITHHELD_REASONS = new Set([
  "sensitive",
  "oversize",
  "unclassified",
  "unsupported",
]);

export class TraceContractError extends Error {
  constructor(reason) {
    super(`invalid generation activity: ${reason}`);
    this.name = "TraceContractError";
    this.reason = reason;
  }
}

function fail(reason = "invalid") {
  throw new TraceContractError(reason);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys, label) {
  if (!record(value)) fail(`${label}_not_object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`${label}_unknown_field`);
  for (const key of keys)
    if (!Object.hasOwn(value, key)) fail(`${label}_missing_field`);
  return value;
}

const encoder = new TextEncoder();

export function traceTextBytes(value) {
  return encoder.encode(value).length;
}

export function assertBoundedJson(
  value,
  {
    maxDepth = TRACE_LIMITS.maxDepth,
    maxNodes = TRACE_LIMITS.maxNodes,
    maxWidth = TRACE_LIMITS.maxWidth,
  } = {},
) {
  let nodes = 0;
  const stack = [{ value, depth: 0 }];
  while (stack.length) {
    const item = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) fail("too_many_nodes");
    if (item.depth > maxDepth) fail("too_deep");
    const current = item.value;
    if (current === null || typeof current !== "object") continue;
    const entries = Array.isArray(current)
      ? current.map((entry, index) => [index, entry])
      : Object.entries(current);
    if (entries.length > maxWidth) fail("too_wide");
    for (const [, entry] of entries)
      if (entry !== null && typeof entry === "object")
        stack.push({ value: entry, depth: item.depth + 1 });
  }
}

/** Truncate to a UTF-8 byte budget without splitting a code point or surrogate. */
export function truncateUtf8(value, maxBytes) {
  if (traceTextBytes(value) <= maxBytes) return value;
  let out = "";
  let used = 0;
  for (const character of value) {
    const bytes = traceTextBytes(character);
    if (used + bytes > maxBytes) break;
    out += character;
    used += bytes;
  }
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const CREDENTIAL_PATTERNS = Object.freeze([
  [/Bearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/giu, "Bearer [redacted]"],
  [
    /(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})/gu,
    "[credential redacted]",
  ],
  [/sk-[A-Za-z0-9_-]{8,}/gu, "[credential redacted]"],
  [
    /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
    "[credential redacted]",
  ],
  [
    /(?:[A-Za-z0-9_]*(?:token|secret|password|passwd|api[_-]?key|authorization|signature|cookie))\s*[:=]\s*["']?[^\s"',;]{4,}/giu,
    "[credential redacted]",
  ],
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
    "[credential redacted]",
  ],
]);

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const GITHUB_EVIDENCE =
  /^https:\/\/github\.com\/WrazyAI\/launchloom\/(?:actions\/runs\/\d+(?:\/attempts\/\d+)?|issues\/\d+|pull\/\d+)\/?$/iu;

/**
 * Positive allowlist plus known-value removal. `sensitiveValues` are exact
 * strings (env secrets, private intake fields) supplied by the caller and never
 * serialized by this module.
 */
export function createPrivacyPolicy({
  allowedFields = TRACE_SAFE_FIELD_NAMES,
  sensitiveValues = [],
  allowSourceText = false,
} = {}) {
  const fields = [...new Set(allowedFields)].filter((field) =>
    SAFE_FIELDS.has(field),
  );
  const values = [...new Set(sensitiveValues)]
    .filter((value) => typeof value === "string" && value.length >= 8)
    .sort((a, b) => b.length - a.length)
    .slice(0, 200);
  return Object.freeze({
    allowedFields: Object.freeze(fields),
    sensitiveValues: Object.freeze(values),
    allowSourceText: allowSourceText === true,
  });
}

/**
 * Scrub a string: remove exact known values first (so a secret straddling the
 * truncation boundary is never partially kept), then credentials and links.
 * Truncation happens last, on a code-point boundary.
 */
export function scrubTraceText(
  value,
  policy,
  maxBytes = TRACE_LIMITS.maxTextBytes,
) {
  let text = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\r\n?/gu, "\n");
  for (const sensitive of policy.sensitiveValues)
    text = text.replace(
      new RegExp(escapeRegExp(sensitive), "gu"),
      "[redacted]",
    );
  for (const [pattern, replacement] of CREDENTIAL_PATTERNS)
    text = text.replace(pattern, replacement);
  text = text.replace(URL_PATTERN, (url) =>
    GITHUB_EVIDENCE.test(url) ? url : "[link redacted]",
  );
  return truncateUtf8(text.trim(), maxBytes).trim();
}

/** Project free text into a bounded value or a typed withheld reason. */
export function projectTraceText(value, policy, { mode = "text" } = {}) {
  if (typeof value !== "string")
    return { kind: "withheld", reason: "unclassified" };
  if (traceTextBytes(value) > TRACE_LIMITS.maxRawInputBytes)
    return { kind: "withheld", reason: "oversize" };
  if (mode === "source" && policy.allowSourceText !== true)
    return { kind: "withheld", reason: "unsupported" };
  const scrubbed = scrubTraceText(value, policy);
  if (!scrubbed) return { kind: "withheld", reason: "sensitive" };
  return { kind: "text", text: scrubbed };
}

function shortLabel(value, label) {
  if (typeof value !== "string") fail(`${label}_not_string`);
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  if (!text || text.length > TRACE_LIMITS.maxLabel || !SAFE_LABEL.test(text))
    fail(`${label}_invalid`);
  return text;
}

function identifier(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value))
    fail(`${label}_invalid`);
  return value;
}

function uuid(value, label) {
  return identifier(value, UUID, label);
}

function nullableUuid(value, label) {
  return value === null || value === undefined ? null : uuid(value, label);
}

function nullableSemantic(value, label) {
  return value === null || value === undefined
    ? null
    : identifier(value, SEMANTIC_ID, label);
}

function integer(
  value,
  label,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${label}_invalid`);
  return value;
}

function nullableInteger(value, label, options) {
  return value === null || value === undefined
    ? null
    : integer(value, label, options);
}

function timestamp(value, label) {
  if (typeof value !== "string" || value.length > 40) fail(`${label}_invalid`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0) fail(`${label}_invalid`);
  if (parsed > Date.now() + 24 * 60 * 60 * 1000) fail(`${label}_future`);
  return new Date(parsed).toISOString();
}

function traceText(value, policy, label, { nullable = false, mode } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (!record(value)) fail(`${label}_invalid`);
  if (value.kind === "withheld") {
    if (!WITHHELD_REASONS.has(value.reason)) fail(`${label}_reason`);
    return { kind: "withheld", reason: value.reason };
  }
  if (value.kind !== "text" || typeof value.text !== "string")
    fail(`${label}_invalid`);
  return projectTraceText(value.text, policy, mode ? { mode } : undefined);
}

function safeFields(value, policy, label) {
  if (!record(value)) fail(`${label}_invalid`);
  const keys = Object.keys(value);
  if (keys.length > 40) fail(`${label}_too_many_fields`);
  const out = {};
  for (const key of keys) {
    if (!FIELD_NAME.test(key) || !SAFE_FIELDS.has(key)) fail(`${label}_field`);
    if (!policy.allowedFields.includes(key))
      fail(`${label}_field_not_allowed`);
    const entry = value[key];
    if (entry === null || typeof entry === "boolean") {
      out[key] = entry;
      continue;
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry) || Math.abs(entry) > 1e15)
        fail(`${label}_value`);
      out[key] = entry;
      continue;
    }
    if (typeof entry !== "string") fail(`${label}_nested_value`);
    const scrubbed = scrubTraceText(entry, policy, 2 * 1024);
    if (scrubbed) out[key] = scrubbed;
  }
  return out;
}

/** Build a flat allowlisted payload from a source object. */
export function buildSafeFields(source, { policy }) {
  if (!record(source)) fail("source_not_object");
  assertBoundedJson(source);
  const picked = {};
  for (const key of Object.keys(source))
    if (policy.allowedFields.includes(key) && SAFE_FIELDS.has(key))
      picked[key] = source[key];
  return safeFields(picked, policy);
}

function usage(value) {
  if (!record(value)) fail("usage_invalid");
  exactObject(
    value,
    [
      "inputTokens",
      "outputTokens",
      "cachedInputTokens",
      "cacheWriteTokens",
      "reasoningTokens",
      "costUsd",
      "costKind",
    ],
    "usage",
  );
  const tokens = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "cacheWriteTokens",
    "reasoningTokens",
  ]) {
    tokens[key] =
      value[key] === null || value[key] === undefined
        ? null
        : integer(value[key], `usage_${key}`, { max: 1e12 });
  }
  if (!COST_KINDS.has(value.costKind)) fail("usage_cost_kind");
  let costUsd = null;
  if (value.costUsd !== null && value.costUsd !== undefined) {
    if (
      typeof value.costUsd !== "string" ||
      !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$/u.test(value.costUsd)
    )
      fail("usage_cost_invalid");
    costUsd = value.costUsd;
  }
  if (value.costKind === "unreported" && costUsd !== null)
    fail("usage_cost_mismatch");
  if (value.costKind !== "unreported" && costUsd === null)
    fail("usage_cost_mismatch");
  return { ...tokens, costUsd, costKind: value.costKind };
}

function validatePayload(kind, payload, policy) {
  switch (kind) {
    case "task_started": {
      exactObject(payload, ["label", "detail"], kind);
      return {
        label: shortLabel(payload.label, "label"),
        detail: traceText(payload.detail, policy, "detail", { nullable: true }),
      };
    }
    case "task_finished": {
      exactObject(payload, ["label", "status", "detail"], kind);
      if (!ACTION_STATUSES.has(payload.status)) fail("status_invalid");
      return {
        label: shortLabel(payload.label, "label"),
        status: payload.status,
        detail: traceText(payload.detail, policy, "detail", { nullable: true }),
      };
    }
    case "model_started": {
      exactObject(payload, ["callId", "provider", "model"], kind);
      return {
        callId: uuid(payload.callId, "call_id"),
        provider: identifier(payload.provider, PROVIDER, "provider"),
        model: identifier(payload.model, MODEL, "model"),
      };
    }
    case "model_finished": {
      exactObject(payload, ["callId", "status"], kind);
      if (!MODEL_STATUSES.has(payload.status)) fail("status_invalid");
      return { callId: uuid(payload.callId, "call_id"), status: payload.status };
    }
    case "action_started": {
      exactObject(payload, ["actionId", "name", "input"], kind);
      return {
        actionId: identifier(payload.actionId, SEMANTIC_ID, "action_id"),
        name: identifier(payload.name, ACTION_NAME, "action_name"),
        input: safeFields(payload.input, policy, "input"),
      };
    }
    case "action_finished": {
      exactObject(
        payload,
        ["actionId", "name", "status", "durationMs", "result"],
        kind,
      );
      if (!ACTION_STATUSES.has(payload.status)) fail("status_invalid");
      return {
        actionId: identifier(payload.actionId, SEMANTIC_ID, "action_id"),
        name: identifier(payload.name, ACTION_NAME, "action_name"),
        status: payload.status,
        durationMs: nullableInteger(payload.durationMs, "duration", {
          max: 86_400_000,
        }),
        result: safeFields(payload.result, policy, "result"),
      };
    }
    case "output": {
      exactObject(payload, ["callId", "message"], kind);
      return {
        callId: uuid(payload.callId, "call_id"),
        message: traceText(payload.message, policy, "message", {
          mode: "source",
        }),
      };
    }
    case "usage": {
      exactObject(payload, ["callId", "usage"], kind);
      return {
        callId: uuid(payload.callId, "call_id"),
        usage: usage(payload.usage),
      };
    }
    case "retry": {
      exactObject(
        payload,
        ["scope", "attempt", "maxAttempts", "reason"],
        kind,
      );
      if (!["provider", "action", "stage"].includes(payload.scope))
        fail("retry_scope");
      const attempt = integer(payload.attempt, "retry_attempt", {
        min: 1,
        max: 99,
      });
      const maxAttempts = integer(payload.maxAttempts, "retry_max", {
        min: 1,
        max: 99,
      });
      if (attempt > maxAttempts) fail("retry_bounds");
      return {
        scope: payload.scope,
        attempt,
        maxAttempts,
        reason: shortLabel(payload.reason, "retry_reason"),
      };
    }
    case "error": {
      exactObject(payload, ["scope", "code", "message"], kind);
      if (!["model", "action", "stage"].includes(payload.scope))
        fail("error_scope");
      return {
        scope: payload.scope,
        code: identifier(payload.code, CODE, "error_code"),
        message: traceText(payload.message, policy, "error_message"),
      };
    }
    case "coverage": {
      exactObject(payload, ["boundary", "status", "detail"], kind);
      if (!COVERAGE_STATUSES.has(payload.status)) fail("coverage_status");
      return {
        boundary: identifier(payload.boundary, BOUNDARY, "boundary"),
        status: payload.status,
        detail: traceText(payload.detail, policy, "detail", { nullable: true }),
      };
    }
    case "heartbeat": {
      exactObject(payload, ["intervalMs"], kind);
      return {
        intervalMs: integer(payload.intervalMs, "interval", {
          min: 1_000,
          max: 300_000,
        }),
      };
    }
    case "producer_finished": {
      exactObject(payload, ["status", "detail"], kind);
      if (!["complete", "incomplete"].includes(payload.status))
        fail("producer_status");
      return {
        status: payload.status,
        detail: traceText(payload.detail, policy, "detail", { nullable: true }),
      };
    }
    default:
      return fail("kind_invalid");
  }
}

function validateContext(value) {
  exactObject(
    value,
    [
      "namespace",
      "attemptId",
      "producerId",
      "stage",
      "substep",
      "taskId",
      "parentTaskId",
      "candidateId",
      "repairPass",
      "actor",
    ],
    "context",
  );
  if (!TRACE_NAMESPACES.includes(value.namespace)) fail("namespace");
  const attemptId =
    value.namespace === "operations"
      ? uuid(value.attemptId, "attempt_id")
      : identifier(value.attemptId, LEGACY_ATTEMPT, "attempt_id");
  exactObject(value.actor, ["kind", "role"], "actor");
  if (!TRACE_ACTOR_KINDS.includes(value.actor.kind)) fail("actor_kind");
  return {
    namespace: value.namespace,
    attemptId,
    producerId: uuid(value.producerId, "producer_id"),
    stage: identifier(value.stage, STAGE, "stage"),
    substep:
      value.substep === null || value.substep === undefined
        ? null
        : identifier(value.substep, STAGE, "substep"),
    taskId: nullableUuid(value.taskId, "task_id"),
    parentTaskId: nullableUuid(value.parentTaskId, "parent_task_id"),
    candidateId: nullableSemantic(value.candidateId, "candidate_id"),
    repairPass: nullableInteger(value.repairPass, "repair_pass", { max: 99 }),
    actor: {
      kind: value.actor.kind,
      role: identifier(value.actor.role, ROLE, "role"),
    },
  };
}

export function isTraceIdentity(value) {
  if (!record(value) || Object.keys(value).length !== 2) return false;
  if (!Object.hasOwn(value, "namespace") || !Object.hasOwn(value, "attemptId"))
    return false;
  try {
    validateContext({
      namespace: value.namespace,
      attemptId: value.attemptId,
      producerId: "00000000-0000-4000-8000-000000000000",
      stage: "stage",
      substep: null,
      taskId: null,
      parentTaskId: null,
      candidateId: null,
      repairPass: null,
      actor: { kind: "orchestrator", role: "orchestrator" },
    });
    return true;
  } catch {
    return false;
  }
}

export function sameTraceIdentity(left, right) {
  return (
    record(left) &&
    record(right) &&
    left.namespace === right.namespace &&
    left.attemptId === right.attemptId
  );
}

/** Validate one raw event and return a normalized, already-scrubbed copy. */
export function buildTraceEvent(raw, policy = createPrivacyPolicy()) {
  exactObject(
    raw,
    [
      "schemaVersion",
      "eventId",
      "context",
      "sequence",
      "emittedAt",
      "kind",
      "payload",
    ],
    "event",
  );
  if (raw.schemaVersion !== GENERATION_ACTIVITY_SCHEMA_VERSION)
    fail("schema_version");
  if (!TRACE_EVENT_KINDS.includes(raw.kind)) fail("kind_invalid");
  const event = {
    schemaVersion: GENERATION_ACTIVITY_SCHEMA_VERSION,
    eventId: uuid(raw.eventId, "event_id"),
    context: validateContext(raw.context),
    sequence: integer(raw.sequence, "sequence", {
      min: 1,
      max: 1_000_000_000,
    }),
    emittedAt: timestamp(raw.emittedAt, "emitted_at"),
    kind: raw.kind,
    payload: validatePayload(raw.kind, raw.payload, policy),
  };
  if (traceTextBytes(JSON.stringify(event)) > TRACE_LIMITS.maxEventBytes)
    fail("event_too_large");
  return event;
}

/**
 * Validate a delivery batch. Duplicate event IDs are permitted here: delivery
 * retries are idempotent at the store, and only the store can distinguish a
 * replay from a conflicting reuse of the same ID.
 */
export function validateTraceBatch(raw, policy = createPrivacyPolicy()) {
  if (!Array.isArray(raw) || raw.length < 1) fail("batch_empty");
  if (raw.length > TRACE_LIMITS.maxBatchEvents) fail("batch_too_large");
  const events = [];
  let identity = null;
  let producerId = null;
  let maxSequence = 0;
  const seen = new Map();
  for (const entry of raw) {
    const event = buildTraceEvent(entry, policy);
    const nextIdentity = {
      namespace: event.context.namespace,
      attemptId: event.context.attemptId,
    };
    if (identity && !sameTraceIdentity(identity, nextIdentity))
      fail("batch_identity_mismatch");
    if (producerId && producerId !== event.context.producerId)
      fail("batch_producer_mismatch");
    const previousSequence = seen.get(event.eventId);
    if (previousSequence !== undefined) {
      if (previousSequence !== event.sequence)
        fail("batch_duplicate_conflict");
    } else {
      if (event.sequence <= maxSequence) fail("batch_sequence_order");
      seen.set(event.eventId, event.sequence);
      maxSequence = event.sequence;
    }
    identity = nextIdentity;
    producerId = event.context.producerId;
    events.push(event);
  }
  if (traceTextBytes(JSON.stringify(events)) > TRACE_LIMITS.maxBatchBytes)
    fail("batch_too_large");
  return events;
}

export function traceEventBytes(event) {
  return traceTextBytes(JSON.stringify(event));
}
