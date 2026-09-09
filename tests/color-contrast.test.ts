import { describe, expect, it } from "vitest";
import { contrast, parseCssColor } from "../scripts/color-contrast.mjs";

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
    expect(contrast("rgb(0, 0, 0)", "rgb(200, 109, 81)")).toBeGreaterThan(
      4.5,
    );
  });

  it("continues to parse ordinary rgb and rgba colors", () => {
    expect(parseCssColor("rgb(200, 109, 81)")).toEqual([200, 109, 81]);
    expect(parseCssColor("rgba(200, 109, 81, 0.8)")).toEqual([200, 109, 81]);
  });
});
