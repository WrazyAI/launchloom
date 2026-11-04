import { describe, expect, it } from "vitest";
import {
  createGenerationActivityStore,
  type VerifiedTraceOwner,
} from "../src/generation-activity/store";
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from "../src/generation-activity/cursor";
import type { OperationsSql } from "../src/operations/store";
import { BASE_CONTEXT, traceEvent } from "../../tests/fixtures/generation-activity";

const ATTEMPT = BASE_CONTEXT.attemptId;

class FakeSql implements OperationsSql {
  readonly calls: { text: string; params: unknown[] }[] = [];
  constructor(private readonly respond: (text: string, params: unknown[]) => unknown) {}
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    this.calls.push({ text, params });
    const value = this.respond(text, params);
    return (Array.isArray(value) ? value : [value]) as T[];
  }
}

const owner: VerifiedTraceOwner = {
  namespace: "operations",
  attemptId: ATTEMPT,
  repositoryId: "123",
  runId: "456",
  runAttempt: 1,
};

function storedRow(event = traceEvent()) {
  return {
    cursor: 7,
    event_id: event.eventId,
    kind: event.kind,
    producer_sequence: event.sequence,
    context: event.context,
    payload: event.payload,
    emitted_ms: Date.parse(event.emittedAt),
    received_ms: 1_791_000_000_000,
  };
}

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    partition: { recording: "recording", last_heartbeat_ms: null, event_count: 1, byte_count: 600 },
    expired: false,
    coverage: [],
    usage: {
      responses: 0,
      unknown_responses: 0,
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens: null,
      cache_write_tokens: null,
      reasoning_tokens: null,
      actual_cost: null,
      estimated_cost: null,
      cost_currency: null,
      unreported_cost: 0,
    },
    events: [storedRow()],
    ...overrides,
  };
}

describe("generation activity store adapter", () => {
  it("rejects a batch whose identity does not match the verified owner", async () => {
    const sql = new FakeSql(() => ({ accepted: 1, last_cursor: 1, suppressed: false, expired: false }));
    const store = createGenerationActivityStore(sql);
    await expect(
      store.append(owner, [
        traceEvent({
          context: {
            ...traceEvent().context,
            attemptId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          },
        }),
      ]),
    ).rejects.toThrow(/Invalid activity request/u);
    expect(sql.calls).toHaveLength(0);
  });

  it("rejects unbounded or ambiguous reads before querying", async () => {
    const sql = new FakeSql(() => ({ record: pageRow() }));
    const store = createGenerationActivityStore(sql);
    await expect(store.read(owner, { limit: 0 })).rejects.toThrow(/Invalid/u);
    await expect(store.read(owner, { limit: 101 })).rejects.toThrow(/Invalid/u);
    await expect(
      store.read(owner, {
        after: encodeActivityCursor(owner, 1),
        before: encodeActivityCursor(owner, 2),
      }),
    ).rejects.toThrow(/Invalid/u);
    await expect(
      store.read(owner, { after: "v1.1.00000000" }),
    ).rejects.toThrow(/Invalid activity cursor/u);
    expect(sql.calls).toHaveLength(0);
  });

  it("maps a stored page into chronological order with a bound cursor", async () => {
    const first = storedRow();
    const second = storedRow(
      traceEvent({
        eventId: "99999999-9999-4999-8999-999999999999",
        sequence: 2,
        kind: "heartbeat",
        payload: { intervalMs: 10_000 },
      }),
    );
    second.cursor = 8;
    const sql = new FakeSql(() => ({
      record: pageRow({ events: [second, first] }),
    }));
    const store = createGenerationActivityStore(sql);
    const page = await store.read(owner, { limit: 2 });
    expect(page.items.map((item) => item.sequence)).toEqual([1, 2]);
    expect(decodeActivityCursor(owner, page.nextCursor)).toBe(8);
    expect(page.recording).toBe("recording");
    expect(page.retentionDays).toBe(30);
    expect(sql.calls[0]?.params.slice(0, 2)).toEqual([
      "operations",
      ATTEMPT,
    ]);
  });

  it("surfaces an expired tombstone without content", async () => {
    const sql = new FakeSql(() => ({
      record: pageRow({ partition: null, expired: true, events: [] }),
    }));
    const store = createGenerationActivityStore(sql);
    const page = await store.read(owner);
    expect(page.recording).toBe("expired");
    expect(page.items).toHaveLength(0);
  });

  it("reports a never-recorded run distinctly from an expired one", async () => {
    const sql = new FakeSql(() => ({
      record: pageRow({ partition: null, expired: false, events: [] }),
    }));
    const store = createGenerationActivityStore(sql);
    expect((await store.read(owner)).recording).toBe("not_recorded");
  });

  it("fails closed on a corrupt stored payload", async () => {
    const broken = storedRow();
    (broken as { payload: unknown }).payload = { callId: "not-a-uuid" };
    const sql = new FakeSql(() => ({
      record: pageRow({ events: [broken] }),
    }));
    const store = createGenerationActivityStore(sql);
    await expect(store.read(owner)).rejects.toThrow(
      /Generation activity is temporarily unavailable/u,
    );
  });

  it("classifies permanent SQL rejections so producers do not retry them", async () => {
    for (const [message, code] of [
      ["ERROR: activity_conflict", "conflict"],
      ["ERROR: activity_not_owned", "forbidden"],
      ["ERROR: activity_invalid", "invalid"],
    ] as const) {
      const sql = new FakeSql(() => {
        throw new Error(message);
      });
      const store = createGenerationActivityStore(sql);
      await expect(store.append(owner, [traceEvent()])).rejects.toMatchObject({
        name: "OperationsError",
        code,
      });
    }
  });

  it("bounds prune requests", async () => {
    const sql = new FakeSql(() => ({ deleted: 0, remaining: false }));
    const store = createGenerationActivityStore(sql);
    await expect(store.pruneExpired(0)).rejects.toThrow(/Invalid/u);
    await expect(store.pruneExpired(501)).rejects.toThrow(/Invalid/u);
    expect(await store.pruneExpired(100)).toEqual({
      deleted: 0,
      hasMore: false,
    });
  });
});
