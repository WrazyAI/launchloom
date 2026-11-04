import type {
  TraceActorKind,
  TraceEvent,
  TraceEventKind,
  TraceIdentity,
  TraceNamespace,
  TraceSafeFields,
  TraceText,
} from "./generation-activity";

export const GENERATION_ACTIVITY_SCHEMA_VERSION: 1;
export const TRACE_NAMESPACES: readonly ["legacy", "operations"];
export const TRACE_ACTOR_KINDS: readonly ["model", "orchestrator", "process"];
export const TRACE_EVENT_KINDS: readonly [
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
];
export const TRACE_SAFE_FIELD_NAMES: readonly string[];

export const TRACE_LIMITS: Readonly<{
  maxIdentifier: number;
  maxLabel: number;
  maxTextBytes: number;
  maxEventBytes: number;
  maxBatchBytes: number;
  maxQueueBytes: number;
  maxRawInputBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxWidth: number;
  maxEventsPerAttempt: number;
  maxAttemptBytes: number;
  controlReserve: number;
  maxBatchEvents: number;
  retentionDays: number;
  flushIntervalMs: number;
  flushEvents: number;
  sendTimeoutMs: number;
  closeTimeoutMs: number;
  maxDeliveryAttempts: number;
  heartbeatMs: number;
  quietWarnMs: number;
  quietIncompleteMs: number;
  pollIntervalMs: number;
  feedWindow: number;
}>;

export type TracePrivacyPolicy = Readonly<{
  allowedFields: readonly string[];
  sensitiveValues: readonly string[];
  allowSourceText: boolean;
}>;

export class TraceContractError extends Error {
  readonly reason: string;
}

export function traceTextBytes(value: string): number;
export function truncateUtf8(value: string, maxBytes: number): string;
export function assertBoundedJson(
  value: unknown,
  limits?: { maxDepth?: number; maxNodes?: number; maxWidth?: number },
): void;
export function createPrivacyPolicy(options?: {
  allowedFields?: readonly string[];
  sensitiveValues?: readonly string[];
  allowSourceText?: boolean;
}): TracePrivacyPolicy;
export function scrubTraceText(
  value: string,
  policy: TracePrivacyPolicy,
  maxBytes?: number,
): string;
export function projectTraceText(
  value: unknown,
  policy: TracePrivacyPolicy,
  options?: { mode?: "text" | "source" },
): TraceText;
export function buildSafeFields(
  source: unknown,
  options: { policy: TracePrivacyPolicy },
): TraceSafeFields;
export function isTraceIdentity(value: unknown): value is TraceIdentity;
export function sameTraceIdentity(
  left: unknown,
  right: unknown,
): boolean;
export function buildTraceEvent(
  raw: unknown,
  policy?: TracePrivacyPolicy,
): TraceEvent;
export function validateTraceBatch(
  raw: unknown,
  policy?: TracePrivacyPolicy,
): TraceEvent[];
export function traceEventBytes(event: unknown): number;

/** Compile-time link from the runtime tuples back to the shared union types. */
export type TraceRuntimeNamespace = (typeof TRACE_NAMESPACES)[number];
export type TraceRuntimeActorKind = (typeof TRACE_ACTOR_KINDS)[number];
export type TraceRuntimeEventKind = (typeof TRACE_EVENT_KINDS)[number];
type AssertExtends<A extends B, B> = A;
export type _NamespacesMatch = AssertExtends<TraceRuntimeNamespace, TraceNamespace>;
export type _ActorKindsMatch = AssertExtends<
  TraceRuntimeActorKind,
  TraceActorKind
>;
export type _EventKindsMatch = AssertExtends<
  TraceRuntimeEventKind,
  TraceEventKind
>;
