import { DurableObject } from "cloudflare:workers";

export type GenerationCostKind = "actual" | "estimated" | "unreported";

export type GenerationRecordInput = {
  generationId: string;
  submissionId?: string | null;
  issueNumber?: number | null;
  businessName?: string | null;
  slug?: string | null;
  siteId?: string | null;
  repo?: string | null;
  clientEmail?: string | null;
  status?: string | null;
  previewUrl?: string | null;
  productionUrl?: string | null;
  reviewPr?: number | null;
  reviewedSha?: string | null;
  repairSessionId?: string | null;
  failureReason?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  updatedAt?: number | null;
};

export type GenerationEventInput = {
  eventKey: string;
  stage: string;
  status: string;
  provider?: string | null;
  model?: string | null;
  costUsd?: number | null;
  costKind?: GenerationCostKind;
  detail?: string | null;
  createdAt?: number | null;
};

export type GenerationRecord = {
  generationId: string;
  submissionId: string | null;
  issueNumber: number | null;
  businessName: string | null;
  slug: string | null;
  siteId: string | null;
  repo: string | null;
  clientEmail: string | null;
  status: string;
  previewUrl: string | null;
  productionUrl: string | null;
  reviewPr: number | null;
  reviewedSha: string | null;
  repairSessionId: string | null;
  failureReason: string | null;
  heroUpdatedAt: number | null;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
};

export type GenerationStageSummary = {
  stage: string;
  costUsd: number;
  actualCount: number;
  estimatedCount: number;
  unreportedCount: number;
  eventCount: number;
};

export type GenerationSummary = GenerationRecord & {
  totalCostUsd: number;
  actualCostUsd: number;
  estimatedCostUsd: number;
  unreportedCount: number;
  eventCount: number;
  lastEventAt: number | null;
  stages: GenerationStageSummary[];
};

export type GenerationEventRecord = GenerationEventInput & {
  generationId: string;
  costUsd: number | null;
  costKind: GenerationCostKind;
  detail: string;
  createdAt: number;
  updatedAt: number;
};

type GenerationRow = {
  generation_id: string;
  submission_id: string | null;
  issue_number: number | null;
  business_name: string | null;
  slug: string | null;
  site_id: string | null;
  repo: string | null;
  client_email: string | null;
  status: string;
  preview_url: string | null;
  production_url: string | null;
  review_pr: number | null;
  reviewed_sha: string | null;
  repair_session_id: string | null;
  failure_reason: string | null;
  hero_updated_at: number | null;
  started_at: number;
  completed_at: number | null;
  updated_at: number;
};

type GenerationSummaryRow = GenerationRow & {
  total_cost_usd: number;
  actual_cost_usd: number;
  estimated_cost_usd: number;
  unreported_count: number | null;
  event_count: number | null;
  last_event_at: number | null;
};

type GenerationEventRow = {
  generation_id: string;
  event_key: string;
  stage: string;
  status: string;
  provider: string | null;
  model: string | null;
  cost_usd: number | null;
  cost_kind: GenerationCostKind;
  detail: string;
  created_at: number;
  updated_at: number;
};

type StageSummaryRow = {
  generation_id: string;
  stage: string;
  cost_usd: number;
  actual_count: number | null;
  estimated_count: number | null;
  unreported_count: number | null;
  event_count: number | null;
};

function recordFromRow(row: GenerationRow): GenerationRecord {
  return {
    generationId: row.generation_id,
    submissionId: row.submission_id,
    issueNumber: row.issue_number,
    businessName: row.business_name,
    slug: row.slug,
    siteId: row.site_id,
    repo: row.repo,
    clientEmail: row.client_email,
    status: row.status,
    previewUrl: row.preview_url,
    productionUrl: row.production_url,
    reviewPr: row.review_pr,
    reviewedSha: row.reviewed_sha,
    repairSessionId: row.repair_session_id,
    failureReason: row.failure_reason,
    heroUpdatedAt: row.hero_updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function eventFromRow(row: GenerationEventRow): GenerationEventRecord {
  return {
    generationId: row.generation_id,
    eventKey: row.event_key,
    stage: row.stage,
    status: row.status,
    provider: row.provider,
    model: row.model,
    costUsd: row.cost_usd,
    costKind: row.cost_kind,
    detail: row.detail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Durable, idempotent ledger for client generation runs.
 *
 * Generation records are keyed by the intake submission id when present and
 * by `issue:<number>` for manual runs. Cost and status events are keyed by
 * `(generation_id, event_key)` so a retried workflow, a second repair round,
 * or a revision appends evidence instead of double counting. Hero previews
 * are stored as bounded image blobs and are only served through the
 * Cloudflare Access protected admin API.
 */
type GenerationLedgerEnvironment = Record<string, never>;

export class GenerationLedger extends DurableObject<GenerationLedgerEnvironment> {
  constructor(ctx: DurableObjectState, env: GenerationLedgerEnvironment) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS generations (
          generation_id TEXT PRIMARY KEY,
          submission_id TEXT,
          issue_number INTEGER,
          business_name TEXT,
          slug TEXT,
          site_id TEXT,
          repo TEXT,
          client_email TEXT,
          status TEXT NOT NULL DEFAULT 'generating',
          preview_url TEXT,
          production_url TEXT,
          review_pr INTEGER,
          reviewed_sha TEXT,
          repair_session_id TEXT,
          failure_reason TEXT,
          hero_updated_at INTEGER,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS generations_updated
          ON generations(updated_at);
        CREATE TABLE IF NOT EXISTS generation_events (
          generation_id TEXT NOT NULL,
          event_key TEXT NOT NULL,
          stage TEXT NOT NULL,
          status TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          cost_usd REAL,
          cost_kind TEXT NOT NULL DEFAULT 'unreported',
          detail TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (generation_id, event_key)
        );
        CREATE INDEX IF NOT EXISTS generation_events_stage
          ON generation_events(generation_id, stage);
        CREATE TABLE IF NOT EXISTS generation_heroes (
          generation_id TEXT PRIMARY KEY,
          content_type TEXT NOT NULL,
          bytes BLOB NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    });
  }

  private row(generationId: string): GenerationRow | undefined {
    return this.ctx.storage.sql
      .exec<GenerationRow>(
        "SELECT * FROM generations WHERE generation_id = ? LIMIT 1",
        generationId,
      )
      .toArray()[0];
  }

  async upsertGeneration(input: GenerationRecordInput) {
    const now = Date.now();
    const existing = this.row(input.generationId);
    if (!existing) {
      this.ctx.storage.sql.exec(
        `INSERT INTO generations
         (generation_id, submission_id, issue_number, business_name, slug, site_id, repo, client_email,
          status, preview_url, production_url, review_pr, reviewed_sha, repair_session_id, failure_reason,
          started_at, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.generationId,
        input.submissionId ?? null,
        input.issueNumber ?? null,
        input.businessName ?? null,
        input.slug ?? null,
        input.siteId ?? null,
        input.repo ?? null,
        input.clientEmail ?? null,
        input.status ?? "generating",
        input.previewUrl ?? null,
        input.productionUrl ?? null,
        input.reviewPr ?? null,
        input.reviewedSha ?? null,
        input.repairSessionId ?? null,
        input.failureReason ?? null,
        input.startedAt ?? now,
        input.completedAt ?? null,
        input.updatedAt ?? now,
      );
      return { ok: true, created: true };
    }
    const merged = {
      submission_id: input.submissionId ?? existing.submission_id,
      issue_number: input.issueNumber ?? existing.issue_number,
      business_name: input.businessName ?? existing.business_name,
      slug: input.slug ?? existing.slug,
      site_id: input.siteId ?? existing.site_id,
      repo: input.repo ?? existing.repo,
      client_email: input.clientEmail ?? existing.client_email,
      status: input.status ?? existing.status,
      preview_url: input.previewUrl ?? existing.preview_url,
      production_url: input.productionUrl ?? existing.production_url,
      review_pr: input.reviewPr ?? existing.review_pr,
      reviewed_sha: input.reviewedSha ?? existing.reviewed_sha,
      repair_session_id: input.repairSessionId ?? existing.repair_session_id,
      failure_reason:
        input.failureReason === undefined
          ? existing.failure_reason
          : input.failureReason,
      started_at: input.startedAt ?? existing.started_at,
      completed_at: input.completedAt ?? existing.completed_at,
      updated_at: input.updatedAt ?? now,
    };
    this.ctx.storage.sql.exec(
      `UPDATE generations SET
         submission_id = ?, issue_number = ?, business_name = ?, slug = ?, site_id = ?, repo = ?,
         client_email = ?, status = ?, preview_url = ?, production_url = ?, review_pr = ?, reviewed_sha = ?,
         repair_session_id = ?, failure_reason = ?, started_at = ?, completed_at = ?, updated_at = ?
       WHERE generation_id = ?`,
      merged.submission_id,
      merged.issue_number,
      merged.business_name,
      merged.slug,
      merged.site_id,
      merged.repo,
      merged.client_email,
      merged.status,
      merged.preview_url,
      merged.production_url,
      merged.review_pr,
      merged.reviewed_sha,
      merged.repair_session_id,
      merged.failure_reason,
      merged.started_at,
      merged.completed_at,
      merged.updated_at,
      input.generationId,
    );
    return { ok: true, created: false };
  }

  async recordEvents(generationId: string, events: GenerationEventInput[]) {
    const now = Date.now();
    for (const event of events) {
      const createdAt = event.createdAt ?? now;
      this.ctx.storage.sql.exec(
        `INSERT INTO generation_events
         (generation_id, event_key, stage, status, provider, model, cost_usd, cost_kind, detail, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(generation_id, event_key) DO UPDATE SET
           stage = excluded.stage,
           status = excluded.status,
           provider = excluded.provider,
           model = excluded.model,
           cost_usd = excluded.cost_usd,
           cost_kind = excluded.cost_kind,
           detail = excluded.detail,
           updated_at = excluded.updated_at`,
        generationId,
        event.eventKey,
        event.stage,
        event.status,
        event.provider ?? null,
        event.model ?? null,
        event.costUsd ?? null,
        event.costKind ?? "unreported",
        event.detail ?? "{}",
        createdAt,
        now,
      );
    }
    if (events.length)
      this.ctx.storage.sql.exec(
        "UPDATE generations SET updated_at = ? WHERE generation_id = ?",
        now,
        generationId,
      );
    return { ok: true, recorded: events.length };
  }

  async storeHero(generationId: string, contentType: string, bytes: ArrayBuffer) {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO generation_heroes (generation_id, content_type, bytes, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(generation_id) DO UPDATE SET
         content_type = excluded.content_type,
         bytes = excluded.bytes,
         updated_at = excluded.updated_at`,
      generationId,
      contentType,
      bytes,
      now,
    );
    this.ctx.storage.sql.exec(
      "UPDATE generations SET hero_updated_at = ?, updated_at = ? WHERE generation_id = ?",
      now,
      now,
      generationId,
    );
    return { ok: true };
  }

  async getHero(generationId: string) {
    const row = this.ctx.storage.sql
      .exec<{ content_type: string; bytes: ArrayBuffer; updated_at: number }>(
        "SELECT content_type, bytes, updated_at FROM generation_heroes WHERE generation_id = ? LIMIT 1",
        generationId,
      )
      .toArray()[0];
    return row
      ? { contentType: row.content_type, bytes: row.bytes, updatedAt: row.updated_at }
      : null;
  }

  async get(generationId: string) {
    const row = this.row(generationId);
    if (!row) return null;
    const events = this.ctx.storage.sql
      .exec<GenerationEventRow>(
        "SELECT * FROM generation_events WHERE generation_id = ? ORDER BY created_at ASC, event_key ASC LIMIT 400",
        generationId,
      )
      .toArray()
      .map(eventFromRow);
    return { generation: recordFromRow(row), events };
  }

  async list(limit = 200) {
    const boundedLimit = Math.min(400, Math.max(1, Number(limit) || 200));
    const rows = this.ctx.storage.sql
      .exec<GenerationSummaryRow>(
        `SELECT g.*,
           COALESCE(SUM(e.cost_usd), 0) AS total_cost_usd,
           COALESCE(SUM(CASE WHEN e.cost_kind = 'actual' THEN e.cost_usd ELSE 0 END), 0) AS actual_cost_usd,
           COALESCE(SUM(CASE WHEN e.cost_kind = 'estimated' THEN e.cost_usd ELSE 0 END), 0) AS estimated_cost_usd,
           SUM(CASE WHEN e.cost_kind = 'unreported' THEN 1 ELSE 0 END) AS unreported_count,
           COUNT(e.event_key) AS event_count,
           MAX(e.updated_at) AS last_event_at
         FROM generations g
         LEFT JOIN generation_events e ON e.generation_id = g.generation_id
         GROUP BY g.generation_id
         ORDER BY g.updated_at DESC
         LIMIT ?`,
        boundedLimit,
      )
      .toArray();
    const stageRows = this.ctx.storage.sql
      .exec<StageSummaryRow>(
        `SELECT generation_id, stage,
           COALESCE(SUM(cost_usd), 0) AS cost_usd,
           SUM(CASE WHEN cost_kind = 'actual' THEN 1 ELSE 0 END) AS actual_count,
           SUM(CASE WHEN cost_kind = 'estimated' THEN 1 ELSE 0 END) AS estimated_count,
           SUM(CASE WHEN cost_kind = 'unreported' THEN 1 ELSE 0 END) AS unreported_count,
           COUNT(event_key) AS event_count
         FROM generation_events
         GROUP BY generation_id, stage`,
      )
      .toArray();
    const stagesByGeneration = new Map<string, GenerationStageSummary[]>();
    for (const stageRow of stageRows) {
      const list = stagesByGeneration.get(stageRow.generation_id) || [];
      list.push({
        stage: stageRow.stage,
        costUsd: Number(stageRow.cost_usd) || 0,
        actualCount: Number(stageRow.actual_count) || 0,
        estimatedCount: Number(stageRow.estimated_count) || 0,
        unreportedCount: Number(stageRow.unreported_count) || 0,
        eventCount: Number(stageRow.event_count) || 0,
      });
      stagesByGeneration.set(stageRow.generation_id, list);
    }
    const generations: GenerationSummary[] = rows.map((row) => ({
      ...recordFromRow(row),
      totalCostUsd: Number(row.total_cost_usd) || 0,
      actualCostUsd: Number(row.actual_cost_usd) || 0,
      estimatedCostUsd: Number(row.estimated_cost_usd) || 0,
      unreportedCount: Number(row.unreported_count) || 0,
      eventCount: Number(row.event_count) || 0,
      lastEventAt: row.last_event_at === null ? null : Number(row.last_event_at),
      stages: (stagesByGeneration.get(row.generation_id) || []).sort((left, right) =>
        left.stage.localeCompare(right.stage),
      ),
    }));
    return generations;
  }
}
