import {
  sendEmail,
  type TransactionalEmailEnvironment,
} from "./transactional-email";

export type PublicationInput = {
  repo: string;
  pr: number;
  headSha: string;
  siteId: string;
  clientEmail: string;
  reviewerEmail: string;
  feedbackIssue: number;
  retry?: boolean;
  overrideSessionId?: string;
  dispatchPayload?: Record<string, unknown>;
};
export type PublicationState =
  "reserved" | "queued" | "running" | "published" | "failed" | "attention";
export type PublicationDelivery = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type PublicationCommand = {
  action:
    | "claim"
    | "authorize-upload"
    | "uploaded"
    | "published"
    | "fail"
    | "dismiss"
    | "status"
    | "retry";
  publicationId: string;
  runId?: string;
  reason?: string;
  approvalToken?: string;
  deployment?: { id: string; origin: string; commit: string };
  delivery?: PublicationDelivery;
};
export type PublicationResult = {
  publicationId?: string;
  state: PublicationState | "missing" | "stale";
  allowed?: boolean;
  run?: boolean;
  skipUpload?: boolean;
  approvedSha?: string | null;
  deliveryState?: "pending" | "sending" | "sent" | "attention" | null;
  deliveryAttempts?: number;
  nextDeliveryAttemptAt?: number | null;
  deliveryError?: string | null;
  deployment?: { id: string; origin: string; commit: string } | null;
  failure?: string | null;
  dismissed?: boolean;
};

type Row = {
  seq: number;
  id: string;
  repo: string;
  pr: number;
  head_sha: string;
  approved_sha: string | null;
  site_id: string;
  client_email: string;
  reviewer_email: string;
  feedback_issue: number;
  state: PublicationState;
  run_id: string | null;
  input_json: string;
  dispatch_json: string | null;
  dispatch_sent: number;
  dispatch_attempts: number;
  next_attempt_at: number;
  created_at: number;
  updated_at: number;
  deployment_json: string | null;
  email_json: string | null;
  email_state: "pending" | "sending" | "sent" | "attention" | null;
  email_attempts: number;
  email_due: number;
  email_started_at: number;
  email_error: string | null;
  failure: string | null;
  dismissed: number;
  approval_lease_until: number;
  approval_token: string | null;
  dispatch_lease_until: number;
};
const HOLD = "('reserved','queued','running','failed','attention')";
const RUN_WINDOW = 50 * 60_000;
export class PublicationStore {
  constructor(
    private storage: DurableObjectStorage,
    private env: TransactionalEmailEnvironment & { GITHUB_ORG_TOKEN: string },
  ) {}
  initialize() {
    this.storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS publications (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,repo TEXT NOT NULL,pr INTEGER NOT NULL,
      head_sha TEXT NOT NULL,approved_sha TEXT,site_id TEXT NOT NULL,client_email TEXT NOT NULL,
      reviewer_email TEXT NOT NULL,feedback_issue INTEGER NOT NULL,state TEXT NOT NULL,
      run_id TEXT,input_json TEXT NOT NULL,dispatch_json TEXT,dispatch_sent INTEGER NOT NULL DEFAULT 0,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deployment_json TEXT,email_json TEXT,
      email_state TEXT,email_attempts INTEGER NOT NULL DEFAULT 0,email_due INTEGER NOT NULL DEFAULT 0,email_started_at INTEGER NOT NULL DEFAULT 0,email_error TEXT,
      failure TEXT,dismissed INTEGER NOT NULL DEFAULT 0,approval_lease_until INTEGER NOT NULL DEFAULT 0,approval_token TEXT,dispatch_lease_until INTEGER NOT NULL DEFAULT 0,UNIQUE(repo,pr,head_sha)
    );`);
    const columns = this.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(publications)")
      .toArray();
    if (!columns.some((column) => column.name === "approval_token"))
      this.storage.sql.exec(
        "ALTER TABLE publications ADD COLUMN approval_token TEXT",
      );
    if (!columns.some((column) => column.name === "email_error"))
      this.storage.sql.exec(
        "ALTER TABLE publications ADD COLUMN email_error TEXT",
      );
    for (const name of [
      "approval_lease_until",
      "dispatch_lease_until",
      "email_started_at",
    ])
      if (!columns.some((column) => column.name === name))
        this.storage.sql.exec(
          `ALTER TABLE publications ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`,
        );
  }
  private row(id: string) {
    return this.storage.sql
      .exec<Row>("SELECT * FROM publications WHERE id = ?", id)
      .toArray()[0];
  }
  held() {
    return this.storage.sql
      .exec<Row>(
        `SELECT * FROM publications WHERE state IN ${HOLD} AND dismissed = 0 ORDER BY seq DESC LIMIT 1`,
      )
      .toArray()[0];
  }
  feedbackContext(pr?: number, reviewedSha?: string) {
    const latest = this.storage.sql
      .exec<Row>("SELECT * FROM publications ORDER BY seq DESC LIMIT 1")
      .toArray()[0];
    if (!latest || latest.dismissed) return undefined;
    return (latest.pr === pr || latest.approved_sha === reviewedSha) &&
      latest.state === "published"
      ? latest
      : undefined;
  }

  reserve(input: PublicationInput) {
    return this.storage.transactionSync(() => {
      const existing = this.storage.sql
        .exec<Row>(
          "SELECT * FROM publications WHERE repo = ? COLLATE NOCASE AND pr = ? AND head_sha = ?",
          input.repo,
          input.pr,
          input.headSha,
        )
        .toArray()[0];
      const latest = this.storage.sql
        .exec<Row>("SELECT * FROM publications ORDER BY seq DESC LIMIT 1")
        .toArray()[0];
      if (existing) {
        if (existing.dismissed || (latest && latest.seq > existing.seq))
          return {
            allowed: false,
            code: "stale_publication",
            publicationId: existing.id,
            state: existing.state,
            duplicate: true,
          };
        if (["failed", "attention"].includes(existing.state) && input.retry) {
          this.storage.sql.exec(
            "UPDATE publications SET state = 'reserved', run_id = NULL, dispatch_sent = 0, dispatch_attempts = 0, dispatch_lease_until = 0, approval_lease_until = 0, failure = NULL, next_attempt_at = ?, updated_at = ? WHERE id = ?",
            Date.now() + 15 * 60_000,
            Date.now(),
            existing.id,
          );
        }
        const current = this.row(existing.id)!;
        const mergeAllowed =
          current.state === "reserved" &&
          current.approval_lease_until <= Date.now();
        const approvalToken = mergeAllowed ? crypto.randomUUID() : null;
        if (mergeAllowed)
          this.storage.sql.exec(
            "UPDATE publications SET approval_lease_until = ?, approval_token = ? WHERE id = ?",
            Date.now() + 120_000,
            approvalToken,
            current.id,
          );
        return {
          allowed: true,
          publicationId: existing.id,
          state: current.state,
          duplicate: true,
          mergeAllowed,
          approvalToken,
        };
      }
      const override = this.storage.sql
        .exec<{ session_id: string }>(
          "SELECT session_id FROM creative_override_publications WHERE status = 'dispatching' AND updated_at > ? LIMIT 1",
          Date.now() - 120_000,
        )
        .toArray()[0];
      if (override && override.session_id !== input.overrideSessionId)
        return {
          allowed: false,
          code: "publication_in_progress",
          publicationId: null,
          state: null,
          duplicate: false,
        };
      if (this.held())
        return {
          allowed: false,
          code: "publication_in_progress",
          publicationId: null,
          state: null,
          duplicate: false,
        };
      if (
        this.storage.sql
          .exec(
            "SELECT session_id FROM creative_repair_sessions WHERE status IN ('dispatching','queued','running') LIMIT 1",
          )
          .toArray().length
      )
        return {
          allowed: false,
          code: "revision_in_progress",
          publicationId: null,
          state: null,
          duplicate: false,
        };
      const failed = this.storage.sql
        .exec(
          "SELECT request_id FROM revision_requests WHERE status = 'failed' LIMIT 1",
        )
        .toArray()[0];
      if (failed)
        return {
          allowed: false,
          code: "revision_queue_halted",
          publicationId: null,
          state: null,
          duplicate: false,
        };
      const revision = this.storage.sql
        .exec(
          "SELECT request_id FROM revision_requests WHERE status IN ('dispatching','dispatched','running','queued') LIMIT 1",
        )
        .toArray()[0];
      if (revision)
        return {
          allowed: false,
          code: "revision_in_progress",
          publicationId: null,
          state: null,
          duplicate: false,
        };
      const id = crypto.randomUUID(),
        now = Date.now();
      this.storage.sql.exec(
        `INSERT INTO publications (id,repo,pr,head_sha,site_id,client_email,reviewer_email,feedback_issue,state,input_json,next_attempt_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,'reserved',?,?,?,?)`,
        id,
        input.repo,
        input.pr,
        input.headSha,
        input.siteId,
        input.clientEmail,
        input.reviewerEmail,
        input.feedbackIssue,
        JSON.stringify(input),
        now + 15 * 60_000,
        now,
        now,
      );
      const approvalToken = crypto.randomUUID();
      this.storage.sql.exec(
        "UPDATE publications SET approval_lease_until = ?, approval_token = ? WHERE id = ?",
        now + 120_000,
        approvalToken,
        id,
      );
      return {
        allowed: true,
        publicationId: id,
        state: "reserved" as PublicationState,
        duplicate: false,
        mergeAllowed: true,
        approvalToken,
      };
    });
  }
  async queue(
    id: string,
    approvedSha: string,
    payload: Record<string, unknown>,
    approvalToken?: string,
  ) {
    const row = this.row(id);
    if (
      !row ||
      row.dismissed ||
      !approvedSha ||
      (row.approved_sha && row.approved_sha !== approvedSha)
    )
      throw Error("Publication commit mismatch.");
    if (
      row.state === "reserved" &&
      (row.approval_token !== approvalToken ||
        row.approval_lease_until <= Date.now())
    )
      throw Error("Publication approval ownership expired.");
    if (row.state === "published" || row.state === "running")
      return this.status(id);
    if (!["reserved", "queued"].includes(row.state))
      throw Error("Publication needs explicit recovery.");
    if (row.dispatch_sent || row.dispatch_lease_until > Date.now())
      return this.status(id);
    const body = {
      ...payload,
      publicationId: id,
      repo: row.repo,
      pr: row.pr,
      siteId: row.site_id,
      clientEmail: row.client_email,
      feedbackIssue: row.feedback_issue,
      approvedSha,
    };
    this.storage.sql.exec(
      "UPDATE publications SET approved_sha = ?, dispatch_json = COALESCE(dispatch_json, ?), state = 'queued', next_attempt_at = ?, updated_at = ? WHERE id = ?",
      approvedSha,
      JSON.stringify(body),
      Date.now(),
      Date.now(),
      id,
    );
    await this.dispatch(id);
    return this.status(id);
  }
  private async dispatch(id: string) {
    const now = Date.now();
    const row = this.storage.sql
      .exec<Row>(
        "UPDATE publications SET dispatch_attempts = dispatch_attempts + 1, next_attempt_at = ?, dispatch_lease_until = ?, updated_at = ? WHERE id = ? AND state = 'queued' AND dispatch_sent = 0 AND next_attempt_at <= ? AND dispatch_lease_until <= ? RETURNING *",
        now + 120_000,
        now + 120_000,
        now,
        id,
        now,
        now,
      )
      .toArray()[0];
    if (!row) return;
    try {
      const response = await fetch(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.env.GITHUB_ORG_TOKEN,
            "Content-Type": "application/json",
            Accept: "application/vnd.github+json",
            "User-Agent": "LaunchLoom-Cloudflare-Worker",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            event_type: "publish-site",
            client_payload: JSON.parse(row.dispatch_json!),
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok)
        throw Error("Publication dispatch failed: " + response.status);
      this.storage.sql.exec(
        "UPDATE publications SET dispatch_sent = 1, dispatch_lease_until = 0, next_attempt_at = ?, failure = NULL WHERE id = ? AND state = 'queued'",
        Date.now() + RUN_WINDOW,
        id,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "publication.dispatch-failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      this.storage.sql.exec(
        "UPDATE publications SET state = ?, failure = 'Publication dispatch needs recovery.', dispatch_lease_until = 0, next_attempt_at = ? WHERE id = ? AND state = 'queued'",
        row.dispatch_attempts >= 3 ? "attention" : "queued",
        Date.now() + 15 * 60_000,
        id,
      );
    }
  }
  status(id: string): PublicationResult {
    const r = this.row(id);
    if (!r) return { state: "missing", publicationId: id };
    return {
      publicationId: id,
      state: r.state,
      approvedSha: r.approved_sha,
      deliveryState: r.email_state,
      deliveryAttempts: r.email_attempts,
      nextDeliveryAttemptAt: r.email_due || null,
      deliveryError: r.email_error,
      deployment: r.deployment_json ? JSON.parse(r.deployment_json) : null,
      failure: r.failure,
      dismissed: !!r.dismissed,
    };
  }
  command(input: PublicationCommand): PublicationResult {
    if (input.action === "status") return this.status(input.publicationId);
    const r = this.row(input.publicationId);
    if (!r)
      return {
        allowed: false,
        run: false,
        state: "missing",
        publicationId: input.publicationId,
      };
    if (input.action === "retry") {
      const latest = this.storage.sql
        .exec<Row>("SELECT * FROM publications ORDER BY seq DESC LIMIT 1")
        .toArray()[0];
      if (
        r.dismissed ||
        latest?.id !== r.id ||
        !["failed", "attention"].includes(r.state) ||
        !r.approved_sha ||
        !r.dispatch_json
      )
        return { allowed: false, state: r.state };
      this.storage.sql.exec(
        "UPDATE publications SET state = 'queued', run_id = NULL, dispatch_sent = 0, dispatch_attempts = 0, dispatch_lease_until = 0, failure = NULL, next_attempt_at = ?, updated_at = ? WHERE id = ?",
        Date.now(),
        Date.now(),
        r.id,
      );
      return { allowed: true, ...this.status(r.id) };
    }
    if (input.action === "dismiss") {
      if (!["failed", "attention"].includes(r.state))
        return { allowed: false, state: r.state };
      this.storage.sql.exec(
        "UPDATE publications SET dismissed = 1, failure = ?, updated_at = ? WHERE id = ?",
        input.reason || "Publication dismissed by operator.",
        Date.now(),
        r.id,
      );
      return { allowed: true, ...this.status(r.id) };
    }
    if (input.action === "fail") {
      if (
        r.state === "published" ||
        r.dismissed ||
        (r.state === "reserved" && r.approval_token !== input.approvalToken) ||
        (r.state === "running" && !input.runId) ||
        r.state === "queued" ||
        (input.runId && r.run_id !== input.runId)
      )
        return { allowed: false, state: r.state };
      this.storage.sql.exec(
        "UPDATE publications SET state = 'failed', approval_lease_until = 0, failure = ?, updated_at = ? WHERE id = ?",
        input.reason || "Publication failed.",
        Date.now(),
        r.id,
      );
      return { allowed: true, ...this.status(r.id) };
    }
    if (
      input.action === "published" &&
      r.state === "published" &&
      r.run_id === input.runId
    )
      return { allowed: true, ...this.status(r.id) };
    const latest = this.storage.sql
      .exec<Row>("SELECT * FROM publications ORDER BY seq DESC LIMIT 1")
      .toArray()[0];
    if (r.dismissed || latest?.id !== r.id)
      return { allowed: false, run: false, state: "stale" };
    if (input.action === "claim") {
      if (
        !input.runId ||
        !r.approved_sha ||
        !(
          r.state === "queued" ||
          (r.state === "running" &&
            r.run_id === input.runId &&
            r.next_attempt_at > Date.now())
        )
      )
        return { run: false, state: r.state };
      if (r.state === "queued")
        this.storage.sql.exec(
          "UPDATE publications SET state = 'running', run_id = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?",
          input.runId,
          Date.now() + RUN_WINDOW,
          Date.now(),
          r.id,
        );
      return {
        run: true,
        state: "running",
        approvedSha: r.approved_sha,
        skipUpload: !!r.deployment_json,
        deployment: r.deployment_json ? JSON.parse(r.deployment_json) : null,
      };
    }
    if (
      r.state !== "running" ||
      r.run_id !== input.runId ||
      r.next_attempt_at <= Date.now()
    )
      return { allowed: false, state: r.state };
    if (input.action === "authorize-upload")
      return {
        allowed: true,
        state: r.state,
        approvedSha: r.approved_sha,
        skipUpload: !!r.deployment_json,
      };
    if (input.action === "uploaded") {
      const d = input.deployment;
      if (
        !d ||
        !d.id ||
        d.commit !== r.approved_sha ||
        d.origin !== `https://${r.site_id}.pages.dev`
      )
        return { allowed: false, state: r.state };
      if (r.deployment_json && r.deployment_json !== JSON.stringify(d))
        return { allowed: false, state: r.state };
      this.storage.sql.exec(
        "UPDATE publications SET deployment_json = ?, updated_at = ? WHERE id = ?",
        JSON.stringify(d),
        Date.now(),
        r.id,
      );
      return { allowed: true, ...this.status(r.id) };
    }
    if (input.action === "published") {
      if (
        !r.deployment_json ||
        !input.delivery ||
        input.delivery.to.toLowerCase() !== r.client_email.toLowerCase()
      )
        return { allowed: false, state: r.state };
      this.storage.transactionSync(() => {
        this.storage.sql.exec(
          "UPDATE publications SET state = 'published', email_json = COALESCE(email_json, ?), email_state = COALESCE(email_state, 'pending'), email_started_at = CASE WHEN email_started_at = 0 THEN ? ELSE email_started_at END, email_due = ?, failure = NULL, updated_at = ? WHERE id = ?",
          JSON.stringify(input.delivery),
          Date.now(),
          Date.now(),
          Date.now(),
          r.id,
        );
        this.storage.sql.exec(
          "UPDATE revision_requests SET base_sha = ? WHERE publication_id = ? AND status = 'queued'",
          r.approved_sha,
          r.id,
        );
      });
      return { allowed: true, ...this.status(r.id) };
    }
    return { allowed: false, state: r.state };
  }
  nextAlarm() {
    const due = this.storage.sql
      .exec<{ due: number | null }>(
        `SELECT MIN(due) AS due FROM (
      SELECT next_attempt_at AS due FROM publications WHERE state IN ('reserved','queued','running') AND dismissed = 0
      UNION ALL SELECT email_due AS due FROM publications WHERE email_state IN ('pending','sending')
    )`,
      )
      .toArray()[0]?.due;
    return due ?? null;
  }
  async alarm() {
    const now = Date.now();
    const rows = this.storage.sql
      .exec<Row>(
        "SELECT * FROM publications WHERE state IN ('reserved','queued','running') AND next_attempt_at <= ? AND dismissed = 0",
        now,
      )
      .toArray();
    for (const r of rows) {
      if (r.state === "reserved") {
        // A lost merge response is reconciled against the exact reviewed PR.
        // Never issue another merge from the alarm or infer ownership from main alone.
        const token = crypto.randomUUID();
        this.storage.sql.exec(
          "UPDATE publications SET approval_token = ?, approval_lease_until = ?, next_attempt_at = ? WHERE id = ?",
          token,
          now + 120_000,
          now + 15 * 60_000,
          r.id,
        );
        try {
          const headers = {
            Authorization: "Bearer " + this.env.GITHUB_ORG_TOKEN,
            "User-Agent": "LaunchLoom-Cloudflare-Worker",
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          };
          const response = await fetch(
            `https://api.github.com/repos/${r.repo}/pulls/${r.pr}`,
            { headers, signal: AbortSignal.timeout(10_000) },
          );
          if (!response.ok) throw Error("PR reconciliation unavailable.");
          const pr = (await response.json()) as {
            head?: { sha?: string };
            merged?: boolean;
            merge_commit_sha?: string;
          };
          if (pr.head?.sha !== r.head_sha || !pr.merged || !pr.merge_commit_sha)
            throw Error("Exact approved merge has not been confirmed.");
          const ref = await fetch(
            `https://api.github.com/repos/${r.repo}/git/ref/heads/main`,
            { headers, signal: AbortSignal.timeout(10_000) },
          );
          if (!ref.ok) throw Error("Main reconciliation unavailable.");
          const main = (await ref.json()) as { object?: { sha?: string } };
          if (main.object?.sha !== pr.merge_commit_sha)
            throw Error("Approved merge is superseded.");
          await this.queue(
            r.id,
            pr.merge_commit_sha,
            (JSON.parse(r.input_json) as PublicationInput).dispatchPayload ??
              {},
            token,
          );
        } catch {
          this.storage.sql.exec(
            "UPDATE publications SET state = 'attention', failure = 'Exact approved merge could not be reconciled. Review the PR and retry approval.', updated_at = ? WHERE id = ? AND state = 'reserved' AND approval_token = ?",
            Date.now(),
            r.id,
            token,
          );
        }
      } else if (r.state === "queued" && !r.dispatch_sent)
        await this.dispatch(r.id);
      else
        this.storage.sql.exec(
          "UPDATE publications SET state = 'attention', failure = 'Publication timed out; reconcile the workflow before retrying.', updated_at = ? WHERE id = ?",
          now,
          r.id,
        );
    }
    // Provider idempotency retention is finite. Stop before its 24-hour
    // window can expire, rather than risking a duplicate after an unknown result.
    this.storage.sql.exec(
      "UPDATE publications SET email_state = 'attention', failure = 'Email delivery needs provider reconciliation; automatic retry window exhausted.' WHERE email_state IN ('pending','sending') AND email_started_at > 0 AND email_started_at <= ?",
      now - 23 * 60 * 60_000,
    );
    const emails = this.storage.sql
      .exec<Row>(
        "UPDATE publications SET email_state = 'sending', email_attempts = email_attempts + 1, email_due = ? WHERE email_state IN ('pending','sending') AND email_due <= ? RETURNING *",
        now + 120_000,
        now,
      )
      .toArray();
    for (const r of emails) {
      try {
        const email = JSON.parse(r.email_json!) as PublicationDelivery;
        await sendEmail(this.env, {
          ...email,
          tag: "published",
          idempotencyKey: `publication-client-${r.id}`,
          required: true,
          timeoutMs: 20_000,
        });
        this.storage.sql.exec(
          "UPDATE publications SET email_state = 'sent', email_due = 0, email_error = NULL WHERE id = ?",
          r.id,
        );
      } catch (error) {
        this.storage.sql.exec(
          "UPDATE publications SET email_state = 'pending', email_due = ?, email_error = ? WHERE id = ?",
          Date.now() +
            Math.min(60, 2 ** Math.min(r.email_attempts, 6)) * 60_000,
          error instanceof Error
            ? error.message.slice(0, 200)
            : "Email provider unavailable.",
          r.id,
        );
      }
    }
  }
}
