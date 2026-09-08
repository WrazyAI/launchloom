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
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
if (!args.config || !args.dist)
  throw new Error("--config and --dist are required.");
const config = JSON.parse(await fs.readFile(path.resolve(args.config), "utf8"));
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

function rgb(value) {
  const match = String(value).match(/[\d.]+/g);
  return match ? match.slice(0, 3).map(Number) : [];
}
function luminance(color) {
  return rgb(color)
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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
      const actions = [
        ...document.querySelectorAll(".cta, .lead-form button, .mobile-call"),
      ]
        .filter(visible)
        .map((element) => ({
          text: element.textContent?.trim(),
          color: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        }));
      const brokenLinks = [...document.querySelectorAll("a[href]")]
        .map((element) => element.getAttribute("href"))
        .filter(
          (href) =>
            href === "#" ||
            (href?.startsWith("#") && !document.querySelector(href)),
        );
      const main = document.querySelector("main");
      return {
        sections,
        actions,
        brokenLinks,
        mainClasses: main?.className || "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
        overflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - innerWidth,
        css: getComputedStyle(document.body).cssText,
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
    if (
      !state.sections.length ||
      state.sections.some((section) => !section.visible)
    )
      failures.push(
        `${viewport.name}: one or more configured sections are not visible.`,
      );
    for (const action of state.actions)
      if (
        rgb(action.color).length &&
        rgb(action.background).length &&
        contrast(action.color, action.background) < 4.5
      )
        failures.push(
          `${viewport.name}: action contrast below 4.5 for ${action.text}.`,
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
    });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length)
  throw new Error(
    `Rendered revision verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`rendered_revision_verified=true screenshots=${screenshotDir}`);
