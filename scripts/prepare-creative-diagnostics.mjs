import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeDiagnosticText } from "./diagnostic-sanitizer.mjs";

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

function sanitizeValue(value, key = "") {
  if (/token|secret|password|authorization|api[-_]?key/iu.test(key))
    return "[redacted-secret]";
  if (Array.isArray(value))
    return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitizeValue(child, childKey),
      ]),
    );
  if (typeof value === "string") return sanitizeDiagnosticText(value);
  return value;
}

async function exists(file) {
  return fs
    .access(file)
    .then(() => true)
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
}

async function writeSanitizedText(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(
    destination,
    sanitizeDiagnosticText(await fs.readFile(source, "utf8")) + "\n",
  );
}

async function writeSanitizedJson(source, destination) {
  const parsed = JSON.parse(await fs.readFile(source, "utf8"));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(
    destination,
    JSON.stringify(sanitizeValue(parsed), null, 2) + "\n",
  );
}

async function copyCandidateSources(candidatesRoot, outputRoot) {
  if (!(await exists(candidatesRoot))) return;
  const entries = await fs.readdir(candidatesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^candidate-[a-z]+$/u.test(entry.name))
      continue;
    const sourceDir = path.join(candidatesRoot, entry.name);
    const targetDir = path.join(outputRoot, "candidates", entry.name);
    for (const file of ["Experience.jsx", "styles.css", "motion.js"]) {
      const source = path.join(sourceDir, file);
      if (await exists(source))
        await writeSanitizedText(source, path.join(targetDir, file));
    }
    const metadataPath = path.join(sourceDir, "metadata.json");
    if (await exists(metadataPath)) {
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      const referenceDna = metadata.referenceDna || {};
      const safeMetadata = sanitizeValue({
        version: metadata.version,
        candidateId: metadata.candidateId,
        routeId: metadata.routeId,
        familyId: metadata.familyId,
        referenceFamilyId: metadata.referenceFamilyId,
        model: metadata.model,
        sectionSequence: referenceDna.sectionSequence,
        sectionVisualRequirements: referenceDna.sectionVisualRequirements,
        requiredSignatureElements: referenceDna.requiredSignatureElements,
        acceptanceChecks: referenceDna.acceptanceChecks,
        measurements: referenceDna.measurements,
      });
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(
        path.join(targetDir, "metadata.json"),
        JSON.stringify(safeMetadata, null, 2) + "\n",
      );
    }
  }

  const diagnostics = path.join(candidatesRoot, "diagnostics");
  if (await exists(diagnostics)) {
    const copyTree = async (sourceDir, targetDir) => {
      for (const entry of await fs.readdir(sourceDir, {
        withFileTypes: true,
      })) {
        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);
        if (entry.isDirectory()) await copyTree(source, target);
        else if (entry.name.endsWith(".json"))
          await writeSanitizedJson(source, target);
        else await writeSanitizedText(source, target);
      }
    };
    await copyTree(diagnostics, path.join(outputRoot, "author-diagnostics"));
  }

  const creativeRun = path.join(candidatesRoot, "creative-run.json");
  if (await exists(creativeRun))
    await writeSanitizedJson(
      creativeRun,
      path.join(outputRoot, "creative-run.json"),
    );
}

async function copyRepairEvidence(repairRoot, outputRoot) {
  if (!(await exists(repairRoot))) return;
  const walk = async (sourceDir, relative = "") => {
    for (const entry of await fs.readdir(sourceDir, {
      withFileTypes: true,
    })) {
      const source = path.join(sourceDir, entry.name);
      const nextRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(source, nextRelative);
        continue;
      }
      if (entry.name.endsWith(".png")) {
        const target = path.join(outputRoot, "rendered", nextRelative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target);
        continue;
      }
      if (
        entry.name.endsWith(".json") &&
        /(?:creative-bakeoff|visual-gate|summary|repair-evidence)/u.test(
          entry.name,
        )
      )
        await writeSanitizedJson(
          source,
          path.join(outputRoot, "reports", nextRelative),
        );
    }
  };
  await walk(repairRoot);
}

export async function prepareCreativeDiagnostics({
  candidatesDir,
  repairDir,
  outDir,
} = {}) {
  if (!outDir) throw new Error("Creative diagnostics require --out.");
  const outputRoot = path.resolve(outDir);
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  if (candidatesDir)
    await copyCandidateSources(path.resolve(candidatesDir), outputRoot);
  if (repairDir)
    await copyRepairEvidence(path.resolve(repairDir), outputRoot);
  return outputRoot;
}

async function main() {
  const args = argsFrom(process.argv);
  const out = await prepareCreativeDiagnostics({
    candidatesDir: args.candidates,
    repairDir: args.repair,
    outDir: args.out,
  });
  console.log("creative_diagnostics=" + out);
}

if (import.meta.url === "file://" + process.argv[1]) await main();
