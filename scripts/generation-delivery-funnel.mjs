#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_PROFILES = new Set(["full", "full-preview"]);
const DEFAULT_LIMIT = 20;

function hasWarnings(record) {
  if (record?.deliveryDecision === "warned") return true;
  if (Number.isSafeInteger(record?.deliveryWarningCount))
    return record.deliveryWarningCount > 0;
  return Array.isArray(record?.deliveryWarnings)
    ? record.deliveryWarnings.length > 0
    : false;
}

function hasPreview(record) {
  return Boolean(
    record?.previewUrl ||
      record?.previewDelivered === true ||
      record?.deliveryEvidence?.previewDelivered === true,
  );
}

function classifyDelivery(record) {
  if (record?.deliveryReportMissing === true) return "unknown";
  const status = record?.deliveryStatus;
  if (status === "preview_ready" || status === "published")
    return hasWarnings(record) ? "warned" : "clean";
  if (status === "attention")
    return hasPreview(record) ? "warned" : "unknown";
  if (status === "diagnostic") return "failed";
  if (status === "none" || status === undefined)
    return ["failed", "skipped"].includes(record?.executionStatus)
      ? "failed"
      : "unknown";
  return "unknown";
}

function eligible(record) {
  return Boolean(
    record &&
    FULL_PROFILES.has(record.profile) &&
    record.executionStatus !== "cancelled" &&
    record.fastLane !== true &&
    record.synthetic !== true &&
    record.test !== true,
  );
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

/**
 * Summarise the preview delivery funnel for full-profile generation attempts.
 *
 * Missing or contradictory delivery evidence counts as unknown, never as a
 * success. Cancelled, focused, fast-lane and synthetic records are excluded
 * from the denominator.
 *
 * @param {Array<Record<string, any>>} records
 * @param {{limit?: number}} [options]
 */
export function summariseDeliveryFunnel(records, { limit = DEFAULT_LIMIT } = {}) {
  const eligibleRecords = (Array.isArray(records) ? records : [])
    .filter(eligible)
    .sort(
      (left, right) =>
        Number(right.startedAt ?? right.createdAt ?? 0) -
        Number(left.startedAt ?? left.createdAt ?? 0),
    )
    .slice(0, Math.max(1, limit));

  const counts = { clean: 0, warned: 0, failed: 0, unknown: 0 };
  const durations = [];
  for (const record of eligibleRecords) {
    const outcome = classifyDelivery(record);
    counts[outcome] += 1;
    if (outcome !== "clean" && outcome !== "warned") continue;
    const startedAt = Number(record.startedAt);
    const completedAt = Number(record.completedAt);
    if (
      Number.isFinite(startedAt) &&
      Number.isFinite(completedAt) &&
      completedAt >= startedAt
    )
      durations.push((completedAt - startedAt) / 60_000);
  }

  return {
    eligible: eligibleRecords.length,
    delivered: counts.clean + counts.warned,
    clean: counts.clean,
    warned: counts.warned,
    failed: counts.failed,
    unknown: counts.unknown,
    p50Minutes: percentile(durations, 0.5),
    p90Minutes: percentile(durations, 0.9),
  };
}

async function readApi(base) {
  const cookie = String(process.env.LAUNCHLOOM_ADMIN_COOKIE || "").trim();
  if (!cookie)
    throw new Error(
      "LAUNCHLOOM_ADMIN_COOKIE is required for a live delivery-funnel read.",
    );
  const url = new URL(
    "/api/admin/onboarding-invites/workspace/attempts",
    base.replace(/\/?$/u, "/"),
  );
  url.searchParams.set("limit", "100");
  const response = await fetch(url, {
    headers: { cookie, accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Admin generations API returned HTTP ${response.status}.`);
  const body = await response.json();
  const items = Array.isArray(body) ? body : body?.items;
  if (!Array.isArray(items))
    throw new Error("Admin generations API did not return an attempt list.");
  return items;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!["input", "api", "limit"].includes(key))
      throw new Error(`Unknown option: ${token}`);
    const value = String(argv[index + 1] || "");
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (Boolean(args.input) === Boolean(args.api))
    throw new Error("Choose exactly one of --input or --api.");
  const records = args.input
    ? JSON.parse(await fs.readFile(path.resolve(args.input), "utf8"))
    : await readApi(args.api);
  const summary = summariseDeliveryFunnel(records, {
    limit: Number.parseInt(args.limit || "20", 10) || 20,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
