/** Shared wire contracts only. No Worker, UI or provider runtime dependencies. */
export type ActorSnapshot = {
  kind: "admin" | "client" | "github" | "system" | "unknown";
  id: string | null;
  name: string | null;
  email: string | null;
  source:
    "neon" | "cloudflare-access" | "intake" | "github" | "system" | "legacy";
};
export type AdminPrincipal = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin";
  authSource: "neon" | "cloudflare-access";
};
export type GenerationProfile =
  "full" | "full-preview" | "creative-only" | "seo-only";
export type ExecutionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "unknown";
export type DeliveryStatus =
  "none" | "diagnostic" | "attention" | "preview_ready" | "published";
export type Page<T> = { items: T[]; nextCursor: string | null; total: number };
export type AttemptFilters = {
  search?: string;
  executionStatus?: ExecutionStatus;
  initiatorId?: string;
  creatorId?: string;
  profile?: GenerationProfile;
  clientId?: string;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
};
export type Health = {
  lastSyncAt: number | null;
  coverageStart: number | null;
  partial: boolean;
  lastError: string | null;
  pendingProjectionCount: number;
};
export type CheckResult = { name: string; passed: boolean; detail: string };
export type Failure = {
  category: string | null;
  stage: string | null;
  summary: string | null;
  evidenceUrl: string | null;
  nextStep: string | null;
};
export type AttemptInput = {
  attemptId: string;
  requestId: string | null;
  clientId: string | null;
  issueNumber: number | null;
  profile: GenerationProfile;
  initiator: ActorSnapshot;
  invitationCreator: ActorSnapshot;
  repository: string | null;
  runId: string | null;
  runAttempt: number | null;
  executionStatus: ExecutionStatus;
  deliveryStatus: DeliveryStatus;
  stale: boolean;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  failure: Failure;
};
/**
 * Explicit server-verified initial-dispatch evidence, not workflow membership.
 * Call only from the trusted initial dispatch/outbox projection. The attempt
 * must already exist with this requestId; reconciliation alone cannot assert it.
 */
export type InitialDispatchRegistration = {
  requestId: string;
  initialAttemptId: string;
};
export type AttemptSummary = AttemptInput & {
  costs: {
    actualUsd: number | null;
    estimatedUsd: number | null;
    unreportedCount: number;
  };
};
export type AttemptEventSource =
  "callback" | "github-reconcile" | "legacy-import";
/**
 * Structurally extends GenerationEventInput, without importing Worker code.
 * observedAt is the evidence version (epoch milliseconds), not arrival time.
 * Reserved stage 'execution' uses ExecutionStatus; 'delivery' uses DeliveryStatus.
 * Only those explicit observations project outcomes; other stages are evidence only.
 * Producers must redact details/URLs before submitting trusted ledger inputs.
 */
export type AttemptEventInput = {
  eventKey: string;
  stage: string;
  status: string;
  provider?: string | null;
  model?: string | null;
  costUsd?: number | null;
  costKind?: "actual" | "estimated" | "unreported";
  detail?: string | null;
  createdAt?: number | null;
  observedAt: number;
  source: AttemptEventSource;
};
export type AttemptEventRecord = AttemptEventInput & {
  attemptId: string;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  costKind: "actual" | "estimated" | "unreported";
  detail: string | null;
  createdAt: number;
  updatedAt: number;
};
export type AttemptDetail = AttemptSummary & {
  events: AttemptEventRecord[];
  eventsNextCursor: string | null;
  eventCount: number;
};
