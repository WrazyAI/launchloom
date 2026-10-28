import { neon } from "@neondatabase/serverless";
import type { ReconciliationStore, ReconcileResult } from "./reconcile";
import type {
  AcceptanceResult,
  ClaimedOperation,
  IntakeRecord,
  LeasedDispatch,
  OperationDetailRecord,
  OperationEvent,
  OperationOperatorAction,
  OperationPageRecord,
  OperationRecord,
  OperationsReadStore,
  OperationsStore,
  RunIdentity,
  RunStageEvent,
} from "./contracts";
export type { OperationsStore } from "./contracts";

/**
 * Uncertain dispatch recovery is opt-in and must only be set after the Task 4
 * authenticated, pre-effect claim gate is verified. The default is disabled.
 */
export type OperationsStoreOptions = {
  uncertainDispatchRetry?: boolean;
};
const MAX_RETRY_AFTER_SECONDS = 3600;

/** Same injectable query surface as the membership store. Never share its credentials. */
export type OperationsSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};
export class OperationsError extends Error {
  constructor(
    readonly code:
      "invalid" | "conflict" | "not_found" | "dependency_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}
function invalid(): never {
  throw new OperationsError("invalid", "The operations request is not valid.");
}
function requireKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    invalid();
  return value;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}
function requireRun(run: RunIdentity): RunIdentity {
  if (
    !object(run) ||
    typeof run.repositoryId !== "string" ||
    typeof run.runId !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(run.repositoryId) ||
    !/^[1-9][0-9]{0,19}$/u.test(run.runId) ||
    !Number.isSafeInteger(run.runAttempt) ||
    run.runAttempt < 1 ||
    run.runAttempt > 2147483647
  )
    invalid();
  return run;
}
function unavailable(): never {
  throw new OperationsError(
    "dependency_unavailable",
    "Operations storage is temporarily unavailable.",
  );
}
export function operationsDatabaseSql(connectionString: string): OperationsSql {
  return neon(connectionString) as unknown as OperationsSql;
}

function epoch(value: unknown): number {
  if (typeof value !== "string") unavailable();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0) unavailable();
  return parsed;
}
function nullableEpoch(value: unknown): number | null {
  return value === null ? null : epoch(value);
}
function safeCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) unavailable();
  return value as number;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") unavailable();
  return value as string | null;
}
function parseOperatorAction(value: unknown): OperationOperatorAction | null {
  if (value === null) return null;
  if (!object(value)) unavailable();
  if (
    typeof value.actorId !== "string" ||
    value.actorId.length < 1 ||
    value.actorId.length > 200 ||
    value.decision !== "retain_attention" ||
    typeof value.evidenceRef !== "string" ||
    !/^[a-f0-9]{40,64}$/u.test(value.evidenceRef)
  )
    unavailable();
  return {
    actorId: value.actorId,
    recordedAt: epoch(value.recordedAt),
    decision: "retain_attention",
    evidenceRef: value.evidenceRef,
  };
}
function parseOperationRecord(value: unknown): OperationRecord {
  if (!object(value)) unavailable();
  const status = value.status;
  if (
    ![
      "waiting_to_start",
      "running",
      "attention",
      "failed",
      "cancelled",
      "preview_ready",
    ].includes(String(status))
  )
    unavailable();
  if (
    value.deliveryStatus !== "none" &&
    value.deliveryStatus !== "preview_ready"
  )
    unavailable();
  if (
    !["actual", "estimated", "unreported"].includes(String(value.costKind))
  )
    unavailable();
  if (typeof value.telemetryIncomplete !== "boolean") unavailable();
  if (!Array.isArray(value.costs)) unavailable();
  const costs = value.costs.map((cost) => {
    if (!object(cost)) unavailable();
    return {
      currency: nullableText(cost.currency),
      actual: nullableText(cost.actual),
      estimated: nullableText(cost.estimated),
      unreportedCount: safeCount(cost.unreportedCount),
      incompleteCount: safeCount(cost.incompleteCount),
      unknownCoverageCount: safeCount(cost.unknownCoverageCount),
    };
  });
  // Explicit field reads are the privacy boundary: unknown source columns stay out.
  return {
    attemptId: requireUuid(value.attemptId),
    requestId: requireUuid(value.requestId),
    intakeId: requireUuid(value.intakeId),
    clientId: requireUuid(value.clientId),
    operationId: requireUuid(value.operationId),
    profile: requireKey(value.profile),
    attemptNumber: (() => {
      const number = safeCount(value.attemptNumber);
      if (number < 1) unavailable();
      return number;
    })(),
    status: status as OperationRecord["status"],
    executionStatus: String(value.executionStatus),
    dispatchState: requireKey(value.dispatchState),
    deliveryStatus: value.deliveryStatus,
    createdAt: epoch(value.createdAt),
    startedAt: nullableEpoch(value.startedAt),
    finishedAt: nullableEpoch(value.finishedAt),
    lastObservedAt: epoch(value.lastObservedAt),
    costKind: value.costKind as OperationRecord["costKind"],
    telemetryIncomplete: value.telemetryIncomplete,
    costs,
    attentionReason: nullableText(value.attentionReason),
    recoveryReason: nullableText(value.recoveryReason),
    operatorAction: parseOperatorAction(value.operatorAction),
  };
}
function parseOperationEvent(value: unknown): OperationEvent {
  if (!object(value)) unavailable();
  if (
    !["actual", "estimated", "unreported"].includes(String(value.costKind))
  )
    unavailable();
  return {
    eventId: requireUuid(value.eventId),
    eventKey: requireKey(value.eventKey),
    stage: requireKey(value.stage),
    transition: requireKey(value.transition),
    occurredAt: epoch(value.occurredAt),
    recordedAt: epoch(value.recordedAt),
    detailCode: nullableText(value.detailCode),
    provider: nullableText(value.provider),
    model: nullableText(value.model),
    costKind: value.costKind as OperationEvent["costKind"],
    amount: nullableText(value.amount),
    currency: nullableText(value.currency),
    buildSha: nullableText(value.buildSha),
  };
}
export function encodeOperationsCursor(boundary: {
  createdAt: string;
  attemptId: string;
}) {
  if (
    typeof boundary.createdAt !== "string" ||
    !Number.isFinite(Date.parse(boundary.createdAt))
  )
    invalid();
  requireUuid(boundary.attemptId);
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      createdAt: boundary.createdAt,
      attemptId: boundary.attemptId,
    }),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
export function decodeOperationsCursor(cursor: string) {
  if (
    typeof cursor !== "string" ||
    cursor.length < 1 ||
    cursor.length > 1024 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  )
    invalid();
  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !object(value) ||
      Object.keys(value).length !== 2 ||
      typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt))
    )
      throw Error();
    return {
      createdAt: value.createdAt,
      attemptId: requireUuid(value.attemptId),
    };
  } catch {
    invalid();
  }
}

export function createOperationsStore(
  sql: OperationsSql,
  options: OperationsStoreOptions = {},
): OperationsStore &
  ReconciliationStore &
  OperationsReadStore & {
    listReconciliationAttempts(): Promise<string[]>;
    getOperationAlerts(): Promise<{ attemptId: string; code: string }[]>;
  } {
  if (
    typeof options !== "object" ||
    (options.uncertainDispatchRetry !== undefined &&
      typeof options.uncertainDispatchRetry !== "boolean")
  )
    invalid();
  const uncertainDispatchRetry = options.uncertainDispatchRetry === true;
  async function query<T>(text: string, params: unknown[]) {
    try {
      return await sql.query<T>(text, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/\bacceptance_conflict\b/u.test(message))
        throw new OperationsError(
          "conflict",
          "Submission conflicts with the saved acceptance.",
        );
      if (/\bintake_not_found\b/u.test(message))
        throw new OperationsError("not_found", "Intake not found.");
      if (
        /\b(invalid_acceptance|invalid_event|invalid_observation|invalid_resolution)\b/u.test(
          message,
        )
      )
        invalid();
      if (/\bevent_conflict\b/u.test(message))
        throw new OperationsError(
          "conflict",
          "Event conflicts with saved evidence.",
        );
      unavailable();
    }
  }
  return {
    async listOperations(limit, cursor = null): Promise<OperationPageRecord> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid();
      const boundary =
        cursor === null || cursor === undefined
          ? null
          : decodeOperationsCursor(cursor);
      const rows = await query<{ record: unknown }>(
        "select * from launchloom_operations.list_operations($1::integer, $2::timestamptz, $3::uuid)",
        [limit, boundary?.createdAt ?? null, boundary?.attemptId ?? null],
      );
      const page = rows[0]?.record;
      if (!object(page) || !Array.isArray(page.items)) unavailable();
      const items = page.items.map(parseOperationRecord);
      const total = safeCount(page.total);
      const hasMore = page.hasMore === true;
      const last = page.items[page.items.length - 1];
      const nextCursor =
        hasMore && object(last) && typeof last.createdAt === "string"
          ? encodeOperationsCursor({
              createdAt: last.createdAt,
              attemptId: requireUuid(last.attemptId),
            })
          : null;
      return { items, nextCursor, total };
    },
    async getOperation(attemptId): Promise<OperationDetailRecord | null> {
      requireUuid(attemptId);
      const rows = await query<{ record: unknown }>(
        "select launchloom_operations.get_operation($1::uuid) as record",
        [attemptId],
      );
      const value = rows[0]?.record;
      if (value === undefined || value === null) return null;
      if (!object(value) || !Array.isArray(value.events)) unavailable();
      const record = parseOperationRecord(value);
      const events = value.events.map(parseOperationEvent);
      const eventCount = safeCount(value.eventCount);
      if (!object(value.workflow) || !object(value.outbox)) unavailable();
      const workflow = value.workflow;
      const outbox = value.outbox;
      if (
        (workflow.repository !== null &&
          typeof workflow.repository !== "string") ||
        (workflow.runId !== null && typeof workflow.runId !== "string") ||
        (workflow.runAttempt !== null &&
          (!Number.isSafeInteger(workflow.runAttempt) ||
            (workflow.runAttempt as number) < 1)) ||
        typeof outbox.state !== "string" ||
        typeof outbox.retryCount !== "number" ||
        !Number.isSafeInteger(outbox.retryCount) ||
        (outbox.retryCount as number) < 0
      )
        unavailable();
      return {
        ...record,
        events,
        eventCount,
        workflow: {
          repository: workflow.repository as string | null,
          runId: workflow.runId as string | null,
          runAttempt: workflow.runAttempt as number | null,
        },
        outbox: {
          state: outbox.state,
          retryCount: outbox.retryCount as number,
          nextAttemptAt: nullableEpoch(outbox.nextAttemptAt),
          lastErrorCode: nullableText(outbox.lastErrorCode),
        },
      };
    },
    async getReconciliationAttempt(id) {
      requireUuid(id);
      const rows = await query<{
        attempt_id: string;
        repository_id: string | null;
        run_id: string | null;
        run_attempt: number | null;
        state: string;
      }>(
        "select * from launchloom_operations.get_reconciliation_attempt($1::uuid)",
        [id],
      );
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        attemptId: row.attempt_id,
        state: row.state,
        run:
          row.repository_id && row.run_id && row.run_attempt
            ? requireRun({
                repositoryId: row.repository_id,
                runId: row.run_id,
                runAttempt: row.run_attempt,
              })
            : null,
      };
    },
    async recordRunObservation(id, run, conclusion) {
      requireUuid(id);
      if (run) requireRun(run);
      if (
        ![
          "unknown",
          "pending",
          "success",
          "failure",
          "cancelled",
          "timed_out",
          "action_required",
          "neutral",
          "skipped",
          "stale",
          "startup_failure",
        ].includes(conclusion)
      )
        invalid();
      const rows = await query<{ result: ReconcileResult }>(
        "select launchloom_operations.record_run_observation($1::uuid, $2, $3, $4::integer, $5) as result",
        [
          id,
          run?.repositoryId ?? null,
          run?.runId ?? null,
          run?.runAttempt ?? null,
          conclusion,
        ],
      );
      if (!["updated", "unchanged", "attention"].includes(rows[0]?.result))
        unavailable();
      return rows[0].result;
    },
    async resolveAttention(id, actorId, evidenceRef) {
      requireUuid(id);
      requireKey(actorId);
      if (!/^[a-f0-9]{40,64}$/u.test(evidenceRef)) invalid();
      const rows = await query<{ result: ReconcileResult }>(
        "select launchloom_operations.retain_attention($1::uuid, $2, $3) as result",
        [id, actorId, evidenceRef],
      );
      if (!["updated", "unchanged", "attention"].includes(rows[0]?.result))
        unavailable();
      return rows[0].result;
    },
    async listReconciliationAttempts() {
      const rows = await query<{ attempt_id: string }>(
        "select * from launchloom_operations.list_reconciliation_attempts()",
        [],
      );
      return rows.map((row) => requireUuid(row.attempt_id));
    },
    async getOperationAlerts() {
      return query<{ attemptId: string; code: string }>(
        "select * from launchloom_operations.operation_alerts()",
        [],
      );
    },
    async leaseDispatch(now) {
      if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000)
        invalid();
      const rows = await query<{
        operation_id: string;
        fence: string | number;
        payload: LeasedDispatch["payload"];
      }>(
        "select * from launchloom_operations.lease_dispatch($1::timestamptz, $2::boolean)",
        [new Date(now).toISOString(), uncertainDispatchRetry],
      );
      if (!rows.length) return null;
      const row = rows[0];
      const fence = Number(row.fence);
      if (
        !Number.isSafeInteger(fence) ||
        fence < 1 ||
        !row.operation_id ||
        !object(row.payload) ||
        row.payload.operationId !== row.operation_id
      )
        unavailable();
      return { operationId: row.operation_id, fence, payload: row.payload };
    },
    async recordDispatchResult(operationId, fence, result) {
      requireKey(operationId);
      if (
        !Number.isSafeInteger(fence) ||
        fence < 1 ||
        !object(result) ||
        !["accepted", "retryable", "unknown", "rejected"].includes(
          result.outcome,
        ) ||
        !Number.isSafeInteger(result.now) ||
        result.now < 0 ||
        result.now > 8640000000000000 ||
        (result.retryAfterSeconds !== undefined &&
          (!Number.isSafeInteger(result.retryAfterSeconds) ||
            result.retryAfterSeconds < 1 ||
            result.retryAfterSeconds > MAX_RETRY_AFTER_SECONDS))
      )
        invalid();
      await query(
        "select launchloom_operations.record_dispatch_result($1::uuid, $2::bigint, $3, $4::timestamptz, $5::boolean, $6::integer)",
        [
          operationId,
          fence,
          result.outcome,
          new Date(result.now).toISOString(),
          uncertainDispatchRetry,
          result.retryAfterSeconds ?? null,
        ],
      );
    },
    async claimRun(operationId, run) {
      requireUuid(operationId);
      requireRun(run);
      const rows = await query<{
        result: "claimed" | "duplicate" | "attention";
      }>(
        "select launchloom_operations.claim_run($1::uuid, $2, $3, $4::integer) as result",
        [operationId, run.repositoryId, run.runId, run.runAttempt],
      );
      if (!["claimed", "duplicate", "attention"].includes(rows[0]?.result))
        unavailable();
      return rows[0].result;
    },
    async getClaimedOperation(operationId, run) {
      requireUuid(operationId);
      requireRun(run);
      const rows = await query<{
        operation_id: string;
        intake_id: string;
        request_id: string;
        attempt_id: string;
      }>(
        "select * from launchloom_operations.get_claimed_operation($1::uuid, $2, $3, $4::integer)",
        [operationId, run.repositoryId, run.runId, run.runAttempt],
      );
      const row = rows[0];
      if (!row) return null;
      if (
        !UUID.test(row.operation_id) ||
        !UUID.test(row.intake_id) ||
        !UUID.test(row.request_id) ||
        !UUID.test(row.attempt_id)
      )
        unavailable();
      return {
        operationId: row.operation_id,
        intakeId: row.intake_id,
        requestId: row.request_id,
        attemptId: row.attempt_id,
      };
    },
    async getIntakeForRun(intakeId, run) {
      requireUuid(intakeId);
      requireRun(run);
      const rows = await query<{ record: IntakeRecord }>(
        "select * from launchloom_operations.get_claimed_intake($1::uuid, $2, $3, $4::integer)",
        [intakeId, run.repositoryId, run.runId, run.runAttempt],
      );
      const record = rows[0]?.record;
      if (record === undefined || record === null) return null;
      if (
        !object(record) ||
        record.intakeId !== intakeId ||
        record.acceptanceState !== "confirmed"
      )
        unavailable();
      return record;
    },
    async appendEvent(attemptId, run, event) {
      requireUuid(attemptId);
      requireRun(run);
      if (
        !object(event) ||
        (event.coverageComplete !== undefined && typeof event.coverageComplete !== 'boolean') ||
        (event.coverageComplete === true && (event.costKind ?? 'unreported') === 'unreported') ||
        typeof event.eventKey !== "string" ||
        event.eventKey.length < 1 ||
        !/^[A-Za-z0-9:._/-]{1,200}$/u.test(event.eventKey) ||
        typeof event.stage !== "string" ||
        !/^[a-z0-9_]{1,80}$/u.test(event.stage) ||
        !["started", "completed", "failed", "cancelled", "observed"].includes(
          event.transition,
        ) ||
        (event.detailCode !== undefined &&
          !/^[a-z0-9_]{1,80}$/u.test(event.detailCode)) ||
        (event.buildSha !== undefined &&
          (!/^[a-f0-9]{40}$/u.test(event.buildSha) ||
            event.stage !== "handoff" ||
            event.transition !== "completed")) ||
        (event.stage === "handoff" && !event.buildSha) ||
        (event.occurredAt !== undefined &&
          !Number.isFinite(Date.parse(event.occurredAt))) ||
        (event.provider !== undefined &&
          !/^[A-Za-z0-9._:/-]{1,120}$/u.test(event.provider)) ||
        (event.model !== undefined &&
          !/^[A-Za-z0-9._:/-]{1,120}$/u.test(event.model)) ||
        (event.costKind !== undefined &&
          !["actual", "estimated", "unreported"].includes(event.costKind))
      )
        invalid();
      const rows = await query<{
        result: "inserted" | "duplicate" | "attention";
      }>(
        "select launchloom_operations.append_run_event($1::uuid, $2, $3, $4::integer, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12, $13::numeric, $14, $15, $16::boolean) as result",
        [
          attemptId,
          run.repositoryId,
          run.runId,
          run.runAttempt,
          event.eventKey,
          event.stage,
          event.transition,
          event.occurredAt ?? null,
          event.detailCode ?? null,
          event.provider ?? null,
          event.model ?? null,
          event.costKind ?? "unreported",
          event.amount ?? null,
          event.currency ?? null,
          event.buildSha ?? null,
          event.coverageComplete ?? null,
        ],
      );
      if (!["inserted", "duplicate", "attention"].includes(rows[0]?.result))
        unavailable();
      return rows[0].result;
    },
    async createAcceptance(input) {
      if (!object(input)) invalid();
      const invite = requireKey(input.inviteId);
      const submission = requireKey(input.submissionId);
      const profile = requireKey(input.profile);
      if (
        !/^[a-f0-9]{64}$/u.test(input.fingerprint) ||
        !Number.isSafeInteger(input.payloadVersion) ||
        input.payloadVersion < 1 ||
        input.payloadVersion > 2147483647 ||
        !object(input.payload) ||
        !object(input.consent) ||
        input.consent.rightsConfirmed !== true
      )
        invalid();
      requireKey(input.consent.termsVersion);
      let payload: string, consent: string;
      try {
        payload = JSON.stringify(input.payload);
        consent = JSON.stringify(input.consent);
      } catch {
        invalid();
      }
      // PostgreSQL function is one atomic statement/transaction. No BEGIN over HTTP,
      // no DO/GitHub/network side effect inside a database transaction.
      const rows = await query<{
        intake_id: string;
        request_id: string;
        attempt_id: string;
        operation_id: string;
        created: boolean;
      }>(
        "select * from launchloom_operations.create_acceptance($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)",
        [
          invite,
          submission,
          input.fingerprint,
          input.payloadVersion,
          payload,
          consent,
          profile,
        ],
      );
      const row = rows[0];
      if (
        !row ||
        !row.intake_id ||
        !row.request_id ||
        !row.attempt_id ||
        !row.operation_id ||
        typeof row.created !== "boolean"
      )
        unavailable();
      const result: AcceptanceResult = {
        intakeId: row.intake_id,
        requestId: row.request_id,
        attemptId: row.attempt_id,
        operationId: row.operation_id,
        created: row.created,
      };
      return result;
    },
    async confirmAcceptance(intakeId) {
      await query("select launchloom_operations.confirm_acceptance($1)", [
        requireKey(intakeId),
      ]);
    },
    async getIntake(intakeId) {
      const rows = await query<{ record: IntakeRecord }>(
        "select * from launchloom_operations.get_intake($1)",
        [requireKey(intakeId)],
      );
      return rows[0]?.record ?? null;
    },
    async getIntakeByBinding(inviteId, submissionId) {
      const rows = await query<{ record: IntakeRecord }>(
        "select * from launchloom_operations.get_acceptance_by_binding($1, $2)",
        [requireKey(inviteId), requireKey(submissionId)],
      );
      return rows[0]?.record ?? null;
    },
  };
}
