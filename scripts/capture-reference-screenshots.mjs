import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";

const SCROLL_REVEAL_SETTLE_MS = 700;
const MAX_RESOURCE_DIAGNOSTICS = 30;
const MAX_IFRAME_DIAGNOSTIC_TEXT = 320;
const IFRAME_FAILURE_TEXT_PATTERN =
  /could(?:n['’]t| not) verify|access (?:to this content )?(?:has been )?restricted|access denied|permission denied|blocked by|refused to (?:connect|display)|this site can(?:not|['’]t) be reached|failed to load|temporarily unavailable|video unavailable|something went wrong|error (?:loading|playing|connecting)/iu;

/**
 * @param {Array<{ alt?: string, src?: string, currentSrc?: string, resolvedSrc?: string, complete?: boolean, naturalWidth?: number }>} images
 */
export function collectImageDiagnostics(images = []) {
  const brokenImages = [];
  const unresolvedImages = [];

  for (const image of images) {
    const src = typeof image.src === "string" ? image.src : "";
    const currentSrc =
      typeof image.currentSrc === "string" ? image.currentSrc : "";
    const reasons = [];
    if (!src.trim()) reasons.push("empty-src");
    if (!currentSrc.trim()) reasons.push("empty-current-src");
    if (image.complete !== true) reasons.push("incomplete-load");

    if (reasons.length) {
      unresolvedImages.push({
        alt: typeof image.alt === "string" ? image.alt : "",
        src,
        currentSrc,
        reasons,
      });
    } else if (image.naturalWidth === 0) {
      brokenImages.push(currentSrc || image.resolvedSrc || src);
    }
  }

  return {
    brokenImages: brokenImages.slice(0, MAX_RESOURCE_DIAGNOSTICS),
    unresolvedImages: unresolvedImages.slice(0, MAX_RESOURCE_DIAGNOSTICS),
  };
}

/** @param {Array<{ url?: string, title?: string, bodyText?: string }>} frames */
export function collectIframeFailures(frames = []) {
  return frames
    .flatMap((frame) => {
      const failureText =
        typeof frame.bodyText === "string"
          ? frame.bodyText.replace(/\s+/gu, " ").trim()
          : "";
      if (!failureText || !IFRAME_FAILURE_TEXT_PATTERN.test(failureText))
        return [];

      return [
        {
          url: sanitizeDiagnosticFrameUrl(frame.url || ""),
          title: (frame.title || "").replace(/\s+/gu, " ").trim().slice(0, 120),
          failureText: failureText.slice(0, MAX_IFRAME_DIAGNOSTIC_TEXT),
        },
      ];
    })
    .slice(0, MAX_RESOURCE_DIAGNOSTICS);
}

function sanitizeDiagnosticFrameUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "data:" || url.protocol === "blob:")
      return `${url.protocol}[redacted]`;
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value).slice(0, 300);
  }
}

/** @param {{ height: number, viewportHeight: number, overlap?: number }} options */
export function fullPageFramePlan({
  height,
  viewportHeight,
  overlap = 120,
} = {}) {
  if (
    !Number.isSafeInteger(height) ||
    !Number.isSafeInteger(viewportHeight) ||
    height <= 0 ||
    viewportHeight <= 0
  )
    throw new Error("Reference capture dimensions must be positive integers.");
  if (
    !Number.isSafeInteger(overlap) ||
    overlap < 0 ||
    overlap >= viewportHeight
  )
    throw new Error(
      "Reference capture overlap must be a non-negative integer smaller than the viewport.",
    );

  const maxScroll = Math.max(0, height - viewportHeight);
  const step = viewportHeight - overlap;
  const positions = [0];
  for (let scrollTop = step; scrollTop < maxScroll; scrollTop += step)
    positions.push(scrollTop);
  if (maxScroll > positions.at(-1)) positions.push(maxScroll);

  const frames = [];
  let covered = 0;
  for (const scrollTop of positions) {
    const cropTop = Math.max(0, covered - scrollTop);
    const copyHeight = Math.min(viewportHeight - cropTop, height - covered);
    if (copyHeight <= 0) continue;
    frames.push({ scrollTop, cropTop, stitchTop: covered, copyHeight });
    covered += copyHeight;
  }
  if (covered !== height)
    throw new Error(
      `Reference capture stitch plan covers ${covered}px of ${height}px.`,
    );
  return frames;
}

export async function fitCaptureToViewportWidth(image, viewportWidth) {
  if (!Number.isSafeInteger(viewportWidth) || viewportWidth <= 0)
    throw new Error(
      "Reference capture viewport width must be a positive integer.",
    );
  const metadata = await sharp(image).metadata();
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height))
    throw new Error("Reference capture image has no readable dimensions.");
  if (metadata.width < viewportWidth)
    throw new Error(
      `Reference capture is ${metadata.width}px wide, narrower than the ${viewportWidth}px viewport.`,
    );
  if (metadata.width === viewportWidth) return image;
  return sharp(image)
    .extract({ left: 0, top: 0, width: viewportWidth, height: metadata.height })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2)
    result[values[index].replace(/^--/u, "")] = values[index + 1];
  return result;
}

async function captureViewport(
  browser,
  { url, outputDirectory, name, width, height },
) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response || response.status() >= 400)
    throw new Error(
      `${name} reference capture returned HTTP ${response?.status() || "no response"}.`,
    );
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // Long-lived analytics and motion connections do not invalidate a visual capture.
  }
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(1_000);

  const scroll = await page.evaluate(
    ({ viewportHeight }) => {
      const documentRoot =
        document.scrollingElement || document.documentElement;
      const customRoots = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            ["auto", "scroll"].includes(style.overflowY) &&
            element.scrollHeight > element.clientHeight + viewportHeight
          );
        })
        .sort((left, right) => right.scrollHeight - left.scrollHeight);
      const customRoot = customRoots[0];
      const useCustomRoot = Boolean(
        customRoot &&
        customRoot.scrollHeight > documentRoot.scrollHeight + viewportHeight,
      );
      const root = useCustomRoot ? customRoot : documentRoot;
      const rootTop = useCustomRoot
        ? Math.max(0, Math.ceil(root.getBoundingClientRect().top))
        : 0;
      window.__launchLoomCaptureScrollRoot = root;
      return {
        selector: useCustomRoot
          ? root.id
            ? `#${root.id}`
            : `.${String(root.className || "")
                .trim()
                .split(/\s+/u)
                .filter(Boolean)
                .join(".")}`
          : "document.scrollingElement",
        custom: useCustomRoot,
        height: root.scrollHeight,
        viewportHeight: root.clientHeight,
        rootTop,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: documentRoot.scrollHeight,
      };
    },
    { viewportHeight: height },
  );

  let image;
  let frameCount = 1;
  let captureMethod = "playwright-native-full-page-v1";
  let stitchedHeight = scroll.height;
  if (!scroll.custom) {
    // Scroll once to trigger lazy media, then use Chromium's native full-page
    // capture. This keeps sticky/fixed UI from being duplicated at every seam.
    const preloadStep = Math.max(300, height - 100);
    for (
      let scrollTop = 0;
      scrollTop < scroll.height;
      scrollTop += preloadStep
    ) {
      await page.evaluate((value) => window.scrollTo(0, value), scrollTop);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    image = await page.screenshot({
      type: "png",
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      timeout: 60_000,
    });
    stitchedHeight = (await sharp(image).metadata()).height || scroll.height;
  } else {
    captureMethod = "playwright-scrolled-viewport-stitch-v1";
    const visibleRootHeight = Math.min(
      scroll.viewportHeight,
      height - scroll.rootTop,
    );
    if (visibleRootHeight <= 0)
      throw new Error(
        `${name} custom scroll root has no visible viewport area.`,
      );
    const framePlan = fullPageFramePlan({
      height: scroll.height,
      viewportHeight: visibleRootHeight,
    });
    const strips = [];
    let covered = 0;
    await page.evaluate(() => {
      const scrollRoot = window.__launchLoomCaptureScrollRoot;
      for (const element of document.querySelectorAll("*"))
        if (
          getComputedStyle(element).position === "fixed" &&
          element !== scrollRoot &&
          !element.contains(scrollRoot)
        )
          element.setAttribute("data-launchloom-capture-fixed", "true");
    });
    for (const [index, frame] of framePlan.entries()) {
      await page.evaluate(
        ({ scrollTop }) => {
          window.__launchLoomCaptureScrollRoot.scrollTop = scrollTop;
        },
        { scrollTop: frame.scrollTop },
      );
      // Some reference sites reveal and position content through scroll-driven
      // timelines. Capturing immediately after assigning scrollTop records the
      // pre-reveal blank state even though the eventual full-page dimensions
      // look valid.
      await page.waitForTimeout(SCROLL_REVEAL_SETTLE_MS);
      if (index > 0)
        await page.addStyleTag({
          content:
            '[data-launchloom-capture-fixed="true"] { visibility: hidden !important; }',
        });
      const screenshot = await page.screenshot({
        type: "png",
        animations: "disabled",
        caret: "hide",
        timeout: 60_000,
      });
      const strip = await sharp(screenshot)
        .extract({
          left: 0,
          top: scroll.rootTop + frame.cropTop,
          width,
          height: frame.copyHeight,
        })
        .png()
        .toBuffer();
      strips.push({ input: strip, left: 0, top: frame.stitchTop });
      covered += frame.copyHeight;
    }

    if (covered !== scroll.height)
      throw new Error(
        `${name} capture produced ${covered}px of ${scroll.height}px.`,
      );
    frameCount = framePlan.length;
    image = await sharp({
      create: {
        width,
        height: scroll.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(strips)
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  const rawImageWidth = (await sharp(image).metadata()).width;
  image = await fitCaptureToViewportWidth(image, width);
  await fs.mkdir(outputDirectory, { recursive: true });
  const screenshotPath = path.join(outputDirectory, `${name}.png`);
  await fs.writeFile(screenshotPath, image);
  const imageMetadata = await sharp(image).metadata();
  const title = await page.title();
  const pageDiagnostics = await page.evaluate(() => ({
    images: [...document.images].map((image) => ({
      alt: image.alt,
      src: image.getAttribute("src") ?? "",
      currentSrc: image.currentSrc,
      resolvedSrc: image.src,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    })),
    finalDocumentWidth: document.documentElement.scrollWidth,
  }));
  const iframeStates = await Promise.all(
    page
      .frames()
      .filter(
        (frame) => frame !== page.mainFrame() && frame.url() !== "about:blank",
      )
      .slice(0, MAX_RESOURCE_DIAGNOSTICS)
      .map(async (frame) => ({
        url: frame.url(),
        title: await frame.title().catch(() => ""),
        bodyText: await frame
          .locator("body")
          // Resource-constrained CI can take longer to surface the iframe's
          // error document while a full-page screenshot is being stitched.
          .innerText({ timeout: 1_000 })
          .catch(() => ""),
      })),
  );
  const imageDiagnostics = collectImageDiagnostics(pageDiagnostics.images);
  const iframeFailures = collectIframeFailures(iframeStates);
  await page.close();
  return {
    path: screenshotPath,
    record: {
      url,
      finalUrl: response.url(),
      httpStatus: response.status(),
      title,
      capturedAt: new Date().toISOString(),
      captureMethod,
      viewport: { width, height },
      fullPage: true,
      image: {
        width: imageMetadata.width,
        height: imageMetadata.height,
        format: imageMetadata.format,
      },
      rawImageWidth,
      scrollRoot: scroll.selector,
      customScrollRoot: scroll.custom,
      scrollRootTop: scroll.rootTop,
      scrollHeight: stitchedHeight,
      documentWidth: pageDiagnostics.finalDocumentWidth,
      brokenImages: imageDiagnostics.brokenImages,
      unresolvedImages: imageDiagnostics.unresolvedImages,
      iframeFailures,
      pageErrors: pageErrors.slice(0, 20),
      frames: frameCount,
    },
  };
}

export async function captureReferenceScreenshots({
  url,
  outputDirectory,
} = {}) {
  if (!url || !outputDirectory)
    throw new Error("Reference capture requires both --url and --output-dir.");
  const browser = await chromium.launch({ headless: true });
  try {
    const captures = [];
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ])
      captures.push(
        await captureViewport(browser, {
          url,
          outputDirectory,
          ...viewport,
        }),
      );
    const record = {
      schemaVersion: 1,
      sourceUrl: url,
      captures: Object.fromEntries(
        captures.map((capture) => [
          path.basename(capture.path, ".png"),
          capture.record,
        ]),
      ),
    };
    await fs.writeFile(
      path.join(outputDirectory, "capture-record.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args["output-dir"])
    throw new Error(
      "Usage: node scripts/capture-reference-screenshots.mjs --url <url> --output-dir <folder>",
    );
  const record = await captureReferenceScreenshots({
    url: args.url,
    outputDirectory: path.resolve(args["output-dir"] || ""),
  });
  console.log(JSON.stringify(record, null, 2));
}
