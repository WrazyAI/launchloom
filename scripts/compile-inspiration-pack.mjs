import fs from "node:fs/promises";
import path from "node:path";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "./a1-reference-library.mjs";

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2)
    result[values[index].replace(/^--/u, "")] = values[index + 1];
  return result;
}

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 2);
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
const a1LibraryPath = args["a1-library"]
  ? path.resolve(args["a1-library"])
  : "";
const outputPath = path.resolve(
  args.out || ".launchloom/inspiration-pack.json",
);

const [config, baseRegistry, history, intake, a1Library] = await Promise.all([
  fs.readFile(configPath, "utf8").then(JSON.parse),
  fs.readFile(registryPath, "utf8").then(JSON.parse),
  fs.readFile(historyPath, "utf8").then(JSON.parse),
  args.intake
    ? fs.readFile(path.resolve(args.intake), "utf8").then(intakeFromMarkdown)
    : {},
  a1LibraryPath
    ? fs.access(a1LibraryPath).then(
        () => loadA1ReferenceLibrary(a1LibraryPath, { repositoryRoot: repository }),
        () => null,
      )
    : null,
]);
const registry = a1Library
  ? mergeInspirationRegistries(baseRegistry, a1Library)
  : baseRegistry;
const recent = Array.isArray(history.launches)
  ? history.launches.slice(-30)
  : [];
const normalizedIndustry = String(config.businessKind || config.industry || "").toLowerCase();
const industry = ["", "all", "general", "other"].includes(normalizedIndustry)
  ? intake.industry || config.businessKind || config.preset || "all"
  : normalizedIndustry;
const styleTerms = [
  ...words(intake.stylePreference),
  ...words(intake.brandNotes),
  ...words(config.style?.tone),
  ...words(config.design?.treatment?.typography),
  ...words(config.design?.recipe),
];
const pack = buildInspirationPack(
  {
    seed:
      process.env.LAUNCHLOOM_INTAKE_ID ||
      intake.submissionId ||
      config.business?.name ||
      "launchloom-intake",
    industry,
    styleTerms,
    recentReferenceIds: recent.flatMap((launch) =>
      Array.isArray(launch.referenceIds) ? launch.referenceIds : [],
    ),
    recentRouteSignatures: recent.flatMap((launch) =>
      Array.isArray(launch.routeSignatures) ? launch.routeSignatures : [],
    ),
  },
  registry,
  { repositoryRoot: repository, requireDossiers: true },
);
pack.referenceLibrary = {
  policy: "permission-cleared-only",
  selectedDossierCount: pack.routes.filter((route) => route.referenceDossier).length,
  a1: a1Library
    ? {
        source: a1Library.source,
        capturedAt: a1Library.capturedAt,
        recordCount: a1Library.records.length,
        routeSelectionEligible: false,
        note: "Discovery cache only. A record must have a complete permission-cleared dossier before production selection.",
      }
    : null,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(
  `inspiration_pack=${outputPath} routes=${pack.routes.length} registry=${pack.registryDigest.slice(0, 12)}`,
);
