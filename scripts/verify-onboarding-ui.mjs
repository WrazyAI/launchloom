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
    (await page.locator('meta[name="robots"]').getAttribute("content")) !==
    "noindex, nofollow"
  )
    failures.push("Onboarding is not marked noindex, nofollow.");

  if (await page.getByRole("link", { name: "New site" }).count())
    failures.push("Onboarding still exposes the public New site navigation.");

  const manual = page.getByRole("button", {
    name: "Enter details manually",
  });
  if (!(await manual.isVisible()))
    failures.push("Manual-entry button is not visible.");
  await manual.click();

  await page.locator('[name="businessName"]').fill("Visual QA Painting");
  await page.locator('[name="contactName"]').fill("David");
  await page.locator('[name="email"]').fill("david@example.com");
  await page.locator('[name="phone"]').fill("(555) 555-0100");
  await page.locator('[name="address"]').fill("100 Test Street");
  await page.getByRole("button", { name: "Continue" }).click();

  const stepText = await page.locator(".stepper").innerText();
  if (!stepText.includes("Step 2 of 3"))
    failures.push("Simplified onboarding is not a three-step flow.");

  const services = page.locator('[name="services"]');
  await services.fill("Exterior painting");
  await page.locator('[name="industry"]').selectOption("home-services");
  await page.locator('[name="serviceAreas"]').fill("Charleston, SC");
  await page.locator('[name="serviceRadius"]').selectOption("30");
  await page
    .locator('[name="differentiators"]')
    .fill("Careful prep, tidy work, and clear communication.");

  await services.fill(
    "Exterior painting\nInterior painting\nCabinet refinishing\nCommercial painting\nDeck staining\nDrywall repair",
  );
  await page.getByRole("button", { name: "Continue" }).click();
  if (!((await services.evaluate((element) => element.validationMessage)) || "").includes("5"))
    failures.push("Services field does not cap the client at five core services.");

  await services.fill("Exterior painting\nInterior painting\nCabinet refinishing");
  await page.getByRole("button", { name: "Continue" }).click();

  if (await page.locator('[name="searchPhrases"]').count())
    failures.push("Client-facing SEO search phrase input still exists.");
  if (await page.locator('[name="competitorUrls"]').count())
    failures.push("Client-facing competitor URL input still exists.");
  if (await page.locator('[name="priorityLocations"]').count())
    failures.push("Duplicated priority location input still exists.");

  await page.locator('[name="brandNotes"]').fill("Warm, local, established.");
  await page.locator('[name="leadEmail"]').fill("leads@example.com");

  const logoInput = page.locator('input[name="logo"]');
  await logoInput.setInputFiles(uploadFixture);
  const preview = page.locator(".image-preview-card").first();
  if (!(await preview.isVisible()))
    failures.push("Selecting an image did not produce a preview.");

  if (
    !(await page
      .locator("dl > div")
      .filter({ has: page.getByText("Main service city", { exact: true }) })
      .getByRole("definition")
      .getByText("Charleston, SC", { exact: true })
      .isVisible())
  )
    failures.push("Confirmation does not show the main service city.");

  if (
    !(await page
      .locator("dl > div")
      .filter({ has: page.getByText("Travel radius", { exact: true }) })
      .getByRole("definition")
      .getByText("30 miles", { exact: true })
      .isVisible())
  )
    failures.push("Confirmation does not show the service radius.");

  if ((await page.locator('input[type="checkbox"][required]').count()) !== 1)
    failures.push("Client confirmation should require one checkbox.");

  await page.getByRole("button", { name: "Back" }).click();
  if (!(await page.locator('[name="services"]').inputValue()).includes("Cabinet refinishing"))
    failures.push("Service choices were lost after backward navigation.");
  if ((await page.locator('[name="serviceRadius"]').inputValue()) !== "30")
    failures.push("Service radius was lost after backward navigation.");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.screenshot({
    path: path.join(screenshotDir, "simplified-onboarding-desktop.png"),
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
      `Simplified onboarding causes ${overflow.pixels}px of horizontal overflow on mobile: ${JSON.stringify(overflow.elements)}.`,
    );
  await page.screenshot({
    path: path.join(screenshotDir, "simplified-onboarding-mobile.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
  server.close();
}

if (failures.length)
  throw new Error(
    `Onboarding UI verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`onboarding_ui_verified=true screenshots=${screenshotDir}`);
