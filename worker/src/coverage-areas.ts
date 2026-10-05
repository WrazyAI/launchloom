import {
  BOUNDED_50_PLUS_WARNING,
  COVERAGE_SOURCE,
  EMPTY_WARNING,
  MAX_COVERAGE_CANDIDATES,
  PARTIAL_WARNING,
  TRUNCATED_WARNING,
  boundedRadiusMiles,
  boundedRadiusSelection,
  collectCoverageCandidates,
  coveragePlaceLabel,
  coverageSearchCenters,
  createCoverageReferencePayload,
  signCoverageReference,
} from "../../src/lib/coverage-contract.mjs";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_RESULTS_PER_SEARCH = 20;
const COVERAGE_LOOKUP_WINDOW_MS = 10 * 60_000;
const COVERAGE_LOOKUP_LIMIT = 40;

export type CoverageLookupEnv = {
  GOOGLE_PLACES_API_KEY?: string;
  ONBOARDING_INVITE_SIGNING_SECRET?: string;
};

export type ResolvedPrimaryCity = {
  city: string;
  state: string;
  country: string;
  label: string;
  placeId: string;
  latitude: number;
  longitude: number;
};

export type CoverageLookupSuccess = {
  ok: true;
  primary: ResolvedPrimaryCity;
  radius: { selection: string; miles: number; label: string };
  candidates: Array<{
    id: string;
    name: string;
    state: string;
    label: string;
    distanceMiles: number;
  }>;
  reference: string;
  source: string;
  truncated: boolean;
  partial: boolean;
  warnings: string[];
};

export type CoverageLookupFailure = {
  ok: false;
  code:
    | "not_configured"
    | "unsupported_radius"
    | "ambiguous_city"
    | "unresolved_city"
    | "provider_failure"
    | "rate_limited";
  message: string;
  retryable: boolean;
  primary?: { label: string };
};

export type CoverageLookupResult = CoverageLookupSuccess | CoverageLookupFailure;

type GeocodeComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GeocodeResult = {
  partial_match?: boolean;
  place_id?: string;
  types?: string[];
  address_components?: GeocodeComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

/** Best-effort per-invite limiter. Worker isolates are ephemeral, so this
 * bounds accidental lookup storms inside one isolate without claiming a
 * distributed guarantee. */
const coverageLookupWindows = new Map<string, number[]>();

export function coverageLookupRateLimited(inviteId: string, now = Date.now()) {
  const recent = (coverageLookupWindows.get(inviteId) || []).filter(
    (timestamp) => now - timestamp < COVERAGE_LOOKUP_WINDOW_MS,
  );
  if (recent.length >= COVERAGE_LOOKUP_LIMIT) {
    coverageLookupWindows.set(inviteId, recent);
    return true;
  }
  recent.push(now);
  coverageLookupWindows.set(inviteId, recent);
  return false;
}

export function resetCoverageLookupRateLimit() {
  coverageLookupWindows.clear();
}

function text(value: unknown, limit = 160) {
  return String(value ?? "")
    .replace(/\u0000/gu, "")
    .trim()
    .slice(0, limit);
}

function geocodeComponent(result: GeocodeResult, type: string) {
  return (result.address_components || []).find((component) =>
    Array.isArray(component.types) && component.types.includes(type),
  );
}

function cityComponent(result: GeocodeResult) {
  return (
    geocodeComponent(result, "locality") ||
    geocodeComponent(result, "postal_town") ||
    geocodeComponent(result, "administrative_area_level_3")
  );
}

type GeocodeCityResolution = {
  city: string;
  state: string;
  stateLong: string;
  country: string;
  countryLong: string;
  placeId: string;
  latitude: number;
  longitude: number;
  label: string;
};

function resolveGeocodeResult(result: GeocodeResult): GeocodeCityResolution | null {
  const cityField = cityComponent(result);
  const name = text(cityField?.long_name, 160);
  const state = text(geocodeComponent(result, "administrative_area_level_1")?.short_name, 60);
  const stateLong = text(
    geocodeComponent(result, "administrative_area_level_1")?.long_name ||
      geocodeComponent(result, "administrative_area_level_2")?.long_name,
    120,
  );
  const country = text(geocodeComponent(result, "country")?.short_name, 60).toUpperCase();
  const countryLong = text(geocodeComponent(result, "country")?.long_name, 120);
  const placeId = text(result.place_id, 200);
  const latitude = Number(result.geometry?.location?.lat);
  const longitude = Number(result.geometry?.location?.lng);
  if (!name || !placeId || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return null;
  if (!country) return null;
  return {
    city: name,
    state,
    stateLong,
    country,
    countryLong,
    placeId,
    latitude,
    longitude,
    label: coveragePlaceLabel(name, state || country),
  };
}

/**
 * Extract the unambiguous primary city from Geocoding results. Same-name
 * cities in other states/countries are treated as ambiguous unless the query
 * itself names the state or country.
 */
export function resolvePrimaryCityFromGeocode(
  query: string,
  results: GeocodeResult[],
): { resolution: GeocodeCityResolution } | { code: "ambiguous_city" | "unresolved_city" } {
  const resolutions = results
    .map(resolveGeocodeResult)
    .filter((value): value is GeocodeCityResolution => Boolean(value));
  if (!resolutions.length) return { code: "unresolved_city" };
  const top = resolutions[0];
  const normalizedQuery = query.toLocaleLowerCase();
  const namesRegion = (name: string) => {
    const words = name.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const queryWords = normalizedQuery.match(/[\p{L}\p{N}]+/gu) || [];
    return words.length > 0 && queryWords.some((_, index) =>
      words.every((word, offset) => queryWords[index + offset] === word),
    );
  };
  const namesState =
    Boolean(top.state) &&
    (namesRegion(top.state) ||
      (top.stateLong ? namesRegion(top.stateLong) : false));
  const namesCountry =
    Boolean(top.countryLong) &&
    (namesRegion(top.country) ||
      namesRegion(top.countryLong));
  const otherStates = new Set(
    resolutions
      .slice(1)
      .filter((resolution) => resolution.country === top.country)
      .map((resolution) => resolution.state)
      .filter((state) => state && state !== top.state),
  );
  const otherCountries = new Set(
    resolutions
      .slice(1)
      .map((resolution) => resolution.country)
      .filter((country) => country !== top.country),
  );
  // An explicit country alone cannot disambiguate states that share a city
  // name; an explicit state match disambiguates within that country.
  if (otherCountries.size && !namesCountry && !namesState)
    return { code: "ambiguous_city" };
  if (otherStates.size && !namesState) return { code: "ambiguous_city" };
  const partialMatch = results[0]?.partial_match === true;
  if (partialMatch && !namesState && !namesCountry) return { code: "ambiguous_city" };
  return { resolution: top };
}

async function geocodeCity(
  city: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<{ resolution: GeocodeCityResolution } | { code: "ambiguous_city" | "unresolved_city" }> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("address", city);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Google Geocoding returned HTTP ${response.status}.`);
  const payload = (await response.json()) as { status?: string; results?: GeocodeResult[] };
  if (payload.status === "ZERO_RESULTS") return { code: "unresolved_city" };
  if (payload.status !== "OK" || !Array.isArray(payload.results))
    throw new Error(`Google Geocoding returned ${payload.status || "an invalid response"}.`);
  return resolvePrimaryCityFromGeocode(city, payload.results);
}

type NearbySearchResponse = {
  places?: Array<Record<string, unknown>>;
};

async function searchNearby(
  center: { latitude: number; longitude: number; radiusMeters: number },
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<{ places: Array<Record<string, unknown>>; truncated: boolean }> {
  const response = await fetchImpl(NEARBY_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.addressComponents,places.types",
    },
    body: JSON.stringify({
      includedTypes: ["locality"],
      maxResultCount: MAX_RESULTS_PER_SEARCH,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: center.latitude, longitude: center.longitude },
          radius: center.radiusMeters,
        },
      },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google Nearby Search returned HTTP ${response.status}.`);
  const payload = (await response.json()) as NearbySearchResponse;
  const places = Array.isArray(payload.places) ? payload.places : [];
  return { places, truncated: places.length >= MAX_RESULTS_PER_SEARCH };
}

/**
 * Resolve the primary city and enumerate nearby municipalities inside the
 * bounded radius. Never throws for provider outcomes; throws only for
 * programming errors.
 */
export async function lookupCoverageAreas({
  env,
  inviteId,
  primaryCity,
  serviceRadius,
  fetchImpl = fetch,
  issuedAt = Date.now(),
}: {
  env: CoverageLookupEnv;
  inviteId: string;
  primaryCity: string;
  serviceRadius: unknown;
  fetchImpl?: typeof fetch;
  issuedAt?: number;
}): Promise<CoverageLookupResult> {
  const radiusSelection = boundedRadiusSelection(serviceRadius);
  const radiusMiles = boundedRadiusMiles(serviceRadius);
  if (radiusSelection === null || radiusMiles === null)
    return {
      ok: false,
      code: "unsupported_radius",
      message: "Choose a supported travel radius.",
      retryable: false,
    };
  const city = text(primaryCity, 160);
  if (city.length < 3)
    return {
      ok: false,
      code: "unresolved_city",
      message: "Enter your main service city, including the state or country.",
      retryable: true,
    };
  if (!env.GOOGLE_PLACES_API_KEY)
    return {
      ok: false,
      code: "not_configured",
      message: "Nearby city discovery is not configured.",
      retryable: false,
    };
  if (!env.ONBOARDING_INVITE_SIGNING_SECRET)
    return {
      ok: false,
      code: "not_configured",
      message: "Nearby city discovery is not configured.",
      retryable: false,
    };

  let resolved: GeocodeCityResolution;
  try {
    const geocode = await geocodeCity(city, env.GOOGLE_PLACES_API_KEY, fetchImpl);
    if ("code" in geocode)
      return {
        ok: false,
        code: geocode.code,
        message:
          geocode.code === "ambiguous_city"
            ? "That city name matches more than one place. Add the state or country and try again."
            : "We could not find that city. Check the spelling, or add the state or country.",
        retryable: true,
      };
    resolved = geocode.resolution;
  } catch {
    return {
      ok: false,
      code: "provider_failure",
      message: "The map provider is unavailable right now. Retry or confirm only your main city.",
      retryable: true,
    };
  }

  const plan = coverageSearchCenters(resolved, radiusSelection);
  if (!plan) {
    return {
      ok: false,
      code: "unsupported_radius",
      message: "Choose a supported travel radius.",
      retryable: false,
    };
  }

  const searches = await Promise.all(
    plan.centers.map(async (center) => {
      try {
        return await searchNearby(center, env.GOOGLE_PLACES_API_KEY!, fetchImpl);
      } catch {
        return { places: [], truncated: false, failed: true };
      }
    }),
  );
  if (searches.every((search) => "failed" in search && search.failed))
    return {
      ok: false,
      code: "provider_failure",
      message: "The map provider is unavailable right now. Retry or confirm only your main city.",
      retryable: true,
      primary: { label: resolved.label },
    };

  const merged = collectCoverageCandidates({
    primary: {
      name: resolved.city,
      placeId: resolved.placeId,
      state: resolved.state,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    },
    searches,
    radiusMiles,
    maxCandidates: MAX_COVERAGE_CANDIDATES,
  });

  const warnings: string[] = [];
  if (radiusSelection === "50+") warnings.push(BOUNDED_50_PLUS_WARNING);
  if (merged.truncated) warnings.push(TRUNCATED_WARNING);
  if (merged.partial) warnings.push(PARTIAL_WARNING);
  if (!merged.candidates.length) warnings.push(EMPTY_WARNING);

  const payload = createCoverageReferencePayload({
    inviteId,
    primary: {
      name: resolved.city,
      state: resolved.state,
      country: resolved.country,
      placeId: resolved.placeId,
    },
    radiusSelection,
    radiusMiles,
    candidates: merged.candidates,
    truncated: merged.truncated,
    partial: merged.partial,
    issuedAt,
  });
  const reference = await signCoverageReference(
    payload,
    env.ONBOARDING_INVITE_SIGNING_SECRET,
  );

  return {
    ok: true,
    primary: {
      city: resolved.city,
      state: resolved.state,
      country: resolved.country,
      label: resolved.label,
      placeId: resolved.placeId,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    },
    radius: { selection: radiusSelection, miles: radiusMiles, label: `${radiusMiles} miles` },
    candidates: merged.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      state: candidate.state,
      label: candidate.label,
      distanceMiles: Number(candidate.distanceMiles.toFixed(2)),
    })),
    reference,
    source: COVERAGE_SOURCE,
    truncated: merged.truncated,
    partial: merged.partial,
    warnings,
  };
}
