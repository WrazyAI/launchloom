import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const repository = path.resolve(new URL("..", import.meta.url).pathname);
const outputFlag = process.argv.indexOf("--out");
const output = path.resolve(
  (outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined) ||
    path.join(os.tmpdir(), "launchloom-design-families"),
);

const demos = [
  {
    slug: "image-mosaic",
    fixture: "home-care.json",
    variantId: "care-modern-clinic",
  },
  {
    slug: "cinematic-premium",
    fixture: "home-care.json",
    variantId: "care-concierge",
  },
  {
    slug: "atmospheric-editorial",
    fixture: "home-care.json",
    variantId: "care-wellness-journal",
  },
  {
    slug: "project-showcase",
    fixture: "garage-door.json",
    variantId: "trades-project-led",
  },
  {
    slug: "studio-minimal",
    fixture: "garage-door.json",
    variantId: "trades-field-report",
  },
];

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
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
  const [pathname, suffix = ""] = absoluteTarget.split(/(?=[?#])/u, 2);
  const normalized = pathname.replace(/^\/+/, "");
  const target = normalized.endsWith("/") || normalized === ""
    ? path.join(siteRoot, normalized, "index.html")
    : path.join(siteRoot, normalized);
  let relative = path.relative(path.dirname(htmlFile), target).replaceAll(path.sep, "/");
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

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const demo of demos) {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), `launchloom-family-${demo.slug}-`),
  );
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
  config.design.variantId = demo.variantId;
  config.design.sections = [];
  await fs.writeFile(
    path.join(workspace, "src/site.config.json"),
    JSON.stringify(config, null, 2),
  );
  await run("npm", ["run", "build"], workspace);
  await fs.cp(path.join(workspace, "dist"), path.join(output, demo.slug), {
    recursive: true,
  });
  await makeSitePortable(path.join(output, demo.slug));
  console.log(
    `design_family=${demo.slug} output=${path.join(output, demo.slug)}`,
  );
}

const links = demos
  .map(
    ({ slug, variantId }) =>
      `<a href="./${slug}/index.html"><span>${variantId}</span><strong>${slug.replaceAll("-", " ")}</strong><small>Open rendered production-template family</small></a>`,
  )
  .join("");
await fs.writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>LaunchLoom design families</title><style>*{box-sizing:border-box}body{margin:0;padding:clamp(24px,6vw,80px);background:#111;color:#fff;font-family:Arial,sans-serif}header{max-width:900px;margin-bottom:60px}h1{font:500 clamp(52px,8vw,110px)/.88 Georgia,serif;letter-spacing:-.07em;margin:10px 0 20px}p{max-width:650px;color:#aaa;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid a{display:flex;min-height:280px;flex-direction:column;padding:28px;background:#f2efe7;color:#111;text-decoration:none}.grid span{font-size:10px;text-transform:uppercase;letter-spacing:.12em}.grid strong{margin:auto 0;font-size:clamp(28px,4vw,55px);text-transform:capitalize}.grid small{font-weight:700}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><header><span>Production template render</span><h1>Five visual systems, one reliable pipeline.</h1><p>Each page uses the real Astro client template, shared business data, forms, local SEO pages, review controls, and conversion tools.</p></header><main class="grid">${links}</main></body></html>`,
);

await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
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
  throw new Error("Could not start family demo server");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const offlineGallery = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
for (let index = 0; index < demos.length; index += 1) {
  await offlineGallery.goto(pathToFileURL(path.join(output, "index.html")).href);
  const link = offlineGallery.locator(".grid a").nth(index);
  const expectedHref = `/${demos[index].slug}/index.html`;
  await link.click();
  await offlineGallery.waitForLoadState("load");
  const offlineResult = await offlineGallery.evaluate(() => ({
    hasMain: Boolean(document.querySelector("main")),
    title: document.title,
    styleSheets: document.styleSheets.length,
  }));
  if (
    !offlineGallery.url().endsWith(expectedHref) ||
    !offlineResult.hasMain ||
    offlineResult.title.startsWith("Index of ") ||
    offlineResult.styleSheets === 0
  ) {
    throw new Error(
      `Portable gallery verification failed for ${demos[index].slug}: ${JSON.stringify({ url: offlineGallery.url(), ...offlineResult })}`,
    );
  }
  console.log(
    `verified_offline_family=${demos[index].slug} direct_index=true styles_loaded=true`,
  );
}
await offlineGallery.close();
for (const demo of demos) {
  const url = `${origin}/${demo.slug}/`;
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle" });
    const result = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      emDashes: (document.body.innerText.match(/—/g) || []).length,
      brokenFragments: [...document.querySelectorAll('a[href^="#"]')]
        .map((link) => link.getAttribute("href"))
        .filter(
          (href) => href && href !== "#" && !document.querySelector(href),
        ),
    }));
    if (result.overflow || result.emDashes || result.brokenFragments.length) {
      throw new Error(
        `Visual verification failed for ${demo.slug} at ${viewport.width}px: ${JSON.stringify(result)}`,
      );
    }
    await page.screenshot({
      path: path.join(
        output,
        "screenshots",
        `${demo.slug}-${viewport.name}.png`,
      ),
      fullPage: true,
    });
    await page.close();
    console.log(
      `verified_family=${demo.slug} viewport=${viewport.width} overflow=false em_dashes=0 broken_fragments=0`,
    );
  }
}
await browser.close();
await new Promise((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);

console.log(`design_family_index=${path.join(output, "index.html")}`);
