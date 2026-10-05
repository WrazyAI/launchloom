import { compilePageBriefs, pageBriefExpectedContent } from "../templates/client-site/src/lib/page-briefs.mjs";
import { routeLinkedContent } from "../templates/client-site/src/lib/route-inventory.mjs";
import { contrastFailureMessages } from "./rendered-contrast.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { enforceBuiltContrast } from "./contrast-sweep.mjs";
import { chromium } from "playwright";
import {
  CREATIVE_PROMOTION_THRESHOLDS,
  diversityReport,
  fingerprintDistance,
  scoreCreativeCandidate,
  validateCandidateManifest,
} from "./creative-compiler.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";
import {
  CSS_IMAGE_URL_PATTERN,
  validateRenderedCompositionTopology,
} from "./rendered-composition-topology.mjs";
import {
  evaluateRenderedDiversity,
  evaluateRenderedReferenceFidelity,
} from "./rendered-reference-fidelity.mjs";
import {
  countRecentCreativeFamilyUses,
  launchesForSiteConfig,
  readLaunchHistory,
} from "./launch-history.mjs";

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
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
      // Judge builds must show the authored candidate, not platform chrome
      // such as the floating website-assistant launcher and the exit offer.
      env: {
        ...process.env,
        PUBLIC_REVIEW_MODE: "true",
        PUBLIC_CREATIVE_JUDGE: "true",
      },
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
  if (!address || typeof address === "string")
    throw new Error("Could not start candidate server");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function inspect(page) {
  return page.evaluate((imageBackgroundPattern) => {
    const hasImageBackground = new RegExp(imageBackgroundPattern, "iu");
    const root = document.querySelector("[data-creative-candidate]");
    const hero = root?.querySelector("[data-hero]");
    const heroBounds = hero?.getBoundingClientRect();
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      let left = Math.max(0, bounds.left);
      let top = Math.max(0, bounds.top);
      let right = Math.min(window.innerWidth, bounds.right);
      let bottom = Math.min(window.innerHeight, bounds.bottom);
      let opacity = 1;
      for (
        let ancestor = element;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        const style = window.getComputedStyle(ancestor);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse"
        )
          return null;
        opacity *= Number.isFinite(Number.parseFloat(style.opacity))
          ? Number.parseFloat(style.opacity)
          : 1;
        if (opacity <= 0.02) return null;
        if (ancestor === element) continue;
        const clip = ancestor.getBoundingClientRect();
        if (["hidden", "clip", "scroll", "auto"].includes(style.overflowX)) {
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
        if (["hidden", "clip", "scroll", "auto"].includes(style.overflowY)) {
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      if (right - left < 16 || bottom - top < 16) return null;
      return { left, top, width: right - left, height: bottom - top };
    };
    const visible = (element) => Boolean(rect(element));
    const copyRegions = hero
      ? [...hero.querySelectorAll("[data-hero-copy]")].filter(visible).map(rect)
      : [];
    const mediaRegions = hero
      ? [...hero.querySelectorAll("[data-hero-media]")]
          .filter(visible)
          .map((element) => {
            const visualNodes = [
              element,
              ...element.querySelectorAll("*"),
            ].filter((node) => {
              if (!visible(node)) return false;
              if (node instanceof HTMLImageElement)
                return node.complete && node.naturalWidth > 0;
              if (node instanceof HTMLVideoElement) return node.readyState >= 2;
              return hasImageBackground.test(
                window.getComputedStyle(node).backgroundImage,
              );
            });
            return {
              container: rect(element),
              visuals: visualNodes.map(rect),
            };
          })
      : [];
    const text = [document.title, document.body.innerText].join("\n");
    const anchors = [...document.querySelectorAll("nav a")];
    const requiredTargets = ["#services", "#faqs", "#contact"];
    const identityHeading =
      root?.querySelector("h1") || document.querySelector("h1");
    const identityHeadingStyle = identityHeading
      ? window.getComputedStyle(identityHeading)
      : null;
    const identity = {
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      htmlBackground: window.getComputedStyle(document.documentElement)
        .backgroundColor,
      headingFontFamily: identityHeadingStyle?.fontFamily || "",
      headingFontWeight: identityHeadingStyle?.fontWeight || "",
      headingLetterSpacing: identityHeadingStyle?.letterSpacing || "",
    };
    return {
      identity,
      h1Count: document.querySelectorAll("h1").length,
      hasHero: Boolean(hero),
      hasEarlyConversion: Boolean(
        root?.querySelector("[data-early-conversion]"),
      ),
      hasServices: Boolean(document.querySelector("#services")),
      hasFaqs: Boolean(document.querySelector("#faqs")),
      hasContact: Boolean(document.querySelector("#contact")),
      navTargets: anchors
        .map((anchor) => anchor.getAttribute("href"))
        .filter(Boolean),
      missingFragments: requiredTargets.filter(
        (target) => !document.querySelector(target),
      ).length,
      missingNavTargets: requiredTargets.filter(
        (target) =>
          !anchors.some((anchor) => anchor.getAttribute("href") === target),
      ).length,
      hasLeadForm: Boolean(
        document.querySelector('[data-runtime="lead-form"]'),
      ),
      // Empty alt text is the sanctioned decorative treatment in the authoring
      // and repair contracts; only a missing alt attribute fails this gate.
      missingAlt: [...document.images].filter(
        (image) => !image.hasAttribute("alt"),
      ).length,
      unnamedControls: [...document.querySelectorAll("button, a")].filter(
        (element) =>
          !(
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
          ).trim(),
      ).length,
      heroBottom: Math.round(heroBounds?.bottom || 0),
      viewportHeight: window.innerHeight,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      emDashes: (text.match(/—/gu) || []).length,
      referenceSignatures: [
        ...new Set(
          [...document.querySelectorAll("[data-reference-signature]")]
            .map((element) => element.getAttribute("data-reference-signature"))
            .filter(Boolean),
        ),
      ],
      referenceSections: [
        ...document.querySelectorAll("[data-reference-section]"),
      ]
        .map((element) => element.getAttribute("data-reference-section"))
        .filter(Boolean),
      heroGeometry:
        root
          ?.querySelector("[data-hero]")
          ?.getAttribute("data-hero-geometry") || "",
      navigationGeometry:
        root
          ?.querySelector("[data-navigation-geometry]")
          ?.getAttribute("data-navigation-geometry") || "",
      servicePresentation:
        root
          ?.querySelector("[data-service-presentation]")
          ?.getAttribute("data-service-presentation") || "",
      ctaPlacement:
        root
          ?.querySelector("[data-cta-placement]")
          ?.getAttribute("data-cta-placement") || "",
      mobileRecomposition:
        root
          ?.querySelector("[data-mobile-recomposition]")
          ?.getAttribute("data-mobile-recomposition") || "",
      motionPrimitive:
        root
          ?.querySelector("[data-motion-primitive]")
          ?.getAttribute("data-motion-primitive") || "",
      creativeRenderer:
        document
          .querySelector("[data-creative-renderer]")
          ?.getAttribute("data-creative-renderer") || "",
      compositionEvidence: {
        hero: heroBounds ? rect(hero) : null,
        copy: copyRegions,
        media: mediaRegions,
        utilityCount:
          hero?.querySelectorAll(
            'form, input, select, textarea, [role="search"], [role="combobox"]',
          ).length || 0,
      },
    };
  }, CSS_IMAGE_URL_PATTERN.source);
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
    evidence.missingNavTargets > 0 &&
      "navigation does not expose required targets",
    !evidence.hasLeadForm && "missing shared lead form runtime",
    evidence.missingAlt > 0 && "image is missing alt text",
    evidence.unnamedControls > 0 &&
      "interactive control has no accessible name",
    viewport.name !== "mobile" &&
      evidence.heroBottom > evidence.viewportHeight + 1 &&
      "hero exceeds desktop viewport",
    evidence.overflow && "horizontal overflow",
    evidence.brokenImages > 0 && "broken image",
    evidence.emDashes > 0 && "em dash found",
    evidence.creativeRenderer !== "creative-candidate" &&
      "creative renderer marker missing",
  ].filter(Boolean);
}

const AUTHORED_PAGE_MARKERS = {
  service: [
    "data-service-hero",
    "data-service-support",
    "data-service-related",
  ],
  location: [
    "data-location-hero",
    "data-location-coverage",
    "data-location-related",
  ],
  "services-index": ["data-services-index-hero", "data-services-index-list"],
};

const AUTHORED_PAGE_LABELS = {
  service: "service page",
  location: "location page",
  "services-index": "services index",
};

const AUTHORED_PAGE_EVIDENCE_KEYS = {
  service: "servicePage",
  location: "locationPage",
  "services-index": "servicesIndexPage",
};

export async function inspectAuthoredPage(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-authored-page-host]");
    const kind = host?.getAttribute("data-authored-page-kind") || "";
    const rootMarker =
      kind === "service"
        ? "data-service-page"
        : kind === "location"
          ? "data-location-page"
          : kind === "services-index"
            ? "data-services-index"
            : "";
    const authored = rootMarker
      ? host?.querySelector(`[${rootMarker}]`) || null
      : null;
    const pageRoot = authored || host;
    const text = [document.title, document.body.innerText].join("\n");
    const heading = document.querySelector("h1");
    const headingStyle = heading ? window.getComputedStyle(heading) : null;
    const markerNames = new Set();
    for (const element of pageRoot?.querySelectorAll("*") || [])
      for (const attribute of element.attributes || [])
        if (attribute.name.startsWith("data-")) markerNames.add(attribute.name);
    for (const attribute of pageRoot?.attributes || [])
      if (attribute.name.startsWith("data-")) markerNames.add(attribute.name);
    return {
      kind,
      identity: {
        bodyBackground: window.getComputedStyle(document.body).backgroundColor,
        htmlBackground: window.getComputedStyle(document.documentElement)
          .backgroundColor,
        headingFontFamily: headingStyle?.fontFamily || "",
        headingFontWeight: headingStyle?.fontWeight || "",
        headingLetterSpacing: headingStyle?.letterSpacing || "",
      },
      hasHost: Boolean(host),
      creativeRenderer: host?.getAttribute("data-creative-renderer") || "",
      hasAuthoredMarker: Boolean(authored),
      markers: [...markerNames],
      h1Count: pageRoot ? pageRoot.querySelectorAll("h1").length : 0,
      hasContactSection: Boolean(pageRoot?.querySelector("#contact")),
      hasLeadForm: Boolean(
        pageRoot?.querySelector('[data-runtime="lead-form"]'),
      ),
      missingAlt: [...document.images].filter(
        (image) => !image.hasAttribute("alt"),
      ).length,
      unnamedControls: [
        ...(pageRoot?.querySelectorAll("button, a") || []),
      ].filter(
        (element) =>
          !(
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
          ).trim(),
      ).length,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      brokenImages: [...document.images].filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      emDashes: (text.match(/—/gu) || []).length,
    };
  });
}

function normalizeColor(value) {
  return String(value || "")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

/**
 * Compare a rendered authored inner page against the same candidate's
 * homepage. The page may recompose freely, but the canvas, heading typeface,
 * and heading weight are identity anchors that must not drift to the generic
 * inner-page template.
 */
export function authoredPageIdentityFindings(
  home,
  page,
  label = "authored page",
) {
  const findings = [];
  if (!home || !page) return findings;
  const homeCanvas =
    normalizeColor(home.bodyBackground) || normalizeColor(home.htmlBackground);
  const pageCanvas =
    normalizeColor(page.bodyBackground) || normalizeColor(page.htmlBackground);
  if (homeCanvas && pageCanvas && homeCanvas !== pageCanvas)
    findings.push(
      `${label} canvas background drifts from the homepage (${homeCanvas} to ${pageCanvas})`,
    );
  if (
    home.headingFontFamily &&
    page.headingFontFamily &&
    home.headingFontFamily !== page.headingFontFamily
  )
    findings.push(
      `${label} heading typeface drifts from the homepage typeface`,
    );
  if (
    home.headingFontWeight &&
    page.headingFontWeight &&
    home.headingFontWeight !== page.headingFontWeight
  )
    findings.push(`${label} heading weight drifts from the homepage weight`);
  return findings;
}

/**
 * Deterministic rendered failures for one authored inner-page viewport.
 */
export function authoredPageFailures(evidence, kind) {
  const label = AUTHORED_PAGE_LABELS[kind] || "authored page";
  const expectedMarkers = AUTHORED_PAGE_MARKERS[kind] || [];
  const missingMarkers = expectedMarkers.filter(
    (marker) => !(evidence.markers || []).includes(marker),
  );
  return [
    !evidence.hasHost && `missing ${label} host`,
    evidence.creativeRenderer !== "creative-candidate" &&
      "creative renderer marker missing",
    !evidence.hasAuthoredMarker && `missing authored ${label} marker`,
    evidence.h1Count !== 1 && "expected one page H1",
    ...missingMarkers.map((marker) => `missing ${marker} region`),
    !evidence.hasContactSection && "missing contact section",
    !evidence.hasLeadForm && "missing shared lead form runtime",
    evidence.missingAlt > 0 && "image is missing alt text",
    evidence.unnamedControls > 0 &&
      "interactive control has no accessible name",
    evidence.overflow && "horizontal overflow",
    evidence.brokenImages > 0 && "broken image",
    evidence.emDashes > 0 && "em dash found",
  ].filter(Boolean);
}

function renderedPairMetrics(visualDiversity, candidateIds) {
  const ids = [...new Set(candidateIds.filter(Boolean))];
  const idSet = new Set(ids);
  const expectedPeers = Math.max(0, ids.length - 1);
  const metrics = Object.fromEntries(
    ids.map((candidateId) => [
      candidateId,
      {
        peerCount: 0,
        minimumDistance: ids.length > 1 ? 0 : 100,
        averageDistance: ids.length > 1 ? 0 : 100,
        allPairsPass: ids.length <= 1,
        failedPeers: [],
      },
    ]),
  );
  const pairs = (visualDiversity?.pairs || []).filter(
    (pair) => idSet.has(pair.left) && idSet.has(pair.right),
  );
  for (const candidateId of ids) {
    const relevant = pairs.filter(
      (pair) => pair.left === candidateId || pair.right === candidateId,
    );
    const distances = relevant.map((pair) => Number(pair.distance || 0));
    metrics[candidateId] = {
      peerCount: relevant.length,
      minimumDistance: distances.length
        ? Math.min(...distances)
        : ids.length > 1
          ? 0
          : 100,
      averageDistance: distances.length
        ? Math.round(
            distances.reduce((sum, distance) => sum + distance, 0) /
              distances.length,
          )
        : ids.length > 1
          ? 0
          : 100,
      allPairsPass:
        ids.length <= 1 ||
        (relevant.length === expectedPeers &&
          relevant.every((pair) => pair.pass !== false)),
      failedPeers: relevant
        .filter((pair) => pair.pass === false)
        .map((pair) => (pair.left === candidateId ? pair.right : pair.left))
        .sort(),
    };
  }
  return metrics;
}

/**
 * @param {{siteDir?: string, candidatesDir?: string, reportPath?: string, screenshotsDir?: string, promote?: boolean, preview?: boolean, deferPromotion?: boolean, excludedCandidateIds?: string[], renderedReferenceEvaluator?: (input: any) => Promise<any>, renderedDiversityEvaluator?: (input: any) => Promise<any>, requireDiversity?: boolean}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function runCreativeBakeoff({
  siteDir = "templates/client-site",
  candidatesDir = ".launchloom/generated-experiences",
  reportPath,
  screenshotsDir,
  promote = false,
  preview = false,
  deferPromotion = false,
  excludedCandidateIds = [],
  renderedReferenceEvaluator = evaluateRenderedReferenceFidelity,
  renderedDiversityEvaluator = evaluateRenderedDiversity,
  requireDiversity = true,
  allowContrastRepair = true,
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
  const entries = (
    await fs.readdir(candidateRoot, { withFileTypes: true }).catch(() => [])
  )
    .filter(
      (entry) =>
        entry.isDirectory() && /^candidate-[a-z0-9]+$/u.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  if (!entries.length)
    throw new Error(`No creative candidates found in ${candidateRoot}.`);

  const excludedIds = new Set(
    Array.isArray(excludedCandidateIds)
      ? excludedCandidateIds.filter(
          (candidateId) => typeof candidateId === "string" && candidateId,
        )
      : [],
  );
  if (excludedIds.size && (!preview || promote))
    throw new Error(
      "Candidate exclusions are only supported for non-promoting preview reruns.",
    );
  const candidates = [];
  for (const directory of entries) {
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(candidateRoot, directory, "metadata.json"),
        "utf8",
      ),
    );
    const contentManifest = await fs
      .readFile(
        path.join(candidateRoot, directory, "content-manifest.json"),
        "utf8",
      )
      .then(JSON.parse)
      .catch(() => null);
    const manifest = validateCandidateManifest(
      metadata.creativeManifest || metadata,
    );
    const contentManifestError =
      manifest.version >= 2 &&
      (!contentManifest ||
        contentManifest.version !== 2 ||
        !contentManifest.visualBrief ||
        typeof contentManifest.visualBrief !== "object" ||
        Array.isArray(contentManifest.visualBrief))
        ? "Version-2 creative candidates require a valid content-manifest.json with visualBrief."
        : null;
    if (excludedIds.has(manifest.candidateId)) continue;
    candidates.push({
      directory,
      metadata,
      manifest,
      contentManifest,
      contentManifestError,
    });
  }
  if (!candidates.length) {
    const exclusions = [...excludedIds].sort();
    throw new Error(
      exclusions.length
        ? `No creative candidates remain after exclusions: ${exclusions.join(", ")}.`
        : `No creative candidates found in ${candidateRoot}.`,
    );
  }
  const diversity = diversityReport(candidates.map(({ metadata }) => metadata));
  const originalConfigPath = path.join(root, "src/site.config.json");
  const originalConfig = await fs.readFile(originalConfigPath, "utf8");
  let recentHistory = { launches: [] };
  try {
    const history = await readLaunchHistory();
    recentHistory = {
      ...history,
      launches: launchesForSiteConfig(history, originalConfig),
    };
  } catch {
    // Rotation history is advisory; missing history must not block a bakeoff.
  }
  const selectedDir = path.join(root, "src/generated-experiences/selected");
  const selectedBackup = `${selectedDir}.bakeoff-${process.pid}`;
  await fs.rm(selectedBackup, { recursive: true, force: true });
  await fs
    .cp(selectedDir, selectedBackup, { recursive: true, force: true })
    .catch(() => {});
  const browser = await chromium.launch({ headless: true });
  const bakeoffConfig = routeLinkedContent(JSON.parse(originalConfig));
  const pageBriefReport = compilePageBriefs(bakeoffConfig);
  const serviceSlug = String(
    (Array.isArray(bakeoffConfig.services) ? bakeoffConfig.services : []).find(
      (service) => service?.slug,
    )?.slug || "",
  );
  const locationSlug =
    bakeoffConfig.industry === "home-services"
      ? String(
          (Array.isArray(bakeoffConfig.locations)
            ? bakeoffConfig.locations
            : []
          ).find((location) => location?.slug)?.slug || "",
        )
      : "";
  const results = [];
  await fs.mkdir(evidenceDir, { recursive: true });

  try {
    for (const candidate of candidates) {
      const candidateResult = {
        candidateId: candidate.manifest.candidateId,
        directory: candidate.directory,
        familyId: candidate.manifest.familyId,
        heroArchetype: String(candidate.metadata.heroArchetype || "").trim(),
        referenceIds: Array.isArray(candidate.metadata.referenceIds)
          ? [...candidate.metadata.referenceIds]
          : [],
        referenceDossierId: String(
          candidate.metadata.referenceDossierId || "",
        ).trim(),
        fingerprint: candidate.manifest.fingerprint,
        manifest: candidate.manifest,
        intakeFitScore: Number(candidate.metadata.intakeFitScore || 0),
        explicitReferenceMatch:
          candidate.metadata.explicitReferenceMatch === true,
        valid: true,
        score: 0,
        failures: [],
        viewports: [],
      };
      try {
        if (candidate.contentManifestError)
          throw new Error(candidate.contentManifestError);
        const experienceSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "Experience.jsx"),
          "utf8",
        );
        let stylesSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "styles.css"),
          "utf8",
        );
        const motionSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "motion.js"),
          "utf8",
        );
        const sourceFidelity =
          candidate.manifest.version >= 2
            ? validateReferenceCandidate({
                referenceDna: candidate.manifest.referenceDna,
                experienceSource,
                stylesSource,
                motionSource,
              })
            : {
                version: 1,
                pass: true,
                visualPass: true,
                score: 100,
                findings: [],
                hardFindings: [],
                visualFindings: [],
                requiredSignatures: [],
              };
        candidateResult.referenceFidelity = sourceFidelity;
        if (!sourceFidelity.pass)
          candidateResult.failures.push(
            ...sourceFidelity.hardFindings.map(
              (item) => `source: ${item.message}`,
            ),
          );
        await promoteCreativeCandidate({
          siteDir: root,
          candidateDir: path.relative(
            root,
            path.join(candidateRoot, candidate.directory),
          ),
          contentManifest: candidate.contentManifest,
          // Rendering a candidate for the bakeoff must remain available even
          // when source-level visual findings are present. Production
          // publication is enforced by the final promotion call below.
          preview: true,
        });
        await run("npm", ["run", "build"], root);
        candidateResult.contrast = await enforceBuiltContrast({
          dist: path.join(root, "dist"),
          browser,
          stylesPath: path.join(
            candidateRoot,
            candidate.directory,
            "styles.css",
          ),
          deployedStylesPath: path.join(
            root,
            "src/generated-experiences/selected/styles.css",
          ),
          reportPath: path.join(
            evidenceDir,
            `${candidate.manifest.candidateId}-contrast.json`,
          ),
          repair: allowContrastRepair,
          plates: allowContrastRepair,
          build: () => run("npm", ["run", "build"], root),
        });
        if (!candidateResult.contrast.pass)
          candidateResult.failures.push(
            ...contrastFailureMessages(candidateResult.contrast.after),
          );
        if (candidateResult.contrast.repairs.length) {
          stylesSource = await fs.readFile(
            path.join(candidateRoot, candidate.directory, "styles.css"),
            "utf8",
          );
          candidateResult.referenceFidelity =
            candidate.manifest.version >= 2
              ? validateReferenceCandidate({
                  referenceDna: candidate.manifest.referenceDna,
                  experienceSource,
                  stylesSource,
                  motionSource,
                })
              : sourceFidelity;
          if (!candidateResult.referenceFidelity.pass)
            candidateResult.failures.push(
              ...candidateResult.referenceFidelity.hardFindings.map(
                (item) => `repaired source: ${item.message}`,
              ),
            );
        }
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
            // Let the authored first-view reveal settle before measuring
            // opacity-sensitive visual evidence or taking the viewport shot.
            await page.waitForTimeout(900);
            const evidence = await inspect(page);
            const failures = [
              ...hardFailures(evidence, viewport),
              browserErrors.length > 0 && "browser error",
            ].filter(Boolean);
            const compositionTopology =
              candidate.manifest.version >= 2
                ? candidate.manifest.referenceDna?.compositionTopology
                : null;
            const compositionGeometry = compositionTopology
              ? validateRenderedCompositionTopology(
                  compositionTopology,
                  evidence.compositionEvidence,
                  {
                    viewportKind:
                      viewport.name === "mobile" ? "mobile" : "desktop",
                  },
                )
              : candidate.manifest.version >= 2
                ? {
                    pass: true,
                    skipped: true,
                    reason:
                      "Reference DNA predates the normalized composition topology contract.",
                  }
                : null;
            if (compositionGeometry && !compositionGeometry.pass)
              failures.push(
                ...compositionGeometry.findings.map(
                  (finding) => `rendered composition: ${finding.message}`,
                ),
              );
            candidateResult.failures.push(
              ...failures.map((failure) => `${viewport.name}: ${failure}`),
            );
            candidateResult.viewports.push({
              ...viewport,
              ...evidence,
              compositionGeometry,
              browserErrors,
            });
            candidateResult.compositionGeometryByViewport = {
              ...(candidateResult.compositionGeometryByViewport || {}),
              [viewport.name]: compositionGeometry,
            };
            if (candidate.manifest.version >= 2) {
              const renderedFidelity = validateReferenceCandidate({
                referenceDna: candidate.manifest.referenceDna,
                experienceSource,
                stylesSource,
                motionSource,
                renderedDom: await page
                  .locator("[data-creative-host]")
                  .evaluate((element) => element.outerHTML),
              });
              const viewportVisualFindings =
                renderedFidelity.visualFindings.map((item) => ({
                  ...item,
                  viewport: viewport.name,
                }));
              candidateResult.referenceFidelity = {
                ...candidateResult.referenceFidelity,
                rendered: renderedFidelity,
                renderedByViewport: {
                  ...(candidateResult.referenceFidelity.renderedByViewport ||
                    {}),
                  [viewport.name]: renderedFidelity,
                },
                renderedVisualFindings: [
                  ...(candidateResult.referenceFidelity
                    .renderedVisualFindings || []),
                  ...viewportVisualFindings,
                ],
                pass:
                  candidateResult.referenceFidelity.pass &&
                  renderedFidelity.pass,
              };
              if (!renderedFidelity.pass)
                candidateResult.failures.push(
                  ...renderedFidelity.hardFindings.map(
                    (item) => `${viewport.name}: ${item.message}`,
                  ),
                );
            }
            // The reference judge needs the actual first viewport for hero
            // geometry. Keep a separate full-page capture for section rhythm,
            // lower content, and the final visual-quality gate.
            if (candidate.manifest.version >= 2)
              await page.screenshot({
                path: path.join(
                  evidenceDir,
                  `${candidate.manifest.candidateId}-${viewport.name}-viewport.png`,
                ),
              });
            await page.screenshot({
              path: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-${viewport.name}.png`,
              ),
              fullPage: true,
            });
            await page.close();
          }
          const authoredPages = [
            {
              kind: "service",
              file: "ServicePage.jsx",
              route: serviceSlug ? `/services/${serviceSlug}/` : "",
            },
            {
              kind: "location",
              file: "LocationPage.jsx",
              route: locationSlug ? `/locations/${locationSlug}/` : "",
            },
            {
              kind: "services-index",
              file: "ServicesIndexPage.jsx",
              route: "/services/",
            },
          ].filter((authoredPage) => authoredPage.route);
          const homepageIdentity =
            candidateResult.viewports.find(
              (viewport) => viewport.name === "desktop",
            )?.identity || null;
          for (const authoredPage of authoredPages) {
            const authoredPagePath = path.join(
              candidateRoot,
              candidate.directory,
              authoredPage.file,
            );
            const hasAuthoredPage = await fs
              .access(authoredPagePath)
              .then(() => true)
              .catch(() => false);
            if (!hasAuthoredPage) continue;
            const pageResult = {
              kind: authoredPage.kind,
              route: authoredPage.route,
              viewports: [],
              failures: [],
            };
            for (const viewport of [
              { name: "desktop", width: 1536, height: 864 },
              { name: "mobile", width: 390, height: 844 },
            ]) {
              const page = await browser.newPage({ viewport });
              const browserErrors = [];
              page.on("pageerror", (error) =>
                browserErrors.push(error.message),
              );
              try {
                await page.goto(`${origin}${authoredPage.route}`, {
                  waitUntil: "networkidle",
                });
                await page.waitForTimeout(900);
                const brief = pageBriefReport.briefs.find(brief=>brief.path===authoredPage.route);
                if(brief?.mode === "supported") {
                  const disclosureStates = await page.locator("details").evaluateAll(nodes=>nodes.map(node=>{const open=node.open;node.open=true;return open;}));
                  const visibleText = await page.locator("body").innerText();
                  await page.locator("details").evaluateAll((nodes,states)=>nodes.forEach((node,index)=>node.open=states[index]),disclosureStates);
                  if(pageBriefExpectedContent(brief).some(value=>!visibleText.includes(value)))pageResult.failures.push(`${viewport.name}: supported page brief content is missing after hydration.`);
                }

                const evidence = await inspectAuthoredPage(page);
                const identityFindings = authoredPageIdentityFindings(
                  homepageIdentity,
                  evidence.identity,
                  AUTHORED_PAGE_LABELS[authoredPage.kind] || "authored page",
                );
                const failures = [
                  ...authoredPageFailures(evidence, authoredPage.kind),
                  ...identityFindings,
                  browserErrors.length > 0 && "browser error",
                ].filter(Boolean);
                pageResult.viewports.push({
                  ...viewport,
                  ...evidence,
                  identityFindings,
                  browserErrors,
                });
                pageResult.failures.push(
                  ...failures.map((failure) => `${viewport.name}: ${failure}`),
                );
                await page.screenshot({
                  path: path.join(
                    evidenceDir,
                    `${candidate.manifest.candidateId}-${authoredPage.kind}-${viewport.name}-viewport.png`,
                  ),
                });
                await page.screenshot({
                  path: path.join(
                    evidenceDir,
                    `${candidate.manifest.candidateId}-${authoredPage.kind}-${viewport.name}.png`,
                  ),
                  fullPage: true,
                });
              } catch (error) {
                pageResult.failures.push(
                  `${viewport.name}: ${error instanceof Error ? error.message : String(error)}`,
                );
              } finally {
                await page.close();
              }
            }
            pageResult.failures = [...new Set(pageResult.failures)];
            pageResult.pass = pageResult.failures.length === 0;
            candidateResult[AUTHORED_PAGE_EVIDENCE_KEYS[authoredPage.kind]] =
              pageResult;
            candidateResult.failures.push(
              ...pageResult.failures.map(
                (failure) => `${authoredPage.kind}-page ${failure}`,
              ),
            );
          }
        } finally {
          await new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        }
        if (candidate.manifest.version >= 2) {
          const renderedReference = await renderedReferenceEvaluator({
            referenceDna: candidate.manifest.referenceDna,
            visualBrief: candidate.contentManifest?.visualBrief || {},
            candidateScreenshots: {
              desktop: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-desktop-viewport.png`,
              ),
              compact: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-compact-viewport.png`,
              ),
              mobile: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-mobile-viewport.png`,
              ),
              fullDesktop: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-desktop.png`,
              ),
            },
            renderedGeometry: Object.fromEntries(
              candidateResult.viewports.map((viewport) => [
                viewport.name,
                {
                  viewportWidth: viewport.width,
                  viewportHeight: viewport.viewportHeight,
                  heroBottom: viewport.heroBottom,
                },
              ]),
            ),
          });
          candidateResult.renderedReferenceFidelity = renderedReference;
          candidateResult.referenceFidelity = {
            ...candidateResult.referenceFidelity,
            sourceContractScore:
              candidateResult.referenceFidelity?.score ?? 100,
            sourceVisualFindings:
              candidateResult.referenceFidelity?.visualFindings || [],
            pixelScore: renderedReference.score,
            pixelPass: renderedReference.pass,
            score: renderedReference.score,
            pass:
              candidateResult.referenceFidelity?.pass !== false &&
              renderedReference.pass,
          };
          if (!renderedReference.pass) {
            const visualFindings = renderedReference.audit?.findings || [];
            candidateResult.failures.push(
              ...(visualFindings.length
                ? visualFindings.map(
                    (item) =>
                      `rendered-reference: ${item.evidence || item.category}`,
                  )
                : ["rendered-reference: reference fidelity did not pass"]),
            );
          }
        }
      } catch (error) {
        candidateResult.failures.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      candidateResult.failures = [...new Set(candidateResult.failures)];
      candidateResult.valid = candidateResult.failures.length === 0;
      const desktopEvidence = candidateResult.viewports.filter(
        (viewport) => viewport.name !== "mobile",
      );
      const mobileEvidence = candidateResult.viewports.find(
        (viewport) => viewport.name === "mobile",
      );
      const allEvidence = candidateResult.viewports;
      candidateResult.visualFingerprint = allEvidence[0]
        ? [
            allEvidence[0].referenceSignatures?.join(","),
            allEvidence[0].referenceSections?.join(","),
            allEvidence[0].heroGeometry,
            allEvidence[0].servicePresentation,
            allEvidence[0].motionPrimitive,
          ].join("|")
        : "";
      const pixelScores =
        candidateResult.renderedReferenceFidelity?.audit?.scores || {};
      const visual = {
        hierarchy:
          candidateResult.manifest.version >= 2
            ? Math.round(
                (Number(pixelScores.typography || 0) +
                  Number(pixelScores.spatialRhythm || 0)) /
                  2,
              )
            : allEvidence.every(
                  (viewport) => viewport.h1Count === 1 && viewport.hasHero,
                )
              ? 100
              : 0,
        composition:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.heroGeometry || 0)
            : desktopEvidence.every(
                  (viewport) =>
                    viewport.heroBottom <= viewport.viewportHeight + 1 &&
                    !viewport.overflow,
                )
              ? 100
              : 0,
        responsive:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.mobileRecomposition || 0)
            : Boolean(
                  mobileEvidence &&
                  !mobileEvidence.overflow &&
                  mobileEvidence.hasHero,
                )
              ? 100
              : 0,
        industryFit:
          candidateResult.manifest.version >= 2
            ? Math.round(
                (Number(pixelScores.imagery || 0) +
                  Number(pixelScores.servicePresentation || 0)) /
                  2,
              )
            : 80,
        conversion: allEvidence.every(
          (viewport) => viewport.hasEarlyConversion && viewport.hasLeadForm,
        )
          ? candidateResult.manifest.version >= 2
            ? Number(pixelScores.ctaPlacement || 0)
            : 100
          : 0,
        referenceFidelity: candidateResult.referenceFidelity?.score ?? 0,
        motionEvidence:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.interactionEvidence || 0)
            : allEvidence.every((viewport) => viewport.motionPrimitive)
              ? 100
              : 0,
        imageRelevance: allEvidence.every(
          (viewport) => viewport.brokenImages === 0,
        )
          ? candidateResult.manifest.version >= 2
            ? Number(pixelScores.imagery || 0)
            : 100
          : 0,
      };
      const technical = {
        accessibility:
          candidateResult.contrast?.pass &&
          allEvidence.every(
            (viewport) =>
              viewport.missingAlt === 0 &&
              viewport.unnamedControls === 0 &&
              viewport.browserErrors.length === 0,
          )
            ? 100
            : 0,
      };
      const peerDistances = candidates
        .filter(
          (peer) =>
            peer.manifest.candidateId !== candidate.manifest.candidateId,
        )
        // The compact creative manifest intentionally carries the route
        // fingerprint hash, but not every structural dimension. Compare the
        // authored metadata so pairwise diversity reflects the actual route
        // grammar rather than collapsing distinct candidates to distance 1.
        .map((peer) => fingerprintDistance(candidate.metadata, peer.metadata));
      const minimumDistance = peerDistances.length
        ? Math.min(...peerDistances)
        : candidate.manifest.version >= 2
          ? CREATIVE_PROMOTION_THRESHOLDS.minimumFingerprintDistance
          : 0;
      const distinctivenessScore = Math.min(
        100,
        Math.round(
          (minimumDistance /
            CREATIVE_PROMOTION_THRESHOLDS.minimumFingerprintDistance) *
            100,
        ),
      );
      candidateResult.visualScore = Math.round(
        Object.values(visual).reduce((sum, value) => sum + value, 0) /
          Object.keys(visual).length,
      );
      candidateResult.technicalScore = technical.accessibility;
      candidateResult.distinctivenessScore = distinctivenessScore;
      candidateResult.minimumFingerprintDistance = minimumDistance;
      // Structural fingerprint distinctiveness remains diagnostic for v2.
      // Rendered screenshot diversity is evaluated after all candidates render
      // and is the sole diversity authority for v2 promotion.
      const scoringDistinctiveness =
        candidate.manifest.version >= 2 ? 100 : distinctivenessScore;
      const rawScore = scoreCreativeCandidate({
        hardPass: candidateResult.valid,
        visual,
        technical,
        distinctiveness: scoringDistinctiveness,
      });
      const candidateFamilyIds = [
        ...new Set(
          [candidate.metadata.familyId, candidate.metadata.referenceFamilyId]
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ];
      const recentFamilyUses = countRecentCreativeFamilyUses(
        recentHistory,
        candidateFamilyIds,
      );
      candidateResult.rotationPenalty = candidateResult.explicitReferenceMatch
        ? 0
        : Math.min(18, recentFamilyUses * 6);
      candidateResult.rawScore = rawScore;
      candidateResult.score =
        rawScore < 0 ? rawScore : rawScore - candidateResult.rotationPenalty;
      candidateResult.eligible =
        candidateResult.valid &&
        candidateResult.referenceFidelity?.pass !== false &&
        candidateResult.referenceFidelity?.score >=
          CREATIVE_PROMOTION_THRESHOLDS.referenceFidelityScore &&
        candidateResult.visualScore >=
          CREATIVE_PROMOTION_THRESHOLDS.visualScore &&
        (candidate.manifest.version >= 2 ||
          candidateResult.distinctivenessScore >=
            CREATIVE_PROMOTION_THRESHOLDS.distinctivenessScore);
      results.push(candidateResult);
    }
  } finally {
    await browser.close();
    await fs.writeFile(originalConfigPath, originalConfig);
    await fs.rm(selectedDir, { recursive: true, force: true });
    const backupEntries = await fs.readdir(selectedBackup).catch(() => []);
    await fs.mkdir(selectedDir, { recursive: true });
    await Promise.all(
      backupEntries.map((entry) =>
        fs.cp(path.join(selectedBackup, entry), path.join(selectedDir, entry), {
          recursive: true,
          force: true,
        }),
      ),
    );
    await fs.rm(selectedBackup, { recursive: true, force: true });
  }

  // Review previews must show authored work. Diversity remains a production
  // promotion requirement, not a reason to silently select the legacy page.
  const previewEligible = results.filter(
    (candidate) =>
      candidate.valid &&
      candidate.referenceFidelity?.pass !== false &&
      (candidate.manifest.version < 2 ||
        candidate.referenceFidelity?.score >=
          CREATIVE_PROMOTION_THRESHOLDS.referenceFidelityScore) &&
      candidate.visualScore >= CREATIVE_PROMOTION_THRESHOLDS.visualScore &&
      candidate.technicalScore >= 100,
  );
  const versionTwoCandidates = results.filter(
    (candidate) => candidate.manifest?.version >= 2,
  );
  const pixelCandidates = versionTwoCandidates.filter((candidate) =>
    ["desktop", "compact", "mobile"].every((name) =>
      candidate.viewports.some((viewport) => viewport.name === name),
    ),
  );
  let visualDiversity;
  if (pixelCandidates.length >= 2) {
    const judged = await renderedDiversityEvaluator({
      candidates: pixelCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        desktop: path.join(
          evidenceDir,
          `${candidate.candidateId}-desktop-viewport.png`,
        ),
        mobile: path.join(
          evidenceDir,
          `${candidate.candidateId}-mobile-viewport.png`,
        ),
      })),
    });
    visualDiversity = {
      version: judged.version,
      model: judged.model,
      minimumDistance: judged.minimumPairDistance,
      score: judged.score,
      pairs: judged.audit?.pairs || [],
      genericFallbackDetected: Boolean(judged.audit?.genericFallbackDetected),
      summary: judged.audit?.summary || "",
      pass: judged.pass,
    };
  } else if (versionTwoCandidates.length) {
    visualDiversity = {
      minimumDistance: 0,
      pairs: [],
      pass: false,
      source: "incomplete-rendered-evidence",
    };
  } else {
    const visualPairs = [];
    for (let i = 0; i < results.length; i += 1) {
      for (let j = i + 1; j < results.length; j += 1) {
        const distance =
          results[i].visualFingerprint &&
          results[i].visualFingerprint !== results[j].visualFingerprint
            ? 100
            : 0;
        visualPairs.push({
          left: results[i].candidateId,
          right: results[j].candidateId,
          distance,
          pass:
            distance >=
            CREATIVE_PROMOTION_THRESHOLDS.minimumPairwiseVisualDistance,
        });
      }
    }
    visualDiversity = {
      minimumDistance: visualPairs.length
        ? Math.min(...visualPairs.map((pair) => pair.distance))
        : 100,
      pairs: visualPairs,
      pass: visualPairs.every((pair) => pair.pass),
      source: "legacy-structural-fallback",
    };
  }
  const versionTwoPreviewEligible = previewEligible.filter(
    (candidate) => candidate.manifest?.version >= 2,
  );
  const renderedHeroDistinctiveness = renderedPairMetrics(
    visualDiversity,
    versionTwoPreviewEligible.map((candidate) => candidate.candidateId),
  );
  for (const candidate of results)
    if (candidate.manifest?.version >= 2)
      candidate.renderedHeroDistinctiveness = renderedHeroDistinctiveness[
        candidate.candidateId
      ] || {
        peerCount: 0,
        minimumDistance: 0,
        averageDistance: 0,
        allPairsPass: false,
        failedPeers: [],
      };

  let previewSelectionPool = previewEligible;
  let previewDiversity = {
    required: false,
    pass: true,
    strategy: "quality-only",
    convergenceDetected: false,
    eligibleCandidateIds: previewEligible
      .map((candidate) => candidate.candidateId)
      .sort(),
    distinctCandidateIds: [],
    summary: "",
  };
  if (preview && !promote && versionTwoCandidates.length >= 2) {
    const eligibleIds = versionTwoPreviewEligible
      .map((candidate) => candidate.candidateId)
      .sort();
    const distinctCandidateIds = eligibleIds.filter(
      (candidateId) =>
        renderedHeroDistinctiveness[candidateId]?.allPairsPass === true,
    );
    const allEligiblePairsPass =
      eligibleIds.length >= 2 &&
      distinctCandidateIds.length === eligibleIds.length;
    previewDiversity = {
      required: requireDiversity,
      pass: true,
      strategy: requireDiversity ? "all-distinct" : "diagnostic-only",
      convergenceDetected: visualDiversity.pass === false,
      eligibleCandidateIds: eligibleIds,
      distinctCandidateIds,
      summary: visualDiversity.summary || "",
    };
    if (requireDiversity && eligibleIds.length === 0) {
      previewSelectionPool = [];
      previewDiversity = {
        ...previewDiversity,
        pass: false,
        strategy: "insufficient-eligible-candidates",
        convergenceDetected: true,
      };
    } else if (
      requireDiversity &&
      Boolean(visualDiversity.genericFallbackDetected)
    ) {
      previewSelectionPool = [];
      previewDiversity = {
        ...previewDiversity,
        pass: false,
        strategy: "generic-fallback-blocked",
        convergenceDetected: true,
      };
    } else if (requireDiversity && eligibleIds.length === 1) {
      // Graded promotion (approved 2026-10-02): a single eligible candidate
      // has no eligible sibling to converge with, so it may proceed to
      // developer review. The generic-fallback block above still applies, and
      // two or more eligible candidates still require distinct rendered
      // grammar before one can be selected.
      previewSelectionPool = versionTwoPreviewEligible;
      previewDiversity = {
        ...previewDiversity,
        pass: true,
        strategy: "single-eligible",
      };
    } else if (requireDiversity && allEligiblePairsPass) {
      previewSelectionPool = versionTwoPreviewEligible;
      previewDiversity = {
        ...previewDiversity,
        pass: true,
        strategy: "all-distinct",
      };
    } else if (requireDiversity && distinctCandidateIds.length) {
      const allowed = new Set(distinctCandidateIds);
      previewSelectionPool = versionTwoPreviewEligible.filter((candidate) =>
        allowed.has(candidate.candidateId),
      );
      previewDiversity = {
        ...previewDiversity,
        pass: true,
        strategy: "distinct-alternative",
        convergenceDetected: true,
      };
    } else if (requireDiversity) {
      previewSelectionPool = [];
      previewDiversity = {
        ...previewDiversity,
        pass: false,
        strategy: "converged-blocked",
        convergenceDetected: true,
      };
    }
  }

  const hasVersionTwoCandidates = versionTwoCandidates.length > 0;
  const measuredDiversityPass = hasVersionTwoCandidates
    ? visualDiversity.pass
    : diversity.pass && visualDiversity.pass;
  const diversityPass = !requireDiversity || measuredDiversityPass;
  const valid =
    preview && !promote
      ? previewSelectionPool
      : diversityPass
        ? results.filter((candidate) => candidate.eligible)
        : [];
  const winner =
    valid.sort(
      (left, right) =>
        Number(right.explicitReferenceMatch) -
          Number(left.explicitReferenceMatch) ||
        Number(right.renderedHeroDistinctiveness?.minimumDistance || 0) -
          Number(left.renderedHeroDistinctiveness?.minimumDistance || 0) ||
        right.score - left.score ||
        right.intakeFitScore - left.intakeFitScore ||
        left.candidateId.localeCompare(right.candidateId),
    )[0] || null;
  const selectionPass = Boolean(
    winner && (preview && !promote ? previewDiversity.pass : diversityPass),
  );

  const report = {
    version: 1,
    mode: promote ? "promote" : preview ? "preview" : "review",
    thresholds: CREATIVE_PROMOTION_THRESHOLDS,
    scoreSource:
      "rendered-structure-and-contract; multimodal visual gate remains required",
    diversity,
    visualDiversity,
    previewDiversity,
    diversityRequired: requireDiversity,
    excludedCandidateIds: [...excludedIds].sort(),
    candidates: results,
    selectedCandidateId: selectionPass ? winner.candidateId : null,
    // Preview selection is authored-only and now treats rendered hero
    // distinctiveness as a real objective. A converged v2 pool stays blocked
    // for bounded repair instead of silently publishing a generic winner.
    fallback: !selectionPass,
    promotionReady: Boolean(winner && measuredDiversityPass && winner.eligible),
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  const shouldPublishSelection =
    (promote && report.promotionReady) ||
    (preview && !promote && selectionPass);
  if (shouldPublishSelection && !deferPromotion) {
    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: path.relative(
        root,
        path.join(candidateRoot, winner.directory),
      ),
      contentManifest: candidates.find(
        (candidate) => candidate.directory === winner.directory,
      )?.contentManifest,
      visualScore: winner.visualScore,
      distinctivenessScore: winner.distinctivenessScore,
      selectionMode: promote ? "creative-bakeoff" : "creative-preview",
      preview,
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
  console.log(
    JSON.stringify({
      selectedCandidateId: report.selectedCandidateId,
      fallback: report.fallback,
      diversityPass: report.diversity.pass,
      report: args.report || ".launchloom/creative-bakeoff.json",
    }),
  );
}
