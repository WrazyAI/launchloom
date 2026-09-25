import { DurableObject } from "cloudflare:workers";

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

type InviteRow = {
  invite_id: string;
  client_email: string | null;
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
  created_at: number;
  updated_at: number;
};

export class OnboardingInvites extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
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
      `);
      const columns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(onboarding_invites)")
        .toArray();
      if (!columns.some((column) => column.name === "reservation_phase")) {
        ctx.storage.sql.exec(
          "ALTER TABLE onboarding_invites ADD COLUMN reservation_phase TEXT NOT NULL DEFAULT 'reserved'",
        );
      }
    });
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
      `UPDATE onboarding_invites SET reserved_submission_id = ?, reserved_submission_hash = ?, reserved_at = ?, reservation_phase = 'reserved', updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id IS NULL`,
      submissionId,
      submissionHash,
      now,
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
       SET reserved_submission_hash = ?, reserved_at = ?, updated_at = ?
       WHERE invite_id = ? AND status = 'unused' AND reserved_submission_id = ?
         AND reserved_submission_hash = ? AND reservation_phase = 'reserved'
         AND issue_number IS NULL AND reserved_at IS NOT NULL AND reserved_at <= ?
       RETURNING invite_id`,
      nextHash,
      now,
      now,
      inviteId,
      submissionId,
      previousHash,
      now - 2 * 60_000,
    );
    return updated.toArray().length === 1;
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
      `UPDATE onboarding_invites SET reserved_submission_id = NULL, reserved_submission_hash = NULL, reserved_at = NULL, reservation_phase = 'reserved', updated_at = ?
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
      .exec<Pick<InviteRow, "invite_id" | "client_email" | "expires_at" | "status" | "created_at" | "updated_at">>(
        `SELECT invite_id, client_email, expires_at, status, created_at, updated_at
         FROM onboarding_invites ORDER BY created_at DESC LIMIT 100`,
      )
      .toArray()
      .map((row) => ({
        inviteId: row.invite_id,
        clientEmail: row.client_email,
        expiresAt: row.expires_at,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }
}
