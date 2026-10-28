import { describe, expect, it } from "vitest";
import {
  parseRenderer,
  summariseRuns,
} from "../scripts/generation-success-rate.mjs";

describe("generation success rate", () => {
  it("groups runs by the renderer in the run name", () => {
    const summary = summariseRuns([
      {
        displayTitle:
          "LLGEN issue=1 profile=full renderer=foundation request=none",
        conclusion: "success",
      },
      {
        displayTitle:
          "LLGEN issue=2 profile=full renderer=foundation request=none",
        conclusion: "failure",
      },
      {
        displayTitle: "LLGEN issue=3 profile=full renderer=pack request=none",
        conclusion: "success",
      },
      {
        displayTitle: "LLGEN issue=4 profile=full renderer=pack request=none",
        conclusion: "cancelled",
      },
    ]);
    expect(
      summary.find((entry) => entry.renderer === "foundation"),
    ).toMatchObject({ total: 2, success: 1, failure: 1, successRate: 50 });
    expect(summary.find((entry) => entry.renderer === "pack")).toMatchObject({
      total: 2,
      success: 1,
      cancelled: 1,
      successRate: 50,
    });
  });

  it("reports unknown when an older run name has no renderer", () => {
    expect(parseRenderer("LLGEN issue=1 profile=full request=none")).toBe(
      "unknown",
    );
  });
});
