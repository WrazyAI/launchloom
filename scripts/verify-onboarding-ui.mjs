import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { CLIENT_INTAKE_V2_SUBMISSION_FIELDS } from "../src/lib/client-intake-v2.mjs";

const repository = path.resolve(new URL("..", import.meta.url).pathname);
const dist = path.join(repository, "dist");
const screenshotDir = path.join(dist, "onboarding-ui-check");
const uploadFixtureDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "launchloom-onboarding-image-"),
);
const uploadFixture = path.join(uploadFixtureDir, "visual-qa-painting-logo.png");
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" rx="28" fill="#10251f" />
  <path d="M82 218 190 58l52 36-108 160Z" fill="#c8ec58" />
  <path d="M164 190h44v66h-44z" fill="#f7f5ee" />
  <text x="290" y="190" fill="#f7f5ee" font-family="Arial,sans-serif" font-size="76" font-weight="700">VQ</text>
</svg>`;
await sharp(Buffer.from(logoSvg)).png().toFile(uploadFixture);
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

const verifyPort = Number(process.env.ONBOARDING_VERIFY_PORT || 4179);
await new Promise((resolve) => server.listen(verifyPort, "127.0.0.1", resolve));
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
  if (await page.getByRole("link", { name: "LaunchLoom home" }).count())
    failures.push("Onboarding still exposes a public homepage navigation link.");

  if (!(await page.getByRole("heading", { name: "This invitation is unavailable." }).isVisible()))
    failures.push("Onboarding is usable without a private invitation.");
  if (await page.locator('[name="businessName"]').count())
    failures.push("Business fields are visible before invite validation.");

  const inviteId = "browser-invite-001";
  const inviteToken = `${Buffer.from(JSON.stringify({ inviteId })).toString("base64url")}.browser-fixture-signature`;
  let acceptedIntake;
  await page.route("**/api/onboarding-invites/validate", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body.token === inviteToken
        ? { valid: true, clientEmail: "david@example.com" }
        : { valid: false }),
    });
  });
  await page.route("**/api/places", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ place: {
        id: "place-fixture-001",
        name: "Charleston Painting Co.",
        address: "100 King Street, Charleston, SC",
        phone: "(843) 555-0100",
        website: "https://charleston-painting.example",
        mapsUrl: "https://maps.google.com/?cid=fixture",
        primaryType: "painter",
        types: ["painter", "home_services"],
        location: { latitude: 32.7765, longitude: -79.9311 },
      } }),
    });
  });
  await page.route("**/api/upload", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, key: "fixture/logo", url: "https://assets.example.test/fixture/logo.png" }),
    });
  });
  await page.route("**/api/service-suggestions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: ["Exterior painting", "Interior painting", "Cabinet refinishing", "Surface prep, priming and coating"], provenance: "model_suggestion_unconfirmed" }),
    });
  });
  await page.route("**/api/intake", async (route) => {
    acceptedIntake = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, issue: 66 }) });
  });
  await page.goto(`${origin}/onboard/?invited=1#invite=${encodeURIComponent(inviteToken)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Let’s meet the business." }).waitFor();

  await page.locator("#place-query").fill("Charleston Painting Co.");
  await page.getByRole("button", { name: "Find listing" }).click();
  await page.locator(".place-card").getByText("Charleston Painting Co.", { exact: true }).waitFor({ state: "visible" });
  if ((await page.locator('[name="address"]').inputValue()) !== "100 King Street, Charleston, SC")
    failures.push("Google Business lookup did not prefill the verified listing address.");

  const manual = page.getByRole("button", {
    name: "Enter details manually",
  });
  if (!(await manual.isVisible()))
    failures.push("Manual-entry button is not visible.");
  await manual.click();

  await page.locator('[name="businessName"]').fill("Visual QA Painting");
  await page.locator('[name="contactName"]').fill("David");
  if ((await page.locator('[name="email"]').inputValue()) !== "david@example.com")
    failures.push("The invitation email was not prefilled.");
  await page.locator('[name="phone"]').fill("(555) 555-0100");
  await page.locator('[name="address"]').fill("100 Test Street");
  await page.getByRole("button", { name: "Continue" }).click();

  const stepText = await page.locator(".stepper").innerText();
  if (!stepText.includes("Step 2 of 3"))
    failures.push("Simplified onboarding is not a three-step flow.");

  const services = page.locator('[name="services"]');
  const serviceEntry = page.getByRole("textbox", { name: "Add a core service" });
  if (!(await serviceEntry.evaluate((element) => element.required)))
    failures.push("The service picker does not require at least one confirmed service.");
  await page.getByRole("button", { name: "Suggest services from my listing" }).click();
  await page.getByText("Choose any suggested services you offer").waitFor();
  if (await services.inputValue())
    failures.push("Model suggestions were silently added as confirmed services.");
  await page.getByLabel("Exterior painting", { exact: true }).check();
  if (await services.inputValue() !== "Exterior painting")
    failures.push("Selecting a service suggestion did not add only the client-confirmed service.");
  await page.getByLabel("Surface prep, priming and coating", { exact: true }).check();
  if (await services.inputValue() !== "Exterior painting\nSurface prep, priming and coating")
    failures.push("Selecting a comma-containing service suggestion split one service into multiple lines.");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(screenshotDir, "simplified-services-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const serviceMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (serviceMobileOverflow > 1)
    failures.push(`Service pills cause ${serviceMobileOverflow}px of horizontal overflow on mobile.`);
  await page.screenshot({
    path: path.join(screenshotDir, "simplified-services-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Surface prep, priming and coating", { exact: true }).uncheck();
  if (await services.inputValue() !== "Exterior painting")
    failures.push("Unselecting a comma-containing service suggestion changed other service entries.");

  await serviceEntry.fill("Interior painting");
  await serviceEntry.press("Enter");
  await serviceEntry.fill("Cabinet refinishing");
  await serviceEntry.press("Enter");
  await serviceEntry.fill("cabinet refinishing");
  await serviceEntry.press("Enter");
  if (await services.inputValue() !== "Exterior painting\nInterior painting\nCabinet refinishing")
    failures.push("Pressing Enter did not add a unique service pill or case-insensitive duplicates were accepted.");
  if (await page.locator(".service-chip").count() !== 3)
    failures.push("Confirmed services are not rendered as removable pills.");

  await serviceEntry.fill("Commercial painting");
  await serviceEntry.press("Enter");
  await serviceEntry.fill("Deck staining");
  await serviceEntry.press("Enter");
  if ((await services.inputValue()).split("\n").length !== 5 || !(await serviceEntry.isDisabled()))
    failures.push("The service picker does not stop at five services.");
  await page.getByRole("button", { name: "Remove Deck staining" }).click();
  await serviceEntry.fill("Surface prep, priming and coating");
  await serviceEntry.press("Enter");
  if (!((await services.inputValue()).includes("Surface prep, priming and coating")))
    failures.push("A comma-containing service was not kept intact as one pill.");
  await page.getByRole("button", { name: "Remove Commercial painting" }).click();
  await page.getByRole("button", { name: "Remove Surface prep, priming and coating" }).click();
  if (await services.inputValue() !== "Exterior painting\nInterior painting\nCabinet refinishing")
    failures.push("Removing pills did not preserve the remaining service order.");

  await page.locator('[name="industry"]').selectOption("home-services");
  await page.locator('[name="serviceAreas"]').fill("Charleston, SC");
  await page.locator('[name="serviceRadius"]').selectOption("30");
  await page
    .locator('[name="differentiators"]')
    .fill("Careful prep, tidy work, and clear communication.");

  const callNow = page.getByRole("radio", { name: "Call now", exact: true });
  if (await callNow.getAttribute("value") !== "Call now")
    failures.push("The Call now option label and submitted value do not match.");
  await page.getByRole("button", { name: "Continue" }).click();

  if (await page.locator('[name="searchPhrases"]').count())
          failures.push("Client-facing SEO search phrase input still exists.");
  if (await page.locator('[name="competitorUrls"]').count())
    failures.push("Client-facing competitor URL input still exists.");
  if (await page.locator('[name="priorityLocations"]').count())
    failures.push("Duplicated priority location input still exists.");

  await page.locator('[name="brandNotes"]').fill("Warm, local, established.");
  const brandColor = page.locator('[name="brandColor"]');
  const brandPicker = page.locator('[name="brandColorPicker"]');
  if (await brandPicker.getAttribute("type") !== "color")
    failures.push("Existing brand colour is not selected with a colour picker.");
  if (await brandColor.inputValue())
    failures.push("A default colour is being submitted as if the client confirmed it.");
  await brandPicker.fill("#245a46");
  if (await brandColor.inputValue() !== "#245a46")
    failures.push("The selected colour picker value is not saved as the client brand colour.");
  await page.getByRole("button", { name: "Clear selected brand colour" }).click();
  if (await brandColor.inputValue())
    failures.push("Clearing the optional colour still submits a brand-colour fact.");
  await brandPicker.fill("#245a46");
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

  if (
    !(await page
      .locator("dl > div")
      .filter({ has: page.getByText("Existing brand colour", { exact: true }) })
      .getByRole("definition")
      .getByText("#245a46", { exact: true })
      .isVisible())
  )
    failures.push("Confirmation does not show the selected existing brand colour.");

  if (
    !(await page
      .locator("dl > div")
      .filter({ has: page.getByText("Main customer action", { exact: true }) })
      .getByRole("definition")
      .getByText("Call now", { exact: true })
      .isVisible())
  )
    failures.push("Confirmation does not show the same Call now wording as the selected option.");

  if ((await page.locator('input[type="checkbox"][required]').count()) !== 1)
    failures.push("Client confirmation should require one checkbox.");

  await page.getByRole("button", { name: "Back" }).click();
  if (!(await page.locator('[name="services"]').inputValue()).includes("Cabinet refinishing"))
    failures.push("Service choices were lost after backward navigation.");
  if ((await page.locator('[name="serviceRadius"]').inputValue()) !== "30")
    failures.push("Service radius was lost after backward navigation.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(100);

  await page.screenshot({
    path: path.join(screenshotDir, "simplified-onboarding-desktop.png"),
    fullPage: true,
  });

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (desktopOverflow > 1)
    failures.push(`Simplified onboarding causes ${desktopOverflow}px of horizontal overflow on desktop.`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(100);
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

  await page.locator('[name="confirmAccuracy"]').check();
  await page.getByRole("button", { name: "Create my preview" }).click();
  await page.getByRole("heading", { name: "Your details are with us." }).waitFor();
  if (!(await page.getByText("Your intake has been received and processing has started.", { exact: false }).isVisible()))
    failures.push("The accepted screen does not confirm that intake processing has started.");
  if (acceptedIntake?.intakeVersion !== "2" || acceptedIntake?.inviteToken !== inviteToken)
    failures.push("The accepted v2 intake did not include its invite proof and contract version.");
  const acceptedFields = Object.keys(acceptedIntake || {}).sort();
  if (JSON.stringify(acceptedFields) !== JSON.stringify([...CLIENT_INTAKE_V2_SUBMISSION_FIELDS].sort()))
    failures.push(`The accepted v2 intake field set differs from the shared form contract: ${acceptedFields.join(", ")}.`);
  if (acceptedIntake?.services?.split("\n").length !== 3)
    failures.push("Only the client-selected core services should be submitted.");
  if (acceptedIntake?.brandColor !== "#245a46")
    failures.push("The client-supplied existing brand colour was not included in the intake.");
  if (acceptedIntake?.serviceAreas !== "Charleston, SC" || acceptedIntake?.serviceRadius !== "30")
    failures.push("The intake did not preserve the client-confirmed city and travel radius.");

  const retryPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const retryInviteId = "browser-invite-retry-002";
  const retryToken = `${Buffer.from(JSON.stringify({ inviteId: retryInviteId })).toString("base64url")}.browser-fixture-signature`;
  let retryValidationCount = 0;
  const retryIntakes = [];
  await retryPage.route("**/api/onboarding-invites/validate", async (route) => {
    const body = route.request().postDataJSON();
    retryValidationCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body.token !== retryToken
        ? { valid: false }
        : retryValidationCount === 1
          ? { valid: true, clientEmail: "retry@example.com" }
          : { valid: false, accepted: true }),
    });
  });
  await retryPage.route("**/api/intake", async (route) => {
    const body = route.request().postDataJSON();
    retryIntakes.push(body);
    await route.fulfill(retryIntakes.length === 1
      ? { status: 500, contentType: "application/json", body: JSON.stringify({ error: "Temporary response failure" }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, issue: 67 }) });
  });
  await retryPage.goto(`${origin}/onboard/#invite=${encodeURIComponent(retryToken)}`, { waitUntil: "networkidle" });
  await retryPage.getByRole("heading", { name: "Let’s meet the business." }).waitFor();
  await retryPage.getByRole("button", { name: "Enter details manually" }).click();
  await retryPage.locator('[name="businessName"]').fill("Retry Plumbing");
  await retryPage.locator('[name="contactName"]').fill("Taylor Owner");
  await retryPage.locator('[name="phone"]').fill("(555) 555-0102");
  await retryPage.locator('[name="address"]').fill("2 Test Street, Tacoma, WA");
  await retryPage.getByRole("button", { name: "Continue" }).click();
  const retryServiceEntry = retryPage.getByRole("textbox", { name: "Add a core service" });
  await retryServiceEntry.fill("Drain cleaning");
  await retryServiceEntry.press("Enter");
  await retryPage.locator('[name="industry"]').selectOption("home-services");
  await retryPage.locator('[name="serviceAreas"]').fill("Tacoma, WA");
  await retryPage.locator('[name="serviceRadius"]').selectOption("20");
  await retryPage.locator('[name="differentiators"]').fill("Clear communication and careful work areas.");
  await retryPage.getByRole("button", { name: "Continue" }).click();
  await retryPage.locator('[name="leadEmail"]').fill("leads-retry@example.com");
  await retryPage.locator('[name="confirmAccuracy"]').check();
  await retryPage.getByRole("button", { name: "Create my preview" }).click();
  await retryPage.getByText("Temporary response failure").waitFor();
  await retryPage.reload({ waitUntil: "networkidle" });
  await retryPage.getByRole("heading", { name: "Your details are with us." }).waitFor();
  if (retryIntakes.length !== 2)
    failures.push("A saved accepted intake was not retried after reload.");
  else if (JSON.stringify(retryIntakes[0]) !== JSON.stringify(retryIntakes[1]))
    failures.push("An accepted intake retry changed the original submission payload.");
  await retryPage.close();
} finally {
  await browser.close();
  server.close();
  await fs.rm(uploadFixtureDir, { recursive: true, force: true });
}

if (failures.length)
  throw new Error(
    `Onboarding UI verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`onboarding_ui_verified=true screenshots=${screenshotDir}`);
