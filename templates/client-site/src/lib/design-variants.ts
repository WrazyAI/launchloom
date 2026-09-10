import type {
  DesignComposition,
  DesignTypography,
  PageRecipe,
  PageSection,
  SiteConfig,
} from "./site";

export type DesignVariantId =
  `care-${string}` | `trades-${string}` | `general-${string}`;

export type DesignVariant = Readonly<{
  id: DesignVariantId;
  recipe: PageRecipe;
  name: string;
  composition: DesignComposition;
  typography: DesignTypography;
  density: "compact" | "balanced" | "spacious";
  sections: readonly PageSection[];
  intent: string;
}>;

type VariantSeed = Omit<DesignVariant, "recipe" | "sections"> & {
  order: readonly PageSection["type"][];
  variants: Partial<Record<PageSection["type"], string>>;
};

const sectionDefaults: Record<
  PageRecipe,
  Record<PageSection["type"], string>
> = {
  "care-editorial": {
    hero: "care-portrait",
    trust: "quiet",
    services: "editorial",
    about: "immersive",
    process: "guided",
    "social-proof": "editorial",
    gallery: "editorial",
    coverage: "local",
    faq: "editorial",
    contact: "consultation",
  },
  "local-trades": {
    hero: "trades-split",
    trust: "bold",
    services: "problem-led",
    about: "compact",
    process: "numbered",
    "social-proof": "cards",
    gallery: "work",
    coverage: "local",
    faq: "practical",
    contact: "quote",
  },
  "general-editorial": {
    hero: "editorial",
    trust: "quiet",
    services: "editorial",
    about: "immersive",
    process: "guided",
    "social-proof": "editorial",
    gallery: "editorial",
    coverage: "local",
    faq: "editorial",
    contact: "consultation",
  },
};

const care: VariantSeed[] = [
  {
    id: "care-private-practice",
    name: "Private Practice",
    composition: "split",
    typography: "refined-serif",
    density: "spacious",
    intent: "Quiet consultation journey with a portrait-led opening.",
    order: [
      "hero",
      "trust",
      "services",
      "about",
      "process",
      "social-proof",
      "gallery",
      "faq",
      "contact",
    ],
    variants: { hero: "care-portrait", services: "editorial" },
  },
  {
    id: "care-modern-clinic",
    name: "Modern Clinic",
    composition: "asymmetric",
    typography: "humanist",
    density: "balanced",
    intent: "Clear modern hierarchy with calm asymmetry and direct next steps.",
    order: [
      "hero",
      "trust",
      "about",
      "services",
      "process",
      "faq",
      "social-proof",
      "contact",
    ],
    variants: { hero: "offset", services: "featured", about: "compact" },
  },
  {
    id: "care-wellness-journal",
    name: "Wellness Journal",
    composition: "magazine",
    typography: "heritage",
    density: "spacious",
    intent: "Editorial storytelling inspired by a considered print journal.",
    order: [
      "hero",
      "about",
      "services",
      "gallery",
      "process",
      "social-proof",
      "faq",
      "contact",
    ],
    variants: { hero: "editorial", services: "editorial" },
  },
  {
    id: "care-soft-focus",
    name: "Soft Focus",
    composition: "centered",
    typography: "soft-sans",
    density: "spacious",
    intent: "Warm centered invitation for sensitive care decisions.",
    order: ["hero", "trust", "about", "services", "process", "faq", "contact"],
    variants: { hero: "centered", services: "featured" },
  },
  {
    id: "care-concierge",
    name: "Concierge",
    composition: "framed",
    typography: "editorial",
    density: "balanced",
    intent: "Premium framed consultation path with restrained detail.",
    order: [
      "hero",
      "services",
      "about",
      "trust",
      "process",
      "social-proof",
      "faq",
      "contact",
    ],
    variants: { hero: "framed", contact: "compact" },
  },
  {
    id: "care-human-story",
    name: "Human Story",
    composition: "full-bleed",
    typography: "humanist",
    density: "balanced",
    intent:
      "Image-led narrative that foregrounds people without claiming identities.",
    order: [
      "hero",
      "about",
      "trust",
      "services",
      "gallery",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "full-bleed", about: "immersive" },
  },
  {
    id: "care-guided-path",
    name: "Guided Path",
    composition: "sidebar",
    typography: "modern-serif",
    density: "compact",
    intent: "Structured care options with a persistent decision path.",
    order: ["hero", "services", "process", "trust", "faq", "about", "contact"],
    variants: { hero: "compact", services: "sidebar" },
  },
  {
    id: "care-restorative",
    name: "Restorative",
    composition: "stacked",
    typography: "refined-serif",
    density: "spacious",
    intent: "Slow, spacious sequence with alternating content bands.",
    order: [
      "hero",
      "trust",
      "services",
      "about",
      "gallery",
      "social-proof",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "stacked", services: "list" },
  },
  {
    id: "care-studio",
    name: "Care Studio",
    composition: "mosaic",
    typography: "geometric",
    density: "balanced",
    intent:
      "Contemporary visual rhythm for modern wellness and consultation brands.",
    order: [
      "hero",
      "gallery",
      "services",
      "trust",
      "about",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "mosaic", services: "mosaic" },
  },
];

const trades: VariantSeed[] = [
  {
    id: "trades-dispatch",
    name: "Dispatch",
    composition: "split",
    typography: "strong",
    density: "compact",
    intent: "Immediate problem, phone, coverage, and service clarity.",
    order: [
      "hero",
      "trust",
      "services",
      "process",
      "gallery",
      "coverage",
      "social-proof",
      "faq",
      "contact",
    ],
    variants: { hero: "trades-split", services: "problem-led" },
  },
  {
    id: "trades-field-report",
    name: "Field Report",
    composition: "magazine",
    typography: "condensed",
    density: "compact",
    intent:
      "Workmanlike editorial layout focused on symptoms and visible work.",
    order: [
      "hero",
      "services",
      "gallery",
      "process",
      "trust",
      "coverage",
      "faq",
      "contact",
    ],
    variants: { hero: "editorial", services: "list" },
  },
  {
    id: "trades-neighborhood",
    name: "Neighborhood",
    composition: "centered",
    typography: "humanist",
    density: "balanced",
    intent:
      "Friendly local positioning with coverage and reassurance up front.",
    order: [
      "hero",
      "coverage",
      "trust",
      "services",
      "process",
      "social-proof",
      "faq",
      "contact",
    ],
    variants: { hero: "centered", services: "featured" },
  },
  {
    id: "trades-emergency-line",
    name: "Emergency Line",
    composition: "full-bleed",
    typography: "industrial",
    density: "compact",
    intent:
      "High-contrast action path for urgent service categories without invented urgency claims.",
    order: [
      "hero",
      "services",
      "trust",
      "coverage",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "full-bleed", services: "problem-led" },
  },
  {
    id: "trades-craftsman",
    name: "Craftsman",
    composition: "framed",
    typography: "heritage",
    density: "balanced",
    intent: "Measured craft-led presentation for specialist local work.",
    order: [
      "hero",
      "about",
      "services",
      "gallery",
      "process",
      "trust",
      "coverage",
      "faq",
      "contact",
    ],
    variants: { hero: "framed", services: "editorial" },
  },
  {
    id: "trades-service-menu",
    name: "Service Menu",
    composition: "sidebar",
    typography: "sans",
    density: "compact",
    intent: "Dense but readable service navigation for broad catalogs.",
    order: [
      "hero",
      "services",
      "coverage",
      "trust",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "compact", services: "sidebar" },
  },
  {
    id: "trades-project-led",
    name: "Project Led",
    composition: "mosaic",
    typography: "geometric",
    density: "balanced",
    intent: "Photography and project categories lead the decision journey.",
    order: [
      "hero",
      "gallery",
      "services",
      "trust",
      "process",
      "coverage",
      "faq",
      "contact",
    ],
    variants: { hero: "mosaic", services: "mosaic" },
  },
  {
    id: "trades-proof-first",
    name: "Proof First",
    composition: "asymmetric",
    typography: "strong",
    density: "balanced",
    intent:
      "Verified proof and service fit appear before the deeper explanation.",
    order: [
      "hero",
      "trust",
      "social-proof",
      "services",
      "gallery",
      "process",
      "coverage",
      "faq",
      "contact",
    ],
    variants: { hero: "offset", services: "featured" },
  },
  {
    id: "trades-straight-talk",
    name: "Straight Talk",
    composition: "stacked",
    typography: "soft-sans",
    density: "spacious",
    intent:
      "Plain-language bands with generous scanning room and clear actions.",
    order: [
      "hero",
      "services",
      "process",
      "coverage",
      "trust",
      "faq",
      "contact",
    ],
    variants: { hero: "stacked", services: "list" },
  },
];

const general: VariantSeed[] = [
  {
    id: "general-editorial-house",
    name: "Editorial House",
    composition: "magazine",
    typography: "editorial",
    density: "spacious",
    intent:
      "Expressive story-led composition for hospitality and creative services.",
    order: [
      "hero",
      "about",
      "services",
      "gallery",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "editorial", services: "editorial" },
  },
  {
    id: "general-product-studio",
    name: "Product Studio",
    composition: "mosaic",
    typography: "geometric",
    density: "balanced",
    intent: "Visual product rhythm with modular offerings and strong imagery.",
    order: ["hero", "gallery", "services", "trust", "about", "faq", "contact"],
    variants: { hero: "mosaic", services: "mosaic" },
  },
  {
    id: "general-neighborhood-shop",
    name: "Neighborhood Shop",
    composition: "centered",
    typography: "humanist",
    density: "balanced",
    intent: "Welcoming local-first hierarchy for everyday destinations.",
    order: ["hero", "trust", "services", "about", "gallery", "faq", "contact"],
    variants: { hero: "centered", services: "featured" },
  },
  {
    id: "general-maker",
    name: "Maker",
    composition: "framed",
    typography: "heritage",
    density: "spacious",
    intent: "Craft and provenance presented with a tactile framed structure.",
    order: [
      "hero",
      "about",
      "gallery",
      "services",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "framed", services: "list" },
  },
  {
    id: "general-bold-launch",
    name: "Bold Launch",
    composition: "full-bleed",
    typography: "strong",
    density: "compact",
    intent: "Confident launch-oriented opening with a focused conversion path.",
    order: ["hero", "services", "trust", "about", "faq", "contact"],
    variants: { hero: "full-bleed", services: "problem-led" },
  },
  {
    id: "general-modern-office",
    name: "Modern Office",
    composition: "split",
    typography: "sans",
    density: "balanced",
    intent: "Crisp professional split layout with measured authority.",
    order: ["hero", "trust", "services", "process", "about", "faq", "contact"],
    variants: { hero: "trades-split", services: "editorial" },
  },
  {
    id: "general-service-guide",
    name: "Service Guide",
    composition: "sidebar",
    typography: "modern-serif",
    density: "compact",
    intent: "Decision-support format for a complex or broad offering.",
    order: ["hero", "services", "faq", "process", "about", "contact"],
    variants: { hero: "compact", services: "sidebar" },
  },
  {
    id: "general-human-brand",
    name: "Human Brand",
    composition: "asymmetric",
    typography: "soft-sans",
    density: "spacious",
    intent:
      "Approachable storytelling balanced with concise commercial clarity.",
    order: ["hero", "about", "trust", "services", "gallery", "faq", "contact"],
    variants: { hero: "offset", services: "featured" },
  },
  {
    id: "general-catalog",
    name: "Curated Catalog",
    composition: "stacked",
    typography: "refined-serif",
    density: "balanced",
    intent: "Elegant vertical catalog with distinct offering bands.",
    order: [
      "hero",
      "services",
      "gallery",
      "about",
      "process",
      "faq",
      "contact",
    ],
    variants: { hero: "stacked", services: "list" },
  },
];

const recipeSeeds: Record<PageRecipe, VariantSeed[]> = {
  "care-editorial": care,
  "local-trades": trades,
  "general-editorial": general,
};

function stableSectionId(
  recipe: PageRecipe,
  type: PageSection["type"],
): string {
  const prefix =
    recipe === "care-editorial"
      ? "care"
      : recipe === "local-trades"
        ? "service"
        : "site";
  return `${prefix}-${type.replace("social-proof", "proof")}`;
}

const registry: readonly DesignVariant[] = Object.entries(recipeSeeds).flatMap(
  ([recipe, seeds]) =>
    seeds.map((seed) => ({
      ...seed,
      recipe: recipe as PageRecipe,
      sections: seed.order.map((type) => ({
        id: stableSectionId(recipe as PageRecipe, type),
        type,
        variant:
          seed.variants[type] || sectionDefaults[recipe as PageRecipe][type],
      })),
    })),
);

const registryById = new Map(registry.map((variant) => [variant.id, variant]));

export function listDesignVariants(
  recipe?: PageRecipe,
): readonly DesignVariant[] {
  return recipe
    ? registry.filter((variant) => variant.recipe === recipe)
    : registry;
}

export function getDesignVariant(id?: string): DesignVariant | null {
  return id ? registryById.get(id as DesignVariantId) || null : null;
}

export function selectDesignVariant(
  recipe: PageRecipe,
  seed: string,
): DesignVariant {
  const candidates = listDesignVariants(recipe);
  let hash = 2166136261;
  for (const character of seed.trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return candidates[(hash >>> 0) % candidates.length];
}

export function variantForSite(
  site: SiteConfig,
  recipe: PageRecipe,
): DesignVariant | null {
  const configured = getDesignVariant(site.design?.variantId);
  return configured?.recipe === recipe ? configured : null;
}
