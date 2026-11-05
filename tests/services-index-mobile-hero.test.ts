import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

const runtimeCss = readFileSync(
  new URL(
    "../templates/client-site/src/styles/creative-runtime.css",
    import.meta.url,
  ),
  "utf8",
);

const fixtureCss = `
  .ald-index-hero__inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,380px);gap:36px;max-width:1100px;margin:0 auto;padding:0 14px}
  .ald-index-hero__copy{min-width:0;max-width:34rem}
  .ald-index-hero__media{height:260px;background:#ccc}
`;

const html = `
  <section data-services-index-hero class="ald-index-hero">
    <div class="ald-index-hero__inner">
      <div class="ald-index-hero__copy">
        <h1>What we can fix, and how we decide</h1>
        <p>Each service starts with a leak-first look and a plain-language next step.</p>
      </div>
      <div class="ald-index-hero__media"></div>
    </div>
  </section>
`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

async function boxes(width: number) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  try {
    await page.setContent(
      `<style>${runtimeCss}\n${fixtureCss}</style>${html}`,
    );
    return await page.evaluate(() => {
      const copy = document.querySelector(
        ".ald-index-hero__copy",
      )!.getBoundingClientRect();
      const media = document.querySelector(
        ".ald-index-hero__media",
      )!.getBoundingClientRect();
      return {
        copyWidth: copy.width,
        copyBottom: copy.bottom,
        mediaTop: media.top,
        mediaLeft: media.left,
        copyLeft: copy.left,
      };
    });
  } finally {
    await page.close();
  }
}

describe("services index mobile hero", () => {
  it("stacks the copy above the media at 390px", async () => {
    const layout = await boxes(390);
    expect(layout.copyWidth).toBeGreaterThan(300);
    expect(layout.mediaTop).toBeGreaterThanOrEqual(layout.copyBottom - 1);
  });

  it("keeps the two-column hero at desktop width", async () => {
    const layout = await boxes(1440);
    expect(layout.mediaLeft).toBeGreaterThan(layout.copyLeft + 100);
  });
});
