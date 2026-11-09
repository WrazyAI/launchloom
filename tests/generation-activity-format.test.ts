import { describe, expect, it } from "vitest";
import {
  activityProgress,
  activityStages,
  filterActivity,
  formatTokens,
  formatUsage,
  groupActivity,
  heartbeatNotice,
  isOpenEntry,
  recordingLabel,
} from "../src/admin/generation-activity-format";
import type {
  GenerationActivityPage,
  StoredTraceEvent,
} from "../src/lib/generation-activity";
import { BASE_CALL_ID, traceEvent, usage } from "./fixtures/generation-activity";

function stored(
  overrides: Record<string, unknown>,
  cursor: number,
  receivedAt = 1_000 + cursor,
): StoredTraceEvent {
  return {
    ...traceEvent(overrides),
    cursor: `v1.${cursor.toString(16)}.abcdabcd`,
    receivedAt,
  } as StoredTraceEvent;
}

const modelEvents: StoredTraceEvent[] = [
  stored({ sequence: 1, kind: "model_started" }, 1),
  stored(
    {
      sequence: 2,
      eventId: "22222222-2222-4222-8222-222222222222",
      kind: "model_finished",
      payload: { callId: BASE_CALL_ID, status: "completed" },
    },
    2,
  ),
  stored(
    {
      sequence: 3,
      eventId: "33333333-3333-4333-8333-333333333333",
      kind: "output",
      payload: {
        callId: BASE_CALL_ID,
        message: { kind: "text", text: "Visible generated copy." },
      },
    },
    3,
  ),
  stored(
    {
      sequence: 4,
      eventId: "44444444-4444-4444-8444-444444444444",
      kind: "usage",
      payload: { callId: BASE_CALL_ID, usage: usage() },
    },
    4,
  ),
];

describe("generation activity presentation", () => {
  it("collapses one model call into a single entry with all evidence", () => {
    const entries = groupActivity(modelEvents);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("model");
    expect(entries[0]?.status).toBe("completed");
    expect(entries[0]?.evidence).toHaveLength(4);
    expect(isOpenEntry(entries[0]!)).toBe(false);
  });

  it("keeps an unpaired start visibly open", () => {
    const entries = groupActivity([modelEvents[0]!]);
    expect(entries[0]?.status).toBeNull();
    expect(isOpenEntry(entries[0]!)).toBe(true);
  });

  it("groups an output delta into the active model call", () => {
    const delta = stored(
      {
        sequence: 2,
        eventId: "22222222-2222-4222-8222-222222222223",
        kind: "output_delta",
        payload: {
          callId: BASE_CALL_ID,
          visibleChars: 120,
          reasoningTokens: 4,
          elapsedMs: 1500,
        },
      },
      2,
    );
    const entries = groupActivity([modelEvents[0]!, delta]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("model");
    expect(entries[0]?.evidence).toHaveLength(2);
    expect(activityProgress(entries[0]!)).toEqual({
      visibleChars: 120,
      reasoningTokens: 4,
      elapsedMs: 1500,
    });
    expect(groupActivity([delta])).toHaveLength(0);
  });

  it("merges an action and preserves failures", () => {
    const entries = groupActivity([
      stored(
        {
          sequence: 1,
          kind: "action_started",
          payload: {
            actionId: "render:1",
            name: "render_candidate",
            input: { path: "src/index.astro" },
          },
        },
        1,
      ),
      stored(
        {
          sequence: 2,
          eventId: "55555555-5555-4555-8555-555555555555",
          kind: "action_finished",
          payload: {
            actionId: "render:1",
            name: "render_candidate",
            status: "failed",
            durationMs: 120,
            result: {},
          },
        },
        2,
      ),
      stored(
        {
          sequence: 3,
          eventId: "66666666-6666-4666-8666-666666666666",
          kind: "error",
          payload: {
            scope: "action",
            code: "render_error",
            message: { kind: "withheld", reason: "sensitive" },
          },
        },
        3,
      ),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(["action", "error"]);
    expect(entries[0]?.status).toBe("failed");
    expect(entries[1]?.title).toBe("Withheld (sensitive)");
  });

  it("filters actions, model work and issues", () => {
    const entries = groupActivity([
      ...modelEvents,
      stored(
        {
          sequence: 5,
          eventId: "77777777-7777-4777-8777-777777777777",
          kind: "error",
          payload: {
            scope: "action",
            code: "render_error",
            message: { kind: "text", text: "failed" },
          },
        },
        5,
      ),
    ]);
    expect(filterActivity(entries, "all")).toHaveLength(2);
    expect(filterActivity(entries, "model").map((entry) => entry.kind)).toEqual(
      ["model"],
    );
    expect(filterActivity(entries, "actions")).toHaveLength(0);
    expect(filterActivity(entries, "issues").map((entry) => entry.kind)).toEqual(
      ["error"],
    );
  });

  it("keeps an unfinished stage active instead of marking it done", () => {
    const authoring = traceEvent().context;
    const entries = groupActivity([
      stored({ sequence: 1 }, 1),
      stored(
        {
          sequence: 2,
          eventId: "99999999-9999-4999-8999-999999999999",
          kind: "model_finished",
          payload: { callId: BASE_CALL_ID, status: "completed" },
        },
        2,
      ),
      stored(
        {
          sequence: 3,
          eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          context: { ...authoring, stage: "creative_render" },
          kind: "action_started",
          payload: {
            actionId: "render:1",
            name: "render_candidate",
            input: { path: "src/index.astro" },
          },
        },
        3,
      ),
    ]);
    const live = activityStages(entries, true);
    expect(live.map((stage) => stage.stage)).toEqual([
      "authoring",
      "creative_render",
    ]);
    expect(live[0]?.state).toBe("done");
    expect(live[1]?.state).toBe("active");
    // An unpaired action stays active even when the run is no longer live.
    expect(activityStages(entries, false)[1]?.state).toBe("active");
  });

  it("formats token totals compactly and keeps unknown distinct", () => {
    expect(formatTokens(null)).toBe("Unknown");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1_200)).toBe("1.2k");
    expect(formatTokens(2_400_000)).toBe("2.40M");
  });

  it("keeps zero and unknown usage distinct in the summary", () => {
    const base = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      responses: 1,
      unknownResponses: 0,
      cost: { currency: null, actual: null, estimated: null, unreportedCount: 1 },
    };
    const zero = formatUsage(base);
    expect(zero.tokens).toBe("0 in · 0 out");
    expect(zero.cost).toBe("1 unreported");
    const unknown = formatUsage({
      ...base,
      inputTokens: null,
      outputTokens: null,
      responses: 0,
    });
    expect(unknown.tokens).toBe("Usage unknown");
    expect(unknown.responses).toBe("No responses yet");
  });

  it("distinguishes recording states and heartbeat silence", () => {
    expect(recordingLabel("recording", true)).toEqual({
      label: "Recording",
      tone: "live",
    });
    expect(recordingLabel("expired", false).label).toBe(
      "Expired after retention",
    );
    const page = {
      recording: "recording",
      lastHeartbeatAt: 1_000,
    } as GenerationActivityPage;
    expect(heartbeatNotice(page, 15_000)).toBeNull();
    expect(heartbeatNotice(page, 45_000)).toBe("No recent activity signal.");
    expect(heartbeatNotice(page, 90_000)).toContain("may be incomplete");
    expect(
      heartbeatNotice({ ...page, lastHeartbeatAt: null }, 90_000),
    ).toContain("first producer signal");
    expect(
      heartbeatNotice({ ...page, recording: "complete" }, 90_000),
    ).toBeNull();
  });
});
