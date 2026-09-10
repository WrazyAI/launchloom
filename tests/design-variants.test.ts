import { describe, expect, it } from "vitest";
import {
  getDesignVariant,
  listDesignVariants,
  selectDesignVariant,
} from "../templates/client-site/src/lib/design-variants";

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
});
