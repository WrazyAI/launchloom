import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import {
  CREATIVE_PROMOTION_THRESHOLDS,
  diversityReport,
  fingerprintDistance,
  scoreCreativeCandidate,
  validateCandidateManifest,
} from "./creative-compiler.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";

function argsFrom(argv) {
  return Object.fromEntries(
    argv.slice(2).reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
  );
}

function run(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PUBLIC_REVIEW_MODE: "true" },
    });
    const tails = { stdout: "", stderr: "" };
    const appendTail = (key, chunk) => {
      const text = chunk.toString();
      process[key].write(text);
      tails[key] = `${tails[key]}${text}`.slice(-6000);
    };
    child.stdout?.on("data", (chunk) => appendTail("stdout", chunk));
    child.stderr?.on("data", (chunk) => appendTail("stderr", chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} exited with ${code}\n${[
                tails.stdout && `stdout:\n${tails.stdout}`,
                tails.stderr && `stderr:\n${tails.stderr}`,
              ]
                .filter(Boolean)
                .join("\n")}`,
            ),
          ),
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
  if (!address || typeof address === "string") throw new Error("Could not start candidate server");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function inspect(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-creative-candidate]");
    const hero = root?.querySelector("[data-hero]");
    const heroBounds = hero?.getBoundingClientRect();
    const text = [document.title, document.body.innerText].join("\n");
    const anchors = [...document.querySelectorAll("nav a")];
    const requiredTargets = ["#services", "#faqs", "#contact"];
    return {
      h1Count: document.querySelectorAll("h1").length,
      hasHero: Boolean(hero),
      hasEarlyConversion: Boolean(root?.querySelector("[data-early-conversion]")),
      hasServices: Boolean(document.querySelector("#services")),
      hasFaqs: Boolean(document.querySelector("#faqs")),
      hasContact: Boolean(document.querySelector("#contact")),
      navTargets: anchors.map((anchor) => anchor.getAttribute("href")).filter(Boolean),
      missingFragments: requiredTargets.filter((target) => !document.querySelector(target)).length,
      missingNavTargets: requiredTargets.filter((target) => !anchors.some((anchor) => anchor.getAttribute("href") === target)).length,
      hasLeadForm: Boolean(document.querySelector('[data-runtime="lead-form"]')),
      missingAlt: [...document.images].filter((image) => !image.getAttribute("alt")?.trim()).length,
      unnamedControls: [...document.querySelectorAll("button, a")].filter((element) => !(element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim()).length,
      heroBottom: Math.round(heroBounds?.bottom || 0),
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
      emDashes: (text.match(/—/gu) || []).length,
    };
  });
}

function hardFailures(evidence, viewport) {
  return [
    evidence.h1Count !== 1 && "expected one H1",
    !evidence.hasHero && "missing hero marker",
    !evidence.hasEarlyConversion && "missing early conversion marker",
    !evidence.hasServices && "missing services section",
    !evidence.hasFaqs && "missing FAQs section",
    !evidence.hasContact && "missing contact section",
    evidence.missingFragments > 0 && "missing required fragment target",
    evidence.missingNavTargets > 0 && "navigation does not expose required targets",
    !evidence.hasLeadForm && "missing shared lead form runtime",
    evidence.missingAlt > 0 && "image is missing alt text",
    evidence.unnamedControls > 0 && "interactive control has no accessible name",
    viewport.name !== "mobile" && evidence.heroBottom > evidence.viewportHeight + 1 && "hero exceeds desktop viewport",
    evidence.overflow && "horizontal overflow",
    evidence.brokenImages > 0 && "broken image",
    evidence.emDashes > 0 && "em dash found",
  ].filter(Boolean);
}

/**
 * @param {{siteDir?: string, candidatesDir?: string, reportPath?: string, screenshotsDir?: string, promote?: boolean, preview?: boolean}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function runCreativeBakeoff({
  siteDir = "templates/client-site",
  candidatesDir = ".launchloom/generated-experiences",
  reportPath,
  screenshotsDir,
  promote = false,
  preview = false,
} = {}) {
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const reportFile = path.resolve(
    root,
    reportPath || ".launchloom/creative-bakeoff.json",
  );
  const evidenceDir = path.resolve(
    root,
    screenshotsDir || ".launchloom/creative-bakeoff-screenshots",
  );
  const entries = (await fs.readdir(candidateRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && /^candidate-[a-z]+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!entries.length) throw new Error(`No creative candidates found in ${candidateRoot}.`);

  const candidates = [];
  for (const directory of entries) {
    const metadata = JSON.parse(await fs.readFile(path.join(candidateRoot, directory, "metadata.json"), "utf8"));
    const manifest = validateCandidateManifest(metadata.creativeManifest || metadata);
    candidates.push({ directory, metadata, manifest });
  }
  const diversity = diversityReport(candidates.map(({ metadata }) => metadata));
  const originalConfigPath = path.join(root, "src/site.config.json");
  const originalConfig = await fs.readFile(originalConfigPath, "utf8");
  const selectedDir = path.join(root, "src/generated-experiences/selected");
  const selectedBackup = `${selectedDir}.bakeoff-${process.pid}`;
  await fs.rm(selectedBackup, { recursive: true, force: true });
  await fs.cp(selectedDir, selectedBackup, { recursive: true, force: true }).catch(() => {});
  const browser = await chromium.launch({ headless: true });
  const results = [];
  await fs.mkdir(evidenceDir, { recursive: true });

  try {
    for (const candidate of candidates) {
      const candidateResult = {
        candidateId: candidate.manifest.candidateId,
        directory: candidate.directory,
        familyId: candidate.manifest.familyId,
        fingerprint: candidate.manifest.fingerprint,
        valid: true,
        score: 0,
        failures: [],
        viewports: [],
      };
      try {
        await promoteCreativeCandidate({ siteDir: root, candidateDir: path.relative(root, path.join(candidateRoot, candidate.directory)) });
        await run("npm", ["run", "build"], root);
        const { server, origin } = await startServer(path.join(root, "dist"));
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
            const failures = [...hardFailures(evidence, viewport), browserErrors.length > 0 && "browser error"].filter(Boolean);
            candidateResult.failures.push(...failures.map((failure) => `${viewport.name}: ${failure}`));
            candidateResult.viewports.push({ ...viewport, ...evidence, browserErrors });
            await page.screenshot({ path: path.join(evidenceDir, `${candidate.manifest.candidateId}-${viewport.name}.png`), fullPage: true });
            await page.close();
          }
        } finally {
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
      } catch (error) {
        candidateResult.failures.push(error instanceof Error ? error.message : String(error));
      }
      candidateResult.failures = [...new Set(candidateResult.failures)];
      candidateResult.valid = candidateResult.failures.length === 0;
      const desktopEvidence = candidateResult.viewports.filter((viewport) => viewport.name !== "mobile");
      const mobileEvidence = candidateResult.viewports.find((viewport) => viewport.name === "mobile");
      const allEvidence = candidateResult.viewports;
      const visual = {
        hierarchy: allEvidence.every((viewport) => viewport.h1Count === 1 && viewport.hasHero) ? 100 : 0,
        composition: desktopEvidence.every((viewport) => viewport.heroBottom <= viewport.viewportHeight + 1 && !viewport.overflow) ? 100 : 0,
        responsive: Boolean(mobileEvidence && !mobileEvidence.overflow && mobileEvidence.hasHero) ? 100 : 0,
        industryFit: 80,
        conversion: allEvidence.every((viewport) => viewport.hasEarlyConversion && viewport.hasLeadForm) ? 100 : 0,
      };
      const technical = {
        accessibility: allEvidence.every((viewport) => viewport.missingAlt === 0 && viewport.unnamedControls === 0 && viewport.browserErrors.length === 0) ? 100 : 0,
      };
      const peerDistances = candidates
        .filter((peer) => peer.manifest.candidateId !== candidate.manifest.candidateId)
        .map((peer) => fingerprintDistance(candidate.manifest, peer.manifest));
      const minimumDistance = peerDistances.length ? Math.min(...peerDistances) : 0;
      const distinctivenessScore = Math.min(
        100,
        Math.round((minimumDistance / CREATIVE_PROMOTION_THRESHOLDS.minimumFingerprintDistance) * 70),
      );
      candidateResult.visualScore = Math.round(
        Object.values(visual).reduce((sum, value) => sum + value, 0) / Object.keys(visual).length,
      );
      candidateResult.technicalScore = technical.accessibility;
      candidateResult.distinctivenessScore = distinctivenessScore;
      candidateResult.minimumFingerprintDistance = minimumDistance;
      candidateResult.score = scoreCreativeCandidate({
        hardPass: candidateResult.valid,
        visual,
        technical,
        distinctiveness: distinctivenessScore,
      });
      candidateResult.eligible = candidateResult.valid && candidateResult.visualScore >= CREATIVE_PROMOTION_THRESHOLDS.visualScore && candidateResult.distinctivenessScore >= CREATIVE_PROMOTION_THRESHOLDS.distinctivenessScore;
      results.push(candidateResult);
    }
  } finally {
    await browser.close();
    await fs.writeFile(originalConfigPath, originalConfig);
    await fs.rm(selectedDir, { recursive: true, force: true });
    await fs.cp(selectedBackup, selectedDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(selectedBackup, { recursive: true, force: true });
  }

  // Review previews must show authored work. Diversity remains a production
  // promotion requirement, not a reason to silently select the legacy page.
  const previewEligible = results.filter(
    (candidate) =>
      candidate.valid &&
      candidate.visualScore >= CREATIVE_PROMOTION_THRESHOLDS.visualScore &&
      candidate.technicalScore >= 100,
  );
  const valid = preview ? previewEligible : results.filter((candidate) => candidate.eligible);
  const winner = valid
    .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId))[0] || null;
  const report = {
    version: 1,
    mode: promote ? "promote" : preview ? "preview" : "review",
    thresholds: CREATIVE_PROMOTION_THRESHOLDS,
    scoreSource: "rendered-structure-and-contract; multimodal visual gate remains required",
    diversity,
    candidates: results,
    selectedCandidateId:
      (preview && winner) || (promote && winner && diversity.pass)
        ? winner.candidateId
        : null,
    // In preview mode fallback means that no authored candidate was renderable.
    // A diversity miss is recorded separately and cannot send the page back to
    // the legacy renderer.
    fallback: !winner || (!preview && !diversity.pass),
    promotionReady: Boolean(winner && diversity.pass && winner.eligible),
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  if ((promote || preview) && winner && (preview || diversity.pass)) {
    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: path.relative(root, path.join(candidateRoot, winner.directory)),
      visualScore: winner.visualScore,
      distinctivenessScore: winner.distinctivenessScore,
      selectionMode: promote ? "creative-bakeoff" : "creative-preview",
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv);
  const report = await runCreativeBakeoff({
    siteDir: args["site-dir"] || "templates/client-site",
    candidatesDir: args.candidates || ".launchloom/generated-experiences",
    reportPath: args.report,
    screenshotsDir: args.screenshots,
    promote: args.promote === "true",
    preview: args.preview === "true",
  });
  console.log(JSON.stringify({
    selectedCandidateId: report.selectedCandidateId,
    fallback: report.fallback,
    diversityPass: report.diversity.pass,
    report: args.report || ".launchloom/creative-bakeoff.json",
  }));
}
