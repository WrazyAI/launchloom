import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { compileExperienceCandidates } from "../templates/client-site/src/lib/experience-pack.ts";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const siteDir = path.resolve(args["site-dir"] || "templates/client-site");
const configPath = path.resolve(siteDir, args.config || "src/site.config.json");
const reportPath = path.resolve(
  args.report || path.join(siteDir, ".launchloom/experience-bakeoff.json"),
);
const evidenceDir = path.resolve(
  args.screenshots ||
    path.join(path.dirname(reportPath), "experience-bakeoff-screenshots"),
);

function run(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PUBLIC_REVIEW_MODE: "true" },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
async function startServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url || "/", "http://localhost").pathname,
      );
      let target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(`${root}${path.sep}`) && target !== root)
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
    throw new Error("Could not start bakeoff server");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function inspect(page) {
  return page.evaluate(() => {
    const hero = document.querySelector("main > section:first-child");
    const bounds = hero?.getBoundingClientRect();
    const mainSections = [
      ...document.querySelectorAll("main > section, main > aside"),
    ];
    const visitorContent = [document.title, document.body.innerText]
      .filter(Boolean)
      .join("\n");
    return {
      renderedPackId: document
        .querySelector("[data-experience-pack]")
        ?.getAttribute("data-experience-pack"),
      fingerprint: document
        .querySelector("[data-layout-fingerprint]")
        ?.getAttribute("data-layout-fingerprint"),
      h1Count: document.querySelectorAll("h1").length,
      nav: [
        ...document.querySelectorAll('nav[aria-label="Main navigation"] a'),
      ].map((link) => link.textContent?.trim()),
      earlyConversion: mainSections[1]?.className || "",
      heroBottom: Math.round(bounds?.bottom || 0),
      viewportHeight: window.innerHeight,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      emDashes: (visitorContent.match(/—/gu) || []).length,
      hasServices: Boolean(document.querySelector("#services")),
      hasFaqs: Boolean(document.querySelector("#faqs")),
      hasContact: Boolean(document.querySelector("#contact")),
      brokenImages: [...document.images].filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      brokenFragments: [...document.querySelectorAll('a[href^="#"]')]
        .map((link) => link.getAttribute("href"))
        .filter((href) => href && href !== "#" && !document.querySelector(href))
        .length,
    };
  });
}

const original = JSON.parse(await fs.readFile(configPath, "utf8"));
const recipe = original.design?.recipe || "general-editorial";
const requiresFaqs = Boolean(original.conversion?.faqs?.length);
const candidates = compileExperienceCandidates(original, recipe).filter(
  (candidate) => candidate.compatibilityScore >= 0,
);
const browser = await chromium.launch({ headless: true });
const results = [];
await fs.mkdir(evidenceDir, { recursive: true });

try {
  for (const candidate of candidates) {
    const config = structuredClone(original);
    config.design ||= { recipe, sections: [] };
    config.design.experience = {
      ...(config.design.experience || {}),
      packId: candidate.packId,
      blueprintVersion: 2,
      selectionMode: "internal-bakeoff",
      candidatePackIds: candidates.map((item) => item.packId),
      fingerprint: candidate.blueprint.fingerprint,
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const candidateResult = {
      packId: candidate.packId,
      compatibilityScore: candidate.compatibilityScore,
      fingerprint: candidate.blueprint.fingerprint,
      valid: true,
      score: candidate.compatibilityScore,
      failures: [],
      viewports: [],
    };
    try {
      await run("npm", ["run", "build"], siteDir);
      const { server, origin } = await startServer(path.join(siteDir, "dist"));
      try {
        for (const viewport of [
          { name: "desktop", width: 1536, height: 864 },
          { name: "compact", width: 1366, height: 768 },
          { name: "mobile", width: 390, height: 844 },
        ]) {
          const page = await browser.newPage({ viewport });
          const browserErrors = [];
          page.on("pageerror", (error) => browserErrors.push(error.message));
          await page.goto(origin, { waitUntil: "networkidle" });
          const evidence = await inspect(page);
          const failures = [
            evidence.renderedPackId !== candidate.packId &&
              "wrong pack rendered",
            evidence.h1Count !== 1 && "expected one H1",
            evidence.nav.join("|") !== "Services|FAQs|Contact" &&
              "navigation contract failed",
            !/(ribbon|qualifier|request)/u.test(evidence.earlyConversion) &&
              "conversion is not immediate",
            viewport.name !== "mobile" &&
              evidence.heroBottom > evidence.viewportHeight + 1 &&
              "hero exceeds desktop viewport",
            evidence.overflow && "horizontal overflow",
            evidence.emDashes > 0 && "em dash found",
            (!evidence.hasServices || !evidence.hasContact) &&
              "required section missing",
            requiresFaqs &&
              !evidence.hasFaqs &&
              "configured FAQ section missing",
            evidence.brokenImages > 0 && "broken image",
            evidence.brokenFragments > 0 && "broken fragment link",
            browserErrors.length > 0 && "browser error",
          ].filter(Boolean);
          candidateResult.failures.push(
            ...failures.map((failure) => `${viewport.name}: ${failure}`),
          );
          candidateResult.viewports.push({
            ...viewport,
            ...evidence,
            browserErrors,
          });
          await page.screenshot({
            path: path.join(
              evidenceDir,
              `${candidate.packId}-${viewport.name}.png`,
            ),
            fullPage: true,
          });
          await page.close();
        }
      } finally {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } catch (error) {
      candidateResult.failures.push(
        error instanceof Error ? error.message : String(error),
      );
    }
    candidateResult.failures = [...new Set(candidateResult.failures)];
    candidateResult.valid = candidateResult.failures.length === 0;
    candidateResult.score = candidateResult.valid
      ? candidateResult.compatibilityScore
      : -1000;
    results.push(candidateResult);
  }
} finally {
  await browser.close();
}

const winner = [...results].sort((left, right) => right.score - left.score)[0];
const finalConfig = structuredClone(original);
finalConfig.design ||= { recipe, sections: [] };
if (winner?.valid) {
  finalConfig.design.experience = {
    ...(finalConfig.design.experience || {}),
    packId: winner.packId,
    blueprintVersion: 2,
    selectionMode: "internal-bakeoff",
    candidatePackIds: candidates.map((candidate) => candidate.packId),
    fingerprint: winner.fingerprint,
  };
} else {
  delete finalConfig.design.experience;
}
await fs.writeFile(configPath, `${JSON.stringify(finalConfig, null, 2)}\n`);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(
  reportPath,
  `${JSON.stringify({ version: 1, selectedPackId: winner?.valid ? winner.packId : null, fallback: !winner?.valid, candidates: results }, null, 2)}\n`,
);
await run("npm", ["run", "build"], siteDir);
console.log(
  `experience_bakeoff_selected=${winner?.valid ? winner.packId : "legacy-renderer"}`,
);
console.log(`experience_bakeoff_report=${reportPath}`);
