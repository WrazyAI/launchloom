import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { normalise, prepareGenerationIntake } from "./generate-site-config.mjs";
import { copyClientBuildInput } from "./client-build-environment.mjs";
import {
  CLIENT_INTAKE_FILE_FIELDS,
  createClientIntakeSubmission,
} from "../src/lib/client-intake-contract.mjs";

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const clientTemplate = path.join(repository, "templates/client-site");
const LOCAL_SEO_RESEARCH = Object.freeze({
  version: 1,
  mode: "context-only",
  publishReady: false,
  validatedQueries: [],
  customerQuestions: [],
  copyVocabulary: [],
  pageDecisions: [],
  prohibitedClaims: [],
  evidence: [],
  cost: { tasks: 0, usd: 0, limitUsd: 0 },
  warnings: ["Local review generation skips external SEO research."],
});

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function affirmative(value) {
  return (
    value === true ||
    ["yes", "on", "true"].includes(String(value || "").toLowerCase())
  );
}

function requireField(intake, field, label = field) {
  if (!String(intake[field] || "").trim())
    throw new Error(`Local generation requires ${label}.`);
}

function reviewArtwork(config, view) {
  const brand = /^#[0-9a-f]{6}$/iu.test(config.style.primaryColor)
    ? config.style.primaryColor
    : "#235d57";
  const background = "#f1eee5";
  const ink = "#13241f";
  const accent = "#d79a5c";
  const details =
    view === "hero"
      ? `<path d="M190 650h255V315h310v250h255" fill="none" stroke="${brand}" stroke-width="68" stroke-linecap="round" stroke-linejoin="round"/><circle cx="190" cy="650" r="62" fill="${accent}"/><circle cx="1010" cy="565" r="62" fill="${accent}"/><path d="M555 315v-95h200v95" fill="none" stroke="${ink}" stroke-width="34" stroke-linejoin="round"/>`
      : `<path d="M190 610h220V380h380v185h220" fill="none" stroke="${brand}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/><circle cx="190" cy="610" r="48" fill="${accent}"/><circle cx="1010" cy="565" r="48" fill="${accent}"/><path d="M610 380v-90h145v90" fill="none" stroke="${ink}" stroke-width="28" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img"><rect width="1200" height="900" fill="${background}"/><circle cx="850" cy="260" r="235" fill="#dce8de"/><path d="M0 760c225-150 376-150 600 0s375 150 600 0v140H0z" fill="#e5dfd1"/>${details}</svg>`;
}

async function addLocalReviewArtwork(config, siteRoot) {
  const assetRoot = path.join(siteRoot, "public/images/local-review");
  await fs.mkdir(assetRoot, { recursive: true });
  const art = {};
  for (const view of ["hero", "secondary"]) {
    const localPath = `/images/local-review/${view}.svg`;
    const clientAsset =
      view === "hero"
        ? config.assets?.photoOne
        : config.assets?.photoTwo ||
          config.assets?.photoThree ||
          config.assets?.teamPhoto;
    if (!clientAsset) {
      await fs.writeFile(
        path.join(assetRoot, `${view}.svg`),
        reviewArtwork(config, view),
        {
          mode: 0o600,
        },
      );
      config.images[view] = localPath;
      art[view] = {
        asset: `${view}.svg`,
        placement: view === "hero" ? "hero" : "story",
        source: "local-review-art",
      };
    }
  }
  if (Object.keys(art).length) {
    config.assetReport = config.assetReport || { used: [], skipped: [] };
    const replacedPlacements = new Set(
      Object.values(art).map((item) => item.placement),
    );
    config.assetReport.used = [
      ...config.assetReport.used.filter(
        (item) => !replacedPlacements.has(item.placement),
      ),
      ...Object.values(art),
    ];
  }
}

/**
 * Convert the current online form payload into the same site config shape as
 * production without invoking the model or SEO providers.
 * @param {Record<string, unknown>} rawSubmission
 */
export function prepareLocalClientGeneration(rawSubmission) {
  const payload = createClientIntakeSubmission(rawSubmission, {
    submissionId: String(rawSubmission.submissionId || ""),
    assets:
      rawSubmission.assets && typeof rawSubmission.assets === "object"
        ? Object.fromEntries(
            CLIENT_INTAKE_FILE_FIELDS.flatMap((field) => {
              const value = rawSubmission.assets[field];
              return typeof value === "string" ? [[field, value]] : [];
            }),
          )
        : {},
  });

  if (!/^[a-z0-9-]{12,100}$/iu.test(payload.submissionId))
    throw new Error("Local generation requires a valid submission ID.");
  for (const [field, label] of [
    ["businessName", "a business name"],
    ["contactName", "a contact name"],
    ["email", "a contact email"],
    ["phone", "a contact phone number"],
    ["address", "a business address"],
    ["services", "at least one service"],
    ["serviceAreas", "at least one service area"],
  ])
    requireField(payload, field, label);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(payload.email))
    throw new Error("Local generation requires a valid contact email.");
  if (
    !affirmative(payload.confirmAccuracy) ||
    !affirmative(payload.confirmRights) ||
    !affirmative(payload.confirmSeoResearch)
  )
    throw new Error("Local generation requires all online form confirmations.");

  const intake = {
    ...payload,
    seoResearch: LOCAL_SEO_RESEARCH,
  };
  const config = normalise({}, prepareGenerationIntake(intake));
  const primaryService = config.services[0]?.name || "Local service";
  const primaryArea = config.business.serviceAreas[0] || "your area";
  config.business.tagline = `${primaryService} in ${primaryArea}`;
  config.business.hours = "";
  config.copy.heroHeading = `${primaryService} in ${primaryArea}`;
  config.copy.heroBody =
    payload.differentiators ||
    `Ask about ${primaryService.toLowerCase()} in ${primaryArea}.`;
  config.conversion.faqs = [
    {
      question: `What should I share about ${primaryService.toLowerCase()}?`,
      answer:
        "Describe the service you need and the address. The team can confirm coverage and explain an available next step.",
    },
    {
      question: "How can I request service?",
      answer: `Use the request form or call ${config.business.phone}. Share the service and address so the team can review your request.`,
    },
  ];
  config.seoResearch = {
    ...config.seoResearch,
    mode: "context-only",
    publishReady: false,
  };
  return { payload, config, publishReady: false };
}

function contentType(filePath) {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ||
    "application/octet-stream"
  );
}

async function serveStaticSite(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url || "/", "http://127.0.0.1").pathname,
      );
      const relative = pathname.replace(/^\/+/, "");
      const filePath = path.resolve(
        root,
        !relative || relative.endsWith("/")
          ? path.join(relative, "index.html")
          : relative,
      );
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`))
        throw new Error("Unsafe site path");
      const body = await fs.readFile(filePath);
      response.writeHead(200, { "Content-Type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function captureReviewScreenshots(siteDist, destination, serviceSlug) {
  const server = await serveStaticSite(siteDist);
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const viewport of [
      { key: "desktop", width: 1440, height: 960 },
      { key: "mobile", width: 390, height: 844 },
    ]) {
      for (const pageRoute of [
        "/",
        `/services/${encodeURIComponent(serviceSlug)}/`,
      ]) {
        const pageName = pageRoute === "/" ? "home" : "service";
        const page = await browser.newPage({ viewport });
        await page.route("**/*", (route) => {
          const requestOrigin = new URL(route.request().url()).origin;
          return requestOrigin === server.origin
            ? route.continue()
            : route.abort();
        });
        const response = await page.goto(`${server.origin}${pageRoute}`, {
          waitUntil: "domcontentloaded",
        });
        if (!response?.ok())
          failures.push(
            `${pageName} ${viewport.key} route did not load (${response?.status() || "no response"}).`,
          );
        const bodyText = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        if (!bodyText.trim())
          failures.push(
            `${pageName} ${viewport.key} page has no visible text.`,
          );
        if (bodyText.includes("—"))
          failures.push(
            `${pageName} ${viewport.key} page contains an em dash.`,
          );
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasOverflow)
          failures.push(
            `${pageName} ${viewport.key} page overflows horizontally.`,
          );
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await page.waitForTimeout(100);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(destination, `${pageName}-${viewport.key}.png`),
          fullPage: true,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures.length)
    throw new Error(
      `Local rendered review failed:\n- ${failures.join("\n- ")}`,
    );
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index < 0 ? "" : argv[index + 1];
  if (!value || value.startsWith("--")) return "";
  return value;
}

/** Build a deterministic, private review bundle from an online form payload. */
export async function generateLocalClientSite({ intakePath, outputPath }) {
  if (!intakePath || !outputPath)
    throw new Error(
      "Local generation requires both an intake JSON file and output directory.",
    );
  const intakeFile = path.resolve(intakePath);
  const destination = path.resolve(outputPath);
  const rawSubmission = JSON.parse(await fs.readFile(intakeFile, "utf8"));
  const result = prepareLocalClientGeneration(rawSubmission);
  await fs.access(destination).then(
    () => {
      throw new Error(
        "The local output directory already exists; choose a fresh path.",
      );
    },
    (error) => {
      if (error.code !== "ENOENT") throw error;
    },
  );

  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-local-client-"),
  );
  const isolatedHome = path.join(workspace, "home");
  const siteSource = path.join(workspace, "site-source");
  const screenshots = path.join(workspace, "qa");
  let destinationCreated = false;
  await fs.mkdir(isolatedHome, { mode: 0o700 });
  await fs.mkdir(screenshots, { mode: 0o700 });
  try {
    await copyClientBuildInput(clientTemplate, siteSource);
    await addLocalReviewArtwork(result.config, siteSource);
    await fs.writeFile(
      path.join(siteSource, "src/site.config.json"),
      `${JSON.stringify(result.config, null, 2)}\n`,
      { mode: 0o600 },
    );
    const env = {
      PATH: process.env.PATH || "",
      HOME: isolatedHome,
      TMPDIR: isolatedHome,
      TEMP: isolatedHome,
      TMP: isolatedHome,
      CI: "true",
      npm_config_userconfig: "/dev/null",
    };
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], {
      cwd: siteSource,
      env,
      stdio: "inherit",
    });
    execFileSync("npm", ["run", "build"], {
      cwd: siteSource,
      env,
      stdio: "inherit",
    });
    const dist = path.join(siteSource, "dist");
    await captureReviewScreenshots(
      dist,
      screenshots,
      result.config.services[0].slug,
    );

    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.mkdir(destination, { recursive: false, mode: 0o700 });
    destinationCreated = true;
    await fs.cp(dist, path.join(destination, "site"), { recursive: true });
    await fs.cp(screenshots, path.join(destination, "qa"), { recursive: true });
    await fs.writeFile(
      path.join(destination, "site.config.json"),
      `${JSON.stringify(result.config, null, 2)}\n`,
      { mode: 0o600 },
    );
    await fs.writeFile(
      path.join(destination, "generation-receipt.json"),
      `${JSON.stringify(
        {
          version: 1,
          mode: "local-review",
          submissionId: result.payload.submissionId,
          publishReady: false,
          generationProvidersCalled: [],
          externalBrowserRequestsBlocked: true,
          published: false,
          screenshots: [
            "qa/home-desktop.png",
            "qa/home-mobile.png",
            "qa/service-desktop.png",
            "qa/service-mobile.png",
          ],
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    return destination;
  } catch (error) {
    if (destinationCreated)
      await fs
        .rm(destination, { recursive: true, force: true })
        .catch(() => {});
    throw error;
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const intakePath = readFlag(process.argv, "--intake");
  const outputPath = readFlag(process.argv, "--out");
  if (!intakePath || !outputPath)
    throw new Error(
      "Usage: node scripts/local-client-generation.mjs --intake form-payload.json --out review-bundle",
    );
  const output = await generateLocalClientSite({ intakePath, outputPath });
  process.stdout.write(`Local review bundle created at ${output}\n`);
}
