import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTHOR_PROMPT_TEXT_LIMIT,
  assertAuthorPromptContext,
} from "../scripts/author-prompt-budget.mjs";

describe("creative author prompt budget", () => {
  it("accepts bounded text plus multimodal image parts", () => {
    expect(
      assertAuthorPromptContext("system", [
        { type: "text", text: "route context" },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64,not-counted-as-text-content",
            detail: "low",
          },
        },
        { type: "text", text: "stage work" },
      ]),
    ).toEqual({
      textChars: "system".length + "route context".length + "stage work".length,
    });
  });

  it("rejects every inline image data URI form embedded in prompt text", () => {
    const imageUris = [
      "data:image/webp;base64,AAAA",
      "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E",
      "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    ];

    for (const imageUri of imageUris)
      expect(() =>
        assertAuthorPromptContext("system", [
          {
            type: "text",
            text: `SEALED CONTENT SHAPE\n${imageUri}`,
          },
        ]),
      ).toThrow(/inline image data URI/iu);
  });

  it("rejects unexpectedly large textual authoring context", () => {
    expect(() =>
      assertAuthorPromptContext("system", [
        {
          type: "text",
          text: "x".repeat(DEFAULT_AUTHOR_PROMPT_TEXT_LIMIT + 1),
        },
      ]),
    ).toThrow(/unexpectedly reached/iu);
  });
});
