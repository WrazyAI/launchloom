export type ResolvedLocationMap = {
  available: boolean;
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
}): ResolvedLocationMap;
