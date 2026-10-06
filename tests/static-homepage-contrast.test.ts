import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  resolvePalette,
  semanticColorCss,
} from "../templates/client-site/src/lib/color-policy.mjs";
import { inspectContrastPage } from "../scripts/rendered-contrast.mjs";

let browser: Browser;
let css: string;
let roles: string;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  css = await fs.readFile("templates/client-site/src/styles/site.css", "utf8");
  const layout = await fs.readFile(
    "templates/client-site/src/layouts/SiteLayout.astro",
    "utf8",
  );
  const palette = resolvePalette({
    primaryColor: "#205d51",
    mutedColor: "#6b716d",
  });
  const customRoles = layout.match(
    /const colorRoles = semanticColorCss\(palette\) \+ `([\s\S]*?)`;/,
  )![1];
  roles =
    semanticColorCss(palette) +
    Function("palette", "return `" + customRoles + "`;")(palette);
});
afterAll(async () => {
  await browser?.close();
});

const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='700'%3E%3Crect width='700' height='700' fill='black'/%3E%3C/svg%3E";
async function audit(recipe: string, content: string, width: number) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(
      `<style>${css}</style><style>${roles}</style><body style="--brand:#205d51;--ink:#14201d;--muted:#6b716d;--hero-surface:#e8eee5;--cream:#f8f6f0"><main class="recipe-${recipe}">${content}</main></body>`,
    );
    return await inspectContrastPage(page, { route: "/" });
  } finally {
    await page.close();
  }
}

describe("static homepage painted contrast", () => {
  it.each([1440, 390])(
    "pairs care body text with the hero surface at %i px",
    async (width) => {
      const report = await audit(
        "care-editorial",
        '<section class="hero recipe-hero"><div class="wrap hero-grid"><div class="hero-copy"><p>A useful first conversation about care.</p></div></div></section>',
        width,
      );
      expect(report.pass, JSON.stringify(report.findings)).toBe(true);
    },
  );
  it.each([1440, 390])(
    "proves trades card paint and keyboard focus on dark and image surfaces at %i px",
    async (width) => {
      const report = await audit(
        "local-trades",
        `<section class="hero recipe-hero"><div class="wrap hero-grid"><div class="hero-copy"><div class="hero-actions"><a class="cta" href="#contact">Discuss your request</a><a class="call-link" href="tel:5555550100">Call 555-555-0100</a></div></div><div class="hero-visual"><img class="hero-image" src="${image}" alt="Service context"><a class="hero-phone-card" href="tel:5555550100"><span>Need local service?</span><strong>555-555-0100</strong></a></div></div></section><section class="coverage-section"><a href="#contact">Testville coverage</a></section>`,
        width,
      );
      expect(report.pass, JSON.stringify(report.findings)).toBe(true);
      expect(
        report.targets
          .filter((target: any) => target.kind === "focus")
          .map((target: any) => target.text),
      ).toEqual(
        expect.arrayContaining([
          "Discuss your request",
          "Call 555-555-0100",
          "Need local service?555-555-0100",
          "Testville coverage",
        ]),
      );
    },
  );
  it("keeps the fixed mobile call plate above a partially overlapping phone card", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
    });
    try {
      await page.setContent(
        `<style>${css}</style><style>${roles}</style><body style="--brand:#205d51;--ink:#14201d;--muted:#6b716d;--on-brand:#fff"><main class="recipe-local-trades"><section class="hero recipe-hero" style="min-height:900px"><a class="hero-phone-card" style="position:fixed;left:auto;right:14px" href="tel:5555550100"><span>Need local service?</span><strong>555-555-0100</strong></a></section><a class="mobile-call" href="tel:5555550100">Call for service</a></main></body>`,
      );
      // Reproduce the partial overlap caused by keyboard scroll positioning.
      await page.locator(".hero-phone-card").evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(".mobile-call")!);
        const rect = range.getBoundingClientRect();
        (el as HTMLElement).style.bottom =
          `${innerHeight - rect.top - rect.height / 2}px`;
      });
      const report = await inspectContrastPage(page, {
        route: "/",
        states: false,
      });
      expect(report.pass, JSON.stringify(report.findings)).toBe(true);
      expect(report.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "text",
            text: "Call for service",
            status: "pass",
          }),
        ]),
      );
    } finally {
      await page.close();
    }
  });

  it.each([1440, 390])(
    "proves the shared quick-answer shell in its expanded state at %i px",
    async (width) => {
      const report = await audit(
        "care-editorial",
        `<aside class="quick-answers is-open" data-conversion-feature="quick-answers"><button class="quick-answers__launcher" aria-expanded="true"><span aria-hidden="true">?</span>Got questions?</button><section class="quick-answers__panel" aria-labelledby="quick-answers-title"><header><div><span class="kicker">Website assistant</span><h2 id="quick-answers-title">Got questions?</h2></div><button class="quick-answers__close" type="button" aria-label="Close website assistant">×</button></header><p class="quick-answers__greeting">A practical answer before you contact us.</p><div class="quick-answers__choices"><button type="button" aria-pressed="false"><span>What happens first?</span><span aria-hidden="true">→</span></button></div></section></aside>`,
        width,
      );
      expect(report.pass, JSON.stringify(report.findings)).toBe(true);
    },
  );
});
