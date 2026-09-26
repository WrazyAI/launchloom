import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  goldReferenceEligibility,
  loadGoldReferenceLibrary,
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

export async function auditGoldReferenceLibrary({
  catalog = "data/gold-reference-candidates.json",
  repositoryRoot = process.cwd(),
} = {}) {
  const catalogPath = path.resolve(repositoryRoot, catalog);
  const library = await loadGoldReferenceLibrary(catalogPath);
  const statusCounts = {};
  const industryCounts = {};
  const familyCounts = {};
  const rows = [];

  for (const record of library.records) {
    statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
    familyCounts[record.proposedFamilyId || "unassigned"] =
      (familyCounts[record.proposedFamilyId || "unassigned"] || 0) + 1;
    for (const industry of record.industries)
      industryCounts[industry] = (industryCounts[industry] || 0) + 1;

    const eligibility = await goldReferenceEligibility(record, {
      repositoryRoot,
    });
    rows.push({
      id: record.id,
      status: record.status,
      sourceUrl: record.sourceUrl,
      familyId: record.proposedFamilyId,
      assetDemand: record.feasibility.assetDemand,
      productionEligible: eligibility.eligible,
      blockers: eligibility.reasons,
    });
  }

  return {
    version: 1,
    catalogVersion: library.version,
    updatedAt: library.updatedAt,
    total: library.records.length,
    productionEligible: rows.filter((row) => row.productionEligible).length,
    statusCounts,
    familyCounts,
    industryCounts,
    records: rows,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = argsFrom(process.argv);
  const report = await auditGoldReferenceLibrary({
    catalog: args.catalog || "data/gold-reference-candidates.json",
    repositoryRoot: path.resolve(args.root || "."),
  });
  console.log(JSON.stringify(report, null, 2));
  if (
    args["require-approved"] === "true" &&
    report.productionEligible === 0
  )
    process.exitCode = 1;
}
