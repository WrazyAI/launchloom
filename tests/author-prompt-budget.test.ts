import { describe, expect, it } from "vitest";
import {
  assertModelPromptTextBudget,
  formatModelBoundContentShape,
} from "../scripts/author-prompt-budget.mjs";

describe("model-bound author prompt budget", () => {
  it("redacts inline image data from content shape without changing sealed values", () => {
    const original = {
      hero: {
        image: `data:image/webp;base64,${"A".repeat(800_000)}`,
        caption: "Verified client-provided hero image",
      },
    };

    const formatted = formatModelBoundContentShape(original);

    expect(formatted).not.toContain("data:image/webp;base64,");
    expect(formatted).not.toContain("A".repeat(1_000));
    expect(JSON.parse(formatted)).toEqual({
      hero: {
        image: "[sealed client image asset]",
        caption: "Verified client-provided hero image",
      },
    });
    expect(original.hero.image).toContain("data:image/webp;base64,");
    expect(original.hero.image).toHaveLength(800_023);
  });

  it("redacts parameterized image data URIs", () => {
    expect(
      formatModelBoundContentShape({
        mark: "data:image/svg+xml;charset=utf-8;base64,PHN2Zz4=",
      }),
    ).toContain("[sealed client image asset]");
  });

  it("rejects image data in textual prompt parts but permits multimodal image parts", () => {
    expect(() =>
      assertModelPromptTextBudget([
        { type: "text", text: "data:image/png;base64,AAAA" },
      ]),
    ).toThrow(/image data URI leaked into text/iu);

    expect(() =>
      assertModelPromptTextBudget([
        { type: "text", text: "Use supplied evidence." },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
      ]),
    ).not.toThrow();
  });

  it("rejects an oversized textual prompt locally", () => {
    expect(() =>
      assertModelPromptTextBudget(
        [{ type: "text", text: "x".repeat(400_001) }],
        400_000,
      ),
    ).toThrow(/exceeds the 400000 character safety budget/iu);
  });
});
