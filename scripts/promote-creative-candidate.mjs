import fs from "node:fs/promises";
import path from "node:path";
import { validateCandidateManifest } from "./creative-compiler.mjs";
import { validateProductionCandidateFiles } from "./production-experience-author.mjs";
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

function validateAuthoredFiles(
  candidateId,
  files,
  candidateManifest,
  contentManifest,
  { preview = false } = {},
) {
  if (
    candidateManifest.version >= 2 &&
    (!contentManifest ||
      contentManifest.version !== 2 ||
      !contentManifest.values ||
      typeof contentManifest.values !== "object" ||
      !contentManifest.visualBrief ||
      typeof contentManifest.visualBrief !== "object")
  )
    throw new Error(
      `Creative candidate ${candidateId} requires its sealed version-two content manifest before promotion.`,
    );
  const validation = validateProductionCandidateFiles({
    files,
    route: {
      id: candidateId,
      referenceDna: candidateManifest.referenceDna,
    },
    content: contentManifest?.values || {},
    visualBrief: contentManifest?.visualBrief || {},
  });
  const fidelity = validation.referenceFidelity;
  if (
    candidateManifest.version >= 2 &&
    (!fidelity?.pass || (!preview && !fidelity.visualPass))
  )
    throw new Error(
      `Creative candidate ${candidateId} failed reference fidelity: ${(fidelity?.findings || []).map((item) => item.message).join(" | ")}`,
    );
  return validation.files;
}

/**
 * @param {{siteDir?: string, candidateDir?: string, configPath?: string, visualScore?: number, distinctivenessScore?: number, selectionMode?: string, preview?: boolean, preserveSelectedManifest?: boolean, contentManifest?: Record<string, any>}} options
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
  contentManifest: providedContentManifest,
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
  const contentManifest = providedContentManifest || await fs
    .readFile(path.join(source, "content-manifest.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const validatedFiles = validateAuthoredFiles(
    candidateManifest.candidateId,
    files,
    candidateManifest,
    contentManifest,
    { preview },
  );



  const selected = path.resolve(root, "src/generated-experiences/selected");
  await fs.mkdir(selected, { recursive: true });
  if (preserveSelectedManifest)
    await fs.access(path.join(selected, "manifest.json"));
  await Promise.all([
    fs.writeFile(path.join(selected, "Experience.jsx"), validatedFiles.experience),
    fs.writeFile(path.join(selected, "styles.css"), validatedFiles.styles),
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
