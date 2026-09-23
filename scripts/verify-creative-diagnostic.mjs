import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).reduce(
    (pairs, value, index, all) =>
      index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs,
    [],
  ),
);
const dist = path.resolve(args.dist || "dist");
const candidateId = String(args.candidate || "");
const screenshots = path.resolve(args.screenshots || ".launchloom/creative-diagnostic-screenshots");
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      let target = path.resolve(dist, `.${pathname}`);
      if (!target.startsWith(`${dist}${path.sep}`) && target !== dist) throw new Error("Invalid path");
      const stat = await fs.stat(target);
      if (stat.isDirectory()) target = path.join(target, "index.html");
      response.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
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
  if (!address || typeof address === "string") throw new Error("Could not start diagnostic preview server.");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

if (!/^candidate-[a-z0-9]+$/iu.test(candidateId))
  throw new Error("A valid candidate ID is required.");
const browser = await chromium.launch({ headless: true });
const { server, origin } = await startServer();
const failures = [];
await fs.mkdir(screenshots, { recursive: true });
try {
  for (const viewport of [
    { name: "desktop", width: 1536, height: 864 },
    { name: "compact", width: 1366, height: 768 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    const state = await page.evaluate(() => {
      const creative = document.querySelector("[data-creative-host='true']");
      const hero = creative?.querySelector("[data-hero]");
      return {
        robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") || "",
        canonical: Boolean(document.querySelector('link[rel="canonical"]')),
        diagnostic: creative?.getAttribute("data-creative-diagnostic") === "true",
        candidateId: creative?.getAttribute("data-creative-candidate") || "",
        renderer: creative?.getAttribute("data-creative-renderer") || "",
        forms: document.querySelectorAll("form").length,
        activeLeadForm: document.querySelectorAll('[data-runtime="lead-form"]').length,
        reviewControls: document.querySelectorAll("#ll-review, .ll-review").length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        missingAlt: [...document.images].filter((image) => !image.getAttribute("alt")?.trim()).length,
        brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
        unnamedControls: [...document.querySelectorAll("button, a")].filter((element) => !(element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim()).length,
        heroBottom: hero?.getBoundingClientRect().bottom || 0,
      };
    });
    if (!/(^|,\s*)noindex(,|$)/iu.test(state.robots) || !/(^|,\s*)nofollow(,|$)/iu.test(state.robots)) failures.push(`${viewport.name}: preview is not noindex,nofollow`);
    if (state.canonical) failures.push(`${viewport.name}: diagnostic preview has a canonical URL`);
    if (!state.diagnostic || state.candidateId !== candidateId || state.renderer !== "creative-candidate") failures.push(`${viewport.name}: authored diagnostic renderer marker is missing`);
    if (state.forms || state.activeLeadForm) failures.push(`${viewport.name}: live lead form is present`);
    if (state.reviewControls) failures.push(`${viewport.name}: publish/review controls are present on the diagnostic site`);
    if (state.overflow) failures.push(`${viewport.name}: horizontal overflow`);
    if (state.missingAlt) failures.push(`${viewport.name}: image missing alt text`);
    if (state.brokenImages) failures.push(`${viewport.name}: broken image`);
    if (state.unnamedControls) failures.push(`${viewport.name}: unnamed interactive control`);
    if (viewport.name !== "mobile" && state.heroBottom > viewport.height + 1) failures.push(`${viewport.name}: opening hero does not fit the viewport`);
    if (browserErrors.length) failures.push(`${viewport.name}: browser errors: ${browserErrors.join("; ")}`);
    await page.screenshot({ path: path.join(screenshots, `${viewport.name}.png`), fullPage: true });
    console.log(JSON.stringify({ viewport: viewport.name, state, browserErrors }));
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
if (failures.length) {
  console.error(JSON.stringify({ diagnosticPreview: "rejected", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ diagnosticPreview: "safe", candidateId, screenshots }));
}
