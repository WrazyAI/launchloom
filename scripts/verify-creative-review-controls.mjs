import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const dist = path.resolve(args.dist || "templates/client-site/dist");
const appDist = path.resolve(args["app-dist"] || "dist");
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    let target = path.resolve(dist, `.${pathname}`);
    if (!target.startsWith(`${dist}${path.sep}`) && target !== dist)
      throw new Error("Invalid path");
    if ((await fs.stat(target)).isDirectory())
      target = path.join(target, "index.html");
    response.setHeader(
      "Content-Type",
      mime[path.extname(target)] || "application/octet-stream",
    );
    response.end(await fs.readFile(target));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Could not start review-control test server.");
const origin = `http://127.0.0.1:${address.port}`;
const appServer = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    let target = path.resolve(appDist, `.${pathname}`);
    if (!target.startsWith(`${appDist}${path.sep}`) && target !== appDist)
      throw new Error("Invalid path");
    if ((await fs.stat(target)).isDirectory())
      target = path.join(target, "index.html");
    response.setHeader(
      "Content-Type",
      mime[path.extname(target)] || "application/octet-stream",
    );
    response.end(await fs.readFile(target));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await new Promise((resolve, reject) => {
  appServer.once("error", reject);
  appServer.listen(0, "127.0.0.1", resolve);
});
const appAddress = appServer.address();
if (!appAddress || typeof appAddress === "string")
  throw new Error("Could not start LaunchLoom review-panel test server.");
const appOrigin = `http://127.0.0.1:${appAddress.port}`;
const fakeToken = `${Buffer.from(
  JSON.stringify({
    stage: "developer",
    reviewerEmail: "developer@example.test",
    creativeRepairSessionId: "0123456789abcdef0123456789abcdef",
  }),
).toString("base64url")}.test-signature`;
const actions = [];
const browser = await chromium.launch({ headless: true });
const failures = [];

async function mockCreativeReview(page) {
  await page.route("**/api/creative-repair", async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body);
    if (body.action === "status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "0123456789abcdef0123456789abcdef",
          status: "available",
          candidateId: "candidate-a",
          previewUrl: origin,
          repairAvailable: true,
          humanDisposition: null,
          reviewQueue: "clear",
          findings: [],
        }),
      });
      return;
    }
    if (body.action === "feedback") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          disposition: "accepted-with-feedback",
          queueStatus: "started",
        }),
      });
      return;
    }
    if (body.action === "send-anyway") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "publication-queued" }),
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unexpected review action" }),
    });
  });
}

try {
  const anonymous = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await anonymous.goto(origin, { waitUntil: "domcontentloaded" });
  const hiddenWithoutToken = await anonymous
    .locator("#ll-review")
    .evaluate((element) => element.hasAttribute("hidden"));
  if (!hiddenWithoutToken)
    failures.push(
      "Diagnostic review controls are visible without a signed token.",
    );
  await anonymous.close();

  const feedbackPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mockCreativeReview(feedbackPage);
  await feedbackPage.goto(
    `${origin}/?review=${encodeURIComponent(fakeToken)}`,
    { waitUntil: "domcontentloaded" },
  );
  const banner = feedbackPage.locator("#ll-review");
  await banner.waitFor({ state: "visible" });
  const barWidth = await banner
    .locator(".ll-review__bar")
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  if (barWidth.scrollWidth > barWidth.clientWidth + 1)
    failures.push(
      "The mobile field-preview banner overflows its available width.",
    );
  if (
    !(await banner.locator(".ll-review__summary").innerText()).includes(
      "This is still a work. This is just a field preview.",
    )
  )
    failures.push(
      "The field-preview warning is missing from the signed preview banner.",
    );
  await feedbackPage.getByRole("button", { name: /provide feedback/i }).click();
  await feedbackPage
    .getByLabel("Your review email")
    .fill("developer@example.test");
  await feedbackPage
    .getByLabel("What should change?")
    .fill("Keep this as the baseline, but tighten the intro.");
  await feedbackPage.getByRole("button", { name: "Send feedback" }).click();
  await feedbackPage
    .getByText(/Accepted as the working baseline/)
    .waitFor({ state: "visible" });
  if (!actions.some((item) => item.action === "feedback"))
    failures.push(
      "Feedback was not submitted through the creative review action.",
    );
  if (actions.some((item) => item.action === "send-anyway"))
    failures.push("Submitting feedback unexpectedly started a client release.");
  await feedbackPage.close();

  const overridePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mockCreativeReview(overridePage);
  await overridePage.goto(
    `${origin}/?review=${encodeURIComponent(fakeToken)}`,
    { waitUntil: "domcontentloaded" },
  );
  await overridePage.locator("#ll-review").waitFor({ state: "visible" });
  await overridePage
    .getByRole("button", { name: /send to client anyway/i })
    .click();
  await overridePage
    .getByRole("dialog")
    .getByRole("heading", { name: "Send this field preview to the client?" })
    .waitFor();
  if (actions.some((item) => item.action === "send-anyway"))
    failures.push("Opening the release confirmation dialog sent a request.");
  await overridePage
    .getByRole("button", { name: "Confirm and send to client" })
    .click();
  await overridePage
    .getByText(
      "Confirmed. Client publication is queued. Production release checks will still run.",
    )
    .waitFor({ state: "visible" });
  const overrides = actions.filter((item) => item.action === "send-anyway");
  if (overrides.length !== 1 || !overrides[0].confirmed)
    failures.push(
      "The second confirmation must submit exactly one confirmed release request.",
    );
  await overridePage.close();

  const repairPanel = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const repairActions = [];
  await repairPanel.route("**/api/creative-repair", async (route) => {
    const body = route.request().postDataJSON();
    repairActions.push(body);
    if (body.action === "status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "0123456789abcdef0123456789abcdef",
          status: "available",
          candidateId: "candidate-a",
          previewUrl: null,
          repairAvailable: true,
          findings: [],
        }),
      });
      return;
    }
    if (body.action === "retry") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "queued",
          attemptConsumed: true,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unexpected repair action" }),
    });
  });
  await repairPanel.goto(
    `${appOrigin}/review?token=${encodeURIComponent(fakeToken)}`,
    { waitUntil: "domcontentloaded" },
  );
  await repairPanel.getByText("Creative quality review").waitFor();
  const repairEmail = repairPanel.getByLabel(
    "Developer review email to request the final repair",
  );
  if ((await repairEmail.count()) !== 1) {
    failures.push(
      "The no-preview repair link does not provide the email needed to request its final repair.",
    );
  } else {
    await repairEmail.fill("developer@example.test");
    await repairPanel
      .getByRole("button", {
        name: "Fix the listed issues (one final attempt)",
      })
      .click();
    await repairPanel
      .getByText(/Queued\. The site will be checked again/)
      .waitFor({ state: "visible" });
    if (!repairActions.some((item) => item.action === "retry"))
      failures.push(
        "The no-preview developer review did not queue its final repair.",
      );
  }
  await repairPanel.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await new Promise((resolve, reject) =>
    appServer.close((error) => (error ? reject(error) : resolve())),
  );
}

if (failures.length) {
  console.error(
    JSON.stringify({ creativeReviewControls: "failed", failures }, null, 2),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      creativeReviewControls: "passed",
      unauthenticatedHidden: true,
      feedbackAcceptedWithoutPublish: true,
      sendAnywayTwoStepConfirmed: true,
      repairAvailableWithoutPreview: true,
    }),
  );
}
