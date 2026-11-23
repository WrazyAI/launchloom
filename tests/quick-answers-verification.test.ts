import { describe, expect, it } from "vitest";
import { quickAnswersInteraction } from "../scripts/quick-answers-verification.mjs";

describe("quick answers verification mode", () => {
  it("interacts when the launcher is visible and active", () => {
    expect(
      quickAnswersInteraction({
        launcherVisible: true,
        inert: false,
        colliding: false,
      }),
    ).toBe("interact");
  });

  it("rejects a launcher that disappears even when the corner is blocked", () => {
    expect(
      quickAnswersInteraction({
        launcherVisible: false,
        inert: true,
        colliding: true,
      }),
    ).toBe("invalid");
  });

  it("interacts with the inline fallback when the corner is blocked", () => {
    expect(quickAnswersInteraction({
      launcherVisible: true,
      inert: false,
      colliding: true,
    })).toBe("interact");
  });

  it.each([
    [
      "hidden without collision",
      { launcherVisible: false, inert: false, colliding: false },
    ],
    [
      "hidden with collision but still interactive",
      { launcherVisible: false, inert: false, colliding: true },
    ],
    [
      "visible but inert",
      { launcherVisible: true, inert: true, colliding: true },
    ],
  ])("rejects %s", (_label, state) => {
    expect(quickAnswersInteraction(state)).toBe("invalid");
  });
});
