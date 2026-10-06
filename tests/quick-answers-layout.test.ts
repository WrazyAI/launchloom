import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

let browser: Browser;
let siteCss: string;
let layoutSource: string;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  siteCss = await fs.readFile(
    "templates/client-site/src/styles/site.css",
    "utf8",
  );
  layoutSource = await fs.readFile(
    "templates/client-site/src/lib/quick-answers-layout.mjs",
    "utf8",
  );
});

function browserLayoutSource() {
  return layoutSource
    .replace(
      "export function installQuickAnswersLayout",
      "window.installQuickAnswersLayout = function",
    )
    .replace(
      "export function focusQuickAnswersFallback(focusWasInside)",
      "window.focusQuickAnswersFallback = function (focusWasInside)",
    );
}

afterAll(async () => {
  await browser?.close();
});

describe("quick-answer mobile layout", () => {
  it("keeps the launcher and expanded answers in page flow without an internal clip", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const choices = Array.from(
      { length: 18 },
      (_, index) =>
        `<button type="button">Question ${index + 1}: what should I prepare before our first conversation?</button>`,
    ).join("");
    try {
      await page.setContent(`
        <style>${siteCss}</style>
        <body style="--brand:#205d51;--on-brand:#fff;--ink:#14201d;--muted:#53605b;--line:#d8ded7;--cream:#f8f6f0;--hero-surface:#e8eee5">
          <main style="min-height:900px">
            <p>Visible service copy above the shared assistant.</p>
            <a href="#contact">Discuss the service</a>
          </main>
          <aside class="quick-answers is-open">
            <button class="quick-answers__launcher" aria-expanded="true">Got questions?</button>
            <section class="quick-answers__panel">
              <header><h2>Common questions</h2></header>
              <p class="quick-answers__greeting">A practical answer before you contact us.</p>
              <div class="quick-answers__choices">${choices}</div>
            </section>
          </aside>
        </body>
      `);

      const layout = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".quick-answers")!;
        const main = document.querySelector<HTMLElement>("main")!;
        const launcher = root.querySelector<HTMLElement>(
          ".quick-answers__launcher",
        )!;
        const panel = root.querySelector<HTMLElement>(".quick-answers__panel")!;
        const rootRect = root.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const launcherRect = launcher.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return {
          rootPosition: getComputedStyle(root).position,
          panelPosition: getComputedStyle(panel).position,
          panelClipped:
            getComputedStyle(panel).overflowY !== "visible" &&
            panel.scrollHeight > panel.clientHeight + 1,
          assistantFollowsContent: rootRect.top >= mainRect.bottom,
          panelFollowsLauncher: panelRect.top >= launcherRect.bottom,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });

      expect(layout).toEqual({
        rootPosition: "static",
        panelPosition: "static",
        panelClipped: false,
        assistantFollowsContent: true,
        panelFollowsLauncher: true,
        horizontalOverflow: false,
      });
    } finally {
      await page.close();
    }
  });

  it("rechecks meaningful style changes without rescanning decorative mutations", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await page.setContent(`
        <style>${siteCss}</style>
        <body style="--brand:#205d51;--on-brand:#fff;--ink:#14201d;--muted:#53605b;--line:#d8ded7;--cream:#f8f6f0;--hero-surface:#e8eee5">
          <main><p id="copy">Visible service copy above the assistant.</p><button id="control" type="button">Contact the team</button><span id="decoration" aria-hidden="true"></span></main>
          <aside class="quick-answers">
            <button class="quick-answers__launcher" aria-expanded="false">Got questions?</button>
            <section class="quick-answers__panel" hidden></section>
          </aside>
        </body>
      `);
      await page.addScriptTag({
        content: browserLayoutSource(),
      });
      await page.evaluate(() => {
        const launcher = document.querySelector<HTMLElement>(
          ".quick-answers__launcher",
        )!;
        const getRect = launcher.getBoundingClientRect.bind(launcher);
        (window as any).layoutRefreshCount = 0;
        launcher.getBoundingClientRect = () => {
          (window as any).layoutRefreshCount += 1;
          return getRect();
        };
        (window as any).installQuickAnswersLayout(
          document.querySelector(".quick-answers"),
        );
      });
      await page.waitForTimeout(100);
      const initialRefreshes = await page.evaluate(
        () => (window as any).layoutRefreshCount,
      );

      await page.locator("#decoration").evaluate((element) => {
        (element as HTMLElement).style.backgroundColor = "red";
      });
      await page.waitForTimeout(50);
      expect(
        await page.evaluate(() => (window as any).layoutRefreshCount),
      ).toBe(initialRefreshes);

      await page.locator("#control").evaluate((element) => {
        (element as HTMLElement).style.backgroundColor = "red";
      });
      await page.waitForFunction(
        (initial) => (window as any).layoutRefreshCount > initial,
        initialRefreshes,
      );
    } finally {
      await page.close();
    }
  });
});

describe("quick-answer close focus", () => {
  it("moves focus to page content before a colliding assistant becomes inert", async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await page.setContent(`
        <style>${siteCss}</style>
        <body style="--brand:#205d51;--on-brand:#fff;--ink:#14201d;--muted:#53605b;--line:#d8ded7;--cream:#f8f6f0;--hero-surface:#e8eee5">
          <main><h1>Service information</h1><p>Visible page content.</p></main>
          <aside class="quick-answers is-open">
            <button class="quick-answers__launcher" aria-expanded="true">Got questions?</button>
            <section class="quick-answers__panel"><button class="quick-answers__close" type="button">Close</button></section>
          </aside>
        </body>
      `);
      await page.addScriptTag({
        content: browserLayoutSource(),
      });
      const state = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".quick-answers")!;
        const main = document.querySelector<HTMLElement>("main")!;
        const panel = root.querySelector<HTMLElement>(".quick-answers__panel")!;
        const close = root.querySelector<HTMLButtonElement>(
          ".quick-answers__close",
        )!;
        const blocker = document.createElement("button");
        blocker.style.cssText =
          "position:fixed;inset:0;z-index:1000;margin:0;padding:0;border:0;background:transparent;color:transparent;pointer-events:none";
        document.body.append(blocker);
        const layout = (window as any).installQuickAnswersLayout(root);
        close.focus();
        const focusWasInside = root.contains(document.activeElement);
        panel.hidden = true;
        root.classList.remove("is-open");
        (window as any).focusQuickAnswersFallback(focusWasInside);
        layout.refresh();
        return {
          inert: root.inert,
          focusInsideAssistant: root.contains(document.activeElement),
          mainFocused: document.activeElement === main,
        };
      });
      expect(state).toEqual({
        inert: true,
        focusInsideAssistant: false,
        mainFocused: true,
      });
    } finally {
      await page.close();
    }
  });
});
