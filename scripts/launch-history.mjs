import fs from "node:fs/promises";
import path from "node:path";
import { canonicalBusinessKind } from "./business-kind.mjs";

const HISTORY_LIMIT = 50;

function businessKindKey(value) {
  return canonicalBusinessKind(value);
}

function canonicalizeLaunchKind(launch) {
  if (!launch || typeof launch !== "object") return launch;
  const businessKind = businessKindKey(launch.businessKind);
  return businessKind ? { ...launch, businessKind } : { ...launch };
}

function groupLaunchesByBusinessKind(launches) {
  const groups = {};
  for (const original of Array.isArray(launches) ? launches : []) {
    const launch = canonicalizeLaunchKind(original);
    const key = businessKindKey(launch?.businessKind);
    if (!key) continue;
    groups[key] ||= [];
    groups[key].push(launch);
    groups[key] = groups[key].slice(-HISTORY_LIMIT);
  }
  return groups;
}

export function defaultHistoryPath() {
  return path.join(
    import.meta.dirname,
    "..",
    "data",
    "recent-launch-signatures.json",
  );
}

export function emptyLaunchHistory() {
  return {
    version: 2,
    updatedAt: null,
    launches: [],
    launchesByBusinessKind: {},
  };
}

export async function readLaunchHistory(historyPath = defaultHistoryPath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(historyPath, "utf8"));
    const launches = Array.isArray(parsed.launches)
      ? parsed.launches.slice(-HISTORY_LIMIT).map(canonicalizeLaunchKind)
      : [];
    let launchesByBusinessKind = groupLaunchesByBusinessKind(launches);
    if (
      parsed.version >= 2 &&
      parsed.launchesByBusinessKind &&
      typeof parsed.launchesByBusinessKind === "object" &&
      !Array.isArray(parsed.launchesByBusinessKind)
    ) {
      for (const [kind, records] of Object.entries(
        parsed.launchesByBusinessKind,
      )) {
        const key = businessKindKey(kind);
        if (!key || !Array.isArray(records)) continue;
        launchesByBusinessKind[key] ||= [];
        launchesByBusinessKind[key].push(
          ...records.slice(-HISTORY_LIMIT).map(canonicalizeLaunchKind),
        );
        const byId = new Map();
        for (const record of launchesByBusinessKind[key])
          byId.set(record.id || `${record.launchedAt || ""}:${byId.size}`, record);
        launchesByBusinessKind[key] = [...byId.values()].slice(-HISTORY_LIMIT);
      }
    }
    return {
      version: 2,
      updatedAt: parsed.updatedAt || null,
      launches,
      launchesByBusinessKind,
    };
  } catch {
    return emptyLaunchHistory();
  }
}

export function launchesForBusinessKind(history, businessKind, limit = 30) {
  const key = businessKindKey(businessKind);
  if (!key) return [];
  const scoped = Object.entries(history?.launchesByBusinessKind || {})
    .filter(([kind, records]) => businessKindKey(kind) === key && Array.isArray(records))
    .flatMap(([, records]) => records.map(canonicalizeLaunchKind));
  const globalScoped = (history?.launches || [])
    .filter((launch) => businessKindKey(launch?.businessKind) === key)
    .map(canonicalizeLaunchKind);
  const legacyUnscoped = (history?.launches || []).filter(
    (launch) => !businessKindKey(launch?.businessKind),
  );
  const byId = new Map();
  for (const launch of [...scoped, ...globalScoped, ...legacyUnscoped])
    byId.set(launch.id || `${launch.launchedAt || ""}:${byId.size}`, launch);
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(0, limit) : 30;
  return boundedLimit ? [...byId.values()].slice(-boundedLimit) : [];
}

export function launchesForSiteConfig(history, config, limit = 30) {
  const parsedConfig = typeof config === "string" ? JSON.parse(config) : config;
  return launchesForBusinessKind(
    history,
    parsedConfig?.businessKind || parsedConfig?.industry,
    limit,
  );
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
      [
        launch.creativeFamilyId,
        launch.referenceFamilyId,
        ...(Array.isArray(launch.routeFamilyIds) ? launch.routeFamilyIds : []),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ]);
}

export function countRecentCreativeFamilyUses(history, candidateFamilyIds) {
  const candidateFamilies = new Set(
    (Array.isArray(candidateFamilyIds) ? candidateFamilyIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  if (!candidateFamilies.size) return 0;
  return (history?.launches || []).filter((launch) =>
    recentCreativeFamilyIds({ launches: [launch] }).some((familyId) =>
      candidateFamilies.has(familyId),
    ),
  ).length;
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
  recordKey = "",
}) {
  const experience = config?.design?.experience || {};
  const packId = String(experience.packId || "").trim();
  const variantId = String(experience.variantId || "standard").trim();
  const fingerprint = String(experience.fingerprint || "").trim();
  const normalizedStage =
    stage === "production"
      ? "production"
      : stage === "attempt"
        ? "attempt"
        : "preview";
  if (normalizedStage !== "attempt" && (!packId || !fingerprint))
    throw new Error("A launch record needs a pack id and layout fingerprint.");
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  const baseId = `${launchedAt.slice(0, 10)}-${slug(config?.business?.name)}`;
  const reservationKey = String(recordKey || "").trim() ? slug(recordKey) : "";
  const attemptKey = slug(
    reservationKey ||
      String(launchedAt || "")
        .replace(/[^0-9]+/gu, "")
        .slice(-9),
  );
  const id =
    normalizedStage === "attempt"
      ? `${baseId}-attempt-${attemptKey || "reservation"}`
      : normalizedStage === "preview" && reservationKey
        ? `${baseId}-preview-${reservationKey}`
        : baseId;
  return {
    id,
    launchedAt,
    stage: normalizedStage,
    ...(reservationKey ? { reservationKey } : {}),
    businessName: String(config?.business?.name || "").trim(),
    businessKind: businessKindKey(config?.businessKind || config?.industry),
    recipe: String(config?.design?.recipe || "").trim(),
    packId,
    variantId,
    layoutFingerprint: fingerprint,
    creativeFamilyId: String(experience.familyId || "").trim(),
    referenceFamilyId: String(experience.referenceFamilyId || "").trim(),
    routeFamilyIds: cleanList(
      routes.flatMap((route) => [
        route.familyId,
        route.referenceFamilyId,
        route.referenceDna?.familyId,
      ]),
    ),
    heroArchetypes: cleanList(routes.map((route) => route.heroArchetype)),
    referenceIds: cleanList(
      routes.flatMap((route) => [
        ...(Array.isArray(route.referenceIds) ? route.referenceIds : []),
        route.referenceId,
        route.referenceDossier?.id,
      ]),
    ),
    routeSignatures: cleanList(routes.map((route) => route.signature)),
  };
}

export async function recordLaunch(entry, historyPath = defaultHistoryPath()) {
  const history = await readLaunchHistory(historyPath);
  const canonicalEntry = canonicalizeLaunchKind(entry);
  const isReplaced = (launch) =>
    launch.id === canonicalEntry.id ||
    (canonicalEntry.stage === "preview" &&
      canonicalEntry.reservationKey &&
      launch.stage === "attempt" &&
      launch.reservationKey === canonicalEntry.reservationKey);
  const launches = [
    ...history.launches.filter((launch) => !isReplaced(launch)),
    canonicalEntry,
  ].slice(-HISTORY_LIMIT);
  const launchesByBusinessKind = Object.fromEntries(
    Object.entries(history.launchesByBusinessKind || {}).map(
      ([kind, records]) => [
        kind,
        (Array.isArray(records) ? records : []).filter(
          (launch) => !isReplaced(launch),
        ),
      ],
    ),
  );
  const entryKind = businessKindKey(canonicalEntry.businessKind);
  if (entryKind) {
    launchesByBusinessKind[entryKind] = [
      ...(launchesByBusinessKind[entryKind] || []),
      canonicalEntry,
    ].slice(-HISTORY_LIMIT);
  }
  const next = {
    version: 2,
    updatedAt: new Date().toISOString(),
    launches,
    launchesByBusinessKind,
  };
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const temporary = `${historyPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await fs.rename(temporary, historyPath);
  return next;
}
