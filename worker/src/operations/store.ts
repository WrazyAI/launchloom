import { neon } from "@neondatabase/serverless";
import type {
  AcceptanceResult,
  IntakeRecord,
  OperationsStore,
} from "./contracts";
export type { OperationsStore } from "./contracts";

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
function unavailable(): never {
  throw new OperationsError(
    "dependency_unavailable",
    "Operations storage is temporarily unavailable.",
  );
}
export function operationsDatabaseSql(connectionString: string): OperationsSql {
  return neon(connectionString) as unknown as OperationsSql;
}

export function createOperationsStore(sql: OperationsSql): OperationsStore {
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
      if (/\binvalid_acceptance\b/u.test(message)) invalid();
      unavailable();
    }
  }
  return {
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
