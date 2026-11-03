import {
  createPrivacyPolicy,
  buildTraceEvent,
  validateTraceBatch,
} from "../../../src/lib/generation-activity-contract.mjs";
import type {
  GenerationActivityCoverageEntry,
  GenerationActivityPage,
  GenerationActivityRecording,
  StoredTraceEvent,
  TraceEvent,
  TraceIdentity,
  TraceUsageSummary,
} from "../../../src/lib/generation-activity";
import {
  OperationsError,
  type OperationsSql,
} from "../operations/store";
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from "./cursor";

export type VerifiedTraceOwner = TraceIdentity & {
  repositoryId: string;
  runId: string;
  runAttempt: number;
};

export type TraceAppendResult = {
  accepted: number;
  /** Null when the partition has already expired and accepted nothing. */
  lastCursor: string | null;
  suppressed: boolean;
  expired: boolean;
};

export type TraceReadOptions = {
  after?: string | null;
  before?: string | null;
  limit?: number;
};

export type TracePruneResult = { deleted: number; hasMore: boolean };

export interface GenerationActivityStore {
  append(
    owner: VerifiedTraceOwner,
    events: TraceEvent[],
  ): Promise<TraceAppendResult>;
  read(
    identity: TraceIdentity,
    options?: TraceReadOptions,
  ): Promise<GenerationActivityPage>;
  pruneExpired(limit?: number): Promise<TracePruneResult>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LEGACY_ATTEMPT = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,199}$/u;
const READS = createPrivacyPolicy({ allowSourceText: true });
const INGEST = createPrivacyPolicy({ allowSourceText: true });
const MAX_PAGE = 100;

function invalid(): never {
  throw new OperationsError("invalid", "Invalid activity request.");
}
function unavailable(): never {
  throw new OperationsError(
    "dependency_unavailable",
    "Generation activity is temporarily unavailable.",
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireIdentity(value: unknown): TraceIdentity {
  if (!object(value)) invalid();
  const { namespace, attemptId } = value;
  if (namespace === "operations") {
    if (typeof attemptId !== "string" || !UUID.test(attemptId)) invalid();
    return { namespace, attemptId };
  }
  if (namespace === "legacy") {
    if (typeof attemptId !== "string" || !LEGACY_ATTEMPT.test(attemptId))
      invalid();
    return { namespace, attemptId };
  }
  return invalid();
}

function requireOwner(value: unknown): VerifiedTraceOwner {
  const identity = requireIdentity(value);
  if (!object(value)) invalid();
  if (
    typeof value.repositoryId !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(value.repositoryId) ||
    typeof value.runId !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(value.runId) ||
    !Number.isSafeInteger(value.runAttempt) ||
    (value.runAttempt as number) < 1
  )
    invalid();
  return {
    ...identity,
    repositoryId: value.repositoryId,
    runId: value.runId,
    runAttempt: value.runAttempt as number,
  };
}

function count(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && /^[0-9]{1,15}$/u.test(value))
    return Number(value);
  return unavailable();
}

function nullableCount(value: unknown): number | null {
  return value === null || value === undefined ? null : count(value);
}

function epochMilliseconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return Math.round(value);
  return unavailable();
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return unavailable();
  return value;
}

function storedEvent(row: unknown, identity: TraceIdentity): StoredTraceEvent {
  if (!object(row)) unavailable();
  const cursor = count(row.cursor);
  if (cursor < 1) unavailable();
  const context = row.context;
  const payload = row.payload;
  if (!object(context) || !object(payload)) unavailable();
  let event: TraceEvent;
  try {
    event = buildTraceEvent(
      {
        schemaVersion: 1,
        eventId: row.event_id,
        context,
        sequence: count(row.producer_sequence),
        emittedAt: new Date(
          epochMilliseconds(row.emitted_ms) ?? Number.NaN,
        ).toISOString(),
        kind: row.kind,
        payload,
      },
      READS,
    );
  } catch {
    return unavailable();
  }
  return {
    ...event,
    cursor: encodeActivityCursor(identity, cursor),
    receivedAt: epochMilliseconds(row.received_ms) ?? unavailable(),
  };
}

function recording(
  partition: Record<string, unknown> | null,
  expired: boolean,
): GenerationActivityRecording {
  if (expired) return "expired";
  if (!partition) return "not_recorded";
  const value = partition.recording;
  if (value === "complete" || value === "incomplete" || value === "recording")
    return value;
  return unavailable();
}

function coverage(value: unknown): GenerationActivityCoverageEntry[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return unavailable();
  return value.map((entry) => {
    if (!object(entry)) unavailable();
    if (
      typeof entry.boundary !== "string" ||
      !["instrumented", "not_applicable", "unsupported", "limited"].includes(
        String(entry.status),
      )
    )
      unavailable();
    return {
      boundary: entry.boundary,
      status: entry.status as GenerationActivityCoverageEntry["status"],
      detail: text(entry.detail),
    };
  });
}

function usageSummary(value: unknown): TraceUsageSummary {
  if (!object(value)) unavailable();
  const responses = count(value.responses);
  return {
    inputTokens: nullableCount(value.input_tokens),
    outputTokens: nullableCount(value.output_tokens),
    cachedInputTokens: nullableCount(value.cached_input_tokens),
    cacheWriteTokens: nullableCount(value.cache_write_tokens),
    reasoningTokens: nullableCount(value.reasoning_tokens),
    responses,
    unknownResponses: count(value.unknown_responses),
    cost: {
      currency: text(value.cost_currency),
      actual: text(value.actual_cost),
      estimated: text(value.estimated_cost),
      unreportedCount: count(value.unreported_cost),
    },
  };
}

type ReadRow = {
  partition: Record<string, unknown> | null;
  expired: boolean;
  coverage: unknown;
  usage: unknown;
  events: unknown;
};

export function createGenerationActivityStore(
  sql: OperationsSql,
): GenerationActivityStore {
  return {
    async append(owner, events) {
      const verified = requireOwner(owner);
      const valid = validateTraceBatch(events, INGEST);
      if (
        valid.some(
          (event) =>
            event.context.namespace !== verified.namespace ||
            event.context.attemptId !== verified.attemptId,
        )
      )
        invalid();
      let rows: {
        accepted: number;
        last_cursor: number;
        suppressed: boolean;
        expired: boolean;
      }[];
      try {
        rows = await sql.query<{
          accepted: number;
          last_cursor: number;
          suppressed: boolean;
          expired: boolean;
        }>(
          "select * from launchloom_operations.append_activity_events($1, $2, $3, $4, $5::integer, $6::jsonb)",
          [
            verified.namespace,
            verified.attemptId,
            verified.repositoryId,
            verified.runId,
            verified.runAttempt,
            JSON.stringify(valid),
          ],
        );
      } catch (error) {
        const message = String((error as Error)?.message ?? "");
        if (message.includes("activity_conflict"))
          throw new OperationsError(
            "conflict",
            "Conflicting activity evidence.",
          );
        if (message.includes("activity_not_owned"))
          throw new OperationsError(
            "forbidden",
            "Activity is not owned by this run.",
          );
        if (message.includes("activity_invalid"))
          throw new OperationsError("invalid", "Invalid activity evidence.");
        throw error;
      }
      const row = rows[0];
      if (!row) unavailable();
      const last = count(row.last_cursor);
      return {
        accepted: count(row.accepted),
        lastCursor: last > 0 ? encodeActivityCursor(verified, last) : null,
        suppressed: row.suppressed === true,
        expired: row.expired === true,
      };
    },

    async read(identityValue, options = {}) {
      const identity = requireIdentity(identityValue);
      const limit = options.limit ?? MAX_PAGE;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE)
        invalid();
      const after = decodeActivityCursor(identity, options.after);
      const before = decodeActivityCursor(identity, options.before);
      if (after !== null && before !== null) invalid();
      const rows = await sql.query<{ record: ReadRow | null }>(
        "select launchloom_operations.read_activity($1, $2, $3::integer, $4::integer, $5::integer) as record",
        [identity.namespace, identity.attemptId, after, before, limit],
      );
      const row = rows[0]?.record;
      if (!row) unavailable();
      const expiresAt = row.partition
        ? epochMilliseconds(
            (row.partition as Record<string, unknown>).expires_ms,
          )
        : null;
      if (expiresAt !== null && expiresAt <= Date.now()) {
        return {
          identity,
          items: [],
          nextCursor: null,
          hasMore: false,
          observedAt: Date.now(),
          lastHeartbeatAt: null,
          recording: "expired",
          coverage: [],
          usage: {
            inputTokens: null,
            outputTokens: null,
            cachedInputTokens: null,
            cacheWriteTokens: null,
            reasoningTokens: null,
            responses: 0,
            unknownResponses: 0,
            cost: {
              currency: null,
              actual: null,
              estimated: null,
              unreportedCount: 0,
            },
          },
          retentionDays: 30,
        };
      }
      const partition =
        row.partition === null || row.partition === undefined
          ? null
          : object(row.partition)
            ? row.partition
            : unavailable();
      const rawEvents = row.events;
      if (!Array.isArray(rawEvents)) unavailable();
      const hasMore = rawEvents.length > limit;
      const page = rawEvents
        .slice(0, limit)
        .map((event) => storedEvent(event, identity));
      // Forward catch-up is already oldest-first; history and initial reads are
      // newest-first and are reversed into chronological display order.
      const items = after !== null ? page : page.reverse();
      // Continuation depends on the requested direction. An incremental poll
      // needs the newest cursor even when it is caught up, while history paging
      // needs the oldest row only when another older page exists.
      let nextCursor: string | null = null;
      if (after !== null) {
        nextCursor = items.length
          ? items[items.length - 1].cursor
          : options.after ?? null;
      } else if (options.before) {
        if (hasMore && items.length) nextCursor = items[0].cursor;
      } else if (items.length) {
        nextCursor = items[items.length - 1].cursor;
      }
      return {
        identity,
        items,
        nextCursor,
        hasMore,
        observedAt: Date.now(),
        lastHeartbeatAt: partition
          ? epochMilliseconds(partition.last_heartbeat_ms)
          : null,
        recording: recording(partition, row.expired === true),
        coverage: coverage(row.coverage),
        usage: usageSummary(row.usage),
        retentionDays: 30,
      };
    },

    async pruneExpired(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) invalid();
      const rows = await sql.query<{ deleted: number; remaining: boolean }>(
        "select * from launchloom_operations.prune_activity($1::integer)",
        [limit],
      );
      const row = rows[0];
      if (!row) unavailable();
      return { deleted: count(row.deleted), hasMore: row.remaining === true };
    },
  };
}
