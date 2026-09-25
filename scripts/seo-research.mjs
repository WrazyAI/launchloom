import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_MAX_TASKS = 16;
const HARD_MAX_TASKS = 32;
const DEFAULT_MAX_USD = 0.25;
const HARD_MAX_USD = 2;
const MAX_CORE_SERVICES = 5;
const MAX_SERVICE_VARIANTS = 6;
const US_STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
const COUNTRY_NAMES = {
  UK: "United Kingdom", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  NZ: "New Zealand", IE: "Ireland", DE: "Germany", FR: "France", ES: "Spain",
  IT: "Italy", NL: "Netherlands", BE: "Belgium", CH: "Switzerland", ZA: "South Africa",
};

const text = (value, limit = 500) => String(value ?? "").replace(/\u0000/gu, "").replace(/—/gu, "-").trim().slice(0, limit);
const keywordKey = (value) => text(value, 180).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const splitList = (value, limit = 20) => {
  const raw = Array.isArray(value) ? value : [value];
  const entries = raw.flatMap((item) => text(item, 400).split(/\r?\n/u).map((part) => text(part, 160))).filter(Boolean);
  return [...new Map(entries.map((item) => [item.toLocaleLowerCase(), item])).values()].slice(0, limit);
};
const areaList = (value, limit = 20) => {
  const raw = Array.isArray(value) ? value : [value];
  const entries = raw.flatMap((item) => text(item, 400).split(/\r?\n/u).map((part) => text(part, 160))).filter(Boolean);
  return [...new Map(entries.map((item) => [item.toLocaleLowerCase(), item])).values()].slice(0, limit);
};
const finiteMetric = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const roundCost = (value) => Math.round((Number(value) || 0) * 100_000) / 100_000;
const slugify = (value) => text(value, 180).toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 90);
const numericRadius = (value) => value === "50+" ? 50 : [10, 20, 30, 50].includes(Number(value)) ? Number(value) : null;

function metricLocationForCity(city, fallback = process.env.SEO_RESEARCH_LOCATION_NAME || "United States") {
  const parts = text(city, 160).split(",").map((part) => part.trim());
  if (parts.length >= 3) {
    const country = COUNTRY_NAMES[parts[2].toUpperCase()] || parts.slice(2).join(", ");
    return `${parts[0]},${parts[1]},${country}`;
  }
  if (parts.length >= 2) {
    const region = parts[1].toUpperCase();
    if (US_STATE_NAMES[region]) return `${parts[0]},${US_STATE_NAMES[region]},United States`;
    if (COUNTRY_NAMES[region]) return `${parts[0]},${COUNTRY_NAMES[region]}`;
    return `${parts[0]},${parts[1]}`;
  }
  return fallback;
}

export function normaliseSeoIntake(intake = {}) {
  const allConfirmedServices = splitList(intake.confirmedServices || intake.services, 100);
  const services = allConfirmedServices.slice(0, MAX_CORE_SERVICES);
  const omittedServices = allConfirmedServices.slice(MAX_CORE_SERVICES);
  const primaryCity = text(intake.primaryCity, 160) || areaList(intake.serviceAreas, 20)[0] || "";
  const coverageAreas = areaList(intake.coverageAreas, 20);
  if (!coverageAreas.length && primaryCity) coverageAreas.push(primaryCity);
  const serviceRadius = numericRadius(intake.serviceRadius);
  const website = text(intake.website || intake.existingWebsite, 500);
  let websiteUrl = "";
  try {
    const url = new URL(/^https?:/iu.test(website) ? website : `https://${website}`);
    if (["http:", "https:"].includes(url.protocol)) websiteUrl = url.hostname.replace(/^www\./iu, "");
  } catch { /* no existing site to inspect */ }
  return {
    services,
    omittedServices,
    primaryCity,
    serviceRadius,
    coverageAreas,
    metricLocation: text(intake.metricLocation, 180) || metricLocationForCity(primaryCity),
    labsLocation: text(intake.labsLocation, 180) || process.env.SEO_RESEARCH_LABS_LOCATION_NAME || metricLocationForCity(primaryCity),
    coverageEvidence: intake.coverageEvidence || { source: "client_supplied_primary_city", lookups: 0 },
    coverageWarnings: Array.isArray(intake.coverageWarnings) ? intake.coverageWarnings.map((item) => text(item, 300)) : [],
    industry: text(intake.industry, 100),
    businessName: text(intake.businessName || intake.business?.name, 120),
    existingWebsite: websiteUrl,
    phraseProvenance: "confirmed_service_city",
  };
}

function variantsFor(service, city, industry) {
  const variants = [service, `${service} near me`];
  const cityTerm = text(city, 160).replace(/,/gu, " ").replace(/\s+/gu, " ").trim();
  if (cityTerm) variants.push(`${service} ${cityTerm}`);
  variants.push(`${service} cost`);
  const urgent = /plumb|drain|electric|hvac|water damage|restor|garage door|locksmith|roof leak|tree removal|pest/iu.test(`${service} ${industry}`);
  if (urgent) variants.push(`emergency ${service}${cityTerm ? ` ${cityTerm}` : ""}`);
  if (/home-services|professional-services/iu.test(industry) || /repair|installation|painting|restoration|tax preparation|bookkeeping/iu.test(service))
    variants.push(`${service} quote`);
  if (/wellness|care|health/iu.test(industry) && /consultation|treatment|therapy|session|care/iu.test(service))
    variants.push(`${service} appointment`);
  return variants;
}

function defaultSeeds(seo) {
  return [...new Set(seo.services.flatMap((service) => variantsFor(service, seo.primaryCity, seo.industry)))].slice(0, MAX_CORE_SERVICES * MAX_SERVICE_VARIANTS);
}

function findService(query, services) {
  const normalized = keywordKey(query);
  return services.find((service) => normalized.includes(keywordKey(service))) ||
    services.find((service) => {
      const terms = keywordKey(service).split(/\s+/u).filter((term) => term.length > 2);
      return terms.length > 0 && terms.every((term) => normalized.includes(term));
    }) || null;
}

function serviceQuestions(service, industry) {
  const base = [
    `What affects the cost of ${service.toLocaleLowerCase()}?`,
    `What happens during ${service.toLocaleLowerCase()}?`,
    `How should I prepare for ${service.toLocaleLowerCase()}?`,
  ];
  if (/wellness|care|health/iu.test(industry))
    return [`Who may be a good fit for ${service.toLocaleLowerCase()}?`, `What should I ask before choosing ${service.toLocaleLowerCase()}?`, ...base.slice(0, 1)];
  if (/plumb|electric|hvac|restor|roof|garage|home-services/iu.test(industry))
    return [`What signs mean I should ask about ${service.toLocaleLowerCase()}?`, `What details help a team assess ${service.toLocaleLowerCase()}?`, ...base.slice(0, 1)];
  return base;
}

function generalPageQuestionEntries() {
  return [
    { pageId: "home", questions: ["What should I know before choosing a local service provider?", "How do I decide which service fits my situation?"] },
    { pageId: "services-hub", questions: ["Which confirmed service may fit my need?", "What should I ask before arranging a service?"] },
    { pageId: "about", questions: ["What should I look for when choosing a local provider?"] },
    { pageId: "contact", questions: ["What details help the team respond to an enquiry?"] },
  ];
}

function hasCompletePrimaryMetrics(item) {
  return [item?.volume, item?.kd, item?.cpc, item?.competition, item?.intent]
    .every((value) => value !== null && value !== undefined && value !== "");
}

function emptyMap(seo) {
  const pages = [
    { id: "home", pageType: "home", title: seo.businessName || "Home", slug: "/", priority: "high", supportingKeywords: [], fanOutQuestions: [], evidence: [] },
    { id: "services-hub", pageType: "services-hub", title: "Services", slug: "/services/", priority: "high", supportingKeywords: [], fanOutQuestions: [], evidence: [] },
    ...seo.services.map((service) => ({
      id: `service:${slugify(service)}`,
      pageType: "service",
      title: service,
      slug: `/services/${slugify(service)}/`,
      service,
      primaryKeyword: { keyword: `${service}${seo.primaryCity ? ` ${seo.primaryCity}` : ""}`, volume: null, kd: null, cpc: null, competition: null, intent: null, provenance: "confirmed_service_city_not_measured" },
      supportingKeywords: [],
      fanOutQuestions: serviceQuestions(service, seo.industry),
      priority: "medium",
      evidence: [],
    })),
    { id: "about", pageType: "about", title: "About", slug: "/about/", priority: "medium", supportingKeywords: [], fanOutQuestions: [], evidence: [] },
    { id: "contact", pageType: "contact", title: "Contact", slug: "/contact/", priority: "high", supportingKeywords: [], fanOutQuestions: [], evidence: [] },
    { id: "blog-index", pageType: "blog-index", title: "Blog", slug: "/blog/", priority: "low", supportingKeywords: [], fanOutQuestions: [], evidence: [], renderWhenArticlesExist: true },
  ];
  for (const entry of generalPageQuestionEntries()) {
    const page = pages.find((item) => item.id === entry.pageId);
    if (page) page.fanOutQuestions = [...entry.questions];
  }
  return pages;
}

function fallbackQuestionEvidence(seo) {
  return [
    ...seo.services.flatMap((service) => serviceQuestions(service, seo.industry).map((question) => ({
      question,
      pageId: `service:${slugify(service)}`,
      provenance: "reasoned_gap",
    }))),
    ...generalPageQuestionEntries().flatMap((entry) => entry.questions.map((question) => ({
      question,
      pageId: entry.pageId,
      provenance: "reasoned_gap",
    }))),
  ];
}

function finiteResultKeyword(item, provenance) {
  const keyword = text(item?.keyword || item?.keyword_data?.keyword, 180);
  const source = item?.keyword_info || item?.keyword_data?.keyword_info || {};
  const intentInfo = item?.search_intent_info || item?.keyword_data?.search_intent_info;
  const intent = text(intentInfo?.main_intent || intentInfo?.label || item?.intent, 40) || null;
  const volume = finiteMetric(source.search_volume ?? item?.searchVolume);
  const cpc = finiteMetric(source.cpc ?? item?.cpc);
  const competition = finiteMetric(source.competition ?? item?.competition);
  return {
    keyword,
    volume,
    kd: null,
    cpc,
    competition,
    intent,
    provenance: [volume, cpc, competition, intent].some((value) => value !== null) ? provenance : "dataforseo_unavailable",
  };
}

function flattenItems(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((result) => Array.isArray(result?.items) ? result.items : result);
}

function makePageMap(seo, metrics, kdByKeyword, serps, questionEvidence) {
  const map = emptyMap(seo);
  const servicePages = [];
  for (const service of seo.services) {
    const matching = metrics.filter((item) => findService(item.keyword, [service]));
    const preferred = matching.find((item) => hasCompletePrimaryMetrics(item) && keywordKey(item.keyword).includes(keywordKey(seo.primaryCity))) ||
      matching.find((item) => hasCompletePrimaryMetrics(item) && (item.intent === "commercial" || item.intent === "transactional")) ||
      matching.find(hasCompletePrimaryMetrics) || matching.find((item) => item.intent === "commercial" || item.intent === "transactional") || matching[0];
    const primary = preferred
      ? { ...preferred, kd: kdByKeyword.get(keywordKey(preferred.keyword)) ?? null }
      : { keyword: `${service}${seo.primaryCity ? ` ${seo.primaryCity}` : ""}`, volume: null, kd: null, cpc: null, competition: null, intent: null, provenance: "confirmed_service_city_not_measured" };
    const support = matching
      .filter((item) => keywordKey(item.keyword) !== keywordKey(primary.keyword))
      .map((item) => ({ ...item, kd: kdByKeyword.get(keywordKey(item.keyword)) ?? null }))
      .slice(0, 12);
    const serviceSerps = serps.filter((item) => keywordKey(item.service) === keywordKey(service));
    const measuredQuestions = serviceSerps.flatMap((item) => item.questions.map((question) => ({
      question,
      pageId: `service:${slugify(service)}`,
      provenance: "dataforseo_people_also_ask",
      query: item.query,
    })));
    const questions = [...new Set([...measuredQuestions.map((item) => item.question), ...serviceQuestions(service, seo.industry)])].slice(0, 8);
    for (const question of questions) {
      if (!questionEvidence.some((item) => item.pageId === `service:${slugify(service)}` && item.question === question)) {
        questionEvidence.push({ question, pageId: `service:${slugify(service)}`, provenance: "reasoned_gap" });
      }
    }
    servicePages.push({
      id: `service:${slugify(service)}`,
      pageType: "service",
      title: service,
      slug: `/services/${slugify(service)}/`,
      service,
      primaryKeyword: primary,
      supportingKeywords: support,
      fanOutQuestions: questions,
      priority: primary.volume === null ? "medium" : primary.volume > 0 ? "high" : "low",
      evidence: [
        ...serviceSerps.map((serp) => ({ type: "organic_serp", query: serp.query, results: serp.results.map(({ position, title, url, domain }) => ({ position, title, url, domain })) })),
        ...measuredQuestions.map((item) => ({ type: "people_also_ask", question: item.question, query: item.query, provenance: item.provenance })),
      ],
    });
  }
  map.splice(2, seo.services.length, ...servicePages);
  return map;
}

function aggregateCompetitors(serps) {
  const domains = new Map();
  for (const serp of serps) for (const result of serp.results) {
    const domain = text(result.domain, 180).toLocaleLowerCase().replace(/^www\./u, "");
    if (!domain) continue;
    if (!domains.has(domain)) domains.set(domain, { domain, queries: [], results: [], pagePatterns: [] });
    const competitor = domains.get(domain);
    competitor.queries.push(serp.query);
    competitor.results.push({ query: serp.query, position: result.position, title: result.title, url: result.url });
    try {
      const path = new URL(result.url).pathname;
      const locationPattern = /\/(?:locations?|areas?|cities|service-area)(?:\/|$)|\/(?:[a-z-]+-(?:wa|ca|tx|fl|ny))(?:\/|$)/iu.test(path);
      const servicePattern = /\/(?:services?|repairs?|installations?|cleaning|consultations?|treatments?|restoration)(?:\/|$)/iu.test(path);
      if (locationPattern) competitor.pagePatterns.push("location-oriented page path");
      if (servicePattern) competitor.pagePatterns.push("service-oriented page path");
    } catch { /* ignore invalid provider URL */ }
  }
  return [...domains.values()]
    .map((item) => ({ ...item, queries: [...new Set(item.queries)], pagePatterns: [...new Set(item.pagePatterns)] }))
    .sort((a, b) => b.results.length - a.results.length || a.domain.localeCompare(b.domain))
    .slice(0, 6);
}

function makeBlogOpportunities(metrics, questionEvidence) {
  const informational = metrics.filter((item) => item.intent === "informational" && item.provenance.startsWith("dataforseo"));
  const candidates = [
    ...informational.map((item) => ({ title: `A practical guide to ${item.keyword}`, keyword: item.keyword, keywordMetrics: item, provenance: item.metricSources?.intent ? "dataforseo_search_intent" : item.provenance, evidence: [{ query: item.keyword, volume: item.volume, intent: item.intent, metricSources: item.metricSources || null }] })),
    ...questionEvidence.filter((item) => item.provenance === "dataforseo_people_also_ask").map((item) => ({ title: item.question, keyword: null, provenance: item.provenance, evidence: [{ query: item.query, question: item.question }] })),
  ];
  const seen = new Set();
  return candidates.filter((item) => {
    const key = item.title.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map((item, index) => ({
    id: `blog-opportunity:${index + 1}`,
    pageType: "blog-opportunity",
    slug: `/blog/${slugify(item.title)}/`,
    priority: index < 2 ? "medium" : "low",
    renderWhenArticlesExist: true,
    supportingKeywords: item.keyword ? [{
      keyword: item.keyword,
      volume: item.keywordMetrics?.volume ?? null,
      kd: item.keywordMetrics?.kd ?? null,
      cpc: item.keywordMetrics?.cpc ?? null,
      competition: item.keywordMetrics?.competition ?? null,
      intent: "informational",
      provenance: item.provenance,
    }] : [],
    fanOutQuestions: [],
    ...item,
  }));
}

function boundedOptions(options) {
  const requestedTasks = Number(options.maxTasks ?? DEFAULT_MAX_TASKS);
  const requestedUsd = Number(options.maxUsd ?? DEFAULT_MAX_USD);
  return {
    maxTasks: Math.max(0, Math.min(HARD_MAX_TASKS, Number.isFinite(requestedTasks) ? requestedTasks : DEFAULT_MAX_TASKS)),
    maxUsd: Math.max(0, Math.min(HARD_MAX_USD, Number.isFinite(requestedUsd) ? requestedUsd : DEFAULT_MAX_USD)),
    reserveUsd: Math.max(0, Number(options.reserveUsd ?? 0.015)),
  };
}

export async function researchSiteContext(intake = {}, options = {}) {
  const seo = normaliseSeoIntake(intake);
  const limits = boundedOptions(options);
  const seeds = defaultSeeds(seo);
  const warnings = [];
  warnings.push(...seo.coverageWarnings);
  if (seo.omittedServices.length)
    warnings.push(`Only the first ${MAX_CORE_SERVICES} client-confirmed services were researched; review the additional confirmed services before generation: ${seo.omittedServices.join(", ")}.`);
  const stageCosts = [];
  const pageMap = emptyMap(seo);
  const base = {
    version: 2,
    mode: "context-only",
    publishReady: false,
    generatedAt: new Date().toISOString(),
    metricLocation: seo.metricLocation,
    labsMetricLocation: seo.labsLocation,
    coverageAreas: seo.coverageAreas,
    coverageEvidence: seo.coverageEvidence,
    seedQueries: seeds,
    validatedQueries: seeds.map((keyword) => ({ keyword, volume: null, kd: null, cpc: null, competition: null, intent: null, provenance: "dataforseo_unavailable", metricSources: { volume: null, kd: null, cpc: null, competition: null, intent: null } })),
    pageMap,
    competitors: [],
    questionEvidence: fallbackQuestionEvidence(seo),
    fanOutQuestionGroups: pageMap.filter((page) => page.fanOutQuestions.length > 0).map((page) => ({ pageId: page.id, questions: page.fanOutQuestions.map((question) => ({ question, provenance: "reasoned_gap" })) })),
    blogOpportunities: [],
    quickWins: [],
    evidence: [],
    completeness: { keywordOverview: false, searchIntent: false, keywordDifficulty: false, serviceMetrics: [], serviceSerps: 0, serviceSerpsRequired: seo.services.length, competitors: 0 },
    marketSnapshot: { primaryCity: seo.primaryCity, coverageAreas: seo.coverageAreas, confirmedServices: seo.services, metricLocation: seo.metricLocation, labsMetricLocation: seo.labsLocation, queriedKeywords: seeds.length, measuredKeywords: 0, competitorDomains: 0 },
    cost: { tasks: 0, usd: 0, limitUsd: limits.maxUsd, overBudget: false, complete: true, unreportedTasks: 0, stageCosts },
    warnings,
  };
  if (!seo.services.length) {
    warnings.push("Research needs at least one client-confirmed service.");
    return { ...base, mode: "baseline" };
  }
  if (!seo.primaryCity) warnings.push("No confirmed primary city was supplied; city-specific queries were not generated.");
  if (!options.dataForSeo) {
    warnings.push("DataForSEO is unavailable; provider metrics and competitor evidence are recorded as unavailable.");
    return base;
  }

  const cost = { tasks: 0, usd: 0, overBudget: false, complete: true, unreportedTasks: 0 };
  let stoppedForBudget = false;
  async function paidTask(stage, method, args) {
    if (typeof method !== "function") {
      warnings.push(`${stage} research is unavailable from the configured provider client.`);
      stageCosts.push({ stage, tasks: 0, usd: 0, status: "unavailable" });
      return { ok: false, skipped: false, value: null };
    }
    if (stoppedForBudget || cost.tasks >= limits.maxTasks || limits.maxUsd - cost.usd < limits.reserveUsd) {
      stoppedForBudget = true;
      warnings.push(`Research stopped at the configured task budget or cost cap before ${stage}.`);
      stageCosts.push({ stage, tasks: 0, usd: 0, status: "budget_skipped" });
      return { ok: false, skipped: true, value: null };
    }
    cost.tasks += 1;
    try {
      const value = await method(args);
      const rawCost = finiteMetric(value?.cost);
      if (rawCost === null || rawCost < 0) {
        cost.complete = false;
        cost.unreportedTasks += 1;
        stoppedForBudget = true;
        stageCosts.push({ stage, tasks: 1, usd: null, status: "cost_unavailable" });
        warnings.push(`${stage} returned data without provider-reported spend; no further paid tasks were started and production publishing remains blocked.`);
        return { ok: true, skipped: false, value };
      }
      const providerCost = roundCost(rawCost);
      cost.usd = roundCost(cost.usd + providerCost);
      stageCosts.push({ stage, tasks: 1, usd: providerCost, status: "complete" });
      if (cost.usd > limits.maxUsd) {
        cost.overBudget = true;
        stoppedForBudget = true;
        warnings.push(`Provider-reported spend is $${cost.usd.toFixed(5)}, above the configured cost cap of $${limits.maxUsd.toFixed(5)}; no further paid tasks were started.`);
      }
      return { ok: true, skipped: false, value };
    } catch (error) {
      cost.complete = false;
      cost.unreportedTasks += 1;
      stoppedForBudget = true;
      stageCosts.push({ stage, tasks: 1, usd: null, status: "failed" });
      warnings.push(`${stage} research unavailable: ${text(error instanceof Error ? error.message : error, 300)}`);
      return { ok: false, skipped: false, value: null };
    }
  }

  function returnPartialResearch() {
    base.cost = { ...cost, limitUsd: limits.maxUsd, stageCosts };
    base.warnings = [...new Set(warnings)];
    return base;
  }

  const volumeStage = await paidTask("local_search_volume", options.dataForSeo.googleSearchVolume, {
    keywords: seeds,
    locationName: seo.metricLocation,
  });
  const volumeRows = volumeStage.ok ? flattenItems(volumeStage.value?.keywords || volumeStage.value?.items || []) : [];
  const volumeByKeyword = new Map(volumeRows.map((item) => {
    const keyword = text(item.keyword, 180);
    return [keywordKey(keyword), {
      volume: finiteMetric(item.searchVolume ?? item.search_volume),
      cpc: finiteMetric(item.cpc),
      competition: finiteMetric(item.competition),
    }];
  }).filter(([keyword]) => keyword));
  base.completeness.keywordOverview = volumeStage.ok && [...volumeByKeyword.values()].some((item) =>
    [item.volume, item.cpc, item.competition].some((value) => value !== null),
  );
  base.validatedQueries = seeds.map((keyword) => {
    const local = volumeByKeyword.get(keywordKey(keyword));
    const sources = {
      volume: local?.volume !== null && local?.volume !== undefined ? "dataforseo_google_ads_location" : null,
      kd: null,
      cpc: local?.cpc !== null && local?.cpc !== undefined ? "dataforseo_google_ads_location" : null,
      competition: local?.competition !== null && local?.competition !== undefined ? "dataforseo_google_ads_location" : null,
      intent: null,
    };
    const known = Object.values(sources).some(Boolean);
    return {
      keyword,
      volume: local?.volume ?? null,
      kd: null,
      cpc: local?.cpc ?? null,
      competition: local?.competition ?? null,
      intent: null,
      provenance: known ? "dataforseo_metric_partial" : "dataforseo_unavailable",
      metricSources: sources,
    };
  });
  base.marketSnapshot.measuredKeywords = base.validatedQueries.filter((item) => item.metricSources?.volume).length;
  if (!volumeStage.ok) warnings.push("Required local keyword volume, CPC, and competition research is incomplete; publication remains blocked.");
  if (volumeStage.ok && seeds.some((keyword) => !volumeByKeyword.has(keywordKey(keyword))))
    warnings.push("Some planned local keywords were absent from the provider response; their metrics remain null.");
  if (!volumeStage.ok || cost.overBudget || stoppedForBudget) return returnPartialResearch();

  const intentStage = await paidTask("search_intent", options.dataForSeo.searchIntent, { keywords: seeds });
  const intentRows = intentStage.ok ? flattenItems(intentStage.value?.keywords || intentStage.value?.items || []) : [];
  const intentByKeyword = new Map(intentRows.map((item) => [
    keywordKey(item.keyword),
    text(item.intent || item.keyword_intent?.label, 40) || null,
  ]).filter(([keyword]) => keyword));
  base.completeness.searchIntent = intentStage.ok && [...intentByKeyword.values()].some(Boolean);
  if (!intentStage.ok) warnings.push("Required measured search intent research is incomplete; publication remains blocked.");
  if (cost.overBudget || stoppedForBudget) {
    base.validatedQueries = seeds.map((keyword) => {
      const previous = base.validatedQueries.find((item) => keywordKey(item.keyword) === keywordKey(keyword));
      const intent = intentByKeyword.get(keywordKey(keyword)) ?? null;
      const metricSources = { ...(previous?.metricSources || {}), intent: intent ? "dataforseo_labs_search_intent" : null };
      return {
        ...previous,
        intent,
        metricSources,
        provenance: Object.values(metricSources).every(Boolean) ? "dataforseo" : previous?.provenance || "dataforseo_unavailable",
      };
    });
    return returnPartialResearch();
  }

  const difficultyStage = await paidTask("bulk_keyword_difficulty", options.dataForSeo.bulkKeywordDifficulty, {
    keywords: seeds,
    locationName: seo.labsLocation,
    languageCode: "en",
  });
  const difficultyRows = difficultyStage.ok ? flattenItems(difficultyStage.value?.keywords || difficultyStage.value?.items || []) : [];
  const kdByKeyword = new Map(difficultyRows.map((item) => [keywordKey(item.keyword), finiteMetric(item.difficulty ?? item.keywordDifficulty ?? item.keyword_difficulty)]));
  base.completeness.keywordDifficulty = difficultyStage.ok && [...kdByKeyword.values()].some((value) => value !== null);
  if (!difficultyStage.ok) warnings.push("Required Keyword Difficulty evidence is incomplete; publication remains blocked.");
  const metrics = seeds.map((keyword) => {
    const local = volumeByKeyword.get(keywordKey(keyword));
    const intent = intentByKeyword.get(keywordKey(keyword)) ?? null;
    const kd = kdByKeyword.get(keywordKey(keyword)) ?? null;
    const values = [local?.volume ?? null, local?.cpc ?? null, local?.competition ?? null, intent, kd];
    const metricSources = {
      volume: local?.volume !== null && local?.volume !== undefined ? "dataforseo_google_ads_location" : null,
      cpc: local?.cpc !== null && local?.cpc !== undefined ? "dataforseo_google_ads_location" : null,
      competition: local?.competition !== null && local?.competition !== undefined ? "dataforseo_google_ads_location" : null,
      intent: intent ? "dataforseo_labs_search_intent" : null,
      kd: kd !== null ? "dataforseo_labs_bulk_keyword_difficulty" : null,
    };
    const provenance = values.some((value) => value !== null)
      ? values.every((value) => value !== null) ? "dataforseo" : "dataforseo_metric_partial"
      : "dataforseo_unavailable";
    return {
      keyword,
      volume: local?.volume ?? null,
      kd,
      cpc: local?.cpc ?? null,
      competition: local?.competition ?? null,
      intent,
      provenance,
      metricSources,
    };
  });
  base.validatedQueries = metrics;
  const serviceMetricCoverage = seo.services.map((service) => {
    const matching = metrics.filter((item) => findService(item.keyword, [service]));
    const completePrimary = matching.find((item) => hasCompletePrimaryMetrics(item) && keywordKey(item.keyword).includes(keywordKey(seo.primaryCity))) ||
      matching.find((item) => hasCompletePrimaryMetrics(item) && (item.intent === "commercial" || item.intent === "transactional")) ||
      matching.find(hasCompletePrimaryMetrics) || null;
    return { service, complete: Boolean(completePrimary), primaryKeyword: completePrimary?.keyword || null };
  });
  base.completeness.serviceMetrics = serviceMetricCoverage;
  if (serviceMetricCoverage.some((item) => !item.complete))
    warnings.push("One or more confirmed services lack a primary query with measured volume, CPC, competition, Keyword Difficulty, and intent; production publishing remains blocked.");
  if (cost.overBudget || stoppedForBudget) return returnPartialResearch();

  const allSerps = [];
  const servicesForSerp = seo.services.slice(0, 5);
  for (const service of servicesForSerp) {
    const query = `${service}${seo.primaryCity ? ` ${seo.primaryCity}` : ""}`;
    const stage = await paidTask(`organic_serp:${slugify(service)}`, options.dataForSeo.organicSerp, {
      keyword: query,
      locationName: metricLocationForCity(seo.primaryCity, seo.metricLocation),
      languageCode: "en",
    });
    if (!stage.ok) continue;
    const value = stage.value || {};
    allSerps.push({
      service,
      query: text(value.query || query, 180),
      results: (Array.isArray(value.results) ? value.results : []).map((item) => ({
        position: finiteMetric(item.position ?? item.rank_group ?? item.rank_absolute),
        title: text(item.title, 180),
        url: safeHttpsUrl(item.url),
        domain: text(item.domain || safeDomain(item.url), 180).toLocaleLowerCase().replace(/^www\./u, ""),
      })).filter((item) => item.position !== null && item.title && item.url && item.domain).slice(0, 10),
      questions: (Array.isArray(value.questions) ? value.questions : []).map((item) => text(item, 180)).filter(Boolean).slice(0, 12),
    });
    base.completeness.serviceSerps += 1;
  }
  base.completeness.competitors = aggregateCompetitors(allSerps).length;
  if (base.completeness.serviceSerps < seo.services.length)
    warnings.push("One or more confirmed services are missing a successful local SERP snapshot.");
  if (base.completeness.competitors < 3)
    warnings.push("Fewer than three distinct ranking competitor domains were found in the returned SERPs.");

  const relatedRows = [];
  for (const service of seo.services.slice(0, 5)) {
    if (stoppedForBudget) break;
    const query = `${service}${seo.primaryCity ? ` ${seo.primaryCity}` : ""}`;
    const stage = await paidTask(`related_keywords:${slugify(service)}`, options.dataForSeo.relatedKeywords, {
      keyword: query,
      locationName: seo.labsLocation,
      languageCode: "en",
    });
    if (!stage.ok) continue;
    for (const item of flattenItems(stage.value?.keywords || stage.value?.items || [])) {
      const mapped = finiteResultKeyword(item, "dataforseo_related_keywords");
      if (mapped.keyword && findService(mapped.keyword, [service])) relatedRows.push(mapped);
    }
  }
  const combinedMetrics = [...metrics];
  for (const row of relatedRows) {
    if (!combinedMetrics.some((item) => keywordKey(item.keyword) === keywordKey(row.keyword))) combinedMetrics.push(row);
  }

  let quickWins = [];
  let rankingStageComplete = false;
  if (seo.existingWebsite && !stoppedForBudget) {
    const stage = await paidTask("ranked_keywords", options.dataForSeo.rankedKeywords, {
      target: seo.existingWebsite,
      locationName: seo.labsLocation,
      languageCode: "en",
    });
    if (stage.ok) {
      rankingStageComplete = true;
      quickWins = flattenItems(stage.value?.keywords || stage.value?.items || []).map((item) => {
        const ranked = item.ranked_serp_element?.serp_item || {};
        return {
          keyword: text(item.keyword || item.keyword_data?.keyword, 180),
          currentPosition: finiteMetric(item.position ?? ranked.rank_group ?? ranked.rank_absolute),
          title: text(item.title || ranked.title, 180),
          url: safeHttpsUrl(item.url || ranked.url),
          volume: finiteMetric(item.searchVolume ?? item.keyword_info?.search_volume ?? item.keyword_data?.keyword_info?.search_volume),
          provenance: "dataforseo_ranked_keywords",
        };
      }).filter((item) => item.keyword && item.currentPosition !== null && item.url && item.currentPosition >= 4 && item.currentPosition <= 20).slice(0, 10);
    }
  }
  base.quickWins = quickWins;
  base.completeness.existingWebsiteRankings = seo.existingWebsite ? rankingStageComplete : null;

  const questionEvidence = [];
  for (const serp of allSerps) for (const question of serp.questions)
    questionEvidence.push({ question, pageId: `service:${slugify(serp.service)}`, provenance: "dataforseo_people_also_ask", query: serp.query });
  for (const service of seo.services) for (const question of serviceQuestions(service, seo.industry))
    questionEvidence.push({ question, pageId: `service:${slugify(service)}`, provenance: "reasoned_gap" });
  for (const { pageId, questions } of generalPageQuestionEntries()) for (const question of questions)
    questionEvidence.push({ question, pageId, provenance: "reasoned_gap" });
  const uniqueQuestions = [...new Map(questionEvidence.map((item) => [`${item.pageId}:${item.question.toLocaleLowerCase()}`, item])).values()];
  base.questionEvidence = uniqueQuestions;
  base.fanOutQuestionGroups = ["home", "services-hub", ...seo.services.map((service) => `service:${slugify(service)}`), "about", "contact"]
    .map((pageId) => ({
      pageId,
      questions: uniqueQuestions.filter((item) => item.pageId === pageId).map(({ question, provenance, query }) => ({ question, provenance, ...(query ? { query } : {}) })),
    }));
  const servicePageMap = makePageMap(seo, combinedMetrics, kdByKeyword, allSerps, uniqueQuestions);
  for (const page of servicePageMap)
    page.fanOutQuestions = uniqueQuestions.filter((item) => item.pageId === page.id).map((item) => item.question);
  base.blogOpportunities = makeBlogOpportunities(combinedMetrics, uniqueQuestions);
  if (base.blogOpportunities.length < 3)
    warnings.push("Fewer than three evidence-backed informational topics were returned; no unsupported blog topics were added.");
  base.pageMap = [...servicePageMap, ...base.blogOpportunities];
  base.competitors = aggregateCompetitors(allSerps);
  base.serpPatterns = allSerps.flatMap((serp) => serp.results.map((result) => ({ query: serp.query, ...result })));
  base.marketSnapshot = {
    primaryCity: seo.primaryCity,
    coverageAreas: seo.coverageAreas,
    confirmedServices: seo.services,
    metricLocation: seo.metricLocation,
    labsMetricLocation: seo.labsLocation,
    queriedKeywords: metrics.length,
    measuredKeywords: metrics.filter((item) => item.provenance === "dataforseo").length,
    competitorDomains: base.competitors.length,
  };
  base.evidence = [
    { type: "local_search_volume", queries: metrics.filter((item) => item.metricSources?.volume).map((item) => item.keyword), metricLocation: seo.metricLocation, provenance: "DataForSEO Google Ads" },
    { type: "search_intent", queries: metrics.filter((item) => item.metricSources?.intent).map((item) => item.keyword), provenance: "DataForSEO Labs" },
    { type: "keyword_difficulty", metricLocation: seo.labsLocation, provenance: "DataForSEO Labs" },
    ...allSerps.map((serp) => ({ type: "organic_serp", query: serp.query, resultCount: serp.results.length, provenance: "DataForSEO" })),
    ...relatedRows.map((item) => ({ type: "related_keyword", query: item.keyword, provenance: item.provenance })),
    ...(rankingStageComplete ? [{ type: "ranked_keywords", target: seo.existingWebsite, resultCount: quickWins.length, provenance: "DataForSEO" }] : []),
  ];
  const requiredResearchComplete =
    Boolean(seo.primaryCity) &&
    base.completeness.keywordOverview &&
    base.completeness.searchIntent &&
    base.completeness.keywordDifficulty &&
    serviceMetricCoverage.every((item) => item.complete) &&
    base.completeness.serviceSerps === seo.services.length &&
    base.completeness.competitors >= 3 &&
    !cost.overBudget && cost.complete && cost.unreportedTasks === 0;
  base.publishReady = requiredResearchComplete;
  base.mode = requiredResearchComplete ? "researched" : "context-only";
  if (!requiredResearchComplete)
    warnings.push("The complete measured market map is not ready for production publishing; this site may be reviewed but publish approval remains blocked.");
  base.cost = { ...cost, limitUsd: limits.maxUsd, stageCosts };
  base.warnings = [...new Set(warnings)];
  return base;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(text(value, 1000));
    if (url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function safeDomain(value) {
  try { return new URL(text(value, 1000)).hostname; } catch { return ""; }
}

export function createDataForSeoClient({ login, password, fetchImpl = fetch }) {
  if (!login || !password) throw new Error("DataForSEO credentials are required.");
  const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
  async function post(path, payload) {
    const response = await fetchImpl(`https://api.dataforseo.com${path}`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify([payload]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`DataForSEO returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.status_code !== 20000 || body.tasks_error)
      throw new Error(text(body.status_message || "DataForSEO task failed.", 300));
    const task = body.tasks?.[0];
    if (!task || task.status_code !== 20000)
      throw new Error(text(task?.status_message || "DataForSEO task failed.", 300));
    return { body, task, cost: finiteMetric(body.cost ?? task.cost) };
  }
  const locationFields = (locationName, languageCode) => ({
    ...(locationName ? { location_name: locationName } : { location_code: 2840 }),
    language_code: languageCode || "en",
  });
  return {
    async googleSearchVolume({ keywords, locationName }) {
      const { task, cost } = await post("/v3/keywords_data/google_ads/search_volume/live", {
        keywords,
        location_name: locationName,
      });
      return {
        cost,
        keywords: flattenItems(task.result).map((item) => ({
          keyword: item.keyword,
          searchVolume: item.search_volume,
          cpc: item.cpc,
          competition: item.competition,
        })),
      };
    },
    async searchIntent({ keywords }) {
      const { task, cost } = await post("/v3/dataforseo_labs/google/search_intent/live", { keywords });
      return {
        cost,
        keywords: flattenItems(task.result).map((item) => ({
          keyword: item.keyword,
          intent: item.keyword_intent?.label,
          probability: item.keyword_intent?.probability,
        })),
      };
    },
    async bulkKeywordDifficulty({ keywords, locationName, languageCode }) {
      const { task, cost } = await post("/v3/dataforseo_labs/google/bulk_keyword_difficulty/live", {
        keywords,
        ...locationFields(locationName, languageCode),
      });
      return {
        cost,
        keywords: flattenItems(task.result).map((item) => ({
          keyword: item.keyword,
          difficulty: item.keyword_difficulty,
        })),
      };
    },
    async organicSerp({ keyword, locationName, languageCode }) {
      const { task, cost } = await post("/v3/serp/google/organic/live/advanced", {
        keyword,
        location_name: locationName || "United States",
        language_code: languageCode || "en",
        depth: 10,
      });
      const items = task.result?.[0]?.items || [];
      return {
        cost,
        query: keyword,
        results: items.filter((item) => item.type === "organic").map((item) => ({
          position: item.rank_group ?? item.rank_absolute,
          title: item.title,
          url: item.url,
          domain: item.domain,
        })),
        questions: items.filter((item) => item.type === "people_also_ask").flatMap((item) => item.items || []).map((item) => item.title),
      };
    },
    async relatedKeywords({ keyword, locationName, languageCode }) {
      const { task, cost } = await post("/v3/dataforseo_labs/google/related_keywords/live", {
        keyword,
        ...locationFields(locationName, languageCode),
        depth: 1,
        limit: 20,
      });
      return {
        cost,
        keywords: flattenItems(task.result).map((item) => ({
          keyword: item.keyword_data?.keyword,
          keyword_info: item.keyword_data?.keyword_info,
          search_intent_info: item.keyword_data?.search_intent_info,
        })),
      };
    },
    async rankedKeywords({ target, locationName, languageCode }) {
      const { task, cost } = await post("/v3/dataforseo_labs/google/ranked_keywords/live", {
        target,
        ...locationFields(locationName, languageCode),
        limit: 100,
        load_rank_absolute: true,
      });
      return { cost, keywords: flattenItems(task.result) };
    },
  };
}

function extractIntake(body) {
  const match = body.match(/```json\s*([\s\S]*?)\s*```/iu);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

export function renderSeoMapMarkdown(dossier) {
  const pages = dossier.pageMap || [];
  const spend = Number(dossier.cost?.usd || 0).toFixed(5);
  const spendSummary = dossier.cost?.complete === false
    ? `$${spend} known; spend unavailable for ${dossier.cost?.unreportedTasks || 1} task(s)`
    : `$${spend} reported across ${dossier.cost?.tasks || 0} tasks`;
  const lines = [
    `# SEO Market Map: ${dossier.marketSnapshot?.primaryCity || "Location unavailable"}`,
    "",
    `Research status: **${dossier.mode}**${dossier.publishReady ? " (ready for publication approval)" : " (publication blocked)"}`,
    `Metric location: ${dossier.metricLocation || "unavailable"}`,
    "",
    "## A. Market snapshot",
    "",
    `Confirmed services: ${(dossier.marketSnapshot?.confirmedServices || []).join(", ") || "none"}`,
    `Coverage communities (facts, not automatic pages): ${(dossier.marketSnapshot?.coverageAreas || []).join(", ") || "primary city only"}`,
    `Keyword metrics measured: ${dossier.marketSnapshot?.measuredKeywords || 0}/${dossier.marketSnapshot?.queriedKeywords || 0}`,
    `DataForSEO provider-reported spend: ${spendSummary} (cap $${Number(dossier.cost?.limitUsd || 0).toFixed(2)}).`,
    "",
    "## B. Competitors and structural observations",
    "",
  ];
  if (!dossier.competitors?.length) lines.push("No ranking competitor evidence was available.");
  for (const competitor of dossier.competitors || []) {
    lines.push(`- **${competitor.domain}**${competitor.pagePatterns?.length ? `: ${competitor.pagePatterns.join("; ")}` : ""}`);
    for (const result of competitor.results.slice(0, 3)) lines.push(`  - ${result.query}: position ${result.position}, [${result.title}](${result.url})`);
  }
  lines.push("", "## C. Keyword-to-page map", "");
  for (const page of pages) {
    const primary = page.primaryKeyword;
    lines.push(`### ${page.title} (${page.slug})`);
    if (primary) lines.push(`- Primary: ${primary.keyword} | volume ${primary.volume ?? "unavailable"} | KD ${primary.kd ?? "unavailable"} | CPC ${primary.cpc ?? "unavailable"} | competition ${primary.competition ?? "unavailable"} | intent ${primary.intent ?? "unavailable"} | ${primary.provenance}`);
    if (page.supportingKeywords?.length) lines.push(`- Supporting: ${page.supportingKeywords.map((item) => `${item.keyword} (${item.volume ?? "n/a"}, ${item.provenance})`).join("; ")}`);
  }
  lines.push("", "## D. Fan-out questions by page", "");
  for (const group of dossier.fanOutQuestionGroups || []) {
    lines.push(`### ${group.pageId}`);
    for (const question of group.questions) lines.push(`- ${question.question} (${question.provenance}${question.query ? `: ${question.query}` : ""})`);
  }
  lines.push("", "## E. Recommended build-order sitemap", "");
  for (const page of pages) if (page.pageType !== "blog-opportunity") lines.push(`- ${page.slug} — ${page.title}${page.renderWhenArticlesExist ? " (render only when articles exist)" : ""}`);
  lines.push("", "## F. Blog/content opportunities", "");
  for (const opportunity of dossier.blogOpportunities || []) lines.push(`- ${opportunity.title} (${opportunity.provenance})`);
  if (!dossier.blogOpportunities?.length) lines.push("No evidence-backed informational opportunities were available.");
  lines.push("", "## G. Research warnings and missing evidence", "");
  for (const warning of dossier.warnings || []) lines.push(`- ${warning}`);
  if (!dossier.warnings?.length) lines.push("- None.");
  lines.push("", "## H. Provider-reported research cost", "", `- ${dossier.cost?.tasks || 0} DataForSEO tasks; ${spendSummary}; configured cap $${Number(dossier.cost?.limitUsd || 0).toFixed(5)}.${dossier.cost?.overBudget ? " Provider reported an overrun on the final task." : ""}`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const argumentValue = (flag) => {
    const index = process.argv.indexOf(flag);
    const value = index >= 0 ? process.argv[index + 1] : "";
    return value && !value.startsWith("--") ? value : "";
  };
  const source = argumentValue("--source");
  const destination = argumentValue("--out");
  const markdownDestination = argumentValue("--map-out");
  const enrichmentFile = argumentValue("--enrichment");
  if (!source || !destination)
    throw new Error("Usage: node seo-research.mjs --source intake.md --out seo-research.json [--map-out seo-map.md] [--enrichment business-enrichment.json]");
  const intake = extractIntake(await fs.readFile(source, "utf8"));
  if (enrichmentFile) {
    const enrichment = JSON.parse(await fs.readFile(enrichmentFile, "utf8"));
    intake.coverageAreas = enrichment.coverageAreas;
    intake.coverageEvidence = enrichment.coverageEvidence;
    intake.coverageWarnings = enrichment.warnings;
  }
  const login = process.env.DATAFORSEO_LOGIN || process.env.DATAFORSEO_USERNAME;
  const password = process.env.DATAFORSEO_PASSWORD;
  const dataForSeo = login && password ? createDataForSeoClient({ login, password }) : undefined;
  const dossier = await researchSiteContext(intake, {
    dataForSeo,
    maxTasks: Number(process.env.SEO_RESEARCH_MAX_TASKS || DEFAULT_MAX_TASKS),
    maxUsd: Number(process.env.SEO_RESEARCH_MAX_USD || DEFAULT_MAX_USD),
  });
  await fs.writeFile(destination, `${JSON.stringify(dossier, null, 2)}\n`);
  if (markdownDestination) await fs.writeFile(markdownDestination, renderSeoMapMarkdown(dossier));
  console.log(`seo_research_mode=${dossier.mode}`);
  console.log(`seo_research_publish_ready=${dossier.publishReady}`);
  console.log(`seo_research_tasks=${dossier.cost.tasks}`);
  console.log(`seo_research_cost_usd=${dossier.cost.usd}`);
  console.log(`seo_research_competitors=${dossier.competitors.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
