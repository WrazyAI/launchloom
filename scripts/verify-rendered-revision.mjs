import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { contrast, parseCssColor } from "./color-contrast.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
if (!args.config || !args.dist)
  throw new Error("--config and --dist are required.");
const config = JSON.parse(await fs.readFile(path.resolve(args.config), "utf8"));
const reviewMode = process.env.PUBLIC_REVIEW_MODE === "true";
const dist = path.resolve(args.dist);
const screenshotDir = path.resolve(
  args.screenshots || path.join(dist, "revision-screenshots"),
);
const contentTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://127.0.0.1").pathname,
    );
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const candidate = path.resolve(
      dist,
      relative.endsWith("/") ? path.join(relative, "index.html") : relative,
    );
    if (!candidate.startsWith(`${dist}${path.sep}`))
      throw new Error("unsafe path");
    const body = await fs.readFile(candidate);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(candidate)] || "text/html",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch({ headless: true });
const failures = [];
const expectsLocationMap =
  String(config.business?.primaryCta || "")
    .trim()
    .toLowerCase() === "get directions" &&
  (Boolean(String(config.business?.placeId || "").trim()) ||
    /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(
      String(config.business?.address || ""),
    ));

const indexHtml = await fs.readFile(path.join(dist, "index.html"), "utf8");
const sitemapXml = await fs
  .readFile(path.join(dist, "sitemap.xml"), "utf8")
  .catch(() => "");
const robotsTxt = await fs
  .readFile(path.join(dist, "robots.txt"), "utf8")
  .catch(() => "");
if (!indexHtml.includes('name="description"'))
  failures.push("seo: homepage description metadata is missing.");
if (!indexHtml.includes('type="application/ld+json"'))
  failures.push("seo: LocalBusiness structured data is missing.");
if (!reviewMode && config.business?.domain && !indexHtml.includes('rel="canonical"'))
  failures.push("seo: configured public domain is missing a canonical URL.");
if (!sitemapXml.includes("<urlset"))
  failures.push("seo: sitemap.xml is missing or invalid.");
for (const service of config.services || [])
  if (!sitemapXml.includes(`/services/${service.slug}/`))
    failures.push(`seo: sitemap omits service route ${service.slug}.`);
if (!/^User-agent: \*/mu.test(robotsTxt))
  failures.push("seo: robots.txt is missing or invalid.");

try {
  await fs.mkdir(screenshotDir, { recursive: true });
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    if (viewport.name === "desktop") {
      const exitOffer = page.locator('[data-conversion-feature="exit-offer"]');
      if (await exitOffer.count()) {
        await page.evaluate(() => {
          window.scrollTo(0, 700);
        });
        await page.waitForTimeout(100);
        await page.evaluate(() => {
          document.dispatchEvent(
            new MouseEvent("mouseout", {
              bubbles: true,
              clientY: 0,
              relatedTarget: null,
            }),
          );
        });
        await page.waitForTimeout(100);
        const exitOpened = await exitOffer.evaluate((element) => element.open);
        if (!exitOpened)
          failures.push("desktop: eligible exit offer did not open.");
        else {
          await page.screenshot({
            path: path.join(screenshotDir, "desktop-exit-offer.png"),
          });
          await exitOffer.locator(".exit-offer__close").click();
        }
      }

      const quickAnswers = page.locator(
        '[data-conversion-feature="quick-answers"]',
      );
      if (await quickAnswers.count()) {
        const panel = quickAnswers.locator(".quick-answers__panel");
        if (await panel.isVisible())
          failures.push(
            "desktop: quick answers opened without visitor action.",
          );
        await quickAnswers.locator(".quick-answers__launcher").click();
        if (!(await panel.isVisible()))
          failures.push("desktop: quick answers did not open.");
        const choice = quickAnswers.locator("[data-answer]").first();
        await choice.click();
        if (!(await quickAnswers.locator(".quick-answers__answer").isVisible()))
          failures.push(
            "desktop: quick answer content did not become visible.",
          );
        else
          await page.screenshot({
            path: path.join(screenshotDir, "desktop-quick-answers.png"),
          });
        await page.keyboard.press("Escape");
        if (await panel.isVisible())
          failures.push("desktop: Escape did not close quick answers.");
      }

      const aiChat = page.locator('[data-conversion-feature="ai-chat"]');
      if (await aiChat.count()) {
        const panel = aiChat.locator(".quick-answers__panel");
        if (await panel.isVisible())
          failures.push("desktop: AI chat opened without visitor action.");
        await aiChat.locator(".quick-answers__launcher").click();
        if (!(await panel.isVisible()))
          failures.push("desktop: AI chat did not open.");
        if (!(await aiChat.locator(".quick-answers__form").isVisible()))
          failures.push("desktop: AI chat question form is missing.");
        if (!(await aiChat.locator(".quick-answers__form small").isVisible()))
          failures.push("desktop: AI disclosure is missing.");
        else
          await page.screenshot({
            path: path.join(screenshotDir, "desktop-ai-chat.png"),
          });
        await page.keyboard.press("Escape");
        if (await panel.isVisible())
          failures.push("desktop: Escape did not close AI chat.");
      }

      const qualifier = page
        .locator('[data-conversion-feature="guided-qualifier"]')
        .first();
      if (await qualifier.count()) {
        const firstOption = qualifier
          .locator('[data-lead-step="0"] input[type="radio"]')
          .first();
        await firstOption.check();
        await page.waitForTimeout(180);
        await qualifier.locator("[data-back]").first().click();
        if (!(await firstOption.isChecked()))
          failures.push("desktop: qualifier answer was lost after going back.");
      }
    } else {
      const exitOffer = page.locator('[data-conversion-feature="exit-offer"]');
      if (
        (await exitOffer.count()) &&
        (await exitOffer.evaluate(
          (element) => getComputedStyle(element).display !== "none",
        ))
      )
        failures.push("mobile: desktop exit offer is not suppressed.");
    }
    await page.evaluate(async () => {
      const step = Math.max(320, Math.floor(innerHeight * 0.75));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
      window.scrollTo(0, 0);
    });
    await page
      .waitForFunction(
        () => [...document.images].every((image) => image.complete),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    if (expectsLocationMap) {
      const locationMap = page.locator(
        '[data-conversion-feature="location-map"]',
      );
      if (await locationMap.count()) {
        await locationMap.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1200);
      }
    }
    const state = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const sections = [...document.querySelectorAll("main section")].map(
        (element) => ({
          id: element.id,
          classes: element.className,
          sectionType: element.getAttribute("data-section-type"),
          text: element.textContent?.replace(/\s+/g, " ").trim() || "",
          visible: visible(element),
        }),
      );
      const effectiveBackground = (startingElement) => {
        let current = startingElement;
        while (current) {
          const background = getComputedStyle(current).backgroundColor;
          const alpha = background.match(
            /rgba?\([^)]*[,/]\s*([\d.]+)\s*\)$/,
          )?.[1];
          if (!background.startsWith("rgba") || Number(alpha) > 0)
            return background;
          current = current.parentElement;
        }
        return "rgb(255, 255, 255)";
      };
      const contrastDetails = (element) => {
        const style = getComputedStyle(element);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        return {
          text: element.textContent?.trim(),
          color: style.color,
          background: effectiveBackground(element),
          minimum:
            fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
              ? 3
              : 4.5,
        };
      };
      const actions = [
        ...document.querySelectorAll(".cta, .lead-form button, .mobile-call"),
      ]
        .filter(visible)
        .map(contrastDetails);
      const contrastTargets = [
        ...document.querySelectorAll(
          [
            ".kicker, .offer, .contact-phone, .split-section h2, .split-section p, .split-section li",
            // Experience packs own their own surfaces, so their headings and
            // accents must be checked independently of the classic selectors.
            ".xp-folio h1, .xp-folio h2, .xp-folio h3, .xp-folio__eyebrow, .xp-folio__intro p, .xp-folio__service-index p, .xp-folio__faqs details p",
            ".xp-guide h1, .xp-guide h2, .xp-guide h3, .xp-guide__eyebrow, .xp-guide__hero-copy > p, .xp-guide__services article p, .xp-guide__about p:last-child, .xp-guide__faqs details p",
            ".xp-service h1, .xp-service h2, .xp-service h3, .xp-service__eyebrow, .xp-service__services a > p, .xp-service__process li p, .xp-service__faqs details p",
            // Shared conversion and proof surfaces can sit on either a light or
            // a dark pack, so they are verified on their own backgrounds.
            ".social-proof__intro, .proof-points p, .google-review > p:not(.google-review__rating)",
            ".qualifier-option span, .qualifier-heading h3, .qualifier-heading > p, .qualifier-step legend, .lead-form small",
          ].join(","),
        ),
      ]
        .filter(visible)
        .map(contrastDetails);
      const brokenLinks = [...document.querySelectorAll("a[href]")]
        .map((element) => element.getAttribute("href"))
        .filter(
          (href) =>
            href === "#" ||
            (href?.startsWith("#") && !document.querySelector(href)),
        );
      const main = document.querySelector("main");
      const locationMap = document.querySelector(
        '[data-conversion-feature="location-map"]',
      );
      const mapFrame = locationMap?.querySelector("iframe");
      const directionsLink = locationMap?.querySelector(
        'a[href*="google.com/maps"]',
      );
      const serviceOrdinals = [
        ...document.querySelectorAll(".service-card > span"),
      ]
        .map((element) => element.textContent?.trim() || "")
        .filter((value) => /^0?\d+$/.test(value));
      const assistantLabels = [
        ...document.querySelectorAll(".quick-answers__launcher"),
      ].map(
        (element) => element.textContent?.replace(/\s+/g, " ").trim() || "",
      );
      return {
        sections,
        actions,
        contrastTargets,
        brokenLinks,
        mainClasses: main?.className || "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
        overflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - innerWidth,
        css: getComputedStyle(document.body).cssText,
        locationMap: locationMap
          ? {
              visible: visible(locationMap),
              frameVisible: mapFrame ? visible(mapFrame) : false,
              frameSource: mapFrame?.getAttribute("src") || "",
              directionsHref: directionsLink?.getAttribute("href") || "",
            }
          : null,
        serviceOrdinals,
        assistantLabels,
      };
    });
    if (state.overflow > 1)
      failures.push(
        `${viewport.name}: horizontal overflow of ${state.overflow}px.`,
      );
    if (state.brokenLinks.length)
      failures.push(
        `${viewport.name}: broken fragment links ${state.brokenLinks.join(", ")}.`,
      );
    if (state.serviceOrdinals.length)
      failures.push(
        `${viewport.name}: service cards use decorative ordinal numbers.`,
      );
    if (
      state.assistantLabels.length &&
      state.assistantLabels.some((label) => !label.includes("Got questions?"))
    )
      failures.push(
        `${viewport.name}: assistant launcher is not labeled Got questions?.`,
      );
    if (expectsLocationMap) {
      if (!state.locationMap?.visible || !state.locationMap.frameVisible)
        failures.push(
          `${viewport.name}: Get directions is missing its visible location map.`,
        );
      if (
        !state.locationMap?.frameSource.includes("google.com/maps") ||
        !state.locationMap?.directionsHref.includes("google.com/maps")
      )
        failures.push(
          `${viewport.name}: location map or directions link is invalid.`,
        );
    } else if (state.locationMap)
      failures.push(
        `${viewport.name}: location map rendered without an exact requested location.`,
      );
    if (
      !state.sections.length ||
      state.sections.some((section) => !section.visible)
    )
      failures.push(
        `${viewport.name}: one or more configured sections are not visible.`,
      );
    for (const action of state.actions)
      if (
        parseCssColor(action.color).length &&
        parseCssColor(action.background).length &&
        contrast(action.color, action.background) < action.minimum
      )
        failures.push(
          `${viewport.name}: action contrast below ${action.minimum} for ${action.text}.`,
        );
    for (const target of state.contrastTargets)
      if (
        parseCssColor(target.color).length &&
        parseCssColor(target.background).length &&
        contrast(target.color, target.background) < target.minimum
      )
        failures.push(
          `${viewport.name}: text contrast below ${target.minimum} for ${target.text}.`,
        );
    for (const artifact of config.revisionReport?.expectedArtifacts || []) {
      if (artifact.type === "text" && !state.bodyText.includes(artifact.value))
        failures.push(
          `${viewport.name}: requested text is not visible: ${artifact.value.slice(0, 70)}.`,
        );
      if (
        artifact.type === "class" &&
        !state.mainClasses.includes(artifact.marker)
      )
        failures.push(
          `${viewport.name}: requested treatment is not active: ${artifact.marker}.`,
        );
      if (
        artifact.type === "variant" &&
        !state.sections.some((section) =>
          section.classes.includes(`variant-${artifact.value}`),
        )
      )
        failures.push(
          `${viewport.name}: requested variant is not visible: ${artifact.value}.`,
        );
      if (
        artifact.type === "section" &&
        !state.sections.some(
          (section) => section.id === artifact.id && section.visible,
        )
      )
        failures.push(
          `${viewport.name}: requested section is not visible: ${artifact.id}.`,
        );
      if (artifact.type === "section-type") {
        const id = config.design?.sections?.find(
          (section) => section.type === artifact.sectionType,
        )?.id;
        const rendered = state.sections.some(
          (section) =>
            section.visible &&
            ((id && section.id === id) ||
              section.sectionType === artifact.sectionType),
        );
        if (!rendered)
          failures.push(
            `${viewport.name}: requested ${artifact.sectionType} section is not visible.`,
          );
        if (artifact.text && !state.bodyText.includes(artifact.text))
          failures.push(
            `${viewport.name}: requested ${artifact.sectionType} heading is not visible.`,
          );
      }
    }
    await page.screenshot({
      path: path.join(screenshotDir, `${viewport.name}.png`),
      fullPage: true,
      // Layout QA uses clean page captures. Floating conversion controls are
      // exercised and captured separately above, so they must not obscure
      // arbitrary page copy in the stitched full-page screenshots.
      style: ".quick-answers, .mobile-call { visibility: hidden !important; }",
    });
    await page.close();
  }

  const reviewPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const reviewClaims = Buffer.from(
    JSON.stringify({
      stage: "developer",
      reviewerEmail: "developer@example.com",
    }),
  ).toString("base64url");
  const submittedIds = [];
  let feedbackAttempt = 0;
  await reviewPage.route("**/api/feedback", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");
    submittedIds.push(payload.submissionId);
    feedbackAttempt += 1;
    const rejected = feedbackAttempt === 1;
    await route.fulfill({
      status: rejected ? 409 : 202,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": new URL(url).origin,
      },
      body: JSON.stringify(
        rejected
          ? {
              code: "revision_queue_full",
              error:
                "One request is already waiting. Try again when it starts.",
            }
          : { ok: true, queueStatus: "queued" },
      ),
    });
  });
  await reviewPage.goto(`${url}?review=${reviewClaims}.test-signature`, {
    waitUntil: "networkidle",
  });
  const reviewRoot = reviewPage.locator("#ll-review");
  if (await reviewRoot.isVisible()) {
    await reviewRoot.locator(".ll-feedback-open").click();
    const closeTip = reviewRoot.locator(".ll-close-tip");
    if (await closeTip.isVisible())
      failures.push("review: empty feedback form shows the draft hint.");
    await reviewRoot
      .locator('input[name="email"]')
      .fill("developer@example.com");
    await reviewRoot.locator(".ll-close").hover();
    if (await closeTip.isVisible())
      failures.push(
        "review: reviewer email alone shows the feedback draft hint.",
      );
    const comment = reviewRoot.locator('textarea[name="comment"]');
    await comment.fill("Please refine the opening headline.");
    await reviewRoot.locator(".ll-close").hover();
    await reviewPage.waitForTimeout(180);
    if (!(await closeTip.isVisible())) {
      const hintState = await closeTip.evaluate((element) => ({
        hidden: element.hasAttribute("hidden"),
        describedBy:
          element.parentElement
            ?.querySelector(".ll-close")
            ?.getAttribute("aria-describedby") || "",
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
        opacity: getComputedStyle(element).opacity,
        parentHovered: element.parentElement?.matches(":hover") || false,
      }));
      failures.push(
        `review: feedback draft hint did not appear on close hover: ${JSON.stringify(hintState)}.`,
      );
    }
    await reviewPage.screenshot({
      path: path.join(screenshotDir, "developer-feedback-draft.png"),
    });
    await reviewRoot.locator(".ll-close").click();
    await reviewRoot.locator(".ll-feedback-open").click();
    if ((await comment.inputValue()) !== "Please refine the opening headline.")
      failures.push("review: feedback draft was lost after closing the modal.");
    await reviewRoot.locator(".ll-send").click();
    await reviewRoot
      .locator(".ll-feedback-status")
      .getByText("One request is already waiting. Try again when it starts.")
      .waitFor();
    if ((await comment.inputValue()) !== "Please refine the opening headline.")
      failures.push("review: queue rejection cleared the feedback draft.");
    await reviewRoot.locator(".ll-send").click();
    await reviewRoot
      .locator(".ll-feedback-status")
      .getByText("Queued. Your request will start after the current revision.")
      .waitFor();
    if ((await comment.inputValue()) !== "")
      failures.push(
        "review: accepted queued feedback did not clear the draft.",
      );
    if (
      submittedIds.length !== 2 ||
      !submittedIds[0] ||
      submittedIds[0] !== submittedIds[1]
    )
      failures.push(
        "review: queue-full retry did not retain its idempotent submission ID.",
      );
  }
  await reviewPage.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length)
  throw new Error(
    `Rendered revision verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`rendered_revision_verified=true screenshots=${screenshotDir}`);
