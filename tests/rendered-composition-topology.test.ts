import { describe, expect, it } from "vitest";
import {
  CSS_IMAGE_URL_PATTERN,
  validateRenderedCompositionTopology,
} from "../scripts/rendered-composition-topology.mjs";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe("rendered composition topology", () => {
  it("counts CSS image URLs as media but not gradient-only fills", () => {
    expect(CSS_IMAGE_URL_PATTERN.test("linear-gradient(90deg, #123, #456)")).toBe(false);
    expect(CSS_IMAGE_URL_PATTERN.test('linear-gradient(#0008, #0008), url("/hero.webp")')).toBe(true);
  });

  it("rejects a split-hero declaration when the rendered copy and image overlap", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "split-media" },
      {
        hero: box(0, 0, 1000, 600),
        copy: [box(80, 100, 420, 260)],
        media: [{ container: box(0, 0, 1000, 600), visuals: [box(0, 0, 1000, 600)] }],
      },
    );

    expect(result.pass).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "split-media-relationship",
    );
  });

  it("rejects a media-overlay declaration when the image is only adjacent to copy", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "media-overlay" },
      {
        hero: box(0, 0, 1000, 600),
        copy: [box(80, 100, 360, 260)],
        media: [{ container: box(560, 60, 400, 480), visuals: [box(560, 60, 400, 480)] }],
      },
    );

    expect(result.pass).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "media-overlay-relationship",
    );
  });

  it("passes when measured boxes match the assigned adjacent split topology", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "split-media" },
      {
        hero: box(0, 0, 1000, 600),
        copy: [box(60, 100, 390, 330)],
        media: [{ container: box(540, 60, 410, 480), visuals: [box(540, 60, 410, 480)] }],
      },
    );

    expect(result.pass).toBe(true);
    expect(result.measured?.visibleMediaImageCount).toBe(1);
  });

  it("rejects a substantial adjacent image that turns a type-led statement into split-media", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "type-led-statement" },
      {
        hero: box(0, 0, 1536, 420),
        copy: [box(128, 92, 620, 260)],
        media: [
          {
            container: box(960, 30, 460, 360),
            visuals: [box(960, 30, 460, 360)],
          },
        ],
      },
    );

    expect(result.pass).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "type-led-split-media",
    );
  });

  it("allows a small non-dominant accent image in a type-led statement", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "type-led-statement" },
      {
        hero: box(0, 0, 1000, 600),
        copy: [box(80, 110, 610, 280)],
        media: [
          {
            container: box(800, 90, 120, 120),
            visuals: [box(800, 90, 120, 120)],
          },
        ],
      },
    );

    expect(result.pass).toBe(true);
  });

  it("validates the mobile-specific composition instead of reusing desktop topology", () => {
    const result = validateRenderedCompositionTopology(
      { hero: "split-media", mobileHero: "editorial-stack" },
      {
        hero: box(0, 0, 390, 800),
        copy: [box(24, 36, 342, 230)],
        media: [{ container: box(24, 320, 342, 360), visuals: [box(24, 320, 342, 360)] }],
      },
      { viewportKind: "mobile" },
    );

    expect(result).toMatchObject({ pass: true, expectedHero: "editorial-stack", viewportKind: "mobile" });
  });

  it("skips only an explicitly unclassified reference topology", () => {
    expect(
      validateRenderedCompositionTopology(
        { hero: "unclassified" },
        { hero: box(0, 0, 1000, 600), copy: [], media: [] },
      ),
    ).toMatchObject({ pass: true, skipped: true });
  });
});
