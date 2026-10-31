import {
  compilePageBriefs,
  pageBriefReadiness,
} from "../templates/client-site/src/lib/page-briefs.mjs";
import { compileRouteInventory } from "../templates/client-site/src/lib/route-inventory.mjs";
import {
  publicGenerationIntake,
  redactPrivateLocation,
} from "../templates/client-site/src/lib/business-facts.mjs";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { parseModelJson } from "./model-json.mjs";
import {
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedMessageContent,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";
import {
  completeGeneration,
  parseGenerationOutput,
} from "./generation-inference.mjs";
import {
  buildSiteCopyResponsesRequest,
  opencodeGoResponsesProfile,
  opencodeGoUsageMetrics,
} from "./opencode-go.mjs";
import { resolvePalette } from "./palette-policy.mjs";
import { fontFamilyById } from "./font-catalog.mjs";
import { fictionalPipelineDemoNotice } from "./synthetic-demo-notice.mjs";
import {
  defaultHistoryPath,
  launchesForBusinessKind,
  recentLayoutFingerprints,
} from "./launch-history.mjs";
import { selectDesignVariant } from "../templates/client-site/src/lib/design-variants.ts";
import {
  avoidPackIdsFromNotes,
  listExperiencePacks,
  selectExperiencePackId,
  selectExperienceVariantId,
} from "../templates/client-site/src/lib/experience-pack.ts";
import { findUnsupportedBusinessClaimLocations } from "./business-copy-claims.mjs";

// Bounded per-process usage evidence so the generation workflow can report
// provider cost without parsing runner logs. Never changes the generated
// config or its validation.
const modelUsageRecords = [];

function recordModelUsage(label, model, usage) {
  if (!usage || typeof usage !== "object") return;
  modelUsageRecords.push({ label, model, usage });
}

export function getSiteConfigUsageRecords() {
  return modelUsageRecords.slice();
}

function siteCopyProvider() {
  const provider = String(
    process.env.SITE_COPY_PROVIDER || "openrouter",
  ).trim();
  if (!["openrouter", "opencode-go"].includes(provider))
    throw new Error(`Unsupported SITE_COPY_PROVIDER: ${provider}`);
  return provider;
}

// OpenCode Go transport for the site-copy lane. The provider does not return a
// per-request cash cost, so the ledger records tokens/provenance plus cost
// computed from the published Go price table.
async function siteCopyOpencodeGoCompletion({
  label,
  effort,
  systemPrompt,
  userPrompt,
  sessionId,
  maxOutputTokens,
  model,
}) {
  const completion = await completeGeneration({
    inference: {
      profile: opencodeGoResponsesProfile({ logicalModel: model }),
      apiKey: process.env.OPENCODE_GO_API_KEY,
      request: buildSiteCopyResponsesRequest({
        systemPrompt,
        userPrompt,
        maxOutputTokens,
        effort,
        sessionId,
      }),
    },
  });
  const usage = completion?.result?.usage || null;
  const metrics = opencodeGoUsageMetrics(usage, { label, logger: console.log });
  // Persist the computed cash cost with the normalized usage so the shared
  // cost summary prices Go calls (the provider reports no per-request cost).
  recordModelUsage(
    label,
    model,
    usage
      ? {
          ...usage,
          provider: "opencode-go",
          cost: metrics.cost,
          costSource: metrics.costSource,
        }
      : null,
  );
  if (completion?.result?.status !== "completed") {
    const incompleteReason =
      completion?.result?.incomplete_details?.reason ||
      completion?.result?.incompleteDetails?.reason ||
      completion?.result?.error?.code ||
      "request failed";
    const error = new Error(
      `OpenCode Go ${label} ${completion?.result?.status || "error"}: ${incompleteReason}.`,
    );
    if (completion?.result?.status === "incomplete")
      error.code = "SITE_COPY_OUTPUT_TRUNCATED";
    throw error;
  }
  return parseGenerationOutput(completion);
}

const referenceCoverage = JSON.parse(
  readFileSync(
    new URL("../data/reference-library/core-collection.json", import.meta.url),
    "utf8",
  ),
);
const unsupportedBusinessKinds = new Set(
  (referenceCoverage.unsupportedBusinessKinds || []).flatMap((entry) =>
    (Array.isArray(entry.businessKinds) ? entry.businessKinds : []).map(
      (kind) =>
        String(kind)
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, "-")
          .replace(/^-|-$/gu, ""),
    ),
  ),
);

export { parseModelJson } from "./model-json.mjs";

function recentFingerprintsForSelection(businessKind) {
  try {
    const history = JSON.parse(readFileSync(defaultHistoryPath(), "utf8"));
    return recentLayoutFingerprints({
      launches: launchesForBusinessKind(history, businessKind),
    });
  } catch {
    return [];
  }
}

function siteCopyDefaultModel() {
  return siteCopyProvider() === "opencode-go"
    ? "opencode-go/deepseek-v4.1-flash"
    : "deepseek/deepseek-v4.1-flash";
}

const SITE_COPY_MAX_COMPLETION_TOKENS = 24_576;
const SITE_COPY_REFINEMENT_MAX_COMPLETION_TOKENS = 12_288;
const SITE_COPY_REFINEMENT_RETRY_MAX_COMPLETION_TOKENS = 24_576;
const MAX_CORE_SERVICES = 5;

const SHARED_CREATIVE_DIRECTION =
  "Build a specific local-business decision journey. Near the opening, make clear who the business helps, what it provides, where it operates when location matters, and the next action. The hero headline must be a memorable 4-10 word promise, not a list of services. The hero body must be one useful sentence under 28 words. Service-card descriptions must be one distinct sentence under 22 words. Give each section a distinct job; do not repeat one claim across the hero, proof, services, and About copy. Use one primary action and one useful secondary action. Prefer client assets. Mention no person in a stock image as an employee, customer, patient, or client. Treat an area served as coverage, not a physical office. Never write same-day, 24/7, emergency service or response, available today or now, or response-time promises unless the verified brief states that exact fact. Every sentence must be complete and self-contained; never end a sentence with a determiner, preposition, conjunction, or auxiliary such as a, the, and, so, to, be, can be, or will be. Do not use em dashes.";

const RECIPE_CREATIVE_DIRECTION =
  "For home care and care businesses, write for the person and family making a trust-sensitive decision: calm editorial language, routines and concerns, a clear first conversation, practical preparation, and reassurance without medical promises. Keep home care language distinct from treatment or aesthetics language. For local trades, use direct problem-led language: identify recognizable symptoms, coverage, what the customer should prepare, and the next service step. Do not promise price, arrival time, warranty, or availability unless supplied.";

function seoResearchForConfig(value) {
  if (!value || typeof value !== "object") return undefined;
  const sourceVersion = Number(value.version) || 1;
  const mode = ["researched", "context-only", "baseline"].includes(value.mode)
    ? value.mode
    : "baseline";
  const list = (items, limit = 12) =>
    (Array.isArray(items) ? items : []).slice(0, limit);
  return {
    version: sourceVersion,
    mode,
    languageCode: value.languageCode || "en",
    publishReady:
      mode === "researched" &&
      (value.publishReady === true || sourceVersion < 2),
    validatedQueries: list(
      value.validatedQueries,
      sourceVersion >= 2 ? 120 : 12,
    ).map((item) => ({
      ...item,
      keyword: item.keyword || item.query || "",
      query: item.query || item.keyword || "",
      volume: item.volume ?? item.searchVolume ?? null,
      searchVolume: item.searchVolume ?? item.volume ?? null,
      kd: item.kd ?? item.keywordDifficulty ?? null,
      cpc: item.cpc ?? null,
      competition: item.competition ?? null,
      intent: item.intent ?? null,
      provenance: item.provenance || "unavailable",
    })),
    customerQuestions: list(value.customerQuestions),
    copyVocabulary: list(value.copyVocabulary, 16),
    pageDecisions: list(value.pageDecisions),
    pageMap: list(value.pageMap, 80),
    fallbackSearch: value.fallbackSearch || {},
    externalSearchEvidence: list(value.externalSearchEvidence, 20),
    competitors: list(value.competitors, 6),
    questionEvidence: list(value.questionEvidence, 120),
    fanOutQuestionGroups: list(value.fanOutQuestionGroups, 80),
    blogOpportunities: list(value.blogOpportunities, 5),
    quickWins: list(value.quickWins, 10),
    marketSnapshot: value.marketSnapshot || {},
    completeness: value.completeness || {},
    coverageAreas: value.coverageAreas || [],
    coverageResearch: value.coverageResearch,
    coverageConfirmation: value.coverageConfirmation,
    prohibitedClaims: list(value.prohibitedClaims),
    evidence: list(value.evidence, sourceVersion >= 2 ? 80 : 6),
    cost: {
      tasks: Number(value.cost?.tasks) || 0,
      usd: Number(value.cost?.usd) || 0,
      limitUsd: Number(value.cost?.limitUsd) || 0.25,
      overBudget: value.cost?.overBudget === true,
      complete: value.cost?.complete !== false,
      unreportedTasks: Number(value.cost?.unreportedTasks) || 0,
    },
    warnings: list(value.warnings, 30),
  };
}

export function prepareGenerationIntake(intake = {}) {
  const projection = publicGenerationIntake(intake);
  return {
    ...projection,
    seoResearch: seoResearchForConfig(projection.seoResearch || {}),
  };
}

function compactStringList(value, limit = 12) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/u)
      : [];
  return items
    .map((item) => text(item, 240))
    .filter(Boolean)
    .slice(0, limit);
}

function copywriterPageContext(page) {
  if (!page || typeof page !== "object") return null;
  const primary = page.primaryKeyword;
  const primaryKeyword =
    typeof primary === "string"
      ? primary
      : text(primary?.keyword || primary?.query, 180);
  const result = {
    pageType: text(page.pageType, 40),
    ...(page.pageType === "service"
      ? { service: text(page.service || page.title, 120) }
      : {}),
    ...(page.pageType === "location"
      ? { location: text(page.location || page.title, 120) }
      : {}),
    ...(text(page.slug, 180) ? { slug: text(page.slug, 180) } : {}),
    ...(primaryKeyword
      ? {
          primaryKeyword: {
            keyword: primaryKeyword,
            ...(text(primary?.intent, 40)
              ? { intent: text(primary.intent, 40) }
              : {}),
          },
        }
      : {}),
    supportingKeywords: compactStringList(page.supportingKeywords, 6),
    fanOutQuestions: compactStringList(page.fanOutQuestions, 6),
  };
  return result.pageType ? result : null;
}

/**
 * Give copy models verified facts and useful search intent, not competitor
 * claims, raw search snippets, costs, or the complete evidence dossier.
 */
function copywriterContext(intake = {}) {
  const seo = intake.seoResearch || {};
  const pageMap = (Array.isArray(seo.pageMap) ? seo.pageMap : [])
    .filter((page) => ["service", "location"].includes(page?.pageType))
    .slice(0, MAX_CORE_SERVICES + 12)
    .map(copywriterPageContext)
    .filter(Boolean);
  const verifiedFacts = Object.fromEntries(
    Object.entries({
      hours: intake.hours,
      offer: intake.offer,
      pricing: intake.pricing || intake.priceRange,
      credentials: intake.credentials,
      guarantees: intake.guarantees || intake.warranties,
      availability: intake.availability,
      responseTime: intake.responseTime,
      results: intake.results,
      staff: intake.staff,
      yearsExperience: intake.yearsExperience,
      yearEstablished: intake.yearEstablished,
    }).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
  const routeFacts = (intake.routePolicy?.decisions || [])
    .slice(0, 24)
    .map((decision) => ({
      pageType: text(decision?.pageType, 40),
      target: text(decision?.target, 120),
      status: text(decision?.status, 40),
      localFacts: compactStringList(
        (Array.isArray(decision?.admission?.localFacts)
          ? decision.admission.localFacts
          : []
        ).map((fact) => fact?.value),
        6,
      ),
    }))
    .filter((decision) => decision.pageType && decision.target);
  const serviceNames = lines(intake.confirmedServices || intake.services).slice(
    0,
    MAX_CORE_SERVICES,
  );
  const customerQuestions = [
    ...compactStringList(seo.customerQuestions, 12),
    ...(Array.isArray(seo.questionEvidence) ? seo.questionEvidence : [])
      .map((item) => text(item?.question, 240))
      .filter(Boolean),
  ].slice(0, 24);

  return {
    businessName: text(intake.businessName || intake.business?.name, 120),
    businessKind: text(intake.businessKind || intake.business?.kind, 100),
    industry: text(intake.industry, 100),
    languageCode: text(
      intake.researchLanguageCode || seo.languageCode || "en",
      16,
    ),
    services: serviceNames,
    excludedServices: lines(intake.excludedServices).slice(
      0,
      MAX_CORE_SERVICES,
    ),
    primaryCity: text(intake.primaryCity, 120),
    serviceAreas: compactStringList(
      intake.serviceAreas || intake.coverageAreas,
      20,
    ),
    serviceRadius: intake.serviceRadius ?? null,
    primaryCta: text(intake.primaryCta, 100),
    differentiators: compactStringList(intake.differentiators, 12),
    faqNotes: text(intake.faqNotes, 1200),
    feedback: text(intake.feedback, 2400),
    brandNotes: text(intake.brandNotes, 2400),
    qualityConstraints: text(intake.qualityConstraints, 2400),
    addressVisibility: text(intake.addressVisibility, 32),
    verifiedFacts,
    prohibitedClaims: compactStringList(seo.prohibitedClaims, 24),
    routeFacts,
    seoResearch: {
      mode: text(seo.mode, 32) || "baseline",
      publishReady: seo.publishReady === true,
      pageMap,
      customerQuestions: [...new Set(customerQuestions)],
    },
  };
}

function copyRefinementDraft(draft = {}) {
  const textFields = (source) =>
    Object.fromEntries(
      Object.entries(source || {}).filter(
        ([, value]) => typeof value === "string",
      ),
    );
  return {
    narrative: draft.narrative,
    business: textFields({
      tagline: draft.business?.tagline,
      description: draft.business?.description,
    }),
    copy: textFields(draft.copy),
    services: (Array.isArray(draft.services) ? draft.services : []).map(
      (service) => ({
        name: text(service?.name, 120),
        ...textFields({
          description: service?.description,
          pageIntroduction: service?.pageIntroduction,
          pageMetaDescription: service?.pageMetaDescription,
        }),
        decisionSupport: textFields(service?.decisionSupport),
        pageSections: textFields(service?.pageSections),
        pageFaqs: (Array.isArray(service?.pageFaqs)
          ? service.pageFaqs
          : []
        ).map((faq) => ({
          question: text(faq?.question, 240),
          answer: text(faq?.answer, 800),
        })),
      }),
    ),
    locations: (Array.isArray(draft.locations) ? draft.locations : []).map(
      (location) => ({
        name: text(location?.name, 120),
        ...textFields({
          description: location?.description,
          localNote: location?.localNote,
          pageIntroduction: location?.pageIntroduction,
          pageMetaDescription: location?.pageMetaDescription,
          pageLocalContext: location?.pageLocalContext,
        }),
      }),
    ),
    differentiators: compactStringList(draft.differentiators, 12),
    conversion: {
      process: compactStringList(draft.conversion?.process, 6),
      faqs: (Array.isArray(draft.conversion?.faqs)
        ? draft.conversion.faqs
        : []
      ).map((faq) => ({
        question: text(faq?.question, 240),
        answer: text(faq?.answer, 800),
      })),
    },
  };
}

function mergeCopyFields(current = {}, patch = {}) {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch || {}))
    if (Object.hasOwn(current, key) && typeof value === "string")
      result[key] = value;
  return result;
}

function mergeFaqAnswers(current = [], patch = []) {
  if (!Array.isArray(current) || !Array.isArray(patch)) return current;
  return current.map((faq) => {
    const replacement = patch.find(
      (item) =>
        item?.question === faq?.question && typeof item.answer === "string",
    );
    return replacement ? { ...faq, answer: replacement.answer } : faq;
  });
}

const COPY_REFINEMENT_FIELDS = [
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
];

function servicePageFaqQuestionKey(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function mergeServicePageFaqs(current = [], patch = [], allowedQuestions = []) {
  if (!Array.isArray(patch)) return Array.isArray(current) ? current : [];
  const currentItems = Array.isArray(current) ? current : [];
  const allowed = new Map(
    allowedQuestions
      .filter((question) => typeof question === "string")
      .map((question) => [servicePageFaqQuestionKey(question), question])
      .filter(([key, question]) => key && question),
  );
  const currentByQuestion = new Map();
  for (const faq of currentItems) {
    const key = servicePageFaqQuestionKey(faq?.question);
    const canonicalQuestion = allowed.get(key);
    if (
      canonicalQuestion &&
      typeof faq?.answer === "string" &&
      !currentByQuestion.has(key)
    )
      currentByQuestion.set(key, {
        question: canonicalQuestion,
        answer: faq.answer,
      });
  }
  const patchByQuestion = new Map();
  for (const faq of patch) {
    const key = servicePageFaqQuestionKey(faq?.question);
    if (allowed.has(key) && typeof faq?.answer === "string")
      patchByQuestion.set(key, faq.answer);
  }
  return [...allowed.entries()]
    .map(([key, question]) => {
      const existing = currentByQuestion.get(key);
      const answer = patchByQuestion.has(key)
        ? patchByQuestion.get(key)
        : existing?.answer;
      return typeof answer === "string" ? { question, answer } : null;
    })
    .filter(Boolean);
}

function mergeCopyRefinementPatch(draft, patch, intake = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error(
      "OpenRouter copy refinement did not return a JSON copy patch.",
    );
  const merged = { ...draft };
  if (patch.narrative && typeof patch.narrative === "object")
    merged.narrative = patch.narrative;
  const currentBusinessCopy = {
    tagline: draft.business?.tagline,
    description: draft.business?.description,
  };
  merged.business = {
    ...draft.business,
    ...mergeCopyFields(currentBusinessCopy, patch.business),
  };
  const editableCopy = Object.fromEntries(
    COPY_REFINEMENT_FIELDS.map((field) => [field, draft.copy?.[field]]),
  );
  merged.copy = mergeCopyFields(editableCopy, patch.copy);
  const servicePatches = Array.isArray(patch.services) ? patch.services : [];
  const pageMap = Array.isArray(intake.seoResearch?.pageMap)
    ? intake.seoResearch.pageMap
    : [];
  merged.services = (Array.isArray(draft.services) ? draft.services : []).map(
    (service) => {
      const edit = servicePatches.find((item) => item?.name === service?.name);
      if (!edit) return service;
      const servicePage = pageMap.find(
        (page) =>
          page?.pageType === "service" &&
          servicePageFaqQuestionKey(page.service || page.title) ===
            servicePageFaqQuestionKey(service.name),
      );
      const serviceCopy = mergeCopyFields(
        {
          description: service.description,
          pageIntroduction: service.pageIntroduction,
          pageMetaDescription: service.pageMetaDescription,
        },
        edit,
      );
      return {
        ...service,
        ...serviceCopy,
        decisionSupport: mergeCopyFields(
          {
            scope: service.decisionSupport?.scope,
            nextStep: service.decisionSupport?.nextStep,
            preparation: service.decisionSupport?.preparation,
          },
          edit.decisionSupport,
        ),
        pageSections: mergeCopyFields(
          {
            scope: service.pageSections?.scope,
            preparation: service.pageSections?.preparation,
            nextStep: service.pageSections?.nextStep,
          },
          edit.pageSections,
        ),
        pageFaqs: mergeServicePageFaqs(
          service.pageFaqs,
          edit.pageFaqs,
          servicePage?.fanOutQuestions,
        ),
      };
    },
  );
  const locationPatches = Array.isArray(patch.locations) ? patch.locations : [];
  merged.locations = (
    Array.isArray(draft.locations) ? draft.locations : []
  ).map((location) => {
    const edit = locationPatches.find((item) => item?.name === location?.name);
    if (!edit) return location;
    return {
      ...location,
      ...mergeCopyFields(
        {
          description: location.description,
          localNote: location.localNote,
          pageIntroduction: location.pageIntroduction,
          pageMetaDescription: location.pageMetaDescription,
          pageLocalContext: location.pageLocalContext,
        },
        edit,
      ),
    };
  });
  if (
    Array.isArray(patch.differentiators) &&
    patch.differentiators.every((item) => typeof item === "string")
  )
    merged.differentiators = patch.differentiators;
  merged.conversion = {
    ...draft.conversion,
    ...(Array.isArray(patch.conversion?.process) &&
    patch.conversion.process.every((item) => typeof item === "string")
      ? { process: patch.conversion.process }
      : {}),
    faqs: mergeFaqAnswers(draft.conversion?.faqs, patch.conversion?.faqs),
  };
  return merged;
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
    metadata: {
      hero: {
        provider: "LaunchLoom",
        creator: "LaunchLoom",
        sourceUrl: "/images/packs/professional-services-advisory-v1.png",
        license: "LaunchLoom-owned generated fallback",
        subject:
          "illustrative professional consultation; pictured people are not client staff",
      },
    },
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

function normaliseBlogArticles(value) {
  if (!Array.isArray(value)) return [];
  const seenSlugs = new Set();
  return value.slice(0, 50).flatMap((article) => {
    if (!article || typeof article !== "object" || Array.isArray(article))
      return [];
    const slug = typeof article.slug === "string" ? article.slug.trim() : "";
    const title =
      typeof article.title === "string"
        ? article.title.replace(/\s+/gu, " ").trim()
        : "";
    const body =
      typeof article.body === "string"
        ? article.body.replace(/—/gu, "-").trim()
        : "";
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) ||
      slug.length > 90 ||
      !title ||
      !body ||
      seenSlugs.has(slug)
    )
      return [];
    seenSlugs.add(slug);
    const description =
      typeof article.description === "string"
        ? article.description
            .replace(/—/gu, "-")
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 320)
        : "";
    const dateValue =
      typeof article.publishedAt === "string" ? article.publishedAt.trim() : "";
    const publishedAt =
      /^\d{4}-\d{2}-\d{2}$/u.test(dateValue) &&
      !Number.isNaN(Date.parse(`${dateValue}T00:00:00Z`)) &&
      new Date(`${dateValue}T00:00:00Z`).toISOString().slice(0, 10) ===
        dateValue
        ? dateValue
        : "";
    return [
      {
        slug,
        title: title.slice(0, 180),
        description,
        publishedAt,
        body: body.slice(0, 30_000),
      },
    ];
  });
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
  if (Array.isArray(value))
    return value.flatMap((item) =>
      String(item || "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    );
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
      ["Han", "Hiragana", "Katakana"].some((system) => candidate.has(system)) &&
      [...candidate].every((system) => allowed.has(system))
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

const NARRATIVE_SECTION_KEYS = [
  "hero",
  "services",
  "process",
  "about",
  "faq",
  "contact",
];
const NARRATIVE_SECTION_SET = new Set(NARRATIVE_SECTION_KEYS);
const NARRATIVE_BANNED_CTA =
  /^(?:learn more|submit|click here|get started|read more|contact us|find out more|see more)$/iu;
const NARRATIVE_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "business",
  "but",
  "can",
  "could",
  "customer",
  "customers",
  "does",
  "each",
  "for",
  "from",
  "get",
  "gets",
  "had",
  "has",
  "have",
  "help",
  "helps",
  "how",
  "into",
  "its",
  "just",
  "like",
  "made",
  "make",
  "makes",
  "may",
  "more",
  "most",
  "much",
  "must",
  "need",
  "new",
  "not",
  "now",
  "one",
  "only",
  "other",
  "our",
  "out",
  "over",
  "same",
  "see",
  "service",
  "services",
  "set",
  "should",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "three",
  "through",
  "try",
  "two",
  "under",
  "until",
  "use",
  "using",
  "very",
  "visitor",
  "visitors",
  "want",
  "was",
  "way",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "work",
  "works",
  "would",
  "you",
  "your",
]);

function collectNarrativeSourceText(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string") return `${value} `;
  if (typeof value === "number" || typeof value === "boolean")
    return `${value} `;
  if (Array.isArray(value))
    return value
      .map((item) => collectNarrativeSourceText(item, depth + 1))
      .join(" ");
  if (typeof value === "object")
    return Object.values(value)
      .map((item) => collectNarrativeSourceText(item, depth + 1))
      .join(" ");
  return "";
}

function normaliseNarrativeMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function narrativeTokens(value) {
  return new Set(
    normaliseNarrativeMatch(value)
      .split(" ")
      .filter((token) => token.length >= 4 && !NARRATIVE_STOPWORDS.has(token)),
  );
}

function narrativeOverlap(left, right) {
  const leftTokens = narrativeTokens(left);
  const rightTokens = narrativeTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

/**
 * Normalise the strategy artifact the copy model writes before the page copy.
 * It is stored only in `qualityReport` and is never rendered as visitor copy.
 */
export function normaliseNarrativeSpine(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const objections = (Array.isArray(value.objections) ? value.objections : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const objection = text(item.objection, 220);
      const answer = text(item.answer, 360);
      if (!objection || !answer) return null;
      const requestedSection = String(item.section || "")
        .trim()
        .toLowerCase();
      const section = NARRATIVE_SECTION_SET.has(requestedSection)
        ? requestedSection
        : "faq";
      return { objection, answer, section };
    })
    .filter(Boolean)
    .slice(0, 3);
  const proof = (Array.isArray(value.proof) ? value.proof : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const claim = text(item.claim, 220);
      const evidence = text(item.evidence, 360);
      if (!claim || !evidence) return null;
      return { claim, evidence };
    })
    .filter(Boolean)
    .slice(0, 5);
  /** @type {Record<string, string>} */
  const sectionJobs = {};
  for (const key of NARRATIVE_SECTION_KEYS) {
    const job = text(value.sectionJobs?.[key], 200);
    if (job) sectionJobs[key] = job;
  }
  const pageArgument = compactStringList(value.pageArgument, 8)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const narrative = {
    audience: text(value.audience, 240),
    offer: text(value.offer, 240),
    primaryAction: text(value.primaryAction, 80),
    secondaryAction: text(value.secondaryAction, 80),
    objections,
    proof,
    sectionJobs,
    pageArgument,
  };
  const hasContent =
    narrative.audience ||
    narrative.offer ||
    narrative.primaryAction ||
    objections.length ||
    proof.length ||
    Object.keys(sectionJobs).length ||
    pageArgument.length;
  return hasContent ? narrative : null;
}

function copyCorpus(config = {}) {
  return collectNarrativeSourceText({
    tagline: config.business?.tagline,
    description: config.business?.description,
    copy: config.copy,
    services: (Array.isArray(config.services) ? config.services : []).map(
      (service) => ({
        name: service?.name,
        description: service?.description,
        decisionSupport: service?.decisionSupport,
      }),
    ),
    process: config.conversion?.process,
    faqs: config.conversion?.faqs,
    differentiators: config.differentiators,
  });
}

/**
 * Soft narrative audit. It reports strategy and consistency problems without
 * adding them to the hard copy issues until the calibration run proves the
 * checks do not reject otherwise good sites.
 */
export function evaluateNarrativeSpine(narrative, config = {}, intake = {}) {
  const issues = [];
  const warnings = [];
  if (!narrative)
    return {
      score: 0,
      issues: ["The narrative spine is missing."],
      warnings: [],
    };
  if (wordCount(narrative.audience) < 6)
    issues.push("The narrative audience is too vague.");
  if (wordCount(narrative.offer) < 4)
    issues.push("The narrative offer is too vague.");
  if (!narrative.primaryAction)
    issues.push("The narrative has no primary action.");
  else if (NARRATIVE_BANNED_CTA.test(narrative.primaryAction))
    issues.push(
      `The narrative primary action is too generic: "${narrative.primaryAction}".`,
    );
  const configCta = text(config.business?.primaryCta, 80);
  if (narrative.primaryAction && configCta) {
    const narrativeAction = normaliseNarrativeMatch(narrative.primaryAction);
    const siteAction = normaliseNarrativeMatch(configCta);
    if (
      !narrativeAction.includes(siteAction) &&
      !siteAction.includes(narrativeAction)
    )
      warnings.push(
        `The narrative primary action "${narrative.primaryAction}" does not match the site CTA "${configCta}".`,
      );
  }
  if (narrative.objections.length < 2)
    issues.push("The narrative needs at least two visitor objections.");
  for (const objection of narrative.objections) {
    if (wordCount(objection.answer) < 8)
      issues.push(
        `The objection answer is too thin: "${objection.objection}".`,
      );
  }
  const verifiedSource = normaliseNarrativeMatch(
    collectNarrativeSourceText(intake),
  );
  for (const item of narrative.proof) {
    const evidence = normaliseNarrativeMatch(item.evidence);
    if (!evidence || !verifiedSource.includes(evidence))
      issues.push(
        `The narrative proof is not present in the verified brief: "${item.claim}".`,
      );
  }
  for (const key of NARRATIVE_SECTION_KEYS) {
    if (!narrative.sectionJobs[key])
      issues.push(`The narrative is missing a job for the ${key} section.`);
  }
  const jobs = Object.values(narrative.sectionJobs);
  for (let left = 0; left < jobs.length; left += 1) {
    for (let right = left + 1; right < jobs.length; right += 1) {
      if (narrativeOverlap(jobs[left], jobs[right]) >= 0.8)
        issues.push(
          `The narrative section jobs repeat the same claim: "${jobs[left]}" and "${jobs[right]}".`,
        );
    }
  }
  if (narrative.pageArgument.length < 4)
    warnings.push("The narrative page argument has fewer than four steps.");
  const corpus = copyCorpus(config);
  for (const objection of narrative.objections) {
    if (narrativeOverlap(objection.answer, corpus) < 0.25)
      warnings.push(
        `The page may not answer this objection: "${objection.objection}".`,
      );
  }
  return {
    score: Math.max(0, 100 - issues.length * 15 - warnings.length * 5),
    issues,
    warnings,
  };
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
  const accent = text(intake.accentColor, 20);
  return resolvePalette({
    primaryColor,
    ...(background ? { surfaceColor: background } : {}),
    ...(ink ? { inkColor: ink } : {}),
    ...(/^#[0-9a-f]{6}$/i.test(accent) ? { accentColor: accent } : {}),
  });
}

/** Client font picks that resolve to known catalog families. */
function fontChoicesFromIntake(intake) {
  const headingFont = fontFamilyById(text(intake.headingFont, 60))?.id;
  const bodyFont = fontFamilyById(text(intake.bodyFont, 60))?.id;
  return {
    ...(headingFont ? { headingFont } : {}),
    ...(bodyFont ? { bodyFont } : {}),
  };
}

function usefulServiceDescription(value, serviceName) {
  const candidate = conciseSentence(value, "", 125, 20);
  const generic =
    /tailored to your needs|personalized support|quality you can trust|when it matters|next level/i;
  if (candidate.length >= 28 && !generic.test(candidate)) return candidate;
  return `Talk through your needs for ${serviceName} and leave with a clear next step.`;
}

function serviceDescriptionRestatesName(description, serviceName) {
  const normalizedDescription = normaliseNarrativeMatch(description);
  const normalizedName = normaliseNarrativeMatch(serviceName);
  if (!normalizedDescription || !normalizedName) return false;
  const nameTokens = new Set(
    normalizedName.split(" ").filter((token) => token.length >= 4),
  );
  if (!nameTokens.size) return false;
  const descriptionTokens = new Set(normalizedDescription.split(" "));
  const nameHits = [...nameTokens].filter((token) =>
    descriptionTokens.has(token),
  ).length;
  const opensWithRequest =
    /^(?:request|discuss|ask about|learn about|choose|book)\b/u.test(
      normalizedDescription,
    );
  const namesSymptom =
    /(?:slow|blocked|backed|leak|noise|noisy|cold|hot|weak|low|high|stuck|running|drip|clog|smell|discolored|warning|broken|uneven|damaged|worn|burst|flooding|freezing|appointment|estimate|inspection|prepare|preparation|symptom|fixture|when it began)/u.test(
      normalizedDescription,
    );
  return (
    opensWithRequest &&
    nameHits >= Math.min(2, nameTokens.size) &&
    !namesSymptom
  );
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

const BUSINESS_KIND_PROFILES = [
  {
    businessKind: "garage-door",
    industry: "home-services",
    aliases: ["garage-door", "garage-door-repair", "overhead-door"],
    facts: /\b(?:garage door|overhead door|door opener|torsion spring)\b/iu,
  },
  {
    businessKind: "auto-repair",
    industry: "home-services",
    aliases: [
      "auto-repair",
      "auto-repair-shop",
      "automotive-repair",
      "mechanic",
      "mechanic-shop",
    ],
    facts:
      /\b(?:auto repair|automotive repair|auto mechanic|mechanic shop|vehicle diagnostics|car repair|brake service|auto service)\b/iu,
  },
  {
    businessKind: "hvac",
    industry: "home-services",
    aliases: [
      "hvac",
      "hvac-contractor",
      "heating-and-cooling",
      "heating-cooling",
      "air-conditioning",
    ],
    facts:
      /\b(?:hvac|heating(?: and)? cooling|air conditioning|furnace|heat pump|ac repair)\b/iu,
  },
  {
    businessKind: "roofing",
    industry: "home-services",
    aliases: ["roofing", "roofer", "roofing-contractor"],
    facts: /\b(?:roofing|roofer|roof repair|roof replacement)\b/iu,
  },
  {
    businessKind: "painting",
    industry: "home-services",
    aliases: ["painting", "painter", "painting-contractor"],
    facts:
      /\b(?:painting contractor|painter|(?:interior|exterior|residential|commercial|house|home|cabinet|wall|fence|trim) painting)\b/iu,
  },
  {
    businessKind: "dental",
    industry: "wellness",
    aliases: ["dental", "dentist", "dentistry", "dental-clinic"],
    facts: /\b(?:dental|dentist|dentistry|oral health)\b/iu,
  },
  {
    businessKind: "home-care",
    industry: "wellness",
    aliases: [
      "home-care",
      "homecare",
      "home-care-provider",
      "senior-care",
      "elder-care",
    ],
    facts:
      /\b(?:home care|home health|caregiver|senior care|elder care|personal care|respite care)\b/iu,
  },
  {
    businessKind: "fitness",
    industry: "wellness",
    aliases: ["fitness", "gym", "fitness-studio", "personal-training"],
    facts:
      /\b(?:athletic club|fitness|gym|strength training|personal training|sports performance|pilates|yoga)\b/iu,
  },
  {
    businessKind: "restaurant",
    industry: "hospitality",
    aliases: ["restaurant", "cafe", "bakery", "catering", "fine-dining"],
    facts: /\b(?:restaurant|dining|cafe|bakery|catering|food service)\b/iu,
  },
  {
    businessKind: "hospitality",
    industry: "hospitality",
    aliases: [
      "hospitality",
      "hotel",
      "boutique-hotel",
      "resort",
      "lodging",
      "inn",
    ],
    facts: /\b(?:hotel|resort|guesthouse|lodging|boutique hotel|inn)\b/iu,
  },
  {
    businessKind: "architecture",
    industry: "professional-services",
    aliases: ["architecture", "architect", "interior-design"],
    facts:
      /\b(?:architecture|architect|interior design|architectural design)\b/iu,
  },
  {
    businessKind: "legal-services",
    industry: "professional-services",
    aliases: [
      "legal-services",
      "legal",
      "law",
      "law-firm",
      "lawyer",
      "attorney",
    ],
    facts:
      /\b(?:law firm|legal services|attorney|lawyer|solicitor|legal practice)\b/iu,
  },
  {
    businessKind: "beauty",
    industry: "wellness",
    aliases: ["beauty", "beauty-salon", "salon", "barber", "barbershop", "spa"],
    facts:
      /\b(?:beauty salon|hair salon|barber|barbershop|hair stylist|hair colorist|skincare|cosmetology|medical spa)\b/iu,
  },
  {
    businessKind: "accounting",
    industry: "professional-services",
    aliases: ["accounting", "accountant", "accountancy", "bookkeeping"],
    facts:
      /\b(?:accounting|accountant|accountancy|bookkeeping|tax accounting)\b/iu,
  },
  {
    businessKind: "real-estate",
    industry: "real-estate",
    aliases: [
      "real-estate",
      "real-estate-agent",
      "real-estate-brokerage",
      "realty",
      "realtor",
      "property-management",
    ],
    facts:
      /\b(?:real estate|realty|realtor|property management|real estate agent|real estate broker|property development|real estate development)\b/iu,
  },
  {
    businessKind: "veterinary",
    industry: "wellness",
    aliases: [
      "veterinary",
      "veterinarian",
      "vet",
      "vet-clinic",
      "animal-clinic",
      "animal-hospital",
      "pet-clinic",
    ],
    facts:
      /\b(?:veterinar\w*|vet clinic|animal clinic|animal hospital|animal medical center|pet clinic|pet hospital)\b/iu,
  },
];

const BROAD_INDUSTRIES = new Set([
  "wellness",
  "home-services",
  "technology",
  "professional-services",
  "hospitality",
  "real-estate",
  "other",
]);

function industryKey(value) {
  return text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function explicitBusinessProfile(intake) {
  const selected = industryKey(intake.industry);
  return BUSINESS_KIND_PROFILES.find((profile) =>
    profile.aliases.includes(selected),
  );
}

function businessProfileFromFacts(intake) {
  const facts = [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
  return BUSINESS_KIND_PROFILES.find((profile) => profile.facts.test(facts));
}

function profileForAmbiguousIndustry(intake, selectedIndustry) {
  if (selectedIndustry !== "automotive") return undefined;
  const profile = businessProfileFromFacts(intake);
  return profile?.businessKind === "auto-repair" ? profile : undefined;
}

function intakeFacts(intake) {
  return [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
}

function industryFor(intake) {
  const selected = industryKey(intake.industry);
  const specificProfile = profileForAmbiguousIndustry(intake, selected);
  if (unsupportedBusinessKinds.has(selected) && !specificProfile)
    return "other";
  const explicitProfile = explicitBusinessProfile(intake) || specificProfile;
  if (explicitProfile) return explicitProfile.industry;
  if (BROAD_INDUSTRIES.has(selected) && selected !== "other") return selected;

  const facts = intakeFacts(intake);
  const veterinaryProfile = businessProfileFromFacts(intake);
  if (veterinaryProfile?.businessKind === "veterinary")
    return veterinaryProfile.industry;
  if (
    /\b(?:pets?|veterinar\w*|vet clinic|animal hospital|(?:dog|cat)\s+(?:groom\w*|boarding|daycare|sitting|walking|training|care|food|treats|supplies))\b/iu.test(
      facts,
    )
  )
    return "other";
  const factProfile = veterinaryProfile || businessProfileFromFacts(intake);
  if (factProfile) return factProfile.industry;
  if (selected === "other") return "other";
  if (
    /\b(?:health|care|wellness|clinic|therapy|dental|medspa|medical|beauty)\b/u.test(
      facts,
    )
  )
    return "wellness";
  if (
    /\b(?:repair|plumb\w*|electric\w*|roof|garage|cleaning|landscap\w*|hvac|contractor)\b/u.test(
      facts,
    )
  )
    return "home-services";
  if (
    /\b(?:software|technology|tech|saas|app|digital|automation)\b/u.test(facts)
  )
    return "technology";
  if (
    /\b(?:law|legal|account|consult|financial|insurance|agency)\b/u.test(facts)
  )
    return "professional-services";
  return "other";
}

function businessKindFor(intake, industry) {
  const selected = industryKey(intake.industry);
  const specificProfile = profileForAmbiguousIndustry(intake, selected);
  if (unsupportedBusinessKinds.has(selected) && !specificProfile)
    return selected;
  const profile =
    explicitBusinessProfile(intake) ||
    specificProfile ||
    businessProfileFromFacts(intake);
  return profile?.industry === industry ? profile.businessKind : industry;
}

function reviewedStockPack(kind) {
  return STOCK_PACKS[kind === "accounting" ? "professional-services" : kind];
}

function stockImages(kind) {
  // These are reviewed packs, not a live keyword search. If the pack does not
  // describe the business, the template intentionally renders brand art.
  const pack = reviewedStockPack(kind) || {};
  return {
    ...(pack.hero ? { hero: pack.hero } : {}),
    ...(pack.secondary ? { secondary: pack.secondary } : {}),
  };
}

function stockAssetReport(kind, images) {
  const pack = reviewedStockPack(kind);
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
    recentFingerprints: recentFingerprintsForSelection(kind),
    hasImage: Boolean(
      intake.heroImage || intake.photoOne || intake.photoTwo || intake.logo,
    ),
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
        options: [
          ...[
            ...new Set(
              services
                .map((service) => text(service?.name || service, 100))
                .filter(Boolean),
            ),
          ].slice(0, 5),
          "Not sure yet",
        ],
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
  ].slice(0, 5);
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
const REPAIR_OUTCOME_ISSUE =
  "Generated copy includes a repair outcome prohibited by the client art direction.";
const DUPLICATE_SERVICE_CONTENT_ISSUE =
  "Service pages repeat generic guidance after service-name substitution.";
const UNSUPPORTED_BUSINESS_CLAIMS_PREFIX =
  "Generated copy includes unsupported business claims:";
const REPAIR_OUTCOME_CLAIM =
  /\b(?:gets?|got|will be|is|are|was|were)\s+(?:(?:completely|fully)\s+)?(?:fixed|repaired|solved|restored|resolved)\b|\b(?:we|our team)\s+(?:will|can)\s+(?:fix|repair|solve|restore)\b/i;
const REPAIR_OUTCOME_NEGATION =
  /\b(?:not(?!\s+only)|never|cannot|can't|don't|doesn't|didn't|won't|wouldn't)\b|\bno\s+(?:one|claim|promise|guarantee|assurance|commitment)\b/iu;
const REPAIR_OUTCOME_CLAUSE_BOUNDARY =
  /[.!?;\n]|\b(?:but|however|yet|still)\b|\band(?=\s+(?:we|our|the|a|an|you|your|they|he|she|it|this|that)\b)/giu;

function explicitlyProhibitsRepairOutcomes(config) {
  const direction = String(config.style?.artDirection || "");
  const seoProhibitions = Array.isArray(config.seoResearch?.prohibitedClaims)
    ? config.seoResearch.prohibitedClaims.join("\n")
    : "";
  const prohibitionText = `${direction}\n${seoProhibitions}`;
  return (
    /\b(?:do not|don't|never|avoid)\b[^.!?]{0,100}\b(?:claim|promise|assert|state)\b[^.!?]{0,180}\b(?:repair|service|work)\s+(?:outcomes?|results?)\b/i.test(
      prohibitionText,
    ) || /\brepair\s+(?:outcomes?|results?)\b/i.test(seoProhibitions)
  );
}

function visitorFacingCopy(config) {
  return [
    config.business?.tagline,
    config.business?.description,
    ...Object.values(config.copy || {}),
    ...(config.services || []).flatMap((service) => [
      service?.description,
      ...Object.values(service?.decisionSupport || {}),
    ]),
    ...(config.differentiators || []),
    ...(config.conversion?.process || []),
    ...(config.conversion?.faqs || []).flatMap((faq) => [
      faq?.question,
      faq?.answer,
    ]),
  ]
    .filter((value) => typeof value === "string")
    .join("\n");
}

function routeCopyWithoutServiceName(value, serviceName) {
  const normalizedName = text(serviceName, 120).toLocaleLowerCase();
  return String(value || "")
    .toLocaleLowerCase()
    .split(normalizedName)
    .join(" service ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasRepeatedModelServiceContent(modelOutput) {
  const services = Array.isArray(modelOutput?.services)
    ? modelOutput.services
    : [];
  if (services.length < 2) return false;
  const repeatsAfterNameRemoval = (values, owners) => {
    const normalized = values
      .map((value, index) =>
        typeof value === "string" && value.trim()
          ? routeCopyWithoutServiceName(value, owners[index]?.name)
          : "",
      )
      .filter(Boolean);
    return (
      normalized.length > 1 && new Set(normalized).size < normalized.length
    );
  };
  if (
    repeatsAfterNameRemoval(
      services.map((service) => service?.description),
      services,
    )
  )
    return true;
  return ["scope", "nextStep", "preparation"].some((field) =>
    repeatsAfterNameRemoval(
      services.map((service) => service?.decisionSupport?.[field]),
      services,
    ),
  );
}

function hasUnnegatedRepairOutcomeClaim(copy) {
  const text = String(copy || "");
  const claimPattern = new RegExp(REPAIR_OUTCOME_CLAIM.source, "giu");
  for (const match of text.matchAll(claimPattern)) {
    const claimStart = match.index || 0;
    const prefix = text.slice(0, claimStart);
    let clauseStart = 0;
    for (const boundary of text.matchAll(REPAIR_OUTCOME_CLAUSE_BOUNDARY)) {
      if ((boundary.index || 0) >= claimStart) break;
      clauseStart = (boundary.index || 0) + boundary[0].length;
    }
    if (!REPAIR_OUTCOME_NEGATION.test(prefix.slice(clauseStart))) return true;
  }
  return false;
}

function violatesExplicitRepairOutcomeProhibition(config) {
  return (
    explicitlyProhibitsRepairOutcomes(config) &&
    hasUnnegatedRepairOutcomeClaim(visitorFacingCopy(config))
  );
}

export function evaluateDraft(config, { modelOutput, intake, narrative } = {}) {
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
    services.some((service) =>
      serviceDescriptionRestatesName(service.description, service.name),
    )
  )
    issues.push(
      "At least one service card restates the service name instead of naming a recognizable customer symptom and a concrete next step.",
    );
  if (hasRepeatedModelServiceContent(modelOutput))
    issues.push(DUPLICATE_SERVICE_CONTENT_ISSUE);
  const pageReadiness = pageBriefReadiness(config);
  if (!pageReadiness.allowed)
    issues.push(
      pageReadiness.error || "Route-specific page content is incomplete.",
    );
  const unsupportedClaims = findUnsupportedBusinessClaimLocations(
    config,
    intake,
  );
  if (unsupportedClaims.length)
    issues.push(
      `Generated copy includes unsupported business claims: ${unsupportedClaims
        .map(({ category, path }) => `${category} at ${path}`)
        .join("; ")}.`,
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
  if (violatesExplicitRepairOutcomeProhibition(config))
    issues.push(REPAIR_OUTCOME_ISSUE);
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

  return {
    score: Math.max(0, 100 - issues.length * 12),
    issues,
    narrativeAudit: evaluateNarrativeSpine(narrative, config, intake),
  };
}

const DEFAULT_LEAD_CONSENT =
  "By submitting, you agree to be contacted about your request.";
const DEFAULT_LEAD_SUCCESS = "Thank you. We will be in touch shortly.";
const DEFAULT_LEAD_ERROR = "We could not send your request. Please try again.";

/**
 * Consolidated lead-form configuration for generated sites.
 *
 * Delivery, consent, form copy, and the visitor-confirmation switch live here
 * so the template, the lead token, and the notification renderer read one
 * source. Qualifier questions remain owned by `conversion.qualification`
 * (and `conversion.guidedQualifier`); the form block mirrors the validated
 * shape for rendering and for the published config contract.
 */
export function leadFormFor(config = {}, intake = {}) {
  const business = config.business || {};
  const copy = config.copy || {};
  const conversion = config.conversion || {};
  const leadEmail = text(business.leadEmail, 240);
  const phone = text(business.phone, 80);
  const primaryCta = text(business.primaryCta, 120) || "Send request";
  const submitLabel =
    primaryCta.toLowerCase() === "get directions" ? "Send request" : primaryCta;
  const qualification = (
    Array.isArray(conversion.qualification) ? conversion.qualification : []
  )
    .filter((question) => question && typeof question === "object")
    .map((question) => ({
      name: text(question.name, 60),
      label: text(question.label, 160),
      placeholder: text(question.placeholder, 120),
      options: (Array.isArray(question.options) ? question.options : [])
        .map((option) => text(option, 120))
        .filter(Boolean)
        .slice(0, 8),
    }))
    .filter((question) => question.name && question.options.length)
    .slice(0, 4);
  const guided =
    conversion.guidedQualifier && typeof conversion.guidedQualifier === "object"
      ? conversion.guidedQualifier
      : {};
  const qualifier = {
    enabled: guided.enabled !== false && qualification.length > 0,
    heading: text(guided.heading, 120) || "A few quick questions",
    intro:
      text(guided.intro, 240) ||
      "Choose the closest options so we can understand what you need.",
  };
  const privacyHref = text(intake.privacyHref, 120);
  return {
    enabled: Boolean(leadEmail),
    recipient: leadEmail,
    submitLabel,
    consent: text(copy.formIntro, 400) || DEFAULT_LEAD_CONSENT,
    ...(/^\/[A-Za-z0-9/_-]+$/u.test(privacyHref) ? { privacyHref } : {}),
    successMessage: DEFAULT_LEAD_SUCCESS,
    errorMessage: DEFAULT_LEAD_ERROR,
    unconfiguredMessage: phone
      ? `This inquiry form is not connected yet. Please call ${phone}.`
      : "This inquiry form is not connected yet.",
    confirmVisitor:
      String(intake.leadConfirmVisitor || "").toLowerCase() !== "no",
    qualification,
    qualifier,
  };
}

function placeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .replace(/\s+/gu, " ")
    .trim();
}

function dedupePlaces(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    const key = placeKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallback(intake) {
  const industry = industryFor(intake);
  const preset =
    intake.preset === "home-services" || industry === "home-services"
      ? "home-services"
      : "wellness";
  const businessKind = businessKindFor(intake, industry);
  const areas = Array.isArray(intake.coverageAreas)
    ? dedupePlaces(
        intake.coverageAreas.map((area) => text(area, 160)).filter(Boolean),
      )
    : dedupePlaces(lines(intake.serviceAreas));
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
  const artDirection = text(intake.brandNotes, 1200);
  const suppressUnverifiedLocation = hasConflictingUnverifiedAddress(intake);
  const config = {
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
      addressVisibility: intake.addressVisibility || "public",
      serviceAreas: areas,
      primaryCity: text(intake.primaryCity, 180) || areas[0] || "",
      serviceRadiusMiles:
        intake.serviceRadius === "50+"
          ? "50+"
          : Number.isFinite(Number(intake.serviceRadius)) &&
              [10, 20, 30, 50].includes(Number(intake.serviceRadius))
            ? Number(intake.serviceRadius)
            : null,
      hours: intake.hours || "",
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
      ...fontChoicesFromIntake(intake),
      tone: intake.tone || "confident",
      ...(stylePreference ? { preference: stylePreference } : {}),
      ...(visualDirection ? { visualDirection } : {}),
      ...(artDirection ? { artDirection } : {}),
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
  config.leadForm = leadFormFor(config, intake);
  return config;
}

export function normalise(candidate, intake) {
  candidate = redactPrivateLocation(candidate, intake);
  intake = publicGenerationIntake(intake);
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
  const submittedServiceNames = lines(intake.services).slice(
    0,
    MAX_CORE_SERVICES,
  );
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
  const services = serviceInput
    .slice(0, MAX_CORE_SERVICES)
    .map((service, index) => {
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
  const selectedLocations =
    seoResearch?.version >= 2
      ? seoResearch.pageMap
          .filter((page) => page?.pageType === "location")
          .map((page) => slugify(String(page.location || page.title || "")))
      : seoResearch?.mode === "researched"
        ? seoResearch.pageDecisions
            .filter((decision) => decision?.type === "location")
            .map((decision) => slugify(String(decision.title || "")))
        : [];
  const researchedLocations =
    seoResearch?.version >= 2
      ? new Set(selectedLocations)
      : selectedLocations.length
        ? new Set(selectedLocations)
        : null;
  const explicitLocationTargets = new Set(
    (intake.routePolicy?.decisions || [])
      .filter(
        (decision) =>
          decision.pageType === "location" &&
          ["approved", "proposed", "deferred"].includes(decision.status),
      )
      .map((decision) => slugify(String(decision.target || ""))),
  );
  const locationNames = researchedLocations
    ? business.serviceAreas.filter(
        (name) =>
          researchedLocations.has(slugify(name)) ||
          explicitLocationTargets.has(slugify(name)),
      )
    : business.serviceAreas;
  const demoNotice = fictionalPipelineDemoNotice(intake);
  const normalized = removeEmDashes({
    preset,
    industry: base.industry,
    businessKind: base.businessKind,
    ...(demoNotice ? { demoNotice } : {}),
    business,
    factReadiness: intake.factReadiness,
    routePolicy: intake.routePolicy || {
      version: 1,
      decisions: [],
      existingUrls: intake.existingUrls || [],
    },
    supportingPages: intake.supportingPages || {},
    pageContent: intake.pageContent || {},
    pageEvidence: intake.pageEvidence || [],
    ...(intake.pageContentContractVersion !== undefined
      ? {
          pageContentContractVersion: Number(intake.pageContentContractVersion),
        }
      : seoResearch?.version >= 2 &&
          (services.length ? services : base.services).every(
            (service) =>
              service?.decisionSupport?.scope &&
              service?.decisionSupport?.preparation &&
              service?.decisionSupport?.nextStep,
          )
        ? { pageContentContractVersion: 1 }
        : {}),
    excludedServices: lines(intake.excludedServices),
    seoPageMap: seoResearch?.pageMap || [],
    style: {
      ...resolvePalette({ ...(value.style || {}), ...base.style }),
      ...(base.style.headingFont
        ? { headingFont: base.style.headingFont }
        : {}),
      ...(base.style.bodyFont ? { bodyFont: base.style.bodyFont } : {}),
      tone: base.style.tone,
      ...(base.style.preference ? { preference: base.style.preference } : {}),
      ...(base.style.visualDirection
        ? { visualDirection: base.style.visualDirection }
        : {}),
      ...(base.style.artDirection
        ? { artDirection: base.style.artDirection }
        : {}),
    },
    services: services.length ? services : base.services,
    differentiators: different.length ? different : base.differentiators,
    blogArticles: normaliseBlogArticles(intake.blogArticles),
    locations:
      base.industry === "home-services"
        ? locationNames.map((name, index) => {
            const proposed = Array.isArray(value.locations)
              ? value.locations.find(
                  (location) => slugify(location?.name || "") === slugify(name),
                ) || value.locations[index]
              : undefined;
            const admission = (intake.routePolicy?.decisions || []).find(
              (decision) =>
                decision.pageType === "location" &&
                slugify(String(decision.target || "")) === slugify(name),
            )?.admission;
            const suppliedLocalNote = (
              Array.isArray(admission?.localFacts) ? admission.localFacts : []
            )
              .map((fact) => fact.value)
              .filter(Boolean)
              .join(" ");
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
                suppliedLocalNote ||
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
  if (normalized.pageContentContractVersion === 1) {
    const evidence = Array.isArray(normalized.pageEvidence)
      ? [...normalized.pageEvidence]
      : [];
    const resolveSource = (dottedPath) =>
      dottedPath
        .split(".")
        .reduce((current, part) => current?.[part], normalized);
    const copyClaim = (value, routeId, suffix, sourceRefs, limit) => {
      const cleaned = text(value, limit);
      const refs = [...new Set(sourceRefs)].filter((ref) => {
        const source = resolveSource(ref);
        return (
          (typeof source === "string" ||
            (typeof source === "number" && Number.isFinite(source))) &&
          text(source, 1000)
        );
      });
      if (
        !cleaned ||
        !matchesWritingSystem(cleaned, clientSource) ||
        refs.length === 0
      )
        return null;
      const baseId = `generated-${slugify(routeId)}-${suffix}`;
      let id = baseId;
      for (
        let duplicate = 2;
        evidence.some((item) => item?.id === id);
        duplicate++
      )
        id = `${baseId}-${duplicate}`;
      evidence.push({
        id,
        value: cleaned,
        source:
          "Generated route copy grounded in verified business facts and measured search intent.",
        kind: "generated_copy",
        confirmed: true,
        public: true,
        routeIds: [routeId],
        sourceRefs: refs,
      });
      return { text: cleaned, evidenceIds: [id] };
    };
    const routeName = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/\s+/gu, " ")
        .trim();
    for (const [serviceIndex, service] of normalized.services.entries()) {
      const routeId = `service:${routeName(service.name)}`;
      if (normalized.pageContent[routeId]) continue;
      const rawService = proposedServiceFor(service.name);
      const mapIndex = normalized.seoPageMap.findIndex(
        (page) =>
          page.pageType === "service" &&
          routeName(page.service || page.title) === routeName(service.name),
      );
      if (mapIndex < 0) continue;
      const map = normalized.seoPageMap[mapIndex];
      const mapRef = (field) => `seoPageMap.${mapIndex}.${field}`;
      const serviceRef = (field) => `services.${serviceIndex}.${field}`;
      const keywordRef =
        typeof map.primaryKeyword === "string"
          ? mapRef("primaryKeyword")
          : mapRef("primaryKeyword.keyword");
      const baseRefs = [
        serviceRef("name"),
        serviceRef("description"),
        keywordRef,
        mapRef("supportingKeywords.0.keyword"),
      ];
      const rawSections = rawService?.pageSections || {};
      const rawSupport = rawService?.decisionSupport || {};
      const searchQuestions = Array.isArray(map.fanOutQuestions)
        ? map.fanOutQuestions
        : [];
      const sections = {};
      for (const field of ["scope", "preparation", "nextStep"]) {
        const sectionText = rawSections[field] || rawSupport[field];
        const result = copyClaim(
          sectionText,
          routeId,
          `${field}-0`,
          [
            serviceRef(`decisionSupport.${field}`),
            ...baseRefs,
            mapRef("fanOutQuestions.0"),
          ],
          480,
        );
        if (result) sections[field] = [result];
      }
      const introductionText =
        rawService?.pageIntroduction ||
        [
          service.description,
          `${business.name} serves ${business.serviceAreas[0] || "the local area"} and nearby communities.`,
        ]
          .filter(Boolean)
          .join(" ");
      const introduction = copyClaim(
        introductionText,
        routeId,
        "introduction-0",
        [
          ...baseRefs,
          "business.serviceAreas.0",
          mapRef("fanOutQuestions.0"),
        ],
        680,
      );
      const metadataDescription = copyClaim(
        rawService?.pageMetaDescription || service.description,
        routeId,
        "metadata-description-0",
        baseRefs,
        240,
      );
      const faqs = [];
      // Route FAQs are structural: when the copy model omits them, answer the
      // measured fan-out questions from the confirmed decision support so each
      // service page carries its own substance instead of template filler.
      const rawFaqs = Array.isArray(rawService?.pageFaqs)
        ? [...rawService.pageFaqs]
        : [];
      if (rawFaqs.length < 2) {
        const answers = [
          rawSupport.scope,
          rawSupport.preparation,
          rawSupport.nextStep,
        ];
        for (const [index, question] of searchQuestions
          .slice(0, 3)
          .entries()) {
          if (!answers[index]) continue;
          if (
            rawFaqs.some(
              (faq) => routeName(faq?.question) === routeName(question),
            )
          )
            continue;
          rawFaqs.push({ question, answer: answers[index] });
        }
      }
      for (const [faqIndex, faq] of rawFaqs.entries()) {
        const question = text(faq?.question, 180);
        const questionIndex = searchQuestions.findIndex(
          (item) => routeName(item) === routeName(question),
        );
        if (questionIndex < 0) continue;
        const questionClaim = copyClaim(
          question,
          routeId,
          `faq-${faqIndex}-question`,
          [mapRef(`fanOutQuestions.${questionIndex}`), serviceRef("name")],
          180,
        );
        const answerClaim = copyClaim(
          faq?.answer,
          routeId,
          `faq-${faqIndex}-answer`,
          [
            serviceRef("description"),
            serviceRef("decisionSupport.scope"),
            serviceRef("decisionSupport.preparation"),
            serviceRef("decisionSupport.nextStep"),
            mapRef(`fanOutQuestions.${questionIndex}`),
          ],
          520,
        );
        if (questionClaim && answerClaim)
          faqs.push({ question: questionClaim, answer: answerClaim });
      }
      normalized.pageContent[routeId] = {
        ...(introduction ? { introduction } : {}),
        metadata: metadataDescription
          ? { description: metadataDescription }
          : {},
        ...sections,
        faqs,
      };
    }
    for (const [locationIndex, location] of normalized.locations.entries()) {
      const routeId = `location:${routeName(location.name)}`;
      if (normalized.pageContent[routeId]) continue;
      const rawLocation = (
        Array.isArray(value.locations) ? value.locations : []
      ).find((item) => routeName(item?.name) === routeName(location.name));
      const decisionIndex = normalized.routePolicy.decisions.findIndex(
        (decision) =>
          decision.pageType === "location" &&
          routeName(decision.target) === routeName(location.name),
      );
      const mapIndex = normalized.seoPageMap.findIndex(
        (page) =>
          page.pageType === "location" &&
          routeName(page.location || page.title) === routeName(location.name),
      );
      if (!rawLocation || decisionIndex < 0 || mapIndex < 0) continue;
      const admission =
        normalized.routePolicy.decisions[decisionIndex].admission || {};
      const localFactRefs = (
        Array.isArray(admission.localFacts) ? admission.localFacts : []
      )
        .map((fact, factIndex) =>
          text(fact?.value)
            ? `routePolicy.decisions.${decisionIndex}.admission.localFacts.${factIndex}.value`
            : "",
        )
        .filter(Boolean);
      const mapRef = (field) => `seoPageMap.${mapIndex}.${field}`;
      const locationRef = (field) => `locations.${locationIndex}.${field}`;
      const sourceRefs = [
        locationRef("name"),
        `routePolicy.decisions.${decisionIndex}.admission.visitorNeed`,
        `routePolicy.decisions.${decisionIndex}.admission.distinctValue`,
        ...localFactRefs,
        typeof normalized.seoPageMap[mapIndex].primaryKeyword === "string"
          ? mapRef("primaryKeyword")
          : mapRef("primaryKeyword.keyword"),
      ];
      const introduction = copyClaim(
        rawLocation.pageIntroduction,
        routeId,
        "introduction-0",
        sourceRefs,
        680,
      );
      const metadataDescription = copyClaim(
        rawLocation.pageMetaDescription,
        routeId,
        "metadata-description-0",
        sourceRefs,
        240,
      );
      const localContext = localFactRefs.length
        ? copyClaim(
            rawLocation.pageLocalContext,
            routeId,
            "local-context-0",
            localFactRefs,
            520,
          )
        : null;
      normalized.pageContent[routeId] = {
        ...(introduction ? { introduction } : {}),
        metadata: metadataDescription
          ? { description: metadataDescription }
          : {},
        localContext: localContext ? [localContext] : [],
      };
    }
    normalized.pageEvidence = evidence;
  }
  normalized.leadForm = leadFormFor(normalized, intake);
  normalized.routeInventory = compileRouteInventory(normalized);
  normalized.pageBriefs = compilePageBriefs(normalized);
  return normalized;
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

async function askModel(intake, effort, model = siteCopyDefaultModel()) {
  intake = copywriterContext(intake);
  const systemPrompt = `You are LaunchLoom's senior conversion copywriter and conversion strategist for local and service businesses. Return JSON only. Create specific, polished, plain-language website copy from verified facts. Use the language and writing system indicated by languageCode in the verified context, and never insert untranslated foreign words. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION}

NARRATIVE SPINE
Before writing any copy, decide the page narrative and return it in narrative:
{ audience, offer, primaryAction, secondaryAction, objections: [{ objection, answer, section }], proof: [{ claim, evidence }], sectionJobs: { hero, services, process, about, faq, contact }, pageArgument: [steps] }.
Use exactly three visitor objections. section must be one of hero, services, process, about, faq, contact. Each answer must use only verified facts or a cautious next step. proof may contain only proof supplied in the brief, and evidence must be a verbatim phrase from the brief; if no proof is supplied, return an empty array. Each section job must be distinct and must not repeat another section's claim. primaryAction must match business.primaryCta. Then write the copy so every section performs its job and every objection is answered somewhere in the page. Do not invent proof, policies, prices, credentials, staff, reviews, or outcomes.

COPY SPECIFICITY
The narrative is a plan, not the copy. Do not restate the narrative in the page. Every sentence must be more specific than the plan.
- Hero heading: a memorable 4-10 word promise about the visitor's outcome. Do not use a category label, a service list, or a title-case slogan.
- Hero body: one sentence that names the audience, the service, and the next step without listing every service.
- Service description: name one recognizable customer symptom or situation, then one concrete outcome or next step. Never write "Request [service] for [service] problem" or any sentence that could apply to a different business. Bad: "Request drain cleaning for a drain problem you want us to address." Good: "For a slow or backed-up drain, describe the fixture and when it started so the team can confirm the next step."
- FAQ: each question must answer a different decision, not repeat coverage or service names. Do not ask a question the hero already answers.
- About: explain how the business works, not a restatement of the differentiators.
- Use sentence case for headings and buttons unless the reference or client style explicitly requires title case.

Build a credible path from visitor problem to action with a differentiated promise, distinct service outcomes, concrete decision support, concise process steps, and useful FAQs. Improve clarity, hierarchy, and customer benefit without inventing licenses, medical claims, guarantees, pricing, credentials, testimonials, business hours, locations, deadlines, staff, or results. Never replace submitted contact facts. When an seoResearch dossier is present, use each service's matching page-map entry, measured primary intent, supporting keywords, and fan-out questions for its own descriptions, route introduction, page sections, and FAQs. For every measured service route, write a distinct pageIntroduction, pageMetaDescription, pageSections.scope, pageSections.preparation, pageSections.nextStep, and at least two pageFaqs. Each pageFaq question must exactly match a fan-out question for that service; answer with confirmed facts or cautious preparation and next-step guidance only. Do not copy generic service guidance between routes with only the service name changed. If evidence cannot support a useful answer, do not invent one; leave the field absent so the route fails review. For a selected location route, provide pageIntroduction, pageMetaDescription, and pageLocalContext only when routePolicy admission includes supporting localFacts; use those exact local details and distinguish coverage from a physical office. If the research supplies a question but no business-specific answer, frame the response as a cautious question or next-step prompt instead of asserting undocumented business practices. Never add services absent from the confirmed services list. Keep location pages only when the canonical map contains them. Blog opportunities are for future articles; do not generate initial blog posts or filler. Never present search metrics, SERP language, or competitor titles as a business fact, and never include anything listed under prohibitedClaims. When the primary action is Get directions, preserve that action exactly; the template will add a verified map when an exact location exists, and contactHeading should invite contact rather than repeat Get directions. When the brief includes feedback, treat it as the primary revision request: address it directly and preserve unrelated approved copy and positioning. Avoid generic filler such as 'tailored to your needs', 'when it matters', 'work that lasts', 'next level', 'quality you can trust', or 'we are here for you'. Make every service description distinct and concrete. Only use proof claims supplied in the brief. Do not return HTML or frontend code.`;
  const identity = {
    businessName: intake.businessName,
    businessKind: intake.businessKind,
    industry: intake.industry,
    services: intake.services,
  };
  const sessionId = openRouterSessionId("site-copy", model, identity);
  const promptCacheKey = openRouterPromptCacheKey(
    "site-copy-system",
    model,
    systemPrompt,
  );
  const siteCopyUserPrompt = `Transform this verified client brief into JSON with keys narrative, preset, business, style, services, differentiators, locations, copy, conversion. Decide narrative first, then write the copy from it. business must include name, tagline, description, phone, email, address, serviceAreas, hours, primaryCta, offer, domain, leadEmail. Each service object must include {name, description, slug, decisionSupport:{scope,nextStep,preparation}, pageIntroduction, pageMetaDescription, pageSections:{scope,preparation,nextStep}, pageFaqs:[{question,answer}]}. Keep every submitted service name exactly as provided. Each service description is one concrete sentence under 22 words. Each decisionSupport field must answer a different practical buying question using only supported facts and cautious next-step language. For each measured service route, the page introduction is 2-3 specific sentences; the three page sections each add distinct, useful route guidance; the metadata description is concise; pageFaqs has at least two answers to that route's exact fan-out questions. Do not answer questions with invented policy, prices, timelines, guarantees, or outcomes. A location object may include {name,description,localNote,pageIntroduction,pageMetaDescription,pageLocalContext}; include only selected service areas and use local facts from its explicit routePolicy admission, never infer an office. If local facts are absent, omit the route copy instead of manufacturing city-specific detail. copy must include heroKicker, heroHeading, heroBody, servicesHeading, servicesIntro, aboutKicker, aboutHeading, aboutBody, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. heroHeading is a catchy 4-10 word customer promise, not a service inventory. heroBody is one sentence under 28 words. servicesHeading is a short, memorable section promise and servicesIntro is one sentence. aboutBody adds useful context instead of repeating the hero description or proof points. conversion must include process (2-4 concise steps) and faqs (2-5 {question, answer} objects). The tagline is a concise, differentiated promise; description is a 2-3 sentence customer-facing introduction. Treat submitted business facts as authoritative.\n\n${JSON.stringify(intake)}`;
  if (siteCopyProvider() === "opencode-go")
    return siteCopyOpencodeGoCompletion({
      label: "site-copy",
      effort,
      systemPrompt,
      userPrompt: siteCopyUserPrompt,
      sessionId,
      maxOutputTokens: SITE_COPY_MAX_COMPLETION_TOKENS,
      model,
    });
  const response = await openRouterChatCompletion({
    title: "LaunchLoom",
    sessionId,
    body: {
      model,
      max_completion_tokens: SITE_COPY_MAX_COMPLETION_TOKENS,
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
          content: siteCopyUserPrompt,
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
  recordModelUsage("site-copy", model, result.usage);
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return parseModelJson(content);
}

async function refineDraft(
  intake,
  draft,
  report,
  model = siteCopyDefaultModel(),
  {
    maxCompletionTokens = SITE_COPY_REFINEMENT_MAX_COMPLETION_TOKENS,
    truncatedRetry = false,
  } = {},
) {
  const retryInstruction = truncatedRetry
    ? "The previous copy-patch response was cut off at its output limit. Return one complete, concise JSON copy patch; do not add commentary or repeat the truncated response."
    : "";
  const context = copywriterContext(intake);
  const currentCopy = copyRefinementDraft(draft);
  const systemPrompt = `You are the final conversion copy editor for a local-business website. Return JSON only as a copy patch, not a complete site config. Use the language and writing system indicated by languageCode in the verified context. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION} ${retryInstruction} Fix only the listed quality issues. Use the measured primary keyword, supporting terms, intent, and fan-out questions only for the matching route. Every service FAQ question must exactly match one of that service's supplied fan-out questions; return its answer only. Location copy may use only supplied local facts. Never invent business policies, proof, pricing, credentials, outcomes, locations, staff, hours, availability, guarantees, or claims. Preserve the current narrative unless a quality issue requires changing it. The patch may contain only these fields: narrative {audience,offer,primaryAction,secondaryAction,objections,proof,sectionJobs,pageArgument}; business {tagline,description}; copy (copy strings); services [{name,description,pageIntroduction,pageMetaDescription,decisionSupport:{scope,nextStep,preparation},pageSections:{scope,preparation,nextStep},pageFaqs:[{question,answer}]}]; locations [{name,description,localNote,pageIntroduction,pageMetaDescription,pageLocalContext}]; differentiators (strings); conversion {process (strings),faqs:[{question,answer}]}. Preserve every submitted fact and all unlisted fields. Do not return contact details, SEO evidence/dossiers, route inventory, service names as edits, slugs, assets, styles, layout, HTML, CSS, code, explanations, or markdown. Unknown patch fields are ignored by the deterministic merger.`;
  const identity = {
    businessName: context.businessName,
    businessKind: context.businessKind,
    industry: context.industry,
    services: context.services,
  };
  const sessionId = openRouterSessionId("site-copy", model, identity);
  const promptCacheKey = openRouterPromptCacheKey(
    "site-refine-system",
    model,
    systemPrompt,
  );
  const siteCopyRefinementUserPrompt = `Verified facts and measured search context:\n${JSON.stringify(context)}\n\nCurrent editable copy:\n${JSON.stringify(currentCopy)}\n\nQuality issues to fix:\n${report.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}`;
  if (siteCopyProvider() === "opencode-go")
    return siteCopyOpencodeGoCompletion({
      label: "site-refinement",
      effort: "medium",
      systemPrompt,
      userPrompt: siteCopyRefinementUserPrompt,
      sessionId,
      maxOutputTokens: maxCompletionTokens,
      model,
    });
  const response = await openRouterChatCompletion({
    title: "LaunchLoom quality refinement",
    sessionId,
    body: {
      model,
      max_completion_tokens: maxCompletionTokens,
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
          content: siteCopyRefinementUserPrompt,
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
  recordModelUsage("site-refinement", model, result.usage);
  const choice = result.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new Error("OpenRouter refinement returned no content.");
  try {
    return parseModelJson(content);
  } catch (error) {
    if (choice?.finish_reason === "length") {
      const truncated = new Error(
        `OpenRouter refinement JSON was truncated (finish_reason=length; content_chars=${typeof content === "string" ? content.length : "non-string"}).`,
        { cause: error },
      );
      truncated.code = "OPENROUTER_OUTPUT_TRUNCATED";
      throw truncated;
    }
    throw error;
  }
}

export async function generateSiteConfigWithModel(intake, model = siteCopyDefaultModel()) {
  const provider = siteCopyProvider();
  if (provider === "opencode-go") {
    if (!process.env.OPENCODE_GO_API_KEY)
      throw new Error(
        "OPENCODE_GO_API_KEY is required to generate client copy with OpenCode Go.",
      );
  } else if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required to generate client copy.");
  }
  const groundedIntake = prepareGenerationIntake(intake);
  let draft;
  let modelOutput;
  try {
    modelOutput = await askModel(groundedIntake, "medium", model);
    draft = normalise(modelOutput, groundedIntake);
  } catch (firstError) {
    if (
      /^OpenRouter returned 402\b/u.test(
        String(firstError?.message || firstError),
      )
    )
      throw firstError;
    console.warn(
      "Low-effort generation failed; retrying once with high effort.",
      firstError.message,
    );
    modelOutput = await askModel(groundedIntake, "high", model);
    draft = normalise(modelOutput, groundedIntake);
  }
  const narrative = normaliseNarrativeSpine(
    redactPrivateLocation(modelOutput?.narrative, groundedIntake),
  );
  const initialReport = evaluateDraft(draft, {
    modelOutput,
    intake: groundedIntake,
    narrative,
  });
  if (!initialReport.issues.length)
    return {
      ...draft,
      qualityReport: { ...initialReport, refined: false, narrative },
    };

  let refinementAttempts = 0;
  try {
    let refinedPatch;
    refinementAttempts = 1;
    try {
      refinedPatch = await refineDraft(
        groundedIntake,
        modelOutput,
        initialReport,
        model,
      );
    } catch (error) {
      if (
        !["OPENROUTER_OUTPUT_TRUNCATED", "SITE_COPY_OUTPUT_TRUNCATED"].includes(
          error?.code,
        )
      )
        throw error;
      refinementAttempts = 2;
      refinedPatch = await refineDraft(
        groundedIntake,
        modelOutput,
        initialReport,
        model,
        {
          maxCompletionTokens: SITE_COPY_REFINEMENT_RETRY_MAX_COMPLETION_TOKENS,
          truncatedRetry: true,
        },
      );
    }
    const refinedOutput = mergeCopyRefinementPatch(
      modelOutput,
      refinedPatch,
      groundedIntake,
    );
    const refined = normalise(refinedOutput, groundedIntake);
    const refinedNarrative =
      normaliseNarrativeSpine(
        redactPrivateLocation(refinedOutput?.narrative, groundedIntake),
      ) || narrative;
    const finalReport = evaluateDraft(refined, {
      modelOutput: refinedOutput,
      intake: groundedIntake,
      narrative: refinedNarrative,
    });
    const initialHasProhibitedClaim =
      initialReport.issues.includes(REPAIR_OUTCOME_ISSUE);
    const refinedHasProhibitedClaim =
      finalReport.issues.includes(REPAIR_OUTCOME_ISSUE);
    const initialHasRepeatedServiceCopy = initialReport.issues.includes(
      DUPLICATE_SERVICE_CONTENT_ISSUE,
    );
    const refinedHasRepeatedServiceCopy = finalReport.issues.includes(
      DUPLICATE_SERVICE_CONTENT_ISSUE,
    );
    const initialHasUnsupportedClaims = initialReport.issues.some((issue) =>
      issue.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
    );
    const refinedHasUnsupportedClaims = finalReport.issues.some((issue) =>
      issue.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
    );
    const initialHasCriticalIssue =
      initialHasProhibitedClaim ||
      initialHasRepeatedServiceCopy ||
      initialHasUnsupportedClaims;
    const refinedHasCriticalIssue =
      refinedHasProhibitedClaim ||
      refinedHasRepeatedServiceCopy ||
      refinedHasUnsupportedClaims;
    const selected =
      initialHasCriticalIssue && !refinedHasCriticalIssue
        ? refined
        : !initialHasCriticalIssue && refinedHasCriticalIssue
          ? draft
          : finalReport.score >= initialReport.score
            ? refined
            : draft;
    const selectedReport = selected === refined ? finalReport : initialReport;
    if (selectedReport.issues.includes(REPAIR_OUTCOME_ISSUE))
      throw new Error(REPAIR_OUTCOME_ISSUE);
    if (selectedReport.issues.includes(DUPLICATE_SERVICE_CONTENT_ISSUE))
      throw new Error(DUPLICATE_SERVICE_CONTENT_ISSUE);
    if (
      selectedReport.issues.some((issue) =>
        issue.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
      )
    )
      throw new Error(
        selectedReport.issues.find((issue) =>
          issue.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
        ),
      );
    return {
      ...selected,
      qualityReport: {
        ...selectedReport,
        refined: selected === refined,
        narrative: selected === refined ? refinedNarrative : narrative,
      },
    };
  } catch (error) {
    const attempts =
      refinementAttempts > 1
        ? `${refinementAttempts} bounded refinement attempts`
        : "one refinement";
    if (initialReport.issues.includes(REPAIR_OUTCOME_ISSUE))
      throw new Error(
        `Copy generation stopped because the explicit repair-outcome prohibition could not be satisfied after ${attempts}.`,
        { cause: error },
      );
    if (initialReport.issues.includes(DUPLICATE_SERVICE_CONTENT_ISSUE))
      throw new Error(
        `Copy generation stopped because service pages remained repetitive after ${attempts}.`,
        { cause: error },
      );
    if (
      initialReport.issues.some((issue) =>
        issue.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
      )
    ) {
      const issue = initialReport.issues.find((item) =>
        item.startsWith(UNSUPPORTED_BUSINESS_CLAIMS_PREFIX),
      );
      throw new Error(
        `Copy generation stopped because ${issue} remained after ${attempts}.`,
        { cause: error },
      );
    }
    console.warn(
      "Quality refinement failed; keeping validated initial draft.",
      error instanceof Error ? error.message : error,
    );
    return {
      ...draft,
      qualityReport: { ...initialReport, refined: false, narrative },
    };
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
  const briefFile = argumentValue(process.argv, "--brief");
  const destination = argumentValue(process.argv, "--out");
  const researchFile = argumentValue(process.argv, "--research");
  const usageOut = argumentValue(process.argv, "--usage-out");
  if ((!source && !briefFile) || !destination)
    throw new Error(
      "Usage: node generate-site-config.mjs (--brief canonical-site-brief.json | --source intake.md) --out site.config.json",
    );
  const intake = briefFile
    ? JSON.parse(await fs.readFile(briefFile, "utf8"))
    : extractIntake(await fs.readFile(source, "utf8"));
  if (researchFile)
    intake.seoResearch = JSON.parse(await fs.readFile(researchFile, "utf8"));
  await fs.writeFile(
    destination,
    `${JSON.stringify(await generateSiteConfig(intake), null, 2)}\n`,
  );
  if (usageOut)
    await fs.writeFile(
      usageOut,
      `${JSON.stringify({ version: 1, records: getSiteConfigUsageRecords() }, null, 2)}\n`,
    );
}
