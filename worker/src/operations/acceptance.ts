import type {
  AcceptanceInput,
  AcceptanceResult,
  OperationsStore,
} from "./contracts";
import {
  OperationsError,
  createOperationsStore,
  operationsDatabaseSql,
} from "./store";

/**
 * Cross-store intake acceptance. Postgres is the authority for new intakes;
 * the existing OnboardingInvites Durable Object remains the authority for
 * invite ownership. The handshake is intentionally not atomic:
 *
 * 1. reserve the invite for the stable submission ID and fingerprint,
 * 2. commit the intake and blocked outbox in Postgres,
 * 3. confirm that exact reservation in the Durable Object,
 * 4. confirm Postgres eligibility so the outbox can leave `blocked_unconfirmed`,
 * 5. queue the existing idempotent receipt separately.
 *
 * A retry with the same IDs and fingerprint is safe at every step. An
 * uncertain outcome never releases invite ownership and never claims success.
 */

export type AcceptanceRoutingMode = "legacy" | "postgres";

export type InviteReservationState = "legacy" | "unconfirmed" | "confirmed";

export type InviteReservation = {
  accepted: boolean;
  /** Persisted routing mode. A retry never switches paths because a flag moved. */
  mode: AcceptanceRoutingMode;
  state: InviteReservationState;
  /** SHA-256 of the normalized submission bound at reservation time. */
  fingerprint: string;
  /** True when the credential expired but a postgres reservation is retained. */
  expired?: boolean;
  duplicate?: boolean;
  acceptance?: AcceptanceResult | null;
  reason?:
    | "invalid"
    | "expired"
    | "consumed"
    | "revoked"
    | "submission_mismatch"
    | "stale_submission_mismatch"
    | "in_progress"
    | "recovery_required"
    | "routing_changed";
};

/** Typed boundary implemented by the OnboardingInvites Durable Object. */
export interface InviteAcceptanceAdapter {
  reserve(input: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    routingMode: AcceptanceRoutingMode;
  }): Promise<InviteReservation>;
  inspect(input: {
    inviteId: string;
    submissionId: string;
  }): Promise<InviteReservation | null>;
  /** Binds exact IDs and fingerprint; idempotent for an identical replay. */
  confirm(input: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    acceptance: AcceptanceResult;
  }): Promise<{ confirmed: true; duplicate: boolean }>;
  /** Existing receipt outbox. It is not a workflow dispatch and creates no issue. */
  queueReceipt(input: {
    inviteId: string;
    submissionId: string;
    recipient: string;
    businessName: string;
  }): Promise<void>;
}

export type AcceptanceDependencies = {
  store: OperationsStore;
  invites: InviteAcceptanceAdapter;
  /** Desired route for a brand-new reservation. Defaults to legacy/off. */
  routingMode?: AcceptanceRoutingMode;
  receipt?: { recipient: string; businessName: string };
  now?: () => number;
};

export type AcceptanceErrorCode =
  | "legacy_route"
  | "invalid"
  | "submission_mismatch"
  | "invite_unavailable"
  | "in_progress"
  | "recovery_required"
  | "dependency_unavailable"
  | "confirmation_pending";

const STATUS: Record<AcceptanceErrorCode, number> = {
  legacy_route: 409,
  invalid: 400,
  submission_mismatch: 409,
  invite_unavailable: 403,
  in_progress: 409,
  recovery_required: 503,
  dependency_unavailable: 503,
  confirmation_pending: 503,
};

export class AcceptanceError extends Error {
  readonly status: number;

  constructor(
    readonly code: AcceptanceErrorCode,
    message: string,
    status = STATUS[code],
  ) {
    super(message);
    this.name = "AcceptanceError";
    this.status = status;
  }
}

/** Stable version marker for the rights/consent contract stored with an intake. */
export const INTAKE_CONSENT_VERSION = "client-intake-v2";

export function acceptanceModeFromEnv(env: {
  OPERATIONS_INTAKE_MODE?: string;
}): AcceptanceRoutingMode {
  return env.OPERATIONS_INTAKE_MODE?.trim().toLowerCase() === "postgres"
    ? "postgres"
    : "legacy";
}

export function operationsStoreFromEnv(env: {
  OPERATIONS_DATABASE_URL?: string;
}): OperationsStore {
  const connectionString = env.OPERATIONS_DATABASE_URL?.trim();
  if (!connectionString)
    throw new AcceptanceError(
      "dependency_unavailable",
      "Operations storage is not configured.",
    );
  return createOperationsStore(operationsDatabaseSql(connectionString));
}

function sameAcceptance(
  left: AcceptanceResult,
  right: AcceptanceResult,
): boolean {
  return (
    left.intakeId === right.intakeId &&
    left.requestId === right.requestId &&
    left.attemptId === right.attemptId &&
    left.operationId === right.operationId
  );
}

function reservationError(reservation: InviteReservation): AcceptanceError {
  switch (reservation.reason) {
    case "submission_mismatch":
    case "stale_submission_mismatch":
      return new AcceptanceError(
        "submission_mismatch",
        "This submission changed after acceptance. Request a new invitation to send different details.",
      );
    case "in_progress":
      return new AcceptanceError(
        "in_progress",
        "This submission is already being accepted. Retry shortly.",
      );
    case "recovery_required":
      return new AcceptanceError(
        "recovery_required",
        "Your intake needs operator recovery. Contact the person who invited you.",
      );
    case "expired":
      return new AcceptanceError(
        "invite_unavailable",
        "This invitation is no longer available.",
      );
    case "consumed":
      return new AcceptanceError(
        "invite_unavailable",
        "This invitation has already been used.",
      );
    case "revoked":
      return new AcceptanceError(
        "invite_unavailable",
        "This invitation is no longer available.",
      );
    default:
      return new AcceptanceError(
        "invalid",
        "This invitation is invalid or no longer available.",
      );
  }
}

function storeFailure(error: unknown, expired: boolean): AcceptanceError {
  if (error instanceof OperationsError) {
    if (error.code === "conflict")
      return new AcceptanceError(
        "submission_mismatch",
        "This submission conflicts with the saved acceptance.",
      );
    if (error.code === "invalid")
      return new AcceptanceError("invalid", "The intake request is not valid.");
  }
  if (expired)
    return new AcceptanceError(
      "recovery_required",
      "Your intake could not be verified before the invitation expired. Contact the person who invited you.",
    );
  return new AcceptanceError(
    "dependency_unavailable",
    "Your intake could not be saved yet. Retry with the same submission.",
  );
}

/**
 * Reserve, commit, confirm the exact reservation, then confirm Postgres
 * eligibility. The returned result is only produced after all four durable
 * steps, so callers must not acknowledge acceptance before this resolves.
 */
export async function acceptIntake(
  input: AcceptanceInput,
  deps: AcceptanceDependencies,
): Promise<AcceptanceResult> {
  const routingMode = deps.routingMode ?? "legacy";
  const reservation = await deps.invites.reserve({
    inviteId: input.inviteId,
    submissionId: input.submissionId,
    fingerprint: input.fingerprint,
    routingMode,
  });
  if (!reservation.accepted) throw reservationError(reservation);
  if (reservation.mode === "legacy")
    throw new AcceptanceError(
      "legacy_route",
      "This submission is owned by the legacy intake route.",
    );
  if (reservation.mode !== "postgres")
    throw new AcceptanceError("invalid", "Unknown intake routing mode.");
  if (reservation.fingerprint !== input.fingerprint)
    throw new AcceptanceError(
      "submission_mismatch",
      "This submission changed after acceptance. Request a new invitation to send different details.",
    );

  let acceptance: AcceptanceResult;
  try {
    // Idempotent replay: a lost response returns the previously committed IDs.
    acceptance = await deps.store.createAcceptance(input);
  } catch (error) {
    throw storeFailure(error, reservation.expired === true);
  }

  // A confirmed DO reservation must refer to the same durable Postgres rows.
  if (
    reservation.acceptance &&
    !sameAcceptance(reservation.acceptance, acceptance)
  )
    throw new AcceptanceError(
      "recovery_required",
      "Your intake needs operator recovery. Contact the person who invited you.",
    );

  try {
    await deps.invites.confirm({
      inviteId: input.inviteId,
      submissionId: input.submissionId,
      fingerprint: input.fingerprint,
      acceptance,
    });
  } catch (error) {
    if (error instanceof AcceptanceError) throw error;
    throw new AcceptanceError(
      "confirmation_pending",
      "Your intake is saved and awaiting confirmation. Retry with the same submission shortly.",
    );
  }

  try {
    // Outbox stays blocked_unconfirmed until this durable confirmation lands.
    await deps.store.confirmAcceptance(acceptance.intakeId);
  } catch (error) {
    throw storeFailure(error, reservation.expired === true);
  }

  if (deps.receipt) {
    try {
      await deps.invites.queueReceipt({
        inviteId: input.inviteId,
        submissionId: input.submissionId,
        recipient: deps.receipt.recipient,
        businessName: deps.receipt.businessName,
      });
    } catch {
      // The acceptance is already durable. The receipt outbox has its own
      // retry semantics and must never turn a saved intake into a failure.
      console.error("Intake receipt could not be queued");
    }
  }

  return acceptance;
}

/**
 * Bounded recovery entry point for an unconfirmed handshake, including after
 * its lease or credential expired. It verifies the persisted fingerprint and
 * exact reservation before replaying the idempotent acceptance steps. It never
 * clears a reservation whose Postgres outcome may be unknown.
 */
export async function recoverAcceptance(
  input: AcceptanceInput,
  deps: AcceptanceDependencies,
): Promise<AcceptanceResult> {
  const reservation = await deps.invites.inspect({
    inviteId: input.inviteId,
    submissionId: input.submissionId,
  });
  if (!reservation)
    throw new AcceptanceError(
      "recovery_required",
      "No recoverable acceptance reservation was found.",
    );
  if (reservation.mode !== "postgres")
    throw new AcceptanceError(
      "legacy_route",
      "This submission is owned by the legacy intake route.",
    );
  if (reservation.fingerprint !== input.fingerprint)
    throw new AcceptanceError(
      "submission_mismatch",
      "The recovery fingerprint does not match the reserved submission.",
    );
  return acceptIntake(input, { ...deps, routingMode: "postgres" });
}
