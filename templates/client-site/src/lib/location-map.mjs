const GOOGLE_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

function parseSafeGoogleMapsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();
    const isGoogleHost =
      GOOGLE_MAPS_HOSTS.has(host) || host.endsWith(".google.com");
    if (
      url.protocol !== "https:" ||
      !isGoogleHost ||
      url.username ||
      url.password ||
      url.pathname === "/url"
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function hasExactStreetAddress(value) {
  const address = String(value || "").trim();
  if (/\b(?:example|sample|placeholder|test address|your address)\b/iu.test(address))
    return false;
  return /(?:^|,\s*)\d+[a-z]?\s+[a-z]/iu.test(address);
}

function mapQueryFromUrl(url) {
  if (!url) return "";
  const placeId =
    url.searchParams.get("query_place_id") || url.searchParams.get("place_id");
  if (placeId && /^[\w-]{3,256}$/u.test(placeId)) return `place_id:${placeId}`;

  for (const key of ["query", "q", "destination"]) {
    const query = (url.searchParams.get(key) || "").trim();
    if (query && !/^https?:\/\//iu.test(query)) return query.slice(0, 300);
  }

  const placePath = url.pathname.match(/\/maps\/place\/([^/]+)/iu)?.[1];
  if (placePath) {
    try {
      return decodeURIComponent(placePath.replaceAll("+", " ")).slice(0, 300);
    } catch {
      return placePath.replaceAll("+", " ").slice(0, 300);
    }
  }

  const coordinates = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/u);
  return coordinates ? `${coordinates[1]},${coordinates[2]}` : "";
}

/** Resolve map links from verified business location fields, never service areas. */
export function resolveLocationMap({
  businessName = "",
  address = "",
  placeId = "",
  googleMapsUrl = "",
} = {}) {
  const placeValue = String(placeId || "").trim();
  const safePlaceId = /^[\w-]{3,256}$/u.test(placeValue)
    ? placeValue
    : "";
  const safeAddress = String(address || "").trim();
  const providedUrl = parseSafeGoogleMapsUrl(googleMapsUrl);
  const urlQuery = mapQueryFromUrl(providedUrl);
  const shortLinkHasDestination = Boolean(
    providedUrl &&
      ((providedUrl.hostname === "maps.app.goo.gl" &&
        /^\/[\w-]{6,}(?:\/)?$/u.test(providedUrl.pathname)) ||
        (providedUrl.hostname === "goo.gl" &&
          /^\/maps\/[\w-]{6,}(?:\/)?$/u.test(providedUrl.pathname))),
  );
  const mapQuery = safePlaceId
    ? `place_id:${safePlaceId}`
    : hasExactStreetAddress(safeAddress)
      ? safeAddress
      : urlQuery;
  const available = Boolean(mapQuery || shortLinkHasDestination);

  let directionsHref = "";
  if (available && providedUrl) {
    directionsHref = providedUrl.href;
  } else if (available) {
    const params = new URLSearchParams({
      api: "1",
      query: safeAddress || String(businessName || "business").trim(),
    });
    if (safePlaceId) params.set("query_place_id", safePlaceId);
    directionsHref = `https://www.google.com/maps/search/?${params.toString()}`;
  }

  const embedHref = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : "";

  return {
    available,
    address: safeAddress,
    directionsHref,
    embedHref,
  };
}
