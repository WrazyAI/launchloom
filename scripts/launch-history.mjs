import fs from "node:fs/promises";
import path from "node:path";
import { businessKindMatches } from "./inspiration-registry.mjs";

const HISTORY_PER_KIND_LIMIT = 30;
const UNKNOWN_KIND_HISTORY_LIMIT = 50;
const HISTORY_LIMIT = 500;

export function defaultHistoryPath() {
  return path.join(import.meta.dirname, "..", "data", "recent-launch-signatures.json");
}

export function emptyLaunchHistory() {
  return { version: 1, updatedAt: null, launches: [] };
}

export async function readLaunchHistory(historyPath = defaultHistoryPath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(historyPath, "utf8"));
    return {
      version: 1,
      updatedAt: parsed.updatedAt || null,
      launches: Array.isArray(parsed.launches) ? parsed.launches : [],
    };
  } catch {
    return emptyLaunchHistory();
  }
}

export function recentLayoutFingerprints(history) {
  return [
    ...new Set(
      (history?.launches || [])
        .map((launch) => String(launch.layoutFingerprint || "").trim())
        .filter(Boolean),
    ),
  ];
}

function slug(value) {
  return String(value || "launch")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "")
    .slice(0, 60);
}

function cleanList(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .filter((item) => item !== null && item !== undefined)
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
  ].sort();
}

export function launchRecordFrom({
  config,
  inspiration,
  launchedAt = new Date().toISOString(),
  stage = "preview",
}) {
  const experience = config?.design?.experience || {};
  const packId = String(experience.packId || "").trim();
  const variantId = String(experience.variantId || "standard").trim();
  const fingerprint = String(experience.fingerprint || "").trim();
  if (!packId || !fingerprint)
    throw new Error("A launch record needs a pack id and layout fingerprint.");
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  const businessName = String(config?.business?.name || "").trim();
  const timestampId = launchedAt.replace(/[^0-9]/gu, "");
  return {
    id: `${timestampId}-${slug(businessName)}`,
    launchedAt,
    stage: stage === "production" ? "production" : "preview",
    businessName,
    businessKind: String(
      inspiration?.request?.industry || config?.businessKind || config?.industry || "",
    ).trim().toLowerCase(),
    generationId: String(inspiration?.request?.generationId || "").trim() || undefined,
    inspirationSeed: String(inspiration?.request?.seed || "").trim() || undefined,
    recipe: String(config?.design?.recipe || "").trim(),
    packId,
    variantId,
    layoutFingerprint: fingerprint,
    referenceIds: cleanList(
      routes.flatMap((route) => [
        route.referenceId,
        ...(Array.isArray(route.referenceIds) ? route.referenceIds : []),
      ]),
    ),
    routeSignatures: cleanList(routes.map((route) => route.signature)),
  };
}

function boundedLaunchHistory(launches) {
  const countsByKind = new Map();
  let unknownKindCount = 0;
  const retained = [];
  for (const launch of [...launches].reverse()) {
    const businessKind = String(launch.businessKind || "").trim().toLowerCase();
    if (businessKind) {
      const count = countsByKind.get(businessKind) || 0;
      if (count >= HISTORY_PER_KIND_LIMIT) continue;
      countsByKind.set(businessKind, count + 1);
    } else {
      if (unknownKindCount >= UNKNOWN_KIND_HISTORY_LIMIT) continue;
      unknownKindCount += 1;
    }
    retained.push(launch);
    if (retained.length >= HISTORY_LIMIT) break;
  }
  return retained.reverse();
}

export function referenceSelectionContext(history, businessKind) {
  const nicheLaunches = (history?.launches || []).filter((launch) => {
    const recordedKind = String(launch.businessKind || "").trim();
    return recordedKind && businessKindMatches({ industries: [recordedKind] }, businessKind);
  });
  const exposureLaunches = nicheLaunches.slice(-30);
  const referenceExposure = {};
  for (const launch of exposureLaunches)
    for (const referenceId of cleanList(launch.referenceIds))
      referenceExposure[referenceId] = (referenceExposure[referenceId] || 0) + 1;
  const lastLaunch = nicheLaunches.at(-1);
  const recentReferenceSets = nicheLaunches
    .slice(-12)
    .map((launch) => cleanList(launch.referenceIds))
    .filter((ids) => ids.length === 3);
  const signatureLaunches = nicheLaunches.slice(-5);
  return {
    recentReferenceIds: cleanList(lastLaunch?.referenceIds),
    recentReferenceSets,
    recentRouteSignatures: cleanList(
      signatureLaunches.flatMap((launch) => launch.routeSignatures || []),
    ),
    referenceExposure: Object.fromEntries(
      Object.entries(referenceExposure).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export async function recordLaunch(
  entry,
  historyPath = defaultHistoryPath(),
) {
  const history = await readLaunchHistory(historyPath);
  const launches = boundedLaunchHistory([
    ...history.launches.filter((launch) => launch.id !== entry.id),
    entry,
  ]);
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    launches,
  };
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const temporary = `${historyPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await fs.rename(temporary, historyPath);
  return next;
}
