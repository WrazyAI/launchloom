import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { generateContextualAssets } from "./generate-contextual-assets.mjs";
import {
  loadA1ReferenceLibrary,
  mergeInspirationRegistries,
} from "./a1-reference-library.mjs";
import {
  buildBusinessVariationConfig,
  buildBusinessVariationPack,
} from "./business-variation-canary.mjs";
import { createReasoningPreflight } from "./reasoning-preflight-lib.mjs";
import { runRenderedCreativeRepair } from "./run-rendered-creative-repair.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_SCENARIO = "hvac";
const DEFAULT_MODEL = "openai/gpt-6-luna";

function cliArgs(argv) {
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

async function readFalKey(args) {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const keyFile = String(args["fal-key-file"] || "").trim();
  if (!keyFile)
    throw new Error(
      "FAL_KEY is required because this canary intentionally starts without client imagery.",
    );
  const firstLine = (await fs.readFile(path.resolve(keyFile), "utf8"))
    .split(/\r?\n/u)[0]
    .trim();
  const key = firstLine
    .replace(/^(?:FAL_(?:API_)?KEY)\s*[:=]\s*/iu, "")
    .replace(/^['"]|['"]$/gu, "")
    .trim();
  if (key.length < 12 || /\s/u.test(key))
    throw new Error("The first line of the supplied FAL key file is not a usable key.");
  return key;
}

async function copyClientSite(source, destination) {
  await fs.cp(source, destination, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      return !["node_modules", "dist", ".astro"].includes(first);
    },
  });
  await fs.symlink(
    path.join(source, "node_modules"),
    path.join(destination, "node_modules"),
    "dir",
  );
}

async function allocateOutput(args) {
  if (!args.out)
    return path.join(
      os.tmpdir(),
      `launchloom-business-variation-${crypto.randomUUID()}`,
    );
  const output = path.resolve(args.out);
  await fs.mkdir(path.dirname(output), { recursive: true });
  return output;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function stageReusableAssets(sourceDirectory, targetDirectory, manifestPath) {
  if (!sourceDirectory) return 0;
  const sourceRoot = path.resolve(sourceDirectory);
  const sourceManifestPath = path.join(sourceRoot, "generated-assets.json");
  const sourcePublic = path.join(sourceRoot, "public/images/generated");
  const manifest = JSON.parse(await fs.readFile(sourceManifestPath, "utf8"));
  if (manifest.provider !== "fal.ai" || !Array.isArray(manifest.placements))
    throw new Error("Reusable variation assets need a FAL-generated asset manifest.");
  await fs.mkdir(targetDirectory, { recursive: true });
  for (const placement of manifest.placements) {
    if (!placement.path?.startsWith("/images/generated/"))
      throw new Error("Reusable FAL asset manifest contains an unsafe asset path.");
    const fileName = path.basename(placement.path);
    const sourcePath = path.join(sourcePublic, fileName);
    const targetPath = path.join(targetDirectory, fileName);
    const sourceStat = await fs.lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink())
      throw new Error(`Reusable FAL image is missing or not a regular file: ${fileName}.`);
    await fs.copyFile(sourcePath, targetPath);
  }
  await writeJson(manifestPath, manifest);
  return manifest.placements.length;
}

async function readRegistry(root) {
  const base = JSON.parse(
    await fs.readFile(path.join(root, "data/inspiration-registry.json"), "utf8"),
  );
  const a1Path = path.join(root, "data/a1-reference-library.json");
  try {
    await fs.access(a1Path);
    return mergeInspirationRegistries(
      base,
      await loadA1ReferenceLibrary(a1Path, { repositoryRoot: root }),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return base;
    throw error;
  }
}

export async function runBusinessVariationCanary({
  repositoryRoot = process.cwd(),
  scenarioId = DEFAULT_SCENARIO,
  seed = `variation-${new Date().toISOString().replace(/[^0-9]/gu, "")}`,
  outputPath,
  falKey,
  reuseAssetsFrom = "",
  model = DEFAULT_MODEL,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const key = falKey || process.env.FAL_KEY;
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required for model-authored variation canaries.");
  if (!key && !reuseAssetsFrom)
    throw new Error("FAL_KEY is required to produce niche-matched canary imagery.");
  if (!outputPath)
    throw new Error("A new outputPath is required; canary artifacts are never overwritten.");

  const output = path.resolve(outputPath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output);
  const templateSite = path.join(root, "templates/client-site");
  const siteDir = path.join(output, "site");
  await copyClientSite(templateSite, siteDir);

  const registry = await readRegistry(root);
  const { scenario, pack } = buildBusinessVariationPack(
    root,
    registry,
    scenarioId,
    { seed },
  );
  const baseConfig = JSON.parse(
    await fs.readFile(path.join(templateSite, "src/site.config.json"), "utf8"),
  );
  const config = buildBusinessVariationConfig(baseConfig, scenarioId);
  const inspirationPath = path.join(output, "inspiration-pack.json");
  const configPath = path.join(output, "site.config.json");
  const assetDir = path.join(siteDir, "public/images/generated");
  const assetManifestPath = path.join(output, "generated-assets.json");
  const candidatesDir = path.join(siteDir, ".launchloom/generated-experiences");
  const reasoningPath = path.join(output, "reasoning-preflight.json");
  const repairOut = path.join(output, "creative-repair");
  const reportPath = path.join(output, "variation-report.json");
  const report = {
    version: 1,
    status: "running",
    hypotheticalBusiness: scenario.business.name,
    businessKind: scenario.industry,
    seed,
    model,
    authoringEffort: model === "openai/gpt-6-luna" ? "xhigh" : "provider-default",
    references: pack.routes.map((route) => ({
      id: route.referenceIds[0],
      name: route.referenceDossier.referenceName,
      familyId: route.referenceFamilyId,
      rendererFamilyId: route.familyId,
    })),
    promotionEnabled: false,
    deployment: "not-deployed",
  };
  await writeJson(inspirationPath, pack);
  await writeJson(path.join(output, "base-scenario.json"), config);

  try {
    const reusedAssetCount = await stageReusableAssets(
      reuseAssetsFrom,
      assetDir,
      assetManifestPath,
    );
    report.reusedAssetCount = reusedAssetCount;
    const assetResult = await generateContextualAssets({
      site: config,
      inspiration: pack,
      outputDir: assetDir,
      manifestPath: assetManifestPath,
      key: key || "",
      maxImages: 3,
      maxRequests: 6,
    });
    const expectedRouteIds = new Set(pack.routes.map((route) => route.id));
    const generatedHeroRouteIds = new Set(
      assetResult.manifest.placements
        .filter((placement) => placement.placement === "hero")
        .map((placement) => placement.routeId),
    );
    if (
      assetResult.manifest.placements.length < 3 ||
      [...expectedRouteIds].some((id) => !generatedHeroRouteIds.has(id))
    )
      throw new Error(
        `FAL did not create one route-directed hero image for each selected HVAC reference (generated ${assetResult.manifest.placements.length} image(s)). See generated-assets.json for provider diagnostics.`,
      );
    report.generatedImages = assetResult.manifest.placements.map((entry) => ({
      routeId: entry.routeId,
      placement: entry.placement,
      familyId: entry.familyId,
      reused: Boolean(entry.reused),
      width: entry.width,
      height: entry.height,
      sha256: entry.sha256,
    }));
    const renderedConfig = assetResult.site;
    await writeJson(configPath, renderedConfig);
    await fs.copyFile(configPath, path.join(siteDir, "src/site.config.json"));

    const creativeSession = await createReasoningPreflight({
      inspirationPack: pack,
      mode: "shadow",
      model: "jev-1.13.0",
      creativeModel: model,
      sessionKey: `business-variation-${scenarioId}-${seed}`,
    });
    await writeJson(reasoningPath, creativeSession);

    const authored = path.join(root, "scripts/author-production-experiences.mjs");
    await execFileAsync(
      process.execPath,
      [
        authored,
        "--config",
        configPath,
        "--inspiration",
        inspirationPath,
        "--out",
        candidatesDir,
        "--session",
        reasoningPath,
        "--failure-mode",
        "record",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CREATIVE_EXPERIENCE_MODEL: model,
        },
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    const creativeRunPath = path.join(candidatesDir, "creative-run.json");
    const creativeRun = await fs.readFile(creativeRunPath, "utf8").then(JSON.parse);
    report.authoredCandidates = (creativeRun.candidates || []).map((candidate) => ({
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      referenceFamilyId: candidate.referenceFamilyId,
      rendererFamilyId: candidate.familyId,
      referenceScore: candidate.creativeManifest?.referenceFidelity?.score ?? null,
    }));
    report.authoringFailures = creativeRun.failures || [];
    await writeJson(reportPath, report);
    if (!report.authoredCandidates.length)
      throw new Error(
        `No HVAC candidates survived authorship. ${report.authoringFailures.map((failure) => `${failure.routeId}: ${failure.error}`).join(" | ")}`,
      );

    const repairResult = await runRenderedCreativeRepair({
      siteDir,
      candidatesDir: path.relative(siteDir, candidatesDir),
      outDir: path.relative(siteDir, repairOut),
      mode: "preview",
      model,
      creativeSession,
      requireDiversity: false,
      visualGateScript: path.join(root, "scripts/visual-quality-gate.mjs"),
    });
    const selectedCandidate = repairResult.bakeoff.candidates.find(
      (candidate) => candidate.candidateId === repairResult.selectedCandidateId,
    );
    const selectedConfig = JSON.parse(
      await fs.readFile(path.join(siteDir, "src/site.config.json"), "utf8"),
    );
    const homepage = await fs.readFile(path.join(siteDir, "dist/index.html"), "utf8");
    const creativeHost = /data-creative-host/u.test(homepage);
    const creativeCandidate = /data-creative-candidate/u.test(homepage);
    if (selectedConfig.design?.experience?.renderer !== "creative-candidate")
      throw new Error("Variation preview did not select the creative-candidate renderer.");
    if (!creativeHost || !creativeCandidate)
      throw new Error("Variation preview HTML is missing creative host/candidate markers.");

    Object.assign(report, {
      status: repairResult.status,
      selectedCandidateId: repairResult.selectedCandidateId,
      selectedReferenceFamilyId: selectedCandidate?.referenceFamilyId || "",
      selectedRendererFamilyId: selectedCandidate?.familyId || "",
      renderer: selectedConfig.design.experience.renderer,
      creativeHost,
      creativeCandidate,
      legacyRendererUsed: false,
      renderedReferenceFidelity: selectedCandidate?.renderedReferenceFidelity || null,
      visualGate: repairResult.visualGate,
      visualDiversity: repairResult.bakeoff.visualDiversity,
      screenshots: {
        desktop: path.join(repairOut, "final/screenshots", `${repairResult.selectedCandidateId}-desktop.png`),
        compact: path.join(repairOut, "final/screenshots", `${repairResult.selectedCandidateId}-compact.png`),
        mobile: path.join(repairOut, "final/screenshots", `${repairResult.selectedCandidateId}-mobile.png`),
      },
      previewHtml: path.join(siteDir, "dist/index.html"),
    });
    await writeJson(reportPath, report);
    console.log(
      JSON.stringify({
        status: report.status,
        business: report.hypotheticalBusiness,
        businessKind: report.businessKind,
        references: report.references,
        authoredCandidates: report.authoredCandidates.length,
        selectedCandidateId: report.selectedCandidateId,
        selectedReferenceFamilyId: report.selectedReferenceFamilyId,
        renderer: report.renderer,
        referenceScore: report.renderedReferenceFidelity?.score || null,
        visualVerdict: report.visualGate?.audit?.verdict || null,
        diversityPass: report.visualDiversity?.pass ?? null,
        report: reportPath,
        screenshots: report.screenshots,
      }),
    );
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    await writeJson(reportPath, report);
    throw error;
  }
}

async function main() {
  const args = cliArgs(process.argv);
  const root = path.resolve(args.root || ".");
  const out = await allocateOutput(args);
  const report = await runBusinessVariationCanary({
    repositoryRoot: root,
    scenarioId: args.scenario || DEFAULT_SCENARIO,
    seed: args.seed || `variation-${new Date().toISOString().replace(/[^0-9]/gu, "")}`,
    outputPath: out,
    falKey: args["reuse-assets-from"] ? "" : await readFalKey(args),
    reuseAssetsFrom: args["reuse-assets-from"] || "",
    model: args.model || DEFAULT_MODEL,
  });
  if (report.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
