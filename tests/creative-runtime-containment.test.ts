import { it, expect } from "vitest";
import { chromium } from "playwright";
import fs from "node:fs/promises";

it("contains authored absolute navigation below platform notices at desktop and mobile", async () => {
  const css = await fs.readFile(
    "templates/client-site/src/styles/creative-runtime.css",
    "utf8",
  );
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1536, height: 864 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(
        `<style>${css}body{margin:0}.notice{padding:20px;background:#14201d;color:white}header{position:absolute;top:16px;height:60px;background:white}main{padding-top:100px}</style><aside class="notice">Test-only preview. Submissions disabled.</aside><div data-creative-host="true"><header>Client navigation</header><main>Authored site</main></div>`,
      );
      const notice = await page.locator("aside").boundingBox();
      const navigation = await page.locator("header").boundingBox();
      expect(navigation!.y).toBeGreaterThanOrEqual(notice!.y + notice!.height);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
