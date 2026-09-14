import { describe, expect, it } from "vitest";
import {
  designFamilyForVariant,
  getDesignVariant,
  listDesignVariants,
  selectDesignVariant,
} from "../templates/client-site/src/lib/design-variants";
import { requestedDesignFamily } from "../scripts/generate-site-config.mjs";

describe("design variant registry", () => {
  it("provides nine stable variants for every recipe family", () => {
    const all = listDesignVariants();
    expect(all).toHaveLength(27);
    expect(new Set(all.map((variant) => variant.id))).toHaveLength(27);
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
      expect(listDesignVariants(recipe)).toHaveLength(9);
    }
  });

  it("keeps each descriptor complete and structurally coherent", () => {
    for (const variant of listDesignVariants()) {
      const types = variant.sections.map((section) => section.type);
      expect(types).toContain("hero");
      expect(types).toContain("services");
      expect(types).toContain("contact");
      expect(new Set(types).size).toBe(types.length);
      expect(variant.intent).not.toContain("—");
      expect(getDesignVariant(variant.id)).toBe(variant);
    }
  });

  it("selects reproducibly while distributing seeds across alternatives", () => {
    const first = selectDesignVariant("general-editorial", "Common Table");
    expect(selectDesignVariant("general-editorial", "Common Table").id).toBe(
      first.id,
    );
    const selected = new Set(
      Array.from(
        { length: 40 },
        (_, index) =>
          selectDesignVariant("general-editorial", `fixture-${index}`).id,
      ),
    );
    expect(selected.size).toBeGreaterThanOrEqual(7);
  });

  it("makes every registered direction reachable from intake-specific seeds", () => {
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
      const reachable = new Set(
        Array.from(
          { length: 200 },
          (_, index) =>
            selectDesignVariant(recipe, `intake-${index}|fixture`).id,
        ),
      );
      expect(reachable).toEqual(
        new Set(listDesignVariants(recipe).map((variant) => variant.id)),
      );
    }
  });

  it("routes explicit visual-family requests without crossing recipe families", () => {
    for (const recipe of [
      "care-editorial",
      "local-trades",
      "general-editorial",
    ] as const) {
      for (const family of [
        "image-mosaic",
        "cinematic-premium",
        "atmospheric-editorial",
        "project-showcase",
        "studio-minimal",
      ] as const) {
        const selected = selectDesignVariant(recipe, "fixed intake", family);
        expect(selected.recipe).toBe(recipe);
        expect(designFamilyForVariant(selected.id)).toBe(family);
      }
    }
  });

  it("prefers the specific cinematic editorial family over generic cinematic", () => {
    expect(
      requestedDesignFamily({ brandNotes: "A cinematic editorial direction" }),
    ).toBe("atmospheric-editorial");
    expect(
      requestedDesignFamily({ brandNotes: "A cinematic luxury direction" }),
    ).toBe("cinematic-premium");
  });
});
