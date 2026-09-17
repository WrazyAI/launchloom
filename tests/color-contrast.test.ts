import { describe, expect, it } from "vitest";
import { contrast, parseCssColor } from "../scripts/color-contrast.mjs";
import { resolvePalette } from "../scripts/palette-policy.mjs";

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
