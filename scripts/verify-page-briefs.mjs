import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  pageBriefFixture,
  fixtureImage,
} from "./fixtures/page-briefs-fixture.mjs";
import {
  compilePageBriefs,
  pageBriefExpectedContent,
} from "../templates/client-site/src/lib/page-briefs.mjs";
import { checkSeoRelease } from "./seo-release-gate.mjs";
import {
  applyOperation,
  expectedArtifacts,
  verifyRevision,
} from "./revision-engine.mjs";
import { auditBuiltContrast } from "./contrast-sweep.mjs";
import {
  validateServicePage,
  validateLocationPage,
} from "./production-experience-author.mjs";
const exec = promisify(execFile),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedScenarios = ["trades-static", "care-static", "trades-authored"];
const scenarios = process.argv.slice(2).length
  ? process.argv.slice(2)
  : allowedScenarios;
if (scenarios.some((scenario) => !allowedScenarios.includes(scenario)))
  throw new Error("Unknown synthetic page-brief scenario.");
for (const scenario of scenarios) {
  const dir = path.join(root, "artifacts/stage3", scenario),
    template = path.join(root, "templates/client-site");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(template, dir, {
    recursive: true,
    filter: (source) =>
      !["node_modules", ".astro", "dist"].includes(
        path.relative(template, source).split(path.sep)[0],
      ),
  });
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(dir, "node_modules"),
  );
  const config = pageBriefFixture(
    scenario === "care-static" ? "care-editorial" : "local-trades",
  );
  await fs.mkdir(path.join(dir, "public/images"), { recursive: true });
  for (const name of ["page-0.svg", "page-1.svg", "page-city.svg"])
    await fs.writeFile(path.join(dir, "public/images", name), fixtureImage);
  if (scenario === "trades-authored") {
    config.design.experience = {
      renderer: "creative-candidate",
      candidateId: "synthetic-page-brief",
      familyId: "synthetic",
      servicePage: true,
      locationPage: true,
    };
    // The checked-in fallback homepage is diagnostic. Match this synthetic
    // fixture's existing recipe anchors without claiming a promoted candidate.
    const homepagePath = path.join(
      dir,
      "src/generated-experiences/selected/Experience.jsx",
    );
    const homepage = await fs.readFile(homepagePath, "utf8");
    await fs.writeFile(
      homepagePath,
      homepage
        .replaceAll('id="services"', 'id="repair-options"')
        .replaceAll('id="faqs"', 'id="service-questions"')
        .replaceAll('id="contact"', 'id="request-service"')
        .replaceAll('href="#contact"', 'href="#request-service"'),
    );
    for (const kind of ["Service", "Location"]) {
      const source = await fs.readFile(
        path.join(root, "tests/fixtures/page-briefs", kind + "Page.jsx.txt"),
        "utf8",
      );
      (kind === "Service" ? validateServicePage : validateLocationPage)(
        source,
        { id: "synthetic-page-brief" },
        { pageBriefContractVersion: 1 },
      );
      await fs.writeFile(
        path.join(dir, "src/generated-experiences/selected", kind + "Page.jsx"),
        source,
      );
    }
  }
  const report = compilePageBriefs(config);
  if (report.issues.length) throw new Error(report.issues.join("\n"));
  await fs.writeFile(
    path.join(dir, "src/site.config.json"),
    JSON.stringify(config, null, 2),
  );
  await fs.writeFile(
    path.join(dir, "page-briefs.json"),
    JSON.stringify(report, null, 2),
  );
  const env = {
    ...process.env,
    PUBLIC_REVIEW_MODE: "false",
    PUBLIC_SITE_URL: "https://fixture.pages.dev",
    PUBLIC_LAUNCHLOOM_API_URL: "https://api.fixture.invalid",
  };
  await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["check", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  const build = await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["build", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  await fs.writeFile(
    path.join(dir, "build.log"),
    build.stdout + "\n" + build.stderr,
  );
  const failures = await checkSeoRelease({
    mode: "production",
    config,
    dist: path.join(dir, "dist"),
    origin: "https://fixture.pages.dev",
  });
  if (failures.length) throw new Error(failures.join("\n"));
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = path.join(
        dir,
        "dist",
        pathname.endsWith("/") ? pathname + "index.html" : pathname,
      );
      const body = await fs.readFile(file);
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  let views = 0;
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"synthetic_no_submission"}',
        }),
      );
      for (const brief of report.briefs.filter(
        (brief) => brief.mode === "supported",
      )) {
        await page.goto(origin + brief.path, { waitUntil: "networkidle" });
        const initial = await fs.readFile(
          path.join(dir, "dist", brief.path.slice(1), "index.html"),
          "utf8",
        );
        await page
          .locator("details")
          .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
        for (const value of pageBriefExpectedContent(brief)) {
          if (!initial.includes(value))
            throw new Error(
              "Supported content absent from initial HTML: " + value,
            );
          if (!(await page.locator("body").innerText()).includes(value))
            throw new Error(
              "Supported content absent after hydration: " + value,
            );
        }
        if ((await page.locator("h1").count()) !== 1)
          throw new Error("Incorrect H1 count");
        if (
          (await page
            .locator('meta[name="description"]')
            .getAttribute("content")) !== brief.metadata.description
        )
          throw new Error("Wrong page metadata");
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          throw new Error("Page overflow");
        if ((await page.locator("body").innerText()).includes("—"))
          throw new Error("Rendered em dash");
        for (const media of brief.media) {
          const image = page.locator("img");
          const loaded = await image.evaluateAll(
            (nodes, src) =>
              nodes.some(
                (node) =>
                  node.getAttribute("src") === src &&
                  node.complete &&
                  node.naturalWidth > 0 &&
                  node.getBoundingClientRect().width > 0,
              ),
            media.src,
          );
          if (!loaded) throw new Error("Context image not loaded");
        }
        if (
          ["service", "location", "contact"].includes(brief.pageType) &&
          (await page.locator('input[name="name"]').count()) < 1
        )
          throw new Error("Shared lead form missing");
        if ((await page.locator('a[href^="tel:"]').count()) < 1)
          throw new Error("Working call link missing");
        const faq = page.locator("details").first();
        if (await faq.count()) {
          await faq.evaluate((node) => (node.open = false));
          await faq.locator("summary").focus();
          await page.keyboard.press("Enter");
          if (!((await faq.getAttribute("open")) !== null))
            throw new Error("FAQ keyboard disclosure failed");
        }
        if (errors.length) throw new Error(errors.join("\n"));
        await page.screenshot({
          path: path.join(
            dir,
            brief.routeId.replace(/[^a-z0-9]/giu, "-") + "-" + width + ".png",
          ),
          fullPage: true,
        });
        views++;
      }
      if (
        (
          await page.request.get(origin + "/locations/north-testville/")
        ).status() !== 404
      )
        throw new Error("Evidence-poor location rendered");
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  // Apply a supported FAQ correction, prove the other page input is byte-identical,
  // rebuild and verify initial HTML plus hydrated target at both widths.
  const routeId = "service:" + config.services[0].name.toLowerCase();
  const otherId = "service:" + config.services[1].name.toLowerCase();
  const beforeOther = JSON.stringify(config.pageContent[otherId]);
  const otherBrief = report.briefs.find((brief) => brief.routeId === otherId);
  const beforeOtherHtml = await fs.readFile(
    path.join(dir, "dist", otherBrief.path.slice(1), "index.html"),
    "utf8",
  );
  const value =
    "Describe whether the concern affects one fixture or several fixtures before discussing the requested scope.";
  config.pageEvidence.push({
    id: "revision-answer",
    value,
    source: "synthetic explicit client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [routeId],
  });
  config.pageEvidence.push({
    id: "revision-question",
    value: "What scope detail should I include?",
    source: "synthetic explicit client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [routeId],
  });
  const operation = {
    kind: "set_page_content",
    routeId,
    field: "faqs",
    value: [
      {
        question: "What scope detail should I include?",
        answer: { text: value, evidenceIds: ["revision-answer"] },
      },
    ],
  };
  if (
    !applyOperation(config, operation) ||
    JSON.stringify(config.pageContent[otherId]) !== beforeOther
  )
    throw new Error("Revision exceeded its route scope");
  config.revisionReport = {
    results: [{ feedbackIndex: 0, status: "fulfilled" }],
    expectedArtifacts: expectedArtifacts([operation], config),
  };
  await fs.writeFile(
    path.join(dir, "src/site.config.json"),
    JSON.stringify(config, null, 2),
  );
  await exec(
    path.join(root, "node_modules/.bin/astro"),
    ["build", "--root", dir],
    { cwd: root, env, maxBuffer: 10 * 1024 * 1024 },
  );
  const target = compilePageBriefs(config).briefs.find(
    (brief) => brief.routeId === routeId,
  );
  const html = await fs.readFile(
    path.join(dir, "dist", target.path.slice(1), "index.html"),
    "utf8",
  );
  const verified = verifyRevision(config, config.revisionReport, "", html, {
    [target.path]: html,
  });
  if (!verified.ok) throw new Error(verified.failures.join("\n"));
  const afterOtherHtml = await fs.readFile(
    path.join(dir, "dist", otherBrief.path.slice(1), "index.html"),
    "utf8",
  );
  if (afterOtherHtml !== beforeOtherHtml)
    throw new Error("Revision changed unrelated rendered page");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const revisedOrigin = "http://127.0.0.1:" + server.address().port;
  const revisedBrowser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await revisedBrowser.newPage({
        viewport: { width, height: 900 },
      });
      await page.goto(revisedOrigin + target.path, {
        waitUntil: "networkidle",
      });
      await page
        .locator("details")
        .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)));
      const body = await page.locator("body").innerText();
      if (
        !body.includes(value) ||
        body.includes(
          report.briefs.find((brief) => brief.routeId === routeId).faqs[0]
            .answer,
        )
      )
        throw new Error("Hydrated route revision did not replace the FAQ");
      await page.screenshot({
        path: path.join(dir, "revised-service-" + width + ".png"),
        fullPage: true,
      });
      await page.close();
    }
  } finally {
    await revisedBrowser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const policyHtml = await fs.readFile(
    path.join(dir, "dist/privacy/index.html"),
    "utf8",
  );
  if (!policyHtml.includes(config.supportingPages.privacy.body.trim()))
    throw new Error("Supplied policy body changed");
  const contrast = await auditBuiltContrast({ dist: path.join(dir, "dist") });
  await fs.writeFile(
    path.join(dir, "contrast.json"),
    JSON.stringify(contrast, null, 2),
  );
  // Stage 3 owns inner/supporting routes. Retain the full-site verdict as
  // separate evidence; homepage art/focus findings still block a full release.
  const stage3Paths = new Set(report.briefs.map((brief) => brief.path));
  const stage3ContrastFailures = contrast.findings.filter(
    (finding) => finding.status !== "pass" && stage3Paths.has(finding.route),
  );
  if (stage3ContrastFailures.length)
    throw new Error(
      "Stage 3 contrast/focus gate failed: " +
        JSON.stringify(stage3ContrastFailures.slice(0, 5)),
    );
  console.log(
    JSON.stringify({
      scenario,
      build: true,
      gate: true,
      browserViewports: views,
      routeRevision: true,
      hydratedRevisionViewports: 2,
      unchangedOtherPage: true,
      unchangedOtherHtml: true,
      policyPreserved: true,
      stage3Contrast: stage3ContrastFailures.length === 0,
      fullSiteContrast: contrast.pass,
      fullSitePublishReady: false,
      deferredLocation404: true,
      providerRequests: 0,
    }),
  );
}
