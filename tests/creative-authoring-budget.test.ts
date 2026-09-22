import { describe, expect, it } from "vitest";
import {
  authorStageMaxTokens,
  authorStageTimeoutMs,
  describeAuthorResponseFailure,
} from "../scripts/creative-authoring-budget.mjs";

describe("creative author output budget", () => {
  it("leaves ample completion headroom below the model's 128k ceiling", () => {
    expect(authorStageMaxTokens("experience")).toBe(64_000);
    expect(authorStageMaxTokens("styles")).toBe(48_000);
    expect(authorStageMaxTokens("contract")).toBe(16_000);
    expect(authorStageMaxTokens("motion")).toBe(32_000);
  });

  it("allows xhigh source and motion stages enough time to finish beyond 90 seconds", () => {
    expect(authorStageTimeoutMs("contract")).toBe(180_000);
    expect(authorStageTimeoutMs("experience")).toBe(240_000);
    expect(authorStageTimeoutMs("styles")).toBe(240_000);
    expect(authorStageTimeoutMs("motion")).toBe(240_000);
  });

  it("reports the reasoning and completion usage when a provider truncates a response", () => {
    expect(
      describeAuthorResponseFailure({
        stage: "experience",
        routeId: "route-01",
        payload: {
          choices: [
            {
              finish_reason: "length",
              message: { content: null },
            },
          ],
          usage: {
            completion_tokens: 9_000,
            completion_tokens_details: { reasoning_tokens: 8_100 },
          },
        },
      }),
    ).toBe(
      "OpenRouter experience response for route-01 was truncated (finish_reason=length, completion_tokens=9000, reasoning_tokens=8100, content_chars=0).",
    );
  });
});
