import { buildCreativeContentManifest } from "./production-experience-author.mjs";
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

await fs.rm(outDir, { recursive: true, force: true });
const candidateDir = path.join(outDir, candidateId);
await fs.mkdir(candidateDir, { recursive: true });
await fs.cp(sourceDir, candidateDir, { recursive: true });
for (const file of ["Experience.jsx", "styles.css", "motion.js"])
  await fs.copyFile(
    path.join(selectedDir, file),
    path.join(candidateDir, file),
  );

const contractPath = path.join(candidateDir, "contract.json");
const metadataPath = path.join(candidateDir, "metadata.json");
const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
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
  }),
);
