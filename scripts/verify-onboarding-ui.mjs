import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const repository = path.resolve(new URL("..", import.meta.url).pathname);
const dist = path.join(repository, "dist");
const screenshotDir = path.join(dist, "onboarding-ui-check");
const uploadFixture = path.join(
  repository,
  "templates/client-site/public/images/packs/professional-services-advisory-v1.png",
);
const contentTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".html": "text/html",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://127.0.0.1").pathname,
    );
    const relative = pathname.replace(/^\//, "");
    const candidate = path.resolve(
      dist,
      !relative || relative.endsWith("/")
        ? path.join(relative, "index.html")
        : relative,
    );
    if (!candidate.startsWith(`${dist}${path.sep}`))
      throw new Error("Unsafe path");
    const body = await fs.readFile(candidate);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(candidate)] || "text/plain",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
const failures = [];

try {
  await fs.mkdir(screenshotDir, { recursive: true });
  await page.goto(`${origin}/onboard/`, { waitUntil: "networkidle" });

  if (
    (await page.locator('link[rel="icon"]').getAttribute("href")) !==
    "/favicon.svg"
  )
    failures.push("LaunchLoom favicon is not linked.");

  const manual = page.getByRole("button", {
    name: "Enter details manually",
  });
  if (!(await manual.isVisible()))
    failures.push("Manual-entry button is not visible.");
  if (
    ["transparent", "rgba(0, 0, 0, 0)"].includes(
      await manual.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
  )
    failures.push("Manual-entry control still looks like plain text.");
  await page.screenshot({
    path: path.join(screenshotDir, "manual-entry-desktop.png"),
    fullPage: true,
  });
  await manual.click();
  if (!(await page.getByText("Manual details", { exact: true }).isVisible()))
    failures.push("Manual-entry button did not switch the form.");

  await page.locator('[name="businessName"]').fill("Visual QA Studio");
  await page.locator('[name="contactName"]').fill("David");
  await page.locator('[name="email"]').fill("david@example.com");
  await page.locator('[name="phone"]').fill("(555) 555-0100");
  await page.locator('[name="address"]').fill("100 Test Street");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[name="services"]').fill("Website design");
  await page.locator('[name="serviceAreas"]').fill("Austin");
  await page
    .locator('[name="differentiators"]')
    .fill("Clear strategy and careful execution");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator('[name="priorityService"]').fill("Website design");
  await page
    .locator('[name="searchPhrases"]')
    .fill("website designer austin\nlocal web design");
  await page
    .locator('[name="customerProblems"]')
    .fill("Our current site does not explain why clients should contact us.");
  await page.locator('[name="priorityLocations"]').fill("Austin");
  await page.getByRole("button", { name: "Continue" }).click();

  const colorInput = page.locator('[name="primaryColor"]');
  if (!(await colorInput.isVisible()))
    failures.push("Primary color picker is not visibly usable.");
  const pickerBox = await colorInput.boundingBox();
  if (!pickerBox || pickerBox.width < 60 || pickerBox.height < 50)
    failures.push("Primary color picker still renders as a small line.");
  await colorInput.fill("#d4ff00");
  await page.locator('[name="leadEmail"]').fill("leads@example.com");
  if (!(await page.getByText("#D4FF00", { exact: true }).isVisible()))
    failures.push("Primary color picker does not show its selected value.");

  const logoInput = page.locator('input[name="logo"]');
  await logoInput.setInputFiles(uploadFixture);
  const preview = page.locator(".image-preview-card").first();
  if (!(await preview.isVisible()))
    failures.push("Selecting an image did not produce a rich preview.");
  if (
    !(await preview
      .getByText(/professional-services-advisory-v1\.png/)
      .isVisible())
  )
    failures.push("Image preview does not identify the selected file.");

  await page.getByRole("button", { name: "Back" }).click();
  if (
    (await page.locator('[name="priorityService"]').inputValue()) !==
    "Website design"
  )
    failures.push(
      "SEO priority service was lost after returning to an earlier step.",
    );
  if (
    !(await page.locator('[name="searchPhrases"]').inputValue()).includes(
      "local web design",
    )
  )
    failures.push(
      "SEO search phrases were lost after returning to an earlier step.",
    );
  await page.getByRole("button", { name: "Continue" }).click();
  if ((await colorInput.inputValue()) !== "#d4ff00")
    failures.push("Primary color was lost after returning to an earlier step.");
  if (!(await preview.isVisible()))
    failures.push("Image preview was lost after returning to an earlier step.");

  await page.getByRole("button", { name: "Continue" }).click();
  const priorityServiceSummary = page
    .locator("dl > div")
    .filter({
      has: page.getByText("Priority service", { exact: true }),
    })
    .getByRole("definition");
  if (
    !(await priorityServiceSummary
      .getByText("Website design", { exact: true })
      .isVisible())
  )
    failures.push("Confirmation does not show the SEO priority service.");
  if (!(await page.getByText(/website designer austin/).isVisible()))
    failures.push("Confirmation does not show the supplied search phrases.");
  await page.getByRole("button", { name: "Back" }).click();

  await page.screenshot({
    path: path.join(screenshotDir, "image-preview-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => ({
    pixels: document.documentElement.scrollWidth - window.innerWidth,
    elements: [...document.querySelectorAll("*")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .slice(0, 5)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
      })),
  }));
  if (overflow.pixels > 1)
    failures.push(
      `Image preview causes ${overflow.pixels}px of horizontal overflow on mobile: ${JSON.stringify(overflow.elements)}.`,
    );
  await page.screenshot({
    path: path.join(screenshotDir, "image-preview-mobile.png"),
    fullPage: true,
  });

  await preview.getByRole("button", { name: "Remove" }).click();
  if (await preview.isVisible())
    failures.push("Remove did not clear the image preview.");
} finally {
  await browser.close();
  server.close();
}

if (failures.length)
  throw new Error(
    `Onboarding UI verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`onboarding_ui_verified=true screenshots=${screenshotDir}`);
