import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadGoldReferenceLibrary } from "./gold-reference-library.mjs";

function argsFrom(argv) {
  return Object.fromEntries(
    argv.slice(2).reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
  );
}

const VIEWPORTS = [
  { id: "desktop", width: 1536, height: 864 },
  { id: "compact", width: 1366, height: 768 },
  { id: "mobile", width: 390, height: 844 },
];

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll("video")) {
      try {
        node.pause();
      } catch {}
    }
    document.documentElement.style.scrollBehavior = "auto";
  });
}

async function pageMeasurements(page, viewport) {
  return page.evaluate(({ width, height }) => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(box.x * 100) / 100,
        y: Math.round(box.y * 100) / 100,
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
        fontSize: parseFloat(style.fontSize) || null,
        lineHeight: parseFloat(style.lineHeight) || null,
        display: style.display,
        position: style.position,
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    };
    const h1 = document.querySelector("h1");
    const nav = document.querySelector("nav") || document.querySelector("header");
    const main = document.querySelector("main") || document.body;
    const sections = [
      ...main.querySelectorAll(":scope > section, :scope > article, section"),
    ]
      .filter((section, index, all) => all.indexOf(section) === index)
      .slice(0, 14)
      .map((section, index) => ({
        index,
        id: section.id || "",
        rect: rect(section),
      }));
    const hero =
      h1?.closest("section, article, header, main > div") ||
      (sections.length
        ? document.querySelector("main > section, main > article, main > div")
        : null);
    const images = [...document.images].slice(0, 20).map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt || "",
      rect: rect(image),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
    return {
      viewport: { width, height },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      nav: rect(nav),
      headline: rect(h1),
      hero: rect(hero),
      heroBottomRatio: hero
        ? Math.round((hero.getBoundingClientRect().bottom / height) * 1000) /
          1000
        : null,
      sections,
      images,
    };
  }, viewport);
}

async function screenshotSemanticCrops(page, outputDir) {
  const targets = [
    ["navigation", "nav, header"],
    [
      "hero",
      "main > section:first-of-type, main > article:first-of-type, main > div:first-of-type",
    ],
  ];
  for (let i = 2; i <= 5; i += 1)
    targets.push([`section-${i}`, `main > section:nth-of-type(${i})`]);
  const written = [];
  for (const [id, selector] of targets) {
    const locator = page.locator(selector).first();
    if (!(await locator.count())) continue;
    try {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box || box.width < 40 || box.height < 40 || box.height > 3000)
        continue;
      const file = path.join(outputDir, `${id}.png`);
      await locator.screenshot({ path: file, animations: "disabled" });
      written.push(path.basename(file));
    } catch {
      // Heuristic crop failures are non-fatal; full-page and viewport evidence
      // remain authoritative.
    }
  }
  return written;
}

const args = argsFrom(process.argv);
if (args["acknowledge-reference-only"] !== "true") {
  throw new Error(
    "Capture requires --acknowledge-reference-only true. Evidence is internal reference material only and must not be republished as owned creative work.",
  );
}
const catalogPath = path.resolve(
  args.catalog || "data/gold-reference-candidates.json",
);
const id = String(args.id || "").trim();
if (!id) throw new Error("--id is required.");
const library = await loadGoldReferenceLibrary(catalogPath);
const reference = library.records.find((record) => record.id === id);
if (!reference) throw new Error(`Unknown Gold reference '${id}'.`);
const root = path.resolve(
  args.out || `data/inspiration-evidence/gold/${id}`,
);
await fs.mkdir(root, { recursive: true });

const browser = await chromium.launch({ headless: true });
const evidence = {
  version: 1,
  id,
  sourceUrl: reference.sourceUrl,
  capturedAt: new Date().toISOString(),
  viewports: {},
};
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(reference.sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: Number(args.timeout || 60000),
    });
    await settle(page);
    const viewportPath = path.join(root, `${viewport.id}-viewport.png`);
    const fullPath = path.join(root, `${viewport.id}-full.png`);
    await page.screenshot({
      path: viewportPath,
      fullPage: false,
      animations: "disabled",
    });
    await page.screenshot({
      path: fullPath,
      fullPage: true,
      animations: "disabled",
    });
    const measurements = await pageMeasurements(page, viewport);
    const cropsDir = path.join(root, "crops", viewport.id);
    await fs.mkdir(cropsDir, { recursive: true });
    const crops = await screenshotSemanticCrops(page, cropsDir);
    evidence.viewports[viewport.id] = {
      width: viewport.width,
      height: viewport.height,
      viewportScreenshot: path.relative(process.cwd(), viewportPath),
      fullPageScreenshot: path.relative(process.cwd(), fullPath),
      crops: crops.map((file) =>
        path.relative(process.cwd(), path.join(cropsDir, file)),
      ),
      measurements,
      finalUrl: page.url(),
      title: await page.title(),
    };
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(root, "evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    id,
    output: root,
    viewports: Object.keys(evidence.viewports),
  }),
);
