import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { resolvePalette } from "./palette-policy.mjs";
import { contrast, parseCssColor } from "./color-contrast.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(repository, "artifacts/experience-pack-demos"),
);
const demos = [
  {
    slug: "cinematic-narrative",
    fixture: "architecture.json",
    packId: "cinematic-narrative",
  },
  { slug: "bold-utility", fixture: "home-care.json", packId: "bold-utility" },
  {
    slug: "kinetic-poster",
    fixture: "garage-door.json",
    packId: "kinetic-poster",
  },
];
// A dark requested palette must not place light text on a pack's fixed light
// surfaces, nor dark text on its dark surfaces. Each pack is re-rendered with
// an inverted palette and audited for readable contrast.
const darkPalette = {
  surfaceColor: "#111315",
  heroColor: "#1d1f21",
  inkColor: "#f7f7f2",
  mutedColor: "#a0a09e",
  lineColor: "#3f4141",
};
const palettes = [
  { name: "light", style: null },
  { name: "dark", style: darkPalette },
];
const renderTargets = palettes.flatMap((palette) =>
  demos.map((demo) => ({
    ...demo,
    slug: `${demo.slug}-${palette.name}`,
    demoSlug: demo.slug,
    palette: palette.name,
    paletteStyle: palette.style,
  })),
);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function listHtmlFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listHtmlFiles(target);
      return entry.isFile() && entry.name.endsWith(".html") ? [target] : [];
    }),
  );
  return nested.flat();
}

function portableTarget(siteRoot, htmlFile, absoluteTarget) {
  const delimiter = absoluteTarget.search(/[?#]/u);
  const pathname =
    delimiter < 0 ? absoluteTarget : absoluteTarget.slice(0, delimiter);
  const suffix = delimiter < 0 ? "" : absoluteTarget.slice(delimiter);
  const normalized = pathname.replace(/^\/+/, "");
  const target =
    normalized.endsWith("/") || normalized === ""
      ? path.join(siteRoot, normalized, "index.html")
      : path.join(siteRoot, normalized);
  let relative = path
    .relative(path.dirname(htmlFile), target)
    .replaceAll(path.sep, "/");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `${relative}${suffix}`;
}

async function makeSitePortable(siteRoot) {
  for (const htmlFile of await listHtmlFiles(siteRoot)) {
    const html = await fs.readFile(htmlFile, "utf8");
    const portable = html.replace(
      /\b(href|src)=(['"])(\/(?!\/)[^'"]*)\2/gu,
      (_match, attribute, quote, target) =>
        `${attribute}=${quote}${portableTarget(siteRoot, htmlFile, target)}${quote}`,
    );
    await fs.writeFile(htmlFile, portable);
  }
}

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });

for (const demo of renderTargets) {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), `launchloom-pack-${demo.slug}-`),
  );
  try {
    await fs.cp(path.join(repository, "templates/client-site"), workspace, {
      recursive: true,
      filter: (source) =>
        !source.includes(`${path.sep}node_modules`) &&
        !source.includes(`${path.sep}dist`),
    });
    await fs.symlink(
      path.join(repository, "templates/client-site/node_modules"),
      path.join(workspace, "node_modules"),
      "dir",
    );
    const config = JSON.parse(
      await fs.readFile(
        path.join(repository, "fixtures/design-demos", demo.fixture),
        "utf8",
      ),
    );
    config.design ||= { recipe: "general-editorial", sections: [] };
    config.design.experience = { packId: demo.packId };
    config.style = {
      ...config.style,
      ...resolvePalette({
        primaryColor: config.style?.primaryColor,
        ...(demo.paletteStyle || {}),
      }),
    };
    await fs.writeFile(
      path.join(workspace, "src/site.config.json"),
      JSON.stringify(config, null, 2),
    );
    await run("npm", ["run", "build"], workspace);
    await fs.cp(path.join(workspace, "dist"), path.join(output, demo.slug), {
      recursive: true,
    });
    await makeSitePortable(path.join(output, demo.slug));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    let target = path.resolve(output, `.${pathname}`);
    if (!target.startsWith(`${output}${path.sep}`) && target !== output)
      throw new Error("Invalid path");
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = path.join(target, "index.html");
    response.setHeader(
      "content-type",
      contentTypes[path.extname(target)] || "application/octet-stream",
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
  throw new Error("Could not start demo server");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const packFingerprints = new Map();

// Samples every visible element that owns direct text, so a pack cannot render
// light text on a light surface (or dark text on a dark surface) for either a
// light or a dark requested palette.
const textContrastFailures = (samples, label) => {
  const failures = [];
  for (const sample of samples) {
    if (
      !parseCssColor(sample.color).length ||
      !parseCssColor(sample.background).length
    )
      continue;
    const minimum =
      sample.fontSize >= 24 || (sample.fontSize >= 18.66 && sample.fontWeight >= 700)
        ? 3
        : 4.5;
    const ratio = contrast(sample.color, sample.background);
    if (ratio < minimum)
      failures.push({ label, ...sample, ratio: Number(ratio.toFixed(2)), minimum });
  }
  return failures;
};

const sampleText = (page) =>
  page.evaluate(() => {
    const effectiveBackground = (start) => {
      let current = start;
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
    const directText = (element) =>
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join("");
    const selectors = [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "summary",
      "li",
      "strong",
      "label",
      "legend",
      "button",
      "a",
      "span",
      "b",
      "small",
      "figcaption",
    ];
    return [...document.querySelectorAll(selectors.join(","))]
      .filter((element) => directText(element).length > 1 && element.getClientRects().length)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          text: directText(element).replace(/\s+/g, " ").slice(0, 40),
          color: style.color,
          background: effectiveBackground(element),
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        };
      });
  });

try {
  for (const demo of renderTargets) {
    for (const viewport of [
      { name: "desktop", width: 1536, height: 864 },
      { name: "desktop-compact", width: 1366, height: 768 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      const browserErrors = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      await page.goto(`${origin}/${demo.slug}/`, { waitUntil: "networkidle" });
      const result = await page.evaluate(() => {
        const root = document.querySelector("[data-experience-pack]");
        const visitorContent = [document.title, document.body.innerText]
          .filter(Boolean)
          .join("\n");
        const mainSections = [
          ...document.querySelectorAll("main > section, main > aside"),
        ];
        const hero = document.querySelector(
          ".xp-folio__hero, .xp-guide__hero, .xp-service__hero",
        );
        const heroBounds = hero?.getBoundingClientRect();
        return {
          packId: root?.getAttribute("data-experience-pack"),
          fingerprint: root?.getAttribute("data-layout-fingerprint"),
          h1: document.querySelectorAll("h1").length,
          nav: [
            ...document.querySelectorAll('nav[aria-label="Main navigation"] a'),
          ].map((link) => link.textContent?.trim()),
          earlyConversion: mainSections[1]?.className || "",
          heroBottom: Math.round(heroBounds?.bottom || 0),
          viewportHeight: window.innerHeight,
          heroFitsViewport:
            !heroBounds || heroBounds.bottom <= window.innerHeight + 1,
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
          emDashes: (visitorContent.match(/—/g) || []).length,
          brokenImages: [...document.images]
            .filter((image) => image.complete && image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src),
          brokenFragments: [...document.querySelectorAll('a[href^="#"]')]
            .map((link) => link.getAttribute("href"))
            .filter(
              (href) => href && href !== "#" && !document.querySelector(href),
            ),
        };
      });
      if (
        result.packId !== demo.packId ||
        !result.fingerprint ||
        result.h1 !== 1 ||
        result.nav.join("|") !== "Services|FAQs|Contact" ||
        !/(ribbon|qualifier|request)/u.test(result.earlyConversion) ||
        (viewport.name.startsWith("desktop") && !result.heroFitsViewport) ||
        result.overflow ||
        result.emDashes ||
        result.brokenImages.length ||
        browserErrors.length ||
        result.brokenFragments.length
      ) {
        throw new Error(
          `${demo.slug} failed at ${viewport.width}px: ${JSON.stringify({ ...result, browserErrors })}`,
        );
      }
      packFingerprints.set(demo.packId, result.fingerprint);
      await page.screenshot({
        path: path.join(
          output,
          "screenshots",
          `${demo.slug}-${viewport.name}.png`,
        ),
        fullPage: true,
      });
      const contrastFailures = textContrastFailures(
        await sampleText(page),
        `${demo.slug} ${viewport.name}`,
      );
      const qualifier = page.locator(".qualifier-option").first();
      if (await qualifier.isVisible().catch(() => false)) {
        await qualifier.click();
        await page.waitForTimeout(200);
        contrastFailures.push(
          ...textContrastFailures(
            await sampleText(page),
            `${demo.slug} ${viewport.name} checked`,
          ),
        );
      }
      if (contrastFailures.length)
        throw new Error(
          `${demo.slug} text contrast failed at ${viewport.width}px: ${JSON.stringify(contrastFailures)}`,
        );
      if (
        demo.demoSlug === "cinematic-narrative" &&
        viewport.name === "desktop"
      ) {
        const leadForm = page.locator("#folio-lead");
        for (let step = 0; step < 10; step += 1) {
          if (await leadForm.locator('input[name="name"]').isVisible()) break;
          const option = leadForm
            .locator("[data-lead-step]:not([hidden]) .qualifier-option")
            .first();
          if (!(await option.isVisible()))
            throw new Error(
              "Editorial demo qualifier did not reach its contact step",
            );
          await option.click();
          await page.waitForTimeout(160);
        }
        await leadForm.locator('input[name="name"]').fill("Test User");
        await leadForm.locator('input[name="phone"]').fill("123-456-7890");
        await leadForm.locator('input[name="email"]').fill("test@example.com");
        await leadForm
          .locator('textarea[name="message"]')
          .fill("Local demo inquiry");
        await leadForm.locator('button[type="submit"]').click();
        const formStatus = await leadForm.locator(".lead-status").textContent();
        if (
          formStatus?.trim() !==
          "This form is not configured yet. Please call us instead."
        )
          throw new Error(
            `Editorial demo form fallback is not truthful: ${formStatus}`,
          );
      }
      await page.close();
      console.log(
        `verified_pack=${demo.slug} viewport=${viewport.width} overflow=false`,
      );
    }
  }
  if (new Set(packFingerprints.values()).size !== demos.length)
    throw new Error(
      `Expected ${demos.length} structural fingerprints, got ${new Set(packFingerprints.values()).size}`,
    );
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

const cards = renderTargets
  .map(
    (demo) => `
  <a href="./${demo.slug}/index.html">
    <img src="./screenshots/${demo.slug}-desktop.png" alt="${demo.slug.replaceAll("-", " ")} desktop preview">
    <span>${demo.packId.replaceAll("-", " ")} (${demo.palette})</span>
  </a>`,
  )
  .join("");
await fs.writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>LaunchLoom experience packs</title><style>*{box-sizing:border-box}body{margin:0;padding:clamp(24px,6vw,80px);background:#111;color:#fff;font-family:Arial,sans-serif}header{max-width:900px;margin-bottom:60px}h1{font:400 clamp(52px,8vw,112px)/.86 Georgia,serif;letter-spacing:-.07em;margin:12px 0 24px}p{max-width:650px;color:#aaa;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.grid a{display:grid;gap:16px;color:#fff;text-decoration:none;text-transform:capitalize;font-weight:800}.grid img{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:top;border:1px solid #333}@media(max-width:850px){.grid{grid-template-columns:1fr}}</style></head><body><header><small>Compiled production-template outputs</small><h1>Three structures, not three skins.</h1><p>Each output owns its navigation, opening, early conversion, services, rhythm, and mobile behavior while sharing verified facts, SEO, forms, and release safeguards.</p></header><main class="grid">${cards}</main></body></html>`,
);

console.log(`experience_pack_index=${path.join(output, "index.html")}`);
