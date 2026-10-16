import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { loadReferenceTemplate } from "./reference-template.mjs";

/** Render retained originals privately before any provider edits. No scripts,
 * remote requests, form submissions or provider-generated content are allowed. */
export async function renderSourceBaseline(
  starter,
  { repositoryRoot = process.cwd() } = {},
) {
  const template = loadReferenceTemplate(starter.dossierPath, {
    repositoryRoot,
  });
  if (!template || template.digest !== starter.templateDigest)
    throw new Error("Source baseline changed before rendering");
  const manifest = new Set(template.files.map((file) => file.path));
  const mime = {
    ".html": "text/html",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  const server = http.createServer(async (request, response) => {
    try {
      let file = decodeURIComponent(
        new URL(request.url || "/", "http://localhost").pathname,
      ).slice(1);
      if (!file) file = template.entrypoint;
      if (!manifest.has(file)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'none'; frame-ancestors 'none'",
      );
      response.end(
        await fs.readFile(path.join(template.absoluteDirectory, file)),
      );
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${address.port}`;
    const views = [];
    const artifacts = {};
    for (const [label, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400)
          failures.push(`HTTP ${response.status()}`);
      });
      await page.route("**/*", (route) =>
        route.request().url().startsWith(`${origin}/`)
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${origin}/${template.entrypoint}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      const state = await page.evaluate(() => ({
        h1Count: document.querySelectorAll("h1").length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images].filter(
          (image) => !image.complete || image.naturalWidth === 0,
        ).length,
      }));
      artifacts[`source-baseline-${label}.png`] = await page.screenshot({
        fullPage: true,
      });
      views.push({ viewport: { width, height }, ...state, failures });
      await page.close();
    }
    return {
      report: {
        version: 1,
        templateDigest: template.digest,
        scriptsEnabled: false,
        remoteRequestsAllowed: false,
        views,
      },
      artifacts,
    };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
