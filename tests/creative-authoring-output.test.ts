import { describe, expect, it } from "vitest";
import {
  AUTHORING_STAGE_BUDGETS,
  authoringCompletionDiagnostics,
  completionLimitRequestField,
  referenceImplementationChecklist,
} from "../scripts/creative-authoring-output.mjs";

describe("creative authoring output budgets", () => {
  it("uses OpenRouter's current completion limit request field", () => {
    expect(completionLimitRequestField(48000)).toEqual({
      max_completion_tokens: 48000,
    });
    expect(() => completionLimitRequestField(0)).toThrow(
      /positive integer/u,
    );
  });

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

  it("prints required section anchors and the assigned marker order explicitly", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "image chapter", "magazine archive", "contact"],
    });

    expect(checklist).toContain('id="services"');
    expect(checklist).toContain('id="faqs"');
    expect(checklist).toContain('id="contact"');
    expect(checklist.indexOf('data-reference-section="hero"')).toBeLessThan(
      checklist.indexOf('data-reference-section="image-chapter"'),
    );
    expect(checklist.indexOf('data-reference-section="image-chapter"')).toBeLessThan(
      checklist.indexOf('data-reference-section="magazine-archive"'),
    );
    expect(checklist).toContain("semantically matching section");
  });

  it("rejects empty or colliding normalized section marker IDs", () => {
    expect(() =>
      referenceImplementationChecklist({
        sectionSequence: ["hero", "!!!", "contact"],
      }),
    ).toThrow(/unique, non-empty marker IDs/u);
    expect(() =>
      referenceImplementationChecklist({
        sectionSequence: ["hero", "Hero", "contact"],
      }),
    ).toThrow(/unique, non-empty marker IDs/u);
  });
});
