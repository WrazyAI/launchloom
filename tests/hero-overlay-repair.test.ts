import { describe, expect, it } from "vitest";
import {
  HERO_OVERLAY_CORRECTION_END,
  HERO_OVERLAY_CORRECTION_START,
  MEDIA_FOCUS_CORRECTION_END,
  MEDIA_FOCUS_CORRECTION_START,
  heroOverlayRepairCss,
  mediaFocusRepairCss,
  withHeroOverlayCorrection,
  withMediaFocusCorrection,
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
    expect(css).toContain("background: transparent");
    expect(css).toContain("linear-gradient");
    expect(css).toContain("@media (max-width: 767px)");
  });

  it("does not paint the copy group as an opaque plate", () => {
    const css = heroOverlayRepairCss();
    const start = css.indexOf("[data-hero-copy] {");
    const copyRule = css.slice(start, css.indexOf("}", start) + 1);
    expect(copyRule).not.toContain("background: #0b1511");
    expect(css).toContain("[data-hero]::after");
  });

  it("clears the media caption that contains the copy group", () => {
    const css = heroOverlayRepairCss();
    expect(css).toContain(
      "[data-hero-media] figcaption:has([data-hero-copy])",
    );
    expect(css).toContain("background-color: transparent");
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

describe("media focus plate correction", () => {
  it("paints an opaque plate with an inset light focus ring", () => {
    const css = mediaFocusRepairCss();
    expect(css).toContain(MEDIA_FOCUS_CORRECTION_START);
    expect(css).toContain("[data-hero] :is(a, button, summary):focus-visible");
    expect(css).toContain("background: #0b1511 !important");
    expect(css).toContain("outline: 2px solid #f7f3e8 !important");
    expect(css).toContain("outline-offset: -3px !important");
  });

  it("gives developer-preview form notes a light plate", () => {
    const css = mediaFocusRepairCss();
    expect(css).toContain('body[data-ll-route^="/services"] form small');
    expect(css).toContain("background: #f7f3e8 !important");
    expect(css).toContain("color: #14201d !important");
  });

  it("anchors the homepage heading to the inner-page display token", () => {
    const css = mediaFocusRepairCss();
    expect(css).toContain('body[data-ll-route="/"] [data-hero] h1');
    expect(css).toContain("font-family: var(--ll-creative-display");
    expect(css).toContain("font-weight: 400 !important");
  });

  it("anchors inner-page headings to the same token", () => {
    const css = mediaFocusRepairCss();
    expect(css).toContain('body[data-ll-route^="/services"] h1');
    expect(css).toContain('body[data-ll-route^="/locations"] h1');
    expect(css).toContain("font-weight: 400 !important");
  });

  it("gives form controls an opaque focus pair", () => {
    const css = mediaFocusRepairCss();
    expect(css).toContain("form :is(input, textarea, select):focus-visible");
    expect(css).toContain("background-color: #f8f6f0 !important");
    expect(css).toContain("outline: 2px solid #14201d !important");
    expect(css).toContain("outline-offset: -4px !important");
  });

  it("replaces the managed block without duplicating it", () => {
    const first = withMediaFocusCorrection("body { color: #111; }");
    const second = withMediaFocusCorrection(first);
    expect(second).toBe(first);
    expect(second.split(MEDIA_FOCUS_CORRECTION_START)).toHaveLength(2);
    expect(second).toContain("body { color: #111; }");
  });
});
