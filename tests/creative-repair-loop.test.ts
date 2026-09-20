import { describe, expect, it } from "vitest";
import { runCreativeRepairLoop } from "../scripts/creative-repair-loop.mjs";

describe("creative repair loop", () => {
  it("repairs at most two cycles and returns the passing source", async () => {
    let calls = 0;
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async ({ cycle }: any) => { calls += 1; return { experience: `fixed-${cycle}`, styles: "fixed", motion: "fixed" }; },
      evaluate: async (files: any) => ({ pass: files.experience === "fixed-2", findings: files.experience === "fixed-2" ? [] : ["still generic"] }),
      maxCycles: 2,
    });
    expect(calls).toBe(2);
    expect(result.pass).toBe(true);
    expect(result.cyclesUsed).toBe(2);
  });

  it("fails closed after the retry budget", async () => {
    const result = await runCreativeRepairLoop({
      files: { experience: "old", styles: "old", motion: "old" },
      referenceDna: { familyId: "test" },
      generate: async () => ({ experience: "still-old", styles: "still-old", motion: "still-old" }),
      evaluate: async () => ({ pass: false, findings: ["not fixed"] }),
      maxCycles: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.cyclesUsed).toBe(2);
  });
});
