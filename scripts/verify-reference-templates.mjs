#!/usr/bin/env node
import fs from "node:fs";
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
const summary = entries.reduce(
  (accumulator, entry) => {
    accumulator[entry.status] = (accumulator[entry.status] || 0) + 1;
    return accumulator;
  },
  { extracted: 0, pending: 0, unavailable: 0, failed: 0 },
);

if (!index) {
  problems.push(`Missing template index: ${path.relative(root, indexPath)}.`);
} else {
  if (index.schemaVersion !== 1)
    problems.push("Template index schemaVersion must be 1.");
  if (index.id !== "launchloom-reference-templates")
    problems.push("Template index id is incorrect.");
  if (!Array.isArray(index.entries)) {
    problems.push("Template index entries must be an array.");
  }
  const indexed = new Map(
    (Array.isArray(index.entries) ? index.entries : []).map((entry) => [
      entry.id,
      entry,
    ]),
  );
  if (!Array.isArray(index.entries) || index.entries.length !== entries.length)
    problems.push(
      `Template index has ${Array.isArray(index.entries) ? index.entries.length : 0} entries; the library has ${entries.length} dossiers.`,
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
  for (const candidate of Array.isArray(index.entries) ? index.entries : []) {
    if (!entries.some((entry) => entry.id === candidate.id))
      problems.push(`Template index lists unknown dossier '${candidate.id}'.`);
  }
  if (JSON.stringify(index.summary || null) !== JSON.stringify(summary))
    problems.push("Template index summary does not match retained templates.");
}

for (const entry of entries) {
  const briefPath = path.join(root, entry.dossierPath, "pack-brief.json");
  if (!fs.existsSync(briefPath)) continue;
  try {
    const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
    if (brief.dossierId !== entry.id)
      problems.push(`Pack brief for '${entry.id}' has the wrong dossierId.`);
    if (entry.status !== "extracted" || brief.templateDigest !== entry.digest)
      problems.push(`Pack brief for '${entry.id}' is not bound to its template digest.`);
  } catch (error) {
    problems.push(`Pack brief for '${entry.id}' is not valid JSON: ${error.message}.`);
  }
}
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
