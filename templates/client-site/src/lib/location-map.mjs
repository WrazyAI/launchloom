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
    if (hasExactStreetAddress(query) || /^(?:place_id:[\w-]{3,256}|-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?)$/u.test(query))
      return query.slice(0, 300);
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

/** Use a public business destination, or a clearly approximate public area. */
export function resolveLocationMap({
  businessName = "",
  address = "",
  placeId = "",
  googleMapsUrl = "",
  addressVisibility,
  primaryCity = "",
  serviceAreas = [],
} = {}) {
  if (addressVisibility === "private") {
    address = "";
    placeId = "";
    googleMapsUrl = "";
  }
  const placeValue = String(placeId || "").trim();
  const safePlaceId = /^[\w-]{3,256}$/u.test(placeValue)
    ? placeValue
    : "";
  const safeAddress = hasExactStreetAddress(address) ? String(address).trim() : "";
  const providedUrl = parseSafeGoogleMapsUrl(googleMapsUrl);
  const urlQuery = mapQueryFromUrl(providedUrl);
  const publicAreas = [primaryCity, ...(Array.isArray(serviceAreas) ? serviceAreas : [])]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter((value) =>
      value.length <= 120 &&
      /^\p{L}[\p{L}\p{M} .,'’()-]*$/u.test(value) &&
      !/\b(?:example|sample|placeholder|remote|online|nationwide|worldwide|unknown|unspecified|unavailable|not provided|not applicable|not sure)\b/iu.test(value) &&
      !/^(?:none|n\/a)$/iu.test(value),
    );
  const areaKey = (value) => value.toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
  const urlArea = publicAreas.find((area) =>
    [area, area.split(",")[0]].some((name) => areaKey(name) === areaKey(urlQuery)),
  );
  const mapQuery = safePlaceId
    ? `place_id:${safePlaceId}`
    : safeAddress
      ? safeAddress
      : urlArea ? "" : urlQuery;
  const waypoint = mapQuery ? "" : urlArea || publicAreas[0] || "";
  const available = Boolean(mapQuery || waypoint);

  let directionsHref = "";
  if (waypoint) {
    directionsHref = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: waypoint })}`;
  } else if (providedUrl && urlQuery && !urlArea && !safePlaceId && !safeAddress) {
    directionsHref = providedUrl.href;
  } else if (available) {
    const params = new URLSearchParams({
      api: "1",
      query: safeAddress || String(businessName || "business").trim(),
    });
    if (safePlaceId) params.set("query_place_id", safePlaceId);
    directionsHref = `https://www.google.com/maps/search/?${params.toString()}`;
  }

  const embedHref = mapQuery || waypoint
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery || waypoint)}&output=embed${waypoint ? "&z=11" : ""}`
    : "";

  return {
    available,
    kind: waypoint ? "approximate" : available ? "exact" : "none",
    waypoint,
    address: safeAddress,
    directionsHref,
    embedHref,
  };
}
