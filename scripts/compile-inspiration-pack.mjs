import fs from "node:fs/promises";
import path from "node:path";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "./a1-reference-library.mjs";
import {
  inferReferenceCompatibility,
  loadGoldReferenceLibrary,
  productionGoldRegistry,
} from "./gold-reference-library.mjs";

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2)
    result[values[index].replace(/^--/u, "")] = values[index + 1];
  return result;
}

const STYLE_STOPWORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "into",
  "not",
  "the",
  "this",
  "that",
  "then",
  "use",
  "with",
  "your",
]);

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 2 && !STYLE_STOPWORDS.has(word));
}

function intakeFromMarkdown(value) {
  const match = String(value || "").match(/```json\s*([\s\S]*?)```/iu);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("The intake contains an invalid JSON block.");
  }
}

const args = parseArgs(process.argv.slice(2));
const repository = path.resolve(import.meta.dirname, "..");
const configPath = path.resolve(args.config || "src/site.config.json");
const registryPath = path.resolve(
  args.registry || path.join(repository, "data/inspiration-registry.json"),
);
const historyPath = path.resolve(
  args.history || path.join(repository, "data/recent-launch-signatures.json"),
);
const a1LibraryPath = path.resolve(
  args["a1-library"] || path.join(repository, "data/a1-reference-library.json"),
);
const goldLibraryPath = path.resolve(
  args["gold-library"] ||
    path.join(repository, "data/gold-reference-candidates.json"),
);
const outputPath = path.resolve(
  args.out || ".launchloom/inspiration-pack.json",
);

const [config, baseRegistry, history, intake, a1Library, goldLibrary] =
  await Promise.all([
  fs.readFile(configPath, "utf8").then(JSON.parse),
  fs.readFile(registryPath, "utf8").then(JSON.parse),
  fs.readFile(historyPath, "utf8").then(JSON.parse),
  args.intake
    ? fs.readFile(path.resolve(args.intake), "utf8").then(intakeFromMarkdown)
    : {},
  fs.access(a1LibraryPath).then(
    () => loadA1ReferenceLibrary(a1LibraryPath, { repositoryRoot: repository }),
    () => null,
  ),
  fs.access(goldLibraryPath).then(
    async () =>
      productionGoldRegistry(await loadGoldReferenceLibrary(goldLibraryPath), {
        repositoryRoot: repository,
      }),
    () => null,
  ),
]);
const registryWithA1 = a1Library
  ? mergeInspirationRegistries(baseRegistry, a1Library)
  : baseRegistry;
const registry =
  goldLibrary?.records?.length
    ? mergeInspirationRegistries(registryWithA1, goldLibrary)
    : registryWithA1;
const recent = Array.isArray(history.launches)
  ? history.launches.slice(-30)
  : [];
const normalizedIndustry = String(config.industry || "").toLowerCase();
const industry = ["", "all", "general", "other"].includes(normalizedIndustry)
  ? intake.industry || config.businessKind || config.preset || "all"
  : config.industry;
const styleText = [
  intake.stylePreference,
  intake.brandNotes,
  config.style?.preference,
  config.style?.visualDirection,
  config.style?.artDirection,
  config.style?.tone,
  config.design?.treatment?.typography,
  config.design?.recipe,
]
  .filter(Boolean)
  .join(" ");
const styleTerms = words(styleText);
const pack = buildInspirationPack(
  {
    seed:
      process.env.LAUNCHLOOM_INTAKE_ID ||
      intake.submissionId ||
      config.business?.name ||
      "launchloom-intake",
    industry,
    styleTerms,
    styleText,
    referenceCalibration: a1Library?.calibration,
    compatibility: inferReferenceCompatibility(config, intake),
    recentReferenceIds: recent.flatMap((launch) =>
      Array.isArray(launch.referenceIds) ? launch.referenceIds : [],
    ),
    recentFamilyIds: recent.flatMap((launch) => [
      ...(Array.isArray(launch.routeFamilyIds)
        ? launch.routeFamilyIds
        : []),
      launch.creativeFamilyId,
      launch.referenceFamilyId,
    ]),
    recentRouteSignatures: recent.flatMap((launch) =>
      Array.isArray(launch.routeSignatures) ? launch.routeSignatures : [],
    ),
  },
  registry,
);
pack.referenceLibrary = {
  a1: a1Library
    ? {
        source: a1Library.source,
        capturedAt: a1Library.capturedAt,
        recordIds: a1Library.records.map((record) => record.id),
        calibration: a1Library.calibration,
      }
    : null,
  gold: goldLibrary
    ? {
        updatedAt: goldLibrary.updatedAt,
        approvedRecordIds: goldLibrary.records.map((record) => record.id),
        excludedCount: goldLibrary.excluded.length,
      }
    : null,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(
  `inspiration_pack=${outputPath} routes=${pack.routes.length} registry=${pack.registryDigest.slice(0, 12)}`,
);
