import { verifyApprovedRoutes, diagnosticFormMode } from "./browser-route-verification.mjs";
import { sanitizeVerificationReport } from "./route-verification-handoff.mjs";
import { compileRouteInventory } from "../templates/client-site/src/lib/route-inventory.mjs";
import { hasPipelineTest } from "../templates/client-site/src/lib/seo-readiness.mjs";
import { contrastFailureMessages } from "./rendered-contrast.mjs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { auditBuiltContrast } from "./contrast-sweep.mjs";
import sharp from "sharp";
import { chromium } from "playwright";
import { revisionImageMatches } from "./revision-image-acceptance.mjs";
import { pipelineTestBannerMessage } from "../templates/client-site/src/lib/pipeline-test-preview.mjs";

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
const testPreview = hasPipelineTest(config);
const reviewMode = testPreview || process.env.PUBLIC_REVIEW_MODE === "true";
const dist = path.resolve(args.dist);
const creativeExperience =
  config.design?.experience?.renderer === "creative-candidate";
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
if (
  !reviewMode &&
  config.business?.domain &&
  !indexHtml.includes('rel="canonical"')
)
  failures.push("seo: configured public domain is missing a canonical URL.");
if (!sitemapXml.includes("<urlset"))
  failures.push("seo: sitemap.xml is missing or invalid.");
for (const route of compileRouteInventory(config).records.filter(
  (route) => route.discovery.sitemap && !reviewMode,
))
  if (!sitemapXml.includes(route.path))
    failures.push(`seo: sitemap omits approved route ${route.path}.`);
if (!/^User-agent: \*/mu.test(robotsTxt))
  failures.push("seo: robots.txt is missing or invalid.");

try {
  await fs.mkdir(screenshotDir, { recursive: true });
  const contrastReport = await auditBuiltContrast({ dist, browser });
  await fs.writeFile(
    path.join(screenshotDir, "contrast-report.json"),
    JSON.stringify(contrastReport, null, 2) + "\n",
  );
  if (!contrastReport.pass)
    failures.push(...contrastFailureMessages(contrastReport));
  const routeReport = await verifyApprovedRoutes({
    config,
    origin: url,
    mode: reviewMode ? "review" : "production",
    browser,
    formMode: testPreview ? diagnosticFormMode(config, "review") : "mocked",
    screenshotsDir: path.join(screenshotDir, "approved-routes"),
  });
  await fs.writeFile(
    path.join(screenshotDir, "route-browser-report.json"),
    JSON.stringify(sanitizeVerificationReport(routeReport, config), null, 2) +
      "\n",
  );
  failures.push(...routeReport.failures);
  // The mocked review-image responses point at these files so the attachment
  // thumbnails render with real bytes during the browser flow.
  const mockedThumbnail = await sharp({
    create: {
      width: 160,
      height: 120,
      channels: 3,
      background: { r: 46, g: 89, b: 71 },
    },
  })
    .png()
    .toBuffer();
  for (const relative of [
    "images/feedback/hero-test.png",
    "images/feedback-drafts/test.png",
    "images/feedback-drafts/client.png",
  ]) {
    const file = path.join(dist, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, mockedThumbnail);
  }
  const scopedArtifacts = (
    config.revisionReport?.expectedArtifacts || []
  ).filter((artifact) => artifact.route && artifact.route !== "/");
  for (const route of [
    ...new Set(scopedArtifacts.map((artifact) => artifact.route)),
  ]) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(new URL(route, url).href, { waitUntil: "networkidle" });
      await page
        .locator("details")
        .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
      const body = await page.locator("body").innerText();
      for (const artifact of scopedArtifacts.filter(
        (artifact) => artifact.route === route,
      )) {
        if (
          artifact.type === "text" &&
          (!body.includes(artifact.value) ||
            !(await page
              .getByText(artifact.value, { exact: true })
              .first()
              .isVisible()
              .catch(() => false)))
        )
          failures.push(
            `${route} ${width}: route-targeted text is not visible.`,
          );
        if (
          artifact.type === "page-meta" &&
          (await page
            .locator('meta[name="description"]')
            .getAttribute("content")) !== artifact.value
        )
          failures.push(
            `${route} ${width}: route-targeted metadata is missing.`,
          );
        if (artifact.type === "asset") {
          const image = page.locator("img");
          const images = await image.evaluateAll((nodes) =>
            nodes.map((node) => ({
              src: node.getAttribute("src"),
              loaded:
                node.complete &&
                node.naturalWidth > 0 &&
                node.getBoundingClientRect().width > 0 &&
                node.getBoundingClientRect().height > 0 &&
                getComputedStyle(node).visibility !== "hidden" &&
                getComputedStyle(node).opacity !== "0",
            })),
          );
          if (
            !images.some((image) => image.src === artifact.url && image.loaded)
          )
            failures.push(
              `${route} ${width}: route-targeted image is not visible/loaded.`,
            );
        }
      }
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        failures.push(`${route} ${width}: route-targeted revision overflows.`);
      await page.screenshot({
        path: path.join(
          screenshotDir,
          `route-${route.replace(/[^a-z0-9]/giu, "-")}-${width}.png`,
        ),
        fullPage: true,
      });
      await page.close();
    }
  }
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    if (testPreview) {
      const banner = page.locator("[data-pipeline-test-preview]");
      const profile = config.pipelineTest?.profile;
      const skipped = pipelineTestBannerMessage(profile);
      if (!(await banner.isVisible()) || !(await banner.textContent())?.includes(profile || "invalid profile") || !(await banner.textContent())?.includes(skipped))
        failures.push(`${viewport.name}: test-only profile and skipped lane must be visible.`);
      if (await page.locator(".ll-approve, .ll-send-anyway").count())
        failures.push(`${viewport.name}: test-only preview contains release controls.`);
      if ((await page.locator('meta[name="robots"]').getAttribute("content")) !== "noindex, nofollow" || await page.locator('link[rel="canonical"]').count())
        failures.push(`${viewport.name}: test-only preview must remain unindexed without a production canonical.`);
      for (const form of await page.locator("form.lead-form, form.launchloom-lead-form").all()) {
        if ((await form.getAttribute("data-lead-preview")) !== "true" || await form.locator('[name="lead-token"]').evaluateAll(nodes => nodes.some(node => node.value)))
          failures.push(`${viewport.name}: test-only form exposes a live submission path.`);
      }
    }
    // Astro's inline module islands can finish attaching interaction handlers
    // just after network idle. Give the shared conversion controls one frame
    // to initialize before exercising them.
    await page.waitForTimeout(500);
    if (viewport.name === "desktop") {
      const exitOffer = page.locator('[data-conversion-feature="exit-offer"]');
      if (await exitOffer.count()) {
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo({ top: 700, left: 0, behavior: "auto" });
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
        // Candidate-authored motion can delay the scroll/exit event loop. Wait
        // for the actual dialog state instead of assuming a fixed 100ms frame.
        await page
          .waitForFunction(
            () =>
              document.querySelector('[data-conversion-feature="exit-offer"]')
                ?.open === true,
            null,
            { timeout: 1500 },
          )
          .catch(() => {});
        const exitOpened = await exitOffer.evaluate((element) => element.open);
        if (!exitOpened) {
          failures.push("desktop: eligible exit offer did not open.");
        } else {
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
        if (await panel.isVisible()) {
          failures.push("desktop: Escape did not close quick answers.");
        } else {
          const closeFocus = await quickAnswers.evaluate((root) => {
            const launcher = root.querySelector(".quick-answers__launcher");
            const main = document.querySelector("main");
            return {
              inert: root.inert,
              launcherFocused: document.activeElement === launcher,
              mainFocused: document.activeElement === main,
            };
          });
          if (closeFocus.inert ? !closeFocus.mainFocused : !closeFocus.launcherFocused)
            failures.push(`desktop: closing quick answers did not restore safe focus: ${JSON.stringify(closeFocus)}.`);
        }

        // Add a contact/footer region after the shared assistant has mounted.
        // It must move to a clear slot or suppress itself instead of covering
        // the late-rendered copy and control.
        const hiddenShell = await page.evaluate(() => {
          const targets = [
            ...document.querySelectorAll("header, main, .footer, footer"),
          ];
          return targets.map((element, index) => {
            const key = `quick-answers-shell-${index}`;
            const style = element.getAttribute("style");
            element.setAttribute("data-quick-answers-shell-test", key);
            element.style.visibility = "hidden";
            return { key, style };
          });
        });
        await page.evaluate(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          window.dispatchEvent(new Event("resize"));
        });
        await page.waitForTimeout(100);
        const launcherReady = await page
          .waitForFunction(() => {
            const root = document.querySelector(".quick-answers");
            const launcher = root?.querySelector(".quick-answers__launcher");
            if (!root || !launcher || root.inert) return false;
            const style = getComputedStyle(root);
            const rect = launcher.getBoundingClientRect();
            return style.visibility === "visible" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
          }, null, { timeout: 1000 })
          .then(() => true)
          .catch(() => false);
        if (!launcherReady) {
          failures.push("desktop: could not expose the assistant for the late-footer collision check.");
        } else {
          await page.evaluate(() => {
            const lateFooter = document.createElement("footer");
            lateFooter.className = "footer";
            lateFooter.dataset.quickAnswersLateFooter = "true";
            lateFooter.style.cssText = "position:fixed;left:0;bottom:0;z-index:1000;display:grid;gap:8px;width:360px;height:112px;padding:12px;background:#fff;color:#14201d;border:1px solid #14201d";
            lateFooter.innerHTML = "<p>Contact our team about your service.</p><button type=\"button\">Prepare a request</button>";
            document.body.append(lateFooter);
          });
          const clearAfterHydration = await page
            .waitForFunction(() => {
              const root = document.querySelector(".quick-answers");
              const launcher = root?.querySelector(".quick-answers__launcher");
              const footer = document.querySelector("[data-quick-answers-late-footer]");
              if (!root || !launcher || !footer) return false;
              const style = getComputedStyle(root);
              if (root.inert || style.visibility === "hidden" || Number(style.opacity) === 0) return true;
              const rect = launcher.getBoundingClientRect();
              const collides = (other) =>
                rect.left < other.right && rect.right > other.left &&
                rect.top < other.bottom && rect.bottom > other.top;
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              const range = document.createRange();
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (!node.textContent?.trim() || node.parentElement?.closest(".quick-answers,[hidden],[inert],script,style,template")) continue;
                const parentStyle = getComputedStyle(node.parentElement);
                if (parentStyle.display === "none" || parentStyle.visibility !== "visible" || Number(parentStyle.opacity) === 0) continue;
                range.selectNodeContents(node);
                if ([...range.getClientRects()].some((textRect) => textRect.width > 0 && textRect.height > 0 && collides(textRect))) return false;
              }
              for (const control of document.querySelectorAll("a[href],button,input,select,textarea,summary,[role=button]")) {
                if (control.closest(".quick-answers,[hidden],[inert]")) continue;
                const controlStyle = getComputedStyle(control);
                if (controlStyle.display === "none" || controlStyle.visibility !== "visible" || Number(controlStyle.opacity) === 0) continue;
                const controlRect = control.getBoundingClientRect();
                if (controlRect.width > 0 && controlRect.height > 0 && collides(controlRect)) return false;
              }
              return true;
            }, null, { timeout: 1500 })
            .then(() => true)
            .catch(() => false);
          if (!clearAfterHydration)
            failures.push("desktop: the assistant overlaps text or controls after a contact/footer region renders late.");
          await page.evaluate((hidden) => {
            document.querySelector("[data-quick-answers-late-footer]")?.remove();
            for (const item of hidden) {
              const element = document.querySelector(`[data-quick-answers-shell-test=\"${item.key}\"]`);
              if (!element) continue;
              if (item.style === null) element.removeAttribute("style");
              else element.setAttribute("style", item.style);
              element.removeAttribute("data-quick-answers-shell-test");
            }
            window.dispatchEvent(new Event("resize"));
          }, hiddenShell);
          await page.waitForTimeout(100);

          await quickAnswers.locator(".quick-answers__launcher").click();
          await page.waitForFunction(() => {
            const root = document.querySelector(".quick-answers");
            return root && !root.inert && !root.querySelector(".quick-answers__panel")?.hidden;
          });
          await page.evaluate(() => {
            const blocker = document.createElement("button");
            blocker.dataset.quickAnswersFocusBlocker = "true";
            blocker.textContent = "Focus collision blocker";
            blocker.style.cssText = "position:fixed;inset:0;z-index:1000;margin:0;padding:0;border:0;background:transparent;color:transparent;pointer-events:none";
            document.body.append(blocker);
          });
          await quickAnswers.locator(".quick-answers__close").click();
          const blockedClose = await page
            .waitForFunction(() => document.querySelector(".quick-answers")?.inert, null, { timeout: 1500 })
            .then(() =>
              page.evaluate(() => {
                const root = document.querySelector(".quick-answers");
                const main = document.querySelector("main");
                return {
                  inert: root?.inert,
                  focusInsideAssistant: Boolean(root?.contains(document.activeElement)),
                  mainFocused: document.activeElement === main,
                };
              }),
            )
            .catch(() => null);
          if (!blockedClose?.inert || blockedClose.focusInsideAssistant || !blockedClose.mainFocused)
            failures.push(`desktop: closing an assistant that must become inert did not move focus to page content: ${JSON.stringify(blockedClose)}.`);
          await page.evaluate(() => {
            document.querySelector("[data-quick-answers-focus-blocker]")?.remove();
            window.dispatchEvent(new Event("resize"));
          });
          await page.waitForFunction(() => {
            const root = document.querySelector(".quick-answers");
            return root && !root.inert;
          });
        }
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
        if (await panel.isVisible()) {
          failures.push("desktop: Escape did not close AI chat.");
        } else {
          const closeFocus = await aiChat.evaluate((root) => {
            const launcher = root.querySelector(".quick-answers__launcher");
            const main = document.querySelector("main");
            return {
              inert: root.inert,
              launcherFocused: document.activeElement === launcher,
              mainFocused: document.activeElement === main,
            };
          });
          if (closeFocus.inert ? !closeFocus.mainFocused : !closeFocus.launcherFocused)
            failures.push(`desktop: closing AI chat did not restore safe focus: ${JSON.stringify(closeFocus)}.`);
        }
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

      const quickAnswers = page.locator('[data-conversion-feature="quick-answers"]');
      if (await quickAnswers.count()) {
        const launcher = quickAnswers.locator(".quick-answers__launcher");
        const panel = quickAnswers.locator(".quick-answers__panel");
        const closedPosition = await quickAnswers.evaluate((element) => getComputedStyle(element).position);
        if (closedPosition !== "static")
          failures.push("mobile: quick-answer launcher is fixed over page content instead of remaining in flow.");
        if (await panel.isVisible())
          failures.push("mobile: quick answers opened without visitor action.");
        await launcher.click();
        if (!(await panel.isVisible()))
          failures.push("mobile: quick answers did not open.");
        const openLayout = await quickAnswers.evaluate((root) => {
          const launcherElement = root.querySelector(".quick-answers__launcher");
          const panelElement = root.querySelector(".quick-answers__panel");
          const main = document.querySelector("main");
          const rootRect = root.getBoundingClientRect();
          const launcherRect = launcherElement.getBoundingClientRect();
          const panelRect = panelElement.getBoundingClientRect();
          const panelStyle = getComputedStyle(panelElement);
          return {
            rootPosition: getComputedStyle(root).position,
            panelPosition: panelStyle.position,
            panelMaxHeight: panelStyle.maxHeight,
            panelOverflowY: panelStyle.overflowY,
            panelClipped:
              panelStyle.overflowY !== "visible" &&
              panelElement.scrollHeight > panelElement.clientHeight + 1,
            rootAfterMain: !main || rootRect.top >= main.getBoundingClientRect().bottom,
            panelAfterLauncher: panelRect.top >= launcherRect.bottom,
          };
        });
        if (openLayout.rootPosition !== "static" || openLayout.panelPosition !== "static" || openLayout.panelMaxHeight !== "none" || openLayout.panelClipped || !openLayout.rootAfterMain || !openLayout.panelAfterLauncher)
          failures.push(`mobile: quick-answer panel is not in-flow and unclipped: ${JSON.stringify(openLayout)}.`);
        await quickAnswers.locator(".quick-answers__close").click();
        if ((await launcher.getAttribute("aria-expanded")) !== "false" || !(await launcher.evaluate((element) => document.activeElement === element)))
          failures.push("mobile: closing quick answers did not restore its collapsed state and focus.");
      }
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
      // Authored candidates are mounted inside the deterministic creative host
      // and may choose their own root element. Verify the host's sections when
      // present, while preserving the classic main-section check for packs.
      const sectionRoot =
        document.querySelector("[data-creative-host]") ||
        document.querySelector("main");
      const sections = [
        ...(sectionRoot?.querySelectorAll("section") || []),
      ].map((element) => ({
        id: element.id,
        classes: element.className,
        sectionType: element.getAttribute("data-section-type"),
        text: element.textContent?.replace(/\s+/g, " ").trim() || "",
        visible: visible(element),
      }));
      const brokenLinks = [...document.querySelectorAll("a[href]")]
        .map((element) => element.getAttribute("href"))
        .filter(
          (href) =>
            href === "#" ||
            (href?.startsWith("#") && !document.querySelector(href)),
        );
      const main = document.querySelector("main") || sectionRoot;
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
        brokenLinks,
        mainClasses: main?.className || "",
        experiencePack:
          document
            .querySelector("[data-experience-pack]")
            ?.getAttribute("data-experience-pack") || "",
        experienceVariant:
          document
            .querySelector("[data-experience-pack]")
            ?.getAttribute("data-experience-variant") || "",
        creativeCandidateId:
          document
            .querySelector("[data-creative-candidate]")
            ?.getAttribute("data-creative-candidate") || "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim() || "",
        overflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - innerWidth,
        css: getComputedStyle(document.body).cssText,
        pageBackground: getComputedStyle(document.body).backgroundColor,
        creativeColors: Object.fromEntries(
          [
            "--ll-creative-page",
            "--ll-creative-hero",
            "--ll-creative-ink",
            "--ll-creative-line",
            "--ll-creative-primary",
            "--ll-creative-accent",
          ].map((variable) => [
            variable,
            getComputedStyle(document.documentElement)
              .getPropertyValue(variable)
              .trim(),
          ]),
        ),
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
        feedbackImages: [...document.images]
          .filter((image) => {
            const source = image.getAttribute("src") || "";
            return (
              source.includes("/images/feedback/") ||
              source.includes("/client-replacements/")
            );
          })
          .map((image) => ({
            src: image.currentSrc || image.src,
            placements: (() => {
              const labels = [];
              for (
                let region = image.parentElement;
                region;
                region = region.parentElement
              ) {
                labels.push(
                  [
                    region.tagName === "HEADER" ? "header" : "",
                    region.id,
                    region.className,
                    region.getAttribute("data-reference-section"),
                    region.getAttribute("data-section-type"),
                    region.hasAttribute("data-hero") ? "hero" : "",
                  ]
                    .join(" ")
                    .toLowerCase(),
                );
              }
              return labels;
            })(),
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            visible:
              visible(image) &&
              (() => {
                for (
                  let parent = image;
                  parent;
                  parent = parent.parentElement
                ) {
                  const style = getComputedStyle(parent);
                  if (
                    style.display === "none" ||
                    style.visibility === "hidden" ||
                    Number(style.opacity) === 0
                  )
                    return false;
                }
                return true;
              })(),
          })),
      };
    });
    if (state.overflow > 1)
      failures.push(
        `${viewport.name}: horizontal overflow of ${state.overflow}px.`,
      );
    if (creativeExperience) {
      const expectedCandidate = String(
        config.design?.experience?.candidateId || "",
      );
      if (!state.creativeCandidateId)
        failures.push(
          `${viewport.name}: authored creative candidate is not mounted.`,
        );
      else if (
        expectedCandidate &&
        state.creativeCandidateId !== expectedCandidate
      )
        failures.push(
          `${viewport.name}: rendered creative candidate ${state.creativeCandidateId} does not match ${expectedCandidate}.`,
        );
    } else if (config.design?.experience?.blueprintVersion === 2) {
      const expectedPack = String(config.design.experience.packId || "");
      const expectedVariant = String(config.design.experience.variantId || "");
      if (expectedPack && state.experiencePack !== expectedPack)
        failures.push(
          `${viewport.name}: rendered experience pack ${state.experiencePack || "none"} does not match ${expectedPack}.`,
        );
      if (
        expectedPack &&
        expectedVariant &&
        state.experienceVariant !== expectedVariant
      )
        failures.push(
          `${viewport.name}: rendered experience variant ${state.experienceVariant || "none"} does not match ${expectedVariant}.`,
        );
    }
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
    for (const artifact of config.revisionReport?.expectedArtifacts || []) {
      if (artifact.route && artifact.route !== "/") continue;
      if (artifact.type === "creative-color") {
        if (
          state.creativeColors[artifact.variable]?.toLowerCase() !==
          artifact.value.toLowerCase()
        )
          failures.push(
            `${viewport.name}: requested ${artifact.field} is not bound to the rendered candidate.`,
          );
        if (
          artifact.field === "surfaceColor" &&
          JSON.stringify(parseCssColor(state.pageBackground).slice(0, 3)) !==
            JSON.stringify(parseCssColor(artifact.value).slice(0, 3))
        )
          failures.push(
            `${viewport.name}: requested page background is not rendered: ${artifact.value}.`,
          );
      }
      if (artifact.type === "text" && !state.bodyText.includes(artifact.value))
        failures.push(
          `${viewport.name}: requested text is not visible: ${artifact.value.slice(0, 70)}.`,
        );
      if (artifact.type === "image" || artifact.type === "asset") {
        const rendered = state.feedbackImages.find((image) =>
          revisionImageMatches(image, artifact, url),
        );
        if (!rendered)
          failures.push(
            `${viewport.name}: requested ${artifact.target || artifact.placement || "replacement"} image is not rendered in its requested placement: ${artifact.path || artifact.url}.`,
          );
      }
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
  const submittedPayloads = [];
  let uploadedFeedbackImage = false;
  let feedbackAttempt = 0;
  await reviewPage.route("**/api/feedback-image", async (route) => {
    const request = route.request();
    if (
      (request.headers()["content-type"] || "").includes("multipart/form-data")
    ) {
      uploadedFeedbackImage = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          target: "hero",
          url: `${new URL(url).origin}/images/feedback/hero-test.png`,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        model: "fal-ai/minimax/image-01",
        images: [
          { url: `${new URL(url).origin}/images/feedback-drafts/test.png` },
        ],
      }),
    });
  });
  await reviewPage.route("**/api/feedback", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");
    submittedIds.push(payload.submissionId);
    submittedPayloads.push(payload);
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
    // Select a structured part, attach a replacement image, and pick a brand
    // color so the verification exercises the rich feedback payload.
    await reviewRoot.locator('[data-part="hero"]').click();
    await reviewRoot.locator('[data-part-file="hero"]').setInputFiles({
      name: "hero.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await reviewRoot
      .locator('[data-part-preview="hero"]')
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() =>
        failures.push("review: uploaded replacement image shows no preview."),
      );
    const heroThumbWidth = await reviewRoot
      .locator('[data-part-preview="hero"] .ll-attachment__thumb img')
      .evaluate((image) => image.naturalWidth)
      .catch(() => 0);
    if (!heroThumbWidth)
      failures.push("review: uploaded replacement thumbnail did not load.");
    await reviewRoot.locator('[data-part="colors"]').click();
    const primaryColor = reviewRoot.locator(".ll-color").first();
    await primaryColor.locator('input[type="checkbox"]').check();
    await primaryColor.locator('input[type="color"]').evaluate((input) => {
      input.value = "#123456";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (
      !(await primaryColor.locator("code").textContent())?.includes("#123456")
    )
      failures.push("review: color choice did not update its swatch value.");
    await reviewPage.screenshot({
      path: path.join(screenshotDir, "developer-feedback-structured.png"),
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
      .getByText("Queued. Your request will start after the current update.")
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
    const structured = submittedPayloads[0] || {};
    if (
      !structured.details?.attachments?.some(
        (attachment) =>
          attachment.target === "hero" && attachment.kind === "upload",
      )
    )
      failures.push("review: uploaded replacement was not submitted.");
    if (!structured.details?.colors?.some((color) => color.role === "primary"))
      failures.push("review: color choice was not submitted.");
    if (!uploadedFeedbackImage)
      failures.push("review: image upload endpoint was not called.");
  }
  await reviewPage.close();

  // The signed client link uses the same banner with the bounded small-change
  // form, including colour picking and generated replacement images.
  const clientReviewPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  let clientGeneratedImage = false;
  await clientReviewPage.route("**/api/feedback-image", async (route) => {
    clientGeneratedImage = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        model: "fal-ai/minimax/image-01",
        images: [
          { url: `${new URL(url).origin}/images/feedback-drafts/client.png` },
        ],
      }),
    });
  });
  const clientClaims = Buffer.from(
    JSON.stringify({
      stage: "client",
      reviewerEmail: "client@example.com",
    }),
  ).toString("base64url");
  await clientReviewPage.goto(`${url}?review=${clientClaims}.test-signature`, {
    waitUntil: "networkidle",
  });
  const clientRoot = clientReviewPage.locator("#ll-review");
  if (await clientRoot.isVisible()) {
    await clientRoot.locator(".ll-feedback-open").click();
    const categorySelect = clientRoot
      .locator(".ll-client-fields select")
      .first();
    if (!(await categorySelect.isVisible()))
      failures.push("review: client small-change categories are missing.");
    await clientRoot.locator('input[name="email"]').fill("client@example.com");
    await categorySelect.selectOption("logo");
    await clientRoot
      .locator(".ll-client-fields textarea")
      .first()
      .fill("A minimal lighthouse mark in navy");
    await clientRoot
      .locator('.ll-client-fields button:has-text("Create an image")')
      .click();
    await clientRoot
      .locator(".ll-client-fields .ll-attachment__thumb img")
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() =>
        failures.push("review: client generated image shows no preview."),
      );
    const clientThumbWidth = await clientRoot
      .locator(".ll-client-fields .ll-attachment__thumb img")
      .evaluate((image) => image.naturalWidth)
      .catch(() => 0);
    if (!clientThumbWidth)
      failures.push("review: client generated thumbnail did not load.");
    await clientReviewPage.screenshot({
      path: path.join(screenshotDir, "client-feedback-image.png"),
    });
    await categorySelect.selectOption("color");
    if (
      !(await clientRoot
        .locator('.ll-client-fields input[type="color"]')
        .first()
        .isVisible())
    )
      failures.push("review: client colour picker is missing.");
    await clientReviewPage.screenshot({
      path: path.join(screenshotDir, "client-feedback.png"),
    });
    if (!clientGeneratedImage)
      failures.push("review: client generation endpoint was not called.");
  }
  await clientReviewPage.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length)
  throw new Error(
    `Rendered revision verification failed: ${[...new Set(failures)].join(" ")}`,
  );
console.log(`rendered_revision_verified=true screenshots=${screenshotDir}`);
