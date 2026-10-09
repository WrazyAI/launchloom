const textValues = (value) => {
  if (typeof value === "string" || typeof value === "number")
    return [String(value)];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(textValues);
  return [];
};

const getPath = (value, dottedPath) =>
  dottedPath.split(".").reduce((current, part) => current?.[part], value);

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();

const claimRules = [
  {
    category: "credentials",
    pattern:
      /\b(?:licensed(?:\s+and\s+insured)?|certified|insured|bonded|board[- ]certified|credentialed)(?:\s+(?:technicians?|contractors?|inspectors?|professionals?))?\b/giu,
    fields: ["credentials", "business.credentials"],
  },
  {
    category: "pricing",
    pattern:
      /\$\s?\d[\d,]*(?:\.\d{1,2})?|\bfree\s+(?:estimate|consultation|inspection)|\b\d+(?:\.\d+)?\s?%\s?(?:off|discount)\b/giu,
    fields: [
      "offer",
      "price",
      "prices",
      "pricing",
      "priceRange",
      "startingPrice",
      "business.offer",
    ],
  },
  {
    category: "guarantees",
    pattern:
      /\b(?:guaranteed?|warrant(?:y|ies)|money[- ]back guarantee|lifetime warranty)\b/giu,
    fields: ["guarantee", "guarantees", "warranty", "warranties"],
  },
  {
    category: "ratings",
    pattern:
      /\b(?:award[- ]winning|five[- ]star|5[- ]star|top[- ]rated|best[- ]rated|rated\s+\d(?:\.\d)?|\d(?:\.\d)?\s+stars?|[\d,]+\s+(?:reviews?|customers?|clients?|families?|homeowners?|drivers?|patients?))\b/giu,
    fields: [
      "reviews",
      "testimonials",
      "awards",
      "rating",
      "reviewCount",
      "socialProof",
      "verifiedReviews",
    ],
  },
  {
    category: "experience",
    pattern:
      /\b(?:\d+\s+years?\b[^.!?]{0,40}\bexperience\b|\d+\s+years?\s+in\s+business|established\s+(?:in\s+)?(?:19|20)\d{2}|serving\s+.{1,40}\s+since\s+(?:19|20)\d{2})/giu,
    fields: [
      "yearEstablished",
      "yearsExperience",
      "yearsInBusiness",
      "businessSince",
      "experience",
    ],
  },
  {
    category: "availability",
    pattern:
      /\b(?:24\s*\/\s*7|same[- ]day|emergency\s+(?:service|repair|response)|within\s+\d+\s+(?:minutes?|hours?|days?)|respond\s+(?:within|in)\s+\d+\s+(?:minutes?|hours?)|available\s+(?:today|now)|open\s+(?:now|24\s*\/\s*7))\b/giu,
    fields: ["availability", "responseTime", "emergencyAvailability", "hours"],
  },
  {
    category: "outcomes",
    pattern:
    /\b(?:save|saved|reduce|reduces|reduced|increase|increased|improve|improves|improved|cut)\b[^.!?]{0,50}\b\d+(?:\.\d+)?\s*(?:%|percent)(?![\p{L}\p{N}])|\b(?:reduce|reduces|reduced|lower|lowers|lowered|prevent|prevents|prevented|avoid|avoids|avoided|eliminate|eliminates|eliminated|improve|improves|improved|relieve|relieves|relieved|treat|treats|treated|heal|heals|healed|cure|cures|cured)\b[^.!?;]{0,50}\b(?:fall\s+risk|falls?|injur(?:y|ies)|pain|infection|symptoms?|conditions?|disease|wounds?|complications?)\b/giu,
    fields: ["results", "metrics", "caseStudies", "proofPoints", "differentiators"],
  },
  {
    category: "staff",
    pattern:
      /\b(?:(?:our|meet)\s+\d+\s+(?:technicians|employees|staff|specialists|experts|team members)|(?:owner|founder|director|technician|specialist)\s+[A-Z][a-z]+\s+[A-Z][a-z]+|meet\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?\s*,\s+(?:your|our)\s+(?:[\p{L}'-]+\s+){0,3}(?:care coordinator|technician|specialist|nurse|therapist|inspector|contractor|mechanic|painter|technician|owner|founder|director)\b)/giu,
    fields: ["staff", "teamMembers", "team", "business.staff"],
  },
  {
    category: "physical location",
    pattern:
      /\b(?:located|based|headquartered)\s+(?:in|at)\s+([^,.!?;\n]+)|\b(?:our\s+(?:[\w-]+\s+){0,2}(?:office|shop|studio|clinic|storefront|headquarters)\s+in)\s+([^,.!?;\n]+)|\bvisit\s+(?:our\s+(?:[\w-]+\s+){0,2}(?:office|shop|studio|clinic)\s+(?:at|in)|us\s+at)\s+([^,.!?;\n]+)/giu,
    fields: ["address", "business.address"],
  },
];

function clausePrefix(text, index, { splitComma = false } = {}) {
  const boundary = splitComma
    ? /[.!?;,\n]|\b(?:but|however|yet|although|though|whereas)\b/giu
    : /[.!?;\n]|\b(?:but|however|yet|although|though|whereas)\b/giu;
  let start = 0;
  for (const match of text.slice(0, index).matchAll(boundary))
    start = (match.index || 0) + match[0].length;
  return text.slice(start, index);
}

function isNegated(text, index) {
  const prefix = clausePrefix(text, index);
  if (/\bnot\s+(?:only|just|merely|to\s+mention)\b/iu.test(prefix))
    return false;
  return /\b(?:not|never|no|don't|do not|doesn't|does not|can't|cannot|won't|will not|without)\b[^.!?;\n]{0,100}$/iu.test(
    prefix,
  );
}

function isCautiousInquiry(text, index) {
  return /^\s*(?:please\s+)?(?:ask|check|verify|find\s+out)\b[^.!?;\n]{0,70}\b(?:whether|if)\b[^.!?;\n]{0,70}$/iu.test(
    clausePrefix(text, index, { splitComma: true }),
  );
}

function evidenceFor(intake, fields) {
  return fields.flatMap((field) => textValues(getPath(intake, field)));
}

function containsWholePhrase(text, phrase) {
  const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!escaped) return false;
  const flexibleSpaces = escaped.replace(/\s+/gu, "\\s+");
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${flexibleSpaces}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  );
  return pattern.test(normalize(text));
}

function currencyAmounts(text) {
  return [
    ...normalize(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)(?![\d,]|\.\d)/gu),
  ].map((match) => Number(match[1].replace(/,/gu, "")));
}

function guaranteeScope(text, index = 0, matchLength = 0) {
  const start = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1),
    text.lastIndexOf(";", index - 1),
    text.lastIndexOf("\n", index - 1),
  ) + 1;
  const candidates = [".", "!", "?", ";", "\n"]
    .map((character) => text.indexOf(character, index + matchLength))
    .filter((position) => position >= 0);
  const end = candidates.length ? Math.min(...candidates) : text.length;
  const clause = normalize(text.slice(start, end));
  const duration = clause.match(
    /\b(?:for|up to|within|during)\s+(?:the\s+)?(life(?:time)?|\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|years?))\b|\b(\d+(?:\.\d+)?[- ]?(?:days?|weeks?|months?|years?))\s+(?:warranty|guarantee)\b/iu,
  );
  const modifier = clause.match(/\b(?:money[- ]back|limited|lifetime)\b/iu)?.[0];
  const rawDuration = duration?.[1] || duration?.[2] || "";
  const normalizedDuration = /^(?:life|lifetime)$/iu.test(rawDuration)
    ? "life"
    : rawDuration.replace(/[- ]+/gu, " ").replace(/\s+/gu, " ").trim();
  return {
    duration: normalizedDuration,
    modifier: modifier === "lifetime" ? "life" : modifier || "",
  };
}

function hasCompatibleGuaranteeEvidence(text, match, evidence) {
  const claimScope = guaranteeScope(text, match.index || 0, match[0].length);
  return evidence.some((value) => {
    const normalized = normalize(value);
    const marker = /\b(?:guaranteed?|warrant(?:y|ies)|money[- ]back guarantee)\b/giu;
    for (const evidenceMatch of normalized.matchAll(marker)) {
      const evidenceScope = guaranteeScope(
        normalized,
        evidenceMatch.index || 0,
        evidenceMatch[0].length,
      );
      const durationMatches =
        !claimScope.duration || claimScope.duration === evidenceScope.duration;
      const modifierMatches =
        !claimScope.modifier || claimScope.modifier === evidenceScope.modifier;
      if (durationMatches && modifierMatches) return true;
    }
    return false;
  });
}

function pricingScopeTerms(text, match) {
  const start = Math.max(
    text.lastIndexOf(".", match.index - 1),
    text.lastIndexOf("!", match.index - 1),
    text.lastIndexOf("?", match.index - 1),
    text.lastIndexOf(";", match.index - 1),
    text.lastIndexOf("\n", match.index - 1),
  );
  const before = text.slice(start + 1, match.index);
  const meaningfulBefore = scopeWords(before);
  if (meaningfulBefore.length) return meaningfulBefore;
  const endCandidates = [".", "!", "?", ";", "\n"]
    .map((character) => text.indexOf(character, match.index + match[0].length))
    .filter((position) => position >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : text.length;
  return scopeWords(text.slice(match.index + match[0].length, end));
}

function scopeWords(value) {
  const generic = new Set([
    "a", "an", "and", "at", "each", "every", "for", "from", "in", "is",
    "it", "our", "per", "price", "prices", "pricing", "service", "services",
    "start", "starts", "starting", "the", "to", "your", "fee", "cost", "costs",
    "estimate", "estimates", "offer", "offers", "only", "just", "about",
  ]);
  return normalize(value)
    .replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/gu, " ")
    .match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)
    ?.filter((word) => !generic.has(word)) || [];
}

function supportsStructuredExperience(match, evidence) {
  const normalizedMatch = normalize(match[0]);
  if (evidence.some((value) => value.includes(normalizedMatch))) return true;
  const year = normalizedMatch.match(/\b(?:19|20)\d{2}\b/u)?.[0];
  if (year && evidence.some((value) => new RegExp(`\\b${year}\\b`, "u").test(value)))
    return true;
  const years = normalizedMatch.match(/\b(\d+)\s+years?\b/u)?.[1];
  return Boolean(
    years &&
      evidence.some(
        (value) =>
          value === years || new RegExp(`\\b${years}\\s+years?\\b`, "u").test(value),
      ),
  );
}

function hasStreetAddress(value) {
  return /\b\d{1,6}[A-Z]?\s+[^,\n]{1,45}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|highway|hwy)\b/iu.test(
    value,
  );
}

function supportedByEvidence(rule, match, intake, text) {
  const evidence = evidenceFor(intake, rule.fields).map(normalize);
  if (rule.category === "physical location") {
    if (
      intake.addressVisibility === "private" ||
      intake.business?.addressVisibility === "private"
    )
      return false;
    const address = evidence.map((value) => value.trim()).filter(Boolean);
    const claimedPlace = normalize(match[1] || match[2] || match[3] || "")
      .split(",")[0]
      .trim();
    return Boolean(
      claimedPlace &&
        address.some(
          (value) => hasStreetAddress(value) && value.includes(claimedPlace),
        ),
    );
  }
  const claim = normalize(match[0]);
  if (rule.category === "experience")
    return supportsStructuredExperience(match, evidence);
  if (rule.category === "guarantees")
    return hasCompatibleGuaranteeEvidence(text, match, evidence);
  if (rule.category === "pricing") {
    const amount = currencyAmounts(claim)[0];
    if (!amount)
      return Boolean(
        claim && evidence.some((value) => containsWholePhrase(value, claim)),
      );
    const claimTerms = pricingScopeTerms(text, match);
    return evidence.some((value) => {
      if (!currencyAmounts(value).includes(amount)) return false;
      const evidenceTerms = scopeWords(value);
      return claimTerms.length
        ? claimTerms.every((term) => evidenceTerms.includes(term))
        : evidenceTerms.length === 0;
    });
  }
  return Boolean(
    claim && evidence.some((value) => containsWholePhrase(value, claim)),
  );
}

function copyTextEntries(value, path, entries = []) {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    if (text.trim()) entries.push({ path, text });
    return entries;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => copyTextEntries(item, `${path}[${index}]`, entries));
    return entries;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value))
      copyTextEntries(item, path ? `${path}.${key}` : key, entries);
  }
  return entries;
}

function generatedCopyEntries(config) {
  const services = Array.isArray(config.services) ? config.services : [];
  const locations = Array.isArray(config.locations) ? config.locations : [];
  const faqs = Array.isArray(config.conversion?.faqs)
    ? config.conversion.faqs
    : [];
  return [
    ...copyTextEntries(config.business?.tagline, "business.tagline"),
    ...copyTextEntries(config.business?.description, "business.description"),
    ...Object.entries(config.copy || {}).flatMap(([key, value]) =>
      copyTextEntries(value, `copy.${key}`),
    ),
    ...services.flatMap((service, index) => [
      ...copyTextEntries(service?.description, `services[${index}].description`),
      ...copyTextEntries(service?.decisionSupport || {}, `services[${index}].decisionSupport`),
    ]),
    ...(Array.isArray(config.differentiators)
      ? config.differentiators.flatMap((value, index) =>
          copyTextEntries(value, `differentiators[${index}]`),
        )
      : []),
    ...(Array.isArray(config.conversion?.process)
      ? config.conversion.process.flatMap((value, index) =>
          copyTextEntries(value, `conversion.process[${index}]`),
        )
      : []),
    ...faqs.flatMap((faq, index) => [
      ...copyTextEntries(faq?.question, `conversion.faqs[${index}].question`),
      ...copyTextEntries(faq?.answer, `conversion.faqs[${index}].answer`),
    ]),
    ...locations.flatMap((location, index) => [
      ...copyTextEntries(location?.description, `locations[${index}].description`),
      ...copyTextEntries(location?.localNote, `locations[${index}].localNote`),
    ]),
    ...copyTextEntries(config.pageContent || {}, "pageContent"),
  ];
}

/** Finds unsupported claim categories and their copy-field paths. */
export function findUnsupportedBusinessClaimLocations(config = {}, intake = {}) {
  const copyEntries = generatedCopyEntries(config);
  const findings = new Map();
  for (const { path, text } of copyEntries) {
    for (const rule of claimRules) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      for (const match of text.matchAll(pattern)) {
        if (
          isNegated(text, match.index || 0) ||
          isCautiousInquiry(text, match.index || 0) ||
          supportedByEvidence(rule, match, intake, text)
        )
          continue;
        findings.set(`${rule.category}\u0000${path}`, {
          category: rule.category,
          path,
        });
      }
    }
  }
  return [...findings.values()].sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.path.localeCompare(right.path),
  );
}

/** Finds high-risk factual claim categories lacking confirmed intake evidence. */
export function auditUnsupportedBusinessClaims(config = {}, intake = {}) {
  return [
    ...new Set(
      findUnsupportedBusinessClaimLocations(config, intake).map(
        ({ category }) => category,
      ),
    ),
  ].sort();
}
