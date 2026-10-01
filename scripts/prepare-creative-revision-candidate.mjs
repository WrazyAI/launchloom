import { buildCreativeContentManifest } from "./production-experience-author.mjs";
import { resolveCreativeRevisionScope } from "./creative-revision-scope.mjs";
import fs from "node:fs/promises";
import path from "node:path";

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

const INNER_PAGE_TARGETS = {
  servicePage: { sourceFile: "ServicePage.jsx", flag: "servicePage" },
  locationPage: { sourceFile: "LocationPage.jsx", flag: "locationPage" },
  servicesIndexPage: { sourceFile: "ServicesIndexPage.jsx", flag: "servicesIndex" },
};

function reviewedPageTarget(reviewedPage, config) {
  if (!reviewedPage) return { key: "experience", sourceFile: "Experience.jsx", route: "/" };
  let pathname;
  try {
    pathname = new URL(reviewedPage).pathname;
  } catch {
    throw new Error("Manual attention required: reviewed page URL is invalid.");
  }
  const normalized = pathname.replace(/\/{2,}/gu, "/");
  if (normalized === "/" || normalized === "") 
    return { key: "experience", sourceFile: "Experience.jsx", route: "/" };
  if (normalized === "/services" || normalized === "/services/")
    return { key: "servicesIndexPage", sourceFile: "ServicesIndexPage.jsx", route: "/services/" };
  const serviceMatch = normalized.match(/^\/services\/([^/]+)\/?$/u);
  if (serviceMatch) {
    const slug = decodeURIComponent(serviceMatch[1]);
    if (!(config.services || []).some((service) => String(service?.slug || "") === slug))
      throw new Error(`Manual attention required: reviewed service route is not present in the verified config: ${normalized}`);
    return {
      key: "servicePage",
      sourceFile: "ServicePage.jsx",
      route: `/services/${slug}/`,
    };
  }
  const locationMatch = normalized.match(/^\/locations\/([^/]+)\/?$/u);
  if (locationMatch) {
    const slug = decodeURIComponent(locationMatch[1]);
    if (!(config.locations || []).some((location) => String(location?.slug || "") === slug))
      throw new Error(`Manual attention required: reviewed location route is not present in the verified config: ${normalized}`);
    return {
      key: "locationPage",
      sourceFile: "LocationPage.jsx",
      route: `/locations/${slug}/`,
    };
  }
  throw new Error(
    `Manual attention required: reviewed route is not an authored creative page: ${normalized}`,
  );
}

const clientArg = String(args.client || "").trim();
const outArg = String(args.out || "").trim();
if (!clientArg || !outArg)
  throw new Error("--client and --out are required.");
const clientDir = path.resolve(clientArg);
const outDir = path.resolve(outArg);

const config = JSON.parse(
  await fs.readFile(path.join(clientDir, "src/site.config.json"), "utf8"),
);
const experience = config.design?.experience || {};
if (
  experience.renderer !== "creative-candidate" ||
  !experience.candidateId
) {
  console.log(JSON.stringify({ creative: false, repairRequired: false }));
  process.exit(0);
}
const repairRequired = Boolean(
  config.revisionReport?.creativeSourceRepairRequired,
);

const candidateId = String(experience.candidateId);
const evidenceRoot = path.join(
  clientDir,
  ".launchloom/generated-experiences",
);
let entries;
try {
  entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  entries = [];
}
let sourceDir = "";
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(evidenceRoot, entry.name);
  try {
    const metadata = JSON.parse(
      await fs.readFile(path.join(directory, "metadata.json"), "utf8"),
    );
    if (metadata.candidateId === candidateId) {
      sourceDir = directory;
      break;
    }
  } catch {
    // Ignore unrelated evidence directories.
  }
}
if (!sourceDir)
  throw new Error(
    `Could not find authored candidate evidence for ${candidateId}.`,
  );

const selectedDir = path.join(
  clientDir,
  "src/generated-experiences/selected",
);
for (const file of ["Experience.jsx", "styles.css", "motion.js"])
  await fs.access(path.join(selectedDir, file));

let creativeRepairScope = null;
if (repairRequired) {
  const declaration = config.revisionReport?.creativeRepairScope;
  if (
    !declaration ||
    declaration.version !== 1 ||
    !Array.isArray(declaration.feedbackItems) ||
    !declaration.feedbackItems.length
  )
    throw new Error(
      "Manual attention required: creative feedback has no declared source scope.",
    );
  const targets = declaration.feedbackItems.map((item) =>
    reviewedPageTarget(item.reviewedPage || "", config),
  );
  const targetSignatures = new Set(
    targets.map((target) => `${target.key}:${target.route}`),
  );
  if (targetSignatures.size !== 1)
    throw new Error(
      "Manual attention required: one creative revision batch cannot span multiple reviewed routes.",
    );
  const target = targets[0];
  if (target.key === "experience") {
    creativeRepairScope = {
      ...resolveCreativeRevisionScope({
        source: await fs.readFile(
          path.join(selectedDir, "Experience.jsx"),
          "utf8",
        ),
        feedbackItems: declaration.feedbackItems,
        requestText: declaration.requestText,
      }),
      targetFile: "experience",
      sourceFile: "Experience.jsx",
      reviewedRoute: target.route,
    };
  } else {
    const targetDefinition = INNER_PAGE_TARGETS[target.key];
    if (!targetDefinition || experience[targetDefinition.flag] !== true)
      throw new Error(
        `Manual attention required: reviewed route requires unavailable authored source ${target.sourceFile}.`,
      );
    await fs.access(path.join(selectedDir, target.sourceFile));
    creativeRepairScope = {
      version: 1,
      targetFile: target.key,
      sourceFile: target.sourceFile,
      reviewedRoute: target.route,
      sectionIds: ["__authored_page__"],
      allowMotion: false,
      feedbackIndexes: [
        ...new Set(
          declaration.feedbackItems
            .map((item) => item.feedbackIndex)
            .filter(Number.isSafeInteger),
        ),
      ].sort((a, b) => a - b),
      requestText: String(declaration.requestText || "").trim(),
    };
  }
}

await fs.rm(outDir, { recursive: true, force: true });
const candidateDir = path.join(outDir, candidateId);
await fs.mkdir(candidateDir, { recursive: true });
await fs.cp(sourceDir, candidateDir, { recursive: true });
for (const file of ["Experience.jsx", "styles.css", "motion.js"])
  await fs.copyFile(
    path.join(selectedDir, file),
    path.join(candidateDir, file),
  );
for (const [flag, file] of [
  ["servicePage", "ServicePage.jsx"],
  ["locationPage", "LocationPage.jsx"],
  ["servicesIndex", "ServicesIndexPage.jsx"],
]) {
  if (experience[flag] === true) {
    await fs.copyFile(
      path.join(selectedDir, file),
      path.join(candidateDir, file),
    );
  } else {
    await fs.rm(path.join(candidateDir, file), { force: true });
  }
}

const contractPath = path.join(candidateDir, "contract.json");
const metadataPath = path.join(candidateDir, "metadata.json");
const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
if (metadata.candidateId !== candidateId)
  throw new Error(
    `Prepared candidate metadata does not match the selected candidate ${candidateId}.`,
  );
delete metadata.creativeRepairScope;
if (creativeRepairScope) metadata.creativeRepairScope = creativeRepairScope;
const contentManifest = buildCreativeContentManifest(config, contract.route);
metadata.contentManifestDigest = contentManifest.digest;
if (metadata.creativeManifest)
  metadata.creativeManifest.contentManifestDigest = contentManifest.digest;
if (contract.creativeManifest)
  contract.creativeManifest.contentManifestDigest = contentManifest.digest;
await Promise.all([
  fs.writeFile(
    path.join(candidateDir, "content-manifest.json"),
    `${JSON.stringify(contentManifest, null, 2)}\n`,
  ),
  fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`),
  fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`),
]);

console.log(
  JSON.stringify({
    creative: true,
    repairRequired,
    candidateId,
    candidateDir,
    creativeRepairScope,
  }),
);
