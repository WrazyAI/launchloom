import { DurableObject } from "cloudflare:workers";
import { renderIntakeReceivedEmail } from "../../emails/render-email.mjs";
import { sendEmail, type TransactionalEmailEnvironment } from "./transactional-email";

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
};

type OnboardingInvitesEnvironment = TransactionalEmailEnvironment & {
  GITHUB_ORG_TOKEN: string;
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
        CREATE TABLE IF NOT EXISTS coverage_lookup_limits (
          invite_id TEXT PRIMARY KEY,
          window_started_at INTEGER NOT NULL,
          request_count INTEGER NOT NULL
        );
      `);
      const outboxColumns = ctx.storage.sql.exec<{name: string}>("PRAGMA table_info(intake_outbox)").toArray();
      if (!outboxColumns.some(column => column.name === "idempotency_key"))
        ctx.storage.sql.exec("ALTER TABLE intake_outbox ADD COLUMN idempotency_key TEXT");
      const columns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(onboarding_invites)")
        .toArray();
      if (!columns.some((column) => column.name === "reservation_phase")) {
        ctx.storage.sql.exec(
          "ALTER TABLE onboarding_invites ADD COLUMN reservation_phase TEXT NOT NULL DEFAULT 'reserved'",
        );
      }
      for (const [name, declaration] of [
        ["operation_id", "TEXT"], ["recovery_page", "INTEGER NOT NULL DEFAULT 1"],
        ["recovery_sweeps", "INTEGER NOT NULL DEFAULT 0"], ["recovery_lease", "TEXT"],
        ["recovery_lease_until", "INTEGER NOT NULL DEFAULT 0"],
      ]) {
        if (!columns.some((column) => column.name === name))
          ctx.storage.sql.exec(`ALTER TABLE onboarding_invites ADD COLUMN ${name} ${declaration}`);
      }
      if (!columns.some((column) => column.name === "submitter_email")) {
        // Link-only invites have no configured client email. The intake email
        // the client actually submits is recorded here for attribution so the
        // dashboard and generation ledger can show who the invite belongs to.
        ctx.storage.sql.exec(
          "ALTER TABLE onboarding_invites ADD COLUMN submitter_email TEXT",
        );
      }
    });
  }

  async queueWorkflowDispatch(inviteId: string, submissionId: string, issueNumber: number, now = Date.now()) {
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
    await this.scheduleOutboxAlarm();
    await this.deliverOutboxTask(inviteId, submissionId, "workflow", now);
  }

  async queueIntakeReceipt(inviteId: string, submissionId: string, recipient: string, businessName: string, now = Date.now()) {
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
    const dueTasks = this.ctx.storage.sql
      .exec<Pick<OutboxRow, "invite_id" | "submission_id" | "task_type">>(
        `SELECT invite_id, submission_id, task_type FROM intake_outbox
         WHERE status IN ('pending','delivering') AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC LIMIT 20`,
        now,
      )
      .toArray();
    for (const task of dueTasks) {
      await this.deliverOutboxTask(task.invite_id, task.submission_id, task.task_type, Date.now());
    }
    await this.scheduleOutboxAlarm();
  }

  private async deliverOutboxTask(inviteId: string, submissionId: string, taskType: OutboxTaskType, now: number) {
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
        const receipt = renderIntakeReceivedEmail({ businessName: claimed.business_name || "your business" });
        await sendEmail(this.env, {
          to: claimed.recipient || "",
          ...receipt,
          tag: "client-intake-received",
          idempotencyKey: claimed.idempotency_key || `client-intake-received-${claimed.submission_id}`,
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
        error: error instanceof Error ? error.message.slice(0, 160) : "Unknown delivery error",
      });
    }
    await this.scheduleOutboxAlarm();
  }

  private async sendIntakeDispatch(task: OutboxRow) {
    const invite = this.row(task.invite_id);
    // Prefer the inviter-configured email; fall back to the email the client
    // submitted with the intake so link-only invites are still attributed.
    const attributedEmail = invite?.client_email || invite?.submitter_email;
    const response = await fetch("https://api.github.com/repos/WrazyAI/launchloom/dispatches", {
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
          // The lifecycle email address lets the generation ledger attribute a
          // run to the invited client without storing a second copy of it.
          ...(attributedEmail ? { client_email: attributedEmail } : {}),
        },
      }),
    });
    if (!response.ok) throw new Error(`GitHub dispatch failed: ${response.status}`);
  }

  private async scheduleOutboxAlarm() {
    const next = this.ctx.storage.sql
      .exec<{ next_attempt_at: number | null }>(
        `SELECT MIN(next_attempt_at) AS next_attempt_at FROM intake_outbox
         WHERE status IN ('pending','delivering')`,
      )
      .toArray()[0]?.next_attempt_at;
    if (next === null || next === undefined) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(next);
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
       (invite_id, client_email, expires_at, allowed_origin, token_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'unused', ?, ?)`,
      input.inviteId,
      input.clientEmail,
      input.expiresAt,
      input.allowedOrigin,
      input.tokenHash,
      input.now,
      input.now,
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
  ): Promise<InviteValidation> {
    const row = this.row(inviteId);
    if (!row) return { valid: false };
    if (row.status === "unused" && row.expires_at <= now) {
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
    const accepted = row.status === "consumed" &&
      Boolean(submissionId) &&
      row.submission_id === submissionId &&
      Boolean(row.issue_number);
    return {
      valid: claimsMatch && row.status === "unused",
      accepted: claimsMatch && accepted,
      issue: accepted ? row.issue_number : null,
      clientEmail: row.client_email,
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
  ) {
    const row = this.row(inviteId);
    if (!row) return { accepted: false as const, reason: "invalid" as const };
    if (row.status === "unused" && row.expires_at <= now) {
      this.ctx.storage.sql.exec(
        "UPDATE onboarding_invites SET status = 'expired', updated_at = ? WHERE invite_id = ? AND status = 'unused'",
        now,
        inviteId,
      );
      return { accepted: false as const, reason: "expired" as const };
    }
    if (
      row.token_hash !== tokenHash ||
      row.expires_at !== tokenExpiresAt ||
      row.allowed_origin !== origin ||
      (row.client_email && row.client_email.toLowerCase() !== clientEmail.toLowerCase())
    )
      return { accepted: false as const, reason: "invalid" as const };
    if (row.status === "consumed") {
      return row.submission_id === submissionId && row.submission_hash === submissionHash && row.issue_number
        ? { accepted: true as const, duplicate: true as const, issue: row.issue_number }
        : { accepted: false as const, reason: row.submission_id === submissionId ? "submission_mismatch" as const : "consumed" as const };
    }
    if (row.status !== "unused")
      return { accepted: false as const, reason: row.status };
    if (row.reserved_submission_id) {
      // Never retroactively assign an owner to a pre-migration ambiguous operation.
      if (!row.operation_id || row.recovery_sweeps >= 3)
        return { accepted: false as const, reason: "recovery_required" as const };
      if (row.reserved_submission_id !== submissionId)
        return { accepted: false as const, reason: "in_progress" as const };
      const stale = row.reserved_at !== null && now - row.reserved_at >= 2 * 60_000;
      if (row.reserved_submission_hash !== submissionHash) {
        if (stale && row.reservation_phase === "reserved") {
          return {
            accepted: false as const,
            reason: "stale_submission_mismatch" as const,
            reservedSubmissionHash: row.reserved_submission_hash,
          };
        }
        return { accepted: false as const, reason: "submission_mismatch" as const };
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
        return { accepted: true as const, duplicate: false as const, issue: null };
      }
      if (stale && row.reservation_phase === "creating_issue")
        return { accepted: true as const, duplicate: false as const, issue: null };
      return { accepted: false as const, reason: "in_progress" as const };
    }
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET reserved_submission_id = ?, reserved_submission_hash = ?, reserved_at = ?, reservation_phase = 'reserved', operation_id = ?, recovery_page = 1, recovery_sweeps = 0, recovery_lease = NULL, recovery_lease_until = 0, submitter_email = COALESCE(submitter_email, ?), updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id IS NULL`,
      submissionId,
      submissionHash,
      now,
      crypto.randomUUID(),
      clientEmail.trim().toLowerCase() || null,
      now,
      inviteId,
    );
    return { accepted: true as const, duplicate: false as const, issue: null };
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
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id = ?
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
    const audit = this.ctx.storage.sql.exec<{
      submission_id: string; payload_hash: string; issue_number: number; recipient: string; business_name: string;
    }>("SELECT * FROM intake_reconciliations WHERE invite_id = ?", inviteId).toArray()[0];
    const row = this.row(inviteId);
    if (audit) return { duplicate: true as const, submissionId: audit.submission_id, submissionHash: audit.payload_hash,
      issueNumber: audit.issue_number, recipient: audit.recipient, businessName: audit.business_name, operationId: row?.operation_id || null };
    if (!row || !["unused", "expired"].includes(row.status) || !row.reserved_submission_id || !row.reserved_submission_hash ||
        (row.operation_id && row.recovery_sweeps < 3) || row.recovery_lease_until > Date.now()) return null;
    return { duplicate: false as const, submissionId: row.reserved_submission_id, submissionHash: row.reserved_submission_hash,
      operationId: row.operation_id, issueNumber: null, recipient: null, businessName: null };
  }

  async reconcileIssue(input: {
    inviteId: string; submissionId: string; submissionHash: string; operationId: string | null;
    issueNumber: number; reviewerEmail: string; recipient: string; businessName: string;
  }, now = Date.now()) {
    return this.ctx.storage.transactionSync(() => {
      const audit = this.ctx.storage.sql.exec<{issue_number: number; payload_hash: string}>(
        "SELECT issue_number, payload_hash FROM intake_reconciliations WHERE invite_id = ?", input.inviteId,
      ).toArray()[0];
      if (audit) return audit.issue_number === input.issueNumber && audit.payload_hash === input.submissionHash;
      const updated = this.ctx.storage.sql.exec<{invite_id: string}>(
        `UPDATE onboarding_invites SET status = 'consumed', submission_id = reserved_submission_id,
           submission_hash = reserved_submission_hash, issue_number = ?, operation_id = COALESCE(operation_id, ?),
           reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL,
           reservation_phase = 'reserved', recovery_lease = NULL, recovery_lease_until = 0, updated_at = ?
         WHERE invite_id = ? AND status IN ('unused','expired') AND reserved_submission_id = ?
           AND reserved_submission_hash = ? AND operation_id IS ? AND reserved_at <= ?
           AND recovery_lease_until <= ? AND (operation_id IS NULL OR recovery_sweeps >= 3) RETURNING invite_id`,
        input.issueNumber, crypto.randomUUID(), now, input.inviteId, input.submissionId,
        input.submissionHash, input.operationId, now - 120_000, now,
      ).toArray()[0];
      if (!updated) return false;
      this.ctx.storage.sql.exec(
        `INSERT INTO intake_reconciliations (invite_id, submission_id, payload_hash, issue_number, reviewer_email, recovered_at, recipient, business_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        input.inviteId, input.submissionId, input.submissionHash, input.issueNumber,
        input.reviewerEmail, now, input.recipient, input.businessName,
      );
      return true;
    });
  }

  async intakeOperation(inviteId: string, submissionId: string): Promise<IntakeOperation | null> {
    const row = this.row(inviteId);
    if (!row || row.status !== "unused" || row.reserved_submission_id !== submissionId) return null;
    return {
      operationId: row.operation_id || "", submissionHash: row.reserved_submission_hash || "",
      phase: row.reservation_phase, page: row.recovery_page, sweeps: row.recovery_sweeps,
      recoveryRequired: !row.operation_id || row.recovery_sweeps >= 3,
    };
  }

  async claimRecovery(inviteId: string, operationId: string, now = Date.now()) {
    const lease = crypto.randomUUID();
    const row = this.ctx.storage.sql.exec<InviteRow>(
      `UPDATE onboarding_invites SET recovery_lease = ?, recovery_lease_until = ?
       WHERE invite_id = ? AND operation_id = ? AND status = 'unused'
         AND recovery_sweeps < 3 AND recovery_lease_until <= ? RETURNING *`,
      lease, now + 120_000, inviteId, operationId, now,
    ).toArray()[0];
    return row ? { lease, page: row.recovery_page } : null;
  }

  async advanceRecovery(inviteId: string, operationId: string, lease: string, page: number) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites SET recovery_page = ?
       WHERE invite_id = ? AND operation_id = ? AND recovery_lease = ? AND status = 'unused'`,
      page, inviteId, operationId, lease,
    );
  }

  async checkpointRecovery(inviteId: string, operationId: string, lease: string, page: number, sweepComplete: boolean) {
    const updated = this.ctx.storage.sql.exec<{invite_id: string}>(
      `UPDATE onboarding_invites SET recovery_page = ?, recovery_sweeps = recovery_sweeps + ?,
         recovery_lease = NULL, recovery_lease_until = 0
       WHERE invite_id = ? AND operation_id = ? AND recovery_lease = ? AND status = 'unused' RETURNING invite_id`,
      page, sweepComplete ? 1 : 0, inviteId, operationId, lease,
    ).toArray();
    return updated.length === 1;
  }

  async claimIssueCreation(inviteId: string, submissionId: string, submissionHash: string, now = Date.now()) {
    const updated = this.ctx.storage.sql.exec<{ invite_id: string }>(
      `UPDATE onboarding_invites SET reservation_phase = 'creating_issue', updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id = ?
         AND reserved_submission_hash = ? AND reservation_phase = 'reserved'
       RETURNING invite_id`,
      now,
      inviteId,
      submissionId,
      submissionHash,
    );
    return updated.toArray().length === 1;
  }

  async recordIssue(inviteId: string, submissionId: string, submissionHash: string, issue: number, now = Date.now()) {
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_invites
       SET status = 'consumed', submission_id = ?, submission_hash = reserved_submission_hash,
           reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL, reservation_phase = 'reserved',
           issue_number = ?, updated_at = ?
       WHERE invite_id = ? AND reserved_submission_id = ? AND reserved_submission_hash = ? AND status = 'unused'`,
      submissionId,
      issue,
      now,
      inviteId,
      submissionId,
      submissionHash,
    );
    const row = this.row(inviteId);
    return row?.submission_id === submissionId && row.issue_number === issue;
  }

  async reopenFailedSubmission(inviteId: string, submissionId: string, submissionHash: string, now = Date.now()) {
    const row = this.row(inviteId);
    if (!row || row.reserved_submission_id !== submissionId || row.reserved_submission_hash !== submissionHash || row.issue_number) return false;
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
      .exec<Pick<InviteRow, "invite_id" | "client_email" | "submitter_email" | "expires_at" | "status" | "created_at" | "updated_at" | "submission_id" | "issue_number" | "operation_id" | "reserved_submission_id" | "recovery_sweeps">>(
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
        recoveryRequired: Boolean(row.reserved_submission_id) && (!row.operation_id || row.recovery_sweeps >= 3),
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
      .map((row) => ({ inviteId: row.invite_id, issueNumber: row.issue_number }));
  }

  async recordSubmitterEmail(inviteId: string, email: string, now = Date.now()) {
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

  async allowCoverageLookup(
    inviteId: string,
    now = Date.now(),
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const windowMs = 10 * 60_000;
    const limit = 40;
    const id = inviteId.slice(0, 160);
    const existing = this.ctx.storage.sql
      .exec<{
        window_started_at: number;
        request_count: number;
      }>(
        "SELECT window_started_at, request_count FROM coverage_lookup_limits WHERE invite_id = ?",
        id,
      )
      .toArray()[0];

    if (!existing || now - existing.window_started_at >= windowMs) {
      this.ctx.storage.sql.exec(
        "INSERT INTO coverage_lookup_limits (invite_id, window_started_at, request_count) VALUES (?, ?, 1) ON CONFLICT(invite_id) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1",
        id,
        now,
      );
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.request_count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowMs - (now - existing.window_started_at)) / 1000),
        ),
      };
    }

    this.ctx.storage.sql.exec(
      "UPDATE coverage_lookup_limits SET request_count = request_count + 1 WHERE invite_id = ?",
      id,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async resetCoverageLookupLimits(inviteId?: string) {
    if (inviteId) {
      this.ctx.storage.sql.exec(
        "DELETE FROM coverage_lookup_limits WHERE invite_id = ?",
        inviteId,
      );
    } else {
      this.ctx.storage.sql.exec("DELETE FROM coverage_lookup_limits");
    }
  }
}
