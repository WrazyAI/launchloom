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

describe("render CLI session precedence", () => {
  it("does not let a saved session override the pinned model", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      "scripts/run-rendered-creative-repair.mjs",
      "utf8",
    );
    const main = source.slice(source.indexOf("async function main()"));
    // The CLI must forward only an explicit --model flag; resolving the
    // session model into `model` made it outrank the environment pin.
    expect(main).toMatch(/model:\s*args\.model,/u);
    expect(main).not.toMatch(/model:\s*\n?\s*args\.model\s*\|\|/u);
  });
});
