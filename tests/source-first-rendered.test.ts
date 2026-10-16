import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import {
  resolveSourceStarter,
  applySourceEdits,
} from "../scripts/source-first-authoring.mjs";
import { renderSourceBaseline } from "../scripts/source-starter-baseline.mjs";
import { buildCreativeContentManifest } from "../scripts/production-experience-author.mjs";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
import { promoteCreativeCandidate } from "../scripts/promote-creative-candidate.mjs";
import { loadReferenceDossier } from "../scripts/reference-dossier.mjs";

// Controlled offline edits of a real retained original, not a model-quality claim.
describe("source-derived component in the production shell", () => {
  it("preserves original layout classes and adds an aesthetic shared form at desktop/mobile", async () => {
    const route = {
      id: "route-source",
      label: "Owned legal source",
      familyId: "editorial-monument",
      navigation: "quiet-corner",
      heroGeometry: "typographic-monument",
      servicePresentation: "magazine-ledger",
      sectionRhythm: "slow-chapters",
      typographyCategory: "serif",
      imageStrategy: "graphic",
      motionOpportunity: "native",
      referenceDossier: loadReferenceDossier(
        "data/reference-library/dossiers/clear-counsel-ledger",
      ),
    };
    const starter = resolveSourceStarter(route);
    if (!("baseline" in starter))
      throw new Error("Real retained starter must qualify");
    const original = starter.original.html;
    const render = await renderSourceBaseline(starter);
    expect(render.report.views).toHaveLength(2);
    expect(render.report.scriptsEnabled).toBe(false);
    const source = starter.baseline.experience;
    const fragment = (start: string, end: string) => {
      const a = source.indexOf(start);
      const b = source.indexOf(end, a) + end.length;
      if (a < 0 || b < end.length)
        throw new Error("Fixture no longer matches retained source");
      return source.slice(a, b);
    };
    const edits = [
      { find: fragment('<a className="skip"', "</a>"), replace: "" },
      { find: fragment('<div className="demo-note"', "</div>"), replace: "" },
      {
        find: fragment('<header className="nav "', "</header>"),
        replace:
          '<header className="nav"><a className="brand" href="/">{content.brand.name}</a><nav aria-label="Main navigation"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><a className="nav-cta" href="#contact">{content.hero.primaryLabel}</a></header>',
      },
      {
        find: '<section className="hero">',
        replace: '<section className="hero" data-hero>',
      },
      {
        find: fragment('<aside className="hero-side"', "</aside>"),
        replace:
          '<aside className="hero-side"><span className="label">{content.hero.kicker}</span><p>{content.businessDescription}</p></aside>',
      },
      {
        find: fragment('<div className="hero-copy"', "</div>"),
        replace:
          '<div className="hero-copy" data-hero-copy><span className="label">{content.hero.kicker}</span><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><a className="button" data-early-conversion href="#contact">{content.hero.primaryLabel}</a></div>',
      },
      {
        find: fragment('<section className="expertise"', "</section>"),
        replace:
          '<section className="expertise" id="services"><div className="expertise-head"><span className="label">Services</span><div><h2>{content.copy.servicesHeading}</h2><p>{content.copy.servicesIntro}</p></div></div>{content.services.map(service => <a className="matter" key={service.name} href={`/services/${service.slug}/`}><strong>{service.name}</strong><p>{service.description}</p><b>{content.hero.primaryLabel}</b></a>)}</section>',
      },
      {
        find: fragment('<section className="process"', "</section>"),
        replace:
          '<section className="process" id="faqs"><div className="process-copy"><span className="label">FAQs</span><h2>{content.copy.faqHeading}</h2><p>{content.copy.aboutBody}</p></div><div className="process-list">{content.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section>',
      },
      {
        find: fragment('<section className="contact"', "</section>"),
        replace:
          '<section className="contact" id="contact"><div><span className="label">Contact</span><h2>{content.copy.contactHeading}</h2><p>{content.copy.formIntro}</p></div><LeadForm content={content} runtime={runtime} /></section>',
      },
      {
        find: fragment('<footer className="footer"', "</footer>"),
        replace:
          '<footer className="footer"><strong>{content.brand.name}</strong><p>{content.businessDescription}</p><a href="#contact">{content.hero.primaryLabel}</a></footer>',
      },
    ];
    const adapted = applySourceEdits(source, JSON.stringify({ edits }));
    const last = starter.baseline.styles.slice(-80);
    const formRules = `\n[data-source-baseline="clear-counsel-ledger"] .hero{min-height:0}\n[data-source-baseline="clear-counsel-ledger"] .hero-main{padding:48px 5vw}\n[data-source-baseline="clear-counsel-ledger"] .hero h1{font-size:clamp(42px,4vw,68px)}\n[data-source-baseline="clear-counsel-ledger"]{font-family:var(--font-body,Arial,sans-serif)}\n[data-source-baseline="clear-counsel-ledger"] h1{font-family:var(--font-heading,Georgia,serif)}\n[data-source-baseline="clear-counsel-ledger"] .launchloom-lead-form{border:1px solid #18222344;background:white;padding:24px}\n[data-source-baseline="clear-counsel-ledger"] .launchloom-lead-form button{background:#182223;color:white;border-radius:0;padding:14px 22px}\n[data-source-baseline="clear-counsel-ledger"] .launchloom-lead-form :is(input,textarea){border:1px solid #18222366;border-radius:0;font:inherit}\n[data-source-baseline="clear-counsel-ledger"] :focus-visible{outline:2px solid #182223;outline-offset:4px}\n@media(max-width:720px){[data-source-baseline="clear-counsel-ledger"] .nav{grid-template-columns:1fr auto}[data-source-baseline="clear-counsel-ledger"] .nav nav{display:flex;grid-column:1/-1;grid-row:2;flex-wrap:wrap;gap:24px}}`;
    const styles = applySourceEdits(
      starter.baseline.styles,
      JSON.stringify({ edits: [{ find: last, replace: last + formRules }] }),
    );
    const cache = path.resolve("node_modules/.cache/source-first-rendered");
    await fs.mkdir(cache, { recursive: true });
    const root = await fs.mkdtemp(path.join(cache, "site-"));
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let server: http.Server | undefined;
    try {
      await fs.cp(path.resolve("templates/client-site"), root, {
        recursive: true,
        filter: (file) =>
          !/[\\/](node_modules|dist|\.astro)([\\/]|$)/u.test(file),
      });
      const config = JSON.parse(
        await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
      );
      config.business.name = "Source-first Fictional Demo";
      config.business.description =
        "Fictional source adaptation verification only.";
      config.copy = {
        heroKicker: "Fictional demonstration",
        heroHeading: "A source-derived client experience",
        servicesHeading: "Support shaped around your needs",
        servicesIntro: "These sample services verify sealed content binding.",
        faqHeading: "Before your first conversation",
        aboutBody:
          "This is a fictional verification fixture, not a service offering.",
        contactHeading: "Start a focused conversation",
        formIntro:
          "Preview this form in the source template's visual language.",
      };
      config.conversion = {
        ...config.conversion,
        faqs: [
          {
            question: "Is this a real business?",
            answer: "No. This is a fictional verification fixture.",
          },
        ],
      };
      config.lead = { apiUrl: "", token: "" };
      const contentManifest = buildCreativeContentManifest(config);
      const manifest = buildCandidateManifest({
        candidate: { candidateId: "candidate-a" },
        route,
        model: "offline-fixture",
        contentManifestDigest: contentManifest.digest,
      });
      const candidate = path.join(root, "candidate-a");
      await fs.mkdir(candidate);
      const strategy = {
        mode: starter.mode,
        dossierId: starter.dossierId,
        templateDigest: starter.templateDigest,
        creditId: starter.creditId,
        baselineDigests: starter.baselineDigests,
      };
      const files = {
        "Experience.jsx": adapted.source,
        "ServicePage.jsx": `import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service }) {
return <main data-service-page data-service-slug={service.slug}>
<nav className="nav"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
<section className="hero" data-service-hero><div className="hero-main"><h1>{service.name}</h1><p>{service.description}</p></div></section>
<section className="expertise" data-service-support><p>{service.support.scope}</p><p>{service.support.preparation}</p><p>{service.support.nextStep}</p></section>
<section data-service-related>{service.related.map(item => <a key={item.slug} href={\`/services/\${item.slug}/\`}>{item.name}</a>)}</section>
{service.process.length > 0 && <ol>{service.process.map(step => <li key={step}>{step}</li>)}</ol>}
{service.faqs.length > 0 && <section>{service.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
<section className="contact" id="contact"><LeadForm content={content} runtime={runtime}/></section></main>;
}`,
        "styles.css": styles.source,
        "motion.js": starter.baseline.motion,
        "metadata.json": JSON.stringify({
          creativeManifest: manifest,
          sourceStrategy: strategy,
        }),
        "content-manifest.json": JSON.stringify(contentManifest),
        "source-baseline.json": JSON.stringify({
          ...starter,
          render: render.report,
          edits: [adapted.receipt, styles.receipt],
        }),
      };
      for (const [name, value] of Object.entries(files))
        await fs.writeFile(path.join(candidate, name), value);
      await fs.writeFile(
        path.join(root, "src/site.config.json"),
        JSON.stringify(config),
      );
      await promoteCreativeCandidate({
        siteDir: root,
        candidateDir: "candidate-a",
        preview: true,
      });
      execFileSync(path.resolve("node_modules/.bin/astro"), ["build"], {
        cwd: root,
        env: {
          ...process.env,
          PUBLIC_CREATIVE_JUDGE: "true",
          PUBLIC_CREATIVE_DIAGNOSTIC: "true",
        },
        stdio: "pipe",
        timeout: 120000,
      });
      server = http.createServer(async (req, res) => {
        try {
          const name = new URL(req.url || "/", "http://localhost").pathname;
          const file = path.join(
            root,
            "dist",
            name === "/"
              ? "index.html"
              : name.endsWith("/")
                ? `${name}index.html`
                : name,
          );
          const bytes = await fs.readFile(file);
          res.setHeader(
            "Content-Type",
            file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".js")
                ? "application/javascript"
                : "text/html",
          );
          res.end(bytes);
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
      const activeServer = server;
      await new Promise<void>((resolve) =>
        activeServer.listen(0, "127.0.0.1", resolve),
      );
      const address = activeServer.address();
      if (!address || typeof address === "string")
        throw new Error("Missing fixture server address");
      const port = address.port;
      browser = await chromium.launch();
      for (const width of [1440, 390]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${port}/`, {
          waitUntil: "networkidle",
        });
        await expect(
          page.locator('[data-source-baseline="clear-counsel-ledger"]').count(),
        ).resolves.toBe(1);
        expect(
          await page.locator(".hero-main .hero-copy h1").textContent(),
        ).toBe(contentManifest.values.hero.heading);
        expect(await page.locator('[data-runtime="lead-form"]').count()).toBe(
          1,
        );
        expect(await page.locator('nav a[href="#services"]').isVisible()).toBe(
          true,
        );
        expect(
          await page
            .locator('[data-runtime="lead-form"] button')
            .evaluate((e) => getComputedStyle(e).borderRadius),
        ).toBe("0px");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        expect(errors).toEqual([]);
        const shotDir = path.resolve("artifacts/source-first-verification");
        await fs.mkdir(shotDir, { recursive: true });
        await page.screenshot({
          path: path.join(shotDir, `owned-adaptation-${width}.png`),
          fullPage: true,
        });
        const serviceSlug =
          config.services[0].slug ||
          config.services[0].name
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, "-")
            .replace(/^-|-$/gu, "");
        await page.goto(`http://127.0.0.1:${port}/services/${serviceSlug}/`, {
          waitUntil: "networkidle",
        });
        expect(
          await page
            .locator(
              '[data-authored-page-host][data-source-baseline="clear-counsel-ledger"]',
            )
            .count(),
        ).toBe(1);
        expect(
          await page
            .locator(".hero-main")
            .evaluate((e) => getComputedStyle(e).display),
        ).toBe("grid");
        expect(
          await page
            .locator('[data-runtime="lead-form"] button')
            .evaluate((e) => getComputedStyle(e).borderRadius),
        ).toBe("0px");
        await page.close();
      }
      expect(
        await fs.readFile(
          path.join(
            process.cwd(),
            route.referenceDossier.path,
            "template/source/index.html",
          ),
          "utf8",
        ),
      ).toBe(original);
    } finally {
      await browser?.close();
      const activeServer = server;
      if (activeServer)
        await new Promise<void>((resolve) =>
          activeServer.close(() => resolve()),
        );
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 180000);
});
