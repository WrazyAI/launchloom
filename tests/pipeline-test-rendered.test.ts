import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { it, expect } from "vitest";

it.each(["seo-only", "creative-only", "full"])(
  "renders %s provenance and enforces form delivery behavior at desktop and mobile",
  async (profile) => {
    const repository = path.resolve(".");
    const template = path.join(repository, "templates/client-site");
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "ll-test-profile-render-"),
    );
    let server: http.Server | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await fs.cp(template, root, {
        recursive: true,
        filter: (file) =>
          !file
            .split(path.sep)
            .some((part) => ["node_modules", "dist", ".astro"].includes(part)),
      });
      await fs.symlink(
      path.join(repository, "node_modules"),
        path.join(root, "node_modules"),
        "dir",
      );
      // A test-only source override proves the real pre-change templates fail.
      if (process.env.LL_RENDER_SOURCE_REF) {
        for (const file of [
          "src/layouts/SiteLayout.astro",
          "src/components/LeadForm.astro",
          "src/lib/seo-readiness.mjs",
          "src/lib/seo-readiness.d.mts",
          "src/pages/sitemap.xml.ts",
        ]) {
          await fs.writeFile(
            path.join(root, file),
            execFileSync(
              "git",
              [
                "show",
                `${process.env.LL_RENDER_SOURCE_REF}:templates/client-site/${file}`,
              ],
              { cwd: repository },
            ),
          );
        }
      }
      const config = JSON.parse(
        await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
      );
      config.lead = {
        apiUrl: "https://synthetic-lead.invalid",
        token: "synthetic-active-token",
      };
      if (profile !== "full")
        config.pipelineTest = {
          version: 1,
          profile,
          testOnly: true,
          sourceSha: "a".repeat(40),
          runId: "synthetic",
        };
      await fs.writeFile(
        path.join(root, "src/site.config.json"),
        JSON.stringify(config),
      );
      await fs.writeFile(
        path.join(root, "src/pages/index.astro"),
        '---\nimport SiteLayout from "../layouts/SiteLayout.astro";\nimport LeadForm from "../components/LeadForm.astro";\n---\n<SiteLayout><main><h1>Synthetic preview fixture</h1><LeadForm /></main></SiteLayout>',
      );
      execFileSync(
        process.execPath,
      [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build"],
        {
          cwd: root,
          env: {
            ...process.env,
            PUBLIC_REVIEW_MODE: "false",
            PUBLIC_CREATIVE_DIAGNOSTIC: "false",
          },
          stdio: "pipe",
        },
      );
      const html = await fs.readFile(
        path.join(root, "dist/index.html"),
        "utf8",
      );
      server = http.createServer(async (req, res) => {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        const file = path.join(
          root,
          "dist",
          pathname === "/" ? "index.html" : pathname,
        );
        try {
          res.setHeader(
            "Content-Type",
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
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      browser = await chromium.launch();
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
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
        await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
        const banner = page.locator("[data-pipeline-test-preview]");
        if (profile !== "full") {
          expect(await banner.isVisible()).toBe(true);
          expect(await banner.textContent()).toContain(profile);
          expect(await banner.textContent()).toContain(
            profile === "seo-only"
              ? "Creative evaluation and visual promotion skipped"
              : "SEO research skipped",
          );
          expect(
            await page.locator(".ll-approve, .ll-send-anyway").count(),
          ).toBe(0);
          expect(
            await page.locator('meta[name="robots"]').getAttribute("content"),
          ).toBe("noindex, nofollow");
          expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
        expect(html).not.toContain("synthetic-active-token");
        expect(await page.locator("form.lead-form").getAttribute("data-lead-preview")).toBe("true");
        } else {
          expect(await banner.count()).toBe(0);
          expect(await page.locator('link[rel="canonical"]').count()).toBe(1);
        }
        for (const [name, value] of Object.entries({
          name: "Synthetic",
          phone: "555-0101",
          email: "synthetic@example.test",
          message: "Synthetic request",
        }))
          await page.locator(`.lead-form [name="${name}"]`).fill(value);
        await page.locator(".lead-submit").click();
        await page
          .getByText(
            profile === "full"
              ? "Thank you. We will be in touch shortly."
              : "Test-only preview: submissions are disabled.",
            { exact: true },
          )
          .waitFor();
        expect(requests).toBe(profile === "full" ? 1 : 0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const evidence = path.join(root, "test-profile-previews");
        await fs.mkdir(evidence, { recursive: true });
        await page.screenshot({
          path: path.join(evidence, `${profile}-${viewport.width}.png`),
          fullPage: true,
        });
        await page.close();
      }
    } finally {
      await browser?.close();
      if (server)
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  60000,
);
