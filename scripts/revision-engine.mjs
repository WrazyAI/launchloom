import { parseModelJson } from "./model-json.mjs";
import { resolvePalette } from "./palette-policy.mjs";
import {
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";

const COPY_FIELDS = new Set([
  "heroKicker",
  "heroHeading",
  "heroBody",
  "servicesHeading",
  "servicesIntro",
  "aboutKicker",
  "aboutHeading",
  "aboutBody",
  "contactKicker",
  "contactHeading",
  "processKicker",
  "processHeading",
  "faqKicker",
  "faqHeading",
  "formIntro",
]);
const COPY_RENDER_TARGETS = {
  heroKicker: {
    route: "/",
    sectionType: "hero",
    placement: "hero-eyebrow",
    tags: ["span", "p"],
  },
  heroHeading: {
    route: "/",
    sectionType: "hero",
    placement: "hero-heading",
    tags: ["h1"],
  },
  heroBody: {
    route: "/",
    sectionType: "hero",
    placement: "hero-copy",
    tags: ["p"],
  },
  servicesHeading: {
    route: "/services/",
    sectionClass: "inner-hero",
    placement: "inner-hero-heading",
    tags: ["h1"],
  },
  servicesIntro: {
    route: "/services/",
    sectionClass: "inner-hero",
    placement: "inner-hero-copy",
    tags: ["p"],
  },
  aboutKicker: {
    route: "/about/",
    sectionClass: "inner-hero",
    placement: "inner-hero-eyebrow",
    tags: ["span"],
  },
  aboutHeading: {
    route: "/about/",
    sectionClass: "inner-hero",
    placement: "inner-hero-heading",
    tags: ["h1"],
  },
  aboutBody: {
    route: "/about/",
    sectionClass: "inner-hero",
    placement: "inner-hero-copy",
    tags: ["p"],
  },
  contactKicker: {
    route: "/contact/",
    sectionClass: "inner-hero",
    placement: "inner-hero-eyebrow",
    tags: ["span"],
  },
  contactHeading: {
    route: "/contact/",
    sectionClass: "inner-hero",
    placement: "inner-hero-heading",
    tags: ["h1"],
  },
  processKicker: {
    route: "/",
    sectionType: "process",
    placement: "section-kicker",
    tags: ["span", "p"],
  },
  processHeading: {
    route: "/",
    sectionType: "process",
    placement: "section-heading",
    tags: ["h2"],
  },
  faqKicker: {
    route: "/",
    sectionType: "faq",
    placement: "section-kicker",
    tags: ["span", "p"],
  },
  faqHeading: {
    route: "/",
    sectionType: "faq",
    placement: "section-heading",
    tags: ["h2"],
  },
  formIntro: {
    route: "/contact/",
    sectionClass: "inner-hero",
    placement: "inner-hero-copy",
    tags: ["p"],
  },
};
const RENDERED_SECTION_ALIASES = {
  hero: ["opening", "banner"],
  services: ["service"],
  about: ["story", "team"],
  process: ["steps"],
  faq: ["faqs", "questions"],
};

const PALETTE_KEYS = [
  "primaryColor",
  "surfaceColor",
  "heroColor",
  "inkColor",
  "mutedColor",
  "lineColor",
];
const COLOR_ROLE_KEYS = {
  primary: "primaryColor",
  surface: "surfaceColor",
  hero: "heroColor",
  ink: "inkColor",
  muted: "mutedColor",
  line: "lineColor",
  accent: "accentColor",
};
// Replacement images are materialized into the client repository by the
// revision workflow. The engine only accepts local feedback asset paths so a
// crafted comment can never point the config at an arbitrary URL.
const IMAGE_TARGET_FIELDS = {
  logo: { assets: "logo" },
  hero: { images: "hero", assets: "photoOne" },
  secondary: { images: "secondary", assets: "photoTwo" },
  tertiary: { images: "tertiary", assets: "photoThree" },
  team: { assets: "teamPhoto" },
};
const FEEDBACK_IMAGE_PATH = /^\/images\/feedback\/[a-z0-9-]+\.webp$/u;
const MODEL_OPERATION_KINDS = new Set([
  "set_copy",
  "set_service_copy",
  "set_process",
  "set_faqs",
  "set_section_enabled",
  "reorder_section",
  "set_section_variant",
  "set_design_treatment",
  "set_conversion_feature",
]);
const CONVERSION_FEATURES = new Set([
  "guidedQualifier",
  "quickAnswers",
  "aiChat",
  "exitOffer",
]);
const SECTION_VARIANTS = {
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
const SECTION_ALIASES = new Map([
  ["hero", "hero"],
  ["opening", "hero"],
  ["banner", "hero"],
  ["trust", "trust"],
  ["proof", "trust"],
  ["benefits", "trust"],
  ["services", "services"],
  ["service", "services"],
  ["about", "about"],
  ["story", "about"],
  ["team", "about"],
  ["process", "process"],
  ["steps", "process"],
  ["how it works", "process"],
  ["testimonials", "social-proof"],
  ["reviews", "social-proof"],
  ["social proof", "social-proof"],
  ["gallery", "gallery"],
  ["photos", "gallery"],
  ["recent work", "gallery"],
  ["coverage", "coverage"],
  ["service area", "coverage"],
  ["locations", "coverage"],
  ["faq", "faq"],
  ["faqs", "faq"],
  ["questions", "faq"],
  ["contact", "contact"],
  ["form", "contact"],
  ["quote", "contact"],
  ["consultation", "contact"],
]);
const DEFAULT_SECTIONS = {
  "care-editorial": [
    ["opening", "hero", "care-portrait"],
    ["reassurance", "trust", "quiet"],
    ["care-options", "services", "editorial"],
    ["care-story", "about", "immersive"],
    ["care-process", "process", "guided"],
    ["family-voices", "social-proof", "editorial"],
    ["care-gallery", "gallery", "editorial"],
    ["care-questions", "faq", "editorial"],
    ["care-consultation", "contact", "consultation"],
  ],
  "local-trades": [
    ["service-opening", "hero", "trades-split"],
    ["service-proof", "trust", "bold"],
    ["repair-options", "services", "problem-led"],
    ["service-process", "process", "numbered"],
    ["customer-proof", "social-proof", "cards"],
    ["recent-work", "gallery", "work"],
    ["service-area", "coverage", "local"],
    ["service-questions", "faq", "practical"],
    ["request-service", "contact", "quote"],
  ],
  "general-editorial": [
    ["opening", "hero", "editorial"],
    ["proof", "trust", "quiet"],
    ["services", "services", "editorial"],
    ["story", "about", "immersive"],
    ["process", "process", "guided"],
    ["social-proof", "social-proof", "editorial"],
    ["questions", "faq", "editorial"],
    ["contact", "contact", "consultation"],
  ],
};
const SHARED_RECIPE_VARIANTS = {
  hero: ["centered"],
  services: ["featured"],
  about: ["compact"],
  process: ["compact"],
  contact: ["compact"],
};

const socialProofRequest =
  /\b(testimonials?|testimony|testimonies|review section|google reviews?|customer reviews?|client reviews?|social proof)\b/i;
const brandNameRequest =
  /\b(company|business|brand) name\b.{0,80}\b(nav|header|logo|navbar)\b|\b(nav|header|logo|navbar)\b.{0,80}\b(company|business|brand) name\b/i;
const colorRequest = /\b(colou?rs?|color palette|palette|brand colors?)\b/i;
const broadLayoutRequest =
  /\b(?:redesign|rework|refresh|improve|change|update|revise|strengthen)\b.{0,60}\b(?:layout|page structure|visual hierarchy|composition)\b|\b(?:layout|page structure|visual hierarchy|composition)\b.{0,60}\b(?:redesign|rework|refresh|improve|change|update|revise|strengthen)\b/i;
const globalLayoutScope =
  /\b(?:globally|site[- ]wide|page[- ]wide|whole (?:website|site|page)|entire (?:website|site|page)|throughout (?:the )?(?:site|page|website)|across (?:the )?(?:whole|entire) (?:site|page|website)|all sections|every section|across the board|overall (?:website|site|page|layout|composition|design|look|style))\b/i;
const scopedLayoutRequest =
  /\b(?:layout|composition|spacing|spacious|compact|density|tight(?:er)?|gaps?|font|typography|variant|center(?:ed)?|align(?:ment|ed)?|move|reorder|above|below|before|after|hide|remove|show|add|include|enable|disable|style|visual|imagery|premium|cinematic|asymmetrical|editorial|practical|featured|problem[- ]led|immersive|guided|quiet|numbered|cards?|work|local|consultation)\b/i;
const layoutRequest =
  /\b(layout|reorder|move|above|below|before|after|hide|remove|show|add|section|spacing|spacious|compact|density|typography|font|modern|editorial|bold|immersive|center(?:ed)?)\b/i;
const contentRequest =
  /\b(copy|wording|text|headline|heading|kicker|description|intro|service card|form intro)\b|(?:rewrite|revise|edit|change|update|clarify|expand|shorten|simplify|condense).{0,50}\b(faq|question|answer|process|step|hero|opening)\b|\b(faq|question|answer|process|step|hero|opening)\b.{0,50}(?:say|read|explain|mention|shorter|simpler|concise|bloated|too long)\b/i;
const COPY_FIELD_TARGETS = [
  [
    "heroHeading",
    /\b(?:hero|opening)(?:\s+(?:section|main))?\s+(?:heading|headline|title|h1)\b|\b(?:heading|headline|title|h1)\s+(?:for|in|of)\s+(?:the\s+)?(?:hero|opening)\b/i,
  ],
  [
    "heroBody",
    /\b(?:hero|opening)(?:\s+section)?\s+(?:body|paragraph|description|intro)\b|\b(?:body|paragraph|description|intro)\s+(?:for|in|of)\s+(?:the\s+)?(?:hero|opening)\b/i,
  ],
  [
    "heroKicker",
    /\b(?:hero|opening)(?:\s+section)?\s+(?:kicker|eyebrow|label)\b|\b(?:kicker|eyebrow|label)\s+(?:for|in|of)\s+(?:the\s+)?(?:hero|opening)\b/i,
  ],
  [
    "servicesHeading",
    /\bservices?\s+(?:section\s+)?(?:heading|headline|title)\b|\b(?:heading|headline|title)\s+(?:for|in|of)\s+(?:the\s+)?services?\b/i,
  ],
  [
    "servicesIntro",
    /\bservices?\s+(?:section\s+)?(?:intro|introduction|description|paragraph)\b|\b(?:intro|introduction|description|paragraph)\s+(?:for|in|of)\s+(?:the\s+)?services?\b/i,
  ],
  [
    "aboutHeading",
    /\babout(?:\s+us)?\s+(?:section\s+)?(?:heading|headline|title)\b|\b(?:heading|headline|title)\s+(?:for|in|of)\s+(?:the\s+)?about(?:\s+us)?\b/i,
  ],
  [
    "aboutBody",
    /\babout(?:\s+us)?\s+(?:section\s+)?(?:body|paragraph|description|copy)\b|\b(?:body|paragraph|description|copy)\s+(?:for|in|of)\s+(?:the\s+)?about(?:\s+us)?\b/i,
  ],
  [
    "aboutKicker",
    /\babout(?:\s+us)?\s+(?:section\s+)?(?:kicker|eyebrow|label)\b|\b(?:kicker|eyebrow|label)\s+(?:for|in|of)\s+(?:the\s+)?about(?:\s+us)?\b/i,
  ],
  [
    "contactHeading",
    /\bcontact\s+(?:section\s+)?(?:heading|headline|title)\b|\b(?:heading|headline|title)\s+(?:for|in|of)\s+(?:the\s+)?contact\b/i,
  ],
  [
    "contactKicker",
    /\bcontact\s+(?:section\s+)?(?:kicker|eyebrow|label)\b|\b(?:kicker|eyebrow|label)\s+(?:for|in|of)\s+(?:the\s+)?contact\b/i,
  ],
  [
    "processHeading",
    /\bprocess\s+(?:section\s+)?(?:heading|headline|title)\b|\b(?:heading|headline|title)\s+(?:for|in|of)\s+(?:the\s+)?process\b/i,
  ],
  [
    "processKicker",
    /\bprocess\s+(?:section\s+)?(?:kicker|eyebrow|label)\b|\b(?:kicker|eyebrow|label)\s+(?:for|in|of)\s+(?:the\s+)?process\b/i,
  ],
  [
    "faqHeading",
    /\b(?:faqs?|questions?)\s+(?:section\s+)?(?:heading|headline|title)\b|\b(?:heading|headline|title)\s+(?:for|in|of)\s+(?:the\s+)?(?:faqs?|questions?)\b/i,
  ],
  [
    "faqKicker",
    /\b(?:faqs?|questions?)\s+(?:section\s+)?(?:kicker|eyebrow|label)\b|\b(?:kicker|eyebrow|label)\s+(?:for|in|of)\s+(?:the\s+)?(?:faqs?|questions?)\b/i,
  ],
  [
    "formIntro",
    /\b(?:contact |request )?form\s+(?:intro|introduction|description|prompt)\b|\b(?:intro|introduction|description|prompt)\s+(?:for|in|of)\s+(?:the\s+)?(?:contact |request )?form\b/i,
  ],
];
const COPY_SECTION_FIELDS = {
  hero: ["heroKicker", "heroHeading", "heroBody"],
  services: ["servicesHeading", "servicesIntro"],
  about: ["aboutKicker", "aboutHeading", "aboutBody"],
  contact: ["contactKicker", "contactHeading", "formIntro"],
  process: ["processKicker", "processHeading"],
  faq: ["faqKicker", "faqHeading"],
};
const conversionFeatureRequest =
  /\b(exit(?:-intent)? (?:offer|popup|modal)|before you go|quick answers?|website assistant|faq (?:widget|assistant|chat)|ai (?:faq )?(?:chat|assistant|chatbot)|chatbot|guided (?:qualifier|questions?)|qualification (?:form|questions?)|question(?:naire)? tool|multi-step form)\b/i;
const creativeVisualRequest =
  /\b(premium|high[- ]end|polished|cinematic|editorial|distinctive|generic|visual|composition|layout|hierarchy|spacing|whitespace|asymmetr(?:y|ical)|full[- ]bleed|motion|animation|reveal|scroll|mobile|responsive|typography|font|serif|sans|bold|minimal|modern|immersive|prominent|understated|simpler)\b|\b(move|place|reposition|resize|restyle|hide|remove|show|add|replace|change|swap)\b.{0,70}\b(hero|navigation|navbar|nav|cta|button|card|grid|image|imagery|photo|gallery|section|services?|feature|widget|calculator|carousel|tabs?|comparison|timeline|panel)\b|\b(larger|smaller|taller|shorter|wider|narrower)\b.{0,50}\b(hero|cta|button|image|imagery|photo|gallery|section|services?|feature|widget|panel)\b/i;
const pureStructuredImageClause =
  /^\s*(?:please\s+)?(?:smoke test:?\s*)?(?:replace|swap|change|update|use|choose|generate|regenerate|select)\b[^.;!?]{0,160}?\b(image|images|photo|photos|picture|pictures|logo|gallery|hero|opening|team photo)\b[^.;!?]{0,160}$/iu;
const creativeVisualKeyword =
  /\b(premium|high[- ]end|polished|cinematic|editorial|distinctive|generic|visual|composition|layout|hierarchy|spacing|whitespace|asymmetr(?:y|ical)|full[- ]bleed|motion|animation|reveal|scroll|mobile|responsive|typography|font|serif|sans|bold|minimal|modern|immersive|prominent|understated|simpler|larger|smaller|taller|shorter|wider|narrower|video|icon|illustration|graphic)\b/iu;

// Drop clauses that are fully answered by a structured image replacement, so a
// creative-candidate site does not need an authored source repair for a plain
// "replace the hero image" note. Composition, sizing, and non-image asks stay.
function residualVisualRequest(feedback) {
  return clean(feedback, 4000)
    .replace(/^\s*\[[^\]]+\]\s*/u, "")
    .split(
      /(?<=[.;!?])\s+|\s+and\s+|,\s*(?=(?:please\s+)?(?:change|revise|rewrite|update|make|add|remove|keep|leave)\b)/iu,
    )
    .map((clause) =>
      (pureStructuredImageClause.test(clause.replace(/[.!?]$/u, "")) &&
        !creativeVisualKeyword.test(clause) &&
        !/\b(?:but|also|then|remove|hide|add|move|resize|restyle|reorder|rewrite|revise)\b/iu.test(
          clause,
        ) &&
        !/\b(?:heading|headline|copy|text|wording|layout|background|crop|position|overlay)\b/iu.test(
          clause,
        )) ||
      /^(?:keep|leave)\b.{0,100}\b(?:unchanged|same|as it is|as is|alone)[.!?]?\s*$/iu.test(
        clause,
      )
        ? " "
        : clause,
    )
    .join(" ");
}

function clean(value, limit = 360) {
  return String(value || "")
    .replace(/—/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
function recipeFor(config) {
  const recipe = config.design?.recipe;
  if (DEFAULT_SECTIONS[recipe]) return recipe;
  if (
    config.businessKind === "garage-door" ||
    config.industry === "home-services"
  )
    return "local-trades";
  if (config.businessKind === "home-care" || config.industry === "wellness")
    return "care-editorial";
  return "general-editorial";
}
function defaultSection(config, type) {
  const found = DEFAULT_SECTIONS[recipeFor(config)].find(
    ([, itemType]) => itemType === type,
  );
  return found
    ? { id: found[0], type: found[1], variant: found[2] }
    : undefined;
}
function allowedVariants(config) {
  return Object.fromEntries(
    DEFAULT_SECTIONS[recipeFor(config)].map(([, type, variant]) => [
      type,
      [...new Set([variant, ...(SHARED_RECIPE_VARIANTS[type] || [])])],
    ]),
  );
}
function currentSections(config) {
  const requested = config.design?.sections;
  const base =
    Array.isArray(requested) && requested.length
      ? requested
      : DEFAULT_SECTIONS[recipeFor(config)].map(([id, type, variant]) => ({
          id,
          type,
          variant,
        }));
  return base.map((section) => ({ ...section }));
}
function proofFallback(config) {
  const points = (config.differentiators || [])
    .map((value) => clean(value, 140))
    .filter(Boolean)
    .slice(0, 4);
  return {
    source: "verified_differentiators",
    heading: `Why people choose ${clean(config.business?.name, 100)}`,
    intro: "A clear path forward starts with the details that matter most.",
    points: points.length
      ? points
      : ["A conversation focused on your needs and the next right step."],
  };
}
export function socialProofOperation(config) {
  if (clean(config.business?.placeId, 200))
    return {
      kind: "set_social_proof",
      source: "google_reviews",
      heading: "What customers say on Google Maps",
      fallback: proofFallback(config),
    };
  return { kind: "set_social_proof", ...proofFallback(config) };
}
function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  return /^[0-9a-f]{6}$/i.test(value)
    ? [0, 2, 4].map((index) =>
        Number.parseInt(value.slice(index, index + 2), 16),
      )
    : undefined;
}
function rgbToHex(rgb) {
  return `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function mix(a, b, amount) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  return !left || !right
    ? a
    : rgbToHex(
        left.map(
          (value, index) => value * (1 - amount) + right[index] * amount,
        ),
      );
}
const NAMED_COLORS = {
  navy: "#17324d",
  blue: "#245a7a",
  teal: "#24636b",
  green: "#285f4d",
  sage: "#66806f",
  terracotta: "#9a4a2d",
  orange: "#a94719",
  red: "#8f3535",
  burgundy: "#713743",
  purple: "#5b456f",
  gold: "#80631d",
  black: "#171a19",
  charcoal: "#293330",
  cream: "#fbf6ed",
  ivory: "#fffaf0",
  white: "#ffffff",
  gray: "#66706d",
  grey: "#66706d",
};
function requestedColors(feedback) {
  const values = [...String(feedback).matchAll(/#[0-9a-f]{6}\b/gi)].map(
    (match) => match[0].toLowerCase(),
  );
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    if (
      new RegExp(`\\b${name}\\b`, "i").test(feedback) &&
      !values.includes(value)
    )
      values.push(value);
  }
  return values;
}
function requestsColorChange(feedback) {
  if (colorRequest.test(feedback)) return true;
  const colors = requestedColors(feedback);
  if (!colors.length) return false;
  const roleRequest =
    /\b(primary|brand|accent|background|surface|page)\b.{0,35}(?:#[0-9a-f]{6}\b|navy|blue|teal|green|sage|terracotta|orange|red|burgundy|purple|gold|black|charcoal|cream|ivory|white|gr[ae]y)\b|(?:#[0-9a-f]{6}\b|navy|blue|teal|green|sage|terracotta|orange|red|burgundy|purple|gold|black|charcoal|cream|ivory|white|gr[ae]y)\b.{0,35}\b(primary|brand|accent|background|surface|page)\b/i;
  const selectionRequest =
    /\b(?:use|switch|change|update|make|set|prefer|try)\b.{0,70}(?:#[0-9a-f]{6}\b|navy|blue|teal|green|sage|terracotta|orange|red|burgundy|purple|gold|black|charcoal|cream|ivory|white|gr[ae]y)\b/i;
  return roleRequest.test(feedback) || selectionRequest.test(feedback);
}
function colorForRole(feedback, rolePattern) {
  const names = Object.keys(NAMED_COLORS).join("|");
  const colorPattern = `#[0-9a-f]{6}|${names}`;
  const after = String(feedback).match(
    new RegExp(
      `(?:${rolePattern})\\s*(?:color|colour)?\\s*(?:to|as|:|=|is|be)?\\s*(${colorPattern})`,
      "i",
    ),
  );
  const before = String(feedback).match(
    new RegExp(
      `(${colorPattern})\\s*(?:for|as)?\\s*(?:the\\s*)?(?:${rolePattern})`,
      "i",
    ),
  );
  const value = after?.[1] || before?.[1];
  if (!value) return undefined;
  return value.startsWith("#")
    ? value.toLowerCase()
    : NAMED_COLORS[value.toLowerCase()];
}
function paletteFor(config, feedback = "") {
  const requested = requestedColors(feedback);
  if (requested.length) {
    const current = config.style || {};
    // A note that names the accent role changes or adds the optional second
    // color while leaving the established palette in place.
    const accentRequest = colorForRole(feedback, "accent|highlight");
    if (accentRequest && /\b(?:accent|highlight)\b/i.test(feedback)) {
      const base = paletteFor(config, "");
      const primaryRequest = colorForRole(feedback, "primary|brand");
      return {
        ...Object.fromEntries(
          PALETTE_KEYS.map((key) => [
            key,
            validPaletteValue(current[key]) || base[key],
          ]),
        ),
        ...(primaryRequest ? { primaryColor: primaryRequest } : {}),
        accentColor: accentRequest,
      };
    }
    const primary =
      colorForRole(feedback, "primary|brand|accent") ||
      requested.find(
        (color) => !["#fbf6ed", "#fffaf0", "#ffffff"].includes(color),
      ) ||
      requested[0];
    const surface =
      colorForRole(feedback, "background|surface|page") ||
      requested.find((color) => color !== primary) ||
      mix(primary, "#ffffff", 0.94);
    return {
      primaryColor: primary,
      surfaceColor: surface,
      heroColor: requested[2] || mix(primary, surface, 0.87),
      inkColor: requested[3] || mix(primary, "#000000", 0.72),
      mutedColor: requested[4] || mix(primary, "#777777", 0.67),
      lineColor: requested[5] || mix(primary, surface, 0.8),
    };
  }
  if (config.industry === "home-services")
    return {
      primaryColor: "#9a4a2d",
      surfaceColor: "#fbf6f0",
      heroColor: "#f3e4d6",
      inkColor: "#2c1b14",
      mutedColor: "#6f5b50",
      lineColor: "#e4d2c4",
    };
  if (config.industry === "technology")
    return {
      primaryColor: "#245a7a",
      surfaceColor: "#f5f8fb",
      heroColor: "#e1edf4",
      inkColor: "#142a38",
      mutedColor: "#536b79",
      lineColor: "#d1e0e8",
    };
  return {
    primaryColor: "#28566b",
    surfaceColor: "#f7faf9",
    heroColor: "#e1eef0",
    inkColor: "#142b34",
    mutedColor: "#566d75",
    lineColor: "#cfdee1",
  };
}
function mentionedSection(text) {
  const lowered = text.toLowerCase();
  return [...SECTION_ALIASES.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([alias]) =>
      new RegExp(`\\b${alias.replace(" ", "\\s+")}s?\\b`).test(lowered),
    )?.[1];
}
function explicitSectionScope(alias, text) {
  const aliasPattern = alias
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[-\\s]+");
  const sectionTarget = `(?:the\\s+)?${aliasPattern}(?:\\s+(?:section|area|block))?`;
  const action =
    "(?:make|keep|change|update|adjust|tighten|loosen|space|center|centre|align|move|reorder|hide|remove|show|add|include|enable|disable|style|redesign|rework|refresh|simplify|improve|condense|expand|widen|narrow|reduce|increase)";
  const layoutTerm =
    "(?:layout|composition|spacing|spacious|compact|density|tight(?:er)?|gaps?|font|typography|variant|center(?:ed)?|align(?:ment|ed)?|style|visual|imagery|premium|cinematic|asymmetrical|editorial|practical|featured|problem[- ]led|immersive|guided|quiet|numbered|cards?|work|local|consultation)";
  const patterns = [
    new RegExp(`\\b${action}\\s+${sectionTarget}\\b`, "i"),
    new RegExp(
      `\\b(?:use|apply|give)\\b[^.!?;\\n]{0,45}\\b${layoutTerm}\\b[^.!?;\\n]{0,35}\\b(?:in|for|on|around|within)\\s+${sectionTarget}\\b`,
      "i",
    ),
    new RegExp(
      `\\b${sectionTarget}\\s+(?:should|needs?\\s+to|must|could|can|is|feels?|looks?|seems?)\\s+(?:be\\s+)?(?:more|less|too|very|tighter|looser|centered|centred|compact|spacious|practical|editorial|featured|immersive|quiet|numbered)\\b`,
      "i",
    ),
    new RegExp(
      `\\b${layoutTerm}\\b[^.!?;\\n]{0,35}\\b(?:in|for|on|around|within|of)\\s+${sectionTarget}\\b`,
      "i",
    ),
    new RegExp(
      `\\b(?:in|within|around|for|on)\\s+${sectionTarget}\\b[^.!?;\\n]{0,60}\\b${layoutTerm}\\b`,
      "i",
    ),
  ];
  return patterns.some((pattern) => pattern.test(text));
}
function explicitlyScopedSections(text) {
  const lowered = String(text || "").toLowerCase();
  return [
    ...new Set(
      [...SECTION_ALIASES.entries()]
        .filter(([alias]) => explicitSectionScope(alias, lowered))
        .map(([, type]) => type),
    ),
  ];
}
function scopedLayoutSections(feedback) {
  if (broadLayoutRequest.test(feedback) || globalLayoutScope.test(feedback))
    return [];
  return explicitlyScopedSections(feedback);
}
function wholePhraseContains(text, phrase) {
  const tokens = (value) =>
    String(value || "")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || [];
  const phraseTokens = tokens(phrase);
  const textTokens = tokens(text);
  if (!phraseTokens.length || phraseTokens.length > textTokens.length)
    return false;
  return textTokens.some((_, start) =>
    phraseTokens.every((token, offset) => textTokens[start + offset] === token),
  );
}
function requestedSectionVariant(feedback, sectionType) {
  const variants = [...(SECTION_VARIANTS[sectionType] || [])].sort(
    (left, right) => right.length - left.length,
  );
  for (const variant of variants) {
    const pattern = variant
      .split("-")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[-\\s]+");
    if (new RegExp(`\\b${pattern}\\b`, "i").test(feedback)) return variant;
  }
  if (
    sectionType === "hero" &&
    /\b(?:center|centered|centre|centred)\b/i.test(feedback) &&
    SECTION_VARIANTS.hero.has("centered")
  )
    return "centered";
  return undefined;
}
function operationMatchesSectionScope(operation, sectionTypes, feedback) {
  if (!sectionTypes.length) return true;
  if (operation.kind === "set_design_treatment") return false;
  if (operation.kind === "reorder_section")
    return (
      sectionTypes.includes(operation.sectionType) ||
      sectionTypes.includes(operation.relativeTo)
    );
  if (operation.kind === "set_section_enabled")
    return sectionTypes.includes(operation.sectionType);
  if (operation.kind === "set_section_variant")
    return (
      sectionTypes.includes(operation.sectionType) &&
      requestedSectionVariant(feedback, operation.sectionType) ===
        operation.variant
    );
  return false;
}
function sameStructuralOperation(expected, actual) {
  if (expected.kind !== actual.kind) return false;
  const fields = {
    set_section_enabled: ["sectionType", "enabled"],
    reorder_section: ["sectionType", "relativeTo", "position"],
    set_section_variant: ["sectionType", "variant"],
    set_design_treatment: ["density", "typography"],
  }[expected.kind];
  return Boolean(
    fields && fields.every((field) => expected[field] === actual[field]),
  );
}
function structuralOperations(feedback, config) {
  const text = clean(feedback, 1200).toLowerCase();
  const operations = [];
  const sections = currentSections(config);
  const scopedSections = scopedLayoutSections(feedback);
  const hide = text.match(
    /\b(?:hide|remove|drop|disable)\s+(?:the\s+)?([a-z -]+?)(?:\s+section)?(?:[.,]|$)/i,
  );
  const show = text.match(
    /\b(?:show|add|include|enable)\s+(?:a\s+|the\s+)?([a-z -]+?)(?:\s+section)?(?:[.,]|$)/i,
  );
  const move = text.match(
    /\b(?:move|put|place)\s+(?:the\s+)?([a-z -]+?)\s+(above|below|before|after)\s+(?:the\s+)?([a-z -]+?)(?:\s+section)?(?:[.,]|$)/i,
  );
  if (hide) {
    const type = mentionedSection(hide[1]);
    if (type && !["hero", "services", "contact"].includes(type))
      operations.push({
        kind: "set_section_enabled",
        sectionType: type,
        enabled: false,
      });
  }
  if (show) {
    const type = mentionedSection(show[1]);
    if (type)
      operations.push({
        kind: "set_section_enabled",
        sectionType: type,
        enabled: true,
      });
  }
  if (move) {
    const moving = mentionedSection(move[1]);
    const target = mentionedSection(move[3]);
    if (moving && target && moving !== target)
      operations.push({
        kind: "reorder_section",
        sectionType: moving,
        relativeTo: target,
        position: ["above", "before"].includes(move[2]) ? "before" : "after",
      });
  }
  if (
    scopedSections.length === 0 &&
    /\b(more spacious|more breathing room|increase (?:the )?spacing|generous spacing)\b/i.test(
      text,
    )
  )
    operations.push({ kind: "set_design_treatment", density: "spacious" });
  if (
    scopedSections.length === 0 &&
    /\b(more compact|less spacing|tighter|reduce (?:the )?spacing)\b/i.test(
      text,
    )
  )
    operations.push({ kind: "set_design_treatment", density: "compact" });
  if (
    scopedSections.length === 0 &&
    /\b(editorial|serif)\b/i.test(text) &&
    /\b(font|typography|look|style|layout)\b/i.test(text)
  )
    operations.push({ kind: "set_design_treatment", typography: "editorial" });
  if (
    scopedSections.length === 0 &&
    /\b(modern|sans(?: serif)?|cleaner)\b/i.test(text) &&
    /\b(font|typography|look|style|layout)\b/i.test(text)
  )
    operations.push({ kind: "set_design_treatment", typography: "sans" });
  if (
    scopedSections.length === 0 &&
    /\b(bold|stronger)\b/i.test(text) &&
    /\b(font|typography|look|style|layout|visual)\b/i.test(text)
  )
    operations.push({ kind: "set_design_treatment", typography: "strong" });
  if (
    /\b(centered|centre(?:d)?)\b/i.test(text) &&
    /\b(hero|opening)\b/i.test(text)
  )
    operations.push({
      kind: "set_section_variant",
      sectionType: "hero",
      variant: "centered",
    });
  if (/\b(featured|feature)\b/i.test(text) && /\bservices?\b/i.test(text))
    operations.push({
      kind: "set_section_variant",
      sectionType: "services",
      variant: "featured",
    });
  return operations.filter(
    (operation, index, all) =>
      index ===
        all.findIndex(
          (candidate) =>
            JSON.stringify(candidate) === JSON.stringify(operation),
        ) &&
      (operation.kind !== "reorder_section" ||
        sections.some((section) => section.type === operation.relativeTo)),
  );
}
function conversionFeatureFor(feedback) {
  if (
    /\b(exit(?:-intent)? (?:offer|popup|modal)|before you go)\b/i.test(feedback)
  )
    return "exitOffer";
  if (
    /\b(?:ai (?:faq )?(?:chat|assistant|chatbot)|faq chat|chatbot)\b/i.test(
      feedback,
    )
  )
    return "aiChat";
  if (
    /\b(quick answers?|website assistant|faq (?:widget|assistant)|chat(?:bot)?)\b/i.test(
      feedback,
    )
  )
    return "quickAnswers";
  if (
    /\b(guided (?:qualifier|questions?)|qualification (?:form|questions?)|question(?:naire)? tool|multi-step form)\b/i.test(
      feedback,
    )
  )
    return "guidedQualifier";
  return null;
}
function conversionFeatureOperations(feedback) {
  const segments = clean(feedback, 4000).split(/\s*(?:,|\.|\band\b)\s*/i);
  return segments.flatMap((segment) => {
    const feature = conversionFeatureFor(segment);
    if (!feature) return [];
    if (/\b(remove|hide|disable|turn off|do not show)\b/i.test(segment))
      return [{ kind: "set_conversion_feature", feature, enabled: false }];
    if (
      /\b(add|show|enable|include|use|turn on|bring back|have)\b/i.test(segment)
    )
      return [{ kind: "set_conversion_feature", feature, enabled: true }];
    return [];
  });
}
function feedbackWithoutConversionFeatures(feedback) {
  return clean(feedback, 4000)
    .split(/\s*(?:,|\.|\band\b)\s*/i)
    .filter((segment) => !conversionFeatureRequest.test(segment))
    .join(". ");
}
function approvedHeroShortening(feedback, config) {
  if (
    !/\b(hero|opening)\b/i.test(feedback) ||
    !/\b(shorten|shorter|simplify|simpler|condense|concise|bloated|too long)\b/i.test(
      feedback,
    )
  )
    return [];
  const description = clean(
    config.copy?.heroBody || config.business?.description,
    1000,
  );
  const heading = clean(
    config.copy?.heroHeading || config.business?.tagline,
    400,
  );
  const firstSentence =
    description.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || description;
  const firstHeadingClause = heading.split(/[,;:]/)[0]?.trim();
  return [
    ...(firstHeadingClause && firstHeadingClause.length < heading.length
      ? [
          {
            kind: "set_copy",
            field: "heroHeading",
            value: firstHeadingClause,
            provenance: "approved_business_tagline",
          },
        ]
      : []),
    ...(firstSentence && firstSentence.length < description.length
      ? [
          {
            kind: "set_copy",
            field: "heroBody",
            value: firstSentence,
            provenance: "approved_business_description",
          },
        ]
      : []),
  ];
}
export function deterministicOperations(feedback, config) {
  const operations = [];
  const movingExistingProof =
    Boolean(config.socialProof) &&
    /\b(?:move|put|place|reorder)\b/i.test(feedback);
  if (socialProofRequest.test(feedback) && !movingExistingProof)
    operations.push(socialProofOperation(config));
  if (requestsColorChange(feedback))
    operations.push({
      kind: "set_color_palette",
      palette: paletteFor(config, feedback),
      requestedColors: requestedColors(feedback),
    });
  if (brandNameRequest.test(feedback))
    operations.push({ kind: "show_brand_name" });
  const structuralFeedback = feedbackWithoutConversionFeatures(feedback);
  const structural = layoutRequest.test(structuralFeedback)
    ? structuralOperations(structuralFeedback, config)
    : [];
  const proofAlreadyEnabled = currentSections(config).some(
    (section) => section.type === "social-proof",
  );
  const onlyEnablesRequestedProof =
    proofAlreadyEnabled &&
    socialProofRequest.test(feedback) &&
    structural.length > 0 &&
    structural.every(
      (operation) =>
        operation.kind === "set_section_enabled" &&
        operation.sectionType === "social-proof",
    );
  if (!onlyEnablesRequestedProof) operations.push(...structural);
  operations.push(...conversionFeatureOperations(feedback));
  operations.push(...approvedHeroShortening(feedback, config));
  return operations;
}
function validPaletteValue(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : undefined;
}
export function structuredOperations(item, config) {
  const operations = [];
  for (const asset of item?.assets || []) {
    const field = IMAGE_TARGET_FIELDS[asset?.target];
    const path = clean(asset?.path, 120);
    if (!field || !FEEDBACK_IMAGE_PATH.test(path)) continue;
    const source =
      asset?.source === "fal-generated" ? "fal-generated" : "client";
    operations.push({
      kind: "set_image",
      target: asset.target,
      path,
      source,
      ...(clean(asset?.prompt, 500)
        ? { prompt: clean(asset.prompt, 500) }
        : {}),
      ...(clean(asset?.model, 80) ? { model: clean(asset.model, 80) } : {}),
      ...(/^[a-f0-9]{8,64}$/iu.test(String(asset?.promptHash || ""))
        ? { promptHash: String(asset.promptHash) }
        : {}),
      ...(/^[a-f0-9]{8,64}$/iu.test(String(asset?.sha256 || ""))
        ? { sha256: String(asset.sha256) }
        : {}),
      ...(Number.isFinite(asset?.width) && Number(asset.width) > 0
        ? { width: Math.round(asset.width) }
        : {}),
      ...(Number.isFinite(asset?.height) && Number(asset.height) > 0
        ? { height: Math.round(asset.height) }
        : {}),
    });
  }
  const selectedColors = (item?.colors || []).filter((color) =>
    Boolean(COLOR_ROLE_KEYS[color?.role]),
  );
  if (selectedColors.length) {
    const current = config.style || {};
    const defaults = paletteFor(config, "");
    const palette = Object.fromEntries(
      PALETTE_KEYS.map((key) => [
        key,
        validPaletteValue(current[key]) || defaults[key],
      ]),
    );
    for (const color of selectedColors)
      palette[COLOR_ROLE_KEYS[color.role]] = color.hex.toLowerCase();
    operations.push({
      kind: "set_color_palette",
      palette,
      requestedColors: selectedColors.map((color) => color.hex.toLowerCase()),
      requestedFields: selectedColors.map(
        (color) => COLOR_ROLE_KEYS[color.role],
      ),
    });
  }
  return operations;
}
function intentsFor(item, config) {
  const originalFeedback =
    typeof item === "string" ? item : clean(item?.text, 4000);
  const feedback =
    Array.isArray(item?.assets) && item.assets.length
      ? residualVisualRequest(originalFeedback)
      : originalFeedback;
  const intents = [];
  if (socialProofRequest.test(feedback)) intents.push("social-proof");
  if (requestsColorChange(feedback)) intents.push("color");
  if (brandNameRequest.test(feedback)) intents.push("brand-name");
  if (Array.isArray(item?.assets) && item.assets.length) intents.push("image");
  if (
    Array.isArray(item?.colors) &&
    item.colors.length &&
    !intents.includes("color")
  )
    intents.push("color");
  const structuralFeedback = feedbackWithoutConversionFeatures(feedback);
  const structural = layoutRequest.test(structuralFeedback)
    ? structuralOperations(structuralFeedback, config)
    : [];
  const sectionScopedLayoutRequested =
    scopedLayoutSections(feedback).length > 0 &&
    scopedLayoutRequest.test(feedback);
  if (
    broadLayoutRequest.test(feedback) ||
    sectionScopedLayoutRequested ||
    structural.some(
      (operation) =>
        !(
          socialProofRequest.test(feedback) &&
          operation.kind === "set_section_enabled" &&
          operation.sectionType === "social-proof"
        ),
    )
  )
    intents.push("layout");
  if (contentRequest.test(feedback.replace(/^\s*\[[^\]]+\]\s*/, "")))
    intents.push("content");
  if (conversionFeatureRequest.test(feedback))
    intents.push("conversion-feature");
  if (config.design?.experience?.renderer === "creative-candidate") {
    // A structured replacement already answers an image request. Keep the
    // authored creative lane for composition, sizing, and non-image visual
    // changes, but do not require a source repair just because the note says
    // "replace the hero image".
    const structuredImageOnly =
      Array.isArray(item?.assets) &&
      item.assets.length > 0 &&
      !creativeVisualRequest.test(residualVisualRequest(feedback));
    if (!structuredImageOnly && creativeVisualRequest.test(feedback))
      intents.push("layout");
  }
  if (
    (item?.assets?.length || item?.colors?.length) &&
    feedback.trim() &&
    intents.every((intent) => intent === "image" || intent === "color") &&
    feedback.split(/[.!?;,]|\band\b/iu).some((clause) =>
      /\b(?:change|revise|rewrite|update|make|add|remove|hide|move|adjust|enable|disable)\b/iu.test(clause) &&
      !requestsColorChange(clause),
    )
  )
    intents.push("unknown");
  return intents.length ? [...new Set(intents)] : ["unknown"];
}
function explicitContentTargets(feedback, config) {
  const text = feedback.replace(/^\s*\[[^\]]+\]\s*/, "");
  const namedServices = (config.services || []).filter(
    (service) =>
      service &&
      [service.name, service.slug]
        .filter((value) => String(value || "").trim())
        .some((value) => wholePhraseContains(text, value)),
  );
  const specificServiceDescription =
    namedServices.length > 0 &&
    /\bservice (?:copy|wording|description|card)\b/i.test(text);
  const exactFields = COPY_FIELD_TARGETS.filter(
    ([field, pattern]) =>
      pattern.test(text) &&
      !(field === "servicesIntro" && specificServiceDescription),
  ).map(([field]) => field);
  const targets = exactFields.map((field) => ({ kind: "copy-field", field }));
  for (const service of namedServices)
    targets.push({
      kind: "service",
      slug: service.slug,
    });

  const exactFaqCopyField = exactFields.some(
    (field) => field === "faqHeading" || field === "faqKicker",
  );
  if (
    /\banswers?\b|\bfaq (?:questions|entries|content)\b/i.test(text) ||
    (/\b(?:faqs?|frequently asked questions?)\b/i.test(text) &&
      !exactFaqCopyField)
  )
    targets.push({ kind: "operation", operation: "set_faqs" });
  const exactProcessCopyField = exactFields.some(
    (field) => field === "processHeading" || field === "processKicker",
  );
  if (
    /\b(?:steps?|how it works)\b/i.test(text) ||
    (/\bprocess\b/i.test(text) && !exactProcessCopyField)
  )
    targets.push({ kind: "operation", operation: "set_process" });

  for (const [section, fields] of Object.entries(COPY_SECTION_FIELDS)) {
    if (
      section === "faq" ||
      section === "process" ||
      exactFields.some((field) => fields.includes(field))
    )
      continue;
    const sectionPattern =
      section === "hero"
        ? /\b(hero|opening)\b/i
        : new RegExp(`\\b${section}\\b`, "i");
    if (sectionPattern.test(text) && contentRequest.test(text))
      targets.push({ kind: "copy-section", section, fields });
  }
  if (/\bservice (?:copy|wording|description|card)\b/i.test(text))
    targets.push({ kind: "service-copy" });
  return targets;
}
function contentOperationMatchesTarget(operation, target) {
  if (target.kind === "copy-field")
    return operation.kind === "set_copy" && operation.field === target.field;
  if (target.kind === "copy-section")
    return (
      (operation.kind === "set_copy" &&
        target.fields.includes(operation.field)) ||
      (target.section === "services" && operation.kind === "set_service_copy")
    );
  if (target.kind === "service")
    return (
      operation.kind === "set_service_copy" &&
      operation.serviceSlug === target.slug
    );
  if (target.kind === "service-copy")
    return operation.kind === "set_service_copy";
  if (target.kind === "operation") return operation.kind === target.operation;
  return false;
}
function contentTargetsSatisfied(targets, operations) {
  if (!targets.length) return intentSatisfied("content", operations);
  return targets.every((target) =>
    operations.some((operation) =>
      contentOperationMatchesTarget(operation, target),
    ),
  );
}
export async function modelOperations(
  feedbackItems,
  config,
  model = "z-ai/glm-5.3-flash",
) {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const items = Array.isArray(feedbackItems) ? feedbackItems : [feedbackItems];
  const sessionId = openRouterSessionId("revision-operations", model, {
    businessName: config.business?.name || "",
    email: config.business?.email || "",
    phone: config.business?.phone || "",
    domain: config.business?.domain || "",
  });
  for (const reasoningEffort of ["low", "high"]) {
    const response = await openRouterChatCompletion({
      title: "LaunchLoom revision operations",
      sessionId,
      responseCache: true,
      responseCacheTtlSeconds: 900,
      body: {
        model,
        reasoning_effort: reasoningEffort,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Return JSON only: {plans:[{feedbackIndex,operations:[...]}]}. Plan every feedback item independently. Preserve approved facts, assets, stable section IDs, and unrelated content. Allowed operations: {kind:'set_copy',field,value}; {kind:'set_service_copy',serviceSlug,description}; {kind:'set_process',steps:[...]}; {kind:'set_faqs',faqs:[{question,answer}]}; {kind:'set_section_enabled',sectionType,enabled}; {kind:'reorder_section',sectionType,relativeTo,position:'before'|'after'}; {kind:'set_section_variant',sectionType,variant}; {kind:'set_design_treatment',density:'compact'|'balanced'|'spacious',typography:'editorial'|'sans'|'strong'}; {kind:'set_conversion_feature',feature:'guidedQualifier'|'quickAnswers'|'aiChat'|'exitOffer',enabled:boolean}. Allowed set_copy fields are heroKicker (small label above the heading), heroHeading (main H1), heroBody (intro paragraph), servicesHeading, servicesIntro, aboutKicker, aboutHeading, aboutBody, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. Keep hero headings to 4-10 memorable words, hero bodies to one sentence under 28 words, and service-card descriptions to one sentence under 22 words. A request to shorten or simplify the hero should normally revise heroHeading and/or heroBody while preserving verified meaning. Use only the supplied allowlisted fields, existing service slugs, section types and variants. Only enable an exit offer when the approved business context contains a real offer. When feedback names specific section(s), only edit those sections; never use page-wide design treatment or edit another section to satisfy a section-specific request. If the allowed operations cannot express the requested scope, return no operation. Broader layout changes are allowed only when explicitly requested. Never invent reviews, credentials, prices, guarantees, locations, timelines, staff, outcomes, or business facts. Never change contact details, service names, recipe, or assets. Do not use em dashes. Return no operation for an unsafe or unsupported request.`,
          },
          {
            role: "user",
            content: `Feedback items:\n${JSON.stringify(items.map((feedback, feedbackIndex) => ({ feedbackIndex, feedback })))}\n\nApproved context:\n${JSON.stringify({ recipe: recipeFor(config), industry: config.industry, businessKind: config.businessKind, business: config.business, differentiators: config.differentiators, services: config.services, copy: config.copy, process: config.conversion?.process, faqs: config.conversion?.faqs, sections: currentSections(config), allowedVariants: allowedVariants(config) })}`,
          },
        ],
      },
    });
    if (!response.ok) continue;
    try {
      logOpenRouterResponseCacheUsage("revision-operations", response);
      const payload = await response.json();
      logOpenRouterCacheUsage("revision-operations", payload.usage);
      const content = payload.choices?.[0]?.message?.content;
      const parsed = parseModelJson(content);
      const operations = (
        Array.isArray(parsed.plans) ? parsed.plans : []
      ).flatMap((plan) =>
        Array.isArray(plan.operations)
          ? plan.operations.slice(0, 8).map((operation) => ({
              ...operation,
              feedbackIndex: Number(plan.feedbackIndex),
            }))
          : [],
      );
      if (operations.length) return operations;
    } catch {
      // Retry once with higher reasoning effort. Validation still happens below.
    }
  }
  return [];
}
function safeContent(value, limit) {
  const text = clean(value, limit);
  if (
    !text ||
    /\b(?:guaranteed?|certified|licensed|award-winning|number one|#1)\b/i.test(
      text,
    ) ||
    /(?:[$€£]\s?\d|\b\d+\s*(?:minutes?|hours?|days?|years?)\b)/i.test(text)
  )
    return "";
  return text;
}
function conciseRevisionContent(value, field) {
  const rules = {
    heroHeading: [72, 10],
    heroBody: [170, 28],
    servicesHeading: [76, 10],
    servicesIntro: [145, 22],
    serviceDescription: [125, 20],
  };
  const [charLimit, wordLimit] = rules[field] || [180, 40];
  const cleaned = clean(value, 400);
  const words = cleaned.split(/\s+/).filter(Boolean);
  let result = words.slice(0, wordLimit).join(" ");
  if (result.length > charLimit) {
    const wordEnd = result.lastIndexOf(" ", charLimit);
    result = result.slice(0, wordEnd > 0 ? wordEnd : charLimit);
  }
  result = result.replace(/[,;:]$/, "");
  if (
    ["heroBody", "servicesIntro"].includes(field) &&
    result &&
    !/[.!?]$/.test(result)
  )
    result += ".";
  return result;
}
export function applyOperation(config, operation) {
  if (!operation || typeof operation !== "object") return false;
  if (operation.kind === "set_social_proof") {
    config.socialProof = {
      source:
        operation.source === "google_reviews"
          ? "google_reviews"
          : "verified_differentiators",
      heading: clean(operation.heading, 140),
      intro: clean(operation.intro, 240),
      points: Array.isArray(operation.points)
        ? operation.points
            .map((point) => clean(point, 140))
            .filter(Boolean)
            .slice(0, 4)
        : [],
      fallback: operation.fallback || undefined,
    };
    return true;
  }
  if (operation.kind === "show_brand_name") {
    config.style = { ...(config.style || {}), showBrandName: true };
    return true;
  }
  if (operation.kind === "set_color_palette") {
    const palette = operation.palette;
    const requestedAccent = palette?.accentColor;
    if (
      !palette ||
      typeof palette !== "object" ||
      PALETTE_KEYS.some(
        (key) => !/^#[0-9a-f]{6}$/i.test(String(palette[key] || "")),
      ) ||
      (requestedAccent !== undefined &&
        requestedAccent !== null &&
        requestedAccent !== "" &&
        !/^#[0-9a-f]{6}$/i.test(String(requestedAccent)))
    )
      return false;
    const preservedAccent =
      requestedAccent === undefined &&
      /^#[0-9a-f]{6}$/i.test(String(config.style?.accentColor || ""))
        ? String(config.style.accentColor).toLowerCase()
        : undefined;
    const accentForResolve = requestedAccent
      ? String(requestedAccent).toLowerCase()
      : preservedAccent;
    const resolved = resolvePalette({
      ...Object.fromEntries(
        PALETTE_KEYS.map((key) => [key, palette[key].toLowerCase()]),
      ),
      ...(accentForResolve ? { accentColor: accentForResolve } : {}),
    });
    const nextStyle = { ...(config.style || {}), ...resolved };
    if (requestedAccent === null || requestedAccent === "") {
      // An explicit clear removes the optional accent instead of replacing it.
      delete nextStyle.accentColor;
      delete nextStyle.accentTextColor;
      delete nextStyle.accentContrastColor;
    }
    config.style = nextStyle;
    return true;
  }
  if (operation.kind === "set_image") {
    const field = IMAGE_TARGET_FIELDS[operation.target];
    const path = clean(operation.path, 120);
    if (!field || !FEEDBACK_IMAGE_PATH.test(path)) return false;
    const source =
      operation.source === "fal-generated" ? "fal-generated" : "client";
    config.images = { ...(config.images || {}) };
    config.assets = { ...(config.assets || {}) };
    if (field.images) config.images[field.images] = path;
    if (field.assets) config.assets[field.assets] = path;
    const replacedKeys = new Set(Object.values(field));
    const used = (config.assetReport?.used || []).filter(
      (entry) => !replacedKeys.has(entry?.asset),
    );
    used.push({
      asset: field.assets || field.images,
      placement: operation.target,
      source,
      ...(source === "fal-generated"
        ? {
            provider: "fal.ai",
            ...(clean(operation.model, 80)
              ? { model: clean(operation.model, 80) }
              : {}),
            ...(clean(operation.prompt, 500)
              ? { subject: clean(operation.prompt, 500) }
              : {}),
            generatedAt: new Date().toISOString(),
          }
        : {}),
      ...(clean(operation.promptHash, 64)
        ? { promptHash: clean(operation.promptHash, 64) }
        : {}),
      ...(clean(operation.sha256, 64)
        ? { sha256: clean(operation.sha256, 64) }
        : {}),
      ...(Number.isFinite(operation.width) && operation.width > 0
        ? { width: Math.round(operation.width) }
        : {}),
      ...(Number.isFinite(operation.height) && operation.height > 0
        ? { height: Math.round(operation.height) }
        : {}),
    });
    config.assetReport = {
      ...(config.assetReport || {}),
      used,
      skipped: config.assetReport?.skipped || [],
    };
    return true;
  }
  if (operation.kind === "set_copy" && COPY_FIELDS.has(operation.field)) {
    const approvedHeroBody = clean(
      config.copy?.heroBody || config.business?.description,
      1000,
    );
    const approvedHeroHeading = clean(
      config.copy?.heroHeading || config.business?.tagline,
      400,
    );
    const value =
      operation.field === "heroHeading" &&
      operation.provenance === "approved_business_tagline" &&
      approvedHeroHeading.includes(clean(operation.value, 180))
        ? clean(operation.value, 180)
        : operation.field === "heroBody" &&
            operation.provenance === "approved_business_description" &&
            approvedHeroBody.includes(clean(operation.value, 180))
          ? clean(operation.value, 180)
          : safeContent(
              operation.value,
              operation.field === "aboutBody" ||
                operation.field === "formIntro" ||
                operation.field === "heroBody"
                ? 360
                : 180,
            );
    if (!value) return false;
    config.copy = {
      ...(config.copy || {}),
      [operation.field]: conciseRevisionContent(value, operation.field),
    };
    return true;
  }
  if (operation.kind === "set_service_copy") {
    const service = (config.services || []).find(
      (item) => item.slug === operation.serviceSlug,
    );
    const description = conciseRevisionContent(
      safeContent(operation.description, 125),
      "serviceDescription",
    );
    if (!service || !description) return false;
    service.description = description;
    return true;
  }
  if (operation.kind === "set_process") {
    const steps = Array.isArray(operation.steps)
      ? operation.steps
          .map((step) => safeContent(step, 180))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    if (steps.length < 2) return false;
    config.conversion = { ...(config.conversion || {}), process: steps };
    return true;
  }
  if (operation.kind === "set_faqs") {
    const faqs = Array.isArray(operation.faqs)
      ? operation.faqs
          .map((faq) => ({
            question: safeContent(faq?.question, 160),
            answer: safeContent(faq?.answer, 360),
          }))
          .filter((faq) => faq.question && faq.answer)
          .slice(0, 5)
      : [];
    if (!faqs.length) return false;
    config.conversion = {
      ...(config.conversion || {}),
      faqs,
      ...(config.conversion?.quickAnswers
        ? {
            quickAnswers: {
              ...config.conversion.quickAnswers,
              items: faqs,
            },
          }
        : {}),
    };
    return true;
  }
  if (operation.kind === "set_conversion_feature") {
    if (
      !CONVERSION_FEATURES.has(operation.feature) ||
      typeof operation.enabled !== "boolean"
    )
      return false;
    const conversion = { ...(config.conversion || {}) };
    const existing = conversion[operation.feature] || {};
    if (existing.enabled === operation.enabled) return false;
    if (
      operation.enabled &&
      operation.feature === "exitOffer" &&
      !clean(config.business?.offer)
    )
      return false;
    if (
      operation.enabled &&
      operation.feature === "quickAnswers" &&
      !(conversion.faqs || []).length
    )
      return false;
    if (
      operation.enabled &&
      operation.feature === "guidedQualifier" &&
      !(conversion.qualification || []).length
    )
      return false;
    if (
      operation.enabled &&
      operation.feature === "aiChat" &&
      !(conversion.faqs || []).length &&
      !(config.services || []).length
    )
      return false;
    const defaults =
      operation.feature === "guidedQualifier"
        ? {
            heading: "A few quick questions",
            intro:
              "Choose the closest options so we can understand what you need.",
          }
        : operation.feature === "quickAnswers"
          ? {
              label: "Quick answers",
              greeting: `Welcome to ${clean(config.business?.name, 100)}. How can we help?`,
              items: (conversion.faqs || []).slice(0, 5),
              ctaLabel: clean(config.business?.primaryCta, 100),
              ctaTarget: "#contact",
            }
          : operation.feature === "aiChat"
            ? {
                label: "Got questions?",
                greeting: `Ask about ${clean(config.business?.name, 100)} services, coverage, or the next step.`,
                disclaimer:
                  "AI-generated answers use this website's verified information and may be incomplete.",
                apiUrl: "",
                token: "",
              }
            : {
                eyebrow: "Before you go",
                heading: clean(config.business?.offer, 180),
                body: "Share what you need and the team will follow up with a useful next step.",
                ctaLabel: clean(config.business?.primaryCta, 100),
                ctaTarget: "#contact",
              };
    conversion[operation.feature] = {
      ...defaults,
      ...existing,
      enabled: operation.enabled,
    };
    config.conversion = conversion;
    return true;
  }
  if (operation.kind === "set_design_treatment") {
    const previousDensity = config.design?.treatment?.density || "balanced";
    const previousTypography =
      config.design?.treatment?.typography ||
      (recipeFor(config) === "local-trades" ? "strong" : "editorial");
    const density = ["compact", "balanced", "spacious"].includes(
      operation.density,
    )
      ? operation.density
      : previousDensity;
    const typography = ["editorial", "sans", "strong"].includes(
      operation.typography,
    )
      ? operation.typography
      : previousTypography;
    if (!operation.density && !operation.typography) return false;
    if (density === previousDensity && typography === previousTypography)
      return false;
    config.design = {
      ...(config.design || {}),
      recipe: recipeFor(config),
      sections: currentSections(config),
      treatment: { density, typography },
    };
    return true;
  }
  if (
    ["set_section_enabled", "reorder_section", "set_section_variant"].includes(
      operation.kind,
    )
  ) {
    const type = operation.sectionType;
    if (!SECTION_VARIANTS[type]) return false;
    const sections = currentSections(config);
    const previousSections = JSON.stringify(sections);
    if (operation.kind === "set_section_enabled") {
      if (
        operation.enabled === false &&
        ["hero", "services", "contact"].includes(type)
      )
        return false;
      const index = sections.findIndex((section) => section.type === type);
      if (operation.enabled === false) {
        if (index < 0) return false;
        operation.sectionId = sections[index].id;
        sections.splice(index, 1);
      } else if (index < 0) {
        const section = defaultSection(config, type);
        if (!section) return false;
        const contactIndex = sections.findIndex(
          (item) => item.type === "contact",
        );
        sections.splice(
          contactIndex < 0 ? sections.length : contactIndex,
          0,
          section,
        );
      } else return false;
    } else if (operation.kind === "reorder_section") {
      const from = sections.findIndex((section) => section.type === type);
      const target = sections.findIndex(
        (section) => section.type === operation.relativeTo,
      );
      if (
        from < 0 ||
        target < 0 ||
        from === target ||
        !["before", "after"].includes(operation.position)
      )
        return false;
      const [section] = sections.splice(from, 1);
      const nextTarget = sections.findIndex(
        (item) => item.type === operation.relativeTo,
      );
      sections.splice(
        nextTarget + (operation.position === "after" ? 1 : 0),
        0,
        section,
      );
    } else {
      const section = sections.find((item) => item.type === type);
      if (
        !section ||
        !SECTION_VARIANTS[type].has(operation.variant) ||
        !allowedVariants(config)[type]?.includes(operation.variant)
      )
        return false;
      if (section.variant === operation.variant) return false;
      section.variant = operation.variant;
    }
    if (JSON.stringify(sections) === previousSections) return false;
    config.design = {
      ...(config.design || {}),
      recipe: recipeFor(config),
      sections,
    };
    return true;
  }
  return false;
}
function intentSatisfied(intent, operations) {
  if (intent === "social-proof")
    return operations.some(
      (operation) =>
        operation.kind === "set_social_proof" ||
        ([
          "set_section_enabled",
          "reorder_section",
          "set_section_variant",
        ].includes(operation.kind) &&
          operation.sectionType === "social-proof"),
    );
  if (intent === "color")
    return operations.some(
      (operation) => operation.kind === "set_color_palette",
    );
  if (intent === "image")
    return operations.some((operation) => operation.kind === "set_image");
  if (intent === "brand-name")
    return operations.some((operation) => operation.kind === "show_brand_name");
  if (intent === "layout")
    return operations.some((operation) =>
      [
        "set_section_enabled",
        "reorder_section",
        "set_section_variant",
        "set_design_treatment",
      ].includes(operation.kind),
    );
  if (intent === "content")
    return operations.some((operation) =>
      ["set_copy", "set_service_copy", "set_process", "set_faqs"].includes(
        operation.kind,
      ),
    );
  if (intent === "conversion-feature")
    return operations.some(
      (operation) => operation.kind === "set_conversion_feature",
    );
  return false;
}
export async function planRevision(
  feedbackItems,
  config,
  planner = modelOperations,
) {
  const items = feedbackItems
    .map((item) => {
      if (typeof item === "string")
        return { text: clean(item, 4000), assets: [], colors: [] };
      return {
        text: clean(item?.text, 4000),
        assets: Array.isArray(item?.assets) ? item.assets : [],
        colors: Array.isArray(item?.colors) ? item.colors : [],
      };
  })
  .filter((item) => item.text || item.assets.length || item.colors.length);
  const textItems = items.map((item) => item.text);
  const creativeCandidate =
    config.design?.experience?.renderer === "creative-candidate";
  const sectionScopedCreativeColor = items.map((item) => {
    if (!creativeCandidate || globalLayoutScope.test(item.text)) return false;
    return item.text
      .split(/[.!?;]|\band\b/iu)
      .some(
        (clause) => requestsColorChange(clause) && mentionedSection(clause),
      );
  });
  const deterministic = items
    .flatMap((item, feedbackIndex) =>
      [
        ...deterministicOperations(item.text, config),
        // Explicit image and color choices are applied after text-derived
        // operations so the reviewer's selection always wins.
        ...structuredOperations(item, config),
      ].map((operation) => ({ ...operation, feedbackIndex })),
    )
    .filter(
      (operation) =>
        !(
          sectionScopedCreativeColor[operation.feedbackIndex] &&
          operation.kind === "set_color_palette"
        ),
    );
  const contentTargets = items.map((feedback) =>
    explicitContentTargets(feedback.text, config),
  );
  const structuredOnly = items.every(
    (item, index) =>
      !sectionScopedCreativeColor[index] &&
      intentsFor(item, config).every(
        (intent) =>
          intent === "image" || (intent === "color" && item.colors.length > 0),
      ),
  );
  const modeledOperations = structuredOnly
    ? []
    : await planner(textItems, config);
  const modeled = modeledOperations.filter((operation) => {
    if (!MODEL_OPERATION_KINDS.has(operation.kind)) return false;
    const item = items[operation.feedbackIndex];
    const feedback = item?.text;
    if (!feedback) return false;
    const intents = intentsFor(item, config);
    if (
      [
        "set_section_enabled",
        "reorder_section",
        "set_section_variant",
        "set_design_treatment",
      ].includes(operation.kind)
    )
      if (intents.includes("layout")) {
        const deterministicStructural = deterministic.filter(
          (expected) =>
            expected.feedbackIndex === operation.feedbackIndex &&
            [
              "set_section_enabled",
              "reorder_section",
              "set_section_variant",
              "set_design_treatment",
            ].includes(expected.kind),
        );
        if (
          deterministicStructural.length > 0 &&
          !deterministicStructural.some((expected) =>
            sameStructuralOperation(expected, operation),
          )
        )
          return false;
        const sectionTargets = scopedLayoutSections(feedback);
        if (!operationMatchesSectionScope(operation, sectionTargets, feedback))
          return false;
        const broadLayout = broadLayoutRequest.test(feedback);
        if (operation.kind === "set_design_treatment") {
          if (
            operation.density &&
            !broadLayout &&
            !/\b(spacing|spacious|compact|density|breathing room|tighter)\b/i.test(
              feedback,
            )
          )
            return false;
          if (
            operation.typography &&
            !broadLayout &&
            !/\b(typography|font|editorial|serif|sans|modern|bold|stronger)\b/i.test(
              feedback,
            )
          )
            return false;
        }
        if (
          operation.kind === "reorder_section" &&
          !broadLayout &&
          !/\b(move|reorder|above|below|before|after|place|put)\b/i.test(
            feedback,
          )
        )
          return false;
        if (
          operation.kind === "set_section_enabled" &&
          !/\b(add|show|include|enable|hide|remove|drop|disable)\b/i.test(
            feedback,
          )
        )
          return false;
        return true;
      } else return false;
    if (operation.kind === "set_conversion_feature")
      return intents.includes("conversion-feature");
    if (!intents.includes("content")) return false;
    const targets = contentTargets[operation.feedbackIndex];
    return (
      !targets.length ||
      targets.some((target) => contentOperationMatchesTarget(operation, target))
    );
  });
  const proposedCandidates = [...deterministic, ...modeled]
    .filter(
      (operation) =>
        Number.isInteger(operation.feedbackIndex) &&
        operation.feedbackIndex >= 0 &&
        operation.feedbackIndex < items.length,
    )
    .filter((operation, index, all) => {
      const signature = JSON.stringify(
        Object.fromEntries(
          Object.entries(operation).filter(([key]) => key !== "feedbackIndex"),
        ),
      );
      return (
        index ===
        all.findIndex(
          (candidate) =>
            candidate.feedbackIndex === operation.feedbackIndex &&
            JSON.stringify(
              Object.fromEntries(
                Object.entries(candidate).filter(
                  ([key]) => key !== "feedbackIndex",
                ),
              ),
            ) === signature,
        )
      );
    });
  const unsupportedCreativeStructureFeedback = new Set(
    creativeCandidate
      ? proposedCandidates
          .filter((operation) =>
            ["set_section_enabled", "reorder_section"].includes(operation.kind),
          )
          .map((operation) => operation.feedbackIndex)
      : [],
  );
  const candidates = proposedCandidates.filter((operation) => {
    if (!creativeCandidate) return true;
    if (["set_section_enabled", "reorder_section"].includes(operation.kind))
      return false;
    if (
      ["set_section_variant", "set_design_treatment"].includes(operation.kind)
    )
      return false;
    return !(
      sectionScopedCreativeColor[operation.feedbackIndex] &&
      operation.kind === "set_color_palette"
    );
  });
  const draft = structuredClone(config);
  const applied = [];
  for (const operation of candidates)
    if (applyOperation(draft, operation)) applied.push(operation);
  const results = items.map((item, feedbackIndex) => {
    const feedback = item.text;
    const intents = intentsFor(item, config);
    const unsupportedCreativeStructure =
      unsupportedCreativeStructureFeedback.has(feedbackIndex);
    const operations = applied.filter(
      (operation) => operation.feedbackIndex === feedbackIndex,
    );
    const fulfilled = intents.filter((intent) =>
      intent === "content"
        ? contentTargetsSatisfied(contentTargets[feedbackIndex], operations)
        : intent === "layout" && scopedLayoutSections(feedback).length > 0
          ? operations.some((operation) =>
              operationMatchesSectionScope(
                operation,
                scopedLayoutSections(feedback),
                feedback,
              ),
            )
          : intentSatisfied(intent, operations),
    );
    const unresolved = intents.filter((intent) => !fulfilled.includes(intent));
    const creativeDeferred = creativeCandidate
      ? unresolved.filter(
          (intent) =>
            (intent === "layout" && !unsupportedCreativeStructure) ||
            (intent === "color" &&
              sectionScopedCreativeColor[feedbackIndex]),
        )
      : [];
    const hardUnresolved = unresolved.filter(
      (intent) => !creativeDeferred.includes(intent),
    );
    const status =
      hardUnresolved.length === 0 && creativeDeferred.length
        ? "creative"
        : fulfilled.length === intents.length
          ? "fulfilled"
          : fulfilled.length
            ? "partial"
            : "manual";
    return {
      feedbackIndex,
      feedback: item.text,
      structuredColorOnly: item.colors.length > 0 &&
        !requestsColorChange(item.text.replace(/^\s*\[[^\]]+\]\s*/u, "")),
      ...(status === "creative" && item.assets.length
        ? { sourceFeedback: residualVisualRequest(item.text).trim() }
        : {}),
      intents,
      status,
      fulfilled,
      deferred: creativeDeferred,
      unresolved: hardUnresolved,
      operationKinds: operations.map((operation) => operation.kind),
      ...(unsupportedCreativeStructure
        ? {
            reason:
              "Creative section structure changes (adding, hiding, or reordering sections) are not supported by the source-edit lane and were not applied.",
          }
        : {}),
    };
  });
  return {
    config: draft,
    operations: applied,
    results,
    ok:
      results.length > 0 &&
      results.every((result) =>
        ["fulfilled", "creative"].includes(result.status),
      ),
  };
}
export function removeEmDashes(value) {
  if (typeof value === "string") return value.replace(/—/g, "-");
  if (Array.isArray(value)) return value.map(removeEmDashes);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, removeEmDashes(item)]),
    );
  return value;
}
export function ensureLegacySocialProofMarkup(source) {
  let output = String(source || "");
  if (output.includes("<PageSections") || output.includes("<SocialProof"))
    return output;
  const importAnchor = /import Header from [^;]+;\s*/;
  if (!importAnchor.test(output)) return output;
  output = output.replace(
    importAnchor,
    (match) =>
      `${match}import SocialProof from "../components/SocialProof.astro";\n`,
  );
  const servicesStart = output.search(
    /<section\b[^>]*id=["']services["'][^>]*>/i,
  );
  if (servicesStart < 0) return source;
  const servicesEnd = output.indexOf("</section>", servicesStart);
  if (servicesEnd < 0) return source;
  const insertAt = servicesEnd + "</section>".length;
  return `${output.slice(0, insertAt)}\n\n    <SocialProof />${output.slice(insertAt)}`;
}
export function expectedArtifacts(operations, config) {
  return operations.flatMap((operation) => {
    if (operation.kind === "replace_asset") {
      const placement =
        {
          logo: "header",
          photoOne: "hero",
          photoTwo: "about",
          photoThree: "gallery",
        }[operation.slot] || "page";
      return [
        {
          type: "asset",
          url: clean(operation.url),
          route: "/",
          placement,
          slot: operation.slot,
        },
      ];
    }
    if (operation.kind === "replace_copy_fragment") {
      const serviceMatch = operation.path?.match(
        /^services\[(\d+)\]\.description$/u,
      );
      const serviceSlug = serviceMatch
        ? config.services?.[Number(serviceMatch[1])]?.slug
        : "";
      const route = serviceSlug
        ? `/services/${serviceSlug}/`
        : operation.path?.startsWith("copy.about")
          ? "/about/"
          : operation.path === "copy.contactHeading"
            ? "/contact/"
            : operation.path?.startsWith("copy.services")
              ? "/services/"
              : "/";
      const placement = serviceMatch
        ? "service-description"
        : operation.path === "copy.heroHeading"
          ? "hero-heading"
          : ["copy.contactHeading", "copy.servicesHeading"].includes(
                operation.path,
              )
            ? "heading"
            : operation.path === "copy.heroKicker"
              ? "hero-eyebrow"
              : operation.path === "copy.heroBody"
                ? "hero-copy"
                : operation.path?.startsWith("conversion.process[")
                  ? "process-step"
                  : operation.path?.endsWith(".question") &&
                      operation.path?.startsWith("conversion.faqs[")
                    ? "faq-question"
                    : operation.path?.endsWith(".answer") &&
                        operation.path?.startsWith("conversion.faqs[")
                      ? "faq-answer"
                      : operation.path?.startsWith("differentiators[")
                        ? "proof-point"
                        : "page-copy";
      return [
        {
          type: "text",
          value: clean(operation.to),
          path: operation.path,
          route,
          placement,
        },
      ];
    }
    if (operation.kind === "update_business_fact")
      return [
        {
          type: "text",
          value: clean(operation.value),
          path: `business.${operation.field}`,
          route: "/",
          placement: "business-fact",
        },
      ];
    if (
      operation.kind === "update_design_token" &&
      operation.token === "palette"
    )
      return (operation.requested || []).map((entry) => ({
        type: "style",
        field: entry.field,
        value: entry.value,
      }));
    if (operation.kind === "update_design_token") {
      const artifacts = [];
      if (operation.value)
        artifacts.push({
          type: "style",
          field: "primaryColor",
          value: clean(operation.value).toLowerCase(),
        });
      if (operation.density)
        artifacts.push({
          type: "class",
          marker: `density-${operation.density}`,
        });
      if (operation.typography)
        artifacts.push({
          type: "class",
          marker: `type-${operation.typography}`,
        });
      return artifacts;
    }
    if (operation.kind === "set_social_proof")
      return [
        {
          type: "section-type",
          sectionType: "social-proof",
          text: clean(operation.heading),
        },
      ];
    if (operation.kind === "show_brand_name")
      return [{ type: "html", marker: 'class="wordmark__name"' }];
    if (operation.kind === "set_color_palette") {
      const artifacts = PALETTE_KEYS.map((field) => ({
        type: "style",
        field,
        value: operation.palette[field].toLowerCase(),
      }));
      if (/^#[0-9a-f]{6}$/i.test(String(operation.palette.accentColor || "")))
        artifacts.push({
          type: "style",
          field: "accentColor",
          value: String(operation.palette.accentColor).toLowerCase(),
        });
      return artifacts;
    }
    if (operation.kind === "set_copy") {
      const target = COPY_RENDER_TARGETS[operation.field];
      if (!COPY_FIELDS.has(operation.field) || !target)
        throw new Error(
          `Cannot verify rendered copy for unsupported field: ${operation.field || "(missing)"}`,
        );
      return [
        {
          type: "text",
          value: clean(config.copy?.[operation.field] ?? operation.value),
          path: `copy.${operation.field}`,
          field: operation.field,
          ...target,
          tags: [...target.tags],
        },
      ];
    }
    if (operation.kind === "set_image")
      return [
        {
          type: "image",
          path: clean(operation.path, 120),
          target: operation.target,
        },
      ];
    if (operation.kind === "set_service_copy")
      return [{ type: "text", value: clean(operation.description) }];
    if (operation.kind === "set_process")
      return operation.steps.map((value) => ({
        type: "text",
        value: clean(value),
      }));
    if (operation.kind === "set_faqs")
      return operation.faqs.flatMap((faq) => [
        { type: "text", value: clean(faq.question) },
        { type: "text", value: clean(faq.answer) },
      ]);
    if (operation.kind === "set_section_enabled" && operation.enabled) {
      const section = currentSections(config).find(
        (item) => item.type === operation.sectionType,
      );
      return section ? [{ type: "section", id: section.id }] : [];
    }
    if (operation.kind === "set_section_enabled" && !operation.enabled)
      return [
        {
          type: "absent-section-type",
          sectionType: operation.sectionType,
          id: operation.sectionId,
        },
      ];
    if (operation.kind === "reorder_section")
      return [
        {
          type: "order",
          before:
            operation.position === "before"
              ? operation.sectionType
              : operation.relativeTo,
          after:
            operation.position === "before"
              ? operation.relativeTo
              : operation.sectionType,
        },
      ];
    if (operation.kind === "set_section_variant")
      return [
        {
          type: "variant",
          sectionType: operation.sectionType,
          value: operation.variant,
        },
      ];
    if (operation.kind === "set_design_treatment")
      return [
        {
          type: "class",
          marker: `density-${operation.density || config.design?.treatment?.density || "balanced"}`,
        },
        {
          type: "class",
          marker: `type-${operation.typography || config.design?.treatment?.typography || "editorial"}`,
        },
      ];
    if (operation.kind === "set_conversion_feature")
      return [
        {
          type: operation.enabled ? "html" : "absent-html",
          marker: `data-conversion-feature="${operation.feature.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}"`,
        },
      ];
    return [];
  });
}
function sectionIdFor(config, type) {
  if (!config.design?.sections && type === "social-proof")
    return "social-proof";
  return currentSections(config).find((section) => section.type === type)?.id;
}
function renderedTextVariants(value) {
  const ampersands = String(value).replace(/&/gu, "&amp;");
  const markup = ampersands.replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  return [
    ...new Set([
      markup,
      markup.replace(/"/gu, "&quot;").replace(/'/gu, "&#39;"),
      markup.replace(/"/gu, "&quot;").replace(/'/gu, "&#x27;"),
      ...(!/[<>]/u.test(value) ? [ampersands] : []),
    ]),
  ];
}
function elementBodies(html, tag) {
  return [
    ...html.matchAll(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "giu"),
    ),
  ].map((match) => match[1]);
}
function containsRenderedText(html, value) {
  return renderedTextVariants(value).some((variant) => html.includes(variant));
}
function containsTextInElement(html, tag, value) {
  return elementBodies(html, tag).some((body) =>
    containsRenderedText(body, value),
  );
}
function containsTextInHero(html, tag, value) {
  const sections = [
    ...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/giu),
  ];
  const heroSections = sections
    .filter((match) => /hero/iu.test(match[1]))
    .map((match) => match[2]);
  return heroSections.some((section) =>
    containsTextInElement(section, tag, value),
  );
}
function htmlAttributeValue(attributes, name) {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"),
  );
  return match?.[2] || "";
}
function containsTextInCopyTarget(html, artifact, config) {
  const sectionTargets = new Set();
  if (artifact.sectionType) {
    const sectionId = sectionIdFor(config, artifact.sectionType);
    if (sectionId) sectionTargets.add(sectionId);
    sectionTargets.add(artifact.sectionType);
    for (const alias of RENDERED_SECTION_ALIASES[artifact.sectionType] || [])
      sectionTargets.add(alias);
  }
  const regions = [
    ...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/giu),
  ]
    .filter(([_, attributes]) => {
      if (artifact.sectionClass) {
        const classes = htmlAttributeValue(attributes, "class").split(/\s+/u);
        if (classes.includes(artifact.sectionClass)) return true;
      }
      if (sectionTargets.size) {
        const id = htmlAttributeValue(attributes, "id");
        const marker = htmlAttributeValue(attributes, "data-reference-section");
        return sectionTargets.has(id) || sectionTargets.has(marker);
      }
      return false;
    })
    .map(([, , body]) => body);
  return regions.some((region) =>
    (artifact.tags || []).some((tag) =>
      containsTextInElement(region, tag, artifact.value),
    ),
  );
}
function containsArtifactText(html, artifact, config) {
  if (!html) return false;
  if (artifact.field) return containsTextInCopyTarget(html, artifact, config);
  if (artifact.placement === "hero-heading")
    return containsTextInHero(html, "h1", artifact.value);
  if (artifact.placement === "heading")
    return ["h1", "h2", "h3"].some((tag) =>
      containsTextInElement(html, tag, artifact.value),
    );
  if (artifact.placement === "hero-eyebrow")
    return ["span", "p"].some((tag) =>
      containsTextInHero(html, tag, artifact.value),
    );
  if (artifact.placement === "hero-copy")
    return containsTextInHero(html, "p", artifact.value);
  if (
    artifact.placement === "service-description" ||
    artifact.placement === "faq-answer" ||
    artifact.placement === "proof-point"
  )
    return containsTextInElement(html, "p", artifact.value);
  if (artifact.placement === "process-step")
    return (
      containsTextInElement(html, "li", artifact.value) ||
      containsTextInElement(html, "p", artifact.value)
    );
  if (artifact.placement === "faq-question")
    return containsTextInElement(html, "summary", artifact.value);
  return containsRenderedText(html, artifact.value);
}
function imageSourceMarkup(url) {
  const ampersands = String(url).replace(/&/gu, "&amp;");
  return [
    `src=\"${url}\"`,
    `src='${url}'`,
    `src=\"${ampersands}\"`,
    `src='${ampersands}'`,
  ];
}
function assetPlacementHtml(html, placement) {
  if (!placement) return html;
  const stack = [];
  const regions = [];
  const voidTags = new Set([
    "img",
    "source",
    "input",
    "br",
    "hr",
    "meta",
    "link",
    "area",
    "base",
    "embed",
    "param",
    "track",
    "wbr",
  ]);
  const markup = String(html)
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<!--[\s\S]*?-->/gu, "");
  for (const match of markup.matchAll(
    /<(\/?)([a-z][a-z0-9:-]*)\b([^>]*)>/giu,
  )) {
    const [, closing, rawTag, attributes] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.findLastIndex((entry) => entry.tag === tag);
      if (index < 0) continue;
      for (const entry of stack.splice(index))
        if (entry.matches)
          regions.push(
            markup.slice(entry.start, match.index + match[0].length),
          );
      continue;
    }
    if (voidTags.has(tag) || /\/\s*$/u.test(attributes)) continue;
    const labels = [
      htmlAttributeValue(attributes, "id"),
      htmlAttributeValue(attributes, "class"),
      htmlAttributeValue(attributes, "data-reference-section"),
      htmlAttributeValue(attributes, "data-section-type"),
    ]
      .join(" ")
      .toLowerCase();
    const matches =
      placement === "header"
        ? tag === "header"
        : (placement === "hero" &&
            /\bdata-hero(?:\s|=|$)/iu.test(attributes)) ||
          labels.split(/[^a-z0-9]+/u).includes(placement);
    stack.push({ tag, start: match.index, matches });
  }
  return regions.join("\n");
}
function containsAsset(html, artifact) {
  const region = assetPlacementHtml(html, artifact.placement);
  return imageSourceMarkup(artifact.url).some((marker) =>
    region.includes(marker),
  );
}
function containsRequestedImage(html, artifact, config) {
  const markup = String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<!--[\s\S]*?-->/gu, "");
  const placement = {
    logo: "header",
    hero: "hero",
    secondary: "about",
    tertiary: "gallery",
    team: "team",
  }[artifact.target];
  let region = placement ? assetPlacementHtml(markup, placement) : markup;
  // Older deterministic pages may have no section markers. Authored pages
  // must prove the requested role, rather than merely serialize the URL.
  if (
    !region &&
    config.design?.experience?.renderer !== "creative-candidate" &&
    !/<section\b/iu.test(markup)
  )
    region = markup;
  return [...region.matchAll(/<img\b[^>]*>/giu)].some(([image]) =>
    imageSourceMarkup(artifact.path).some((source) => image.includes(source)),
  );
}

/** @param {Record<string, string> | null} [htmlPages=null] */
export function verifyRevision(
  config,
  report,
  html = "",
  allHtml = html,
  htmlPages = null,
) {
  const failures = [];
  const selectedCandidateId = String(
    config.design?.experience?.candidateId || "",
  ).trim();
  const verifiedCandidateId = String(
    report.creativeSourceRepairVerified?.candidateId || "",
  ).trim();
  const creativeFeedbackResults = Array.isArray(report.results)
    ? report.results.filter((result) => result.status === "creative")
    : [];
  const baseCreativeSourceVerified =
    report.creativeSourceRepairVerified?.pass === true &&
    Boolean(verifiedCandidateId) &&
    (!selectedCandidateId || verifiedCandidateId === selectedCandidateId);
  const itemProofs = Array.isArray(
    report.creativeSourceRepairVerified?.feedbackResults,
  )
    ? report.creativeSourceRepairVerified.feedbackResults
    : [];
  const itemProofsRequired =
    creativeFeedbackResults.length > 1 || itemProofs.length > 0;
  const expectedCreativeIndexes = new Set(
    creativeFeedbackResults.map((result) => result.feedbackIndex),
  );
  const creativeIndexesValid =
    expectedCreativeIndexes.size === creativeFeedbackResults.length &&
    creativeFeedbackResults.every((result) =>
      Number.isSafeInteger(result.feedbackIndex),
    );
  const itemProofByIndex = new Map();
  let itemProofSetValid =
    itemProofs.length === creativeFeedbackResults.length &&
    expectedCreativeIndexes.size === creativeFeedbackResults.length;
  for (const proof of itemProofs) {
    const index = proof?.feedbackIndex;
    const expectedResult = creativeFeedbackResults.find(
      (result) => result.feedbackIndex === index,
    );
    if (
      !Number.isSafeInteger(index) ||
      !expectedCreativeIndexes.has(index) ||
      itemProofByIndex.has(index) ||
      proof?.verdict !== "pass" ||
      typeof proof?.evidence !== "string" ||
      !proof.evidence.trim() ||
      !expectedResult?.feedback ||
      String(proof?.feedback || "").trim() !==
        String(expectedResult.feedback).trim() ||
      (selectedCandidateId && proof?.candidateId !== selectedCandidateId)
    ) {
      itemProofSetValid = false;
      continue;
    }
    itemProofByIndex.set(index, proof);
  }
  if (itemProofByIndex.size !== expectedCreativeIndexes.size)
    itemProofSetValid = false;
  const creativeSourceVerified =
    baseCreativeSourceVerified &&
    creativeIndexesValid &&
    (!itemProofsRequired || itemProofSetValid);
  if (!Array.isArray(report.results) || !report.results.length)
    failures.push("Revision has no per-feedback results.");
  if (report.creativeSourceRepairRequired === true && !creativeSourceVerified)
    failures.push(
      itemProofsRequired && !itemProofSetValid
        ? "Creative source repair requires separate rendered evidence for every creative feedback index."
        : "Creative source repair was required but did not pass rendered human verification.",
    );
  for (const result of report.results || []) {
    const creativeVerified =
      result.status === "creative" &&
      report.creativeSourceRepairRequired === true &&
      baseCreativeSourceVerified &&
      (!itemProofsRequired ||
        (itemProofSetValid && itemProofByIndex.has(result.feedbackIndex)));
    if (result.status !== "fulfilled" && !creativeVerified)
      failures.push(
        `Feedback item ${result.feedbackIndex + 1} is ${result.status}: ${result.unresolved?.join(", ") || "unresolved"}.`,
      );
  }
  for (const artifact of report.expectedArtifacts || []) {
    if (artifact.type === "html" && !html.includes(artifact.marker))
      failures.push(`Missing rendered artifact: ${artifact.marker}`);
    if (artifact.type === "absent-html" && html.includes(artifact.marker))
      failures.push(`Rendered artifact should be absent: ${artifact.marker}`);
    if (
      artifact.type === "section" &&
      !new RegExp(`<section[^>]+id=["']${artifact.id}["']`).test(html)
    )
      failures.push(`Missing rendered section: ${artifact.id}`);
    if (artifact.type === "section-type") {
      const id = sectionIdFor(config, artifact.sectionType);
      if (!id || !new RegExp(`<section[^>]+id=["']${id}["']`).test(html))
        failures.push(`Missing rendered section type: ${artifact.sectionType}`);
      if (artifact.text && !html.includes(artifact.text))
        failures.push(`Missing rendered section heading: ${artifact.text}`);
    }
    if (artifact.type === "absent-section-type") {
      const defaults = DEFAULT_SECTIONS[recipeFor(config)];
      const id =
        artifact.id ||
        defaults.find(([, type]) => type === artifact.sectionType)?.[0];
      if (id && new RegExp(`<section[^>]+id=["']${id}["']`).test(html))
        failures.push(`Section should be absent: ${artifact.sectionType}`);
    }
    const renderedPage = artifact.route
      ? htmlPages
        ? htmlPages[artifact.route] || ""
        : artifact.route === "/"
          ? html
          : allHtml
      : allHtml;
    if (
      artifact.type === "text" &&
      !containsArtifactText(renderedPage, artifact, config)
    )
      failures.push(
        `Missing rendered text at ${artifact.path || "the expected page"}: ${artifact.value.slice(0, 80)}`,
      );
    if (artifact.type === "asset" && !containsAsset(renderedPage, artifact))
      failures.push(
        `Missing rendered replacement asset at ${artifact.placement || "the expected page"}: ${artifact.url}`,
      );
    if (
      artifact.type === "style" &&
      !html.toLowerCase().includes(artifact.value)
    )
      failures.push(
        `Missing rendered color: ${artifact.field}=${artifact.value}`,
      );
    if (artifact.type === "image" && !containsRequestedImage(html, artifact, config))
      failures.push(`Missing rendered image: ${artifact.path}`);
    if (
      artifact.type === "variant" &&
      !html.includes(`variant-${artifact.value}`)
    )
      failures.push(`Missing rendered variant: ${artifact.value}`);
    if (artifact.type === "class" && !html.includes(artifact.marker))
      failures.push(`Missing rendered treatment: ${artifact.marker}`);
    if (artifact.type === "order") {
      const before = sectionIdFor(config, artifact.before);
      const after = sectionIdFor(config, artifact.after);
      if (
        !before ||
        !after ||
        html.indexOf(`id="${before}"`) > html.indexOf(`id="${after}"`)
      )
        failures.push(
          `Rendered section order is wrong: ${artifact.before} before ${artifact.after}`,
        );
    }
  }
  if (
    config.socialProof?.source === "google_reviews" &&
    !clean(config.business?.placeId)
  )
    failures.push("Google reviews were selected without a Place ID.");
  if (html.includes("—")) failures.push("Rendered page contains an em dash.");
  return { ok: failures.length === 0, failures };
}
export { COPY_FIELDS, SECTION_VARIANTS };
