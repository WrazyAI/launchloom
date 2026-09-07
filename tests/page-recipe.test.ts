import { describe, expect, it } from "vitest";
import { resolvePageRecipe } from "../templates/client-site/src/lib/page-recipe";

const site = {
  preset: "home-services",
  industry: "home-services",
  design: {
    recipe: "local-trades",
    sections: [],
  },
} as unknown as Parameters<typeof resolvePageRecipe>[0];

describe("page recipes", () => {
  it("uses the complete trades recipe for older or incomplete configurations", () => {
    const page = resolvePageRecipe(site);

    expect(page.recipe).toBe("local-trades");
    expect(page.sections.map((section) => section.type)).toEqual(
      expect.arrayContaining(["hero", "services", "coverage", "contact"]),
    );
  });

  it("accepts a bounded custom order with stable unique IDs", () => {
    const page = resolvePageRecipe({
      ...site,
      design: {
        recipe: "local-trades",
        sections: [
          { id: "opening", type: "hero", variant: "trades-split" },
          { id: "work", type: "services", variant: "problem-led" },
          { id: "questions", type: "faq", variant: "practical" },
          { id: "request", type: "contact", variant: "quote" },
        ],
      },
    });

    expect(page.sections.map((section) => section.id)).toEqual([
      "opening",
      "work",
      "questions",
      "request",
    ]);
  });

  it("falls back when configured IDs are unsafe or required sections are absent", () => {
    const page = resolvePageRecipe({
      ...site,
      design: {
        recipe: "local-trades",
        sections: [
          { id: "bad id", type: "hero", variant: "trades-split" },
          { id: "work", type: "services", variant: "problem-led" },
        ],
      },
    });

    expect(page.sections[0].id).toBe("service-opening");
    expect(page.sections.at(-1)?.type).toBe("contact");
  });
});
