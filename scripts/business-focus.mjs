const BROAD_LOCAL_SERVICE_KINDS = new Set([
  "home services",
  "local trades",
  "home repair",
  "contractor",
]);

const BUSINESS_FOCUS_PATTERNS = [
  {
    tag: "plumbing",
    patterns: [
      /\bplumb(?:ing|er|ers)?\b/iu,
      /\bdrain\s+(?:cleaning|clearing|repair)\b/iu,
      /\bwater\s+heater\b/iu,
      /\bsewer\b/iu,
      /\bpipe(?:work|\s+repair)?\b/iu,
      /\b(?:leak|faucet|toilet)\s+(?:repair|installation|replacement)\b/iu,
    ],
  },
  {
    tag: "electrical",
    patterns: [
      /\belectric(?:al|ian|ians)\b/iu,
      /\bwiring\b/iu,
      /\bcircuit\s+(?:repair|installation|breaker)\b/iu,
      /\belectrical\s+panel\b/iu,
      /\boutlet\s+(?:repair|installation|replacement)\b/iu,
    ],
  },
  {
    tag: "landscaping",
    patterns: [
      /\blandscap(?:e|ing|er|ers)\b/iu,
      /\blawn\s+(?:care|maintenance|service)\b/iu,
      /\bgarden\s+(?:design|maintenance|service)\b/iu,
      /\bhardscap(?:e|ing)\b/iu,
      /\btree\s+(?:service|care|removal)\b/iu,
    ],
  },
  {
    tag: "pest control",
    patterns: [
      /\bpest\s+control\b/iu,
      /\bexterminat(?:or|ion)\b/iu,
      /\btermit(?:e|es)\b/iu,
      /\b(?:rodent|mosquito|bed\s+bug)\s+(?:control|treatment)\b/iu,
    ],
  },
  {
    tag: "garage door",
    patterns: [
      /\bgarage\s+door\b/iu,
      /\boverhead\s+door\b/iu,
      /\bgarage\s+door\s+opener\b/iu,
    ],
  },
  {
    tag: "hvac",
    patterns: [
      /\bhvac\b/iu,
      /\bair\s+conditioning\b/iu,
      /\bheating\s+(?:and|&)\s+cooling\b/iu,
      /\bfurnace\b/iu,
      /\bheat\s+pump\b/iu,
    ],
  },
  {
    tag: "auto repair",
    patterns: [
      /\bauto\s+repair\b/iu,
      /\bautomotive\s+(?:repair|service)\b/iu,
      /\bmechanic(?:s)?\s+shop\b/iu,
      /\bvehicle\s+(?:repair|diagnostic|servicing)\b/iu,
    ],
  },
  {
    tag: "roofing",
    patterns: [
      /\broof(?:er|ing|ers)?\b/iu,
      /\broof\s+(?:repair|replacement|inspection)\b/iu,
    ],
  },
  {
    tag: "painting",
    patterns: [
      /\bpaint(?:er|ers|ing)\b/iu,
      /\binterior\s+painting\b/iu,
      /\bexterior\s+painting\b/iu,
      /\bcabinet\s+(?:painting|refinishing)\b/iu,
    ],
  },
];

function normalizeKind(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Infer a narrow trade only from the business identity and service names.
 * @param {{ businessName?: string, businessKind?: string, industry?: string, services?: Array<string | { name?: string }> }} [input]
 */
export function inferBusinessFocusTerms({
  businessName = "",
  businessKind = "",
  industry = "",
  services = [],
} = {}) {
  const declaredKinds = [businessKind, industry]
    .map(normalizeKind)
    .filter(Boolean);
  const explicitMatches = BUSINESS_FOCUS_PATTERNS.filter(({ tag, patterns }) =>
    declaredKinds.some(
      (kind) =>
        normalizeKind(tag) === kind ||
        patterns.some((pattern) => pattern.test(kind)),
    ),
  ).map(({ tag }) => tag);
  if (explicitMatches.length) return [...new Set(explicitMatches)];

  const hasBroadServiceKind = declaredKinds.some((kind) =>
    BROAD_LOCAL_SERVICE_KINDS.has(kind),
  );
  if (!hasBroadServiceKind) return [];

  const serviceNames = Array.isArray(services)
    ? services
        .map((service) =>
          typeof service === "string" ? service : service?.name,
        )
        .filter(Boolean)
    : [];
  const verifiedContext = [businessName, ...serviceNames].join(" ");
  return BUSINESS_FOCUS_PATTERNS.filter(({ patterns }) =>
    patterns.some((pattern) => pattern.test(verifiedContext)),
  ).map(({ tag }) => tag);
}
