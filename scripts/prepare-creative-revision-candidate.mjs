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

const clientDir = path.resolve(String(args.client || ""));
const outDir = path.resolve(String(args.out || ""));
if (!clientDir || !outDir)
  throw new Error("--client and --out are required.");

const config = JSON.parse(
  await fs.readFile(path.join(clientDir, "src/site.config.json"), "utf8"),
);
const experience = config.design?.experience || {};
if (
  experience.renderer !== "creative-candidate" ||
  !experience.candidateId
) {
  console.log(JSON.stringify({ creative: false }));
  process.exit(0);
}

const candidateId = String(experience.candidateId);
const evidenceRoot = path.join(
  clientDir,
  ".launchloom/generated-experiences",
);
const entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
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

console.log(
  JSON.stringify({
    creative: true,
    candidateId,
    candidateDir,
  }),
);
