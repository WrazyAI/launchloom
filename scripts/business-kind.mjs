export const GENERIC_BUSINESS_KINDS = new Set([
  "all",
  "general",
  "local-business",
  "local-service",
  "local-services",
  "small-business",
]);

export const BUSINESS_KIND_GROUPS = [
  [
    "auto-repair",
    "auto-repair-shop",
    "auto-mechanic",
    "mechanic",
    "mechanic-shop",
    "garage",
    "independent-garage",
    "local-auto-repair",
    "independent-auto-service",
    "vehicle-diagnostics",
    "vehicle-servicing",
    "vehicle-maintenance",
    "brake-service",
    "car-repair",
    "automotive-repair",
  ],
  [
    "hvac",
    "hvac-contractor",
    "heating-and-cooling",
    "heating-cooling",
    "heating-and-cooling-contractor",
    "air-conditioning",
    "air-conditioning-and-heating",
    "heating-contractor",
    "cooling-contractor",
    "furnace-repair",
    "ac-repair",
  ],
  [
    "roofing",
    "roofer",
    "roofers",
    "roofing-contractor",
    "roofing-contractors",
    "commercial-roofing",
    "residential-roofing",
    "roof-repair",
    "roof-replacement",
  ],
  [
    "painting",
    "painter",
    "painters",
    "painting-contractor",
    "painting-contractors",
    "residential-painting",
    "commercial-painting",
    "residential-painter",
    "commercial-painter",
    "house-painter",
    "house-painting",
  ],
  [
    "home-services",
    "local-trades",
    "home-repair",
    "handyman",
    "plumbing",
    "electrical",
    "landscaping",
    "garage-door",
    "garage-door-repair",
    "construction",
    "civil-engineering",
    "groundworks",
    "storm-repair",
    "contractor",
  ],
  [
    "dental",
    "dentist",
    "dentistry",
    "dental-clinic",
    "dental-practice",
    "oral-health",
    "preventive-and-restorative-care",
  ],
  [
    "home-care",
    "homecare",
    "home-care-provider",
    "care-at-home",
    "home-support",
    "care",
    "caregiving",
    "elder-care",
    "senior-care",
    "elder-companionship",
    "companionship",
    "non-medical-home-support",
    "family-support",
    "specialized-homecare",
    "private-duty-care",
    "home-health-services",
    "nursing-and-care-coordination",
    "aging-in-place",
  ],
  [
    "fitness",
    "gym",
    "strength-training",
    "personal-training",
    "sports-performance",
    "fitness-studio",
    "sports-club",
    "pilates",
    "yoga",
  ],
  [
    "restaurant",
    "dining",
    "food",
    "food-and-drink",
    "indian-restaurant",
    "greek-restaurant",
    "mediterranean-restaurant",
    "fine-dining",
    "multi-location-dining",
    "catering",
    "cafe",
    "bakery",
  ],
  [
    "hospitality",
    "hotel",
    "boutique-hotel",
    "resort",
    "motel",
    "lodging",
    "inn",
    "guesthouse",
    "destination-stay",
  ],
  [
    "architecture",
    "architectural-design",
    "architect",
    "interior-design",
    "residential-architecture",
    "luxury-home-design",
    "hospitality-design",
    "restaurant-interiors",
  ],
  [
    "legal-services",
    "legal",
    "law",
    "law-firm",
    "lawyer",
    "attorney",
    "solicitor",
    "legal-practice",
  ],
  ["accounting", "accountant", "accountancy", "tax-accounting", "bookkeeping"],
  [
    "jewelry",
    "jewellery",
    "jewelery",
    "jeweler",
    "jeweller",
    "fine-jewelry",
    "fine-jewellery",
    "independent-jewelry",
    "designer-jewelry",
    "luxury-retail",
    "sculptural-accessories",
    "wearable-product",
  ],
  [
    "beauty",
    "beauty-salon",
    "salon",
    "hair-salon",
    "hair-stylist",
    "hair-colorist",
    "cosmetology",
    "independent-beauty",
    "barber",
    "barbershop",
    "mens-grooming",
    "medical-spa",
    "med-spa",
    "clinical-beauty",
    "cosmetic-treatment",
    "spa",
    "skincare",
    "aesthetics",
    "aesthetic-clinic",
    "cosmetics",
  ],
  [
    "automotive",
    "auto",
    "auto-services",
    "auto-dealership",
    "used-car-dealer",
    "vehicle-sales",
  ],
  ["events", "event-venue", "wedding-venue", "wedding", "event-services"],
  [
    "real-estate",
    "realtor",
    "real-estate-agent",
    "property",
    "home-sales",
    "property-management",
  ],
  [
    "veterinary",
    "veterinarian",
    "vet",
    "vet-clinic",
    "animal-clinic",
    "animal-hospital",
    "pet-clinic",
  ],
];

export function normalizeBusinessKind(value) {
  return String(value || "")
    .replace(/—/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function canonicalBusinessKind(value) {
  const normalized = normalizeBusinessKind(value);
  if (!normalized) return "";
  return (
    BUSINESS_KIND_GROUPS.find((group) => group.includes(normalized))?.[0] ||
    normalized
  );
}

export function businessKindMatches(record, industry) {
  const target = normalizeBusinessKind(industry);
  if (!target || GENERIC_BUSINESS_KINDS.has(target)) return false;
  const compatibleKinds = BUSINESS_KIND_GROUPS.find((group) =>
    group.includes(target),
  ) || [target];
  const recordKinds = [
    ...(Array.isArray(record?.industries) ? record.industries : []),
    ...(Array.isArray(record?.referenceTags?.business)
      ? record.referenceTags.business
      : []),
  ].map(normalizeBusinessKind);
  return recordKinds.some((kind) => compatibleKinds.includes(kind));
}
