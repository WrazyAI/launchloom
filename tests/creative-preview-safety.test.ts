import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { afterEach, expect, it } from "vitest";
import { pageBriefFixture } from "../scripts/fixtures/page-briefs-fixture.mjs";

const exec = promisify(execFile);
const evidenceDir = process.env.PHASE2_EVIDENCE_DIR;
const roots: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
afterEach(async () => {
  await browser?.close();
  browser = undefined;
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function prepare() {
  const repository = path.resolve(".");
  const cacheRoot = path.join(
    repository,
    "node_modules/.cache/launchloom-test-sites",
  );
  await fs.mkdir(cacheRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(cacheRoot, "preview-safety-"));
  roots.push(root);
  await fs.cp(path.join(repository, "templates/client-site"), root, {
    recursive: true,
    filter: (source) =>
      !source
        .split(path.sep)
        .some((part) => ["node_modules", "dist", ".astro"].includes(part)),
  });
  await fs.symlink(
    path.join(repository, "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  const config: any = pageBriefFixture("local-trades");
  config.lead = {
    apiUrl: "https://synthetic-lead.invalid",
    token: "synthetic-active-token",
  };
  config.pipelineTest = {
    version: 1,
    profile: "full-preview",
    testOnly: true,
    sourceSha: "a".repeat(40),
    runId: "synthetic",
  };
  config.design.experience = {
    renderer: "creative-candidate",
    candidateId: "preview-safety",
    familyId: "synthetic",
  };
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify(config),
  );
  await fs.writeFile(
    path.join(root, "src/generated-experiences/selected/Experience.jsx"),
    'import { LeadForm } from "@launchloom/runtime"; export default function Experience({ content, runtime }) { return <main><header className="site-header"><a href="/">{content.brand.name}</a></header><section className="hero"><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><a href="#contact">{content.hero.primaryLabel}</a></section><section id="contact"><LeadForm content={content} runtime={runtime} /></section></main>; }',
  );
  await fs.writeFile(
    path.join(root, "src/generated-experiences/selected/styles.css"),
    ".site-header{position:absolute;top:16px;left:24px;right:24px;height:60px;display:flex;align-items:center;background:#fff;z-index:5}.hero{padding:120px 24px 40px}",
  );
  await fs.writeFile(
    path.join(root, "src/generated-experiences/selected/motion.js"),
    "export function mountExperienceMotion(){return ()=>{};}",
  );
  const build = (judge: boolean) =>
    exec(
      process.execPath,
      [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build"],
      {
        cwd: root,
        env: {
          ...process.env,
          PUBLIC_REVIEW_MODE: "false",
          PUBLIC_CREATIVE_DIAGNOSTIC: "false",
          PUBLIC_CREATIVE_JUDGE: String(judge),
          PUBLIC_SITE_URL: "https://fixture.invalid",
        },
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  return { root, config, build };
}

async function serve(root: string) {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const file = path.join(root, "dist", pathname === "/" ? "index.html" : pathname);
    try {
      res.setHeader(
        "content-type",
        file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".woff2")
              ? "font/woff2"
              : "text/html",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    origin: `http://127.0.0.1:${(server.address() as any).port}`,
  };
}

it(
  "contains authored headers below public notices and suppresses judge-only chrome",
  async () => {
    const { root, config, build } = await prepare();
    const viewports = [
      { width: 1536, height: 864 },
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ];
    browser = await chromium.launch();
    const geometry: any[] = [];

    await build(false);
    const normalHtml = await fs.readFile(
      path.join(root, "dist/index.html"),
      "utf8",
    );
    expect(normalHtml).toContain("data-pipeline-test-preview");
    expect(normalHtml).toContain('data-lead-preview="true"');
    let { server, origin } = await serve(root);
    try {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        let requests = 0;
        await page.route("https://synthetic-lead.invalid/api/lead", (route) => {
          requests++;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"ok":true}',
          });
        });
        await page.goto(origin);
        const banner = await page
          .locator("[data-pipeline-test-preview]")
          .boundingBox();
        const header = await page.locator("header.site-header").boundingBox();
        expect(banner, JSON.stringify(viewport)).not.toBeNull();
        expect(header, JSON.stringify(viewport)).not.toBeNull();
        expect(
          header!.y,
          `header overlapped notice at ${viewport.width}`,
        ).toBeGreaterThanOrEqual(banner!.y + banner!.height - 0.5);
        geometry.push({ build: "test-preview", viewport, banner, header });
        if (evidenceDir) {
          await fs.mkdir(path.join(evidenceDir, "preview"), {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              evidenceDir,
              "preview",
              `test-preview-${viewport.width}.png`,
            ),
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        for (const [name, value] of Object.entries({
          name: "Synthetic",
          phone: "555-0101",
          email: "synthetic@example.test",
          message: "Synthetic request",
        }))
          await page
            .locator(`.launchloom-lead-form [name="${name}"]`)
            .fill(value);
        await page.locator(".launchloom-lead-form button[type=submit]").click();
        await page
          .getByText(
            "Developer preview only: this form is not connected here, so nothing was sent.",
            { exact: true },
          )
          .waitFor();
        expect(requests).toBe(0);
        await page.close();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await build(true);
    const judgeTestHtml = await fs.readFile(
      path.join(root, "dist/index.html"),
      "utf8",
    );
    expect(judgeTestHtml).not.toContain("data-pipeline-test-preview");
    expect(judgeTestHtml).not.toContain('id="ll-review"');
    expect(judgeTestHtml).toContain('data-lead-preview="true"');
    ({ server, origin } = await serve(root));
    try {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        await page.goto(origin);
        expect(await page.locator("[data-pipeline-test-preview]").count()).toBe(
          0,
        );
        expect(await page.locator("#ll-review").count()).toBe(0);
        const header = await page.locator("header.site-header").boundingBox();
        expect(header, JSON.stringify(viewport)).not.toBeNull();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        geometry.push({ build: "judge", viewport, header });
        if (evidenceDir) {
          await fs.mkdir(path.join(evidenceDir, "preview"), {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              evidenceDir,
              "preview",
              `judge-${viewport.width}.png`,
            ),
          });
        }
        await page.close();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    delete config.pipelineTest;
    await fs.writeFile(
      path.join(root, "src/site.config.json"),
      JSON.stringify(config),
    );
    await build(true);
    const judgeCleanHtml = await fs.readFile(
      path.join(root, "dist/index.html"),
      "utf8",
    );
    expect(judgeCleanHtml).not.toContain('id="ll-review"');
    if (evidenceDir) {
      await fs.writeFile(
        path.join(evidenceDir, "preview", "geometry.json"),
        `${JSON.stringify(geometry, null, 2)}\n`,
      );
    }
  },
  120_000,
);
