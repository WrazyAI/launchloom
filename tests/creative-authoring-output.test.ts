import { describe, expect, it } from "vitest";
import {
  AUTHORING_STAGE_BUDGETS,
  authoringCompletionDiagnostics,
} from "../scripts/creative-authoring-output.mjs";

describe("creative authoring output budgets", () => {
  it("gives each authoring stage generous output and time headroom", () => {
    expect(AUTHORING_STAGE_BUDGETS).toEqual({
      contract: { maxTokens: 24000, timeoutMs: 300000 },
      experience: { maxTokens: 48000, timeoutMs: 480000 },
      styles: { maxTokens: 40000, timeoutMs: 480000 },
      motion: { maxTokens: 24000, timeoutMs: 300000 },
    });
  });

  it("reports a length-truncated stage without logging response content", () => {
    const diagnostics = authoringCompletionDiagnostics({
      stage: "experience",
      routeId: "route-01",
      maxTokens: AUTHORING_STAGE_BUDGETS.experience.maxTokens,
      payload: {
        choices: [
          { finish_reason: "length", message: { content: null } },
        ],
        usage: {
          completion_tokens: 48000,
          completion_tokens_details: { reasoning_tokens: 47980 },
        },
      },
      content: null,
    });

    expect(diagnostics).toEqual({
      stage: "experience",
      routeId: "route-01",
      finishReason: "length",
      maxTokens: 48000,
      completionTokens: 48000,
      reasoningTokens: 47980,
      contentChars: 0,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("content=");
  });
});
