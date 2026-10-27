import fs from "node:fs";
import path from "node:path";
import { compileSourceFoundation } from "./compile-source-foundation.mjs";
import { listReferenceTemplateEntries } from "./reference-template.mjs";

export const FOUNDATION_INDEX_ID = "launchloom-foundations";

function indexEntry({
  id,
  dossierPath,
  status,
  compatibility,
  sourceDigest = null,
  sectionCount = 0,
  slotCount = 0,
  interactionCount = 0,
  blockers = [],
}) {
  return {
    id,
    dossierPath,
    status,
    compatibility,
    sourceDigest,
    sectionCount,
    slotCount,
    interactionCount,
    blockerCount: blockers.length,
    blockers,
  };
}

function summarize(entries) {
  return {
    total: entries.length,
    renderable: entries.filter((entry) => entry.compatibility === "renderable")
      .length,
    needsAdaptation: entries.filter(
      (entry) => entry.compatibility === "needs-adaptation",
    ).length,
    blocked: entries.filter((entry) => entry.compatibility === "blocked")
      .length,
  };
}

function comparable(index) {
  return JSON.stringify({
    schemaVersion: index.schemaVersion,
    id: index.id,
    summary: index.summary,
    entries: index.entries,
  });
}

export function buildFoundationIndex({
  repositoryRoot = process.cwd(),
  write = false,
  check = false,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const entries = listReferenceTemplateEntries(root);
  const results = [];

  for (const entry of entries) {
    if (entry.status !== "extracted") {
      results.push(
        indexEntry({
          id: entry.id,
          dossierPath: entry.dossierPath,
          status: entry.status,
          compatibility: "blocked",
          sourceDigest: entry.digest,
          blockers: [
            {
              code: `template-${entry.status}`,
              message:
                entry.reason ||
                `No extracted template is available for '${entry.id}'.`,
            },
          ],
        }),
      );
      continue;
    }
    const outputDirectory = path.join(root, entry.dossierPath, "foundation");
    try {
      const result = compileSourceFoundation({
        repositoryRoot: root,
        dossierId: entry.id,
        outputDirectory,
        write,
      });
      results.push(
        indexEntry({
          id: entry.id,
          dossierPath: entry.dossierPath,
          status: entry.status,
          compatibility: result.manifest.compatibility,
          sourceDigest: result.manifest.sourceDigest,
          sectionCount: result.manifest.sections.length,
          slotCount: result.manifest.slots.length,
          interactionCount: result.manifest.interactions.length,
          blockers: result.manifest.blockers,
        }),
      );
    } catch (error) {
      results.push(
        indexEntry({
          id: entry.id,
          dossierPath: entry.dossierPath,
          status: entry.status,
          compatibility: "blocked",
          sourceDigest: entry.digest,
          blockers: [
            {
              code: "compile-failed",
              message: String(error?.message || error).slice(0, 1000),
            },
          ],
        }),
      );
    }
  }

  const index = {
    schemaVersion: 1,
    id: FOUNDATION_INDEX_ID,
    updatedAt: new Date().toISOString(),
    policy:
      "Source-derived foundations preserve composition and mechanics; sealed client content replaces all source copy, imagery, and demo facts.",
    summary: summarize(results),
    entries: results,
  };
  const indexPath = path.join(
    root,
    "data/reference-library/foundation-index.json",
  );
  if (check) {
    if (!fs.existsSync(indexPath))
      throw new Error(
        `Foundation index is missing: ${indexPath}. Run the compiler with --write.`,
      );
    const existing = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (comparable(existing) !== comparable(index))
      throw new Error(
        "Foundation index is stale. Run node scripts/compile-source-foundations.mjs --all --write.",
      );
  }
  if (write) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    const temporaryPath = `${indexPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`);
    fs.renameSync(temporaryPath, indexPath);
  }
  return index;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all) {
    console.error(
      "Usage: node scripts/compile-source-foundations.mjs --all [--write] [--check]",
    );
    process.exit(2);
  }
  try {
    const index = buildFoundationIndex({
      write: Boolean(args.write),
      check: Boolean(args.check),
    });
    console.log(
      JSON.stringify(
        {
          id: index.id,
          summary: index.summary,
          blocked: index.entries
            .filter((entry) => entry.compatibility === "blocked")
            .map((entry) => ({
              id: entry.id,
              status: entry.status,
              blockers: entry.blockers,
            })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `foundation_index_failed reason=${String(error?.message || error)}`,
    );
    process.exit(1);
  }
}
