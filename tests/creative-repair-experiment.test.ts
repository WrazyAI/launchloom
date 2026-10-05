import { describe, expect, it, vi } from "vitest";
const mod = await import("../scripts/creative-repair-experiment.mjs").catch(() => ({})) as any;
describe("bounded QA provider experiment", () => {
  it("counts before each actual fetch and blocks retries or unknown candidates", async () => {
    const actual = vi.fn(async () => Response.json({ ok: true }));
    const budget = mod.createQaRepairCallBudget?.({ fetchImpl: actual });
    expect(budget).toBeDefined();
    const a = budget.forCandidate("candidate-a");
    await a("https://openrouter.ai/api/v1/chat/completions", { method: "POST" });
    await expect(a("https://openrouter.ai/api/v1/chat/completions", { method: "POST" })).rejects.toMatchObject({ code: "QA_REPAIR_CALL_BUDGET_EXHAUSTED" });
    await budget.forCandidate("candidate-b")("https://openrouter.ai/api/v1/chat/completions", { method: "POST" });
    await expect(budget.forCandidate("candidate-c")("https://openrouter.ai/api/v1/chat/completions", { method: "POST" })).rejects.toMatchObject({ code: "QA_REPAIR_CALL_BUDGET_EXHAUSTED" });
    expect(() => budget.forCandidate("unknown")).toThrow();
    expect(actual).toHaveBeenCalledTimes(2);
    expect(budget.snapshot()).toEqual({ total: 2, limit: 2, candidates: { "candidate-a": 1, "candidate-b": 1 } });
  });
  it("counts a failed network call against the same immutable budget", async () => {
    const actual = vi.fn(async () => { throw Error("network down"); });
    const budget = mod.createQaRepairCallBudget?.({ fetchImpl: actual }); expect(budget).toBeDefined();
    await expect(budget.forCandidate("candidate-a")("https://openrouter.ai/api/v1/chat/completions", { method: "POST" })).rejects.toThrow("network down");
    await expect(budget.forCandidate("candidate-a")("https://openrouter.ai/api/v1/chat/completions", { method: "POST" })).rejects.toMatchObject({ code: "QA_REPAIR_CALL_BUDGET_EXHAUSTED" });
    expect(actual).toHaveBeenCalledTimes(1);
  });
});
