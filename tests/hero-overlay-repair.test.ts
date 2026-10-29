import { describe, expect, it } from "vitest";
import {
  HERO_OVERLAY_CORRECTION_END,
  HERO_OVERLAY_CORRECTION_START,
  heroOverlayRepairCss,
  withHeroOverlayCorrection,
} from "../scripts/hero-overlay-repair.mjs";

describe("hero overlay correction", () => {
  it("keeps the image full-bleed and the copy compact and floating", () => {
    const css = heroOverlayRepairCss();
    expect(css).toContain(HERO_OVERLAY_CORRECTION_START);
    expect(css).toContain("[data-hero-media]");
    expect(css).toContain("object-fit: cover");
    expect(css).toContain("[data-hero-copy]");
    expect(css).toContain("max-width: 34rem");
    expect(css).toContain("border: 0");
    expect(css).toContain("background: #0b1511");
    expect(css).toContain("@media (max-width: 767px)");
  });

  it("replaces the managed block without duplicating it", () => {
    const first = withHeroOverlayCorrection("body { color: #111; }");
    const second = withHeroOverlayCorrection(first);
    expect(second).toBe(first);
    expect(second.split(HERO_OVERLAY_CORRECTION_START)).toHaveLength(2);
    expect(second).toContain("body { color: #111; }");
  });

  it("removes a stale managed block before appending the current one", () => {
    const stale = `body { color: #111; }\n${HERO_OVERLAY_CORRECTION_START}\nold{}\n${HERO_OVERLAY_CORRECTION_END}\n`;
    const repaired = withHeroOverlayCorrection(stale);
    expect(repaired).not.toContain("old{}");
    expect(repaired).toContain(HERO_OVERLAY_CORRECTION_START);
    expect(repaired).toContain("body { color: #111; }");
  });
});
