import { parseModelJson } from "./model-json.mjs";
import { resolvePalette } from "./palette-policy.mjs";

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

const PALETTE_KEYS = [
  "primaryColor",
  "surfaceColor",
  "heroColor",
  "inkColor",
  "mutedColor",
  "lineColor",
];
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
const layoutRequest =
  /\b(layout|reorder|move|above|below|before|after|hide|remove|show|add|section|spacing|spacious|compact|density|typography|font|modern|editorial|bold|immersive|center(?:ed)?)\b/i;
const contentRequest =
  /\b(copy|wording|text|headline|heading|kicker|description|intro|service card|form intro)\b|(?:rewrite|revise|edit|change|update|clarify|expand|shorten|simplify|condense).{0,50}\b(faq|question|answer|process|step|hero|opening)\b|\b(faq|question|answer|process|step|hero|opening)\b.{0,50}(?:say|read|explain|mention|shorter|simpler|concise|bloated|too long)\b/i;
const conversionFeatureRequest =
  /\b(exit(?:-intent)? (?:offer|popup|modal)|before you go|quick answers?|website assistant|faq (?:widget|assistant|chat)|ai (?:faq )?(?:chat|assistant|chatbot)|chatbot|guided (?:qualifier|questions?)|qualification (?:form|questions?)|question(?:naire)? tool|multi-step form)\b/i;

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
function structuralOperations(feedback, config) {
  const text = clean(feedback, 1200).toLowerCase();
  const operations = [];
  const sections = currentSections(config);
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
    /\b(more spacious|more breathing room|increase (?:the )?spacing|generous spacing)\b/i.test(
      text,
    )
  )
    operations.push({ kind: "set_design_treatment", density: "spacious" });
  if (
    /\b(more compact|less spacing|tighter|reduce (?:the )?spacing)\b/i.test(
      text,
    )
  )
    operations.push({ kind: "set_design_treatment", density: "compact" });
  if (
    /\b(editorial|serif)\b/i.test(text) &&
    /\b(font|typography|look|style|layout)\b/i.test(text)
  )
    operations.push({ kind: "set_design_treatment", typography: "editorial" });
  if (
    /\b(modern|sans(?: serif)?|cleaner)\b/i.test(text) &&
    /\b(font|typography|look|style|layout)\b/i.test(text)
  )
    operations.push({ kind: "set_design_treatment", typography: "sans" });
  if (
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
function intentsFor(feedback, config) {
  const intents = [];
  if (socialProofRequest.test(feedback)) intents.push("social-proof");
  if (requestsColorChange(feedback)) intents.push("color");
  if (brandNameRequest.test(feedback)) intents.push("brand-name");
  const structuralFeedback = feedbackWithoutConversionFeatures(feedback);
  const structural = layoutRequest.test(structuralFeedback)
    ? structuralOperations(structuralFeedback, config)
    : [];
  if (
    broadLayoutRequest.test(feedback) ||
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
  return intents.length ? [...new Set(intents)] : ["unknown"];
}
export async function modelOperations(
  feedbackItems,
  config,
  model = "z-ai/glm-5.3-flash",
) {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const items = Array.isArray(feedbackItems) ? feedbackItems : [feedbackItems];
  for (const reasoningEffort of ["low", "high"]) {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "LaunchLoom revision operations",
        },
        body: JSON.stringify({
          model,
          reasoning_effort: reasoningEffort,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Return JSON only: {plans:[{feedbackIndex,operations:[...]}]}. Plan every feedback item independently. Preserve approved facts, assets, stable section IDs, and unrelated content. Allowed operations: {kind:'set_copy',field,value}; {kind:'set_service_copy',serviceSlug,description}; {kind:'set_process',steps:[...]}; {kind:'set_faqs',faqs:[{question,answer}]}; {kind:'set_section_enabled',sectionType,enabled}; {kind:'reorder_section',sectionType,relativeTo,position:'before'|'after'}; {kind:'set_section_variant',sectionType,variant}; {kind:'set_design_treatment',density:'compact'|'balanced'|'spacious',typography:'editorial'|'sans'|'strong'}; {kind:'set_conversion_feature',feature:'guidedQualifier'|'quickAnswers'|'aiChat'|'exitOffer',enabled:boolean}. Allowed set_copy fields are heroKicker (small label above the heading), heroHeading (main H1), heroBody (intro paragraph), servicesHeading, servicesIntro, aboutKicker, aboutHeading, aboutBody, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. Keep hero headings to 4-10 memorable words, hero bodies to one sentence under 28 words, and service-card descriptions to one sentence under 22 words. A request to shorten or simplify the hero should normally revise heroHeading and/or heroBody while preserving verified meaning. Use only the supplied allowlisted fields, existing service slugs, section types and variants. Only enable an exit offer when the approved business context contains a real offer. Broader layout changes are allowed only when explicitly requested. Never invent reviews, credentials, prices, guarantees, locations, timelines, staff, outcomes, or business facts. Never change contact details, service names, recipe, or assets. Do not use em dashes. Return no operation for an unsafe or unsupported request.`,
            },
            {
              role: "user",
              content: `Feedback items:\n${JSON.stringify(items.map((feedback, feedbackIndex) => ({ feedbackIndex, feedback })))}\n\nApproved context:\n${JSON.stringify({ recipe: recipeFor(config), industry: config.industry, businessKind: config.businessKind, business: config.business, differentiators: config.differentiators, services: config.services, copy: config.copy, process: config.conversion?.process, faqs: config.conversion?.faqs, sections: currentSections(config), allowedVariants: allowedVariants(config) })}`,
            },
          ],
        }),
      },
    );
    if (!response.ok) continue;
    try {
      const content = (await response.json()).choices?.[0]?.message?.content;
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
    if (
      !palette ||
      typeof palette !== "object" ||
      PALETTE_KEYS.some(
        (key) => !/^#[0-9a-f]{6}$/i.test(String(palette[key] || "")),
      )
    )
      return false;
    config.style = {
      ...(config.style || {}),
      ...resolvePalette(
        Object.fromEntries(
          PALETTE_KEYS.map((key) => [key, palette[key].toLowerCase()]),
        ),
      ),
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
  const items = feedbackItems.map((item) => clean(item, 4000)).filter(Boolean);
  const deterministic = items.flatMap((feedback, feedbackIndex) =>
    deterministicOperations(feedback, config).map((operation) => ({
      ...operation,
      feedbackIndex,
    })),
  );
  const modeled = (await planner(items, config)).filter((operation) => {
    if (!MODEL_OPERATION_KINDS.has(operation.kind)) return false;
    const feedback = items[operation.feedbackIndex];
    if (!feedback) return false;
    const intents = intentsFor(feedback, config);
    if (
      [
        "set_section_enabled",
        "reorder_section",
        "set_section_variant",
        "set_design_treatment",
      ].includes(operation.kind)
    )
      if (intents.includes("layout")) {
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
    return intents.includes("content");
  });
  const candidates = [...deterministic, ...modeled]
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
  const draft = structuredClone(config);
  const applied = [];
  for (const operation of candidates)
    if (applyOperation(draft, operation)) applied.push(operation);
  const results = items.map((feedback, feedbackIndex) => {
    const intents = intentsFor(feedback, config);
    const operations = applied.filter(
      (operation) => operation.feedbackIndex === feedbackIndex,
    );
    const fulfilled = intents.filter((intent) =>
      intentSatisfied(intent, operations),
    );
    const status =
      fulfilled.length === intents.length
        ? "fulfilled"
        : fulfilled.length
          ? "partial"
          : "manual";
    return {
      feedbackIndex,
      feedback,
      intents,
      status,
      fulfilled,
      unresolved: intents.filter((intent) => !fulfilled.includes(intent)),
      operationKinds: operations.map((operation) => operation.kind),
    };
  });
  return {
    config: draft,
    operations: applied,
    results,
    ok:
      results.length > 0 &&
      results.every((result) => result.status === "fulfilled"),
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
    if (operation.kind === "set_color_palette")
      return PALETTE_KEYS.map((field) => ({
        type: "style",
        field,
        value: operation.palette[field].toLowerCase(),
      }));
    if (operation.kind === "set_copy")
      return [{ type: "text", value: clean(operation.value) }];
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
export function verifyRevision(config, report, html = "") {
  const failures = [];
  if (!Array.isArray(report.results) || !report.results.length)
    failures.push("Revision has no per-feedback results.");
  for (const result of report.results || [])
    if (result.status !== "fulfilled")
      failures.push(
        `Feedback item ${result.feedbackIndex + 1} is ${result.status}: ${result.unresolved?.join(", ") || "unresolved"}.`,
      );
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
    if (
      artifact.type === "text" &&
      !html.includes(artifact.value.replace(/&/g, "&amp;"))
    )
      failures.push(`Missing rendered text: ${artifact.value.slice(0, 80)}`);
    if (
      artifact.type === "style" &&
      !html.toLowerCase().includes(artifact.value)
    )
      failures.push(
        `Missing rendered color: ${artifact.field}=${artifact.value}`,
      );
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
