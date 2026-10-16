import { describe, expect, it } from "vitest";
import {
  classifyFailureLine,
  splitFailureLines,
} from "../scripts/creative-gate-severity.mjs";

describe("creative gate severity classification", () => {
  it.each([
    ["rendered-reference: The opening is a flat pale-sage field", "open"],
    [
      "rendered composition: Split-media topology requires a substantial visible hero image.",
      "open",
    ],
    [
      "mobile: rendered composition: Media-overlay topology requires an image field occupying a substantial part of the hero.",
      "open",
    ],
    ["source: Missing required signature editorial-monument.", "hard"],
    ["repaired source: The authored section sequence is off.", "hard"],
    [
      "contrast fail: / desktop default body > main (1.200; required 4.5)",
      "hard",
    ],
    [
      "contrast unresolved: / desktop default body > main (unresolved; required 4.5); foreground unknown, background variable; filter, blend",
      "open",
    ],
    ["desktop: horizontal overflow", "hard"],
    ["mobile: hero exceeds desktop viewport", "hard"],
    ["compact: broken image", "hard"],
    ["desktop: browser error", "hard"],
    ["desktop: expected one h1", "hard"],
    ["desktop: missing services section", "hard"],
    ["desktop: missing required fragment target", "hard"],
    ["desktop: navigation does not expose required targets", "hard"],
    ["desktop: image is missing alt text", "hard"],
    ["desktop: interactive control has no accessible name", "hard"],
    ["desktop: em dash found", "hard"],
    ["service-page mobile: horizontal overflow", "hard"],
    [
      "service-page mobile: supported page brief content is missing after hydration.",
      "open",
    ],
    ["an entirely new failure format", "hard"],
    ["", "hard"],
    [undefined, "hard"],
  ])("classifies %j as %s", (line, expected) => {
    expect(classifyFailureLine(line)).toBe(expected);
  });

  it("splits failure lists without reordering", () => {
    const { hard, open } = splitFailureLines([
      "desktop: horizontal overflow",
      "rendered-reference: composition drift",
      "contrast unresolved: / mobile (unresolved; required 4.5)",
      "mobile: hero exceeds desktop viewport",
    ]);
    expect(hard).toEqual([
      "desktop: horizontal overflow",
      "mobile: hero exceeds desktop viewport",
    ]);
    expect(open).toEqual([
      "rendered-reference: composition drift",
      "contrast unresolved: / mobile (unresolved; required 4.5)",
    ]);
  });
});
