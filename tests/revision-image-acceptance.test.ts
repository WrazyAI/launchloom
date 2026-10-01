import { describe, expect, it } from "vitest";
import { revisionImageMatches } from "../scripts/revision-image-acceptance.mjs";

const page = "https://example.pages.dev/";
const path = "/images/feedback/hero-abc123def456.webp";
const artifact = { type: "image", target: "hero", path };
const image = { src: `${page.slice(0, -1)}${path}`, placement: "section jg-hero illustrated-centered-hero", visible: true, naturalWidth: 1200, naturalHeight: 800 };

describe("rendered revision image acceptance", () => {
  it("requires the exact loaded image in the requested section", () => {
    expect(revisionImageMatches(image, artifact, page)).toBe(true);
    expect(revisionImageMatches({ ...image, placement: "section about" }, artifact, page)).toBe(false);
    expect(revisionImageMatches({ ...image, src: `${image.src}.old` }, artifact, page)).toBe(false);
    expect(revisionImageMatches({ ...image, src: `https://other.test${path}` }, artifact, page)).toBe(false);
  });
  it("rejects hidden, broken and review-thumbnail images", () => {
    expect(revisionImageMatches({ ...image, visible: false }, artifact, page)).toBe(false);
    expect(revisionImageMatches({ ...image, naturalWidth: 0 }, artifact, page)).toBe(false);
    expect(revisionImageMatches({ ...image, placement: "" }, artifact, page)).toBe(false);
  });
  it("also checks client replacement assets in their requested placement", () => {
    const url = "https://assets.launchloom.wrazyos.com/client-replacements/juniper/hero.webp";
    expect(revisionImageMatches({ ...image, src: url }, { type: "asset", placement: "hero", url }, page)).toBe(true);
    expect(revisionImageMatches({ ...image, src: url, placement: "section gallery" }, { type: "asset", placement: "hero", url }, page)).toBe(false);
  });
});

it("distinguishes image variants and skips unmarked nested containers", () => {
  expect(revisionImageMatches({ ...image, src: `${image.src}?variant=old` }, artifact, page)).toBe(false);
  expect(revisionImageMatches({ ...image, placement: undefined, placements: ["section media-frame", "section jg-hero illustrated-centered-hero"] }, artifact, page)).toBe(true);
});
