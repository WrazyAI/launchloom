import type {
  DesignTypography,
  PageRecipe,
  PageSectionType,
  SiteConfig,
} from "./site";

export type ExperiencePackId =
  "cinematic-narrative" | "bold-utility" | "kinetic-poster";
export type LegacyExperiencePackId =
  "editorial-folio" | "guided-conversation" | "service-led";
export type ExperienceSection = PageSectionType | "conversion" | "location-map";

export type ExperienceNavigation =
  | "minimal-inline"
  | "utility-pill"
  | "command-bar";
export type ExperienceHero =
  | "image-narrative"
  | "centered-monument"
  | "editorial-dialogue"
  | "guided-portrait"
  | "poster-split"
  | "poster-full-bleed";
export type ExperienceConversion =
  | "discovery-ribbon"
  | "embedded-qualifier"
  | "quick-request";
export type ExperienceServices =
  | "editorial-index"
  | "chaptered-index"
  | "service-chapters"
  | "service-grid"
  | "diagnostic-list"
  | "problem-grid";
export type ExperienceProof =
  | "principle-line"
  | "quiet-ledger"
  | "evidence-strip";
export type ExperienceClosing =
  | "cinematic-inquiry"
  | "conversation-handoff"
  | "action-poster";
export type ExperienceTypography =
  | "editorial-contrast"
  | "humanist-calm"
  | "graphic-impact";
export type ExperienceImageStrategy =
  | "narrative-crops"
  | "human-context"
  | "bold-documentary";
export type ExperienceRhythm = "cinematic" | "conversational" | "kinetic";
export type ExperienceMobile =
  | "editorial-stack"
  | "guided-stack"
  | "poster-stack";
export type ExperienceMotion = Readonly<{
  profile: "still" | "restrained" | "cinematic";
  engine: "css" | "native-scroll";
  maxPinnedScenes: 0 | 1;
}>;

export type ExperienceBlueprintV2 = Readonly<{
  version: 2;
  packId: ExperiencePackId;
  variantId: string;
  navigation: ExperienceNavigation;
  hero: ExperienceHero;
  conversion: ExperienceConversion;
  services: ExperienceServices;
  proof: ExperienceProof;
  closing: ExperienceClosing;
  typography: ExperienceTypography;
  imageStrategy: ExperienceImageStrategy;
  rhythm: ExperienceRhythm;
  motion: ExperienceMotion;
  sectionOrder: readonly ExperienceSection[];
  mobile: ExperienceMobile;
  fingerprint: string;
}>;

export type ExperiencePackVariant = Readonly<{
  id: string;
  label: string;
  hero: ExperienceHero;
  services: ExperienceServices;
  sectionOrder: readonly ExperienceSection[];
  fingerprint: string;
}>;

export type ExperienceRoutePreference = Readonly<{
  navigation?: string;
  heroGeometry?: string;
  servicePresentation?: string;
  sectionRhythm?: string;
  typographyCategory?: string;
  signature?: string;
}>;

export type ExperienceContent = Readonly<{
  brand: {
    name: string;
    logo?: string;
    phone: string;
    email: string;
    address: string;
    serviceAreas: readonly string[];
  };
  hero: {
    kicker: string;
    heading: string;
    body: string;
    primaryLabel: string;
    image?: string;
    secondaryImage?: string;
    tertiaryImage?: string;
    offer?: string;
  };
  services: readonly SiteConfig["services"][number][];
  proof: readonly string[];
  process: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  locations: readonly SiteConfig["locations"][number][];
  coverageHeading: string;
  coverageIntro: string;
  copy: NonNullable<SiteConfig["copy"]>;
  businessDescription: string;
  showLocationMap: boolean;
  hasSocialProof: boolean;
  socialProof: {
    source: string;
    heading: string;
    intro: string;
    points: readonly string[];
  } | null;
}>;

export type CompiledExperience = Readonly<{
  program: ExperienceBlueprintV2;
  content: ExperienceContent;
  source: "requested" | "selected";
  diagnostics: readonly string[];
}>;

export type ExperienceCandidate = Readonly<{
  packId: ExperiencePackId;
  variantId: string;
  blueprint: ExperienceBlueprintV2;
  compatibilityScore: number;
  diagnostics: readonly string[];
}>;

type PackVariantDefinition = Omit<ExperiencePackVariant, "fingerprint"> & {
  affinity: readonly DesignTypography[];
};

type PackDefinition = Omit<
  ExperienceBlueprintV2,
  "version" | "fingerprint" | "variantId" | "hero" | "services" | "sectionOrder"
> & {
  intent: string;
  preferredRecipes: readonly PageRecipe[];
  requiresImage: boolean;
  variants: readonly PackVariantDefinition[];
};

const legacyAliases: Record<LegacyExperiencePackId, ExperiencePackId> = {
  "editorial-folio": "cinematic-narrative",
  "guided-conversation": "bold-utility",
  "service-led": "kinetic-poster",
};

const packs: Record<ExperiencePackId, PackDefinition> = {
  "cinematic-narrative": {
    packId: "cinematic-narrative",
    intent: "Image-led editorial authority with cinematic pacing.",
    preferredRecipes: ["general-editorial", "care-editorial"],
    requiresImage: true,
    navigation: "minimal-inline",
    conversion: "discovery-ribbon",
    proof: "principle-line",
    closing: "cinematic-inquiry",
    typography: "editorial-contrast",
    imageStrategy: "narrative-crops",
    rhythm: "cinematic",
    motion: {
      profile: "cinematic",
      engine: "native-scroll",
      maxPinnedScenes: 1,
    },
    mobile: "editorial-stack",
    variants: [
      {
        id: "standard",
        label: "Image narrative",
        affinity: ["refined-serif", "editorial", "soft-sans", "humanist"],
        hero: "image-narrative",
        services: "editorial-index",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "gallery",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      {
        id: "monument",
        label: "Centered monument",
        affinity: [
          "heritage",
          "modern-serif",
          "geometric",
          "industrial",
          "condensed",
          "strong",
          "sans",
        ],
        hero: "centered-monument",
        services: "chaptered-index",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "social-proof",
          "gallery",
          "faq",
          "location-map",
          "contact",
        ],
      },
    ],
  },
  "bold-utility": {
    packId: "bold-utility",
    intent:
      "An immediately useful decision path with a human conversion experience.",
    preferredRecipes: ["care-editorial", "general-editorial"],
    requiresImage: false,
    navigation: "utility-pill",
    conversion: "embedded-qualifier",
    proof: "quiet-ledger",
    closing: "conversation-handoff",
    typography: "humanist-calm",
    imageStrategy: "human-context",
    rhythm: "conversational",
    motion: { profile: "restrained", engine: "css", maxPinnedScenes: 0 },
    mobile: "guided-stack",
    variants: [
      {
        id: "standard",
        label: "Editorial dialogue",
        affinity: ["humanist", "soft-sans", "refined-serif", "editorial"],
        hero: "editorial-dialogue",
        services: "service-chapters",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "trust",
          "about",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      {
        id: "portrait",
        label: "Guided portrait",
        affinity: [
          "sans",
          "geometric",
          "strong",
          "modern-serif",
          "heritage",
          "industrial",
          "condensed",
        ],
        hero: "guided-portrait",
        services: "service-grid",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "trust",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
    ],
  },
  "kinetic-poster": {
    packId: "kinetic-poster",
    intent:
      "Fast problem recognition, graphic service routing, and strong action hierarchy.",
    preferredRecipes: ["local-trades", "general-editorial"],
    requiresImage: false,
    navigation: "command-bar",
    conversion: "quick-request",
    proof: "evidence-strip",
    closing: "action-poster",
    typography: "graphic-impact",
    imageStrategy: "bold-documentary",
    rhythm: "kinetic",
    motion: { profile: "still", engine: "css", maxPinnedScenes: 0 },
    mobile: "poster-stack",
    variants: [
      {
        id: "standard",
        label: "Poster split",
        affinity: ["condensed", "geometric", "industrial"],
        hero: "poster-split",
        services: "diagnostic-list",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "coverage",
          "process",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      {
        id: "full-bleed",
        label: "Full bleed",
        affinity: [
          "strong",
          "sans",
          "editorial",
          "modern-serif",
          "heritage",
          "humanist",
          "soft-sans",
          "refined-serif",
        ],
        hero: "poster-full-bleed",
        services: "problem-grid",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "process",
          "coverage",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
    ],
  },
};

const packIds = Object.keys(packs) as ExperiencePackId[];

const AVOIDANCE_PENALTY = 20;

// Intake brand notes can prohibit a specific visual language. These rules map
// explicit negative direction onto the pack signatures it describes, so the
// selection respects the brief instead of shipping the prohibited pattern.
const avoidanceRules: readonly {
  pattern: RegExp;
  packIds: readonly ExperiencePackId[];
}[] = [
  {
    pattern: /\b(?:utility[-\s]?pill|pill\s+nav(?:bar)?|white\s+pill)\b/iu,
    packIds: ["bold-utility"],
  },
  {
    pattern: /\b(?:pale\s+arch|arch\s+(?:hero|panel))\b/iu,
    packIds: ["bold-utility"],
  },
  {
    pattern: /\bguided[-\s]conversation\b/iu,
    packIds: ["bold-utility"],
  },
  {
    pattern: /\bcentered\s+(?:split[-\s]?card|split|card)\b/iu,
    packIds: ["bold-utility"],
  },
  {
    pattern: /\bcommand[-\s]bar\b/iu,
    packIds: ["kinetic-poster"],
  },
  {
    pattern: /\bposter[-\s]split\b/iu,
    packIds: ["kinetic-poster"],
  },
];

export function avoidPackIdsFromNotes(
  notes: unknown,
): readonly ExperiencePackId[] {
  const text = String(notes || "").toLowerCase();
  if (!text) return [];
  const avoid = new Set<ExperiencePackId>();
  for (const rule of avoidanceRules)
    if (rule.pattern.test(text)) rule.packIds.forEach((id) => avoid.add(id));
  return [...avoid];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function canonicalPackId(value: unknown): ExperiencePackId | undefined {
  if (typeof value !== "string") return undefined;
  if (value in packs) return value as ExperiencePackId;
  return legacyAliases[value as LegacyExperiencePackId];
}
function fingerprint(
  definition: PackDefinition,
  variant: PackVariantDefinition,
) {
  return [
    definition.packId,
    variant.id,
    definition.navigation,
    variant.hero,
    definition.conversion,
    variant.services,
    definition.proof,
    definition.closing,
    definition.typography,
    definition.imageStrategy,
    definition.rhythm,
    definition.motion.profile,
    definition.motion.engine,
    definition.motion.maxPinnedScenes,
    definition.mobile,
    variant.sectionOrder.join("/"),
  ].join("|");
}
function asBlueprint(
  definition: PackDefinition,
  variant: PackVariantDefinition,
): ExperienceBlueprintV2 {
  return {
    version: 2,
    packId: definition.packId,
    variantId: variant.id,
    navigation: definition.navigation,
    hero: variant.hero,
    conversion: definition.conversion,
    services: variant.services,
    proof: definition.proof,
    closing: definition.closing,
    typography: definition.typography,
    imageStrategy: definition.imageStrategy,
    rhythm: definition.rhythm,
    motion: { ...definition.motion },
    sectionOrder: [...variant.sectionOrder],
    mobile: definition.mobile,
    fingerprint: fingerprint(definition, variant),
  };
}
function primaryVariant(definition: PackDefinition) {
  return definition.variants[0];
}
function findVariant(definition: PackDefinition, variantId: unknown) {
  if (typeof variantId !== "string") return undefined;
  return definition.variants.find((variant) => variant.id === variantId);
}
function compatibility(
  definition: PackDefinition,
  variant: PackVariantDefinition,
  site: SiteConfig,
  recipe: PageRecipe,
) {
  const diagnostics: string[] = [];
  const hasImage = Boolean(
    site.images.hero || site.images.secondary || site.assets?.photoOne,
  );
  if (definition.requiresImage && !hasImage)
    diagnostics.push(
      "This experience requires a verified business-relevant image.",
    );
  let score = definition.preferredRecipes.includes(recipe) ? 40 : 20;
  if (hasImage && definition.imageStrategy !== "human-context") score += 8;
  if (
    site.conversion?.guidedQualifier?.enabled &&
    definition.conversion === "embedded-qualifier"
  )
    score += 10;
  if (recipe === "local-trades" && variant.services === "diagnostic-list")
    score += 12;
  if (recipe === "care-editorial" && definition.typography === "humanist-calm")
    score += 12;
  return { score: diagnostics.length ? -1 : score, diagnostics };
}
function seedFor(site: SiteConfig) {
  return [
    site.business.name,
    site.businessKind || "business",
    site.industry || site.preset,
    site.style.tone,
    site.services.map((service) => service.name).join("|"),
  ].join("|");
}

function routeAffinity(
  blueprint: ExperienceBlueprintV2,
  route: ExperienceRoutePreference,
) {
  const haystack = [
    route.navigation,
    route.heroGeometry,
    route.servicePresentation,
    route.sectionRhythm,
    route.typographyCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return 0;
  const tokens = [
    blueprint.navigation,
    blueprint.hero,
    blueprint.conversion,
    blueprint.services,
    blueprint.proof,
    blueprint.closing,
    blueprint.typography,
    blueprint.rhythm,
    blueprint.imageStrategy,
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 3);
  return new Set(tokens.filter((token) => haystack.includes(token))).size;
}

const ROUTE_BONUS_LIMIT = 3;

function routeBonus(
  blueprint: ExperienceBlueprintV2,
  routes: readonly ExperienceRoutePreference[],
) {
  return routes.reduce(
    (best, route) =>
      Math.max(best, Math.min(routeAffinity(blueprint, route), ROUTE_BONUS_LIMIT)),
    0,
  );
}

export function compileExperienceCandidates(
  site: SiteConfig,
  recipe: PageRecipe,
  options: {
    recentFingerprints?: readonly string[];
    maxCandidates?: number;
    typography?: DesignTypography;
    routePreferences?: readonly ExperienceRoutePreference[];
    avoidPackIds?: readonly ExperiencePackId[];
  } = {},
): readonly ExperienceCandidate[] {
  const seed = seedFor(site);
  const offset = stableHash(seed) % packIds.length;
  const recent = new Set(options.recentFingerprints || []);
  const maxCandidates = Math.max(packIds.length, options.maxCandidates ?? 6);
  const routePreferences = options.routePreferences || [];
  const avoidPackIds = new Set(options.avoidPackIds || []);
  const candidates: ExperienceCandidate[] = [];
  packIds.forEach((packId, index) => {
    const definition = packs[packId];
    const preferredVariantIndex =
      stableHash(`${seed}|${packId}`) % definition.variants.length;
    definition.variants.forEach((variant, variantIndex) => {
      const result = compatibility(definition, variant, site, recipe);
      const blueprint = asBlueprint(definition, variant);
      const rotationPenalty =
        (index - offset + packIds.length) % packIds.length;
      const recencyPenalty = recent.has(blueprint.fingerprint) ? 15 : 0;
      const variantPenalty = variantIndex === preferredVariantIndex ? 0 : 4;
      const affinityBonus =
        options.typography && variant.affinity.includes(options.typography)
          ? 4
          : 0;
      const blueprintRouteBonus = routeBonus(blueprint, routePreferences);
      const avoidPenalty = avoidPackIds.has(packId) ? AVOIDANCE_PENALTY : 0;
      const compatibilityScore =
        result.score < 0
          ? result.score
          : Math.max(
              0,
              result.score -
                rotationPenalty -
                recencyPenalty -
                variantPenalty +
                affinityBonus +
                blueprintRouteBonus -
                avoidPenalty,
            );
      candidates.push({
        packId,
        variantId: variant.id,
        blueprint,
        compatibilityScore,
        diagnostics: result.diagnostics,
      });
    });
  });
  candidates.sort(
    (left, right) =>
      right.compatibilityScore - left.compatibilityScore ||
      packIds.indexOf(left.packId) - packIds.indexOf(right.packId) ||
      left.variantId.localeCompare(right.variantId),
  );
  const selected: ExperienceCandidate[] = [];
  const taken = new Set<ExperienceCandidate>();
  // Route preferences front-load one candidate per inspiration route, so the
  // bakeoff compares structurally different directions instead of near
  // duplicates. The deterministic score still decides the final winner.
  for (const route of routePreferences) {
    const best = candidates
      .filter(
        (candidate) =>
          candidate.compatibilityScore >= 0 && !taken.has(candidate),
      )
      .sort(
        (left, right) =>
          routeAffinity(right.blueprint, route) -
            routeAffinity(left.blueprint, route) ||
          right.compatibilityScore - left.compatibilityScore ||
          packIds.indexOf(left.packId) - packIds.indexOf(right.packId),
      )[0];
    if (!best) continue;
    taken.add(best);
    selected.push(best);
  }
  const selectedPacks = new Set(selected.map((candidate) => candidate.packId));
  for (const candidate of candidates) {
    if (candidate.compatibilityScore < 0 || taken.has(candidate)) continue;
    if (selectedPacks.has(candidate.packId)) continue;
    taken.add(candidate);
    selected.push(candidate);
    selectedPacks.add(candidate.packId);
  }
  for (const candidate of candidates) {
    if (selected.length >= maxCandidates) break;
    if (candidate.compatibilityScore < 0 || taken.has(candidate)) continue;
    taken.add(candidate);
    selected.push(candidate);
  }
  for (const candidate of candidates) {
    if (candidate.compatibilityScore >= 0) continue;
    selected.push(candidate);
  }
  return selected;
}

export function selectExperiencePackId({
  recipe,
  seed,
  requested,
  recentFingerprints = [],
  hasImage = true,
  avoidPackIds = [],
}: {
  recipe: PageRecipe;
  seed: string;
  requested?: unknown;
  recentFingerprints?: readonly string[];
  hasImage?: boolean;
  avoidPackIds?: readonly ExperiencePackId[];
}): ExperiencePackId {
  const requestedId = canonicalPackId(requested);
  if (requestedId && (!packs[requestedId].requiresImage || hasImage))
    return requestedId;
  const offset = stableHash(seed) % packIds.length;
  const recent = new Set(recentFingerprints);
  const avoided = new Set(avoidPackIds);
  return packIds
    .filter((id) => hasImage || !packs[id].requiresImage)
    .sort((left, right) => {
      const score = (id: ExperiencePackId) =>
        ((packIds.indexOf(id) - offset + packIds.length) % packIds.length) -
        (packs[id].preferredRecipes.includes(recipe) ? 0.5 : 0) +
        (recent.has(fingerprint(packs[id], primaryVariant(packs[id])))
          ? 100
          : 0) +
        (avoided.has(id) ? AVOIDANCE_PENALTY : 0);
      return score(left) - score(right);
    })[0];
}

export function selectExperienceVariantId({
  packId,
  typography,
}: {
  packId: ExperiencePackId | string;
  typography?: DesignTypography;
}): string {
  const definition = packs[packId as ExperiencePackId];
  if (!definition) return "standard";
  if (typography) {
    const match = definition.variants.find((variant) =>
      variant.affinity.includes(typography),
    );
    if (match) return match.id;
  }
  return primaryVariant(definition).id;
}

function validate(program: ExperienceBlueprintV2) {
  const diagnostics: string[] = [];
  const required: ExperienceSection[] = [
    "hero",
    "conversion",
    "services",
    "faq",
    "contact",
  ];
  if (program.sectionOrder[0] !== "hero")
    diagnostics.push("The opening must remain first.");
  if (program.sectionOrder.indexOf("conversion") > 1)
    diagnostics.push("Conversion must immediately follow the opening.");
  for (const section of required)
    if (!program.sectionOrder.includes(section))
      diagnostics.push(`The ${section} section is required.`);
  if (new Set(program.sectionOrder).size !== program.sectionOrder.length)
    diagnostics.push("The section order contains duplicates.");
  if (program.motion.maxPinnedScenes > 1)
    diagnostics.push("Only one pinned motion scene is allowed.");
  if (!program.variantId) diagnostics.push("The variant is required.");
  return diagnostics;
}

function contentFor(site: SiteConfig): ExperienceContent {
  const copy = site.copy || {};
  const socialProofPoints = (site.socialProof?.points || []).filter(Boolean);
  const fallbackProofPoints = (site.socialProof?.fallback?.points || []).filter(
    Boolean,
  );
  const hasLiveGoogleProof = Boolean(
    site.socialProof?.source === "google_reviews" &&
      site.socialProof.google?.apiUrl &&
      site.socialProof.google?.token,
  );
  const hospitalityArea =
    site.business.primaryCity || site.business.serviceAreas[0] || "the local area";
  const eventOrderServices = site.services
    .filter((service) => /cater|cake|event/iu.test(service.name))
    .map((service) => service.name.toLocaleLowerCase());
  return {
    brand: {
      name: site.business.name,
      logo: site.assets?.logo,
      phone: site.business.phone,
      email: site.business.email,
      address: site.business.address,
      serviceAreas: site.business.serviceAreas,
    },
    hero: {
      kicker:
        copy.heroKicker || site.business.serviceAreas[0] || "Local service",
      heading: copy.heroHeading || site.business.tagline,
      body: copy.heroBody || site.business.description,
      primaryLabel: site.business.primaryCta,
      image:
        site.assets?.photoOne ||
        site.images.hero ||
        site.images.secondary,
      secondaryImage: site.assets?.photoTwo || site.images.secondary,
      tertiaryImage: site.assets?.photoThree || site.images.tertiary || "",
      offer: site.business.offer,
    },
    services: site.services,
    proof: site.differentiators.filter(Boolean).slice(0, 3),
    process: (site.conversion?.process || []).slice(0, 4),
    faqs: (site.conversion?.faqs || []).slice(0, 8),
    locations: site.locations,
    coverageHeading: site.industry === "home-services"
      ? "Service in nearby communities."
      : site.industry === "wellness"
        ? "Areas the practice serves."
        : site.industry === "hospitality"
          ? `Local to ${hospitalityArea}.`
          : "Support across the local area.",
    coverageIntro: site.industry === "hospitality"
      ? eventOrderServices.length
        ? `Ask about ${eventOrderServices.join(" or ")} for a gathering.`
        : "Ask about location details and current availability."
      : "Share the address you have in mind so the team can confirm service for your location.",
    copy,
    businessDescription: site.business.description,
    showLocationMap:
      site.business.primaryCta.trim().toLowerCase() === "get directions" &&
      (Boolean(site.business.placeId?.trim()) ||
        /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(site.business.address.trim())),
    hasSocialProof:
      socialProofPoints.length > 0 ||
      fallbackProofPoints.length > 0 ||
      hasLiveGoogleProof,
    socialProof: site.socialProof
      ? {
          source: site.socialProof.source,
          heading:
            site.socialProof.heading ||
            site.socialProof.fallback?.heading ||
            "",
          intro:
            site.socialProof.intro ||
            site.socialProof.fallback?.intro ||
            "",
          points: (
            site.socialProof.source === "google_reviews"
              ? fallbackProofPoints
              : socialProofPoints
          ).slice(0, 4),
        }
      : null,
  };
}

export function listExperiencePacks() {
  return packIds.map((id) => {
    const definition = packs[id];
    return {
      ...asBlueprint(definition, primaryVariant(definition)),
      intent: definition.intent,
      preferredRecipes: [...definition.preferredRecipes],
      requiresImage: definition.requiresImage,
      variants: definition.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        hero: variant.hero,
        services: variant.services,
        sectionOrder: [...variant.sectionOrder],
        fingerprint: fingerprint(definition, variant),
      })),
    };
  });
}

export function compileExperiencePack(
  site: SiteConfig,
  recipe: PageRecipe,
  options: { recentFingerprints?: readonly string[] } = {},
): CompiledExperience {
  const requested = site.design?.experience?.packId;
  const requestedId = canonicalPackId(requested);
  const requestedVariantId = site.design?.experience?.variantId;
  const candidates = compileExperienceCandidates(site, recipe, options);
  const requestedPack = requestedId ? packs[requestedId] : undefined;
  const requestedVariant = requestedPack
    ? findVariant(requestedPack, requestedVariantId)
    : undefined;
  const chosen =
    (requestedId && requestedPack
      ? candidates.find(
          (candidate) =>
            candidate.packId === requestedId &&
            candidate.variantId ===
              (requestedVariant?.id || primaryVariant(requestedPack).id) &&
            candidate.compatibilityScore >= 0,
        )
      : undefined) ||
    candidates.find((candidate) => candidate.compatibilityScore >= 0);
  if (!chosen)
    throw new Error(
      "No compatible production experience pack is available for this intake.",
    );
  const validation = validate(chosen.blueprint);
  if (validation.length)
    throw new Error(`Invalid experience pack: ${validation.join(" ")}`);
  return {
    program: chosen.blueprint,
    content: contentFor(site),
    source: requestedId === chosen.packId ? "requested" : "selected",
    diagnostics: [
      ...(requested && !requestedId
        ? [
            `Unknown experience pack '${String(requested)}' was replaced safely.`,
          ]
        : []),
      ...(requestedId && requestedId !== chosen.packId
        ? [
            `Experience pack '${requestedId}' was incompatible with verified assets and was replaced safely.`,
          ]
        : []),
      ...(requestedVariantId && requestedPack && !requestedVariant
        ? [
            `Unknown experience variant '${String(requestedVariantId)}' was replaced safely.`,
          ]
        : []),
      ...(requestedVariant &&
      requestedId === chosen.packId &&
      requestedVariant.id !== chosen.variantId
        ? [
            `Experience variant '${requestedVariant.id}' was incompatible and was replaced safely.`,
          ]
        : []),
    ],
  };
}
