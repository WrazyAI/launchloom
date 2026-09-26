import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeInspirationRegistries } from "./a1-reference-library.mjs";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import {
  compatibilityScore,
  normalizeGoldReferenceLibrary,
} from "./gold-reference-library.mjs";

export function argsFrom(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--"))
      throw new Error(`Expected a --flag at argument ${index - 1}.`);
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}.`);
    args[flag.slice(2)] = value;
  }
  return args;
}

function words(value) {
  return [
    ...new Set(
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, " ")
        .split(/\s+/u)
        .filter((word) => word.length > 2),
    ),
  ];
}

function directIndustry(record, benchmarkCase) {
  const industry = String(benchmarkCase.industry || "").toLowerCase();
  const businessKind = String(benchmarkCase.businessKind || "").toLowerCase();
  return (
    record.industries.includes(industry) ||
    record.industries.includes(businessKind)
  );
}

function candidateScore(record, benchmarkCase) {
  const styleTerms = words(benchmarkCase.styleBrief);
  const hypothesis = record.designHypothesis || {};
  const searchable = new Set(
    words(
      [
        record.name,
        ...record.industries,
        ...record.moods,
        ...record.tags,
        record.proposedFamilyId,
        hypothesis.navigation,
        hypothesis.heroGeometry,
        hypothesis.servicePresentation,
        hypothesis.sectionRhythm,
        hypothesis.typographyCategory,
        hypothesis.imageStrategy,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const styleFit = styleTerms.reduce(
    (score, term) => score + (searchable.has(term) ? 6 : 0),
    0,
  );
  return (
    (directIndustry(record, benchmarkCase) ? 40 : 0) +
    compatibilityScore(record, { compatibility: benchmarkCase.compatibility }) +
    styleFit
  );
}

function selectGoldCandidates(records, benchmarkCase, count = 3) {
  const ranked = records
    .map((record) => ({
      record,
      score: candidateScore(record, benchmarkCase),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.id.localeCompare(right.record.id),
    );
  const selected = [];
  const families = new Set();
  for (const candidate of ranked) {
    if (families.has(candidate.record.proposedFamilyId)) continue;
    selected.push(candidate);
    families.add(candidate.record.proposedFamilyId);
    if (selected.length === count) break;
  }
  if (selected.length < count) {
    for (const candidate of ranked) {
      if (
        selected.some((item) => item.record.id === candidate.record.id)
      )
        continue;
      selected.push(candidate);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function baselinePack(benchmarkCase, registry) {
  const styleTerms = words(benchmarkCase.styleBrief);
  try {
    return buildInspirationPack(
      {
        seed: `gold-benchmark:${benchmarkCase.id}`,
        industry: benchmarkCase.industry,
        styleTerms,
        styleText: benchmarkCase.styleBrief,
        compatibility: benchmarkCase.compatibility,
        recentReferenceIds: [],
        recentFamilyIds: [],
        recentRouteSignatures: [],
      },
      registry,
    );
  } catch (error) {
    return {
      routes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function metrics(results) {
  const baselineSelections = results.flatMap(
    (result) => result.baseline.referenceIds,
  );
  const goldSelections = results.flatMap(
    (result) => result.gold.referenceIds,
  );
  return {
    cases: results.length,
    baseline: {
      completeSelectionRate:
        results.filter((result) => result.baseline.referenceIds.length === 3)
          .length / Math.max(1, results.length),
      uniqueReferences: new Set(baselineSelections).size,
      directIndustryTop1Rate:
        results.filter((result) => result.baseline.top1DirectIndustry).length /
        Math.max(1, results.length),
      uniqueFamilies: new Set(
        results.flatMap((result) => result.baseline.familyIds),
      ).size,
    },
    goldCandidates: {
      completeSelectionRate:
        results.filter((result) => result.gold.referenceIds.length === 3)
          .length / Math.max(1, results.length),
      uniqueReferences: new Set(goldSelections).size,
      directIndustryTop1Rate:
        results.filter((result) => result.gold.top1DirectIndustry).length /
        Math.max(1, results.length),
      uniqueFamilies: new Set(
        results.flatMap((result) => result.gold.familyIds),
      ).size,
      highAssetDemandOnLowAssetCases: results.filter(
        (result) => result.gold.highAssetDemandOnLowAssets,
      ).length,
    },
  };
}

export async function runGoldReferenceBenchmark({
  benchmarkPath = "data/gold-reference-benchmark.json",
  goldCatalogPath = "data/gold-reference-candidates.json",
  registryPath = "data/inspiration-registry.json",
  a1Path = "data/a1-reference-library.json",
  repositoryRoot = process.cwd(),
} = {}) {
  const [benchmark, goldRaw, registry, a1] = await Promise.all([
    fs
      .readFile(path.resolve(repositoryRoot, benchmarkPath), "utf8")
      .then(JSON.parse),
    fs
      .readFile(path.resolve(repositoryRoot, goldCatalogPath), "utf8")
      .then(JSON.parse),
    fs
      .readFile(path.resolve(repositoryRoot, registryPath), "utf8")
      .then(JSON.parse),
    fs
      .readFile(path.resolve(repositoryRoot, a1Path), "utf8")
      .then(JSON.parse),
  ]);
  const gold = normalizeGoldReferenceLibrary(goldRaw);
  const baselineRegistry = mergeInspirationRegistries(registry, a1);
  const results = benchmark.cases.map((benchmarkCase) => {
    const baseline = baselinePack(benchmarkCase, baselineRegistry);
    const goldSelected = selectGoldCandidates(
      gold.records,
      benchmarkCase,
      3,
    );
    const baselineRecords = baseline.routes.map((route) =>
      baselineRegistry.records.find(
        (record) => record.id === route.referenceIds?.[0],
      ),
    );
    return {
      id: benchmarkCase.id,
      name: benchmarkCase.name,
      industry: benchmarkCase.industry,
      compatibility: benchmarkCase.compatibility,
      baseline: {
        referenceIds: baseline.routes.flatMap(
          (route) => route.referenceIds || [],
        ),
        familyIds: baseline.routes
          .map((route) => route.familyId)
          .filter(Boolean),
        top1DirectIndustry: baselineRecords[0]
          ? directIndustry(baselineRecords[0], benchmarkCase)
          : false,
        error: baseline.error || null,
      },
      gold: {
        referenceIds: goldSelected.map(
          (candidate) => candidate.record.id,
        ),
        familyIds: goldSelected.map(
          (candidate) => candidate.record.proposedFamilyId,
        ),
        scores: goldSelected.map(
          (candidate) => Math.round(candidate.score * 10) / 10,
        ),
        top1DirectIndustry: goldSelected[0]
          ? directIndustry(goldSelected[0].record, benchmarkCase)
          : false,
        highAssetDemandOnLowAssets:
          benchmarkCase.compatibility?.assetAvailability === "low" &&
          goldSelected.some(
            (candidate) =>
              candidate.record.feasibility.assetDemand === "high",
          ),
      },
    };
  });
  return {
    version: 1,
    benchmarkVersion: benchmark.version,
    benchmarkUpdatedAt: benchmark.updatedAt,
    note:
      "This is a zero-API selection and feasibility benchmark. It does not replace the rendered Luna reference-fidelity benchmark required before Gold admission.",
    metrics: metrics(results),
    results,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = argsFrom(process.argv);
  const report = await runGoldReferenceBenchmark({
    benchmarkPath: args.benchmark || "data/gold-reference-benchmark.json",
    goldCatalogPath:
      args.catalog || "data/gold-reference-candidates.json",
    registryPath: args.registry || "data/inspiration-registry.json",
    a1Path: args["a1-library"] || "data/a1-reference-library.json",
    repositoryRoot: path.resolve(args.root || "."),
  });
  if (args.out) {
    const output = path.resolve(args.out);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}
