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
};
/** Decimal strings avoid binary floating point rounding in accounting. */
export type EventCost =
  | { costKind: "unreported"; amount: null; currency: null }
  | { costKind: "actual" | "estimated"; amount: string; currency: string };
export type StageEventRecord = EventCost & {
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
};
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
  lastErrorCode: string | null;
};

/** Trusted service boundary. API adapters MUST authorize callers before any read/write. */
export interface OperationsStore {
  createAcceptance(input: AcceptanceInput): Promise<AcceptanceResult>;
  /** Caller must first durably confirm the matching invite reservation in the DO. */
  confirmAcceptance(intakeId: string): Promise<void>;
  getIntake(intakeId: string): Promise<IntakeRecord | null>;
}
