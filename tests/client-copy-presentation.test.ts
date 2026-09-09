import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client copy presentation", () => {
  it("uses a human invitation for the assistant launcher", async () => {
    const component = await fs.readFile(
      "templates/client-site/src/components/QuickAnswers.astro",
      "utf8",
    );
    expect(component).toContain('const assistantLabel = "Got questions?"');
    expect(component).not.toContain('ai?.label || "AI answers"');
  });

  it("does not decorate service or trust cards with ordinal numbers", async () => {
    const component = await fs.readFile(
      "templates/client-site/src/components/PageSections.astro",
      "utf8",
    );
    expect(component).not.toMatch(/service-card[^\n]+0\{index \+ 1\}/);
    expect(component).not.toMatch(/trust-grid[^\n]+0\{index \+ 1\}/);
  });
});
