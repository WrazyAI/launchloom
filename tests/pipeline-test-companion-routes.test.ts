import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { pageBriefFixture, fixtureImage } from "../scripts/fixtures/page-briefs-fixture.mjs";
import { serveBuiltSite } from "../scripts/browser-route-verification.mjs";

it.each(["seo-only", "creative-only", "full"])(
  "preserves authored companion forms for %s across hubs, services and locations",
  async (profile) => {
    const repository = path.resolve(".");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ll-focused-companions-"));
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let server: Awaited<ReturnType<typeof serveBuiltSite>> | undefined;
    try {
      await fs.cp(path.join(repository, "templates/client-site"), root, {
        recursive: true,
        filter: file => !file.split(path.sep).some(part => ["node_modules", "dist", ".astro"].includes(part)),
      });
      await fs.symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
      const config: any = pageBriefFixture("local-trades");
      config.design.recipe = "general-editorial";
      config.design.treatment = {
        density: "spacious",
        typography: "soft-sans",
      };
      config.business.primaryCta = "Request a planning conversation";
      config.business.phone = "(919) 555-0147";
      delete config.pageContent["about:"];
      config.copy = {
        ...config.copy,
        aboutKicker: "About the practice",
        aboutHeading: "Unhurried Conversations, Everyday Language",
      };
      config.design.experience = {
        renderer: "creative-candidate", candidateId: "synthetic-companions",
        familyId: "synthetic", servicesIndex: true, servicePage: true, locationPage: true,
      };
      // Focused templates must strip credentials even if a stale source had them.
      config.lead = { apiUrl: "https://companion-lead.invalid", token: "synthetic-control-token" };
      if (profile !== "full") config.pipelineTest = {
        version: 1, profile, testOnly: true, sourceSha: "a".repeat(40), runId: "synthetic-companion-routes",
      };
      await fs.writeFile(path.join(root, "src/site.config.json"), JSON.stringify(config));
      await fs.mkdir(path.join(root, "public/images"), { recursive: true });
      for (const name of ["page-0.svg", "page-1.svg", "page-city.svg"])
        await fs.writeFile(path.join(root, "public/images", name), fixtureImage);
      for (const kind of ["Service", "Location"])
        await fs.copyFile(path.join(repository, `tests/fixtures/page-briefs/${kind}Page.jsx.txt`),
          path.join(root, `src/generated-experiences/selected/${kind}Page.jsx`));
      await fs.writeFile(path.join(root, "src/generated-experiences/selected/ServicesIndexPage.jsx"),
        'import {LeadForm} from "@launchloom/runtime"; export default function ServicesIndexPage({content,runtime}) { return <main data-services-index><h1>Services from {content.brand.name}</h1><section id="contact"><h2>Discuss your request</h2><LeadForm content={content} runtime={runtime}/></section></main>; }');
      execFileSync(process.execPath, [path.join(repository, "node_modules/astro/bin/astro.mjs"), "build"], {
        cwd: root,
        env: { ...process.env, PUBLIC_REVIEW_MODE: "false", PUBLIC_CREATIVE_DIAGNOSTIC: "false", PUBLIC_CREATIVE_JUDGE: "false" },
        stdio: "pipe",
      });
      server = await serveBuiltSite(path.join(root, "dist"));
      // Deterministic shell pages must link to the authored homepage contract,
      // not the legacy recipe's site-* IDs, regardless of focused/full mode.
      for (const shellPath of ["about", "contact"]) {
        const shellHtml = await fs.readFile(path.join(root, "dist", shellPath, "index.html"), "utf8");
        for (const anchor of ["services", "faqs", "contact"])
          expect(shellHtml).toContain(`href="/#${anchor}"`);
        expect(shellHtml).not.toMatch(/href="\/#site-(?:services|faq|contact)"/u);
      }
      browser = await chromium.launch();
      for (const viewport of [
        { width: 1440, height: 900 }, { width: 390, height: 844 },
        { width: 1366, height: 768 }, { width: 768, height: 1024 },
      ]) {
        for (const routePath of ["/services/", "/services/drain-cleaning/", "/services/leak-repair/", "/locations/testville/"]) {
          const page = await browser.newPage({ viewport });
          let requests = 0;
          await page.route("**/api/lead", route => {
            requests++;
            return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
          });
          await page.goto(server.origin + routePath, { waitUntil: "networkidle" });
          await page.waitForFunction(() => !document.querySelector('[data-authored-page-host="true"] astro-island[ssr]'));
          const form = page.locator('main form[data-runtime="lead-form"]');
          expect(await form.isVisible()).toBe(true);
          expect(await page.locator('[data-authored-page-host="true"]').count()).toBe(1);
          expect(await form.getAttribute("data-lead-preview")).toBe(profile === "full" ? null : "true");
          if (profile !== "full") {
            expect(await page.locator("[data-pipeline-test-preview]").isVisible()).toBe(true);
            expect(await page.locator("[data-pipeline-test-preview]").textContent()).toContain(profile);
            expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex, nofollow");
            expect(await page.locator('.ll-approve, .ll-send-anyway, link[rel="canonical"]').count()).toBe(0);
            expect(await fs.readFile(path.join(root, "dist", routePath, "index.html"), "utf8")).not.toContain("synthetic-control-token");
            const props = JSON.parse(await page.locator('[data-authored-page-host="true"] astro-island[props]').getAttribute("props") || "{}");
            expect(props.runtime[1].lead[1].apiUrl[1]).toBe("");
            expect(props.runtime[1].lead[1].token[1]).toBe("");
          }
          for (const [name, value] of Object.entries({
            name: "Synthetic", phone: "555-0101", email: "synthetic@example.test", message: "Synthetic authored companion request",
          })) await form.locator(`[name="${name}"]`).fill(value);
          await form.locator('button[type="submit"]').click();
          await form.locator('[role="status"]').getByText(profile === "full"
            ? "Thank you. We will be in touch shortly."
            : "Developer preview only: this form is not connected here, so nothing was sent.", { exact: true }).waitFor();
          expect(requests).toBe(profile === "full" ? 1 : 0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          const evidence = path.join(repository, "artifacts/test-profile-companion-routes");
          await fs.mkdir(evidence, { recursive: true });
          await page.screenshot({ path: path.join(evidence, `${profile}-${routePath.replaceAll("/", "-")}-${viewport.width}.png`), fullPage: true });
          await page.close();
        }
      }

      const aboutPage = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      try {
        await aboutPage.goto(server.origin + "/about/", {
          waitUntil: "networkidle",
        });
        const actionLayout = await aboutPage.evaluate(() => {
          const primary = document.querySelector<HTMLElement>(
            ".inner-hero .hero-actions .cta",
          );
          const phone = document.querySelector<HTMLElement>(
            ".inner-hero .hero-actions .call-link",
          );
          if (!primary || !phone) return null;
          return {
            horizontalOverflow:
              document.documentElement.scrollWidth > innerWidth + 1,
            phoneBelowPrimary:
              phone.getBoundingClientRect().top >=
              primary.getBoundingClientRect().bottom - 1,
          };
        });
        expect(actionLayout).toEqual({
          horizontalOverflow: false,
          phoneBelowPrimary: true,
        });
      } finally {
        await aboutPage.close();
      }
    } finally {
      await browser?.close();
      await server?.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 90000,
);
