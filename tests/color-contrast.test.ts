import { describe, expect, it } from "vitest";
import { contrast, parseCssColor } from "../scripts/color-contrast.mjs";
import {
  resolvePalette,
  rotateHue,
  semanticColorCss,
  suggestAccentColors,
} from "../scripts/palette-policy.mjs";

describe("rendered CSS color contrast", () => {
  it("parses Chromium color(srgb) channels as normalized values", () => {
    expect(parseCssColor("color(srgb 0.564706 0.307765 0.228706)")).toEqual(
      expect.arrayContaining([144, 78, 58]),
    );
    expect(
      contrast("rgb(0, 0, 0)", "color(srgb 0.564706 0.307765 0.228706)"),
    ).toBeLessThan(4.5);
  });

  it("confirms the undarkened client brand remains accessible with black text", () => {
    expect(contrast("rgb(0, 0, 0)", "rgb(200, 109, 81)")).toBeGreaterThan(4.5);
  });

  it("continues to parse ordinary rgb and rgba colors", () => {
    expect(parseCssColor("rgb(200, 109, 81)")).toEqual([200, 109, 81]);
    expect(parseCssColor("rgba(200, 109, 81, 0.8)")).toEqual([200, 109, 81]);
  });

  it("keeps neon brand colors as accents without using them as glaring surfaces", () => {
    const palette = resolvePalette({ primaryColor: "#d4ff00" });

    expect(palette.primaryColor).toBe("#d4ff00");
    expect(palette.brandSurfaceColor).not.toBe("#d4ff00");
    expect(
      contrast(palette.brandSurfaceTextColor, palette.brandSurfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(palette.brandTextColor, palette.surfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("repairs mid-tone brand surfaces that miss AA with both black and white", () => {
    const palette = resolvePalette({ primaryColor: "#9b7137" });
    expect(
      contrast(palette.brandSurfaceTextColor, palette.brandSurfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// These cases catch falsely passing unknown/transparent colors and explicit
// client text choices escaping the policy, independently of component classes.
describe("complete semantic contrast policy", () => {
  it("never treats an unsupported color as black", () => {
    expect(Number.isNaN(contrast("not-a-color", "#ffffff"))).toBe(true);
  });
  it("does not treat translucent black as opaque readable black", () => {
    expect(contrast("rgba(0, 0, 0, 0.1)", "#ffffff")).toBeLessThan(1.3);
  });
  it("refuses a translucent background without a known backdrop", () => {
    expect(Number.isNaN(contrast("#000000", "rgba(255,255,255,0.1)"))).toBe(
      true,
    );
  });
  it.each([
    ["#ffffff", "#f8f6f0"],
    ["#e8d590", "#ffffff"],
    ["#14201d", "#18211e"],
  ])(
    "repairs supplied text %s on surface %s while preserving brand",
    (ink, surface) => {
      const palette = resolvePalette({
        primaryColor: "#e8d590",
        surfaceColor: surface,
        inkColor: ink,
        mutedColor: ink,
      });
      expect(palette.primaryColor).toBe("#e8d590");
      expect(
        contrast(palette.inkColor, palette.surfaceColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(palette.mutedColor, palette.surfaceColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(resolvePalette(palette)).toEqual(palette);
    },
  );
  it("pairs every local surface with readable body, muted, link and action colors", () => {
    const palette = resolvePalette({
      primaryColor: "#e8d590",
      surfaceColor: "#ffffff",
      heroColor: "#18211e",
      inkColor: "#f8f6f0",
    });
    expect(palette).toHaveProperty("surfaces");
    for (const roles of Object.values(palette.surfaces)) {
      for (const key of ["text", "mutedText", "link"] as const)
        expect(contrast(roles[key], roles.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(roles.onAction, roles.action)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(roles.focus, roles.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("optional accent color", () => {
  it("keeps accent tokens absent so existing sites keep their palette shape", () => {
    const palette = resolvePalette({ primaryColor: "#205d51" });
    expect(palette).not.toHaveProperty("accentColor");
    expect(palette).not.toHaveProperty("accentTextColor");
    expect(palette).not.toHaveProperty("accentContrastColor");
  });

  it("derives readable accent text and fill pairs", () => {
    const palette = resolvePalette({
      primaryColor: "#205d51",
      accentColor: "#C86D51",
    });
    expect(palette.accentColor).toBe("#c86d51");
    expect(
      contrast(palette.accentTextColor, palette.surfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(palette.accentContrastColor, palette.accentColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(resolvePalette(palette)).toEqual(palette);
  });

  it("repairs a light accent used as text on a light surface", () => {
    const palette = resolvePalette({
      primaryColor: "#205d51",
      accentColor: "#f4e2a1",
    });
    expect(palette.accentColor).toBe("#f4e2a1");
    expect(
      contrast(palette.accentTextColor, palette.surfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("derives readable accent variants for hero, brand, and dark surfaces", () => {
    const palette = resolvePalette({
      primaryColor: "#205d51",
      accentColor: "#f4e2a1",
    });
    expect(
      contrast(palette.accentMarkColor, palette.surfaceColor),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(palette.accentTextHero, palette.heroColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(palette.accentTextBrand, palette.brandSurfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(palette.accentTextDark, "#14201d"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(resolvePalette(palette)).toEqual(palette);
  });

  it("keeps the accent readable on the light pack and inner bands", () => {
    const palette = resolvePalette({
      primaryColor: "#205d51",
      accentColor: "#f4e2a1",
    });
    for (const band of ["#f7f5ee", "#f6f3eb", "#e7e2d7", "#eef1ea"])
      expect(
        contrast(palette.accentTextLightBand, band),
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("emits surface accent roles only when an accent is chosen", () => {
    const plain = semanticColorCss({ primaryColor: "#205d51" });
    expect(plain).not.toContain("--ll-accent-text:");
    const withAccent = semanticColorCss({
      primaryColor: "#205d51",
      accentColor: "#f4e2a1",
    });
    expect(withAccent).toContain('[data-ll-surface="contact"]');
    expect(withAccent).toContain("--ll-accent-text:");
    expect(withAccent).toContain("--ll-accent:");
  });

  it("suggests deterministic complementary accents", () => {
    const suggestions = suggestAccentColors("#205d51");
    expect(suggestions).toHaveLength(3);
    expect(new Set(suggestions).size).toBe(3);
    for (const color of suggestions)
      expect(color).toMatch(/^#[0-9a-f]{6}$/u);
    expect(suggestAccentColors("#205d51")).toEqual(suggestions);
    expect(suggestAccentColors("#c86d51")).not.toEqual(suggestions);
    expect(() => rotateHue("not-a-color", 180)).toThrow(
      /parseable color/iu,
    );
  });
});
