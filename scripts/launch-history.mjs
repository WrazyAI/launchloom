import fs from "node:fs/promises";
import path from "node:path";

const HISTORY_LIMIT = 50;

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

export function recentCreativeFamilyIds(history) {
  return (history?.launches || []).flatMap((launch) => [
    ...new Set(
      [launch.creativeFamilyId, launch.referenceFamilyId]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ]);
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
  const normalizedStage =
    stage === "production" ? "production" : stage === "attempt" ? "attempt" : "preview";
  if (normalizedStage !== "attempt" && (!packId || !fingerprint))
    throw new Error("A launch record needs a pack id and layout fingerprint.");
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  return {
    id: `${launchedAt.slice(0, 10)}-${slug(config?.business?.name)}`,
    launchedAt,
    stage: normalizedStage,
    businessName: String(config?.business?.name || "").trim(),
    recipe: String(config?.design?.recipe || "").trim(),
    packId,
    variantId,
    layoutFingerprint: fingerprint,
    creativeFamilyId: String(experience.familyId || "").trim(),
    referenceFamilyId: String(experience.referenceFamilyId || "").trim(),
    referenceIds: cleanList(
      routes.flatMap((route) => [
        ...(Array.isArray(route.referenceIds) ? route.referenceIds : []),
        route.referenceId,
      ]),
    ),
    routeSignatures: cleanList(routes.map((route) => route.signature)),
  };
}

export async function recordLaunch(
  entry,
  historyPath = defaultHistoryPath(),
) {
  const history = await readLaunchHistory(historyPath);
  const launches = [
    ...history.launches.filter((launch) => launch.id !== entry.id),
    entry,
  ].slice(-HISTORY_LIMIT);
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
