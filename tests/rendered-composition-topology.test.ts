import { describe, expect, it } from "vitest";
import { validateRenderedCompositionTopology } from "../scripts/rendered-composition-topology.mjs";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

describe("rendered composition topology", () => {
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

  it("skips only an explicitly unclassified reference topology", () => {
    expect(
      validateRenderedCompositionTopology(
        { hero: "unclassified" },
        { hero: box(0, 0, 1000, 600), copy: [], media: [] },
      ),
    ).toMatchObject({ pass: true, skipped: true });
  });
});
