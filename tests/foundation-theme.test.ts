import { describe, expect, it } from "vitest";
import {
  applyFoundationThemeCss,
  applyFoundationThemeHtml,
} from "../scripts/foundation-theme.mjs";

describe("foundation theme mapping", () => {
  it("maps source palette declarations to client palette variables", () => {
    const css = `
:root { --font-tpl-serif: "Fraunces", Georgia, serif; --font-tpl-body: "Inter", sans-serif; }
.hero { color: #16241a; background: #f2f4ef; border-color: #d5ddcd; }
.cta { background: #1f4d2c; color: #8bc34a; }
.bg-\\[\\#f2f4ef\\] { background: #f2f4ef; }
`;
    const themed = applyFoundationThemeCss(css);
    expect(themed).toContain("color: var(--ink)");
    expect(themed).toContain("background: var(--cream)");
    expect(themed).toContain("border-color: var(--line)");
    expect(themed).toContain("background: var(--brand-surface)");
    expect(themed).toContain("color: var(--accent, #8bc34a)");
    expect(themed).toContain("--font-tpl-serif: var(--font-heading)");
    expect(themed).toContain("--font-tpl-body: var(--font-body)");
    expect(themed).toContain(".bg-\\[\\#f2f4ef\\]");
  });

  it("maps inline style colors without changing class names", () => {
    const html = `<div class="bg-[#f2f4ef]" style="color:#16241a;font-family:var(--font-tpl-serif)"><span fill="#2f6b3f">x</span></div>`;
    const themed = applyFoundationThemeHtml(html);
    expect(themed).toContain('class="bg-[#f2f4ef]"');
    expect(themed).toContain("color:var(--ink)");
    expect(themed).toContain('fill="var(--brand)"');
  });

  it("leaves unknown colors untouched", () => {
    const css = ".x { color: #123456; background: #abcdef; }";
    expect(applyFoundationThemeCss(css)).toBe(css);
  });
});
