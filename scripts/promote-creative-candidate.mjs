import fs from "node:fs/promises";
import path from "node:path";
import { validateCandidateManifest } from "./creative-compiler.mjs";

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

function validateAuthoredFiles(candidateId, files) {
  const experience = files.experience;
  for (const marker of ["data-hero", "data-early-conversion", 'id="services"', 'id="faqs"', 'id="contact"'])
    if (!experience.includes(marker)) throw new Error(`Creative candidate ${candidateId} is missing ${marker}.`);
  if (!/from\s+["']@launchloom\/runtime["']/u.test(experience) || !/\bLeadForm\b/u.test(experience))
    throw new Error(`Creative candidate ${candidateId} must use the shared LeadForm runtime.`);
  if (/https?:\/\/|\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket)\b|\beval\s*\(|<script\b|—/iu.test(experience))
    throw new Error(`Creative candidate ${candidateId} contains an unsafe Experience.jsx primitive.`);
  if (/url\s*\(\s*["']?(?:https?:)?\/\//iu.test(files.styles) || /—/u.test(files.styles))
    throw new Error(`Creative candidate ${candidateId} contains an unsafe styles.css value.`);
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(/iu.test(files.motion) || !/reducedMotion|prefers-reduced-motion/u.test(files.motion))
    throw new Error(`Creative candidate ${candidateId} motion is missing safety or reduced-motion handling.`);
}

/**
 * @param {{siteDir?: string, candidateDir?: string, configPath?: string, visualScore?: number, distinctivenessScore?: number}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function promoteCreativeCandidate({
  siteDir = ".",
  candidateDir,
  configPath = "src/site.config.json",
  visualScore,
  distinctivenessScore,
} = {}) {
  if (!candidateDir) throw new Error("A candidate directory is required.");
  const root = path.resolve(siteDir);
  const source = path.resolve(root, candidateDir);
  const manifest = await readJson(path.join(source, "metadata.json"));
  const candidateManifest = validateCandidateManifest(manifest.creativeManifest || manifest);
  const required = ["Experience.jsx", "styles.css", "motion.js"];
  for (const file of required) await fs.access(path.join(source, file));
  const files = {
    experience: await fs.readFile(path.join(source, "Experience.jsx"), "utf8"),
    styles: await fs.readFile(path.join(source, "styles.css"), "utf8"),
    motion: await fs.readFile(path.join(source, "motion.js"), "utf8"),
  };
  validateAuthoredFiles(candidateManifest.candidateId, files);

  const selected = path.resolve(root, "src/generated-experiences/selected");
  await fs.mkdir(selected, { recursive: true });
  await Promise.all(
    required.map((file) => fs.copyFile(path.join(source, file), path.join(selected, file))),
  );
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
    contractHash: candidateManifest.routeFingerprint,
    fingerprint: candidateManifest.fingerprint,
    ...(Number.isFinite(visualScore) ? { visualScore } : {}),
    ...(Number.isFinite(distinctivenessScore) ? { distinctivenessScore } : {}),
    selectionMode: "creative-bakeoff",
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
  });
  console.log(JSON.stringify(result));
}
