import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  renderLeadEmail,
  renderLifecycleEmail,
} from "../emails/render-email.mjs";

const outputDir = path.resolve(
  process.argv[2] || "/tmp/launchloom-transactional-visuals",
);
const onboardUrl = process.argv[3];
await fs.mkdir(outputDir, { recursive: true });

const fixtures = {
  "developer-revision": renderLifecycleEmail({
    audience: "developer",
    kind: "revision",
    clientName: "North Shore Care",
    previewUrl: "https://north-shore-care.pages.dev",
    reviewUrl: "https://review.example.pages.dev/?review=fixture.signature",
    clientFeedback:
      "[Homepage] Make the introduction feel warmer and move the consultation form higher.\n\n[Services] Clarify the difference between companionship and personal care.",
    revisionOutcome:
      "Updated the introduction, moved the form, and clarified both service descriptions without changing the approved business facts.",
  }),
  "client-published": renderLifecycleEmail({
    audience: "client",
    kind: "published",
    clientName: "North Shore Care",
    previewUrl: "https://north-shore-care.pages.dev",
    reviewUrl: "https://north-shore-care.pages.dev/?review=fixture.signature",
  }),
  lead: renderLeadEmail({
    name: "Morgan Lee",
    phone: "(555) 010-2940",
    email: "morgan@example.test",
    message:
      "I am looking for weekly support for my mother and would like to understand availability and the first steps.",
    project: "North Shore Care",
    pageUrl: "https://north-shore-care.pages.dev/contact",
    qualification: [
      ["Preferred support", "Companionship and meal preparation"],
      ["Preferred start", "Within one month"],
    ],
  }),
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, email] of Object.entries(fixtures)) {
    const htmlPath = path.join(outputDir, `${name}.html`);
    await fs.writeFile(htmlPath, email.html);
    for (const viewport of [
      { label: "desktop", width: 1280, height: 1000 },
      { label: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      await page.goto(pathToFileURL(htmlPath).href);
      await page.screenshot({
        path: path.join(outputDir, `${name}-${viewport.label}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }

  if (onboardUrl) {
    for (const viewport of [
      { label: "desktop", width: 1280, height: 900 },
      { label: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      await page.route("**/api/intake", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, issue: 123 }),
        }),
      );
      await page.goto(onboardUrl);
      await page.locator("astro-dev-toolbar").evaluate((element) => {
        element.style.display = "none";
      });
      await page
        .getByRole("button", { name: /enter details manually/i })
        .click();
      await page.locator('[name="businessName"]').fill("North Shore Care");
      await page.locator('[name="contactName"]').fill("Morgan Lee");
      await page.locator('[name="email"]').fill("morgan@example.test");
      await page.locator('[name="phone"]').fill("555-0100");
      await page.locator('[name="address"]').fill("10 Harbor Road");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator('[name="services"]').fill("Companionship");
      await page.locator('[name="serviceAreas"]').fill("North Shore");
      await page.locator('[name="differentiators"]').fill("Locally owned");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator('[name="leadEmail"]').fill("leads@example.test");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator('[name="confirmAccuracy"]').check();
      await page.locator('[name="confirmRights"]').check();
      await page.getByRole("button", { name: "Create my preview" }).click();
      await page.getByRole("status").waitFor();
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(outputDir, `onboarding-success-${viewport.label}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Dismiss confirmation" }).click();
      if (await page.getByRole("status").count())
        throw new Error("The success confirmation did not dismiss.");
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(outputDir);
