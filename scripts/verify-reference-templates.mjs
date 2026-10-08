#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listReferenceTemplateEntries,
  readReferenceTemplateIndex,
  referenceTemplateIndexPath,
} from "./reference-template.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const json = process.argv.includes("--json");

const entries = listReferenceTemplateEntries(root);
const indexPath = referenceTemplateIndexPath(root);
const index = readReferenceTemplateIndex(root);
const problems = [];

if (!index) {
  problems.push(`Missing template index: ${path.relative(root, indexPath)}.`);
} else {
  const indexed = new Map(index.entries.map((entry) => [entry.id, entry]));
  if (index.entries.length !== entries.length)
    problems.push(
      `Template index has ${index.entries.length} entries; the library has ${entries.length} dossiers.`,
    );
  for (const entry of entries) {
    const candidate = indexed.get(entry.id);
    if (!candidate) {
      problems.push(`Template index is missing '${entry.id}'.`);
      continue;
    }
    for (const field of [
      "status",
      "method",
      "digest",
      "entrypoint",
      "fileCount",
      "totalBytes",
      "rights",
      "retrievedAt",
      "reason",
    ]) {
      if (
        JSON.stringify(candidate[field] ?? null) !==
        JSON.stringify(entry[field] ?? null)
      )
        problems.push(
          `Template index entry '${entry.id}' field '${field}' does not match the retained extraction.`,
        );
    }
  }
  for (const candidate of index.entries) {
    if (!entries.some((entry) => entry.id === candidate.id))
      problems.push(`Template index lists unknown dossier '${candidate.id}'.`);
  }
}

const summary = entries.reduce(
  (accumulator, entry) => {
    accumulator[entry.status] = (accumulator[entry.status] || 0) + 1;
    return accumulator;
  },
  { extracted: 0, pending: 0, unavailable: 0, failed: 0 },
);
const report = {
  dossiers: entries.length,
  summary,
  problems,
};
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `reference_templates dossiers=${report.dossiers} extracted=${summary.extracted} pending=${summary.pending} unavailable=${summary.unavailable} failed=${summary.failed} problems=${problems.length}`,
  );
  for (const problem of problems) console.log(`problem: ${problem}`);
}
if (problems.length) process.exitCode = 1;
