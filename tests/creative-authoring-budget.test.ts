import { describe, expect, it } from "vitest";
import {
  authorStageMaxTokens,
  describeAuthorResponseFailure,
} from "../scripts/creative-authoring-budget.mjs";

describe("creative author output budget", () => {
  it("reserves a larger completion budget for JSX without changing other stages", () => {
    expect(authorStageMaxTokens("experience")).toBe(18_000);
    expect(authorStageMaxTokens("styles")).toBe(8_000);
    expect(authorStageMaxTokens("contract")).toBe(4_000);
    expect(authorStageMaxTokens("motion")).toBe(3_500);
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
