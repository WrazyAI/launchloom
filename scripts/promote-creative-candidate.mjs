import fs from "node:fs/promises";
import path from "node:path";
import { validateCandidateManifest } from "./creative-compiler.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";
import {
  assertCreativeInnerPageSource,
  assertCreativeServicePageSource,
  normalizeCreativeExperienceLinks,
} from "./creative-source-safety.mjs";

const SERVICE_PAGE_FALLBACK = `export default function ServicePage(_props) {
  return null;
}
`;

const LOCATION_PAGE_FALLBACK = `export default function LocationPage(_props) {
  return null;
}
`;

const SERVICES_INDEX_FALLBACK = `export default function ServicesIndexPage(_props) {
  return null;
}
`;

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

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function validateAuthoredFiles(candidateId, files, candidateManifest, { preview = false } = {}) {
  const experience = files.experience;
  for (const marker of ["data-hero", "data-early-conversion", 'id="services"', 'id="faqs"', 'id="contact"'])
    if (!experience.includes(marker)) throw new Error(`Creative candidate ${candidateId} is missing ${marker}.`);
  if (!/from\s+["']@launchloom\/runtime["']/u.test(experience) || !/\bLeadForm\b/u.test(experience))
    throw new Error(`Creative candidate ${candidateId} must use the shared LeadForm runtime.`);
  if (/https?:\/\/|\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket)\b|\beval\s*\(|<script\b|—/iu.test(experience))
    throw new Error(`Creative candidate ${candidateId} contains an unsafe Experience.jsx primitive.`);
  if (/<style\b|\sstyle\s*=|\.\.\.\s*\{\s*(?:style\b|\[[^\]]*style[^\]]*\])\s*:/iu.test(experience))
    throw new Error(`Creative candidate ${candidateId} contains inline styles; visual rules belong in styles.css.`);
  if (/url\s*\(\s*["']?(?:https?:)?\/\//iu.test(files.styles) || /—/u.test(files.styles))
    throw new Error(`Creative candidate ${candidateId} contains an unsafe styles.css value.`);
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(/iu.test(files.motion) || !/reducedMotion|prefers-reduced-motion/u.test(files.motion))
    throw new Error(`Creative candidate ${candidateId} motion is missing safety or reduced-motion handling.`);
  if (candidateManifest.version >= 2) {
    const fidelity = validateReferenceCandidate({
      referenceDna: candidateManifest.referenceDna,
      experienceSource: files.experience,
      stylesSource: files.styles,
      motionSource: files.motion,
    });
    if (!fidelity.pass || (!preview && !fidelity.visualPass))
      throw new Error(`Creative candidate ${candidateId} failed reference fidelity: ${fidelity.findings.map((item) => item.message).join(" | ")}`);
  }
}

/**
 * @param {{siteDir?: string, candidateDir?: string, configPath?: string, visualScore?: number, distinctivenessScore?: number, selectionMode?: string, preview?: boolean, preserveSelectedManifest?: boolean}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function promoteCreativeCandidate({
  siteDir = ".",
  candidateDir,
  configPath = "src/site.config.json",
  visualScore,
  distinctivenessScore,
  selectionMode = "creative-bakeoff",
  preview = false,
  preserveSelectedManifest = false,
} = {}) {
  if (!candidateDir) throw new Error("A candidate directory is required.");
  const root = path.resolve(siteDir);
  const source = path.resolve(root, candidateDir);
  const manifest = await readJson(path.join(source, "metadata.json"));
  const candidateManifest = validateCandidateManifest(manifest.creativeManifest || manifest);
  const required = ["Experience.jsx", "styles.css", "motion.js"];
  for (const file of required) await fs.access(path.join(source, file));
  const files = {
    experience: normalizeCreativeExperienceLinks(
      await fs.readFile(path.join(source, "Experience.jsx"), "utf8"),
    ),
    styles: await fs.readFile(path.join(source, "styles.css"), "utf8"),
    motion: await fs.readFile(path.join(source, "motion.js"), "utf8"),
  };
  const servicePageSource = await fs
    .readFile(path.join(source, "ServicePage.jsx"), "utf8")
    .catch(() => "");
  if (servicePageSource.trim()) {
    const servicePage = normalizeCreativeExperienceLinks(servicePageSource);
    assertCreativeServicePageSource(servicePage, {
      candidateId: candidateManifest.candidateId,
    });
    files.servicePage = servicePage;
  }
  const locationPageSource = await fs
    .readFile(path.join(source, "LocationPage.jsx"), "utf8")
    .catch(() => "");
  if (locationPageSource.trim()) {
    const locationPage = normalizeCreativeExperienceLinks(locationPageSource);
    assertCreativeInnerPageSource(locationPage, {
      candidateId: candidateManifest.candidateId,
      pageLabel: "LocationPage.jsx",
      rootMarker: "data-location-page",
      requireServiceRoute: true,
    });
    files.locationPage = locationPage;
  }
  const servicesIndexSource = await fs
    .readFile(path.join(source, "ServicesIndexPage.jsx"), "utf8")
    .catch(() => "");
  if (servicesIndexSource.trim()) {
    const servicesIndexPage = normalizeCreativeExperienceLinks(
      servicesIndexSource,
    );
    assertCreativeInnerPageSource(servicesIndexPage, {
      candidateId: candidateManifest.candidateId,
      pageLabel: "ServicesIndexPage.jsx",
      rootMarker: "data-services-index",
      requireServiceRoute: true,
    });
    files.servicesIndexPage = servicesIndexPage;
  }
  validateAuthoredFiles(candidateManifest.candidateId, files, candidateManifest, { preview });

  const selected = path.resolve(root, "src/generated-experiences/selected");
  await fs.mkdir(selected, { recursive: true });
  if (preserveSelectedManifest)
    await fs.access(path.join(selected, "manifest.json"));
  await Promise.all([
    fs.writeFile(path.join(selected, "Experience.jsx"), files.experience),
    fs.copyFile(path.join(source, "styles.css"), path.join(selected, "styles.css")),
    fs.copyFile(path.join(source, "motion.js"), path.join(selected, "motion.js")),
    fs.writeFile(
      path.join(selected, "ServicePage.jsx"),
      files.servicePage ? `${files.servicePage.trim()}\n` : SERVICE_PAGE_FALLBACK,
    ),
    fs.writeFile(
      path.join(selected, "LocationPage.jsx"),
      files.locationPage ? `${files.locationPage.trim()}\n` : LOCATION_PAGE_FALLBACK,
    ),
    fs.writeFile(
      path.join(selected, "ServicesIndexPage.jsx"),
      files.servicesIndexPage
        ? `${files.servicesIndexPage.trim()}\n`
        : SERVICES_INDEX_FALLBACK,
    ),
  ]);
  if (!preserveSelectedManifest)
    await fs.writeFile(
      path.join(selected, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

  const configFile = path.resolve(root, configPath);
  const config = await readJson(configFile);
  config.design ||= { recipe: "general-editorial", sections: [] };
  config.design.experience = {
    ...(config.design.experience || {}),
    renderer: "creative-candidate",
    candidateId: candidateManifest.candidateId,
    familyId: candidateManifest.familyId,
    referenceFamilyId: candidateManifest.referenceDna?.familyId || candidateManifest.familyId,
    referenceDnaVersion: candidateManifest.referenceDna?.version || null,
    contractHash: candidateManifest.routeFingerprint,
    fingerprint: candidateManifest.fingerprint,
    servicePage: Boolean(files.servicePage),
    locationPage: Boolean(files.locationPage),
    servicesIndex: Boolean(files.servicesIndexPage),
    ...(Number.isFinite(visualScore) ? { visualScore } : {}),
    ...(Number.isFinite(distinctivenessScore) ? { distinctivenessScore } : {}),
    selectionMode,
  };
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return {
    candidateId: candidateManifest.candidateId,
    familyId: candidateManifest.familyId,
    fingerprint: candidateManifest.fingerprint,
    destination: selected,
    configPath: configFile,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv);
  const result = await promoteCreativeCandidate({
    siteDir: args["site-dir"] || ".",
    candidateDir: args.candidate,
    configPath: args.config || "src/site.config.json",
    visualScore: Number.isFinite(Number(args["visual-score"]))
      ? Number(args["visual-score"])
      : undefined,
    distinctivenessScore: Number.isFinite(Number(args["distinctiveness-score"]))
      ? Number(args["distinctiveness-score"])
      : undefined,
    selectionMode: args["selection-mode"] || "creative-bakeoff",
    preview: args.preview === "true",
  });
  console.log(JSON.stringify(result));
}
