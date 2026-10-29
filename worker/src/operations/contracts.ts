/** Private, server-only persistence contracts. IDs are references, not authorization. */
export type CostKind = "actual" | "estimated" | "unreported";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type PrivatePayload = { [key: string]: JsonValue };
export type ConsentRecord = { termsVersion: string; rightsConfirmed: true };

export type AcceptanceInput = {
  inviteId: string;
  submissionId: string;
  /** SHA-256 of the validated, normalized versioned submission, including consent/profile. */
  fingerprint: string;
  payloadVersion: number;
  payload: PrivatePayload;
  consent: ConsentRecord;
  profile: string;
};
export type AcceptanceResult = {
  intakeId: string;
  requestId: string;
  attemptId: string;
  operationId: string;
  created: boolean;
};
export type IntakeRecord = Omit<AcceptanceResult, "created"> &
  AcceptanceInput & {
    schemaVersion: 1;
    clientId: string;
    acceptanceState: "unconfirmed" | "confirmed";
    receivedAt: string;
    confirmedAt: string | null;
  };
export type ClientRecord = { clientId: string; createdAt: string };
export type GenerationRequestRecord = {
  requestId: string;
  intakeId: string;
  profile: string;
  idempotencyKey: string;
  dispatchState: "waiting_to_start" | "dispatched" | "attention";
  createdAt: string;
};
export type GenerationAttemptRecord = {
  attemptId: string;
  requestId: string;
  attemptNumber: number;
  state:
    | "waiting_to_start"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "attention";
  workflowRepository: string | null;
  workflowRunId: string | null;
  workflowRunAttempt: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  terminalReason: string | null;
  artifactReferences: string[];
  deliveryState: "none" | "preview_ready";
  githubConclusion: string | null;
  reconciledAt: string | null;
};
/** Decimal strings avoid binary floating point rounding in accounting. */
export type EventCost =
  | { costKind: "unreported"; amount: null; currency: null }
  | { costKind: "actual" | "estimated"; amount: string; currency: string };
export type StageEventRecord = EventCost & {
  coverageComplete: boolean | null;
  eventId: string;
  attemptId: string;
  eventKey: string;
  stage: string;
  transition: string;
  occurredAt: string;
  recordedAt: string;
  detailCode: string | null;
  provider: string | null;
  model: string | null;
  buildSha: string | null;
};
/** Read-only dashboard projections. They never include payload, consent or client identity. */
export type OperationStatus =
  | "waiting_to_start"
  | "running"
  | "attention"
  | "failed"
  | "cancelled"
  | "preview_ready";
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
  costKind: CostKind;
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
  costKind: CostKind;
  amount: string | null;
  currency: string | null;
  buildSha: string | null;
};
export type OperationDetailRecord = OperationRecord & {
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
export type OperationPageRecord = {
  items: OperationRecord[];
  nextCursor: string | null;
  total: number;
};
export interface OperationsReadStore {
  listOperations(
    limit: number,
    cursor?: string | null,
  ): Promise<OperationPageRecord>;
  getOperation(attemptId: string): Promise<OperationDetailRecord | null>;
}

export type DispatchOutboxRecord = {
  operationId: string;
  attemptId: string;
  payload: {
    schemaVersion: 1;
    intakeId: string;
    requestId: string;
    attemptId: string;
    operationId: string;
  };
  state:
    "blocked_unconfirmed" | "pending" | "leased" | "dispatched" | "attention";
  retryCount: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  fencingVersion: string;
  /** Captured before the first send and never upgraded. */
  gateProvenance: "verified-v1" | "unverified" | null;
  /** True after at least one verified-gate ambiguous send. */
  uncertainReplay: boolean;
  lastErrorCode: string | null;
};

export type RunIdentity = {
  /** Verified GitHub repository ID, not an untrusted repository name/input. */
  repositoryId: string;
  runId: string;
  runAttempt: number;
};
export type ClaimedOperation = {
  operationId: string;
  intakeId: string;
  requestId: string;
  attemptId: string;
};
export type RunStageEvent = {
  /** Cost coverage, independent of a known actual/estimated subtotal. */
  coverageComplete?: boolean;
  /** Selected verified build, required for the post-gate handoff only. */
  buildSha?: string;
  eventKey: string;
  stage: string;
  transition: string;
  occurredAt?: string;
  detailCode?: string;
  provider?: string;
  model?: string;
  costKind?: "actual" | "estimated" | "unreported";
  amount?: string;
  currency?: string;
};
export type DispatchOutcome =
  | "accepted"
  | "retryable"
  | "unknown"
  | "rejected";
export type DispatchDecision = {
  outcome: DispatchOutcome;
  /** Only a validated, capped server delay; absent means exponential backoff. */
  retryAfterSeconds?: number;
};
export type DispatchResult = DispatchDecision & { now: number };
export type LeasedDispatch = {
  operationId: string;
  fence: number;
  payload: DispatchOutboxRecord["payload"];
};

/** Trusted service boundary. API adapters MUST authorize callers before any read/write. */
export interface OperationsStore {
  leaseDispatch(now: number): Promise<LeasedDispatch | null>;
  recordDispatchResult(
    operationId: string,
    fence: number,
    result: DispatchResult,
  ): Promise<void>;
  /** One-time election only. No automatic ownership transfer or claim replay. */
  claimRun(
    operationId: string,
    run: RunIdentity,
  ): Promise<"claimed" | "duplicate" | "attention">;
  /** Returns IDs only after the same verified run owns the operation. */
  getClaimedOperation(
    operationId: string,
    run: RunIdentity,
  ): Promise<ClaimedOperation | null>;
  /** Returns private intake content only to the attempt's winning run. */
  getIntakeForRun(
    intakeId: string,
    run: RunIdentity,
  ): Promise<IntakeRecord | null>;
  /** Retains stable-key evidence only for the exact owner, including late events.
   * Events alone never regress or establish an execution terminal outcome.
   */
  appendEvent(
    attemptId: string,
    run: RunIdentity,
    event: RunStageEvent,
  ): Promise<"inserted" | "duplicate" | "attention">;
  createAcceptance(input: AcceptanceInput): Promise<AcceptanceResult>;
  /** Caller must first durably confirm the matching invite reservation in the DO. */
  confirmAcceptance(intakeId: string): Promise<void>;
  getIntake(intakeId: string): Promise<IntakeRecord | null>;
  /** Authoritative committed record lookup for bounded acceptance recovery. */
  getIntakeByBinding(
    inviteId: string,
    submissionId: string,
  ): Promise<IntakeRecord | null>;
}
