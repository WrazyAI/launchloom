import type { PageRecipe, PageSectionType, SiteConfig } from "./site";

export type ExperiencePackId =
  "cinematic-narrative" | "bold-utility" | "kinetic-poster";
export type LegacyExperiencePackId =
  "editorial-folio" | "guided-conversation" | "service-led";
export type ExperienceSection = PageSectionType | "conversion" | "location-map";

export type ExperienceBlueprintV2 = Readonly<{
  version: 2;
  packId: ExperiencePackId;
  navigation: "minimal-inline" | "utility-pill" | "command-bar";
  hero: "image-narrative" | "editorial-dialogue" | "poster-split";
  conversion: "discovery-ribbon" | "embedded-qualifier" | "quick-request";
  services: "editorial-index" | "service-chapters" | "diagnostic-list";
  proof: "principle-line" | "quiet-ledger" | "evidence-strip";
  closing: "cinematic-inquiry" | "conversation-handoff" | "action-poster";
  typography: "editorial-contrast" | "humanist-calm" | "graphic-impact";
  imageStrategy: "narrative-crops" | "human-context" | "bold-documentary";
  rhythm: "cinematic" | "conversational" | "kinetic";
  motion: Readonly<{
    profile: "still" | "restrained" | "cinematic";
    engine: "css" | "native-scroll";
    maxPinnedScenes: 0 | 1;
  }>;
  sectionOrder: readonly ExperienceSection[];
  mobile: "editorial-stack" | "guided-stack" | "poster-stack";
  fingerprint: string;
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
    offer?: string;
  };
  services: readonly SiteConfig["services"][number][];
  proof: readonly string[];
  process: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  locations: readonly SiteConfig["locations"][number][];
  copy: NonNullable<SiteConfig["copy"]>;
  businessDescription: string;
  showLocationMap: boolean;
  hasSocialProof: boolean;
}>;

export type CompiledExperience = Readonly<{
  program: ExperienceBlueprintV2;
  content: ExperienceContent;
  source: "requested" | "selected";
  diagnostics: readonly string[];
}>;

export type ExperienceCandidate = Readonly<{
  packId: ExperiencePackId;
  blueprint: ExperienceBlueprintV2;
  compatibilityScore: number;
  diagnostics: readonly string[];
}>;

type PackDefinition = Omit<ExperienceBlueprintV2, "version" | "fingerprint"> & {
  intent: string;
  preferredRecipes: readonly PageRecipe[];
  requiresImage: boolean;
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
    hero: "image-narrative",
    conversion: "discovery-ribbon",
    services: "editorial-index",
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
  "bold-utility": {
    packId: "bold-utility",
    intent:
      "An immediately useful decision path with a human conversion experience.",
    preferredRecipes: ["care-editorial", "general-editorial"],
    requiresImage: false,
    navigation: "utility-pill",
    hero: "editorial-dialogue",
    conversion: "embedded-qualifier",
    services: "service-chapters",
    proof: "quiet-ledger",
    closing: "conversation-handoff",
    typography: "humanist-calm",
    imageStrategy: "human-context",
    rhythm: "conversational",
    motion: { profile: "restrained", engine: "css", maxPinnedScenes: 0 },
    mobile: "guided-stack",
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
  "kinetic-poster": {
    packId: "kinetic-poster",
    intent:
      "Fast problem recognition, graphic service routing, and strong action hierarchy.",
    preferredRecipes: ["local-trades", "general-editorial"],
    requiresImage: false,
    navigation: "command-bar",
    hero: "poster-split",
    conversion: "quick-request",
    services: "diagnostic-list",
    proof: "evidence-strip",
    closing: "action-poster",
    typography: "graphic-impact",
    imageStrategy: "bold-documentary",
    rhythm: "kinetic",
    motion: { profile: "still", engine: "css", maxPinnedScenes: 0 },
    mobile: "poster-stack",
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
};

const packIds = Object.keys(packs) as ExperiencePackId[];
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
function fingerprint(definition: PackDefinition) {
  return [
    definition.packId,
    definition.navigation,
    definition.hero,
    definition.conversion,
    definition.services,
    definition.proof,
    definition.closing,
    definition.typography,
    definition.imageStrategy,
    definition.rhythm,
    definition.motion.profile,
    definition.motion.engine,
    definition.motion.maxPinnedScenes,
    definition.mobile,
    definition.sectionOrder.join("/"),
  ].join("|");
}
function asBlueprint(definition: PackDefinition): ExperienceBlueprintV2 {
  return {
    ...definition,
    motion: { ...definition.motion },
    sectionOrder: [...definition.sectionOrder],
    version: 2,
    fingerprint: fingerprint(definition),
  };
}
function compatibility(
  definition: PackDefinition,
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
  if (recipe === "local-trades" && definition.services === "diagnostic-list")
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

export function compileExperienceCandidates(
  site: SiteConfig,
  recipe: PageRecipe,
  options: { recentFingerprints?: readonly string[] } = {},
): readonly ExperienceCandidate[] {
  const offset = stableHash(seedFor(site)) % packIds.length;
  const recent = new Set(options.recentFingerprints || []);
  return packIds
    .map((packId, index) => {
      const definition = packs[packId];
      const result = compatibility(definition, site, recipe);
      const blueprint = asBlueprint(definition);
      const rotationPenalty =
        (index - offset + packIds.length) % packIds.length;
      const recencyPenalty = recent.has(blueprint.fingerprint) ? 15 : 0;
      const compatibilityScore =
        result.score < 0
          ? result.score
          : Math.max(0, result.score - rotationPenalty - recencyPenalty);
      return {
        packId,
        blueprint,
        compatibilityScore,
        diagnostics: result.diagnostics,
      };
    })
    .sort((left, right) => right.compatibilityScore - left.compatibilityScore);
}

export function selectExperiencePackId({
  recipe,
  seed,
  requested,
  recentFingerprints = [],
  hasImage = true,
}: {
  recipe: PageRecipe;
  seed: string;
  requested?: unknown;
  recentFingerprints?: readonly string[];
  hasImage?: boolean;
}): ExperiencePackId {
  const requestedId = canonicalPackId(requested);
  if (requestedId && (!packs[requestedId].requiresImage || hasImage))
    return requestedId;
  const offset = stableHash(seed) % packIds.length;
  const recent = new Set(recentFingerprints);
  return packIds
    .filter((id) => hasImage || !packs[id].requiresImage)
    .sort((left, right) => {
      const score = (id: ExperiencePackId) =>
        ((packIds.indexOf(id) - offset + packIds.length) % packIds.length) -
        (packs[id].preferredRecipes.includes(recipe) ? 0.5 : 0) +
        (recent.has(fingerprint(packs[id])) ? 100 : 0);
      return score(left) - score(right);
    })[0];
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
      image: site.images.hero || site.images.secondary || site.assets?.photoOne,
      secondaryImage:
        site.images.secondary || site.assets?.photoTwo || site.images.hero,
      offer: site.business.offer,
    },
    services: site.services,
    proof: site.differentiators.filter(Boolean).slice(0, 3),
    process: (site.conversion?.process || []).slice(0, 4),
    faqs: (site.conversion?.faqs || []).slice(0, 8),
    locations: site.locations,
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
  };
}

export function listExperiencePacks() {
  return packIds.map((id) => ({
    ...packs[id],
    motion: { ...packs[id].motion },
    preferredRecipes: [...packs[id].preferredRecipes],
    sectionOrder: [...packs[id].sectionOrder],
    version: 2 as const,
    fingerprint: fingerprint(packs[id]),
  }));
}

export function compileExperiencePack(
  site: SiteConfig,
  recipe: PageRecipe,
  options: { recentFingerprints?: readonly string[] } = {},
): CompiledExperience {
  const requested = site.design?.experience?.packId;
  const requestedId = canonicalPackId(requested);
  const candidates = compileExperienceCandidates(site, recipe, options);
  const chosen =
    (requestedId
      ? candidates.find(
          (candidate) =>
            candidate.packId === requestedId &&
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
    ],
  };
}
