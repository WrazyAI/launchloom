import { DurableObject } from "cloudflare:workers";
import { renderLifecycleEmail } from "../../emails/render-email.mjs";

export type RevisionStage = "developer" | "client";
export type QueueStatus =
  "dispatching" | "dispatched" | "running" | "queued" | "completed" | "failed";

export interface RevisionCoordinatorEnv {
  GITHUB_ORG_TOKEN: string;
  RESEND_API_KEY?: string;
  LAUNCHLOOM_FROM_EMAIL?: string;
  LAUNCHLOOM_FEEDBACK_EMAIL?: string;
}

export interface RevisionRequestInput {
  requestId: string;
  fingerprint: string;
  stage: RevisionStage;
  repo: string;
  pr?: number;
  feedbackIssue?: number;
  siteId: string;
  clientEmail: string;
  reviewedPage: string;
  category: string;
  feedback: string;
}

type RevisionRow = {
  request_id: string;
  fingerprint: string;
  stage: RevisionStage;
  repo: string;
  pr: number | null;
  feedback_issue: number | null;
  site_id: string;
  client_email: string;
  reviewed_page: string;
  category: string;
  feedback: string;
  comment_id: number | null;
  status: QueueStatus;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  dispatch_attempts: number;
  promoted_request_id: string | null;
  failure: string | null;
};

type FailureNotice = {
  requestId: string;
  reason: string;
  attempts: number;
};

export type EnqueueResult =
  | {
      ok: true;
      requestId: string;
      queueStatus: "started" | "queued" | "duplicate";
    }
  | {
      ok: false;
      code: "revision_queue_full" | "revision_queue_halted";
      error: string;
    };

export type ClaimResult = { run: boolean; status: QueueStatus | "missing" };

export type CompletionResult = {
  ok: true;
  promoted: null | {
    requestId: string;
    stage: RevisionStage;
    category: string;
    feedback: string;
  };
};

const ACTIVE = "('dispatching','dispatched','running')";
const DISPATCH_RETRY_MS = 15 * 60_000;
const RUN_TIMEOUT_MS = 50 * 60_000;
const RETENTION_MS = 30 * 24 * 60 * 60_000;
const FAILURE_NOTICE_KEY = "pending-failure-notice";

function cleanError(error: unknown) {
  return (
    error instanceof Error ? error.message : String(error || "Unknown error")
  )
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

async function github(
  env: RevisionCoordinatorEnv,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_ORG_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "LaunchLoom-Revision-Coordinator",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`GitHub ${response.status}: ${detail}`);
  }
  return response;
}

async function notifyFailure(
  env: RevisionCoordinatorEnv,
  row: RevisionRow,
  reason: string,
) {
  if (
    !env.RESEND_API_KEY ||
    !env.LAUNCHLOOM_FROM_EMAIL ||
    !env.LAUNCHLOOM_FEEDBACK_EMAIL
  )
    return true;
  const target = row.pr
    ? `https://github.com/${row.repo}/pull/${row.pr}`
    : `https://github.com/${row.repo}/issues/${row.feedback_issue}`;
  const rendered = renderLifecycleEmail({
    audience: "manual-attention",
    kind: "revision-failed",
    clientName: row.site_id,
    previewUrl: target,
    reviewUrl: target,
    clientFeedback: `${row.category ? `[${row.category}] ` : ""}${row.feedback}`,
    revisionOutcome: `${reason}\n\nRequest ID: ${row.request_id}`,
  });
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `revision-failed-${row.request_id}`,
      },
      body: JSON.stringify({
        from: env.LAUNCHLOOM_FROM_EMAIL,
        to: [env.LAUNCHLOOM_FEEDBACK_EMAIL],
        ...rendered,
        tags: [{ name: "launchloom_kind", value: "revision-queue-failed" }],
      }),
    });
  } catch {
    return false;
  }
  if (!response.ok)
    console.error(
      JSON.stringify({
        event: "revision.failure_email_failed",
        repo: row.repo,
        requestId: row.request_id,
        status: response.status,
      }),
    );
  return response.ok;
}

export class RevisionCoordinator extends DurableObject<RevisionCoordinatorEnv> {
  constructor(ctx: DurableObjectState, env: RevisionCoordinatorEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS revision_requests (
          request_id TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          stage TEXT NOT NULL CHECK(stage IN ('developer','client')),
          repo TEXT NOT NULL,
          pr INTEGER,
          feedback_issue INTEGER,
          site_id TEXT NOT NULL,
          client_email TEXT NOT NULL,
          reviewed_page TEXT NOT NULL,
          category TEXT NOT NULL,
          feedback TEXT NOT NULL,
          comment_id INTEGER,
          status TEXT NOT NULL CHECK(status IN ('dispatching','dispatched','running','queued','completed','failed')),
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          dispatch_attempts INTEGER NOT NULL DEFAULT 0,
          promoted_request_id TEXT,
          failure TEXT
        );
        CREATE INDEX IF NOT EXISTS revision_requests_status ON revision_requests(status, created_at);
        CREATE INDEX IF NOT EXISTS revision_requests_fingerprint ON revision_requests(fingerprint, created_at);
      `);
    });
  }

  private row(requestId: string) {
    return this.ctx.storage.sql
      .exec<RevisionRow>(
        "SELECT * FROM revision_requests WHERE request_id = ? LIMIT 1",
        requestId,
      )
      .toArray()[0];
  }

  private async createFeedbackComment(row: RevisionRow) {
    const issue = row.stage === "developer" ? row.pr : row.feedback_issue;
    if (!issue) throw new Error("Feedback target is missing.");
    const existing = await github(
      this.env,
      `/repos/${row.repo}/issues/${issue}/comments?per_page=100`,
    ).then(
      (response) =>
        response.json() as Promise<Array<{ id: number; body?: string }>>,
    );
    const marker = `<!-- launchloom-request:${row.request_id} -->`;
    const duplicate = existing.find((comment) =>
      comment.body?.includes(marker),
    );
    if (duplicate) return duplicate.id;
    const category = row.category ? ` · ${row.category}` : "";
    return github(this.env, `/repos/${row.repo}/issues/${issue}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `<!-- launchloom-feedback:${row.stage} -->\n${marker}\n**${row.stage === "developer" ? "Developer" : "Client"} feedback${category}**\n\n${row.feedback}\n\n_Page: ${row.reviewed_page}_`,
      }),
    })
      .then((response) => response.json() as Promise<{ id: number }>)
      .then((comment) => comment.id);
  }

  private async dispatchRow(row: RevisionRow) {
    if (!row.comment_id) throw new Error("Feedback comment was not persisted.");
    await github(this.env, "/repos/WrazyAI/launchloom/dispatches", {
      method: "POST",
      body: JSON.stringify({
        event_type:
          row.stage === "developer"
            ? "process-developer-feedback"
            : "process-client-feedback",
        client_payload: {
          requestId: row.request_id,
          feedbackComment: row.comment_id,
          repo: row.repo,
          pr: row.pr,
          feedbackIssue: row.feedback_issue,
          siteId: row.site_id,
          clientEmail: row.client_email,
        },
      }),
    });
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE revision_requests SET status = 'dispatched', started_at = ?, dispatch_attempts = dispatch_attempts + 1, failure = NULL WHERE request_id = ?",
      now,
      row.request_id,
    );
    await this.ctx.storage.setAlarm(now + DISPATCH_RETRY_MS);
    console.log(
      JSON.stringify({
        event: "revision.dispatched",
        repo: row.repo,
        requestId: row.request_id,
        stage: row.stage,
      }),
    );
  }

  private async markFailed(row: RevisionRow, error: unknown) {
    const reason = cleanError(error);
    this.ctx.storage.sql.exec(
      "UPDATE revision_requests SET status = 'failed', failure = ?, completed_at = ? WHERE request_id = ?",
      reason,
      Date.now(),
      row.request_id,
    );
    console.error(
      JSON.stringify({
        event: "revision.failed",
        repo: row.repo,
        requestId: row.request_id,
        reason,
      }),
    );
    if (await notifyFailure(this.env, row, reason)) {
      await this.ctx.storage.delete(FAILURE_NOTICE_KEY);
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.put<FailureNotice>(FAILURE_NOTICE_KEY, {
        requestId: row.request_id,
        reason,
        attempts: 1,
      });
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60_000);
    }
  }

  async enqueue(input: RevisionRequestInput): Promise<EnqueueResult> {
    const duplicate = this.ctx.storage.sql
      .exec<RevisionRow>(
        `SELECT * FROM revision_requests WHERE request_id = ? OR (fingerprint = ? AND status IN ${ACTIVE}) OR (fingerprint = ? AND status = 'queued') ORDER BY created_at DESC LIMIT 1`,
        input.requestId,
        input.fingerprint,
        input.fingerprint,
      )
      .toArray()[0];
    if (duplicate)
      return {
        ok: true,
        requestId: duplicate.request_id,
        queueStatus: "duplicate",
      };

    const halted = this.ctx.storage.sql
      .exec<RevisionRow>(
        "SELECT * FROM revision_requests WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1",
      )
      .toArray()[0];
    if (halted)
      return {
        ok: false,
        code: "revision_queue_halted",
        error:
          "Revision processing is paused after a failure. The developer has been notified.",
      };

    const active = this.ctx.storage.sql
      .exec<RevisionRow>(
        `SELECT * FROM revision_requests WHERE status IN ${ACTIVE} ORDER BY created_at LIMIT 1`,
      )
      .toArray()[0];
    const queued = this.ctx.storage.sql
      .exec<RevisionRow>(
        "SELECT * FROM revision_requests WHERE status = 'queued' ORDER BY created_at LIMIT 1",
      )
      .toArray()[0];
    if (active && queued)
      return {
        ok: false,
        code: "revision_queue_full",
        error: "One request is already waiting. Try again when it starts.",
      };

    const status: QueueStatus = active ? "queued" : "dispatching";
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO revision_requests (
        request_id, fingerprint, stage, repo, pr, feedback_issue, site_id,
        client_email, reviewed_page, category, feedback, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.requestId,
      input.fingerprint,
      input.stage,
      input.repo,
      input.pr || null,
      input.feedbackIssue || null,
      input.siteId,
      input.clientEmail,
      input.reviewedPage,
      input.category,
      input.feedback,
      status,
      now,
    );
    let row = this.row(input.requestId)!;
    try {
      const commentId = await this.createFeedbackComment(row);
      this.ctx.storage.sql.exec(
        "UPDATE revision_requests SET comment_id = ? WHERE request_id = ?",
        commentId,
        input.requestId,
      );
      row = this.row(input.requestId)!;
      if (status === "dispatching") await this.dispatchRow(row);
    } catch (error) {
      await this.markFailed(row, error);
      throw error;
    }
    console.log(
      JSON.stringify({
        event: status === "queued" ? "revision.queued" : "revision.started",
        repo: input.repo,
        requestId: input.requestId,
        stage: input.stage,
      }),
    );
    return {
      ok: true,
      requestId: input.requestId,
      queueStatus: status === "queued" ? "queued" : "started",
    };
  }

  async claim(requestId: string): Promise<ClaimResult> {
    const row = this.row(requestId);
    if (!row) return { run: false, status: "missing" };
    if (row.status !== "dispatched" && row.status !== "dispatching")
      return { run: false, status: row.status };
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE revision_requests SET status = 'running', started_at = ? WHERE request_id = ?",
      now,
      requestId,
    );
    await this.ctx.storage.setAlarm(now + RUN_TIMEOUT_MS);
    console.log(
      JSON.stringify({ event: "revision.claimed", repo: row.repo, requestId }),
    );
    return { run: true, status: "running" };
  }

  async complete(requestId: string): Promise<CompletionResult> {
    const row = this.row(requestId);
    if (!row) throw new Error("Revision request was not found.");
    if (row.status === "failed") throw new Error("Revision queue is halted.");
    let promoted = row.promoted_request_id
      ? this.row(row.promoted_request_id)
      : undefined;
    if (
      promoted &&
      !["dispatching", "dispatched", "running"].includes(promoted.status)
    )
      promoted = undefined;
    if (row.status !== "completed") {
      promoted = this.ctx.storage.sql
        .exec<RevisionRow>(
          "SELECT * FROM revision_requests WHERE status = 'queued' ORDER BY created_at LIMIT 1",
        )
        .toArray()[0];
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "UPDATE revision_requests SET status = 'completed', completed_at = ?, failure = NULL, promoted_request_id = ? WHERE request_id = ?",
          Date.now(),
          promoted?.request_id || null,
          requestId,
        );
        if (promoted)
          this.ctx.storage.sql.exec(
            "UPDATE revision_requests SET status = 'dispatching' WHERE request_id = ?",
            promoted.request_id,
          );
      });
      await this.ctx.storage.deleteAlarm();
      console.log(
        JSON.stringify({
          event: "revision.completed",
          repo: row.repo,
          requestId,
        }),
      );
      if (promoted) {
        promoted = this.row(promoted.request_id)!;
        try {
          await this.dispatchRow(promoted);
        } catch (error) {
          await this.markFailed(promoted, error);
          promoted = undefined;
        }
      }
    }
    this.ctx.storage.sql.exec(
      "UPDATE revision_requests SET feedback = '', category = '' WHERE status = 'completed' AND completed_at < ?",
      Date.now() - RETENTION_MS,
    );
    return {
      ok: true,
      promoted: promoted
        ? {
            requestId: promoted.request_id,
            stage: promoted.stage,
            category: promoted.category,
            feedback: promoted.feedback,
          }
        : null,
    };
  }

  async fail(requestId: string, reason: string): Promise<{ ok: true }> {
    const row = this.row(requestId);
    if (!row || row.status === "completed" || row.status === "failed")
      return { ok: true };
    await this.markFailed(row, reason || "Revision workflow failed.");
    return { ok: true };
  }

  async resume(
    requestId: string,
  ): Promise<{ ok: true; requestId: string | null }> {
    let failed = this.row(requestId);
    if (!failed || failed.status !== "failed")
      return { ok: true, requestId: null };
    await this.ctx.storage.delete(FAILURE_NOTICE_KEY);
    this.ctx.storage.sql.exec(
      "UPDATE revision_requests SET status = 'dispatching', failure = NULL WHERE request_id = ?",
      failed.request_id,
    );
    try {
      if (!failed.comment_id) {
        const commentId = await this.createFeedbackComment(failed);
        this.ctx.storage.sql.exec(
          "UPDATE revision_requests SET comment_id = ? WHERE request_id = ?",
          commentId,
          failed.request_id,
        );
        failed = this.row(failed.request_id)!;
      }
      await this.dispatchRow(this.row(failed.request_id)!);
    } catch (error) {
      await this.markFailed(failed, error);
      throw error;
    }
    return { ok: true, requestId: failed.request_id };
  }

  async approvalState(): Promise<{
    allowed: boolean;
    code?: "revision_in_progress" | "revision_queue_halted";
  }> {
    const failed = this.ctx.storage.sql
      .exec(
        "SELECT request_id FROM revision_requests WHERE status = 'failed' LIMIT 1",
      )
      .toArray()[0];
    if (failed) return { allowed: false, code: "revision_queue_halted" };
    const pending = this.ctx.storage.sql
      .exec(
        `SELECT request_id FROM revision_requests WHERE status IN ${ACTIVE} OR status = 'queued' LIMIT 1`,
      )
      .toArray()[0];
    return pending
      ? { allowed: false, code: "revision_in_progress" }
      : { allowed: true };
  }

  async alarm() {
    const notice =
      await this.ctx.storage.get<FailureNotice>(FAILURE_NOTICE_KEY);
    if (notice) {
      const failed = this.row(notice.requestId);
      if (!failed || (await notifyFailure(this.env, failed, notice.reason))) {
        await this.ctx.storage.delete(FAILURE_NOTICE_KEY);
        await this.ctx.storage.deleteAlarm();
      } else {
        const attempts = notice.attempts + 1;
        await this.ctx.storage.put<FailureNotice>(FAILURE_NOTICE_KEY, {
          ...notice,
          attempts,
        });
        await this.ctx.storage.setAlarm(
          Date.now() + Math.min(60, 5 * 2 ** (attempts - 1)) * 60_000,
        );
      }
      return;
    }
    const active = this.ctx.storage.sql
      .exec<RevisionRow>(
        `SELECT * FROM revision_requests WHERE status IN ${ACTIVE} ORDER BY created_at LIMIT 1`,
      )
      .toArray()[0];
    if (!active) return;
    const age = Date.now() - (active.started_at || active.created_at);
    if (active.status === "running") {
      if (age >= RUN_TIMEOUT_MS)
        await this.markFailed(active, "Revision workflow timed out.");
      else await this.ctx.storage.setAlarm(Date.now() + (RUN_TIMEOUT_MS - age));
      return;
    }
    if (active.dispatch_attempts >= 3) {
      await this.markFailed(active, "Revision workflow could not be started.");
      return;
    }
    try {
      await this.dispatchRow(active);
    } catch (error) {
      await this.ctx.storage.setAlarm(Date.now() + DISPATCH_RETRY_MS);
      console.error(
        JSON.stringify({
          event: "revision.dispatch_retry_failed",
          repo: active.repo,
          requestId: active.request_id,
          reason: cleanError(error),
        }),
      );
    }
  }
}
