import type { Config, Context } from "@netlify/functions";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

export default async function places(request: Request, _context: Context) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return Response.json({ error: "Places lookup is not configured." }, { status: 503 });

  const { query } = await request.json().catch(() => ({}));
  if (typeof query !== "string" || query.trim().length < 3) {
    return Response.json({ error: "Enter a business name, address, or Maps URL." }, { status: 400 });
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.regularOpeningHours",
    },
    body: JSON.stringify({ textQuery: query.trim(), maxResultCount: 1 }),
  });
  if (!response.ok) {
    console.error("Places lookup failed", response.status, await response.text());
    return Response.json({ error: "Google couldn’t find a matching listing. You can enter the details manually." }, { status: 502 });
  }
  const { places = [] } = await response.json() as { places?: GooglePlace[] };
  const place = places[0];
  if (!place?.id || !place.displayName?.text) {
    return Response.json({ error: "No matching listing found. You can enter the details manually." }, { status: 404 });
  }
  return Response.json({
    place: {
      id: place.id,
      name: place.displayName.text,
      address: place.formattedAddress || "",
      phone: place.nationalPhoneNumber || place.internationalPhoneNumber || "",
      website: place.websiteUri || "",
      mapsUrl: place.googleMapsUri || "",
      rating: place.rating,
      ratingCount: place.userRatingCount,
      hours: place.regularOpeningHours?.weekdayDescriptions || [],
    },
  });
}

export const config: Config = { path: "/api/places" };
