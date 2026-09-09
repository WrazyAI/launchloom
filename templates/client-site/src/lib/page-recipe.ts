import type { PageRecipe, PageSection, SiteConfig } from "./site";

const recipes: Record<PageRecipe, PageSection[]> = {
  "care-editorial": [
    { id: "opening", type: "hero", variant: "care-portrait" },
    { id: "reassurance", type: "trust", variant: "quiet" },
    { id: "care-options", type: "services", variant: "editorial" },
    { id: "care-story", type: "about", variant: "immersive" },
    { id: "care-process", type: "process", variant: "guided" },
    { id: "family-voices", type: "social-proof", variant: "editorial" },
    { id: "care-gallery", type: "gallery", variant: "editorial" },
    { id: "care-questions", type: "faq", variant: "editorial" },
    { id: "care-consultation", type: "contact", variant: "consultation" },
  ],
  "local-trades": [
    { id: "service-opening", type: "hero", variant: "trades-split" },
    { id: "service-proof", type: "trust", variant: "bold" },
    { id: "repair-options", type: "services", variant: "problem-led" },
    { id: "service-process", type: "process", variant: "numbered" },
    { id: "customer-proof", type: "social-proof", variant: "cards" },
    { id: "recent-work", type: "gallery", variant: "work" },
    { id: "service-area", type: "coverage", variant: "local" },
    { id: "service-questions", type: "faq", variant: "practical" },
    { id: "request-service", type: "contact", variant: "quote" },
  ],
  "general-editorial": [
    { id: "opening", type: "hero", variant: "editorial" },
    { id: "proof", type: "trust", variant: "quiet" },
    { id: "services", type: "services", variant: "editorial" },
    { id: "story", type: "about", variant: "immersive" },
    { id: "process", type: "process", variant: "guided" },
    { id: "social-proof", type: "social-proof", variant: "editorial" },
    { id: "questions", type: "faq", variant: "editorial" },
    { id: "contact", type: "contact", variant: "consultation" },
  ],
};

const sectionTypes = new Set(
  recipes["care-editorial"]
    .concat(recipes["local-trades"])
    .concat(recipes["general-editorial"])
    .map((section) => section.type),
);
const variantsByType: Record<PageSection["type"], Set<string>> = {
  hero: new Set(["care-portrait", "trades-split", "editorial", "centered"]),
  trust: new Set(["quiet", "bold"]),
  services: new Set(["editorial", "problem-led", "featured"]),
  about: new Set(["immersive", "compact"]),
  process: new Set(["guided", "numbered", "compact"]),
  "social-proof": new Set(["editorial", "cards"]),
  gallery: new Set(["editorial", "work"]),
  coverage: new Set(["local"]),
  faq: new Set(["editorial", "practical"]),
  contact: new Set(["consultation", "quote", "compact"]),
};

export function defaultRecipe(site: SiteConfig): PageRecipe {
  if (site.businessKind === "garage-door" || site.industry === "home-services")
    return "local-trades";
  if (site.businessKind === "home-care" || site.industry === "wellness")
    return "care-editorial";
  return "general-editorial";
}

export function resolvePageRecipe(site: SiteConfig): {
  recipe: PageRecipe;
  sections: PageSection[];
} {
  const recipe =
    site.design?.recipe && recipes[site.design.recipe]
      ? site.design.recipe
      : defaultRecipe(site);
  const requested = site.design?.sections;
  const usedIds = new Set<string>();
  const usedTypes = new Set<string>();
  const sections = Array.isArray(requested)
    ? requested.filter((section) => {
        const valid = Boolean(
          section &&
          /^[a-z][a-z0-9-]{0,63}$/.test(section.id) &&
          section.variant &&
          sectionTypes.has(section.type) &&
          variantsByType[section.type]?.has(section.variant) &&
          !usedIds.has(section.id) &&
          !usedTypes.has(section.type),
        );
        if (valid) {
          usedIds.add(section.id);
          usedTypes.add(section.type);
        }
        return valid;
      })
    : [];
  const required = new Set(["hero", "services", "contact"]);
  const complete = [...required].every((type) =>
    sections.some((section) => section.type === type),
  );
  const selected = complete ? sections : recipes[recipe];
  return {
    recipe,
    sections: selected.filter(
      (section) => section.type !== "social-proof" || Boolean(site.socialProof),
    ),
  };
}

export const recipeSections = recipes;
