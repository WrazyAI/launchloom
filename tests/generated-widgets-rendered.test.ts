import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it.each([
  { renderer: "pack", kind: "exact", visibility: "public", area: "" },
  { renderer: "foundation", kind: "approximate", visibility: "private", area: "Asheville, NC" },
  { renderer: "creative", kind: "approximate", visibility: "private", area: "Asheville, NC" },
  { renderer: "pack", kind: "none", visibility: "private", area: "" },
])("renders $renderer with $kind location and reachable answers", async ({
  renderer, kind, visibility, area,
}) => {
  const repository = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-widget-render-"));
  let server: http.Server | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await fs.cp(path.join(repository, "templates/client-site"), root, {
      recursive: true,
      filter: (file) => !["node_modules", "dist", ".astro"].includes(path.basename(file)),
    });
    await fs.symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
    const configPath = path.join(root, "src/site.config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.business = {
      ...config.business,
      address: visibility === "private" ? "12 Hidden Road, Asheville, NC" : config.business.address,
      addressVisibility: visibility,
      placeId: visibility === "private" ? "PrivatePlaceId" : "",
      googleMapsUrl: visibility === "private" ? "https://www.google.com/maps?q=35.12,-82.34" : "",
      primaryCity: area,
      serviceAreas: area ? [area] : [],
    };
    config.conversion = {
      ...config.conversion,
      faqs: [{ question: "What should I bring?", answer: "Bring your questions." }],
    };
    config.design = {
      ...config.design,
      sections: config.design?.sections || [],
      experience: renderer === "foundation"
        ? { renderer: "foundation", foundationId: "season-wheel" }
        : renderer === "creative"
          ? { renderer: "creative-candidate", candidateId: "selected", packId: "stage-index" }
          : { renderer: "pack", packId: "stage-index" },
    };
    if (renderer === "creative") {
      config.images.hero = "/images/widget-test-sash.svg";
      await fs.mkdir(path.join(root, "public/images"), { recursive: true });
      await fs.writeFile(path.join(root, "public/images/widget-test-sash.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#314b40"/></svg>');
      await fs.writeFile(path.join(root, "src/generated-experiences/selected/Experience.jsx"),
        'import { LocationMap, CreativeImage, ServiceLink } from "@launchloom/runtime";\nexport default function Experience({ content }) { return <main><h1>{content.hero.heading}</h1><CreativeImage content={content} slot="hero" alt="Synthetic sash illustration" /><ServiceLink content={content} index={0} /><LocationMap content={content} /></main>; }');
    }
    await fs.writeFile(configPath, JSON.stringify(config));
    execFileSync(process.execPath, [
      path.join(repository, "node_modules/astro/bin/astro.mjs"), "build",
    ], { cwd: root, env: { ...process.env, PUBLIC_REVIEW_MODE: "false" }, stdio: "pipe" });
    const html = await fs.readFile(path.join(root, "dist/index.html"), "utf8");
    if (visibility === "private")
      expect(html).not.toMatch(/Hidden Road|PrivatePlaceId|35\.12/);
    server = http.createServer(async (req, res) => {
      const name = new URL(req.url || "/", "http://localhost").pathname;
      try {
        const file = name.endsWith("/") ? `${name}index.html` : name;
        const body = await fs.readFile(path.join(root, "dist", file));
        res.setHeader("content-type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".svg") ? "image/svg+xml" : "text/html");
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.route("**/*", (route) => route.request().url().startsWith(`http://127.0.0.1:${port}/`)
          ? route.continue() : route.fulfill({ body: "" }));
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
        if (renderer === "creative") {
          const image = page.getByRole("img", { name: "Synthetic sash illustration" });
          await image.evaluate(async (node: HTMLImageElement) => node.decode(), undefined, { timeout: 3000 });
          const service = config.services[0];
          expect(await page.locator("main").getByRole("link", { name: service.name, exact: true })
            .getAttribute("href", { timeout: 3000 }))
            .toBe(`/services/${service.slug}/`);
          expect((await page.request.get(`http://127.0.0.1:${port}/services/${service.slug}/`)).ok()).toBe(true);
        }
        const map = page.locator("#location");
        expect(await map.count()).toBe(kind === "none" ? 0 : 1);
        if (renderer === "pack")
          expect(await page.getByRole("link", { name: "Book a consultation", exact: true }).first().getAttribute("href")).toBe("#contact");
        if (kind !== "none") {
          expect(await map.isVisible()).toBe(true);
          expect(await map.getAttribute("data-location-kind")).toBe(kind);
          const embed = new URL((await map.locator("iframe").getAttribute("src"))!);
          expect(embed.searchParams.get("q")).toBe(area || config.business.address);
          if (area) {
            expect(await map.getByRole("heading", { name: `Area waypoint: ${area}` }).isVisible()).toBe(true);
            expect(await map.getByText("not a business address", { exact: false }).isVisible()).toBe(true);
          }
          if (process.env.LL_WIDGET_SCREENSHOTS)
            await map.screenshot({
              path: path.join(process.env.LL_WIDGET_SCREENSHOTS, `${renderer}-${kind}-${width}-map.png`),
            });
        }
        if (width === 1440) await page.evaluate(() => {
          const blocker = document.createElement("div");
          blocker.style.cssText = "position:fixed;left:0;bottom:0;width:360px;height:120px";
          blocker.textContent = "Fixed corner obstacle";
          document.body.append(blocker);
        });
        const assistant = page.locator(".quick-answers");
        await page.waitForFunction(() => {
          const root = document.querySelector<HTMLElement>(".quick-answers");
          return root && !root.inert && getComputedStyle(root).position === "static";
        }, null, { timeout: 3000 });
        const launcher = assistant.getByRole("button", { name: "Got questions?" });
        await launcher.click({ timeout: 3000 });
        await assistant.getByRole("button", { name: /What should I bring/ }).click();
        expect(await assistant.getByText("Bring your questions.").isVisible()).toBe(true);
        if (process.env.LL_WIDGET_SCREENSHOTS)
          await assistant.screenshot({
            path: path.join(process.env.LL_WIDGET_SCREENSHOTS, `${renderer}-${kind}-${width}-assistant.png`),
          });
        await page.keyboard.press("Escape");
        expect(await launcher.evaluate((element) => element === document.activeElement)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}, 60_000);
