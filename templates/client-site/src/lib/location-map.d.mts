export type ResolvedLocationMap = {
  available: boolean;
  kind: "exact" | "approximate" | "none";
  waypoint: string;
  address: string;
  directionsHref: string;
  embedHref: string;
};

export function hasExactStreetAddress(value: string): boolean;
export function resolveLocationMap(input?: {
  businessName?: string;
  address?: string;
  placeId?: string;
  googleMapsUrl?: string;
  serviceAreas?: readonly string[];
  primaryCta?: string;
  primaryCity?: string;
  addressVisibility?: string;
}): ResolvedLocationMap;
