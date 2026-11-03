/**
 * Wire contract for the observe-only generation activity trace.
 *
 * This is diagnostic evidence, never lifecycle or cost authority. Every string
 * that can reach storage has already passed the producer/ingest privacy policy;
 * the browser only renders these values as text.
 */

/** Types only. Runtime constants and validation live in the `.mjs` contract. */
export type TraceNamespace = "legacy" | "operations";

export type TraceActorKind = "model" | "orchestrator" | "process";

export type TraceActor = {
  kind: TraceActorKind;
  role: string;
};

export type TraceIdentity = {
  namespace: TraceNamespace;
  attemptId: string;
};

export type TraceContext = TraceIdentity & {
  producerId: string;
  stage: string;
  substep: string | null;
  taskId: string | null;
  parentTaskId: string | null;
  candidateId: string | null;
  repairPass: number | null;
  actor: TraceActor;
};

export type TraceWithheldReason =
  | "sensitive"
  | "oversize"
  | "unclassified"
  | "unsupported";

export type TraceText =
  | { kind: "text"; text: string }
  | { kind: "withheld"; reason: TraceWithheldReason };

export type TraceSafeValue = string | number | boolean | null;
export type TraceSafeFields = Record<string, TraceSafeValue>;

export type TraceModelStatus =
  | "completed"
  | "error"
  | "incomplete"
  | "requires-action"
  | "cancelled"
  | "transport";

export type TraceActionStatus = "succeeded" | "failed" | "cancelled";

export type TraceUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  costUsd: string | null;
  costKind: "actual" | "estimated" | "unreported";
};

export type TraceCoverageStatus =
  | "instrumented"
  | "not_applicable"
  | "unsupported"
  | "limited";

export type TracePayloads = {
  task_started: { label: string; detail: TraceText | null };
  task_finished: {
    label: string;
    status: TraceActionStatus;
    detail: TraceText | null;
  };
  model_started: { callId: string; provider: string; model: string };
  model_finished: { callId: string; status: TraceModelStatus };
  action_started: { actionId: string; name: string; input: TraceSafeFields };
  action_finished: {
    actionId: string;
    name: string;
    status: TraceActionStatus;
    durationMs: number | null;
    result: TraceSafeFields;
  };
  output: { callId: string; message: TraceText };
  usage: { callId: string; usage: TraceUsage };
  retry: {
    scope: "provider" | "action" | "stage";
    attempt: number;
    maxAttempts: number;
    reason: string;
  };
  error: {
    scope: "model" | "action" | "stage";
    code: string;
    message: TraceText;
  };
  coverage: {
    boundary: string;
    status: TraceCoverageStatus;
    detail: TraceText | null;
  };
  heartbeat: { intervalMs: number };
  producer_finished: {
    status: "complete" | "incomplete";
    detail: TraceText | null;
  };
};

export type TraceEventKind = keyof TracePayloads;

type TraceEventFor<K extends TraceEventKind> = {
  schemaVersion: 1;
  eventId: string;
  context: TraceContext;
  sequence: number;
  emittedAt: string;
  kind: K;
  payload: TracePayloads[K];
};

export type TraceEvent = {
  [K in TraceEventKind]: TraceEventFor<K>;
}[TraceEventKind];

export type StoredTraceEvent = TraceEvent & {
  /** Opaque, identity-bound, monotonically increasing ingestion position. */
  cursor: string;
  /** Server receipt time in epoch milliseconds. */
  receivedAt: number;
};

export type GenerationActivityRecording =
  | "disabled"
  | "not_recorded"
  | "recording"
  | "complete"
  | "incomplete"
  | "expired";

export type GenerationActivityCoverageEntry = {
  boundary: string;
  status: TraceCoverageStatus;
  detail: string | null;
};

export type TraceUsageSummary = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  /** Model responses with a retained usage event. */
  responses: number;
  /** Responses where every token category is unknown. */
  unknownResponses: number;
  cost: {
    currency: string | null;
    actual: string | null;
    estimated: string | null;
    unreportedCount: number;
  };
};

export type GenerationActivityPage = {
  identity: TraceIdentity;
  items: StoredTraceEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  observedAt: number;
  lastHeartbeatAt: number | null;
  recording: GenerationActivityRecording;
  coverage: GenerationActivityCoverageEntry[];
  usage: TraceUsageSummary;
  retentionDays: number;
};

export type GenerationActivityLimits = {
  maxEvents: number;
  maxBytes: number;
  retentionDays: number;
};
