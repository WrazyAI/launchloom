import { describe, expect, it } from "vitest";
import { resolveCodeAuthoringModel } from "../scripts/run-rendered-creative-repair.mjs";

describe("creative render model resolution", () => {
  it("prefers the pinned environment model over a stale session model", () => {
    expect(
      resolveCodeAuthoringModel({
        sessionModel: "openai/gpt-6-luna",
        envModel: "deepseek/deepseek-v4.1-flash",
      }),
    ).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("keeps the session model when no environment pin exists", () => {
    expect(
      resolveCodeAuthoringModel({
        sessionModel: "opencode-go/deepseek-v4.1-flash",
        envModel: "",
      }),
    ).toBe("opencode-go/deepseek-v4.1-flash");
  });

  it("uses an explicit requested model first", () => {
    expect(
      resolveCodeAuthoringModel({
        requested: "opencode-go/deepseek-v4.1-flash",
        sessionModel: "openai/gpt-6-luna",
        envModel: "deepseek/deepseek-v4.1-flash",
      }),
    ).toBe("opencode-go/deepseek-v4.1-flash");
  });
});
