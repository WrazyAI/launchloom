import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const FULL_PAGE_REVEAL_SETTLE_MS = 700;

export function fullPageCaptureErrors(browserErrors, priorCount, viewportName) {
  return browserErrors
    .slice(priorCount)
    .map(
      (message) =>
        `${viewportName}: browser error during full-page capture: ${message}`,
    );
}

/**
 * Scroll a rendered page through its content so lazy media and scroll-triggered
 * reveals settle before Playwright stitches a full-page screenshot. Return to
 * the top so the screenshot has the same opening state as the viewport capture.
 * @param {import("playwright").Page} page
 * @param {{viewportHeight?: number, settleMs?: number, maxFrames?: number}} options
 */
export async function prepareFullPageCapture(
  page,
  {
    viewportHeight,
    settleMs = FULL_PAGE_REVEAL_SETTLE_MS,
    maxFrames = 200,
  } = {},
) {
  const height =
    viewportHeight ?? (await page.evaluate(() => window.innerHeight));
  if (!Number.isFinite(height) || height <= 0)
    throw new Error("Full-page capture requires a positive viewport height.");
  if (!Number.isFinite(settleMs) || settleMs < 0)
    throw new Error("Full-page capture settle time must be non-negative.");
  if (!Number.isSafeInteger(maxFrames) || maxFrames < 1)
    throw new Error("Full-page capture maxFrames must be a positive integer.");

  const step = Math.max(320, height - 96);
  let position = 0;
  let reachedStableBottom = false;

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const beforeHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      ),
    );
    const beforeBottom = Math.max(0, beforeHeight - height);
    position = Math.min(position, beforeBottom);
    await page.evaluate(
      (nextPosition) => window.scrollTo(0, nextPosition),
      position,
    );
    await page.waitForTimeout(settleMs);

    const afterHeight = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      ),
    );
    const afterBottom = Math.max(0, afterHeight - height);
    if (position >= afterBottom && afterHeight <= beforeHeight) {
      reachedStableBottom = true;
      break;
    }
    position = Math.min(position + step, afterBottom);
  }

  if (!reachedStableBottom)
    throw new Error(
      `Full-page capture did not reach stable content within ${maxFrames} scroll frames.`,
    );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(Math.min(settleMs, 250));
}

export async function startServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url || "/", "http://localhost").pathname,
      );
      let target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(`${root}${path.sep}`) && target !== root)
        throw new Error("Invalid path");
      const stat = await fs.stat(target);
      if (stat.isDirectory()) target = path.join(target, "index.html");
      response.setHeader(
        "content-type",
        CONTENT_TYPES[path.extname(target)] || "application/octet-stream",
      );
      response.end(await fs.readFile(target));
    } catch {
      response.statusCode = 404;
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not start candidate server");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

export async function inspect(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-creative-candidate]");
    const hero = root?.querySelector("[data-hero]");
    const heroBounds = hero?.getBoundingClientRect();
    const normalizedBounds = (rect) => {
      if (
        !rect ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        !innerWidth ||
        !innerHeight
      )
        return null;
      const ratio = (value) => Number(value.toFixed(4));
      return {
        leftRatio: ratio(rect.left / innerWidth),
        topRatio: ratio(rect.top / innerHeight),
        widthRatio: ratio(rect.width / innerWidth),
        heightRatio: ratio(rect.height / innerHeight),
        areaRatio: ratio(
          (rect.width * rect.height) / (innerWidth * innerHeight),
        ),
        centerOffsetRatio: ratio(
          Math.abs(rect.left + rect.width / 2 - innerWidth / 2) / innerWidth,
        ),
        bottomRatio: ratio(rect.bottom / innerHeight),
      };
    };
    const headlineElement =
      hero?.querySelector("h1") || root?.querySelector("h1");
    let headlineBounds = headlineElement?.getBoundingClientRect() || null;
    if (headlineElement) {
      const range = document.createRange();
      range.selectNodeContents(headlineElement);
      const textBounds = range.getBoundingClientRect();
      if (textBounds.width > 0 && textBounds.height > 0)
        headlineBounds = textBounds;
    }
    const openingImage = [...(root?.querySelectorAll("img") || [])].find(
      (image) => {
        const bounds = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0
        );
      },
    );
    const imageBounds = openingImage?.getBoundingClientRect() || null;
    const navigationBounds =
      root?.querySelector("nav")?.getBoundingClientRect() || null;
    const earlyConversionBounds =
      root?.querySelector("[data-early-conversion]")?.getBoundingClientRect() ||
      null;
    const text = [document.title, document.body.innerText].join("\n");
    const anchors = [...document.querySelectorAll("nav a")];
    const requiredTargets = ["#services", "#faqs", "#contact"];
    return {
      h1Count: document.querySelectorAll("h1").length,
      hasHero: Boolean(hero),
      hasEarlyConversion: Boolean(
        root?.querySelector("[data-early-conversion]"),
      ),
      hasServices: Boolean(document.querySelector("#services")),
      hasFaqs: Boolean(document.querySelector("#faqs")),
      hasContact: Boolean(document.querySelector("#contact")),
      navTargets: anchors
        .map((anchor) => anchor.getAttribute("href"))
        .filter(Boolean),
      missingFragments: requiredTargets.filter(
        (target) => !document.querySelector(target),
      ).length,
      missingNavTargets: requiredTargets.filter(
        (target) =>
          !anchors.some((anchor) => anchor.getAttribute("href") === target),
      ).length,
      hasLeadForm: Boolean(
        document.querySelector('[data-runtime="lead-form"]'),
      ),
      missingAlt: [...document.images].filter(
        (image) => !image.getAttribute("alt")?.trim(),
      ).length,
      unnamedControls: [...document.querySelectorAll("button, a")].filter(
        (element) =>
          !(
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
          ).trim(),
      ).length,
      heroBottom: Math.round(heroBounds?.bottom || 0),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      headline: normalizedBounds(headlineBounds),
      openingImage: normalizedBounds(imageBounds),
      navigation: normalizedBounds(navigationBounds),
      earlyConversion: normalizedBounds(earlyConversionBounds),
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      emDashes: (text.match(/—/gu) || []).length,
      referenceSignatures: [
        ...new Set(
          [...document.querySelectorAll("[data-reference-signature]")]
            .map((element) => element.getAttribute("data-reference-signature"))
            .filter(Boolean),
        ),
      ],
      referenceSections: [
        ...document.querySelectorAll("[data-reference-section]"),
      ]
        .map((element) => element.getAttribute("data-reference-section"))
        .filter(Boolean),
      heroGeometry:
        root
          ?.querySelector("[data-hero]")
          ?.getAttribute("data-hero-geometry") || "",
      navigationGeometry:
        root
          ?.querySelector("[data-navigation-geometry]")
          ?.getAttribute("data-navigation-geometry") || "",
      servicePresentation:
        root
          ?.querySelector("[data-service-presentation]")
          ?.getAttribute("data-service-presentation") || "",
      ctaPlacement:
        root
          ?.querySelector("[data-cta-placement]")
          ?.getAttribute("data-cta-placement") || "",
      mobileRecomposition:
        root
          ?.querySelector("[data-mobile-recomposition]")
          ?.getAttribute("data-mobile-recomposition") || "",
      motionPrimitive:
        root
          ?.querySelector("[data-motion-primitive]")
          ?.getAttribute("data-motion-primitive") || "",
      creativeRenderer:
        document
          .querySelector("[data-creative-renderer]")
          ?.getAttribute("data-creative-renderer") || "",
    };
  });
}
