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
  /** Failed, unknown, stale, diagnostic or delivery-attention attempts. */
  attention?: boolean;
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
  /** Verified focused diagnostic URL for this exact execution, when available. */
  previewUrl?: string | null;
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
  /** Display-only client identity enriched from the attempt's client record. */
  clientName?: string | null;
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

export type ClientInput = {
  clientId: string;
  inviteId: string | null;
  submissionId: string | null;
  issueNumber: number;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  creator: ActorSnapshot;
  submittedAt: number | null;
};
export type ClientRecord = ClientInput & {
  createdAt: number;
  updatedAt: number;
  previewUrl: string | null;
  productionUrl: string | null;
};
export type ClientFilters = {
  search?: string;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
};

/** Current Postgres-backed operations. Legacy ledger records never use these. */
export type OperationStatus =
  | "waiting_to_start"
  | "running"
  | "attention"
  | "failed"
  | "cancelled"
  | "preview_ready";
export type OperationCostKind = "actual" | "estimated" | "unreported";
export type OperationCostRollup = {
  currency: string | null;
  actual: string | null;
  estimated: string | null;
  unreportedCount: number;
  incompleteCount: number;
  unknownCoverageCount: number;
};
export type OperationOperatorAction = {
  actorId: string;
  recordedAt: number;
  decision: "retain_attention";
  evidenceRef: string;
};
export type OperationRecord = {
  attemptId: string;
  requestId: string;
  intakeId: string;
  clientId: string;
  operationId: string;
  profile: string;
  attemptNumber: number;
  status: OperationStatus;
  executionStatus: string;
  dispatchState: string;
  deliveryStatus: "none" | "preview_ready";
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastObservedAt: number;
  costKind: OperationCostKind;
  telemetryIncomplete: boolean;
  costs: OperationCostRollup[];
  attentionReason: string | null;
  recoveryReason: string | null;
  operatorAction: OperationOperatorAction | null;
};
export type OperationEvent = {
  eventId: string;
  eventKey: string;
  stage: string;
  transition: string;
  occurredAt: number;
  recordedAt: number;
  detailCode: string | null;
  provider: string | null;
  model: string | null;
  costKind: OperationCostKind;
  amount: string | null;
  currency: string | null;
  buildSha: string | null;
};
export type OperationDetail = OperationRecord & {
  events: OperationEvent[];
  eventCount: number;
  workflow: {
    repository: string | null;
    runId: string | null;
    runAttempt: number | null;
  };
  outbox: {
    state: string;
    retryCount: number;
    nextAttemptAt: number | null;
    lastErrorCode: string | null;
  };
};
export type OperationFilters = { cursor?: string | null; limit?: number };
export type OperationPage = Page<OperationRecord> & {
  recordSource: "operations";
  readOnly: true;
};
export type LegacyAttemptPage = Page<AttemptSummary> & {
  recordSource: "legacy";
  readOnly: true;
};
export type InviteFilters = {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: string;
  creatorId?: string;
};
export type InviteSummary = {
  inviteId: string;
  clientEmail: string | null;
  submitterEmail: string | null;
  expiresAt: number;
  status: string;
  createdAt: number;
  updatedAt: number;
  creator: ActorSnapshot;
  submissionId: string | null;
  issueNumber: number | null;
  clientId: string | null;
};
export type AcceptedIntake = ClientInput & {
  inviteId: string;
  submissionId: string;
  requestId: string | null;
  attemptId: string | null;
  initiator: ActorSnapshot;
  outboxState: "pending" | "delivered" | "missing";
  dispatchCreatedAt: number | null;
};
/** Trusted coordinator evidence for a persisted initial workflow outbox operation. */
export type DispatchRequest = {
  requestId: string;
  attemptId: string;
  clientId: string;
  inviteId: string;
  submissionId: string;
  issueNumber: number;
  initiator: ActorSnapshot;
  invitationCreator: ActorSnapshot;
  createdAt: number;
};
