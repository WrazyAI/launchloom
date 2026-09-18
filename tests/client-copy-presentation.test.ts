import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client copy presentation", () => {
  it("uses a human invitation for the assistant launcher", async () => {
    const component = await fs.readFile(
      "templates/client-site/src/components/QuickAnswers.astro",
      "utf8",
    );
    expect(component).toContain('const assistantLabel = "Got questions?"');
    expect(component).not.toContain('ai?.label || "AI answers"');
  });

  it("does not decorate service or trust cards with ordinal numbers", async () => {
    const component = await fs.readFile(
      "templates/client-site/src/components/PageSections.astro",
      "utf8",
    );
    expect(component).not.toMatch(/service-card[^\n]+0\{index \+ 1\}/);
    expect(component).not.toMatch(/trust-grid[^\n]+0\{index \+ 1\}/);
  });

  it("balances three trust points and four real process steps", async () => {
    const styles = await fs.readFile(
      "templates/client-site/src/styles/site.css",
      "utf8",
    );
    expect(styles).toContain(".trust-grid:has(> div:nth-child(3):last-child)");
    expect(styles).toContain(".process-grid:has(> li:nth-child(4):last-child)");
  });

  it("neutralizes count-aware service spans on mobile", async () => {
    const styles = await fs.readFile(
      "templates/client-site/src/styles/site.css",
      "utf8",
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.services-section \.service-grid > \.service-card \{[\s\S]*?grid-column: 1 \/ -1 !important;/,
    );
  });

  it("targets the configured contact section instead of a hard-coded fragment", async () => {
    const siteModule = await fs.readFile(
      "templates/client-site/src/lib/site.ts",
      "utf8",
    );
    expect(siteModule).toContain("export const contactSectionHref");
    expect(siteModule).toContain("return contactSectionHref(pathname)");
    expect(siteModule).toMatch(
      /site\.design\?\.experience\?\.packId\s*\?\s*"contact"/,
    );
  });

  it("keeps shared light forms and location labels readable in dark themes", async () => {
    const styles = await fs.readFile(
      "templates/client-site/src/styles/site.css",
      "utf8",
    );
    expect(styles).toMatch(
      /\.lead-form\s*\{[^}]*--ink:\s*#14201d;[^}]*--muted:\s*#53605b;[^}]*--line:\s*#d8ded7;/s,
    );
    expect(styles).toMatch(
      /\.location-map-copy \.kicker\s*\{[^}]*color:\s*var\(--ink\);/s,
    );
  });
});
