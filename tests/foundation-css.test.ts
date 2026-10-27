import { describe, expect, it } from "vitest";
import { scopeFoundationCss } from "../scripts/foundation-css.mjs";

describe("foundation css scoping", () => {
  it("scopes source selectors and removes remote dependencies", () => {
    const result = scopeFoundationCss(`
@import url("https://fonts.example.test/font.css");
@font-face { font-family: "Remote"; src: url(https://fonts.example.test/font.woff2); }
:root { --brand: #16241a; }
html, body { margin: 0; }
* { box-sizing: border-box; }
.hero { background: url(hero.webp); color: var(--brand); }
.remote { background: url(https://cdn.example.test/bg.jpg); }
@media (min-width: 768px) { .hero { padding: 2rem; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
`);
    expect(result.css).not.toContain("https://");
    expect(result.css).not.toContain("@import");
    expect(result.css).not.toContain("@font-face");
    expect(result.css).toContain(".xp-foundation { --brand: #16241a; }");
    expect(result.css).toContain(
      ".xp-foundation * { box-sizing: border-box; }",
    );
    expect(result.css).toContain(".xp-foundation .hero {");
    expect(result.css).toContain("url(hero.webp)");
    expect(result.css).toContain("background: none");
    expect(result.css).toContain("@media (min-width: 768px)");
    expect(result.css).toContain("@keyframes fade");
    expect(result.css).toContain(".xp-foundation .hero { padding: 2rem; }");
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        "remote-import",
        "remote-font",
        "remote-css-url",
      ]),
    );
  });

  it("flattens layer blocks and preserves property declarations", () => {
    const result = scopeFoundationCss(`
@layer theme, base, utilities;
@layer base {
  :root { --ink: #111; }
  .card { color: var(--ink); }
}
@property --ink { syntax: "<color>"; inherits: true; initial-value: #111; }
`);
    expect(result.css).not.toContain("@layer");
    expect(result.css).toContain(".xp-foundation { --ink: #111; }");
    expect(result.css).toContain(".xp-foundation .card { color: var(--ink); }");
    expect(result.css).toContain("@property --ink");
    expect(result.blockers).toEqual([]);
  });

  it("does not double-scope an already scoped selector", () => {
    const result = scopeFoundationCss(
      ".xp-foundation .hero { color: #111; } .xp-foundation { margin: 0; }",
    );
    expect(result.css).toContain(".xp-foundation .hero { color: #111; }");
    expect(result.css).toContain(".xp-foundation { margin: 0; }");
    expect(result.css).not.toContain(".xp-foundation .xp-foundation");
  });

  it("keeps keyframe selectors unchanged", () => {
    const result = scopeFoundationCss(
      "@keyframes fade { 0% { opacity: 0; } 100% { opacity: 1; } }",
    );
    expect(result.css).toContain("0% { opacity: 0; }");
    expect(result.css).toContain("100% { opacity: 1; }");
    expect(result.css).not.toContain(".xp-foundation 0%");
  });
});
