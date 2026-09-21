import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { parseModelJson } from "./model-json.mjs";
import {
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedText,
  promptCachedMessageContent,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";
import { resolvePalette } from "./palette-policy.mjs";
import {
  defaultHistoryPath,
  recentLayoutFingerprints,
} from "./launch-history.mjs";
import { selectDesignVariant } from "../templates/client-site/src/lib/design-variants.ts";
import {
  avoidPackIdsFromNotes,
  listExperiencePacks,
  selectExperiencePackId,
  selectExperienceVariantId,
} from "../templates/client-site/src/lib/experience-pack.ts";

export { parseModelJson } from "./model-json.mjs";

function recentFingerprintsForSelection() {
  try {
    return recentLayoutFingerprints(
      JSON.parse(readFileSync(defaultHistoryPath(), "utf8")),
    );
  } catch {
    return [];
  }
}

const MODEL = "z-ai/glm-5.3-flash";

const SHARED_CREATIVE_DIRECTION =
  "Build a specific local-business decision journey. Near the opening, make clear who the business helps, what it provides, where it operates when location matters, and the next action. The hero headline must be a memorable 4-10 word promise, not a list of services. The hero body must be one useful sentence under 28 words. Service-card descriptions must be one distinct sentence under 22 words. Give each section a distinct job; do not repeat one claim across the hero, proof, services, and About copy. Use one primary action and one useful secondary action. Prefer client assets. Mention no person in a stock image as an employee, customer, patient, or client. Treat an area served as coverage, not a physical office. Do not use em dashes.";

const RECIPE_CREATIVE_DIRECTION =
  "For home care and care businesses, write for the person and family making a trust-sensitive decision: calm editorial language, routines and concerns, a clear first conversation, practical preparation, and reassurance without medical promises. Keep home care language distinct from treatment or aesthetics language. For local trades, use direct problem-led language: identify recognizable symptoms, coverage, what the customer should prepare, and the next service step. Do not promise price, arrival time, warranty, or availability unless supplied.";

function seoResearchForConfig(value) {
  if (!value || typeof value !== "object") return undefined;
  const mode = ["researched", "context-only", "baseline"].includes(value.mode)
    ? value.mode
    : "baseline";
  const list = (items, limit = 12) =>
    (Array.isArray(items) ? items : []).slice(0, limit);
  return {
    version: 1,
    mode,
    publishReady: mode === "researched",
    validatedQueries: list(value.validatedQueries),
    customerQuestions: list(value.customerQuestions),
    copyVocabulary: list(value.copyVocabulary, 16),
    pageDecisions: list(value.pageDecisions),
    prohibitedClaims: list(value.prohibitedClaims),
    evidence: list(value.evidence, 6),
    cost: {
      tasks: Number(value.cost?.tasks) || 0,
      usd: Number(value.cost?.usd) || 0,
      limitUsd: Number(value.cost?.limitUsd) || 0.1,
    },
    warnings: list(value.warnings, 8),
  };
}

export function prepareGenerationIntake(intake = {}) {
  return {
    ...intake,
    seoResearch: seoResearchForConfig(intake.seoResearch || {}),
  };
}

const STOCK_PACKS = {
  "home-care": {
    hero: "https://images.unsplash.com/photo-1543333995-a78aea2eee50?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1762955911431-4c44c7c3f408?auto=format&fit=crop&w=1200&q=85",
    metadata: {
      hero: {
        provider: "Unsplash",
        creator: "Dominik Lange",
        sourceUrl: "https://unsplash.com/photos/VUOiQW4OeLI",
        license: "Unsplash License",
        subject: "caregiver walking outdoors with an older adult",
      },
      secondary: {
        provider: "Unsplash",
        creator: "Age Cymru",
        sourceUrl: "https://unsplash.com/photos/bSXk1lOp8T0",
        license: "Unsplash License",
        subject: "care worker supporting older adults during an activity",
      },
    },
  },
  "garage-door": {
    hero: "https://images.unsplash.com/photo-1770756051811-1612ac8bedfa?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1571189437635-473398e910c1?auto=format&fit=crop&w=1200&q=85",
    metadata: {
      hero: {
        provider: "Unsplash",
        creator: "GoodLifeConstruction",
        sourceUrl: "https://unsplash.com/photos/3qRx6B4cT6g",
        license: "Unsplash License",
        subject: "modern residential garage doors",
      },
      secondary: {
        provider: "Unsplash",
        creator: "Vincent Wachowiak",
        sourceUrl: "https://unsplash.com/photos/11DIVFs4kKE",
        license: "Unsplash License",
        subject: "residential gray garage door",
      },
    },
  },
  wellness: {
    hero: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=85",
  },
  "home-services": {
    hero: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=85",
  },
  "professional-services": {
    hero: "/images/packs/professional-services-advisory-v1.png",
  },
};

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "client-site"
  );
}

export function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : "";
  return value && !value.startsWith("--") ? value : "";
}

function serviceIdentity(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length > 2 &&
          !["and", "the", "for", "service", "services"].includes(token),
      ),
  );
}

function serviceMatchScore(first, second) {
  const left = serviceIdentity(first);
  const right = serviceIdentity(second);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(left.size, right.size);
}

function lines(value) {
  const input = String(value || "");
  const splitCommas = !input.includes("\n");
  const items = [];
  let current = "";
  let parenthesisDepth = 0;
  for (const character of input) {
    if (character === "(") parenthesisDepth += 1;
    if (character === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    if (
      character === "\n" ||
      (splitCommas && character === "," && parenthesisDepth === 0)
    ) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function text(value, limit = 240) {
  const cleaned = String(value || "")
    .replace(/—/g, "-")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= limit) return cleaned;
  const excerpt = cleaned.slice(0, limit + 1);
  const sentenceEnd = Math.max(
    excerpt.lastIndexOf(". "),
    excerpt.lastIndexOf("! "),
    excerpt.lastIndexOf("? "),
  );
  if (sentenceEnd >= Math.floor(limit * 0.55))
    return excerpt.slice(0, sentenceEnd + 1).trim();
  const wordEnd = excerpt.lastIndexOf(" ", limit);
  return excerpt.slice(0, wordEnd > 0 ? wordEnd : limit).trim();
}

const WRITING_SYSTEMS = {
  Latin: /\p{Script=Latin}/u,
  Han: /\p{Script=Han}/u,
  Hiragana: /\p{Script=Hiragana}/u,
  Katakana: /\p{Script=Katakana}/u,
  Hangul: /\p{Script=Hangul}/u,
  Cyrillic: /\p{Script=Cyrillic}/u,
  Arabic: /\p{Script=Arabic}/u,
  Hebrew: /\p{Script=Hebrew}/u,
  Devanagari: /\p{Script=Devanagari}/u,
  Thai: /\p{Script=Thai}/u,
  Greek: /\p{Script=Greek}/u,
};
const SCRIPT_NEUTRAL_LETTERS = /[\p{Script=Common}\p{Script=Inherited}]/u;

function writingSystems(value) {
  const systems = new Set();
  for (const character of String(value || "")) {
    if (!/\p{Letter}/u.test(character)) continue;
    if (SCRIPT_NEUTRAL_LETTERS.test(character)) continue;
    const matched = Object.entries(WRITING_SYSTEMS).find(([, pattern]) =>
      pattern.test(character),
    );
    systems.add(matched?.[0] || "Other");
  }
  return systems;
}

function writingSystemFamily(value) {
  const systems = writingSystems(value);
  if (systems.has("Hiragana") || systems.has("Katakana")) return "Japanese";
  if (systems.has("Hangul")) return "Korean";
  const nonLatin = [...systems].filter((system) => system !== "Latin");
  return nonLatin[0] || "Latin";
}

function matchesWritingSystem(value, clientSource) {
  const candidate = writingSystems(value);
  if (!candidate.size) return true;
  const family = writingSystemFamily(clientSource);
  if (family === "Japanese") {
    const allowed = new Set(["Latin", "Han", "Hiragana", "Katakana"]);
    return (
      ["Han", "Hiragana", "Katakana"].some((system) =>
        candidate.has(system),
      ) && [...candidate].every((system) => allowed.has(system))
    );
  }
  if (family === "Korean") {
    const allowed = new Set(["Latin", "Han", "Hangul"]);
    return (
      candidate.has("Hangul") &&
      [...candidate].every((system) => allowed.has(system))
    );
  }
  const allowed =
    family === "Latin" ? new Set(["Latin"]) : new Set(["Latin", family]);
  return (
    candidate.has(family) &&
    [...candidate].every((system) => allowed.has(system))
  );
}

function safeGeneratedText(
  value,
  fallback,
  clientSource,
  limit = 240,
  clientFallback = "",
) {
  const candidate = text(value, limit);
  if (matchesWritingSystem(candidate, clientSource)) return candidate;
  const deterministicFallback = text(fallback, limit);
  if (matchesWritingSystem(deterministicFallback, clientSource))
    return deterministicFallback;
  return text(clientFallback, limit);
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function conciseHeadline(value, fallback = "", charLimit = 72, wordLimit = 10) {
  const cleaned = text(value || fallback, 180).replace(/[.!?]+$/, "");
  if (cleaned.length <= charLimit && wordCount(cleaned) <= wordLimit)
    return cleaned;
  const firstClause = cleaned.split(/[,;:]/)[0]?.trim();
  if (
    firstClause &&
    wordCount(firstClause) >= 3 &&
    firstClause.length <= charLimit &&
    wordCount(firstClause) <= wordLimit
  )
    return firstClause;
  return cleaned
    .split(/\s+/)
    .slice(0, wordLimit)
    .join(" ")
    .slice(0, charLimit)
    .trim();
}

function conciseSentence(
  value,
  fallback = "",
  charLimit = 150,
  wordLimit = 22,
) {
  const cleaned = text(value || fallback, 360);
  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  const source =
    firstSentence && firstSentence.length >= 35 ? firstSentence : cleaned;
  const words = source.split(/\s+/).filter(Boolean);
  let result = words.slice(0, wordLimit).join(" ");
  if (result.length > charLimit) {
    const wordEnd = result.lastIndexOf(" ", charLimit);
    result = result.slice(0, wordEnd > 0 ? wordEnd : charLimit);
  }
  result = result.replace(/[,;:]$/, "").trim();
  if (result && !/[.!?]$/.test(result)) result += ".";
  return result;
}

function proofStatements(value) {
  const cleaned = text(value, 2000);
  return (cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((statement) => conciseSentence(statement, statement, 190, 26))
    .filter(Boolean);
}

function hasConflictingUnverifiedAddress(intake) {
  if (text(intake.placeId, 200) || !text(intake.address, 400)) return false;
  const context = text(intake.differentiators, 2000);
  const claimedBase = context.match(
    /\b(?:based|located|headquartered)\s+in\s+([a-z][a-z .'-]{1,60}?)(?=\s+(?:where|with|and)\b|[,.;]|$)/i,
  )?.[1];
  if (!claimedBase) return false;
  const normalizeLocation = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return !normalizeLocation(intake.address).includes(
    normalizeLocation(claimedBase),
  );
}

function safeHex(value, fallback) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}

function paletteHintsFromIntake(intake, primaryColor) {
  const notes = text(intake.brandNotes, 1200);
  const background = notes.match(
    /(?:background|page|surface)\s*(?:color)?\s*[:=(]?\s*(#[0-9a-f]{6})/i,
  )?.[1];
  const ink = notes.match(
    /(?:text|typography|copy)\s*(?:color)?\s*[:=(]?\s*(#[0-9a-f]{6})/i,
  )?.[1];
  return resolvePalette({
    primaryColor,
    ...(background ? { surfaceColor: background } : {}),
    ...(ink ? { inkColor: ink } : {}),
  });
}

function usefulServiceDescription(value, serviceName) {
  const candidate = conciseSentence(value, "", 125, 20);
  const generic =
    /tailored to your needs|personalized support|quality you can trust|when it matters|next level/i;
  if (candidate.length >= 28 && !generic.test(candidate)) return candidate;
  return `Talk through your needs for ${serviceName} and leave with a clear next step.`;
}

function hasExactLocation(business) {
  return (
    Boolean(text(business?.placeId, 200)) ||
    /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(text(business?.address, 300))
  );
}

function isDirectionsCta(business) {
  return text(business?.primaryCta, 80).toLowerCase() === "get directions";
}

function primaryCtaTarget(business) {
  return isDirectionsCta(business) && hasExactLocation(business)
    ? "#location"
    : "#contact";
}

function contactHeadingFor(business, fallback) {
  return isDirectionsCta(business)
    ? `Contact ${text(business?.name, 100)}`
    : business.primaryCta || fallback;
}

function processStepText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const step = value;
    return text(
      step.title ||
        step.label ||
        step.name ||
        step.step ||
        step.text ||
        step.description,
      120,
    );
  }
  return text(value, 120);
}

function industryFor(intake) {
  const selected = text(intake.industry, 80).toLowerCase();
  if (
    [
      "wellness",
      "home-services",
      "technology",
      "professional-services",
      "hospitality",
      "real-estate",
      "other",
    ].includes(selected)
  )
    return selected;
  const facts = [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
  if (/\b(?:pet|dog|cat|groom\w*|veterinar\w*)\b/.test(facts)) return "other";
  if (
    /health|care|wellness|clinic|therapy|dental|medspa|medical|beauty/.test(
      facts,
    )
  )
    return "wellness";
  if (
    /repair|plumb|electric|roof|garage|cleaning|landscap|hvac|contractor/.test(
      facts,
    )
  )
    return "home-services";
  if (/software|technology|tech|saas|app|digital|ai |automation/.test(facts))
    return "technology";
  if (/law|legal|account|consult|financial|insurance|agency/.test(facts))
    return "professional-services";
  return "other";
}

function businessKindFor(intake, industry) {
  const facts = [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
  if (
    /home care|home health|caregiver|senior care|elder care|personal care|respite/.test(
      facts,
    )
  )
    return "home-care";
  if (/garage door|overhead door|door opener|torsion spring/.test(facts))
    return "garage-door";
  if (
    /athletic club|fitness|gym|strength training|personal training|sports performance|recovery club/.test(
      facts,
    )
  )
    return "fitness";
  return industry;
}

function stockImages(kind) {
  // These are reviewed packs, not a live keyword search. If the pack does not
  // describe the business, the template intentionally renders brand art.
  const pack = STOCK_PACKS[kind] || {};
  return {
    ...(pack.hero ? { hero: pack.hero } : {}),
    ...(pack.secondary ? { secondary: pack.secondary } : {}),
  };
}

function stockAssetReport(kind, images) {
  const pack = STOCK_PACKS[kind];
  if (!pack?.metadata) return [];
  return ["hero", "secondary"]
    .filter((placement) => images[placement] && pack.metadata[placement])
    .map((placement) => ({
      asset: placement,
      placement,
      source: "stock-pack",
      ...pack.metadata[placement],
    }));
}

function decisionSupportFor(kind, serviceName) {
  if (kind === "home-care")
    return {
      scope: `Ask how ${serviceName} can support the person's current routines and preferences.`,
      nextStep:
        "Begin with a care conversation before a plan or schedule is proposed.",
      preparation:
        "Note the routines that need support, preferred timing, and who should join the conversation.",
    };
  if (kind === "garage-door")
    return {
      scope: `Describe the symptoms that led you to request ${serviceName}.`,
      nextStep:
        "Share the service address so coverage and the appropriate next step can be confirmed.",
      preparation:
        "Note whether the door is open or closed and avoid handling springs, cables, or an unstable door.",
    };
  return {
    scope: `Ask what is included in ${serviceName} for your situation.`,
    nextStep:
      "Share your goal and contact details so the team can recommend the next step.",
    preparation:
      "Bring the questions and constraints that matter to your decision.",
  };
}

function requestedTypography(intake, fallback) {
  const notes = text(intake.brandNotes, 1000).toLowerCase();
  if (/condensed|narrow type/.test(notes)) return "condensed";
  if (/industrial|utilitarian/.test(notes)) return "industrial";
  if (/geometric|bold geometric/.test(notes)) return "geometric";
  if (/humanist/.test(notes)) return "humanist";
  if (/soft[- ]sans|rounded sans/.test(notes)) return "soft-sans";
  if (/modern serif/.test(notes)) return "modern-serif";
  if (/refined serif|high contrast serif/.test(notes)) return "refined-serif";
  if (/heritage|traditional serif/.test(notes)) return "heritage";
  if (/sans[- ]serif|sans serif/.test(notes)) return "sans";
  if (/serif/.test(notes)) return "editorial";
  return fallback;
}

export function requestedDesignFamily(intake) {
  const notes = [
    intake.stylePreference,
    intake.brandNotes,
    intake.websiteGoals,
    intake.additionalNotes,
  ]
    .map((value) => text(value, 1200))
    .join(" ")
    .toLowerCase();
  if (
    /masked cards?|shared image|image mosaic|mosaic|clinical portal/.test(notes)
  )
    return "image-mosaic";
  if (/liquid glass|glassmorphism|atmospheric|cinematic editorial/.test(notes))
    return "atmospheric-editorial";
  if (
    /cinematic|full-screen video|fullscreen video|luxury|premium jet/.test(
      notes,
    )
  )
    return "cinematic-premium";
  if (
    /project[- ]led|portfolio|case studies|project showcase|before and after/.test(
      notes,
    )
  )
    return "project-showcase";
  if (/minimal|restrained|narrow column|clean white|studio minimal/.test(notes))
    return "studio-minimal";
  return undefined;
}

function designFor(kind, industry, intake = {}) {
  const recipe =
    kind === "home-care" || (industry === "wellness" && kind !== "fitness")
      ? "care-editorial"
      : industry === "home-services"
        ? "local-trades"
        : "general-editorial";
  const seed = [
    process.env.LAUNCHLOOM_INTAKE_ID || intake.submissionId || "intake",
    intake.businessName || "business",
    intake.stylePreference || "",
    intake.primaryColor || "",
  ].join("|");
  const selected = selectDesignVariant(
    recipe,
    seed,
    requestedDesignFamily(intake),
  );
  const availablePacks = listExperiencePacks();
  const requestedPack = text(intake.experiencePackId, 80) || undefined;
  const avoidPackIds = avoidPackIdsFromNotes(intake.brandNotes);
  const experiencePackId = selectExperiencePackId({
    recipe,
    seed,
    requested: requestedPack,
    recentFingerprints: recentFingerprintsForSelection(),
    hasImage: Boolean(intake.heroImage || intake.photoOne || intake.photoTwo || intake.logo),
    avoidPackIds,
  });
  const typography = requestedTypography(intake, selected.typography);
  const experienceVariantId = selectExperienceVariantId({
    packId: experiencePackId,
    typography,
  });
  return {
    recipe,
    variantId: selected.id,
    sections: selected.sections
      .filter(({ type }) => type !== "social-proof")
      .map((section) => ({ ...section })),
    treatment: {
      density: selected.density,
      typography,
    },
    experience: {
      packId: experiencePackId,
      variantId: experienceVariantId,
      blueprintVersion: 2,
      candidatePackIds: availablePacks.map((pack) => pack.packId),
      ...(avoidPackIds.length ? { avoidPackIds } : {}),
      selectionMode: requestedPack ? "requested" : "internal-bakeoff",
      fingerprint: availablePacks
        .find((pack) => pack.packId === experiencePackId)
        ?.variants.find((variant) => variant.id === experienceVariantId)
        ?.fingerprint,
    },
  };
}

function layoutFor(industry) {
  if (industry === "home-services") return "local-proof";
  if (industry === "technology") return "product-clarity";
  return "editorial-authority";
}

function qualificationFor(industry, kind = industry, services = []) {
  if (kind === "home-care")
    return [
      {
        name: "careNeed",
        label: "What kind of support are you exploring?",
        placeholder: "Select an option",
        options: [
          "Personal care",
          "Companionship",
          "Respite for family",
          "Not sure yet",
        ],
      },
      {
        name: "timing",
        label: "When might support be needed?",
        placeholder: "Select timing",
        options: [
          "As soon as possible",
          "Within a few weeks",
          "Planning ahead",
        ],
      },
    ];
  if (industry === "home-services")
    return [
      {
        name: "service",
        label: "What do you need help with?",
        placeholder: "Select a service",
        options: ["Repair", "Installation", "Maintenance", "Not sure yet"],
      },
      {
        name: "timing",
        label: "When do you need help?",
        placeholder: "Select timing",
        options: ["As soon as possible", "This week", "Planning ahead"],
      },
    ];
  if (industry === "wellness")
    return [
      {
        name: "interest",
        label: "What are you interested in?",
        placeholder: "Select an option",
        options: [
          "A consultation",
          "A specific treatment",
          "Advice on options",
          "Not sure yet",
        ],
      },
      {
        name: "timing",
        label: "When would you like to come in?",
        placeholder: "Select timing",
        options: ["This week", "Next week", "Just exploring"],
      },
    ];
  const serviceOptions = [
    ...new Set(
      services
        .map((service) => text(service?.name || service, 100))
        .filter(Boolean),
    ),
  ].slice(0, 3);
  return [
    {
      name: "interest",
      label: "What would you like to discuss?",
      placeholder: "Select an option",
      options: serviceOptions.length
        ? [...serviceOptions, "Not sure yet"]
        : ["A consultation", "General questions", "Not sure yet"],
    },
  ];
}

function conversionFeaturesFor({
  industry,
  businessKind,
  business,
  qualification,
  faqs,
  aiChatEnabled,
}) {
  const guidedHeading =
    businessKind === "home-care" || industry === "wellness"
      ? "A few quick questions"
      : industry === "home-services"
        ? "Tell us what needs attention"
        : "Find the right next step";
  const guidedIntro =
    industry === "home-services"
      ? "Choose the closest options so the team can understand your request before following up."
      : "Choose the closest options so the first conversation can focus on what matters to you.";
  return {
    guidedQualifier: {
      enabled: qualification.length > 0,
      heading: guidedHeading,
      intro: guidedIntro,
    },
    quickAnswers: {
      enabled: faqs.length > 0,
      label: "Quick answers",
      greeting: `Welcome to ${business.name}. How can we help?`,
      items: faqs.slice(0, 5),
      ctaLabel: business.primaryCta,
      ctaTarget: primaryCtaTarget(business),
    },
    aiChat: {
      enabled: Boolean(aiChatEnabled),
      label: "Got questions?",
      greeting: `Ask about ${business.name} services, coverage, or the next step.`,
      disclaimer:
        "AI-generated answers use this website's verified information and may be incomplete.",
      apiUrl: "",
      token: "",
    },
    exitOffer: {
      enabled: Boolean(business.offer),
      eyebrow: "Before you go",
      heading: business.offer || business.primaryCta,
      body: "Share what you need and the team will follow up with a useful next step.",
      ctaLabel: business.primaryCta,
      ctaTarget: primaryCtaTarget(business),
    },
  };
}

function defaultCopy(business, industry, kind = industry) {
  if (kind === "home-care")
    return {
      heroKicker: "Care that starts with listening",
      heroHeading: business.tagline || "Care that makes room for you",
      heroBody:
        business.description ||
        "Start with a conversation about the support that would help most.",
      servicesHeading: "Support for the routines that matter at home.",
      servicesIntro:
        "Explore the available care options, then choose the most useful place to begin.",
      aboutKicker: "A thoughtful approach",
      aboutHeading: "Begin with the person, the family, and the day ahead.",
      aboutBody:
        "Talk through current routines, practical concerns, and the support being considered before deciding on a next step.",
      contactKicker: "Start the conversation",
      contactHeading: contactHeadingFor(business, "Talk with the care team"),
      processKicker: "Starting care",
      processHeading: "A calm path from first call to a practical plan.",
      faqKicker: "Questions from families",
      faqHeading: "Useful details to discuss before care begins.",
      formIntro:
        "Share only what you are comfortable sharing. The team will follow up to discuss next steps.",
    };
  if (kind === "garage-door")
    return {
      heroKicker: "Local garage door service",
      heroHeading: business.tagline || "Get your door moving safely again",
      heroBody:
        business.description ||
        "Describe the problem and location so the team can confirm the right next step.",
      servicesHeading: "Start with the symptom. Find the service that fits.",
      servicesIntro:
        "Choose the problem you are seeing to understand the most practical next step.",
      aboutKicker: "A clearer service call",
      aboutHeading: "Describe the issue before scheduling the next step.",
      aboutBody:
        "Share what the door is doing and the property address so the team can confirm coverage and the appropriate service.",
      contactKicker: "Tell us what the door is doing",
      contactHeading: contactHeadingFor(
        business,
        "Request garage door service",
      ),
      processKicker: "What happens next",
      processHeading: "A direct route from a door problem to a clear plan.",
      faqKicker: "Practical answers",
      faqHeading: "What to know before requesting service.",
      formIntro:
        "Include the service address and a short description of the issue so the team can confirm coverage.",
    };
  const subject =
    industry === "technology"
      ? "technology"
      : industry === "professional-services"
        ? "advice"
        : "service";
  return {
    heroKicker: "Built around your next step",
    heroHeading: business.tagline || "A clearer way to move forward",
    heroBody:
      business.description ||
      "Explore what is available and choose the next step that fits.",
    servicesHeading: `Practical ${subject}, shaped around what you need.`,
    servicesIntro:
      "Explore what is available, then choose the option that best fits your needs.",
    aboutKicker: "Why people choose us",
    aboutHeading: `A clearer, more personal way to move forward.`,
    aboutBody:
      "Share the goal, constraints, and questions behind your decision so the team can recommend a useful next step.",
    contactKicker: "Start the conversation",
    contactHeading: contactHeadingFor(business, "Talk with our team"),
    processKicker: "A clear process",
    processHeading: "Know what happens next.",
    faqKicker: "Questions, answered",
    faqHeading: "A few useful details before you reach out.",
    formIntro: "A few quick details help us point you in the right direction.",
  };
}

function defaultFaq(industry, cta, kind = industry) {
  const action = cta || "get in touch";
  if (kind === "home-care")
    return [
      {
        question: "How do we know which type of support to request?",
        answer:
          "Describe the routines that are difficult now. The team can explain which available services may fit before a plan is proposed.",
      },
      {
        question: "What should we prepare for the first conversation?",
        answer:
          "A short list of daily routines, current concerns, preferred timing, and the people involved in decisions is a useful place to start.",
      },
    ];
  if (industry === "home-services")
    return [
      {
        question: "How quickly can you help?",
        answer:
          "Tell us what is happening and your timing. We will confirm the next available step directly.",
      },
      {
        question: "Can I request help for my area?",
        answer:
          "Send your address and service needs and we will confirm coverage before scheduling.",
      },
    ];
  return [
    {
      question: "What happens after I reach out?",
      answer: `Share a few details and our team will follow up with the most useful next step.`,
    },
    {
      question: "Is there any obligation?",
      answer: `No pressure. ${action} to discuss your needs and decide whether we are a fit.`,
    },
  ];
}

const GENERIC_COPY =
  /tailored to your needs|talk through your needs|personalized support|quality you can trust|when it matters|next level|we are here for you|your trusted partner|one[- ]stop/i;

export function evaluateDraft(config) {
  const issues = [];
  const businessName = text(config.business?.name, 100);
  const services = Array.isArray(config.services) ? config.services : [];
  const process = config.conversion?.process || [];
  const faqs = config.conversion?.faqs || [];
  const copy = config.copy || {};

  if (!businessName || /^your business$/i.test(businessName))
    issues.push(
      "The verified business name is missing or looks like a placeholder.",
    );
  if (!services.length)
    issues.push("There is no clear service offer on the site.");
  if (
    services.some(
      (service) =>
        text(service.name, 80).length < 3 ||
        text(service.description, 200).length < 45 ||
        GENERIC_COPY.test(String(service.description || "")),
    )
  )
    issues.push(
      "At least one service card lacks a specific, customer-useful outcome.",
    );
  if (
    text(copy.heroKicker, 160).length < 8 ||
    text(copy.servicesHeading, 160).length < 12
  )
    issues.push(
      "The opening message lacks a clear, specific value proposition.",
    );
  if (
    GENERIC_COPY.test(
      `${copy.heroKicker || ""} ${copy.servicesHeading || ""} ${copy.aboutHeading || ""}`,
    )
  )
    issues.push("The primary headings use generic marketing language.");
  if (
    wordCount(copy.heroHeading || config.business?.tagline) > 10 ||
    text(copy.heroHeading || config.business?.tagline, 200).length > 72 ||
    wordCount(copy.heroBody || config.business?.description) > 28 ||
    services.some(
      (service) =>
        wordCount(service.description) > 20 ||
        text(service.description, 200).length > 125,
    )
  )
    issues.push(
      "The opening or service cards are too verbose to scan quickly.",
    );
  if (text(config.business?.primaryCta, 80).length < 4)
    issues.push("The primary conversion action is unclear.");
  if (process.length < 2 || process.some((step) => text(step, 120).length < 10))
    issues.push("The visitor journey needs at least two clear next steps.");
  if (
    faqs.length < 2 ||
    faqs.some(
      (faq) =>
        text(faq.question, 160).length < 8 || text(faq.answer, 360).length < 40,
    )
  )
    issues.push("The FAQ section lacks enough useful decision support.");
  if (
    config.images?.hero &&
    !config.assets?.photoOne &&
    !Object.values(STOCK_PACKS)
      .flatMap(Object.values)
      .includes(config.images.hero)
  )
    issues.push(
      "The hero image is not from an approved contextual asset pack.",
    );

  return { score: Math.max(0, 100 - issues.length * 12), issues };
}

function fallback(intake) {
  const preset =
    intake.preset === "home-services" ? "home-services" : "wellness";
  const industry = industryFor(intake);
  const businessKind = businessKindFor(intake, industry);
  const areas = lines(intake.serviceAreas);
  const services = lines(intake.services)
    .slice(0, 8)
    .map((name) => ({
      name,
      slug: slugify(name),
      description: usefulServiceDescription("", name),
      decisionSupport: decisionSupportFor(businessKind, name),
    }));
  const businessName = intake.businessName || "Your business";
  const primaryColor = safeHex(
    intake.primaryColor,
    preset === "wellness" ? "#205d51" : "#bd552d",
  );
  const stylePreference = text(intake.stylePreference, 80);
  const visualDirection = text(intake.imageDirection, 600);
  const suppressUnverifiedLocation = hasConflictingUnverifiedAddress(intake);
  return {
    preset,
    business: {
      name: businessName,
      tagline:
        preset === "wellness"
          ? "Care that makes room for you."
          : "Reliable help, right when you need it.",
      description:
        intake.differentiators ||
        `${businessName} offers thoughtful, local service.`,
      phone: intake.phone || "",
      email: intake.email || "",
      address: suppressUnverifiedLocation ? "" : intake.address || "",
      serviceAreas: areas,
      hours: "Hours available on request",
      primaryCta: suppressUnverifiedLocation
        ? "Contact us"
        : intake.primaryCta ||
          (preset === "wellness" ? "Book a consultation" : "Request service"),
      offer: intake.offer || "",
      domain: intake.domain || "",
      leadEmail: intake.leadEmail || intake.email || "",
      placeId: intake.placeId || "",
      googleMapsUrl: suppressUnverifiedLocation
        ? ""
        : intake.googleMapsUrl || "",
    },
    style: {
      ...paletteHintsFromIntake(intake, primaryColor),
      tone: intake.tone || "confident",
      ...(stylePreference ? { preference: stylePreference } : {}),
      ...(visualDirection ? { visualDirection } : {}),
    },
    services: services.length
      ? services
      : [
          {
            name: "Our services",
            slug: "services",
            description: "Personalized support from a local team.",
            decisionSupport: decisionSupportFor(businessKind, "our services"),
          },
        ],
    differentiators: proofStatements(intake.differentiators).slice(0, 4),
    locations:
      industry === "home-services"
        ? areas.map((name) => ({ name, slug: slugify(name) }))
        : [],
    industry,
    businessKind,
    images: stockImages(businessKind),
    copy: defaultCopy(
      { primaryCta: intake.primaryCta },
      industry,
      businessKind,
    ),
    conversion: {
      layout: layoutFor(industry),
      qualification: qualificationFor(industry, businessKind, services),
      process: [
        "Tell us what you need",
        "Get clear next steps",
        "Move forward with confidence",
      ],
      faqs: defaultFaq(industry, intake.primaryCta, businessKind),
    },
    design: designFor(businessKind, industry, intake),
    assetReport: {
      used: stockAssetReport(businessKind, stockImages(businessKind)),
      skipped: [],
    },
  };
}

export function normalise(candidate, intake) {
  const base = fallback(intake);
  const clientSource = Object.values(intake || {})
    .filter((value) => typeof value === "string")
    .join(" ");
  const clientLanguageFallback = text(
    intake.differentiators || intake.services || intake.businessName,
    180,
  );
  const value = candidate && typeof candidate === "object" ? candidate : {};
  const preset =
    value.preset === "home-services" ? "home-services" : base.preset;
  const submittedServiceNames = lines(intake.services);
  const proposedServices = Array.isArray(value.services) ? value.services : [];
  const proposedServiceBySlug = new Map(
    proposedServices
      .filter((service) => service && typeof service === "object")
      .map((service) => [
        slugify(String(service.slug || service.name || "")),
        service,
      ])
      .filter(([slug]) => slug !== "client-site"),
  );
  const proposedServiceFor = (name) => {
    const exact = proposedServiceBySlug.get(slugify(name));
    if (exact) return exact;
    const ranked = proposedServices
      .filter((service) => service && typeof service === "object")
      .map((service) => ({
        service,
        score: serviceMatchScore(name, service.name),
      }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 0.65 ? ranked[0].service : undefined;
  };
  // The model can improve descriptions, but it cannot rename, replace, or
  // invent the services the client says it sells.
  const serviceInput = submittedServiceNames.length
    ? submittedServiceNames.map((name) => ({
        name,
        slug: slugify(name),
        description: proposedServiceFor(name)?.description,
        decisionSupport: proposedServiceFor(name)?.decisionSupport,
      }))
    : Array.isArray(value.services)
      ? value.services
      : base.services;
  const services = serviceInput.slice(0, 8).map((service, index) => {
    const name = String(
      service.name || base.services[index]?.name || "Our service",
    ).slice(0, 120);
    const proposedSupport =
      service.decisionSupport && typeof service.decisionSupport === "object"
        ? service.decisionSupport
        : {};
    const fallbackSupport = decisionSupportFor(base.businessKind, name);
    return {
      name,
      description: safeGeneratedText(
        usefulServiceDescription(
          service.description || base.services[index]?.description,
          name,
        ),
        usefulServiceDescription(base.services[index]?.description, name),
        clientSource,
        180,
        clientLanguageFallback,
      ),
      slug: slugify(service.slug || service.name || `service-${index + 1}`),
      decisionSupport: {
        scope: safeGeneratedText(
          proposedSupport.scope || fallbackSupport.scope,
          fallbackSupport.scope,
          clientSource,
          260,
          clientLanguageFallback,
        ),
        nextStep: safeGeneratedText(
          proposedSupport.nextStep || fallbackSupport.nextStep,
          fallbackSupport.nextStep,
          clientSource,
          260,
          clientLanguageFallback,
        ),
        preparation: safeGeneratedText(
          proposedSupport.preparation || fallbackSupport.preparation,
          fallbackSupport.preparation,
          clientSource,
          260,
          clientLanguageFallback,
        ),
      },
    };
  });
  // Only model-authored marketing copy may change. Contact details, offers,
  // places, and services remain verified client data.
  const proposedBusiness =
    value.business && typeof value.business === "object" ? value.business : {};
  const business = {
    ...base.business,
    tagline: conciseHeadline(
      safeGeneratedText(
        proposedBusiness.tagline || base.business.tagline,
        base.business.tagline,
        clientSource,
        180,
        clientLanguageFallback,
      ),
      base.business.tagline,
    ),
    description: safeGeneratedText(
      proposedBusiness.description || base.business.description,
      base.business.description,
      clientSource,
      520,
      clientLanguageFallback,
    ),
  };
  const rawProposedDifferentiators = Array.isArray(value.differentiators)
    ? value.differentiators
        .map((item) =>
          safeGeneratedText(
            item,
            "",
            clientSource,
            500,
            clientLanguageFallback,
          ),
        )
        .filter(Boolean)
    : [];
  const proposedDifferentiators = rawProposedDifferentiators
    .flatMap(proofStatements)
    .slice(0, 5);
  const proposedProofIsComplete = rawProposedDifferentiators.every((item) =>
    /[.!?]$/.test(item),
  );
  const different =
    proposedDifferentiators.length && proposedProofIsComplete
      ? proposedDifferentiators
      : base.differentiators;
  const assets =
    intake.assets && typeof intake.assets === "object"
      ? intake.assets
      : undefined;
  const images = { ...base.images };
  const assetReport = {
    used: stockAssetReport(base.businessKind, images),
    skipped: [],
  };
  if (typeof assets?.photoOne === "string") {
    images.hero = assets.photoOne;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "hero",
    );
    assetReport.used.push({
      asset: "photoOne",
      placement: "hero",
      source: "client",
    });
  }
  if (typeof assets?.photoTwo === "string") {
    images.secondary = assets.photoTwo;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "photoTwo",
      placement: "story",
      source: "client",
    });
  } else if (typeof assets?.photoThree === "string") {
    images.secondary = assets.photoThree;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "photoThree",
      placement: "story",
      source: "client",
    });
  } else if (typeof assets?.teamPhoto === "string") {
    images.secondary = assets.teamPhoto;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "teamPhoto",
      placement: "story",
      source: "client",
    });
  }
  if (typeof assets?.logo === "string")
    assetReport.used.push({
      asset: "logo",
      placement: "brand",
      source: "client",
    });
  const rawSuppliedCopy =
    value.copy && typeof value.copy === "object" ? value.copy : {};
  const defaultSiteCopy = defaultCopy(
    business,
    base.industry,
    base.businessKind,
  );
  const suppliedCopy = Object.fromEntries(
    Object.entries(rawSuppliedCopy).map(([key, candidateValue]) => [
      key,
      safeGeneratedText(
        candidateValue,
        defaultSiteCopy[key] || "",
        clientSource,
        180,
        clientLanguageFallback,
      ),
    ]),
  );
  const copy = Object.fromEntries(
    Object.entries(defaultSiteCopy).map(([key, fallbackValue]) => [
        key,
        safeGeneratedText(
          suppliedCopy[key] || fallbackValue,
          fallbackValue,
          clientSource,
          180,
          clientLanguageFallback,
        ),
      ]),
  );
  copy.heroHeading = conciseHeadline(
    suppliedCopy.heroHeading || copy.heroHeading || business.tagline,
    business.tagline,
  );
  copy.heroBody = conciseSentence(
    suppliedCopy.heroBody || copy.heroBody || business.description,
    business.description,
    170,
    28,
  );
  copy.servicesHeading = conciseHeadline(
    suppliedCopy.servicesHeading || copy.servicesHeading,
    copy.servicesHeading,
    76,
    10,
  );
  copy.servicesIntro = conciseSentence(
    suppliedCopy.servicesIntro || copy.servicesIntro,
    copy.servicesIntro,
    145,
    22,
  );
  copy.aboutBody = conciseSentence(
    suppliedCopy.aboutBody || copy.aboutBody || business.description,
    business.description,
    180,
    28,
  );
  if (
    isDirectionsCta(business) &&
    text(copy.contactHeading, 180).toLowerCase() === "get directions"
  )
    copy.contactHeading = contactHeadingFor(business, "Contact our team");
  const rawConversion =
    value.conversion && typeof value.conversion === "object"
      ? value.conversion
      : {};
  const proposedFaqs = Array.isArray(rawConversion.faqs)
    ? rawConversion.faqs
    : base.conversion.faqs;
  const proposedProcess = (
    Array.isArray(rawConversion.process)
      ? rawConversion.process
      : base.conversion.process
  )
    .map((step, index) =>
      safeGeneratedText(
        processStepText(step),
        base.conversion.process[index] || "Tell us what you need",
        clientSource,
        120,
        clientLanguageFallback,
      ),
    )
    .filter(Boolean)
    .slice(0, 4);
  const validatedFaqs = proposedFaqs
    .map((faq, index) => ({
      question: safeGeneratedText(
        faq?.question,
        base.conversion.faqs[index]?.question || "What happens next?",
        clientSource,
        160,
        clientLanguageFallback,
      ),
      answer: safeGeneratedText(
        faq?.answer,
        base.conversion.faqs[index]?.answer ||
          "Contact the team to discuss the most useful next step.",
        clientSource,
        360,
        clientLanguageFallback,
      ),
    }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 5);
  const qualification = base.conversion.qualification;
  const featureConfig = conversionFeaturesFor({
    industry: base.industry,
    businessKind: base.businessKind,
    business,
    qualification,
    faqs: validatedFaqs.length ? validatedFaqs : base.conversion.faqs,
    aiChatEnabled:
      String(intake.conversionAiChat || "").toLowerCase() === "yes",
  });
  const conversion = {
    layout: layoutFor(base.industry),
    qualification,
    process: proposedProcess.length ? proposedProcess : base.conversion.process,
    faqs: validatedFaqs.length ? validatedFaqs : base.conversion.faqs,
    ...featureConfig,
  };
  const seoResearch = seoResearchForConfig(intake.seoResearch);
  const selectedLocations = seoResearch?.mode === "researched"
    ? seoResearch.pageDecisions
        .filter((decision) => decision?.type === "location")
        .map((decision) => slugify(String(decision.title || "")))
    : [];
  const researchedLocations = selectedLocations.length
    ? new Set(selectedLocations)
    : null;
  const locationNames = researchedLocations
    ? business.serviceAreas.filter((name) =>
        researchedLocations.has(slugify(name)),
      )
    : business.serviceAreas;
  return removeEmDashes({
    preset,
    industry: base.industry,
    businessKind: base.businessKind,
    business,
    style: {
      ...resolvePalette({ ...(value.style || {}), ...base.style }),
      tone: base.style.tone,
      ...(base.style.preference ? { preference: base.style.preference } : {}),
      ...(base.style.visualDirection
        ? { visualDirection: base.style.visualDirection }
        : {}),
    },
    services: services.length ? services : base.services,
    differentiators: different.length ? different : base.differentiators,
    locations:
      base.industry === "home-services"
        ? locationNames.map((name, index) => {
            const proposed = Array.isArray(value.locations)
              ? value.locations.find(
                  (location) => slugify(location?.name || "") === slugify(name),
                ) || value.locations[index]
              : undefined;
            return {
              name,
              slug: slugify(name),
              description: safeGeneratedText(
                proposed?.description ||
                  `${business.name} accepts service requests from ${name} and confirms availability by address.`,
                `${business.name} accepts service requests from ${name} and confirms availability by address.`,
                clientSource,
                320,
                clientLanguageFallback,
              ),
              localNote: safeGeneratedText(
                proposed?.localNote ||
                  `Share the ${name} service address and the issue you are seeing so the team can confirm coverage and the next available step.`,
                `Share the ${name} service address and the issue you are seeing so the team can confirm coverage and the next available step.`,
                clientSource,
                320,
                clientLanguageFallback,
              ),
            };
          })
        : [],
    images,
    copy,
    conversion,
    design: designFor(base.businessKind, base.industry, intake),
    assetReport,
    ...(seoResearch ? { seoResearch } : {}),
    ...(assets ? { assets } : {}),
    ...(intake.lead && typeof intake.lead === "object"
      ? { lead: intake.lead }
      : {}),
  });
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

async function askModel(intake, effort, model = MODEL) {
  const systemPrompt = `You are LaunchLoom's senior conversion copywriter and conversion strategist for local and service businesses. Return JSON only. Create specific, polished, plain-language website copy from verified facts. Use the same language and writing system as the client brief, and never insert untranslated foreign words. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION} Build a credible path from visitor problem to action with a differentiated promise, distinct service outcomes, concrete decision support, concise process steps, and useful FAQs. Improve clarity, hierarchy, and customer benefit without inventing licenses, medical claims, guarantees, pricing, credentials, testimonials, business hours, locations, deadlines, staff, or results. Never replace submitted contact facts. When an seoResearch dossier is present, use its validated queries, customer questions, vocabulary, and page decisions as strategy context. Never present search metrics or SERP language as a business fact, and never include anything listed under prohibitedClaims. When the primary action is Get directions, preserve that action exactly; the template will add a verified map when an exact location exists, and contactHeading should invite contact rather than repeat Get directions. When the brief includes feedback, treat it as the primary revision request: address it directly and preserve unrelated approved copy and positioning. Avoid generic filler such as 'tailored to your needs', 'when it matters', 'work that lasts', 'next level', 'quality you can trust', or 'we are here for you'. Make every service description distinct and concrete. Only use proof claims supplied in the brief. Do not return HTML or frontend code.`;
  const identity = {
    businessName: intake.businessName || intake.business?.name || "",
    email: intake.email || intake.business?.email || "",
    phone: intake.phone || intake.business?.phone || "",
    domain:
      intake.desiredDomain ||
      intake.domain ||
      intake.business?.domain ||
      "",
  };
  const sessionId = openRouterSessionId("site-copy", model, identity);
  const promptCacheKey = openRouterPromptCacheKey(
    "site-copy-system",
    model,
    systemPrompt,
  );
  const response = await openRouterChatCompletion({
    title: "LaunchLoom",
    sessionId,
    body: {
      model,
      ...promptCacheRequestFields(model, promptCacheKey),
      reasoning_effort: effort,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: promptCachedMessageContent(model, systemPrompt),
        },
        {
          role: "user",
          content: `Transform this verified client brief into JSON with keys preset, business, style, services, differentiators, locations, copy, conversion. business must include name, tagline, description, phone, email, address, serviceAreas, hours, primaryCta, offer, domain, leadEmail. services is an array of {name, description, slug, decisionSupport:{scope,nextStep,preparation}}. Keep every submitted service name exactly as provided. Each service description is one concrete sentence under 22 words. Each decisionSupport field must answer a different practical buying question using only supported facts and cautious next-step language. locations is an array of {name, description, localNote}; include only submitted service areas, distinguish serving an area from having a physical office there, and avoid interchangeable city-swap copy. copy must include heroKicker, heroHeading, heroBody, servicesHeading, servicesIntro, aboutKicker, aboutHeading, aboutBody, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. heroHeading is a catchy 4-10 word customer promise, not a service inventory. heroBody is one sentence under 28 words. servicesHeading is a short, memorable section promise and servicesIntro is one sentence. aboutBody adds useful context instead of repeating the hero description or proof points. conversion must include process (2-4 concise steps) and faqs (2-5 {question, answer} objects). The tagline is a concise, differentiated promise; description is a 2-3 sentence customer-facing introduction. Treat submitted business facts as authoritative.\n\n${JSON.stringify(intake)}`,
        },
      ],
    },
  });
  if (!response.ok)
    throw new Error(
      `OpenRouter returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const result = await response.json();
  logOpenRouterCacheUsage("site-copy", result.usage);
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return parseModelJson(content);
}

async function refineDraft(intake, draft, report, model = MODEL) {
  const systemPrompt = `You are the final creative director for a conversion-focused local-business website. Return JSON only, using the exact site-config shape provided. Use the same language and writing system as the client brief, and never insert untranslated foreign words. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION} Fix only the listed quality issues. Preserve the selected design recipe, every verified business fact, service name, address, contact detail, offer, brand asset, and unrelated approved positioning. Improve specificity, hierarchy, decision support, and calls to action without inventing proof, pricing, credentials, outcomes, locations, staff, or claims. Do not return HTML, CSS, code, explanations, or markdown.`;
  const identity = {
    businessName: intake.businessName || intake.business?.name || "",
    email: intake.email || intake.business?.email || "",
    phone: intake.phone || intake.business?.phone || "",
    domain:
      intake.desiredDomain ||
      intake.domain ||
      intake.business?.domain ||
      "",
  };
  const sessionId = openRouterSessionId("site-copy", model, identity);
  const promptCacheKey = openRouterPromptCacheKey(
    "site-refine-system",
    model,
    systemPrompt,
  );
  const response = await openRouterChatCompletion({
    title: "LaunchLoom quality refinement",
    sessionId,
    body: {
      model,
      ...promptCacheRequestFields(model, promptCacheKey),
      reasoning_effort: "medium",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: promptCachedMessageContent(model, systemPrompt),
        },
        {
          role: "user",
          content: `Verified intake facts:\n${JSON.stringify(intake)}\n\nCurrent draft:\n${JSON.stringify(draft)}\n\nQuality issues to fix:\n${report.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}`,
        },
      ],
    },
  });
  if (!response.ok)
    throw new Error(
      `OpenRouter refinement returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const result = await response.json();
  logOpenRouterCacheUsage("site-refinement", result.usage);
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter refinement returned no content.");
  return parseModelJson(content);
}

export async function generateSiteConfigWithModel(intake, model = MODEL) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required to generate client copy.");
  const groundedIntake = prepareGenerationIntake(intake);
  let draft;
  try {
    draft = normalise(
      await askModel(groundedIntake, "medium", model),
      groundedIntake,
    );
  } catch (firstError) {
    console.warn(
      "Low-effort generation failed; retrying once with high effort.",
      firstError.message,
    );
    draft = normalise(
      await askModel(groundedIntake, "high", model),
      groundedIntake,
    );
  }
  const initialReport = evaluateDraft(draft);
  if (!initialReport.issues.length)
    return {
      ...draft,
      qualityReport: { ...initialReport, refined: false },
    };

  try {
    const refined = normalise(
      await refineDraft(groundedIntake, draft, initialReport, model),
      groundedIntake,
    );
    const finalReport = evaluateDraft(refined);
    const selected = finalReport.score >= initialReport.score ? refined : draft;
    return {
      ...selected,
      qualityReport: {
        ...(selected === refined ? finalReport : initialReport),
        refined: selected === refined,
      },
    };
  } catch (error) {
    console.warn(
      "Quality refinement failed; keeping validated initial draft.",
      error instanceof Error ? error.message : error,
    );
    return { ...draft, qualityReport: { ...initialReport, refined: false } };
  }
}

export const generateSiteConfig = (intake) =>
  generateSiteConfigWithModel(intake);

function extractIntake(body) {
  const match = body.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const source = argumentValue(process.argv, "--source");
  const destination = argumentValue(process.argv, "--out");
  const researchFile = argumentValue(process.argv, "--research");
  if (!source || !destination)
    throw new Error(
      "Usage: node generate-site-config.mjs --source intake.md --out site.config.json",
    );
  const intake = extractIntake(await fs.readFile(source, "utf8"));
  if (researchFile)
    intake.seoResearch = JSON.parse(await fs.readFile(researchFile, "utf8"));
  await fs.writeFile(
    destination,
    `${JSON.stringify(await generateSiteConfig(intake), null, 2)}\n`,
  );
}
