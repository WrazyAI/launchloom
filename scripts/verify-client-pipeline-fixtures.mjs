import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { compileCanonicalSiteBrief } from "./compile-canonical-site-brief.mjs";
import { researchSiteContext, renderSeoMapMarkdown } from "./seo-research.mjs";
import { generateSiteConfigWithModel } from "./generate-site-config.mjs";
import { checkSeoRelease } from "./seo-release-gate.mjs";
import { OPENROUTER_CHAT_COMPLETIONS_URL } from "./openrouter-client.mjs";
import {
  createClientIntakeV2Submission,
  normalizeClientIntake,
} from "../src/lib/client-intake-v2.mjs";
import { prepareLocalClientIntake } from "./local-client-generation.mjs";

const repository = path.resolve(new URL("..", import.meta.url).pathname);
const templateRoot = path.join(repository, "templates/client-site");
const siteConfigPath = path.join(templateRoot, "src/site.config.json");
const fixtures = [
  {
    key: "urgent-plumbing",
    businessName: "Harbor Plumbing",
    industry: "home-services",
    address: "10 Example Street, Tacoma, WA 98402",
    primaryCity: "Tacoma, WA",
    services: ["Emergency plumbing", "Drain cleaning", "Water heater repair"],
    differentiators: ["Clear communication", "Careful work areas", "Practical explanations"],
    primaryCta: "Request a quote",
    radius: "20",
    coverage: ["Tacoma, WA", "Lakewood", "Puyallup", "University Place", "Fircrest", "Fife", "Spanaway", "Steilacoom", "Ruston", "Parkland", "Gig Harbor"],
    promise: "A clear next step for urgent plumbing concerns",
    description: "Share the plumbing issue and service address so the team can explain the next step to request.",
  },
  {
    key: "painting",
    businessName: "Northline Painting",
    industry: "home-services",
    address: "20 Example Avenue, Charleston, SC 29401",
    primaryCity: "Charleston, SC",
    services: ["Exterior painting", "Interior painting", "Cabinet refinishing"],
    differentiators: ["Thoughtful preparation", "Tidy work areas", "Clear project updates"],
    primaryCta: "Request a quote",
    radius: "30",
    coverage: ["Charleston, SC", "Mount Pleasant", "North Charleston", "Sullivan's Island", "Isle of Palms", "James Island", "Folly Beach", "Hanahan", "Goose Creek", "Summerville", "Ladson"],
    promise: "A considered plan for your painting project",
    description: "Compare the confirmed painting services and share the rooms or surfaces you want to discuss.",
  },
  {
    key: "water-restoration",
    businessName: "Cedarline Restoration",
    industry: "home-services",
    address: "30 Example Road, Austin, TX 78701",
    primaryCity: "Austin, TX",
    services: ["Water damage restoration", "Structural drying", "Contents cleaning"],
    differentiators: ["Clear assessment steps", "Respect for household routines", "Direct communication"],
    primaryCta: "Request an assessment",
    radius: "30",
    coverage: ["Austin, TX", "West Lake Hills", "Rollingwood", "Pflugerville", "Manor", "Sunset Valley", "Bee Cave", "Lakeway", "Round Rock", "Cedar Park", "Buda"],
    promise: "Understand the next step after water damage",
    description: "Describe the affected area and location so the team can explain what information helps with an assessment.",
  },
  {
    key: "professional-services",
    businessName: "Oak & Ledger Tax",
    industry: "professional-services",
    address: "40 Example Lane, Portland, OR 97204",
    primaryCity: "Portland, OR",
    services: ["Tax preparation", "Bookkeeping", "Payroll processing"],
    differentiators: ["Plain-language explanations", "Organized records", "A direct point of contact"],
    primaryCta: "Request a consultation",
    radius: "20",
    coverage: ["Portland, OR", "Beaverton", "Gresham", "Lake Oswego", "Milwaukie", "Tigard", "Hillsboro", "Happy Valley", "Oregon City", "Tualatin", "West Linn"],
    promise: "Clear support for everyday business finances",
    description: "Explore the confirmed services and share the business questions you want to discuss.",
  },
  {
    key: "care-wellness",
    businessName: "Harbor Glow Wellness",
    industry: "wellness",
    address: "50 Example Boulevard, Austin, TX 78704",
    primaryCity: "Austin, TX",
    services: ["Skin consultation", "Skin renewal", "Wrinkle smoothing"],
    differentiators: ["Time for questions", "Options explained clearly", "A considered consultation"],
    primaryCta: "Book a consultation",
    radius: "10",
    coverage: ["Austin, TX", "West Lake Hills", "Rollingwood", "Sunset Valley", "Bee Cave", "Lakeway", "Manor", "Pflugerville", "Round Rock", "Buda", "Kyle"],
    promise: "A thoughtful place to begin a care conversation",
    description: "Share what you are considering and the team can explain the consultation process and available options.",
  },
];

function researchProvider() {
  return {
    async googleSearchVolume({ keywords }) {
      return { cost: 0, keywords: keywords.map((keyword) => ({ keyword, searchVolume: 90, cpc: 4.2, competition: 0.62 })) };
    },
    async searchIntent({ keywords }) {
      return { cost: 0, keywords: keywords.map((keyword) => ({ keyword, intent: /cost|price/iu.test(keyword) ? "informational" : "commercial" })) };
    },
    async bulkKeywordDifficulty({ keywords }) {
      return { cost: 0, keywords: keywords.map((keyword) => ({ keyword, difficulty: 38 })) };
    },
    async organicSerp({ keyword }) {
      return {
        cost: 0,
        query: keyword,
        results: [
          { position: 1, title: "Local service overview", url: "https://market-one.example/services/", domain: "market-one.example" },
          { position: 2, title: "Service options and process", url: "https://market-two.example/repair/", domain: "market-two.example" },
          { position: 3, title: "Area service guide", url: "https://market-three.example/service-area/", domain: "market-three.example" },
        ],
        questions: ["What should I ask before choosing this service?", "What details help the team assess this request?"],
      };
    },
    async relatedKeywords({ keyword }) {
      return { cost: 0, keywords: [{ keyword: `${keyword} cost`, searchVolume: 30, cpc: 2.1, competition: 0.3, intent: "informational" }] };
    },
    async rankedKeywords({ target }) {
      return { cost: 0, keywords: [{ keyword: `${target} local services`, position: 8, url: `https://${target}/services/`, title: "Services", searchVolume: 25 }] };
    },
  };
}

function unavailableResearchProvider() {
  return {
    async googleSearchVolume() { return { cost: 0, keywords: [] }; },
    async searchIntent() { return { cost: 0, keywords: [] }; },
    async bulkKeywordDifficulty() { return { cost: 0, keywords: [] }; },
    async organicSerp({ keyword }) { return { cost: 0, query: keyword, results: [], questions: [] }; },
    async relatedKeywords() { return { cost: 0, keywords: [] }; },
    async rankedKeywords() { return { cost: 0, keywords: [] }; },
  };
}

function onlineFormSubmission(fixture) {
  const brandColor = fixture.brandColor || "#245a46";
  return createClientIntakeV2Submission(
    {
      "bot-field": "",
      businessName: fixture.businessName,
      contactName: "Test Owner",
      email: `preview-${fixture.key}@example.test`,
      phone: "(555) 555-0100",
      address: fixture.address,
      website: "",
      domain: "",
      services: fixture.services.join("\n"),
      industry: fixture.industry,
      serviceAreas: fixture.primaryCity,
      serviceRadius: fixture.radius,
      differentiators: Array.isArray(fixture.differentiators)
        ? fixture.differentiators.join("; ")
        : String(fixture.differentiators || ""),
      primaryCta: fixture.primaryCta,
      brandNotes: "Use clear, practical language.",
      brandColorPicker: brandColor,
      brandColor,
      leadEmail: `leads-${fixture.key}@example.test`,
      gmbSkipped: "yes",
      confirmRights: "yes",
      confirmSeoResearch: "yes",
      confirmAccuracy: "yes",
    },
    {
      submissionId: `fixture-${fixture.key}`,
      inviteToken: "local-fixture-only",
      assets: {},
    },
  );
}

function candidateFor(fixture, brief) {
  const services = brief.services.map((name) => ({
    name,
    description: `Discuss the scope, options, and preparation for ${name.toLowerCase()} with the team before choosing a next step.`,
    decisionSupport: {
      scope: `Ask what a request for ${name.toLowerCase()} usually covers.`,
      nextStep: "Describe your needs and ask which next step fits.",
      preparation: "Note the questions and timing you want to discuss.",
    },
  }));
  return {
    preset: fixture.industry === "home-services" ? "home-services" : "wellness",
    business: {
      name: fixture.businessName,
      tagline: fixture.promise,
      description: fixture.description,
      phone: brief.phone,
      email: brief.email,
      address: brief.address,
      serviceAreas: brief.coverageAreas,
      hours: brief.hours,
      primaryCta: fixture.primaryCta,
      leadEmail: brief.leadEmail,
      domain: brief.domain,
    },
    style: { tone: fixture.industry === "wellness" ? "calm" : "clear" },
    services,
    differentiators: fixture.differentiators,
    locations: [],
    copy: {
      heroKicker: `Serving ${fixture.primaryCity}`,
      heroHeading: fixture.promise,
      heroBody: fixture.description,
      servicesHeading: "Options for the work ahead",
      servicesIntro: "Review the confirmed services and choose the most useful next step.",
      aboutKicker: "Start with the situation",
      aboutHeading: "Clear information before a decision",
      aboutBody: "Share your needs and questions so the team can explain the available options.",
      contactKicker: "Start a conversation",
      contactHeading: fixture.primaryCta,
      processKicker: "What happens next",
      processHeading: "A clear path from question to next step",
      faqKicker: "Useful details",
      faqHeading: "Questions to consider",
      formIntro: "Share the service you are considering and the team can follow up about next steps.",
    },
    conversion: {
      process: [
        "Describe the service and location you have in mind.",
        "The team reviews the details you share.",
        "Discuss practical next steps before scheduling.",
      ],
      faqs: [
        { question: "What information should I share?", answer: "Describe the service you are considering, your location, and the main questions you want answered. The team can explain which next step is appropriate." },
        { question: "How do I get started?", answer: "Choose a confirmed service and use the contact form or phone link to start a conversation about your situation." },
      ],
    },
  };
}

function contentType(file) {
  return ({ ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain", ".html": "text/html; charset=utf-8" })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function pageUrl(origin, route) {
  return new URL(route, origin).href;
}

async function verifyRenderedSite({ fixture, config, dist, outputDir, origin, browser, setServingDist }) {
  const releaseErrors = await checkSeoRelease({ mode: "review", config, dist });
  if (releaseErrors.length) throw new Error(`${fixture.key} review gate: ${releaseErrors.join(" ")}`);
  if (config.locations.length) throw new Error(`${fixture.key} created unsupported location pages from coverage facts.`);
  if (config.seoPageMap.filter((page) => page.pageType === "service").length !== fixture.services.length)
    throw new Error(`${fixture.key} service map does not match the client-confirmed services.`);
  if (!config.seoPageMap.some((page) => page.pageType === "blog-index" && page.renderWhenArticlesExist === true))
    throw new Error(`${fixture.key} SEO map is missing the empty blog capability marker.`);

  setServingDist(dist);
  const requiredRoutes = ["/", "/services/", "/about/", "/contact/", ...config.services.map((service) => `/services/${service.slug}/`)];
  for (const route of requiredRoutes) {
    const html = await fs.readFile(path.join(dist, route.slice(1), "index.html"), "utf8");
    if (html.includes("—")) throw new Error(`${fixture.key} ${route} rendered an em dash.`);
    if ((html.match(/<h1\b/giu) || []).length !== 1) throw new Error(`${fixture.key} ${route} does not have exactly one H1.`);
  }

  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    for (const route of ["/", `/services/${config.services[0].slug}/`]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const reviewUrl = new URL(pageUrl(origin, route));
      reviewUrl.searchParams.set("review", "local-fixture");
      await page.goto(reviewUrl.href, { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => {
        await Promise.all([...document.images].map(async (image) => {
          image.loading = "eager";
          try { await image.decode(); } catch { /* a missing optional image is checked below */ }
        }));
      });
      const state = await page.evaluate(() => {
        const channels = (color) => {
          const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/u);
          if (srgb) return srgb.slice(1, 4).map((value) => Number(value) * 255);
          const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/u);
          return rgb ? rgb.slice(1, 4).map(Number) : [];
        };
        const luminance = (color) => {
          const values = channels(color).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const contrast = (foreground, background) => {
          const a = luminance(foreground);
          const b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const hero = document.querySelector(".inner-hero");
        const heading = hero?.querySelector("h1");
        const paragraph = hero?.querySelector("p");
        const background = hero ? getComputedStyle(hero).backgroundColor : "";
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          headingCount: document.querySelectorAll("h1").length,
          formCount: document.querySelectorAll("form").length,
          emailCount: document.querySelectorAll('input[type="email"]').length,
          navigationCount: document.querySelectorAll("header nav a").length,
          imageCount: document.querySelectorAll("main img").length,
          heroHeadingContrast: heading ? contrast(getComputedStyle(heading).color, background) : null,
          heroBodyContrast: paragraph ? contrast(getComputedStyle(paragraph).color, background) : null,
          text: document.body.innerText,
        };
      });
      if (state.overflow > 1) throw new Error(`${fixture.key} ${viewport.name} ${route} overflows by ${state.overflow}px.`);
      if (state.headingCount !== 1) throw new Error(`${fixture.key} ${route} renders ${state.headingCount} H1 headings.`);
      if (state.formCount < 1 || state.emailCount < 1) throw new Error(`${fixture.key} ${route} has no usable lead form.`);
      if (state.imageCount < 1) throw new Error(`${fixture.key} ${route} has no contextual image visible in the main content.`);
      if (route.startsWith("/services/") && state.heroHeadingContrast !== null && state.heroHeadingContrast < 3)
        throw new Error(`${fixture.key} ${viewport.name} service hero heading contrast is ${state.heroHeadingContrast.toFixed(2)}:1; expected at least 3:1.`);
      if (route.startsWith("/services/") && state.heroBodyContrast !== null && state.heroBodyContrast < 4.5)
        throw new Error(`${fixture.key} ${viewport.name} service hero copy contrast is ${state.heroBodyContrast.toFixed(2)}:1; expected at least 4.5:1.`);
      if (!config.business.offer && state.text.includes("Start with what matters most today."))
        throw new Error(`${fixture.key} ${route} displays offer-like copy when the intake has no offer.`);
      if (/lorem ipsum|sample business|your business name|guaranteed results|award-winning|24\/7 service/iu.test(state.text))
        throw new Error(`${fixture.key} ${route} contains placeholder copy or an unsupported proof claim.`);
      if (route === "/" && (!state.text.includes(fixture.primaryCity) || (fixture.coverage[1] && !state.text.includes(fixture.coverage[1]))))
        throw new Error(`${fixture.key} homepage coverage section is missing the primary or nearby community.`);
      if (errors.length) throw new Error(`${fixture.key} browser error: ${errors.join("; ")}`);
      if (["desktop", "mobile"].includes(viewport.name)) {
        const file = path.join(outputDir, "screenshots", fixture.key, `${route === "/" ? "home" : "service"}-${viewport.name}.png`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file, fullPage: true });
      }
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pageUrl(origin, "/services/"), { waitUntil: "domcontentloaded" });
  const serviceLinks = await page.locator(`a[href^="/services/"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href) => href && href !== "/services/"));
  if (!serviceLinks.includes(`/services/${config.services[0].slug}/`)) throw new Error(`${fixture.key} services hub does not link to its confirmed service page.`);
  await page.close();
}

function fixtureVisual(fixture, placement) {
  const colors = fixture.industry === "home-services"
    ? ["#10251f", "#c8ec58", "#e9eee7"]
    : fixture.industry === "professional-services"
      ? ["#172c3b", "#dfbd86", "#e7edf0"]
      : ["#173d37", "#d5e2d4", "#f0e8db"];
  if (/^#[0-9a-f]{6}$/iu.test(fixture.brandColor || "")) colors[1] = fixture.brandColor;
  const motifs = {
    "urgent-plumbing": `<path d="M710 0v235h150v190H600v185h250v210" fill="none" stroke="${colors[1]}" stroke-width="34" stroke-linejoin="round"/><circle cx="605" cy="610" r="84" fill="${colors[2]}" opacity=".82"/><path d="M605 534c-48 69-56 90-56 116a56 56 0 0 0 112 0c0-26-9-47-56-116Z" fill="${colors[1]}"/>`,
    painting: `<path d="M600 160h190v230H600z" rx="24" fill="${colors[1]}"/><path d="M685 390h52v255h-52z" fill="${colors[2]}"/><path d="M350 670 560 310l56 32-210 360Z" fill="${colors[1]}"/><path d="M350 670h120l-70 76Z" fill="${colors[2]}"/>`,
    "water-restoration": `<path d="M700 135 910 330H835v265H565V330h-75Z" fill="none" stroke="${colors[1]}" stroke-width="26" stroke-linejoin="round"/><path d="M700 300c-56 81-66 108-66 140a66 66 0 0 0 132 0c0-32-10-59-66-140Z" fill="${colors[2]}"/>`,
    "professional-services": `<rect x="555" y="150" width="340" height="470" rx="18" fill="${colors[2]}"/><path d="M615 245h220M615 315h160M615 385h205M615 455h140" stroke="${colors[0]}" stroke-width="18" stroke-linecap="round"/><circle cx="775" cy="585" r="118" fill="${colors[1]}" opacity=".9"/>`,
    "care-wellness": `<path d="M665 700c-74-170-30-360 112-485 55 174 25 352-112 485Z" fill="${colors[1]}"/><path d="M700 675c-180-72-270-226-256-412 158 88 249 233 256 412Z" fill="${colors[2]}"/><path d="M704 740V340" stroke="${colors[0]}" stroke-width="22" stroke-linecap="round"/>`,
  };
  const accent = placement === "secondary" ? colors[2] : colors[1];
  const motif = motifs[fixture.visualKey || fixture.key] || motifs["urgent-plumbing"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" role="img" aria-label="Local illustrative service artwork"><defs><linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[0]}" stop-opacity=".78"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".24"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="780" fill="url(#surface)"/><circle cx="830" cy="365" r="420" fill="url(#glow)"/><circle cx="190" cy="665" r="200" fill="${colors[2]}" opacity=".08"/>${motif}<path d="M80 700h420" stroke="${colors[2]}" stroke-opacity=".3" stroke-width="2"/></svg>`;
}

async function materializeFixtureImages(config, fixture, publicAssetDir) {
  const images = { ...(config.images || {}) };
  const directoryName = path.basename(publicAssetDir);
  for (const placement of ["hero", "secondary", "tertiary"]) {
    if (!images[placement]) continue;
    const filename = `${fixture.key}-${placement}.svg`;
    await fs.writeFile(path.join(publicAssetDir, filename), fixtureVisual(fixture, placement));
    images[placement] = `/${directoryName}/${filename}`;
  }
  return { ...config, images };
}

async function main() {
  const intakeArgument = process.argv.indexOf("--intake");
  const intakeValue = intakeArgument >= 0 ? process.argv[intakeArgument + 1] : "";
  if (intakeArgument >= 0 && !intakeValue)
    throw new Error("Pass a JSON file path after --intake.");
  const intakePath = intakeValue ? path.resolve(intakeValue) : "";
  const localExample = intakePath
    ? prepareLocalClientIntake(JSON.parse(await fs.readFile(intakePath, "utf8")))
    : null;
  const localFormRun = Boolean(localExample);
  const selectedFixtures = localExample ? [localExample.fixture] : fixtures;
  const outputArgument = process.argv.indexOf("--out");
  const outputDir = path.resolve(outputArgument >= 0
    ? process.argv[outputArgument + 1] || path.join(os.tmpdir(), `launchloom-client-pipeline-${Date.now()}`)
    : localExample
      ? path.join(repository, "artifacts", "local-client-generations", localExample.fixture.key)
      : path.join(os.tmpdir(), `launchloom-client-pipeline-${Date.now()}`));
  await fs.mkdir(outputDir, { recursive: true });
  const originalConfig = await fs.readFile(siteConfigPath);
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const publicAssetDir = path.join(templateRoot, "public", `pipeline-fixture-assets-${process.pid}`);
  let activeFixture;
  let mockModelCalls = 0;
  let servingDist = "";
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//u, "");
      const file = path.resolve(servingDist, relative.endsWith("/") ? path.join(relative, "index.html") : relative);
      if (!file.startsWith(`${servingDist}${path.sep}`)) throw new Error("Unsafe path");
      const body = await fs.readFile(file);
      response.writeHead(200, { "Content-Type": contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  const browser = await chromium.launch({ headless: true });
  const summary = [];
  try {
    await fs.mkdir(publicAssetDir, { recursive: true });
    process.env.OPENROUTER_API_KEY = "fixture-only-no-network";
    globalThis.fetch = async (input) => {
      if (String(input) !== OPENROUTER_CHAT_COMPLETIONS_URL)
        throw new Error("The client pipeline fixture attempted unexpected network access.");
      mockModelCalls += 1;
      const candidate = candidateFor(activeFixture, activeFixture.brief);
      return new Response(JSON.stringify({
        id: `fixture-${activeFixture.key}-${mockModelCalls}`,
        provider: "local-fixture",
        choices: [{ message: { content: JSON.stringify(candidate) } }],
        usage: { prompt_tokens: 100, completion_tokens: 100, cost: 0 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const address = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address())));
    const origin = `http://127.0.0.1:${address.port}`;

    for (const fixture of selectedFixtures) {
      activeFixture = fixture;
      const formPayload = localExample?.payload || onlineFormSubmission(fixture);
      const intake = localExample?.intake || normalizeClientIntake(formPayload);
      const fixtureDir = path.join(outputDir, fixture.key);
      await fs.mkdir(fixtureDir, { recursive: true });
      await fs.writeFile(path.join(fixtureDir, "form-intake-v2.json"), `${JSON.stringify(formPayload, null, 2)}\n`);
      const enrichment = {
        version: 1,
        primaryCity: fixture.primaryCity,
        serviceRadius: localFormRun ? localExample.fixture.serviceRadius : Number(fixture.radius),
        serviceRadiusMiles: localFormRun ? localExample.fixture.serviceRadiusMiles : Number(fixture.radius),
        coverageAreas: fixture.coverage,
        coverageEvidence: localFormRun
          ? { source: "local_primary_city_only", lookups: 0, nearbyCommunities: 0 }
          : { source: "google_geocoding_fixture", lookups: 16, nearbyCommunities: fixture.coverage.length - 1 },
        warnings: localFormRun
          ? ["Offline example has no geocoder; only the client-confirmed primary city is included."]
          : [],
      };
      const research = await researchSiteContext({
        ...intake,
        coverageAreas: fixture.coverage,
        coverageEvidence: enrichment.coverageEvidence,
      }, {
        dataForSeo: localFormRun ? unavailableResearchProvider() : researchProvider(),
        maxTasks: localFormRun ? 2 : 16,
        maxUsd: localFormRun ? 0.1 : 0.25,
      });
      if (localFormRun && research.publishReady)
        throw new Error("Offline local generation must remain blocked from publication.");
      if (!localFormRun && !research.publishReady)
        throw new Error(`${fixture.key} fixture research did not satisfy the publish readiness contract: ${research.warnings.join(" ")}`);
      const brief = compileCanonicalSiteBrief({ intake, enrichment, research });
      activeFixture.brief = brief;
      const config = await generateSiteConfigWithModel(brief);
      if (!config.services.every((service, index) => service.name === fixture.services[index]))
        throw new Error(`${fixture.key} generation changed a client-confirmed service.`);
      if (config.locations.length) throw new Error(`${fixture.key} generation created location pages without separate evidence.`);
      if (!config.design?.experience?.packId || !config.design?.experience?.variantId)
        throw new Error(`${fixture.key} generation did not select a reviewed experience pack and variant.`);
      if (localFormRun && config.seoResearch?.publishReady === true)
        throw new Error(`${fixture.key} local preview must retain its incomplete research gate.`);
      if (!localFormRun && config.seoResearch?.publishReady !== true)
        throw new Error(`${fixture.key} generation lost SEO publication readiness.`);

      const renderConfig = await materializeFixtureImages(config, fixture, publicAssetDir);
      await fs.writeFile(path.join(fixtureDir, "business-enrichment.json"), `${JSON.stringify(enrichment, null, 2)}\n`);
      await fs.writeFile(path.join(fixtureDir, "seo-research.json"), `${JSON.stringify(research, null, 2)}\n`);
      await fs.writeFile(path.join(fixtureDir, "seo-map.md"), renderSeoMapMarkdown(research));
      await fs.writeFile(path.join(fixtureDir, "canonical-site-brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
      await fs.writeFile(path.join(fixtureDir, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);
      const renderConfigPath = path.join(fixtureDir, "render-config.json");
      await fs.writeFile(renderConfigPath, `${JSON.stringify(renderConfig, null, 2)}\n`);
      const historyPath = path.join(fixtureDir, "empty-history.json");
      await fs.writeFile(historyPath, JSON.stringify({ version: 1, launches: [] }));
      execFileSync(process.execPath, [
        path.join(repository, "scripts/compile-inspiration-pack.mjs"),
        "--config", path.join(fixtureDir, "site.config.json"),
        "--intake", path.join(fixtureDir, "canonical-site-brief.json"),
        "--history", historyPath,
        "--out", path.join(fixtureDir, "inspiration-pack.json"),
      ], { cwd: repository, stdio: "pipe", env: { ...process.env, LAUNCHLOOM_INTAKE_ID: intake.submissionId } });

      await fs.writeFile(siteConfigPath, `${JSON.stringify(renderConfig, null, 2)}\n`);
      const siteOrigin = `https://${fixture.key}.fixture.pages.dev`;
      let productionDist = null;
      if (!localFormRun) {
        productionDist = path.join(fixtureDir, "production-dist");
        await fs.rm(productionDist, { recursive: true, force: true });
        execFileSync("npm", ["run", "build", "--", "--outDir", productionDist], {
          cwd: templateRoot,
          stdio: "pipe",
          env: { ...process.env, PUBLIC_SITE_URL: siteOrigin, PUBLIC_REVIEW_MODE: "false", PUBLIC_LAUNCHLOOM_API_URL: "https://api.launchloom.example" },
        });
        const productionErrors = await checkSeoRelease({ mode: "production", config: renderConfig, dist: productionDist, origin: siteOrigin });
        if (productionErrors.length) throw new Error(`${fixture.key} production gate: ${productionErrors.join(" ")}`);
      }
      const reviewDist = path.join(fixtureDir, "review-dist");
      await fs.rm(reviewDist, { recursive: true, force: true });
      execFileSync("npm", ["run", "build", "--", "--outDir", reviewDist], {
        cwd: templateRoot,
        stdio: "pipe",
        env: { ...process.env, PUBLIC_SITE_URL: siteOrigin, PUBLIC_REVIEW_MODE: "true", PUBLIC_LAUNCHLOOM_API_URL: "https://api.launchloom.example" },
      });
      const reviewErrors = await checkSeoRelease({ mode: "review", config: renderConfig, dist: reviewDist });
      if (reviewErrors.length) throw new Error(`${fixture.key} review gate: ${reviewErrors.join(" ")}`);
      execFileSync(process.execPath, [
        path.join(repository, "scripts/verify-rendered-revision.mjs"),
        "--config", renderConfigPath,
        "--dist", reviewDist,
        "--screenshots", path.join(outputDir, "rendered-verification", fixture.key),
      ], { cwd: repository, stdio: "pipe", env: { ...process.env, PUBLIC_REVIEW_MODE: "true" } });
      await verifyRenderedSite({ fixture, config: renderConfig, dist: reviewDist, outputDir, origin, browser, setServingDist: (directory) => { servingDist = directory; } });
      summary.push({ key: fixture.key, businessName: fixture.businessName, servicePages: config.services.map((service) => service.slug), coverageCount: config.business.serviceAreas.length, experiencePack: config.design.experience.packId, variant: config.design.experience.variantId, researchTasks: research.cost.tasks, productionDist, reviewDist, screenshotDir: path.join(outputDir, "screenshots", fixture.key) });
      console.log(`fixture_pipeline_verified=${fixture.key} services=${config.services.length} coverage=${config.business.serviceAreas.length} pack=${config.design.experience.packId}`);
    }

    // The empty initial blog remains absent. This single test article exercises
    // the future publishing route without generating filler during intake.
    if (!localFormRun) {
    const blogFixture = fixtures[3];
    activeFixture = blogFixture;
    const blogIntake = {
      intakeVersion: "2", submissionId: "fixture-professional-blog", businessName: blogFixture.businessName,
      contactName: "Test Owner", email: "preview-blog@example.test", leadEmail: "leads-blog@example.test",
      phone: "(555) 555-0100", address: blogFixture.address, website: "https://professional.example",
      industry: blogFixture.industry, services: blogFixture.services, confirmedServices: blogFixture.services,
      primaryCity: blogFixture.primaryCity, serviceRadius: blogFixture.radius, serviceAreas: blogFixture.primaryCity,
      differentiators: blogFixture.differentiators, primaryCta: blogFixture.primaryCta, brandNotes: "Clear and helpful.",
    };
    const blogEnrichment = { primaryCity: blogFixture.primaryCity, serviceRadiusMiles: Number(blogFixture.radius), coverageAreas: blogFixture.coverage, coverageEvidence: { source: "fixture", lookups: 16 }, warnings: [] };
    const blogResearch = await researchSiteContext({ ...blogIntake, coverageAreas: blogFixture.coverage }, { dataForSeo: researchProvider(), maxTasks: 16, maxUsd: 0.25 });
    const blogBrief = compileCanonicalSiteBrief({ intake: blogIntake, enrichment: blogEnrichment, research: blogResearch });
    activeFixture.brief = blogBrief;
    const blogConfig = await generateSiteConfigWithModel(blogBrief);
    blogConfig.blogArticles = [{ slug: "organizing-business-records", title: "Organizing business records before a tax appointment", description: "A short checklist of records a business owner may want to gather before discussing tax preparation.", publishedAt: "2026-09-25", body: "Start with the records you already use to understand income and expenses. A preparer can confirm which documents apply to your circumstances.\n\nKeep questions about timing, filing status, and missing records together so the first conversation can focus on your situation." }];
    const renderBlogConfig = await materializeFixtureImages(blogConfig, blogFixture, publicAssetDir);
    await fs.writeFile(siteConfigPath, `${JSON.stringify(renderBlogConfig, null, 2)}\n`);
    const blogDist = path.join(outputDir, "future-blog-route/dist");
    await fs.mkdir(path.dirname(blogDist), { recursive: true });
    await fs.rm(blogDist, { recursive: true, force: true });
    execFileSync("npm", ["run", "build", "--", "--outDir", blogDist], { cwd: templateRoot, stdio: "pipe", env: { ...process.env, PUBLIC_SITE_URL: "https://professional-blog.fixture.pages.dev", PUBLIC_REVIEW_MODE: "true", PUBLIC_LAUNCHLOOM_API_URL: "https://api.launchloom.example" } });
    for (const route of ["blog", "blog/organizing-business-records"]) {
      const file = path.join(blogDist, route, "index.html");
      await fs.access(file);
      const html = await fs.readFile(file, "utf8");
      if (!html.includes(blogConfig.blogArticles[0].title)) throw new Error(`Future blog route ${route} is missing its article title.`);
    }
    summary.push({ key: "future-blog-route", articleCount: blogConfig.blogArticles.length, routes: ["/blog/", "/blog/organizing-business-records/"] });
    }
    await fs.writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify({
      mode: localFormRun ? "offline-form-intake-v2" : "offline-fixture-providers",
      metricEvidence: localFormRun
        ? "DataForSEO metrics unavailable; values remain null and publication remains blocked."
        : "synthetic DataForSEO-shaped fixtures only; not production research",
      copyGeneration: "mocked OpenRouter response through the site-config generation boundary",
      visualAssets: "locally generated illustrative SVG artwork; not evidence of completed work or client staff",
      formPayloadFields: localExample ? Object.keys(localExample.payload).sort() : undefined,
      mockModelCalls,
      cases: summary,
    }, null, 2)}\n`);
    console.log(`client_pipeline_fixtures_verified=${summary.length} mock_model_calls=${mockModelCalls} output=${outputDir}`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    await fs.writeFile(siteConfigPath, originalConfig);
    await fs.rm(publicAssetDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
