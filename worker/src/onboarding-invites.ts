import { DurableObject } from "cloudflare:workers";
import { renderIntakeReceivedEmail } from "../../emails/render-email.mjs";
import { sendEmail, type TransactionalEmailEnvironment } from "./transactional-email";
import type { ActorSnapshot, AcceptedIntake, InviteFilters, InviteSummary, Page } from "../../src/lib/admin-contracts";
import type { GenerationLedger } from "./generation-ledger";
import { pageRecords } from "./admin/pagination";
import {
  AcceptanceError,
  operationsStoreFromEnv,
  reconcileAcceptance,
  type AcceptanceRoutingMode,
  type InviteAcceptanceAdapter,
  type InviteReservation,
} from "./operations/acceptance";
import type { OperationsStore } from "./operations/contracts";

const unknownActor: ActorSnapshot = {kind:"unknown",id:null,name:null,email:null,source:"legacy"};
type Snapshot = { businessName: string; contactName?: string | null; email: string; phone?: string | null };
type ProjectionRow = { invite_id:string; submission_id:string; data:string; status:string; attempts:number; next_attempt_at:number; last_error:string|null };

const OUTBOX_DELIVERY_LEASE_MS = 2 * 60_000;
const OUTBOX_RETRY_BASE_MS = 30_000;
const OUTBOX_RETRY_MAX_MS = 30 * 60_000;

export type InviteRegistration = {
  inviteId: string;
  clientEmail: string | null;
  expiresAt: number;
  allowedOrigin: string;
  tokenHash: string;
  now: number;
  creator?: ActorSnapshot;
};

export type InviteValidation = {
  valid: boolean;
  accepted?: boolean;
  issue?: number | null;
  clientEmail?: string | null;
};

export type IntakeOperation = {
  operationId: string;
  submissionHash: string;
  phase: "reserved" | "creating_issue";
  page: number;
  sweeps: number;
  recoveryRequired: boolean;
};

type InviteRow = {
  invite_id: string;
  client_email: string | null;
  submitter_email: string | null;
  expires_at: number;
  allowed_origin: string;
  token_hash: string;
  status: "unused" | "consumed" | "expired" | "revoked";
  reserved_submission_id: string | null;
  reserved_submission_hash: string | null;
  reserved_at: number | null;
  reservation_phase: "reserved" | "creating_issue";
  routing_mode: AcceptanceRoutingMode;
  acceptance_state: "legacy" | "unconfirmed" | "confirmed";
  accepted_intake_id: string | null;
  accepted_request_id: string | null;
  accepted_attempt_id: string | null;
  accepted_operation_id: string | null;
  acceptance_commit_started: number;
  acceptance_recovery_at: number | null;
  acceptance_recovery_attempts: number;
  acceptance_attention: number;
  acceptance_last_error: string | null;
  receipt_recipient: string | null;
  receipt_business_name: string | null;
  receipt_queued_at: number | null;
  submission_id: string | null;
  submission_hash: string | null;
  issue_number: number | null;
  operation_id: string | null;
  recovery_page: number;
  recovery_sweeps: number;
  recovery_lease: string | null;
  recovery_lease_until: number;
  created_at: number;
  updated_at: number;
  creator: string | null;
  accepted_snapshot: string | null;
  submitted_at: number | null;
  recovery_actor: string | null;
};

type OutboxTaskType = "workflow" | "receipt";
type OutboxStatus = "pending" | "delivering" | "delivered";
type OutboxRow = {
  invite_id: string;
  submission_id: string;
  task_type: OutboxTaskType;
  issue_number: number | null;
  recipient: string | null;
  business_name: string | null;
  idempotency_key: string | null;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: number;
  updated_at: number;
  request_id: string | null;
  attempt_id: string | null;
  created_at: number;
};

type OnboardingInvitesEnvironment = TransactionalEmailEnvironment & {
  GITHUB_ORG_TOKEN: string;
  GENERATION_LEDGER: DurableObjectNamespace<GenerationLedger>;
  OPERATIONS_DATABASE_URL?: string;
  /** Test-only dependency seam; wrangler cannot provide this binding. */
  OPERATIONS_STORE?: OperationsStore;
};

export class OnboardingInvites extends DurableObject<OnboardingInvitesEnvironment> {
  constructor(ctx: DurableObjectState, env: OnboardingInvitesEnvironment) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS onboarding_invites (
          invite_id TEXT PRIMARY KEY,
          client_email TEXT,
          expires_at INTEGER NOT NULL,
          allowed_origin TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK(status IN ('unused','consumed','expired','revoked')),
          reserved_submission_id TEXT,
          reserved_submission_hash TEXT,
          reserved_at INTEGER,
          reservation_phase TEXT NOT NULL DEFAULT 'reserved',
          routing_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(routing_mode IN ('legacy','postgres')),
          acceptance_state TEXT NOT NULL DEFAULT 'legacy' CHECK(acceptance_state IN ('legacy','unconfirmed','confirmed')),
          accepted_intake_id TEXT,
          accepted_request_id TEXT,
          accepted_attempt_id TEXT,
          accepted_operation_id TEXT,
          acceptance_commit_started INTEGER NOT NULL DEFAULT 0,
          acceptance_recovery_at INTEGER,
          acceptance_recovery_attempts INTEGER NOT NULL DEFAULT 0,
          acceptance_attention INTEGER NOT NULL DEFAULT 0,
          acceptance_last_error TEXT,
          receipt_recipient TEXT,
          receipt_business_name TEXT,
          receipt_queued_at INTEGER,
          submission_id TEXT,
          submission_hash TEXT,
          issue_number INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS onboarding_invites_status_expiry
          ON onboarding_invites(status, expires_at);
        CREATE TABLE IF NOT EXISTS intake_outbox (
          invite_id TEXT NOT NULL,
          submission_id TEXT NOT NULL,
          task_type TEXT NOT NULL CHECK(task_type IN ('workflow','receipt')),
          issue_number INTEGER,
          recipient TEXT,
          business_name TEXT,
          status TEXT NOT NULL CHECK(status IN ('pending','delivering','delivered')),
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(invite_id, submission_id, task_type)
        );
        CREATE INDEX IF NOT EXISTS intake_outbox_due
          ON intake_outbox(status, next_attempt_at);
        CREATE TABLE IF NOT EXISTS intake_reconciliations (
          invite_id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
          issue_number INTEGER NOT NULL, reviewer_email TEXT NOT NULL, recovered_at INTEGER NOT NULL,
          recipient TEXT NOT NULL, business_name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS coverage_lookup_events (
          invite_id TEXT NOT NULL,
          at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS coverage_lookup_events_invite_at ON coverage_lookup_events (invite_id, at);
        CREATE INDEX IF NOT EXISTS coverage_lookup_events_at ON coverage_lookup_events (at);
        CREATE TABLE IF NOT EXISTS intake_projection_outbox (
          invite_id TEXT NOT NULL, submission_id TEXT NOT NULL, data TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL, last_error TEXT,
          PRIMARY KEY(invite_id,submission_id)
        );
      `);
      const outboxColumns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(intake_outbox)")
        .toArray();
      if (!outboxColumns.some((column) => column.name === "idempotency_key"))
        ctx.storage.sql.exec(
          "ALTER TABLE intake_outbox ADD COLUMN idempotency_key TEXT",
        );
      for (const name of ["request_id", "attempt_id"])
        if (!outboxColumns.some((c) => c.name === name))
          ctx.storage.sql.exec(
            `ALTER TABLE intake_outbox ADD COLUMN ${name} TEXT`,
          );
      const columns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(onboarding_invites)")
        .toArray();
      if (!columns.some((column) => column.name === "reservation_phase")) {
        ctx.storage.sql.exec(
          "ALTER TABLE onboarding_invites ADD COLUMN reservation_phase TEXT NOT NULL DEFAULT 'reserved'",
        );
      }
      for (const [name, declaration] of [
        [
          "routing_mode",
          "TEXT NOT NULL DEFAULT 'legacy' CHECK(routing_mode IN ('legacy','postgres'))",
        ],
        [
          "acceptance_state",
          "TEXT NOT NULL DEFAULT 'legacy' CHECK(acceptance_state IN ('legacy','unconfirmed','confirmed'))",
        ],
        ["accepted_intake_id", "TEXT"],
        ["accepted_request_id", "TEXT"],
        ["accepted_attempt_id", "TEXT"],
        ["accepted_operation_id", "TEXT"],
        ["acceptance_commit_started", "INTEGER NOT NULL DEFAULT 0"],
        ["acceptance_recovery_at", "INTEGER"],
        ["acceptance_recovery_attempts", "INTEGER NOT NULL DEFAULT 0"],
        ["acceptance_attention", "INTEGER NOT NULL DEFAULT 0"],
        ["acceptance_last_error", "TEXT"],
        ["receipt_recipient", "TEXT"],
        ["receipt_business_name", "TEXT"],
        ["receipt_queued_at", "INTEGER"],
        ["operation_id", "TEXT"],
        ["recovery_page", "INTEGER NOT NULL DEFAULT 1"],
        ["recovery_sweeps", "INTEGER NOT NULL DEFAULT 0"],
        ["recovery_lease", "TEXT"],
        ["recovery_lease_until", "INTEGER NOT NULL DEFAULT 0"],
        ["creator", "TEXT"],
        ["accepted_snapshot", "TEXT"],
        ["submitted_at", "INTEGER"],
        ["recovery_actor", "TEXT"],
      ]) {
        if (!columns.some((column) => column.name === name))
          ctx.storage.sql.exec(
            `ALTER TABLE onboarding_invites ADD COLUMN ${name} ${declaration}`,
          );
      }
      if (!columns.some((column) => column.name === "submitter_email")) {
        // Link-only invites have no configured client email. The intake email
        // the client actually submits is recorded here for attribution so the
        // dashboard and generation ledger can show who the invite belongs to.
        ctx.storage.sql.exec(
          "ALTER TABLE onboarding_invites ADD COLUMN submitter_email TEXT",
        );
      }
      // Restart/migration must also recover gaps when no new client submits.
      if ((await ctx.storage.getAlarm()) === null)
        await this.scheduleOutboxAlarm();
    });
  }

  async queueWorkflowDispatch(
    inviteId: string,
    submissionId: string,
    issueNumber: number,
    now = Date.now(),
  ) {
    const accepted = this.row(inviteId);
    const existing = this.ctx.storage.sql
      .exec<OutboxRow>(
        "SELECT * FROM intake_outbox WHERE invite_id=? AND submission_id=? AND task_type='workflow'",
        inviteId,
        submissionId,
      )
      .toArray()[0];
    if (
      !accepted ||
      accepted.status !== "consumed" ||
      accepted.submission_id !== submissionId ||
      accepted.issue_number !== issueNumber ||
      (existing && existing.issue_number !== issueNumber)
    )
      throw new Error("conflict: immutable dispatch evidence");
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO intake_outbox
       (invite_id, submission_id, task_type, issue_number, status, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, 'workflow', ?, 'pending', 0, ?, ?, ?)`,
      inviteId,
      submissionId,
      issueNumber,
      now,
      now,
      now,
    );
    if (this.correlatePendingWorkflow(inviteId, submissionId)) {
      // A projection may have been delivered before this workflow operation
      // existed, carrying no dispatch. Re-open it so the idempotent ledger
      // registration runs with the durable correlation.
      this.ctx.storage.sql.exec(
        "UPDATE intake_projection_outbox SET status='pending',last_error=NULL,next_attempt_at=? WHERE invite_id=? AND submission_id=?",
        now,
        inviteId,
        submissionId,
      );
    }
    await this.deliverProjection(inviteId, submissionId, now);
    await this.scheduleOutboxAlarm();
    await this.deliverOutboxTask(inviteId, submissionId, "workflow", now);
  }

  async queueIntakeReceipt(
    inviteId: string,
    submissionId: string,
    recipient: string,
    businessName: string,
    now = Date.now(),
  ) {
    const operationId = this.row(inviteId)?.operation_id;
    const receiptKey = `client-intake-received-${operationId || submissionId}`;
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO intake_outbox
       (invite_id, submission_id, task_type, recipient, business_name, status, attempts, next_attempt_at, created_at, updated_at, idempotency_key)
       VALUES (?, ?, 'receipt', ?, ?, 'pending', 0, ?, ?, ?, ?)`,
      inviteId,
      submissionId,
      recipient,
      businessName,
      now,
      now,
      now,
      receiptKey,
    );
    await this.scheduleOutboxAlarm();
    await this.deliverOutboxTask(inviteId, submissionId, "receipt", now);
  }

  async alarm() {
    const now = Date.now();
    await this.recoverPostgresAcceptances(now);
    const dueTasks = this.ctx.storage.sql
      .exec<Pick<OutboxRow, "invite_id" | "submission_id" | "task_type">>(
        `SELECT invite_id, submission_id, task_type FROM intake_outbox
         WHERE status IN ('pending','delivering') AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC LIMIT 20`,
        now,
      )
      .toArray();
    for (const task of dueTasks) {
      await this.deliverOutboxTask(
        task.invite_id,
        task.submission_id,
        task.task_type,
        Date.now(),
      );
    }
    // Independent bounded source scan repairs gaps, including old accepted rows.
    const missing = this.ctx.storage.sql
      .exec<InviteRow>(
        `SELECT i.* FROM onboarding_invites i
      LEFT JOIN intake_projection_outbox p ON p.invite_id=i.invite_id AND p.submission_id=i.submission_id
      WHERE i.status='consumed' AND i.submission_id IS NOT NULL AND i.issue_number IS NOT NULL AND p.invite_id IS NULL LIMIT 20`,
      )
      .toArray();
    for (const row of missing) this.enqueueProjection(row, now);
    const projections = this.ctx.storage.sql
      .exec<ProjectionRow>(
        `SELECT * FROM intake_projection_outbox
      WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 20`,
        now,
      )
      .toArray();
    for (const row of projections)
      await this.deliverProjection(
        row.invite_id,
        row.submission_id,
        Date.now(),
      );
    await this.scheduleOutboxAlarm();
  }

  private async deliverOutboxTask(
    inviteId: string,
    submissionId: string,
    taskType: OutboxTaskType,
    now: number,
  ) {
    const claimed = this.ctx.storage.sql
      .exec<OutboxRow>(
        `UPDATE intake_outbox
         SET status = 'delivering', attempts = attempts + 1, next_attempt_at = ?, updated_at = ?
         WHERE invite_id = ? AND submission_id = ? AND task_type = ?
           AND status IN ('pending','delivering') AND next_attempt_at <= ?
         RETURNING *`,
        now + OUTBOX_DELIVERY_LEASE_MS,
        now,
        inviteId,
        submissionId,
        taskType,
        now,
      )
      .toArray()[0];
    if (!claimed) return;

    await this.scheduleOutboxAlarm();
    try {
      if (claimed.task_type === "workflow") {
        await this.sendIntakeDispatch(claimed);
      } else {
        const receipt = renderIntakeReceivedEmail({
          businessName: claimed.business_name || "your business",
        });
        await sendEmail(this.env, {
          to: claimed.recipient || "",
          ...receipt,
          tag: "client-intake-received",
          idempotencyKey:
            claimed.idempotency_key ||
            `client-intake-received-${claimed.submission_id}`,
          required: true,
        });
      }
      this.ctx.storage.sql.exec(
        `UPDATE intake_outbox SET status = 'delivered', updated_at = ?
         WHERE invite_id = ? AND submission_id = ? AND task_type = ? AND status = 'delivering'`,
        Date.now(),
        inviteId,
        submissionId,
        taskType,
      );
    } catch (error) {
      const completedAt = Date.now();
      const retryDelay = Math.min(
        OUTBOX_RETRY_MAX_MS,
        OUTBOX_RETRY_BASE_MS * 2 ** Math.min(claimed.attempts - 1, 6),
      );
      this.ctx.storage.sql.exec(
        `UPDATE intake_outbox SET status = 'pending', next_attempt_at = ?, updated_at = ?
         WHERE invite_id = ? AND submission_id = ? AND task_type = ? AND status = 'delivering'`,
        completedAt + retryDelay,
        completedAt,
        inviteId,
        submissionId,
        taskType,
      );
      console.error("Intake outbox delivery failed", {
        taskType,
        submissionId,
        attempt: claimed.attempts,
        error:
          error instanceof Error
            ? error.message.slice(0, 160)
            : "Unknown delivery error",
      });
    }
    await this.scheduleOutboxAlarm();
  }

  /** Only an undelivered operation can acquire correlation. Preserve partial
   * assignments and preallocated legacy projection IDs, but never rewrite them. */
  private correlatePendingWorkflow(inviteId: string, submissionId: string) {
    const projection = this.projection(inviteId, submissionId);
    return this.ctx.storage.sql
      .exec<OutboxRow>(
        `UPDATE intake_outbox SET request_id=COALESCE(request_id,?), attempt_id=COALESCE(attempt_id,?)
       WHERE invite_id=? AND submission_id=? AND task_type='workflow'
         AND status IN ('pending','delivering') RETURNING *`,
        projection?.requestId ?? crypto.randomUUID(),
        projection?.attemptId ?? crypto.randomUUID(),
        inviteId,
        submissionId,
      )
      .toArray()[0];
  }

  private async sendIntakeDispatch(task: OutboxRow) {
    // The send boundary is shared by immediate queue delivery and alarm/lease
    // recovery. Persist correlation on the existing operation before network I/O.
    const correlated = this.correlatePendingWorkflow(
      task.invite_id,
      task.submission_id,
    );
    if (!correlated) throw new Error("Workflow operation is not pending");
    task = correlated;
    const invite = this.row(task.invite_id);
    if (
      invite?.status === "consumed" &&
      invite.submission_id === task.submission_id &&
      invite.issue_number === task.issue_number
    ) {
      this.enqueueProjection(invite, Date.now());
      await this.deliverProjection(
        task.invite_id,
        task.submission_id,
        Date.now(),
      );
    }
    // Prefer the inviter-configured email; fall back to the email the client
    // submitted with the intake so link-only invites are still attributed.
    const attributedEmail = invite?.client_email || invite?.submitter_email;
    const response = await fetch(
      "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.env.GITHUB_ORG_TOKEN}`,
          "User-Agent": "LaunchLoom-Cloudflare-Worker",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "intake-submitted",
          client_payload: {
            issue: task.issue_number,
            submission_id: task.submission_id,
            invite_id: task.invite_id,
            request_id: task.request_id,
            attempt_id: task.attempt_id,
            // The lifecycle email address lets the generation ledger attribute a
            // run to the invited client without storing a second copy of it.
            ...(attributedEmail ? { client_email: attributedEmail } : {}),
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(`GitHub dispatch failed: ${response.status}`);
  }

  private async scheduleOutboxAlarm() {
    const next = this.ctx.storage.sql
      .exec<{ next_attempt_at: number | null }>(
        `SELECT MIN(next_attempt_at) AS next_attempt_at FROM (
          SELECT next_attempt_at FROM intake_outbox WHERE status IN ('pending','delivering')
          UNION ALL SELECT next_attempt_at FROM intake_projection_outbox WHERE status='pending'
          UNION ALL SELECT 0 FROM onboarding_invites i WHERE status='consumed' AND submission_id IS NOT NULL
            AND issue_number IS NOT NULL AND NOT EXISTS (SELECT 1 FROM intake_projection_outbox p WHERE p.invite_id=i.invite_id AND p.submission_id=i.submission_id)
          UNION ALL SELECT MIN(acceptance_recovery_at) FROM onboarding_invites
            WHERE routing_mode='postgres' AND acceptance_commit_started=1 AND acceptance_recovery_at IS NOT NULL
          UNION ALL SELECT 0 FROM onboarding_invites
            WHERE routing_mode='postgres' AND acceptance_commit_started=1 AND acceptance_state='confirmed'
              AND acceptance_recovery_at IS NULL AND receipt_queued_at IS NULL AND receipt_recipient IS NOT NULL
        )`,
      )
      .toArray()[0]?.next_attempt_at;
    if (next === null || next === undefined) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    }
  }

  private row(inviteId: string) {
    return this.ctx.storage.sql
      .exec<InviteRow>(
        "SELECT * FROM onboarding_invites WHERE invite_id = ? LIMIT 1",
        inviteId,
      )
      .toArray()[0];
  }

  async register(input: InviteRegistration) {
    this.ctx.storage.sql.exec(
      `INSERT INTO onboarding_invites
       (invite_id, client_email, expires_at, allowed_origin, token_hash, status, created_at, updated_at, creator)
       VALUES (?, ?, ?, ?, ?, 'unused', ?, ?, ?)`,
      input.inviteId,
      input.clientEmail,
      input.expiresAt,
      input.allowedOrigin,
      input.tokenHash,
      input.now,
      input.now,
      JSON.stringify(input.creator ?? unknownActor),
    );
    return { ok: true };
  }

  async validate(
    inviteId: string,
    tokenHash: string,
    tokenExpiresAt: number,
    origin: string,
    submissionId = "",
    now = Date.now(),
    allowExpiredReservationReplay = false,
  ): Promise<InviteValidation> {
    const row = this.row(inviteId);
    if (!row) return { valid: false };
    // Only a cryptographically verified token whose exact Postgres
    // reservation (same submission) already exists may replay after expiry.
    const expiredReplay =
      allowExpiredReservationReplay &&
      Boolean(submissionId) &&
      row.routing_mode === "postgres" &&
      row.reserved_submission_id === submissionId;
    if (row.status === "unused" && row.expires_at <= now && !expiredReplay) {
      this.ctx.storage.sql.exec(
        "UPDATE onboarding_invites SET status = 'expired', updated_at = ? WHERE invite_id = ? AND status = 'unused'",
        now,
        inviteId,
      );
      return { valid: false };
    }
    const claimsMatch =
      row.expires_at === tokenExpiresAt &&
      row.token_hash === tokenHash &&
      row.allowed_origin === origin;
    const accepted =
      row.status === "consumed" &&
      Boolean(submissionId) &&
      row.submission_id === submissionId &&
      Boolean(row.issue_number);
    return {
      valid:
        claimsMatch &&
        (row.status === "unused" ||
          (expiredReplay && row.status === "expired")),
      accepted: claimsMatch && accepted,
      issue: accepted ? row.issue_number : null,
      clientEmail: row.client_email,
    };
  }

  private acceptanceIds(row: InviteRow): InviteReservation["acceptance"] {
    if (
      row.acceptance_state !== "confirmed" ||
      !row.accepted_intake_id ||
      !row.accepted_request_id ||
      !row.accepted_attempt_id ||
      !row.accepted_operation_id
    )
      return null;
    return {
      intakeId: row.accepted_intake_id,
      requestId: row.accepted_request_id,
      attemptId: row.accepted_attempt_id,
      operationId: row.accepted_operation_id,
      created: false,
    };
  }

  async reserveSubmission(
    inviteId: string,
    tokenHash: string,
    tokenExpiresAt: number,
    origin: string,
    submissionId: string,
    submissionHash: string,
    clientEmail: string,
    now = Date.now(),
    routingMode: AcceptanceRoutingMode = "legacy",
    receipt?: { recipient: string; businessName: string },
  ) {
    const row = this.row(inviteId);
    if (!row)
      return {
        accepted: false as const,
        reason: "invalid" as const,
        mode: routingMode,
        state: routingMode === "postgres" ? ("unconfirmed" as const) : ("legacy" as const),
        fingerprint: submissionHash,
        expired: false,
        acceptance: null,
      };
    // A Postgres reservation whose commit may have succeeded is never released
    // by credential expiry. Expiry only blocks a new legacy reservation.
    const postgresReservation =
      row.routing_mode === "postgres" && row.reserved_submission_id !== null;
    if (
      row.status === "unused" &&
      row.expires_at <= now &&
      !postgresReservation
    ) {
      this.ctx.storage.sql.exec(
        "UPDATE onboarding_invites SET status = 'expired', updated_at = ? WHERE invite_id = ? AND status = 'unused'",
        now,
        inviteId,
      );
      return {
        accepted: false as const,
        reason: "expired" as const,
        mode: routingMode,
        state: routingMode === "postgres" ? ("unconfirmed" as const) : ("legacy" as const),
        fingerprint: submissionHash,
        expired: true,
        acceptance: null,
      };
    }
    if (
      row.token_hash !== tokenHash ||
      row.expires_at !== tokenExpiresAt ||
      row.allowed_origin !== origin ||
      (row.client_email &&
        row.client_email.toLowerCase() !== clientEmail.toLowerCase())
    )
      return {
        accepted: false as const,
        reason: "invalid" as const,
        mode: routingMode,
        state: routingMode === "postgres" ? ("unconfirmed" as const) : ("legacy" as const),
        fingerprint: submissionHash,
        expired: false,
        acceptance: null,
      };
    if (postgresReservation) {
      const expired = row.expires_at <= now;
      const base = {
        accepted: true as const,
        mode: "postgres" as const,
        fingerprint: row.reserved_submission_hash || "",
        expired,
      };
      if (row.reserved_submission_id !== submissionId)
        return {
          accepted: false as const,
          reason: "in_progress" as const,
          mode: "postgres" as const,
          state: row.acceptance_state === "confirmed" ? ("confirmed" as const) : ("unconfirmed" as const),
          fingerprint: row.reserved_submission_hash || "",
          expired,
          acceptance: null,
        };
      // Never rebind or release an unconfirmed Postgres reservation. A changed
      // submission must first be reconciled against the durable commit.
      if (row.reserved_submission_hash !== submissionHash)
        return {
          accepted: false as const,
          reason: "submission_mismatch" as const,
          mode: "postgres" as const,
          state: row.acceptance_state === "confirmed" ? ("confirmed" as const) : ("unconfirmed" as const),
          fingerprint: row.reserved_submission_hash || "",
          expired,
          acceptance: null,
        };
      if (receipt)
        this.ctx.storage.sql.exec(
          `UPDATE onboarding_invites SET receipt_recipient = COALESCE(receipt_recipient, ?),
             receipt_business_name = COALESCE(receipt_business_name, ?)
           WHERE invite_id = ? AND routing_mode = 'postgres'
             AND reserved_submission_id = ? AND reserved_submission_hash = ?`,
          receipt.recipient,
          receipt.businessName,
          inviteId,
          submissionId,
          submissionHash,
        );
      if (row.acceptance_state === "confirmed")
        return {
          ...base,
          duplicate: true as const,
          state: "confirmed" as const,
          acceptance: this.acceptanceIds(row),
        };
      // Bounded recovery after any lease/credential expiry keeps the same owner.
      this.ctx.storage.sql.exec(
        `UPDATE onboarding_invites SET reserved_at = ?, updated_at = ?
         WHERE invite_id = ? AND status = 'unused' AND routing_mode = 'postgres'
           AND reserved_submission_id = ? AND reserved_submission_hash = ?
           AND acceptance_state = 'unconfirmed'`,
        now,
        now,
        inviteId,
        submissionId,
        submissionHash,
      );
      return {
        ...base,
        duplicate: false as const,
        state: "unconfirmed" as const,
        acceptance: null,
      };
    }
    if (row.status === "consumed") {
      return row.submission_id === submissionId &&
        row.submission_hash === submissionHash &&
        row.issue_number
        ? {
            accepted: true as const,
            duplicate: true as const,
            issue: row.issue_number,
            mode: row.routing_mode,
            state: row.acceptance_state,
            fingerprint: row.submission_hash || "",
            expired: false,
            acceptance: this.acceptanceIds(row),
          }
        : {
            accepted: false as const,
            reason:
              row.submission_id === submissionId
                ? ("submission_mismatch" as const)
                : ("consumed" as const),
            mode: row.routing_mode,
            state: row.acceptance_state,
            fingerprint: row.submission_hash || "",
            expired: false,
            acceptance: null,
          };
    }
    if (row.status !== "unused")
      return {
        accepted: false as const,
        reason: row.status,
        mode: row.routing_mode,
        state: row.acceptance_state,
        fingerprint: row.reserved_submission_hash || "",
        expired: false,
        acceptance: null,
      };
    if (row.reserved_submission_id) {
      // Never retroactively assign an owner to a pre-migration ambiguous operation.
      if (!row.operation_id || row.recovery_sweeps >= 3)
        return {
          accepted: false as const,
          reason: "recovery_required" as const,
          mode: row.routing_mode,
          state: row.acceptance_state,
          fingerprint: row.reserved_submission_hash || "",
          expired: false,
          acceptance: null,
        };
      if (row.reserved_submission_id !== submissionId)
        return {
          accepted: false as const,
          reason: "in_progress" as const,
          mode: row.routing_mode,
          state: row.acceptance_state,
          fingerprint: row.reserved_submission_hash || "",
          expired: false,
          acceptance: null,
        };
      const stale =
        row.reserved_at !== null && now - row.reserved_at >= 2 * 60_000;
      if (row.reserved_submission_hash !== submissionHash) {
        if (stale && row.reservation_phase === "reserved") {
          return {
            accepted: false as const,
            reason: "stale_submission_mismatch" as const,
            reservedSubmissionHash: row.reserved_submission_hash,
            mode: "legacy" as const,
            state: "legacy" as const,
            fingerprint: row.reserved_submission_hash || "",
            expired: false,
            acceptance: null,
          };
        }
        return {
          accepted: false as const,
          reason: "submission_mismatch" as const,
          mode: "legacy" as const,
          state: "legacy" as const,
          fingerprint: row.reserved_submission_hash || "",
          expired: false,
          acceptance: null,
        };
      }
      if (stale && row.reservation_phase === "reserved") {
        this.ctx.storage.sql.exec(
          `UPDATE onboarding_invites SET reserved_at = ?, updated_at = ?
           WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id = ?
             AND reserved_submission_hash = ? AND reservation_phase = 'reserved'`,
          now,
          now,
          inviteId,
          submissionId,
          submissionHash,
        );
        return {
          accepted: true as const,
          duplicate: false as const,
          issue: null,
          mode: "legacy" as const,
          state: "legacy" as const,
          fingerprint: row.reserved_submission_hash || "",
          expired: false,
          acceptance: null,
        };
      }
      if (stale && row.reservation_phase === "creating_issue")
        return {
          accepted: true as const,
          duplicate: false as const,
          issue: null,
          mode: "legacy" as const,
          state: "legacy" as const,
          fingerprint: row.reserved_submission_hash || "",
          expired: false,
          acceptance: null,
        };
      return {
        accepted: false as const,
        reason: "in_progress" as const,
        mode: "legacy" as const,
        state: "legacy" as const,
        fingerprint: row.reserved_submission_hash || "",
        expired: false,
        acceptance: null,
      };
    }
    const postgres = routingMode === "postgres";
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET reserved_submission_id = ?, reserved_submission_hash = ?, reserved_at = ?, reservation_phase = 'reserved', operation_id = ?, routing_mode = ?, acceptance_state = ?, recovery_page = 1, recovery_sweeps = 0, recovery_lease = NULL, recovery_lease_until = 0, submitter_email = COALESCE(submitter_email, ?), receipt_recipient = ?, receipt_business_name = ?, updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id IS NULL`,
      submissionId,
      submissionHash,
      now,
      postgres ? null : crypto.randomUUID(),
      routingMode,
      postgres ? "unconfirmed" : "legacy",
      clientEmail.trim().toLowerCase() || null,
      postgres ? (receipt?.recipient ?? null) : null,
      postgres ? (receipt?.businessName ?? null) : null,
      now,
      inviteId,
    );
    return {
      accepted: true as const,
      duplicate: false as const,
      issue: null,
      mode: routingMode,
      state: postgres ? ("unconfirmed" as const) : ("legacy" as const),
      fingerprint: submissionHash,
      expired: row.expires_at <= now,
      acceptance: null,
    };
  }

  /** Read-only routing evidence. It never creates or changes a reservation. */
  async acceptanceRoutingMode(
    inviteId: string,
    submissionId: string,
  ): Promise<AcceptanceRoutingMode | null> {
    const row = this.row(inviteId);
    if (!row) return null;
    if (row.reserved_submission_id === submissionId) return row.routing_mode;
    if (row.submission_id === submissionId) return row.routing_mode;
    return null;
  }

  async acceptanceReservation(
    inviteId: string,
    submissionId: string,
    now = Date.now(),
  ): Promise<InviteReservation | null> {
    const row = this.row(inviteId);
    if (!row) return null;
    if (row.reserved_submission_id !== submissionId) return null;
    const expired = row.expires_at <= now;
    if (row.routing_mode === "legacy")
      return {
        accepted: true,
        duplicate: false,
        mode: "legacy",
        state: "legacy",
        fingerprint: row.reserved_submission_hash || "",
        expired,
        acceptance: null,
      };
    const acceptance = this.acceptanceIds(row);
    return {
      accepted: true,
      duplicate: row.acceptance_state === "confirmed",
      mode: "postgres",
      state: row.acceptance_state === "confirmed" ? "confirmed" : "unconfirmed",
      fingerprint: row.reserved_submission_hash || "",
      expired,
      acceptance,
    };
  }

  /**
   * Durable DO side of the acceptance handshake. It binds the exact stable IDs
   * and fingerprint and keeps uncertain ownership after credential expiry.
   */
  async confirmPostgresAcceptance(input: {
    inviteId: string;
    submissionId: string;
    fingerprint: string;
    acceptance: {
      intakeId: string;
      requestId: string;
      attemptId: string;
      operationId: string;
    };
    now?: number;
  }): Promise<
    | { confirmed: true; duplicate: boolean }
    | {
        confirmed: false;
        reason: "reservation" | "identity" | "state" | "race";
      }
  > {
    const now = input.now ?? Date.now();
    const result = this.ctx.storage.transactionSync(():
      | { confirmed: true; duplicate: boolean }
      | {
          confirmed: false;
          reason: "reservation" | "identity" | "state" | "race";
        } => {
      const row = this.row(input.inviteId);
      if (
        !row ||
        row.routing_mode !== "postgres" ||
        row.reserved_submission_id !== input.submissionId ||
        row.reserved_submission_hash !== input.fingerprint ||
        row.status === "revoked"
      )
        return { confirmed: false, reason: "reservation" };
      const sameIds =
        row.accepted_intake_id === input.acceptance.intakeId &&
        row.accepted_request_id === input.acceptance.requestId &&
        row.accepted_attempt_id === input.acceptance.attemptId &&
        row.accepted_operation_id === input.acceptance.operationId;
      if (row.acceptance_state === "confirmed")
        return sameIds
          ? { confirmed: true, duplicate: true }
          : { confirmed: false, reason: "identity" };
      if (row.acceptance_state !== "unconfirmed")
        return { confirmed: false, reason: "state" };
      const updated = this.ctx.storage.sql
        .exec<{ invite_id: string }>(
          `UPDATE onboarding_invites
           SET acceptance_state = 'confirmed', accepted_intake_id = ?,
               accepted_request_id = ?, accepted_attempt_id = ?,
               accepted_operation_id = ?, operation_id = ?,
               reserved_at = ?, updated_at = ?
           WHERE invite_id = ? AND status IN ('unused','expired')
             AND routing_mode = 'postgres' AND reserved_submission_id = ?
             AND reserved_submission_hash = ? AND acceptance_state = 'unconfirmed'
           RETURNING invite_id`,
          input.acceptance.intakeId,
          input.acceptance.requestId,
          input.acceptance.attemptId,
          input.acceptance.operationId,
          input.acceptance.operationId,
          now,
          now,
          input.inviteId,
          input.submissionId,
          input.fingerprint,
        )
        .toArray();
      if (updated.length !== 1) return { confirmed: false, reason: "race" };
      return { confirmed: true, duplicate: false };
    });
    return result;
  }

  async markAcceptanceCommitStarted(
    inviteId: string,
    submissionId: string,
    fingerprint: string,
    now = Date.now(),
  ) {
    const updated = this.ctx.storage.sql
      .exec<{ invite_id: string }>(
        `UPDATE onboarding_invites
         SET acceptance_commit_started = 1, acceptance_recovery_at = ?,
             acceptance_recovery_attempts = 0, acceptance_attention = 0,
             acceptance_last_error = NULL, updated_at = ?
         WHERE invite_id = ? AND status IN ('unused','expired')
           AND routing_mode = 'postgres' AND reserved_submission_id = ?
           AND reserved_submission_hash = ? AND acceptance_state IN ('unconfirmed','confirmed')
         RETURNING invite_id`,
        now + 30_000,
        now,
        inviteId,
        submissionId,
        fingerprint,
      )
      .toArray();
    if (updated.length !== 1)
      throw new Error("conflict: acceptance recovery reservation");
    await this.scheduleOutboxAlarm();
  }

  async scheduleAcceptanceRecovery(
    inviteId: string,
    submissionId: string,
    delayMs: number,
    error: string | null = null,
    now = Date.now(),
  ) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET acceptance_recovery_at = ?,
         acceptance_recovery_attempts = acceptance_recovery_attempts + 1,
         acceptance_attention = CASE WHEN acceptance_recovery_attempts + 1 >= 8 THEN 1 ELSE acceptance_attention END,
         acceptance_last_error = ?, updated_at = ?
       WHERE invite_id = ? AND routing_mode = 'postgres' AND reserved_submission_id = ?`,
      now + Math.max(1_000, Math.min(delayMs, 30 * 60_000)),
      error?.slice(0, 160) ?? null,
      now,
      inviteId,
      submissionId,
    );
    await this.scheduleOutboxAlarm();
  }

  async completeAcceptanceRecovery(
    inviteId: string,
    submissionId: string,
    now = Date.now(),
  ) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET acceptance_recovery_at = NULL,
         acceptance_recovery_attempts = 0, acceptance_attention = 0,
         acceptance_last_error = NULL,
         receipt_queued_at = CASE WHEN receipt_recipient IS NULL THEN receipt_queued_at ELSE COALESCE(receipt_queued_at, ?) END,
         updated_at = ?
       WHERE invite_id = ? AND routing_mode = 'postgres' AND reserved_submission_id = ?`,
      now,
      now,
      inviteId,
      submissionId,
    );
    await this.scheduleOutboxAlarm();
  }

  private async recoverPostgresAcceptances(now: number) {
    const rows = this.ctx.storage.sql
      .exec<InviteRow>(
        `SELECT * FROM onboarding_invites
         WHERE routing_mode = 'postgres' AND acceptance_commit_started = 1 AND (
           (acceptance_recovery_at IS NOT NULL AND acceptance_recovery_at <= ?)
           OR (acceptance_state = 'confirmed' AND acceptance_recovery_at IS NULL
               AND receipt_queued_at IS NULL AND receipt_recipient IS NOT NULL)
         )
         ORDER BY acceptance_recovery_at ASC LIMIT 10`,
        now,
      )
      .toArray();
    for (const row of rows) await this.recoverPostgresAcceptance(row, now);
  }

  private async recoverPostgresAcceptance(row: InviteRow, now: number) {
    const inviteId = row.invite_id;
    const submissionId = row.reserved_submission_id;
    const fingerprint = row.reserved_submission_hash;
    if (!submissionId || !fingerprint) {
      await this.scheduleAcceptanceRecovery(
        inviteId,
        submissionId || "",
        30 * 60_000,
        "invalid_recovery_reservation",
        now,
      );
      return;
    }
    let store = this.env.OPERATIONS_STORE;
    try {
      store ??= operationsStoreFromEnv(this.env);
    } catch {
      // Keep waking while storage is unavailable; never release ownership.
      await this.scheduleAcceptanceRecovery(
        inviteId,
        submissionId,
        5 * 60_000,
        "operations_storage_unavailable",
        now,
      );
      return;
    }
    const adapter: InviteAcceptanceAdapter = {
      reserve: async () => {
        throw new AcceptanceError(
          "recovery_required",
          "Recovery does not create new reservations.",
        );
      },
      inspect: () =>
        this.acceptanceReservation(inviteId, submissionId, now),
      confirm: async (input) => {
        const confirmed = await this.confirmPostgresAcceptance({
          ...input,
          now,
        });
        if (!confirmed.confirmed)
          throw new AcceptanceError(
            "recovery_required",
            "Acceptance recovery could not bind the reservation.",
          );
        return confirmed;
      },
      queueReceipt: (input) =>
        this.queueIntakeReceipt(
          input.inviteId,
          input.submissionId,
          input.recipient,
          input.businessName,
          now,
        ),
      markCommitStarted: async () => {},
      scheduleRecovery: async () => {},
      completeRecovery: async () => {},
    };
    try {
      const recovered = await reconcileAcceptance(
        {
          inviteId,
          submissionId,
          fingerprint,
          confirmed:
            row.acceptance_state === "confirmed"
              ? this.acceptanceIds(row)
              : null,
        },
        {
          store,
          invites: adapter,
          receipt:
            row.receipt_recipient !== null
              ? {
                  recipient: row.receipt_recipient,
                  businessName:
                    row.receipt_business_name || "your business",
                }
              : undefined,
        },
      );
      if (recovered.status === "not_committed") {
        // An empty snapshot does not prove an outstanding transaction will
        // never commit. Keep low-frequency recovery alive indefinitely; the
        // backoff cap and per-tick limit bound resource use, and attention is
        // raised after repeated uncertainty without releasing ownership.
        await this.scheduleAcceptanceRecovery(
          inviteId,
          submissionId,
          Math.min(
            30 * 60_000,
            5_000 *
              2 ** Math.min(row.acceptance_recovery_attempts + 1, 9),
          ),
          "no_committed_intake",
          now,
        );
        return;
      }
      await this.completeAcceptanceRecovery(inviteId, submissionId, now);
    } catch (error) {
      await this.scheduleAcceptanceRecovery(
        inviteId,
        submissionId,
        Math.min(
          30 * 60_000,
          5_000 * 2 ** Math.min(row.acceptance_recovery_attempts + 1, 9),
        ),
        error instanceof Error ? error.message : "acceptance_recovery_failed",
        now,
      );
    }
  }

  async rebindStaleReservation(
    inviteId: string,
    submissionId: string,
    previousHash: string,
    nextHash: string,
    now = Date.now(),
  ) {
    const updated = this.ctx.storage.sql.exec<{ invite_id: string }>(
      `UPDATE onboarding_invites
       SET reserved_submission_hash = ?, reserved_at = ?, updated_at = ?, operation_id = ?, recovery_page = 1, recovery_sweeps = 0, recovery_lease = NULL, recovery_lease_until = 0
       WHERE invite_id = ? AND status = 'unused' AND routing_mode = 'legacy'
         AND reserved_submission_id = ?
         AND reserved_submission_hash = ? AND reservation_phase = 'reserved'
         AND issue_number IS NULL AND reserved_at IS NOT NULL AND reserved_at <= ?
       RETURNING invite_id`,
      nextHash,
      now,
      now,
      crypto.randomUUID(),
      inviteId,
      submissionId,
      previousHash,
      now - 2 * 60_000,
    );
    return updated.toArray().length === 1;
  }

  async recoveryReservation(inviteId: string) {
    const routing = this.row(inviteId)?.routing_mode;
    if (routing && routing !== "legacy") return null;
    const audit = this.ctx.storage.sql
      .exec<{
        submission_id: string;
        payload_hash: string;
        issue_number: number;
        recipient: string;
        business_name: string;
      }>("SELECT * FROM intake_reconciliations WHERE invite_id = ?", inviteId)
      .toArray()[0];
    const row = this.row(inviteId);
    if (audit)
      return {
        duplicate: true as const,
        submissionId: audit.submission_id,
        submissionHash: audit.payload_hash,
        issueNumber: audit.issue_number,
        recipient: audit.recipient,
        businessName: audit.business_name,
        operationId: row?.operation_id || null,
      };
    if (
      !row ||
      !["unused", "expired"].includes(row.status) ||
      !row.reserved_submission_id ||
      !row.reserved_submission_hash ||
      (row.operation_id && row.recovery_sweeps < 3) ||
      row.recovery_lease_until > Date.now()
    )
      return null;
    return {
      duplicate: false as const,
      submissionId: row.reserved_submission_id,
      submissionHash: row.reserved_submission_hash,
      operationId: row.operation_id,
      issueNumber: null,
      recipient: null,
      businessName: null,
    };
  }

  async reconcileIssue(
    input: {
      inviteId: string;
      submissionId: string;
      submissionHash: string;
      operationId: string | null;
      issueNumber: number;
      reviewerEmail: string;
      recipient: string;
      businessName: string;
      actor?: ActorSnapshot;
    },
    now = Date.now(),
  ) {
    const result = this.ctx.storage.transactionSync(() => {
      const audit = this.ctx.storage.sql
        .exec<{ issue_number: number; payload_hash: string }>(
          "SELECT issue_number, payload_hash FROM intake_reconciliations WHERE invite_id = ?",
          input.inviteId,
        )
        .toArray()[0];
      if (audit)
        return (
          audit.issue_number === input.issueNumber &&
          audit.payload_hash === input.submissionHash
        );
      const updated = this.ctx.storage.sql
        .exec<{ invite_id: string }>(
          `UPDATE onboarding_invites SET status = 'consumed', submission_id = reserved_submission_id,
           submission_hash = reserved_submission_hash, issue_number = ?, operation_id = COALESCE(operation_id, ?),
           reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL,
           reservation_phase = 'reserved', recovery_lease = NULL, recovery_lease_until = 0, updated_at = ?
         WHERE invite_id = ? AND status IN ('unused','expired') AND routing_mode = 'legacy'
           AND reserved_submission_id = ?
           AND reserved_submission_hash = ? AND operation_id IS ? AND reserved_at <= ?
           AND recovery_lease_until <= ? AND (operation_id IS NULL OR recovery_sweeps >= 3) RETURNING invite_id`,
          input.issueNumber,
          crypto.randomUUID(),
          now,
          input.inviteId,
          input.submissionId,
          input.submissionHash,
          input.operationId,
          now - 120_000,
          now,
        )
        .toArray()[0];
      if (!updated) return false;
      this.ctx.storage.sql.exec(
        `INSERT INTO intake_reconciliations (invite_id, submission_id, payload_hash, issue_number, reviewer_email, recovered_at, recipient, business_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        input.inviteId,
        input.submissionId,
        input.submissionHash,
        input.issueNumber,
        input.reviewerEmail,
        now,
        input.recipient,
        input.businessName,
      );
      this.ctx.storage.sql.exec(
        `UPDATE onboarding_invites SET accepted_snapshot=?, recovery_actor=? WHERE invite_id=?`,
        JSON.stringify({
          businessName: input.businessName,
          email: input.recipient,
        }),
        JSON.stringify(input.actor ?? unknownActor),
        input.inviteId,
      );
      this.enqueueProjection(this.row(input.inviteId)!, now);
      return true;
    });
    await this.scheduleOutboxAlarm();
    return result;
  }

  async intakeOperation(
    inviteId: string,
    submissionId: string,
  ): Promise<IntakeOperation | null> {
    const row = this.row(inviteId);
    if (
      !row ||
      row.status !== "unused" ||
      row.reserved_submission_id !== submissionId
    )
      return null;
    return {
      operationId: row.operation_id || "",
      submissionHash: row.reserved_submission_hash || "",
      phase: row.reservation_phase,
      page: row.recovery_page,
      sweeps: row.recovery_sweeps,
      recoveryRequired: !row.operation_id || row.recovery_sweeps >= 3,
    };
  }

  async claimRecovery(inviteId: string, operationId: string, now = Date.now()) {
    const lease = crypto.randomUUID();
    const row = this.ctx.storage.sql
      .exec<InviteRow>(
        `UPDATE onboarding_invites SET recovery_lease = ?, recovery_lease_until = ?
       WHERE invite_id = ? AND operation_id = ? AND status = 'unused'
         AND routing_mode = 'legacy'
         AND recovery_sweeps < 3 AND recovery_lease_until <= ? RETURNING *`,
        lease,
        now + 120_000,
        inviteId,
        operationId,
        now,
      )
      .toArray()[0];
    return row ? { lease, page: row.recovery_page } : null;
  }

  async advanceRecovery(
    inviteId: string,
    operationId: string,
    lease: string,
    page: number,
  ) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET recovery_page = ?
       WHERE invite_id = ? AND operation_id = ? AND recovery_lease = ? AND status = 'unused'
         AND routing_mode = 'legacy'`,
      page,
      inviteId,
      operationId,
      lease,
    );
  }

  async checkpointRecovery(
    inviteId: string,
    operationId: string,
    lease: string,
    page: number,
    sweepComplete: boolean,
  ) {
    const updated = this.ctx.storage.sql
      .exec<{ invite_id: string }>(
        `UPDATE onboarding_invites SET recovery_page = ?, recovery_sweeps = recovery_sweeps + ?,
         recovery_lease = NULL, recovery_lease_until = 0
       WHERE invite_id = ? AND operation_id = ? AND recovery_lease = ? AND status = 'unused'
         AND routing_mode = 'legacy' RETURNING invite_id`,
        page,
        sweepComplete ? 1 : 0,
        inviteId,
        operationId,
        lease,
      )
      .toArray();
    return updated.length === 1;
  }

  async claimIssueCreation(
    inviteId: string,
    submissionId: string,
    submissionHash: string,
    now = Date.now(),
  ) {
    const updated = this.ctx.storage.sql.exec<{ invite_id: string }>(
      `UPDATE onboarding_invites SET reservation_phase = 'creating_issue', updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND routing_mode = 'legacy'
         AND reserved_submission_id = ?
         AND reserved_submission_hash = ? AND reservation_phase = 'reserved'
       RETURNING invite_id`,
      now,
      inviteId,
      submissionId,
      submissionHash,
    );
    return updated.toArray().length === 1;
  }

  async recordIssue(
    inviteId: string,
    submissionId: string,
    submissionHash: string,
    issue: number,
    now = Date.now(),
    snapshot?: Snapshot,
  ) {
    const result = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE onboarding_invites
       SET status = 'consumed', submission_id = ?, submission_hash = reserved_submission_hash,
           reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL, reservation_phase = 'reserved',
           issue_number = ?, updated_at = ?
       WHERE invite_id = ? AND routing_mode = 'legacy' AND reserved_submission_id = ?
         AND reserved_submission_hash = ? AND status = 'unused'`,
        submissionId,
        issue,
        now,
        inviteId,
        submissionId,
        submissionHash,
      );
      const row = this.row(inviteId);
      const accepted =
        row?.submission_id === submissionId && row.issue_number === issue;
      if (accepted) {
        this.ctx.storage.sql.exec(
          `UPDATE onboarding_invites SET accepted_snapshot=COALESCE(accepted_snapshot,?), submitted_at=COALESCE(submitted_at,?) WHERE invite_id=?`,
          snapshot ? JSON.stringify(snapshot) : null,
          now,
          inviteId,
        );
        this.enqueueProjection(this.row(inviteId)!, now);
      }
      return accepted;
    });
    await this.scheduleOutboxAlarm();
    return result;
  }

  private projection(
    inviteId: string,
    submissionId: string,
  ): AcceptedIntake | null {
    const row = this.ctx.storage.sql
      .exec<ProjectionRow>(
        "SELECT * FROM intake_projection_outbox WHERE invite_id=? AND submission_id=?",
        inviteId,
        submissionId,
      )
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  private accepted(row: InviteRow): AcceptedIntake {
    const snapshot: Partial<Snapshot> = row.accepted_snapshot
      ? JSON.parse(row.accepted_snapshot)
      : {};
    const workflow = this.ctx.storage.sql
      .exec<OutboxRow>(
        "SELECT * FROM intake_outbox WHERE invite_id=? AND submission_id=? AND task_type='workflow'",
        row.invite_id,
        row.submission_id,
      )
      .toArray()[0];
    const clientId = `submission:${row.submission_id}`;
    return {
      clientId,
      inviteId: row.invite_id,
      submissionId: row.submission_id!,
      issueNumber: row.issue_number!,
      creator: row.creator ? JSON.parse(row.creator) : unknownActor,
      businessName: snapshot.businessName ?? null,
      contactName: snapshot.contactName ?? null,
      email: snapshot.email ?? row.submitter_email ?? row.client_email,
      phone: snapshot.phone ?? null,
      submittedAt: row.submitted_at,
      initiator: row.recovery_actor
        ? JSON.parse(row.recovery_actor)
        : row.submitted_at !== null
          ? {
              kind: "client",
              id: clientId,
              name: snapshot.contactName ?? null,
              email: row.submitter_email ?? snapshot.email ?? null,
              source: "intake",
            }
          : unknownActor,
      dispatchCreatedAt: workflow?.created_at ?? null,
      requestId: workflow?.request_id ?? null,
      attemptId: workflow?.attempt_id ?? null,
      outboxState: workflow
        ? workflow.status === "delivered"
          ? "delivered"
          : "pending"
        : "missing",
    };
  }
  private enqueueProjection(row: InviteRow, now: number) {
    const evidence = this.accepted(row);
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO intake_projection_outbox(invite_id,submission_id,data,next_attempt_at) VALUES(?,?,?,?)`,
      row.invite_id,
      row.submission_id,
      JSON.stringify(evidence),
      now,
    );
  }
  private async deliverProjection(
    inviteId: string,
    submissionId: string,
    now: number,
  ) {
    // A persisted lease prevents overlapping alarm/request deliveries from hot-looping.
    const row = this.ctx.storage.sql
      .exec<ProjectionRow>(
        `UPDATE intake_projection_outbox SET attempts=attempts+1,next_attempt_at=?
      WHERE invite_id=? AND submission_id=? AND status='pending' AND next_attempt_at<=? RETURNING *`,
        now + OUTBOX_DELIVERY_LEASE_MS,
        inviteId,
        submissionId,
        now,
      )
      .toArray()[0];
    if (!row) return;
    await this.scheduleOutboxAlarm();
    try {
      const evidence: AcceptedIntake = JSON.parse(row.data);
      const ledger = this.env.GENERATION_LEDGER.getByName(
        "launchloom-generations",
      );
      const {
        clientId,
        inviteId: verifiedInvite,
        submissionId: verifiedSubmission,
        issueNumber,
        creator,
        businessName,
        contactName,
        email,
        phone,
        submittedAt,
      } = evidence;
      // Only a real initial workflow outbox operation is dispatch evidence.
      const workflow = this.ctx.storage.sql
        .exec<OutboxRow>(
          "SELECT * FROM intake_outbox WHERE invite_id=? AND submission_id=? AND task_type='workflow'",
          inviteId,
          submissionId,
        )
        .toArray()[0];
      const projected = await ledger.projectAcceptedIntake(
        {
          clientId,
          inviteId: verifiedInvite,
          submissionId: verifiedSubmission,
          issueNumber,
          creator,
          businessName,
          contactName,
          email,
          phone,
          submittedAt,
        },
        workflow?.request_id && workflow.attempt_id
          ? {
              requestId: workflow.request_id,
              attemptId: workflow.attempt_id,
              clientId,
              inviteId: verifiedInvite,
              submissionId: verifiedSubmission,
              issueNumber,
              initiator: evidence.initiator,
              invitationCreator: creator,
              createdAt: workflow.created_at,
            }
          : null,
      );
      const awaitingCorrelation = Boolean(
        workflow &&
          workflow.status !== "delivered" &&
          (!workflow.request_id || !workflow.attempt_id),
      );
      if (!projected.ok || awaitingCorrelation)
        throw new Error("projection pending");
      this.ctx.storage.sql.exec(
        "UPDATE intake_projection_outbox SET status='delivered',last_error=NULL WHERE invite_id=? AND submission_id=?",
        inviteId,
        submissionId,
      );
    } catch {
      this.ctx.storage.sql.exec(
        "UPDATE intake_projection_outbox SET last_error='Client projection pending',next_attempt_at=? WHERE invite_id=? AND submission_id=?",
        now +
          Math.min(
            OUTBOX_RETRY_MAX_MS,
            OUTBOX_RETRY_BASE_MS * 2 ** Math.min(row.attempts - 1, 6),
          ),
        inviteId,
        submissionId,
      );
    }
    await this.scheduleOutboxAlarm();
  }
  /** Operator visibility for durable acceptance recovery without releasing it. */
  async acceptanceHealth() {
    const row = this.ctx.storage.sql
      .exec<{
        pending_count: number;
        attention_count: number;
        next_recovery_at: number | null;
        last_error: string | null;
      }>(
        `SELECT
           COUNT(*) AS pending_count,
           COALESCE(SUM(acceptance_attention), 0) AS attention_count,
           MIN(acceptance_recovery_at) AS next_recovery_at,
           (SELECT acceptance_last_error FROM onboarding_invites
             WHERE routing_mode='postgres' AND acceptance_commit_started=1
               AND acceptance_last_error IS NOT NULL
             ORDER BY acceptance_recovery_at ASC LIMIT 1) AS last_error
         FROM onboarding_invites
         WHERE routing_mode='postgres' AND acceptance_commit_started=1
           AND (acceptance_recovery_at IS NOT NULL
             OR (acceptance_state='confirmed' AND receipt_queued_at IS NULL
                 AND receipt_recipient IS NOT NULL))`,
      )
      .one();
    return {
      pendingCount: row.pending_count,
      attentionCount: row.attention_count,
      nextRecoveryAt: row.next_recovery_at,
      lastError: row.last_error,
    };
  }

  async projectionHealth() {
    const pending = this.ctx.storage.sql
      .exec<{ total: number }>(
        `SELECT COUNT(*) AS total FROM onboarding_invites i
      LEFT JOIN intake_projection_outbox p ON p.invite_id=i.invite_id AND p.submission_id=i.submission_id
      WHERE i.status='consumed' AND (p.status IS NULL OR p.status<>'delivered')`,
      )
      .one().total;
    const error = this.ctx.storage.sql
      .exec<{ last_error: string }>(
        "SELECT last_error FROM intake_projection_outbox WHERE status='pending' AND last_error IS NOT NULL LIMIT 1",
      )
      .toArray()[0];
    return {
      pendingProjectionCount: pending,
      partial: pending > 0,
      lastError: error?.last_error ?? null,
    };
  }
  async listPage(query: InviteFilters): Promise<Page<InviteSummary>> {
    const filter = {
      search: query.search?.trim().toLowerCase() || null,
      status: query.status ?? null,
      creatorId: query.creatorId ?? null,
    };
    if (
      filter.status &&
      !["unused", "consumed", "expired", "revoked"].includes(filter.status)
    )
      throw new Error("invalid status");
    const rows = this.ctx.storage.sql
      .exec<InviteRow>("SELECT * FROM onboarding_invites")
      .toArray()
      .map((row) => ({
        inviteId: row.invite_id,
        clientEmail: row.client_email,
        submitterEmail: row.submitter_email,
        expiresAt: row.expires_at,
        status:
          row.status === "unused" && row.expires_at <= Date.now()
            ? "expired"
            : row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        creator: row.creator
          ? (JSON.parse(row.creator) as ActorSnapshot)
          : unknownActor,
        submissionId: row.submission_id,
        issueNumber: row.issue_number,
        clientId:
          row.status === "consumed" && row.submission_id
            ? `submission:${row.submission_id}`
            : null,
      }))
      .filter(
        (row) =>
          (!filter.status || row.status === filter.status) &&
          (!filter.creatorId || row.creator.id === filter.creatorId) &&
          (!filter.search ||
            [
              row.inviteId,
              row.clientEmail,
              row.submitterEmail,
              row.issueNumber,
            ].some((v) =>
              String(v ?? "")
                .toLowerCase()
                .includes(filter.search!),
            )),
      );
    return pageRecords(
      rows,
      query,
      JSON.stringify(["invites", filter]),
      (r) => r.inviteId,
      (r) => r.createdAt,
    );
  }
  async acceptedPage(query: {
    cursor?: string;
    limit?: number;
  }): Promise<Page<AcceptedIntake>> {
    const rows = this.ctx.storage.sql
      .exec<InviteRow>(
        "SELECT * FROM onboarding_invites WHERE status='consumed' AND submission_id IS NOT NULL AND issue_number IS NOT NULL",
      )
      .toArray()
      .map((row) => ({ ...this.accepted(row), orderTime: row.created_at }));
    const page = pageRecords(
      rows,
      query,
      "accepted",
      (r) => r.inviteId,
      (r) => r.orderTime,
    );
    return { ...page, items: page.items.map(({ orderTime, ...item }) => item) };
  }

  async reopenFailedSubmission(
    inviteId: string,
    submissionId: string,
    submissionHash: string,
    now = Date.now(),
  ) {
    const row = this.row(inviteId);
    if (
      !row ||
      row.routing_mode === "postgres" ||
      row.reserved_submission_id !== submissionId ||
      row.reserved_submission_hash !== submissionHash ||
      row.issue_number
    )
      return false;
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL, reservation_phase = 'reserved', operation_id = NULL, recovery_page = 1, recovery_sweeps = 0, recovery_lease = NULL, recovery_lease_until = 0, updated_at = ?
       WHERE invite_id = ? AND reserved_submission_id = ? AND reserved_submission_hash = ? AND status = 'unused' AND issue_number IS NULL`,
      now,
      inviteId,
      submissionId,
      submissionHash,
    );
    return this.row(inviteId)?.reserved_submission_id === null;
  }

  async revoke(inviteId: string, now = Date.now()) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites
       SET status = 'revoked', reserved_submission_id = NULL, reserved_submission_hash = NULL,
           reserved_at = NULL, reservation_phase = 'reserved', updated_at = ?
       WHERE invite_id = ? AND status = 'unused'
         AND (routing_mode <> 'postgres' OR reserved_submission_id IS NULL)
         AND (reserved_submission_id IS NULL OR (reserved_at IS NOT NULL AND reserved_at <= ?))`,
      now,
      inviteId,
      now - 2 * 60_000,
    );
    return this.row(inviteId)?.status === "revoked";
  }

  async list(now = Date.now()) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET status = 'expired', updated_at = ?
       WHERE status = 'unused' AND expires_at <= ?`,
      now,
      now,
    );
    return this.ctx.storage.sql
      .exec<
        Pick<
          InviteRow,
          | "invite_id"
          | "client_email"
          | "submitter_email"
          | "expires_at"
          | "status"
          | "created_at"
          | "updated_at"
          | "submission_id"
          | "issue_number"
          | "operation_id"
          | "reserved_submission_id"
          | "recovery_sweeps"
        >
      >(
        `SELECT invite_id, client_email, submitter_email, expires_at, status, created_at, updated_at, submission_id, issue_number, operation_id, reserved_submission_id, recovery_sweeps
         FROM onboarding_invites ORDER BY created_at DESC LIMIT 100`,
      )
      .toArray()
      .map((row) => ({
        inviteId: row.invite_id,
        clientEmail: row.client_email,
        submitterEmail: row.submitter_email,
        expiresAt: row.expires_at,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        submissionId: row.submission_id,
        issueNumber: row.issue_number,
        recoveryRequired:
          Boolean(row.reserved_submission_id) &&
          (!row.operation_id || row.recovery_sweeps >= 3),
        recoveryAttempts: row.recovery_sweeps,
      }));
  }

  async listMissingAttribution(limit = 25) {
    return this.ctx.storage.sql
      .exec<{ invite_id: string; issue_number: number }>(
        `SELECT invite_id, issue_number FROM onboarding_invites
         WHERE issue_number IS NOT NULL
           AND (client_email IS NULL OR client_email = '')
           AND (submitter_email IS NULL OR submitter_email = '')
         ORDER BY created_at DESC LIMIT ?`,
        Math.max(1, Math.min(100, Math.floor(limit))),
      )
      .toArray()
      .map((row) => ({
        inviteId: row.invite_id,
        issueNumber: row.issue_number,
      }));
  }

  async recordSubmitterEmail(
    inviteId: string,
    email: string,
    now = Date.now(),
  ) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) return false;
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET submitter_email = ?, updated_at = ?
       WHERE invite_id = ? AND (submitter_email IS NULL OR submitter_email = '')`,
      normalized,
      now,
      inviteId,
    );
    return this.row(inviteId)?.submitter_email === normalized;
  }

  /**
   * Sliding-window coverage lookup limiter backed by an event log. Expired
   * events are pruned on every call; rejected lookups record nothing.
   */
  async allowCoverageLookup(
    inviteId: string,
    now = Date.now(),
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const windowMs = 10 * 60_000;
    const limit = 40;
    const id = inviteId.slice(0, 160);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "DELETE FROM coverage_lookup_events WHERE at <= ?",
      now - windowMs,
    );
    const rows = sql
      .exec<{ at: number }>(
        "SELECT at FROM coverage_lookup_events WHERE invite_id = ? ORDER BY at ASC LIMIT ?",
        id,
        limit,
      )
      .toArray();
    if (rows.length >= limit)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((rows[0].at + windowMs - now) / 1000),
        ),
      };
    sql.exec(
      "INSERT INTO coverage_lookup_events (invite_id, at) VALUES (?, ?)",
      id,
      now,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async resetCoverageLookupLimits(inviteId?: string) {
    if (inviteId) {
      this.ctx.storage.sql.exec(
        "DELETE FROM coverage_lookup_events WHERE invite_id = ?",
        inviteId,
      );
    } else {
      this.ctx.storage.sql.exec("DELETE FROM coverage_lookup_events");
    }
  }
}
