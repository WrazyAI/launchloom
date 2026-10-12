import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { sourceAttributionFailures } from "../scripts/source-attribution-evidence.mjs";

describe("rendered source attribution", () => {
  it("rejects hidden, missing, altered and nofollow source credit", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const credit =
      '<aside data-source-attribution="spicer-law-firm-results-ledger"><a href="https://www.spicerdesigns.com">Template adapted from Spicer Designs</a></aside>';
    try {
      await page.setContent(credit);
      expect(
        await sourceAttributionFailures(page, "spicer-law-firm-results-ledger"),
      ).toEqual([]);
      for (const html of [
        "",
        credit.replace("<aside", '<aside style="display:none"'),
        credit.replace("<a ", '<a rel="nofollow" '),
        credit.replace("Spicer Designs</a>", "Other</a>"),
        credit.replace("<a ", '<a style="font-size:1px" '),
      ]) {
        await page.setContent(html);
        expect(
          await sourceAttributionFailures(
            page,
            "spicer-law-firm-results-ledger",
          ),
        ).toHaveLength(1);
      }
      expect(await sourceAttributionFailures(page, null)).toEqual([]);
      expect(
        await sourceAttributionFailures(page, "unapproved-source"),
      ).toHaveLength(1);
    } finally {
      await browser.close();
    }
  }, 30000);
});
