import { describe, expect, it } from "vitest";
import { assertAuthorPromptBudget } from "../scripts/author-prompt-budget.mjs";

describe("creative author prompt budget", () => {
  it("rejects image data URIs accidentally serialized inside text blocks", () => {
    expect(() => assertAuthorPromptBudget([
      { role: "user", content: [{ type: "text", text: "sealed image: data:image/webp;base64,AAAA" }] },
    ])).toThrow(/inline image data URI.*text/iu);
  });

  it("rejects percent-encoded non-base64 image data URIs in text blocks", () => {
    expect(() => assertAuthorPromptBudget([
      {
        role: "user",
        content: [{ type: "text", text: "client asset: data:image/svg+xml;charset=utf-8,%3Csvg%3E" }],
      },
    ])).toThrow(/inline image data URI.*text/iu);
  });

  it("rejects textual author context beyond its safe character budget", () => {
    expect(() => assertAuthorPromptBudget([
      { role: "user", content: [{ type: "text", text: "x".repeat(400_001) }] },
    ])).toThrow(/400000-character safety budget/iu);
  });

  it("allows bounded multimodal image parts while counting text separately", () => {
    expect(() => assertAuthorPromptBudget([
      {
        role: "user",
        content: [
          { type: "text", text: "Reference screenshot follows." },
          { type: "image_url", image_url: { url: `data:image/webp;base64,${"A".repeat(900_000)}`, detail: "low" } },
        ],
      },
    ])).not.toThrow();
  });
});
