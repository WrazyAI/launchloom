import { describe, expect, it, vi } from "vitest";
import {
  createTimingRecorder,
  logTimingSummary,
  summarizeTimingEntries,
} from "../scripts/creative-timing.mjs";

describe("creative timing recorder", () => {
  it("records entries with normalized durations and status", () => {
    const recorder = createTimingRecorder();
    recorder.record({
      category: "judge",
      name: "candidate-a",
      startedAt: 1000.4,
      durationMs: 1234.6,
    });
    recorder.record({
      category: "judge",
      name: "candidate-b",
      startedAt: 2000,
      durationMs: -5,
      status: "error",
    });
    const entries = recorder.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      index: 0,
      category: "judge",
      name: "candidate-a",
      startedAt: 1000,
      durationMs: 1235,
      status: "ok",
    });
    expect(entries[1]).toMatchObject({ durationMs: 0, status: "error" });
  });

  it("times async work and rethrows failures while recording them", async () => {
    const recorder = createTimingRecorder();
    const value = await recorder.time("capture", "home", async () => "done");
    expect(value).toBe("done");
    await expect(
      recorder.time("capture", "broken", async () => {
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");
    const [ok, failed] = recorder.entries();
    expect(ok.status).toBe("ok");
    expect(failed.status).toBe("error");
    expect(failed.details.error).toContain("render failed");
  });

  it("attaches details returned by the details callback", async () => {
    const recorder = createTimingRecorder();
    await recorder.time("judge", "candidate-a", async () => ({ score: 91 }), {
      details: (result) => ({ score: result.score }),
    });
    expect(recorder.entries()[0].details).toEqual({ score: 91 });
  });

  it("aggregates per-category totals and maxima", () => {
    const recorder = createTimingRecorder();
    recorder.record({ category: "judge", name: "a", durationMs: 100 });
    recorder.record({ category: "judge", name: "b", durationMs: 300 });
    recorder.record({
      category: "repair",
      name: "a",
      durationMs: 90,
      status: "error",
    });
    expect(recorder.summary()).toEqual({
      judge: { count: 2, errorCount: 0, totalMs: 400, maxMs: 300 },
      repair: { count: 1, errorCount: 1, totalMs: 90, maxMs: 90 },
    });
  });

  it("summarizes persisted entries including per-name totals", () => {
    const summary = summarizeTimingEntries([
      { category: "judge", name: "a", durationMs: 100, status: "ok" },
      { category: "judge", name: "a", durationMs: 200, status: "ok" },
      { category: "gate", name: "round-00", durationMs: 50, status: "error" },
    ]);
    expect(summary.judge).toMatchObject({
      count: 2,
      totalMs: 300,
      maxMs: 200,
      names: { a: 300 },
    });
    expect(summary.gate).toMatchObject({ count: 1, errorCount: 1 });
  });

  it("emits a single structured log line and never throws", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      logTimingSummary("creative-bakeoff", { judge: { count: 3 } });
      expect(log).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(log.mock.calls[0][0]));
      expect(payload.launchloomTiming).toBe("creative-bakeoff");
      expect(payload.summary.judge.count).toBe(3);
      logTimingSummary("creative-bakeoff", undefined);
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});
