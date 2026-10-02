/**
 * Confirmed service-coverage contract shared by the onboarding form, the
 * Worker coverage lookup and v2 intake normalization.
 *
 * Discovery uses Google Places API (New) Nearby Search with
 * `includedTypes: ["locality"]` (Table A "incorporated city or town political
 * entity") ranked by straight-line distance, plus Google Geocoding for primary
 * city resolution. Distances are straight-line statute miles between the
 * resolved primary-city center and each municipality's representative
 * coordinate. No provider pagination token exists for Nearby Search, so each
 * call returns at most 20 places and truncation is reported rather than hidden.
 *
 * The signed reference payload below is the only trusted record of a provider
 * lookup. The client returns the opaque token together with the ids the client
 * confirmed; the Worker verifies the signature and rebuilds the confirmed
 * coverage from the reference. Client-supplied coordinates, labels and
 * verification flags for fetched places are never trusted. Explicit typed
 * manualAreas are separate client assertions, never provider observations.
 */

export const COVERAGE_SOURCE = "google_places_locality";
export const COVERAGE_FALLBACK_SOURCE = "client_confirmed_primary_city_only";
export const COVERAGE_REFERENCE_VERSION = 1;
export const COVERAGE_REFERENCE_PURPOSE = "launchloom-coverage";
export const COVERAGE_REFERENCE_MAX_LENGTH = 100_000;
export const MAX_COVERAGE_CANDIDATES = 250;
export const MAX_ADDITIONAL_PLACES = 5;
const MAX_DISTANCE_TOLERANCE_MILES = 1e-9;
export const EARTH_RADIUS_MILES = 3958.7613;
const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_METERS = EARTH_RADIUS_MILES * METERS_PER_MILE;
const MAX_SEARCH_RADIUS_METERS = 50_000;
// 30 straight miles is 48,280 m, which fits the provider's 50 km circle with
// margin. Wider selections use overlapping satellite circles.
const SINGLE_CENTER_MAX_METERS = 49_000;
const WIDE_SATELLITE_DISTANCE_METERS = 40_000;
const WIDE_SATELLITE_COUNT = 8;

/** Radius options preserved from the current form. */
export const SERVICE_RADIUS_OPTIONS = Object.freeze([
  "10",
  "20",
  "30",
  "50",
  "50+",
]);

/** The bounded interpretation of "50+": it is searched to 50 miles, not unlimited. */
export const BOUNDED_50_PLUS_WARNING =
  "More than 50 miles is searched as a bounded 50-mile area; wider coverage is not mapped.";
export const TRUNCATED_WARNING =
  "Google returned its 20-place maximum for at least one part of this search, so some smaller places may be missing.";
export const PARTIAL_WARNING =
  "Some parts of this search could not be checked because the map provider failed; the list may be incomplete.";
export const EMPTY_WARNING =
  "No other cities or towns were found inside this radius.";

export class CoverageContractError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "CoverageContractError";
    this.code = code;
  }
}

/** @param {unknown} value @param {number} [limit] */
function clean(value, limit = 200) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value ?? "")
    .replace(/\u0000/gu, "")
    .trim()
    .slice(0, limit);
}

/** @param {string} selection */
export function boundedRadiusSelection(selection) {
  const value = clean(selection, 4);
  return SERVICE_RADIUS_OPTIONS.includes(value) ? value : null;
}

/** @param {string} selection @returns {number | null} bounded search miles */
export function boundedRadiusMiles(selection) {
  const value = boundedRadiusSelection(selection);
  if (value === null) return null;
  return value === "50+" ? 50 : Number(value);
}

/**
 * Straight-line statute miles between two `{latitude, longitude}` points.
 * @param {{ latitude: number, longitude: number }} first
 * @param {{ latitude: number, longitude: number }} second
 */
export function milesBetween(first, second) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/**
 * Point at `distanceMeters` and `bearingDegrees` from `center`.
 * @param {{ latitude: number, longitude: number }} center
 */
export function destinationPoint(center, distanceMeters, bearingDegrees) {
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude = (center.latitude * Math.PI) / 180;
  const longitude = (center.longitude * Math.PI) / 180;
  const resultLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angular) +
      Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing),
  );
  const resultLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
      Math.cos(angular) - Math.sin(latitude) * Math.sin(resultLatitude),
    );
  return {
    latitude: (resultLatitude * 180) / Math.PI,
    longitude: (((resultLongitude * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * Provider search plan for a radius selection.
 *
 * 10/20/30 miles use one exact-radius search. 50 and the bounded 50+ selection
 * use the primary circle plus eight 50 km satellite circles at 40 km, which
 * provably covers the full 50-mile disc (worst-case boundary distance is about
 * 46.2 km, below the 50 km provider maximum).
 *
 * @param {{ latitude: number, longitude: number }} primary
 * @param {string} serviceRadius
 */
export function coverageSearchCenters(primary, serviceRadius) {
  const selection = boundedRadiusSelection(serviceRadius);
  const miles = boundedRadiusMiles(serviceRadius);
  if (selection === null || miles === null) return null;
  const radiusMeters = miles * METERS_PER_MILE;
  if (radiusMeters <= SINGLE_CENTER_MAX_METERS) {
    return {
      selection,
      miles,
      radiusMeters,
      centers: [
        {
          latitude: primary.latitude,
          longitude: primary.longitude,
          radiusMeters,
          kind: /** @type {const} */ ("primary"),
        },
      ],
    };
  }
  const centers = [
    {
      latitude: primary.latitude,
      longitude: primary.longitude,
      radiusMeters: MAX_SEARCH_RADIUS_METERS,
      kind: /** @type {const} */ ("primary"),
    },
  ];
  for (let index = 0; index < WIDE_SATELLITE_COUNT; index += 1) {
    const point = destinationPoint(
      primary,
      WIDE_SATELLITE_DISTANCE_METERS,
      (360 / WIDE_SATELLITE_COUNT) * index,
    );
    centers.push({ ...point, radiusMeters: MAX_SEARCH_RADIUS_METERS, kind: "satellite" });
  }
  return { selection, miles, radiusMeters, centers };
}

/** @param {string} name @param {string} state */
export function coveragePlaceLabel(name, state) {
  return state ? `${name}, ${state}` : name;
}

/** @param {string} name @param {string} state */
function placeKey(name, state) {
  return `${name.toLocaleLowerCase()}${state ? `|${state.toLocaleLowerCase()}` : ""}`;
}

/**
 * Normalize one Places (New) `Place` object into a municipality candidate.
 * Returns null for anything without a stable id, a name, finite coordinates or
 * a `locality` type when the provider returns a type list.
 * @param {unknown} raw
 */
export function normalizeCoveragePlace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const place = /** @type {Record<string, any>} */ (raw);
  const id = clean(place.id, 200);
  const name = clean(place.displayName?.text, 160);
  if (!id || !name) return null;
  if (Array.isArray(place.types) && place.types.length && !place.types.includes("locality"))
    return null;
  const latitude = Number(place.location?.latitude);
  const longitude = Number(place.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  /** @param {string} type */
  const component = (type) =>
    components.find((item) => Array.isArray(item?.types) && item.types.includes(type));
  const stateComponent = component("administrative_area_level_1");
  const countryComponent = component("country");
  const state = clean(
    stateComponent?.shortText || stateComponent?.longText || "",
    60,
  );
  const country = clean(
    countryComponent?.shortText || countryComponent?.longText || "",
    60,
  ).toUpperCase();
  return {
    id,
    name,
    state,
    country,
    latitude,
    longitude,
    label: coveragePlaceLabel(name, state),
  };
}

/**
 * Merge provider search responses into unique in-radius candidates.
 *
 * @param {{
 *   primary: { name: string, placeId?: string, state?: string },
 *   searches: Array<{ places?: unknown[], failed?: boolean, truncated?: boolean }>,
 *   radiusMiles: number,
 *   maxCandidates?: number,
 * }} input
 */
export function collectCoverageCandidates({
  primary,
  searches,
  radiusMiles,
  maxCandidates = MAX_COVERAGE_CANDIDATES,
}) {
  const primaryKey = placeKey(clean(primary.name, 160), clean(primary.state, 60));
  const seen = new Set();
  const primaryId = clean(primary.placeId, 200);
  if (primaryId) seen.add(primaryId);
  const candidates = [];
  let truncated = false;
  let failedCenters = 0;
  for (const search of searches) {
    if (search?.failed) {
      failedCenters += 1;
      continue;
    }
    if (search?.truncated) truncated = true;
    for (const raw of Array.isArray(search?.places) ? search.places : []) {
      const place = normalizeCoveragePlace(raw);
      if (!place) continue;
      if (seen.has(place.id)) continue;
      if (placeKey(place.name, place.state) === primaryKey) continue;
      const distanceMiles = milesBetween(
        { latitude: primary.latitude, longitude: primary.longitude },
        place,
      );
      if (distanceMiles > radiusMiles + MAX_DISTANCE_TOLERANCE_MILES) continue;
      seen.add(place.id);
      candidates.push({ ...place, distanceMiles });
    }
  }
  candidates.sort(
    (left, right) =>
      left.distanceMiles - right.distanceMiles ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
  const overLimit = candidates.length > maxCandidates;
  return {
    candidates: candidates.slice(0, maxCandidates),
    truncated: truncated || overLimit,
    failedCenters,
    partial: failedCenters > 0,
  };
}

/**
 * Build the compact payload that is signed for the client.
 * @param {{
 *   inviteId: string,
 *   primary: { name: string, state: string, country: string, placeId: string },
 *   radiusSelection: string,
 *   radiusMiles: number,
 *   candidates: Array<{ id: string, name: string, state: string }>,
 *   truncated: boolean,
 *   partial: boolean,
 *   issuedAt: number,
 * }} input
 */
export function createCoverageReferencePayload({
  inviteId,
  primary,
  radiusSelection,
  radiusMiles,
  candidates,
  truncated,
  partial,
  issuedAt,
}) {
  return {
    v: COVERAGE_REFERENCE_VERSION,
    p: COVERAGE_REFERENCE_PURPOSE,
    i: clean(inviteId, 100),
    pc: coveragePlaceLabel(clean(primary.name, 160), clean(primary.state, 60) || clean(primary.country, 60).toUpperCase()),
    pid: clean(primary.placeId, 200),
    cc: clean(primary.country, 60).toUpperCase(),
    rs: radiusSelection,
    r: radiusMiles,
    s: COVERAGE_SOURCE,
    t: Math.floor(issuedAt / 1000),
    tr: truncated ? 1 : 0,
    pa: partial ? 1 : 0,
    n: candidates
      .slice(0, MAX_COVERAGE_CANDIDATES)
      .map((candidate) => [
        clean(candidate.id, 200),
        clean(candidate.name, 160),
        clean(candidate.state, 60),
      ])
      .filter(([id, name]) => id && name),
  };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

/** @param {string} value */
function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Sign a coverage reference payload. The token is opaque to the client.
 * @param {Record<string, unknown>} payload
 * @param {string} secret
 */
export async function signCoverageReference(payload, secret) {
  const encoded = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textEncoder.encode(encoded)),
  );
  return `${encoded}.${toBase64Url(signature)}`;
}

/**
 * Verify a coverage reference token. Returns null for malformed, tampered,
 * wrong-purpose or wrong-version tokens.
 * @param {unknown} token
 * @param {string} secret
 */
export async function verifyCoverageReference(token, secret) {
  const value = clean(token, COVERAGE_REFERENCE_MAX_LENGTH);
  if (!value || !secret) return null;
  const [encoded, supplied] = value.split(".");
  if (!encoded || !supplied) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(supplied),
      textEncoder.encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(textDecoder.decode(fromBase64Url(encoded)));
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.p !== COVERAGE_REFERENCE_PURPOSE ||
      payload.v !== COVERAGE_REFERENCE_VERSION
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parse the form's `coverageSelection` field.
 *
 * `undefined`/empty means an intake that predates coverage confirmation; it is
 * returned as null so normalization can apply the documented legacy contract.
 * Malformed or unsupported values throw so a new form can never silently
 * downgrade a claimed confirmation.
 * @param {unknown} value
 */
export function parseCoverageSelection(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string")
    throw new CoverageContractError(
      "coverage_selection_invalid",
      "Review and confirm your service coverage again.",
    );
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CoverageContractError(
      "coverage_selection_invalid",
      "Review and confirm your service coverage again.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new CoverageContractError(
      "coverage_selection_invalid",
      "Review and confirm your service coverage again.",
    );
  const status = clean(parsed.status, 40);
  if (status === "confirmed") {
    const reference = typeof parsed.reference === "string" ? parsed.reference.trim() : "";
    if (!reference || reference.length > COVERAGE_REFERENCE_MAX_LENGTH)
      throw new CoverageContractError(
        "coverage_reference_invalid",
        "Your nearby city list expired. Refresh it and confirm your coverage again.",
      );
    if (!Array.isArray(parsed.selectedIds) || parsed.selectedIds.length > MAX_ADDITIONAL_PLACES)
      throw new CoverageContractError(
        "coverage_selection_invalid",
        "Review and confirm your service coverage again.",
      );
    const selectedIds = [];
    for (const item of parsed.selectedIds) {
      const id = clean(item, 200);
      if (!id)
        throw new CoverageContractError(
          "coverage_selection_invalid",
          "Review and confirm your service coverage again.",
        );
      if (!selectedIds.includes(id)) selectedIds.push(id);
    }
    const manualAreas = parsed.manualAreas ?? [];
    if (!Array.isArray(manualAreas) || selectedIds.length + manualAreas.length > MAX_ADDITIONAL_PLACES ||
        manualAreas.some(area => typeof area !== "string" || area.length > 160 || /[\x00-\x1f\x7f]/u.test(area) || !/^[^,]+,\s*[^,]+$/u.test(area.trim())) ||
        new Set(manualAreas.map(area => area.trim().toLocaleLowerCase())).size !== manualAreas.length)
      throw new CoverageContractError("coverage_selection_invalid", "Add up to five additional places using City, State or Country.");
    return { status: "confirmed", reference, selectedIds, reason: "", ...(manualAreas.length ? { manualAreas: manualAreas.map(area => area.trim()) } : {}) };
  }
  if (status === "primary_city_only") {
    const reason = clean(parsed.reason, 40);
    return {
      status: "primary_city_only",
      reference: "",
      selectedIds: [],
      reason: ["provider_failure", "ambiguous_city", "unresolved_city"].includes(reason)
        ? reason
        : "provider_failure",
    };
  }
  throw new CoverageContractError(
    "coverage_selection_invalid",
    "Review and confirm your service coverage again.",
  );
}

/** @param {unknown} entry */
function candidateFromReferenceEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const id = clean(entry[0], 200);
  const name = clean(entry[1], 160);
  const state = clean(entry[2] ?? "", 60);
  if (!id || !name) return null;
  return { id, name, state, label: coveragePlaceLabel(name, state) };
}

/**
 * Rebuild the authoritative confirmed coverage from a verified reference.
 *
 * @param {{
 *   selection: { status: string, reference: string, selectedIds: string[], manualAreas?: string[], reason?: string },
 *   reference: Record<string, any>,
 *   primaryCity: string,
 *   serviceRadius: string,
 *   coverageAreas: string[],
 *   referenceHash: string,
 * }} input
 * @returns {{ ok: true, coverageAreas: string[], confirmation: Record<string, any> } | { ok: false, code: string, message: string }}
 */
export function deriveCoverageConfirmation({
  selection,
  reference,
  primaryCity,
  serviceRadius,
  coverageAreas,
  referenceHash,
}) {
  const radiusSelection = boundedRadiusSelection(serviceRadius);
  const radiusMiles = boundedRadiusMiles(serviceRadius);
  const primary = clean(primaryCity, 160);
  const submittedAreas = Array.isArray(coverageAreas)
    ? coverageAreas.map((area) => clean(area, 160)).filter(Boolean)
    : [];
  if (!selection || !primary || radiusSelection === null || radiusMiles === null)
    return {
      ok: false,
      code: "coverage_selection_invalid",
      message: "Review and confirm your service coverage again.",
    };

  if (selection.status === "primary_city_only") {
    if (
      submittedAreas.length !== 1 ||
      submittedAreas[0].toLocaleLowerCase() !== primary.toLocaleLowerCase()
    )
      return {
        ok: false,
        code: "coverage_selection_mismatch",
        message:
          "The submitted coverage does not match the confirmed main city. Review and confirm your coverage again.",
      };
    return {
      ok: true,
      coverageAreas: [primary],
      confirmation: {
        status: "primary_city_only",
        source: COVERAGE_FALLBACK_SOURCE,
        reason: selection.reason || "provider_failure",
        primaryCity: primary,
        radiusSelection,
        radiusMiles,
        candidateCount: 0,
        selectedCount: 0,
        selectedIds: [],
        truncated: false,
        partial: false,
      },
    };
  }

  if (selection.status !== "confirmed" || !reference || typeof reference !== "object")
    return {
      ok: false,
      code: "coverage_reference_invalid",
      message:
        "Your nearby city list expired. Refresh it and confirm your coverage again.",
    };
  if (clean(reference.pc, 160) !== primary)
    return {
      ok: false,
      code: "coverage_primary_mismatch",
      message:
        "Your main service city changed after the nearby list was fetched. Refresh it and confirm again.",
    };
  if (reference.rs !== radiusSelection || reference.r !== radiusMiles)
    return {
      ok: false,
      code: "coverage_radius_mismatch",
      message:
        "Your travel radius changed after the nearby list was fetched. Refresh it and confirm again.",
    };
  if (reference.s !== COVERAGE_SOURCE)
    return {
      ok: false,
      code: "coverage_source_invalid",
      message: "The nearby city list came from an unsupported source. Refresh it and confirm again.",
    };
  const byId = new Map();
  for (const entry of Array.isArray(reference.n) ? reference.n : []) {
    const candidate = candidateFromReferenceEntry(entry);
    if (candidate) byId.set(candidate.id, candidate);
  }
  const selected = [];
  for (const id of selection.selectedIds) {
    const candidate = byId.get(id);
    if (!candidate)
      return {
        ok: false,
        code: "coverage_selection_mismatch",
        message:
          "The selected cities do not match the fetched nearby list. Refresh it and confirm again.",
      };
    selected.push(candidate);
  }
  const manualAreas = selection.manualAreas || [];
  const derivedAreas = [primary, ...selected.map((candidate) => candidate.label), ...manualAreas];
  if (selected.length + manualAreas.length > MAX_ADDITIONAL_PLACES ||
      new Set(derivedAreas.map(area => area.toLocaleLowerCase())).size !== derivedAreas.length)
    return { ok: false, code: "coverage_selection_invalid", message: "Choose up to five distinct additional places." };
  const matches =
    submittedAreas.length === derivedAreas.length &&
    submittedAreas.every(
      (area, index) => area.toLocaleLowerCase() === derivedAreas[index].toLocaleLowerCase(),
    );
  if (!matches)
    return {
      ok: false,
      code: "coverage_selection_mismatch",
      message:
        "The confirmed coverage list changed after it was fetched. Refresh it and confirm again.",
    };
  return {
    ok: true,
    coverageAreas: derivedAreas,
    confirmation: {
      status: "confirmed",
      source: manualAreas.length ? "client_confirmed_mixed_coverage" : COVERAGE_SOURCE,
      ...(manualAreas.length ? { manualAreas } : {}),
      primaryCity: primary,
      radiusSelection,
      radiusMiles,
      candidateCount: byId.size,
      selectedCount: selected.length + manualAreas.length,
      selectedIds: selected.map((candidate) => candidate.id),
      truncated: reference.tr === 1,
      partial: reference.pa === 1,
      referenceHash,
      confirmedAt: Number.isFinite(reference.t) ? reference.t : null,
    },
  };
}
