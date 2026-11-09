import { describe, expect, it } from "vitest";
import { summariseDeliveryFunnel } from "../scripts/generation-delivery-funnel.mjs";

function record(overrides: Record<string, any> = {}) {
  return {
    attemptId: `attempt-${Math.random().toString(16).slice(2)}`,
    profile: "full",
    executionStatus: "succeeded",
    deliveryStatus: "preview_ready",
    startedAt: 1_000,
    completedAt: 1_000 + 10 * 60_000,
    ...overrides,
  };
}

describe("generation delivery funnel", () => {
  it("counts clean and warned deliveries separately", () => {
    const summary = summariseDeliveryFunnel([
      record({ attemptId: "clean" }),
      record({
        attemptId: "warned",
        deliveryStatus: "attention",
        previewUrl: "https://review-initial.example.pages.dev",
        deliveryWarnings: ["open design finding"],
      }),
    ]);
    expect(summary).toMatchObject({
      eligible: 2,
      delivered: 2,
      clean: 1,
      warned: 1,
      failed: 0,
      unknown: 0,
    });
  });

  it("counts a failed run as failed and a missing report as unknown", () => {
    const summary = summariseDeliveryFunnel([
      record({
        attemptId: "failed",
        executionStatus: "failed",
        deliveryStatus: "none",
      }),
      record({
        attemptId: "missing",
        deliveryStatus: "none",
        deliveryReportMissing: true,
      }),
    ]);
    expect(summary).toMatchObject({
      eligible: 2,
      delivered: 0,
      failed: 1,
      unknown: 1,
    });
  });

  it("excludes non-full profiles, cancelled runs, fast-lane runs and synthetic intakes", () => {
    const summary = summariseDeliveryFunnel([
      record({ attemptId: "full" }),
      record({ attemptId: "creative", profile: "creative-only" }),
      record({ attemptId: "seo", profile: "seo-only" }),
      record({ attemptId: "access", profile: "access-only" }),
      record({ attemptId: "cancelled", executionStatus: "cancelled" }),
      record({ attemptId: "fast", fastLane: true }),
      record({ attemptId: "synthetic", synthetic: true }),
    ]);
    expect(summary.eligible).toBe(1);
    expect(summary.delivered).toBe(1);
  });

  it("keeps only the last 20 eligible attempts by start time", () => {
    const records = Array.from({ length: 25 }, (_, index) =>
      record({
        attemptId: `attempt-${index}`,
        startedAt: index * 1_000,
        completedAt: index * 1_000 + 60_000,
        deliveryStatus: index < 5 ? "none" : "preview_ready",
        executionStatus: index < 5 ? "failed" : "succeeded",
      }),
    );
    const summary = summariseDeliveryFunnel(records);
    expect(summary.eligible).toBe(20);
    expect(summary.delivered).toBe(20);
    expect(summary.failed).toBe(0);
  });

  it("reports nearest-rank p50 and p90 durations for delivered previews", () => {
    const summary = summariseDeliveryFunnel([
      record({ attemptId: "ten", completedAt: 1_000 + 10 * 60_000 }),
      record({ attemptId: "thirty", completedAt: 1_000 + 30 * 60_000 }),
      record({ attemptId: "twenty", completedAt: 1_000 + 20 * 60_000 }),
      record({
        attemptId: "failed",
        executionStatus: "failed",
        deliveryStatus: "none",
        completedAt: 1_000 + 60 * 60_000,
      }),
    ]);
    expect(summary.p50Minutes).toBe(20);
    expect(summary.p90Minutes).toBe(30);
  });

  it("never treats a missing delivery status as a success", () => {
    const summary = summariseDeliveryFunnel([
      record({ attemptId: "unknown", deliveryStatus: undefined }),
    ]);
    expect(summary).toMatchObject({ delivered: 0, unknown: 1 });
  });
});
