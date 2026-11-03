import { describe, expect, it, vi } from "vitest";
import {
  pruneGenerationActivity,
  runGenerationActivityPrune,
} from "../src/operations/reconcile";
import type { OperationsSql } from "../src/operations/store";

function fake(respond: (text: string, params: unknown[]) => unknown) {
  const calls: { text: string; params: unknown[] }[] = [];
  const sql: OperationsSql = {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      calls.push({ text, params });
      return respond(text, params) as T[];
    },
  };
  return { sql, calls };
}

describe("generation activity retention", () => {
  it("does not query when the capability is off", async () => {
    const { sql, calls } = fake(() => []);
    await expect(pruneGenerationActivity({}, sql)).resolves.toEqual({
      deleted: 0,
      batches: 0,
    });
    expect(calls).toHaveLength(0);
  });

  it("runs at most five bounded batches", async () => {
    let index = 0;
    const { sql, calls } = fake(() => {
      index += 1;
      return [{ deleted: 10, remaining: true }];
    });
    const result = await pruneGenerationActivity(
      { GENERATION_ACTIVITY_ENABLED: "true" },
      sql,
    );
    expect(result).toEqual({ deleted: 50, batches: 5 });
    expect(calls).toHaveLength(5);
    expect(calls[0]?.params).toEqual([100]);
  });

  it("stops when no expired rows remain", async () => {
    let index = 0;
    const { sql, calls } = fake(() => {
      index += 1;
      return [{ deleted: 3, remaining: index < 2 }];
    });
    await expect(
      pruneGenerationActivity({ GENERATION_ACTIVITY_ENABLED: "true" }, sql),
    ).resolves.toEqual({ deleted: 6, batches: 2 });
    expect(calls).toHaveLength(2);
  });

  it("reports a retention failure without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sql } = fake(() => {
      throw new Error("missing function");
    });
    await expect(
      runGenerationActivityPrune(
        { GENERATION_ACTIVITY_ENABLED: "true" },
        sql,
      ),
    ).resolves.toEqual({ deleted: 0, batches: 0 });
    expect(warn).toHaveBeenCalledWith("generation_activity_prune=failed");
    warn.mockRestore();
  });
});
