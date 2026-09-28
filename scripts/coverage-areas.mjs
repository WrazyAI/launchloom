import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const radiusMiles = new Set([10, 20, 30, 50]);
const metersPerMile = 1609.344;
const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
const rings = [0.5, 0.9];

function text(value, limit = 160) {
  return String(value ?? "").replace(/\u0000/gu, "").replace(/—/gu, "-").trim().slice(0, limit);
}

function milesBetween(first, second) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function destination(center, distanceMeters, bearingDegrees) {
  const angular = distanceMeters / 6_371_000;
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

function primaryName(value) {
  return text(value).split(",")[0].toLocaleLowerCase();
}

export async function discoverCoverageAreas({
  primaryCity,
  serviceRadius,
  geocodeCity,
  reverseGeocode,
  maxAreas = 15,
}) {
  const city = text(primaryCity, 160);
  const warnings = [];
  if (!city)
    return {
      primaryCity: "",
      serviceRadiusMiles: null,
      coverageAreas: [],
      coverageEvidence: { source: "unavailable", lookups: 0 },
      warnings: ["No primary city was available for coverage discovery."],
    };

  const radiusText = text(serviceRadius, 8);
  const radius = radiusText === "50+" ? 50 : Number(radiusText);
  if (!radiusMiles.has(radius)) {
    return {
      primaryCity: city,
      serviceRadiusMiles: null,
      coverageAreas: [city],
      coverageEvidence: { source: "client_supplied_primary_city", lookups: 0 },
      warnings: ["A supported travel radius was not available; only the confirmed primary city is retained."],
    };
  }
  if (radiusText === "50+")
    warnings.push("The selected 50+ mile radius was mapped conservatively to 50 miles; wider coverage was not mapped.");

  let center;
  try {
    center = await geocodeCity(city);
  } catch {
    center = null;
  }
  if (!center || !Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) {
    return {
      primaryCity: city,
      serviceRadiusMiles: radius,
      coverageAreas: [city],
      coverageEvidence: { source: "unavailable", lookups: 0 },
      warnings: [...warnings, "Coverage discovery was unavailable; the confirmed primary city is retained."],
    };
  }

  const coordinates = rings.flatMap((ring) =>
    bearings.map((bearing) => destination(center, radius * ring * metersPerMile, bearing)),
  );
  const discoveries = [];
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < coordinates.length) {
      const current = coordinates[cursor++];
      try {
        const places = await reverseGeocode(current);
        for (const place of Array.isArray(places) ? places : [places]) {
          const name = text(place?.name, 160);
          const latitude = Number(place?.latitude);
          const longitude = Number(place?.longitude);
          if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
          const distance = milesBetween(center, { latitude, longitude });
          if (distance > radius + 0.5 || primaryName(name) === primaryName(city)) continue;
          discoveries.push({ name, distance });
        }
      } catch {
        // Missing points are expected at water, park, or geocoder boundaries.
      }
    }
  });
  await Promise.all(workers);

  const seen = new Set([primaryName(city)]);
  const nearby = [];
  for (const item of discoveries.sort((left, right) => left.distance - right.distance)) {
    const key = primaryName(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    nearby.push(item.name);
    if (nearby.length >= Math.max(0, Math.min(14, maxAreas - 1))) break;
  }
  if (nearby.length < 10)
    warnings.push("Google returned fewer than 10 distinct nearby service communities.");
  return {
    primaryCity: city,
    serviceRadiusMiles: radius,
    coverageAreas: [city, ...nearby],
    coverageEvidence: {
      source: "google_geocoding",
      lookups: coordinates.length,
      nearbyCommunities: nearby.length,
    },
    warnings,
  };
}

export function createGoogleGeocodingClient({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("Google Geocoding API key is required.");
  async function query(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Google Geocoding returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload.status !== "OK" || !payload.results?.length) return null;
    return payload.results;
  }
  return {
    async geocodeCity(city) {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", city);
      url.searchParams.set("key", apiKey);
      const results = await query(url.href);
      const location = results?.[0]?.geometry?.location;
      return location ? { latitude: Number(location.lat), longitude: Number(location.lng) } : null;
    },
    async reverseGeocode(point) {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${point.latitude},${point.longitude}`);
      url.searchParams.set("result_type", "locality|postal_town|administrative_area_level_3");
      url.searchParams.set("key", apiKey);
      const results = await query(url.href);
      return (results || []).flatMap((result) => {
        const components = result.address_components || [];
        const component = components.find((item) =>
          ["locality", "postal_town", "administrative_area_level_3"].some((type) => item.types?.includes(type)),
        );
        const location = result.geometry?.location;
        return component && location
          ? [{ name: component.long_name, latitude: Number(location.lat), longitude: Number(location.lng) }]
          : [];
      });
    },
  };
}

function extractIntake(body) {
  const match = body.match(/```json\s*([\s\S]*?)\s*```/iu);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

async function main() {
  const source = process.argv[process.argv.indexOf("--source") + 1];
  const destination = process.argv[process.argv.indexOf("--out") + 1];
  if (!source || !destination)
    throw new Error("Usage: node coverage-areas.mjs --source intake.md --out business-enrichment.json");
  const intake = extractIntake(await fs.readFile(source, "utf8"));
  const primaryCity = intake.primaryCity || text(intake.serviceAreas).split(/\r?\n/u)[0];
  let discovery;
  try {
    const client = createGoogleGeocodingClient({ apiKey: process.env.GOOGLE_PLACES_API_KEY });
    discovery = await discoverCoverageAreas({
      primaryCity,
      serviceRadius: intake.serviceRadius,
      ...client,
    });
  } catch {
    discovery = await discoverCoverageAreas({ primaryCity, serviceRadius: intake.serviceRadius });
  }
  const result = {
    version: 1,
    coverageAreas: discovery.coverageAreas,
    primaryCity: discovery.primaryCity,
    serviceRadiusMiles: discovery.serviceRadiusMiles,
    coverageEvidence: discovery.coverageEvidence,
    warnings: discovery.warnings,
  };
  await fs.writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`coverage_areas=${result.coverageAreas.length}`);
  console.log(`coverage_source=${result.coverageEvidence.source}`);
  console.log(`coverage_warnings=${result.warnings.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
