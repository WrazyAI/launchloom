import { describe, expect, it } from "vitest";
import {
  darkenToContrast,
  parseFlatContrastFindings,
  repairFlatContrastCss,
  wcagContrast,
} from "../scripts/flat-contrast-repair.mjs";

function flatFinding(overrides: Record<string, unknown> = {}) {
  return {
    status: "fail",
    kind: "text",
    state: "focus",
    route: "/services/wholesale-coffee/",
    viewport: "mobile",
    selector:
      "body > main:nth-of-type(1) > section:nth-of-type(4) > a:nth-of-type(2) > span:nth-of-type(2)",
    text: "For brewing at home, choose whole-bean coffee.",
    foreground: [107, 113, 109, 1],
    backgrounds: [[236, 231, 220, 1]],
    color: "#6b716d",
    background: "#ece7dc",
    ratio: 4.047,
    minimum: 4.5,
    variable: false,
    issues: [],
    ...overrides,
  };
}

describe("flat contrast repair", () => {
  it("measures the failing muted pair and a passing replacement", () => {
    expect(wcagContrast("#6b716d", "#ece7dc")).toBeCloseTo(4.047, 3);
    expect(wcagContrast("#646966", "#ece7dc")).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast("#646966", "#ece7dc")).toBeCloseTo(4.536, 3);
  });

  it("darkens a flat muted foreground until it passes without changing hue", () => {
    const repaired = darkenToContrast("#6b716d", "#ece7dc", 4.5);
    expect(repaired).toBe("#646966");
    expect(repaired).toMatch(/^#[0-9a-f]{6}$/u);
    expect(wcagContrast(repaired, "#ece7dc")).toBeGreaterThanOrEqual(4.5);
    expect(repaired).not.toBe("#6b716d");
    // Green remains the dominant channel: the repair darkens the authored
    // muted green instead of replacing it with neutral black.
    expect(parseInt(repaired.slice(3, 5), 16)).toBeGreaterThan(
      parseInt(repaired.slice(1, 3), 16),
    );
  });

  it("accepts a flat focus-state text finding", () => {
    const pairs = parseFlatContrastFindings([flatFinding()]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      route: "/services/wholesale-coffee/",
      viewport: "mobile",
      state: "focus",
      foreground: "#6b716d",
      background: "#ece7dc",
      required: 4.5,
    });
  });

  it("ignores variable backgrounds and overlapping-surface findings", () => {
    expect(
      parseFlatContrastFindings([
        flatFinding({ variable: true }),
        flatFinding({ backgrounds: [[236, 231, 220, 1], [20, 32, 29, 1]] }),
        flatFinding({
          issues: ["overlapping non-ancestor paint requires rendered review"],
        }),
        flatFinding({ status: "pass" }),
        flatFinding({ background: null }),
      ]),
    ).toEqual([]);
  });

  it("replaces only the exact authored text color and is bounded", () => {
    const css = [
      ".intro-body { color: #6b716d; }",
      ".service-note { color: #6b716d; background: #6b716d; }",
      ".unrelated { color: #14201d; }",
    ].join("\n");
    const repaired = repairFlatContrastCss(css, [
      {
        foreground: "#6b716d",
        background: "#ece7dc",
        required: 4.5,
        state: "focus",
      },
    ]);
    expect(repaired.css).toContain(".intro-body { color: ");
    expect(repaired.css).not.toContain("color: #6b716d");
    // Background paint is not a text color and must survive untouched.
    expect(repaired.css).toContain("background: #6b716d");
    expect(repaired.css).toContain(".unrelated { color: #14201d; }");
    expect(repaired.edits).toHaveLength(1);
    expect(repaired.edits[0].count).toBe(2);
  });

  it("does not cascade one replacement into another token", () => {
    const css = ".a { color: #6b716d; } .b { color: #646966; }";
    const repaired = repairFlatContrastCss(css, [
      { foreground: "#6b716d", background: "#ece7dc", required: 4.5 },
      { foreground: "#646966", background: "#ece7dc", required: 4.6 },
    ]);
    expect(repaired.css).toContain(".a { color: #646966; }");
    expect(repaired.css).toContain(".b { color: #636865; }");
  });

  it("fails closed when one token needs conflicting replacements", () => {
    const css = ".a { color: #6b716d; }";
    const repaired = repairFlatContrastCss(css, [
      { foreground: "#6b716d", background: "#ece7dc", required: 4.5 },
      { foreground: "#6b716d", background: "#14201d", required: 4.5 },
    ]);
    expect(repaired.css).toBe(css);
    expect(repaired.edits).toEqual([]);
    expect(repaired.skipped.length).toBeGreaterThan(0);
  });

  it("fails closed when the token is absent", () => {
    const css = ".a { color: #14201d; }";
    const repaired = repairFlatContrastCss(css, [
      { foreground: "#6b716d", background: "#ece7dc", required: 4.5 },
    ]);
    expect(repaired.css).toBe(css);
    expect(repaired.edits).toEqual([]);
    expect(repaired.skipped.length).toBeGreaterThan(0);
  });
});
