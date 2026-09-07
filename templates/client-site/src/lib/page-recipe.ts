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

export function defaultRecipe(site: SiteConfig): PageRecipe {
  if (site.preset === "home-services" || site.industry === "home-services")
    return "local-trades";
  if (site.industry === "wellness") return "care-editorial";
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
  const sections = Array.isArray(requested)
    ? requested.filter((section) => {
        const valid = Boolean(
          section &&
          /^[a-z][a-z0-9-]{0,63}$/.test(section.id) &&
          section.variant &&
          sectionTypes.has(section.type) &&
          !usedIds.has(section.id),
        );
        if (valid) usedIds.add(section.id);
        return valid;
      })
    : [];
  const required = new Set(["hero", "services", "contact"]);
  const complete = [...required].every((type) =>
    sections.some((section) => section.type === type),
  );
  return { recipe, sections: complete ? sections : recipes[recipe] };
}

export const recipeSections = recipes;
