import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Repair cost evidence is discovered by walking an evidence root, and the
 * producer deliberately copies a round's gate report into
 * `final/visual-gate.json` after the gate passes or a near-miss candidate is
 * promoted. Both files describe one paid gate call, so counting both doubles
 * the repair stage and can falsely mark a fully priced run complete.
 *
 * Identity is content plus explicit provenance, never amount alone:
 * - the same resolved file discovered through two roots is one file;
 * - a `final/visual-gate.json` is a copy only when it sits at exactly that
 *   relative depth under the same evidence root as a discovered
 *   `round-NN/visual-gate.json` or `round-NN/near-miss-visual-gate.json` with
 *   identical canonical content, which is exactly the pairing the producer
 *   writes;
 * - any other report stays a separate paid call, including reports in separate
 *   round directories, the distinct revision gates, nested archive copies, and
 *   a final copy whose round report was not discovered;
 * - entries without a known root are never paired by name alone;
 * - an empty source path is unknown, never the process working directory;
 * - unreadable reports carry no cost evidence and never suppress a readable one.
 */

const ROUND_DIRECTORY = /^round-\d+$/u;
const GATE_REPORT_NAME = /^(?:near-miss-)?visual-gate\.json$/u;
const GATE_EVIDENCE_NAME =
  /^(?:near-miss-)?visual-gate(?:-[a-z0-9]+)*\.json$/iu;
const CONFIG_NAME = /config\.json$/iu;

/** Gate report names the cost collector reads, excluding staged config files. */
export function isGateEvidenceName(name) {
  return (
    typeof name === "string" &&
    GATE_EVIDENCE_NAME.test(name) &&
    !CONFIG_NAME.test(name)
  );
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

/** Stable digest of parsed evidence, independent of key order or whitespace. */
export function costEvidenceDigest(report) {
  return createHash("sha256").update(canonical(report)).digest("hex");
}

function splitRelative(value) {
  return typeof value === "string"
    ? value.split(/[\\/]+/u).filter(Boolean)
    : [];
}

function resolvedDirectory(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.resolve(value);
}

/**
 * Root-relative name used for provenance. A known root and source path are
 * authoritative; otherwise the caller-provided name is used as-is.
 */
function relativeSegments(file, root) {
  if (root && typeof file?.sourcePath === "string" && file.sourcePath.trim())
    return splitRelative(path.relative(root, path.resolve(file.sourcePath)));
  return splitRelative(file?.name);
}

/** The producer's exact copy destination: `final/visual-gate.json` at depth 2. */
export function isCopiedGateReport(file, root = null) {
  const parts = relativeSegments(file, resolvedDirectory(root ?? file?.root));
  return (
    parts.length === 2 &&
    parts[0] === "final" &&
    parts[1] === "visual-gate.json"
  );
}

function isRoundGateReport(file, root) {
  const parts = relativeSegments(file, root);
  return (
    parts.length === 2 &&
    ROUND_DIRECTORY.test(parts[0]) &&
    GATE_REPORT_NAME.test(parts[1])
  );
}

/**
 * Drop only cost evidence that provably restates another discovered report.
 * Returns the evidence in discovery order plus the unique ignored copies.
 */
export function dedupeRepairGateEvidence(files) {
  const evidence = Array.isArray(files) ? files.slice() : [];
  if (evidence.length < 2) return { evidence, duplicates: [] };

  const seenPaths = new Map();
  const entries = evidence.map((file, index) => {
    const report = file?.report;
    const comparable =
      Boolean(report) && typeof report === "object" && !Array.isArray(report);
    const root = resolvedDirectory(file?.root);
    return {
      index,
      file,
      root,
      sourcePath: resolvedDirectory(file?.sourcePath),
      digest: comparable ? costEvidenceDigest(report) : null,
      copy: isCopiedGateReport(file, root),
      round: isRoundGateReport(file, root),
    };
  });

  const dropped = new Map();
  const kept = [];
  for (const entry of entries) {
    // The same physical file can be reached through overlapping roots.
    if (entry.sourcePath) {
      const seen = seenPaths.get(entry.sourcePath);
      if (seen) {
        dropped.set(entry.index, seen.file?.name ?? entry.sourcePath);
        continue;
      }
      seenPaths.set(entry.sourcePath, entry);
    }
    kept.push(entry);
  }

  // Explicit copy provenance: same known root, exact round-report depth, and
  // identical canonical content. Identical content alone proves nothing.
  const roundReports = kept.filter(
    (entry) => entry.root && entry.round && !entry.copy && entry.digest,
  );
  for (const entry of kept) {
    if (!entry.copy || !entry.root || !entry.digest) continue;
    const original = roundReports.find(
      (candidate) =>
        candidate.root === entry.root && candidate.digest === entry.digest,
    );
    if (original) dropped.set(entry.index, original.file?.name ?? null);
  }

  if (!dropped.size) return { evidence, duplicates: [] };
  const duplicates = [];
  const counted = new Set();
  for (const entry of entries) {
    if (!dropped.has(entry.index)) continue;
    const key = entry.sourcePath ?? `${entry.root ?? ""}:${entry.file?.name}`;
    if (counted.has(key)) continue;
    counted.add(key);
    duplicates.push({
      name: entry.file?.name ?? null,
      duplicateOf: dropped.get(entry.index),
    });
  }
  return {
    evidence: entries
      .filter((entry) => !dropped.has(entry.index))
      .map((entry) => entry.file),
    duplicates,
  };
}
