import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Repair cost evidence is discovered by walking an evidence root, and the
 * producer deliberately copies a round's `visual-gate.json` into
 * `final/visual-gate.json` after the gate passes. Both files describe one paid
 * gate call, so counting both doubles the repair stage and can falsely mark a
 * fully priced run complete.
 *
 * Identity is content plus explicit provenance, never amount alone:
 * - the same resolved file discovered through two roots is one file;
 * - a `final/visual-gate.json` is a copy only when it lives in the same evidence
 *   root as a discovered `round-NN/visual-gate.json` with identical canonical
 *   content, which is exactly the pairing the producer writes;
 * - any other report stays a separate paid call, including reports in separate
 *   round directories, the distinct revision gates and a final copy whose round
 *   report was not discovered (for example a near-miss report outside the
 *   discovered name pattern);
 * - an empty source path is unknown, never the process working directory;
 * - unreadable reports carry no cost evidence and never suppress a readable one.
 */

const ROUND_DIRECTORY = /^round-\d+$/u;

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

function segmentsOf(value) {
  return typeof value === "string"
    ? value.split(/[\\/]+/u).filter(Boolean)
    : [];
}

function entrySegments(file) {
  const name = segmentsOf(file?.name);
  return name.length ? name : segmentsOf(file?.sourcePath);
}

/**
 * The producer's exact copy destination: `<evidence root>/final/visual-gate.json`.
 * A directory merely named `final` elsewhere is not a copy destination.
 */
export function isCopiedGateReport(file) {
  const parts = entrySegments(file);
  if (parts.length < 2) return false;
  return parts.at(-1) === "visual-gate.json" && parts.at(-2) === "final";
}

function isRoundGateReport(file) {
  const parts = entrySegments(file);
  if (parts.length < 2) return false;
  return (
    parts.at(-1) === "visual-gate.json" && ROUND_DIRECTORY.test(parts.at(-2))
  );
}

function resolvedDirectory(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.resolve(value);
}

/**
 * Drop only cost evidence that provably restates another discovered report.
 * Returns the evidence in discovery order plus the ignored copies for audit.
 */
export function dedupeRepairGateEvidence(files) {
  const evidence = Array.isArray(files) ? files.slice() : [];
  if (evidence.length < 2) return { evidence, duplicates: [] };

  const seenPaths = new Map();
  const entries = evidence.map((file, index) => {
    const report = file?.report;
    const comparable =
      Boolean(report) && typeof report === "object" && !Array.isArray(report);
    return {
      index,
      file,
      sourcePath: resolvedDirectory(file?.sourcePath),
      root: resolvedDirectory(file?.root),
      digest: comparable ? costEvidenceDigest(report) : null,
      copy: isCopiedGateReport(file),
      round: isRoundGateReport(file),
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

  // Explicit copy provenance: the copy restates a round report in its own
  // evidence root. Identical content alone never proves a restatement.
  const roundReports = kept.filter(
    (entry) => entry.round && !entry.copy && entry.digest,
  );
  for (const entry of kept) {
    if (!entry.copy || !entry.digest) continue;
    const original = roundReports.find(
      (candidate) =>
        candidate.root === entry.root && candidate.digest === entry.digest,
    );
    if (original) dropped.set(entry.index, original.file?.name ?? null);
  }

  if (!dropped.size) return { evidence, duplicates: [] };
  return {
    evidence: entries
      .filter((entry) => !dropped.has(entry.index))
      .map((entry) => entry.file),
    duplicates: entries
      .filter((entry) => dropped.has(entry.index))
      .map((entry) => ({
        name: entry.file?.name ?? null,
        duplicateOf: dropped.get(entry.index),
      })),
  };
}
