import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Repair cost evidence is discovered by walking an evidence root, and the
 * producer deliberately copies a round's `visual-gate.json` into
 * `final/visual-gate.json` after the gate passes. Both files describe one paid
 * gate call, so counting both doubles the repair stage and can falsely mark a
 * fully priced run complete.
 *
 * Identity is content plus provenance, never amount alone:
 * - the same resolved file discovered through two roots is one file;
 * - a byte-equivalent (canonicalized) report in a `final/` copy destination is
 *   the copy of an already discovered report, so it adds no paid call;
 * - reports in separate round directories stay separate paid calls even when
 *   their amounts, or their whole content, happen to match;
 * - unreadable reports carry no cost evidence and are never used to suppress a
 *   readable report.
 */

const GATE_REPORT_NAME = /^visual-gate.*\.json$/u;

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

/**
 * A `final/` visual gate report is the producer's copy destination, not a
 * separate gate invocation.
 */
export function isCopiedGateReport(file) {
  const name = segmentsOf(file?.name);
  const source = segmentsOf(file?.sourcePath);
  const parts = name.length ? name : source;
  if (!parts.length) return false;
  if (!GATE_REPORT_NAME.test(parts.at(-1) ?? "")) return false;
  return parts.slice(0, -1).includes("final");
}

/**
 * Drop only cost evidence that provably restates another discovered report.
 * Returns the evidence in discovery order plus the ignored copies for audit.
 */
export function dedupeRepairGateEvidence(files) {
  const evidence = Array.isArray(files) ? files.slice() : [];
  if (evidence.length < 2) return { evidence, duplicates: [] };

  const seenPaths = new Map();
  const groups = new Map();
  const entries = evidence.map((file, index) => {
    const report = file?.report;
    const comparable =
      Boolean(report) && typeof report === "object" && !Array.isArray(report);
    const sourcePath =
      typeof file?.sourcePath === "string"
        ? path.resolve(file.sourcePath)
        : null;
    return {
      index,
      file,
      sourcePath,
      digest: comparable ? costEvidenceDigest(report) : null,
      copied: isCopiedGateReport(file),
    };
  });

  const dropped = new Map();
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
    if (entry.digest === null) continue;
    const group = groups.get(entry.digest) ?? [];
    group.push(entry);
    groups.set(entry.digest, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const originals = group.filter((entry) => !entry.copied);
    const copies = group.filter((entry) => entry.copied);
    // Identical reports in separate round directories are separate paid calls;
    // only the copied destination is redundant.
    if (originals.length) {
      for (const copy of copies)
        dropped.set(copy.index, originals[0].file?.name ?? null);
    } else {
      for (const copy of copies.slice(1))
        dropped.set(copy.index, copies[0].file?.name ?? null);
    }
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
