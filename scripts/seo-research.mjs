import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseModelJson } from "./model-json.mjs";
import {
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedText,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";

const DEFAULT_MAX_TASKS = 2;
const DEFAULT_MAX_USD = 0.1;
const DEFAULT_MODEL =
  process.env.SEO_RESEARCH_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "z-ai/glm-5.3-flash";

const text = (value, limit = 500) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/—/g, "-")
    .trim()
    .slice(0, limit);

const lines = (value, limit = 12) =>
  text(value, 4_000)
    .split(/\r?\n|,/u)
    .map((item) => text(item, 160))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, limit);

function safeUrl(value) {
  try {
    const url = new URL(text(value, 500));
    if (url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function normaliseSeoIntake(intake = {}) {
  const notSure = text(intake.seoNotSure, 10).toLowerCase() === "yes";
  return {
    priorityService: text(intake.priorityService, 160),
    searchPhrases: notSure ? [] : lines(intake.searchPhrases, 8),
    customerProblems: lines(intake.customerProblems, 8),
    excludedServices: lines(intake.excludedServices, 12),
    priorityLocations: lines(
      intake.priorityLocations || intake.serviceAreas,
      8,
    ),
    competitorUrls: lines(intake.competitorUrls, 3)
      .map(safeUrl)
      .filter(Boolean),
    phraseProvenance: "client_supplied",
    notSure,
  };
}

function defaultSeeds(intake, seo) {
  const services = lines(intake.services, 8);
  const locations = seo.priorityLocations;
  const priority =
    seo.priorityService || services[0] || text(intake.businessName);
  return [
    ...seo.searchPhrases,
    priority,
    locations[0] && priority ? `${priority} ${locations[0]}` : "",
    ...services.slice(0, 3),
  ]
    .map((item) => text(item, 160))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 12);
}

function groundedPageDecisions(intake, seo) {
  const excluded = new Set(
    seo.excludedServices.map((item) => item.toLowerCase()),
  );
  const services = lines(intake.services, 12).filter(
    (service) => !excluded.has(service.toLowerCase()),
  );
  return services.map((service) => ({
    type: "service",
    title: service,
    reason:
      service === seo.priorityService
        ? "Client identified this as the priority service."
        : "Client confirmed this service is offered.",
    provenance: "client_supplied",
  }));
}

function warning(error) {
  return text(error instanceof Error ? error.message : error, 300);
}

function roundCost(value) {
  return Math.round((Number(value) || 0) * 100_000) / 100_000;
}

function validateStrategy(
  candidate,
  allowedQueries,
  allowedServices,
  allowedLocations,
) {
  if (!candidate || typeof candidate !== "object") return null;
  const querySet = new Set(allowedQueries.map((item) => item.toLowerCase()));
  const serviceSet = new Set(allowedServices.map((item) => item.toLowerCase()));
  const locationSet = new Set(
    allowedLocations.map((item) => item.toLowerCase()),
  );
  const copyVocabulary = Array.isArray(candidate.copyVocabulary)
    ? candidate.copyVocabulary
        .map((item) => text(item, 80))
        .filter(Boolean)
        .slice(0, 16)
    : [];
  const customerQuestions = Array.isArray(candidate.customerQuestions)
    ? candidate.customerQuestions
        .map((item) => text(item, 180))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const pageDecisions = Array.isArray(candidate.pageDecisions)
    ? candidate.pageDecisions
        .map((item) => ({
          type: item?.type === "location" ? "location" : "service",
          title: text(item?.title, 160),
          reason: text(item?.reason, 240),
          provenance: "research_strategy",
        }))
        .filter(
          (item) =>
            item.title &&
            (item.type === "location"
              ? locationSet.has(item.title.toLowerCase())
              : serviceSet.has(item.title.toLowerCase())),
        )
        .slice(0, 12)
    : [];
  const validatedQueries = Array.isArray(candidate.validatedQueries)
    ? candidate.validatedQueries
        .map((item) => text(item, 160))
        .filter((item) => querySet.has(item.toLowerCase()))
    : [];
  return { copyVocabulary, customerQuestions, pageDecisions, validatedQueries };
}

export async function researchSiteContext(intake, options = {}) {
  const seo = normaliseSeoIntake(intake);
  const requestedMaxTasks = Number(options.maxTasks ?? DEFAULT_MAX_TASKS);
  const requestedMaxUsd = Number(options.maxUsd ?? DEFAULT_MAX_USD);
  const maxTasks = Math.max(
    0,
    Math.min(
      DEFAULT_MAX_TASKS,
      Number.isFinite(requestedMaxTasks) ? requestedMaxTasks : DEFAULT_MAX_TASKS,
    ),
  );
  const maxUsd = Math.max(
    0,
    Number.isFinite(requestedMaxUsd) ? requestedMaxUsd : DEFAULT_MAX_USD,
  );
  const warnings = [];
  let seeds = defaultSeeds(intake, seo);
  const groundedTerms = [
    ...lines(intake.services, 12),
    ...seo.searchPhrases,
    seo.priorityService,
  ]
    .map((item) => item.toLowerCase())
    .filter(Boolean);
  if (options.model?.plan) {
    try {
      const planned = await options.model.plan({ intake, seo, seeds });
      const plannedSeeds = Array.isArray(planned?.queries)
        ? planned.queries.map((item) => text(item, 160)).filter(Boolean)
        : [];
      const groundedPlannedSeeds = plannedSeeds.filter((query) =>
        groundedTerms.some((term) => query.toLowerCase().includes(term)),
      );
      if (groundedPlannedSeeds.length)
        seeds = [...new Set([...groundedPlannedSeeds, ...seeds])].slice(0, 12);
    } catch (error) {
      warnings.push(`Research planner fallback: ${warning(error)}`);
    }
  }

  const base = {
    version: 1,
    mode: "baseline",
    generatedAt: new Date().toISOString(),
    phraseProvenance: seo.phraseProvenance,
    seedQueries: seeds,
    validatedQueries: [],
    customerQuestions: seo.customerProblems,
    serpPatterns: [],
    copyVocabulary: [],
    pageDecisions: groundedPageDecisions(intake, seo),
    prohibitedClaims: seo.excludedServices,
    evidence: [],
    cost: { tasks: 0, usd: 0, limitUsd: maxUsd },
    warnings,
  };
  if (!seeds.length) {
    warnings.push(
      "The intake did not contain enough service or search context for research.",
    );
    return base;
  }
  if (!options.dataForSeo || maxTasks < 1) {
    warnings.push(
      "DataForSEO is unavailable; the preview uses confirmed intake context only.",
    );
    return { ...base, mode: "context-only" };
  }

  let overview;
  try {
    overview = await options.dataForSeo.keywordOverview({
      keywords: seeds,
      languageCode: "en",
    });
  } catch (error) {
    warnings.push(`Keyword research unavailable: ${warning(error)}`);
    return { ...base, mode: "context-only" };
  }
  const overviewCost = roundCost(overview?.cost);
  if (overviewCost > maxUsd) {
    warnings.push(
      `Keyword research reported $${overviewCost}, above the $${maxUsd} target limit.`,
    );
    return { ...base, mode: "context-only" };
  }
  const keywords = Array.isArray(overview?.keywords) ? overview.keywords : [];
  const validatedQueries = keywords
    .map((item) => ({
      query: text(item?.keyword, 160),
      searchVolume: Number.isFinite(Number(item?.searchVolume))
        ? Number(item.searchVolume)
        : null,
      cpc: Number.isFinite(Number(item?.cpc)) ? Number(item.cpc) : null,
      competition: Number.isFinite(Number(item?.competition))
        ? Number(item.competition)
        : null,
      intent: text(item?.intent, 40) || "unknown",
      provenance: "dataforseo_keyword_overview",
    }))
    .filter((item) => item.query)
    .slice(0, 12);
  const priorityQuery = validatedQueries[0]?.query || seeds[0];
  let serp = null;
  let serpCost = 0;
  const remaining = maxUsd - overviewCost;
  if (maxTasks >= 2 && remaining >= Number(options.serpReserveUsd ?? 0.04)) {
    try {
      serp = await options.dataForSeo.organicSerp({
        keyword: seo.priorityLocations[0]
          ? `${priorityQuery} ${seo.priorityLocations[0]}`
          : priorityQuery,
        languageCode: "en",
      });
      serpCost = roundCost(serp?.cost);
      if (overviewCost + serpCost > maxUsd)
        throw new Error(`SERP research exceeded the $${maxUsd} target limit.`);
    } catch (error) {
      warnings.push(`SERP research unavailable: ${warning(error)}`);
      return {
        ...base,
        mode: "context-only",
        validatedQueries,
        cost: { tasks: 1, usd: overviewCost, limitUsd: maxUsd },
      };
    }
  } else {
    warnings.push(
      "SERP research was skipped to stay within the configured task or cost limit.",
    );
    return {
      ...base,
      mode: "context-only",
      validatedQueries,
      cost: { tasks: 1, usd: overviewCost, limitUsd: maxUsd },
    };
  }

  const serpResults = Array.isArray(serp?.results)
    ? serp.results.slice(0, 8)
    : [];
  const allowedQueries = validatedQueries.map((item) => item.query);
  const services = lines(intake.services, 12);
  let strategy = null;
  if (options.model?.strategize) {
    try {
      strategy = validateStrategy(
        await options.model.strategize({ intake, seo, validatedQueries, serp }),
        allowedQueries,
        services,
        seo.priorityLocations,
      );
    } catch (error) {
      warnings.push(`Research strategist fallback: ${warning(error)}`);
    }
  }
  return {
    ...base,
    mode: "researched",
    validatedQueries,
    customerQuestions: [
      ...seo.customerProblems,
      ...(Array.isArray(serp?.questions) ? serp.questions : []),
      ...(strategy?.customerQuestions || []),
    ]
      .map((item) => text(item, 180))
      .filter(Boolean)
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, 12),
    serpPatterns: serpResults.map((item) => ({
      title: text(item?.title, 180),
      domain: text(item?.domain, 180),
      snippet: text(item?.snippet, 320),
    })),
    copyVocabulary: strategy?.copyVocabulary || [],
    pageDecisions: strategy?.pageDecisions?.length
      ? strategy.pageDecisions
      : base.pageDecisions,
    evidence: [
      {
        type: "keyword_overview",
        queries: allowedQueries,
        provenance: "DataForSEO",
      },
      {
        type: "organic_serp",
        query: text(serp?.query || priorityQuery, 180),
        domains: serpResults
          .map((item) => text(item?.domain, 180))
          .filter(Boolean),
        provenance: "DataForSEO",
      },
    ],
    cost: {
      tasks: 2,
      usd: roundCost(overviewCost + serpCost),
      limitUsd: maxUsd,
    },
  };
}

export function createDataForSeoClient({ login, password, fetchImpl = fetch }) {
  if (!login || !password)
    throw new Error("DataForSEO credentials are required.");
  const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
  async function post(path, payload) {
    const response = await fetchImpl(`https://api.dataforseo.com${path}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`DataForSEO returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.status_code !== 20000 || body.tasks_error)
      throw new Error(
        text(body.status_message || "DataForSEO task failed.", 300),
      );
    const task = body.tasks?.[0];
    if (!task || task.status_code !== 20000)
      throw new Error(
        text(task?.status_message || "DataForSEO task failed.", 300),
      );
    return { body, task, cost: roundCost(body.cost ?? task.cost) };
  }
  return {
    async keywordOverview({ keywords, languageCode }) {
      const { body, task, cost } = await post(
        "/v3/dataforseo_labs/google/keyword_overview/live",
        { keywords, location_code: 2840, language_code: languageCode },
      );
      const items = task.result?.[0]?.items || task.result || [];
      return {
        cost,
        keywords: items.map((item) => ({
          keyword: item.keyword,
          searchVolume: item.keyword_info?.search_volume ?? item.search_volume,
          cpc: item.keyword_info?.cpc ?? item.cpc,
          competition: item.keyword_info?.competition ?? item.competition,
          intent: item.search_intent_info?.main_intent ?? item.search_intent,
        })),
        responseCost: body.cost,
      };
    },
    async organicSerp({ keyword, languageCode }) {
      const { task, cost } = await post(
        "/v3/serp/google/organic/live/advanced",
        {
          keyword,
          location_code: 2840,
          language_code: languageCode,
          depth: 10,
        },
      );
      const result = task.result?.[0] || {};
      const items = Array.isArray(result.items) ? result.items : [];
      return {
        cost,
        query: keyword,
        results: items
          .filter((item) => item.type === "organic")
          .map((item) => ({
            title: item.title,
            domain: item.domain,
            snippet: item.description,
          })),
        questions: items
          .filter((item) => item.type === "people_also_ask")
          .flatMap((item) => item.items || [])
          .map((item) => item.title),
      };
    },
  };
}

function createOpenRouterResearchModel(apiKey, model = DEFAULT_MODEL) {
  async function ask(role, payload) {
    const systemPrompt =
      role === "planner"
        ? "Return JSON with a queries array of at most 12 concise local-search queries. Use only the supplied services, locations, and customer language. Do not invent services, credentials, or claims."
        : "Return JSON with copyVocabulary, customerQuestions, pageDecisions, and validatedQueries. Use only supplied research evidence and confirmed business facts. Page decisions may include only confirmed services or submitted locations. Never invent facts or claims.";
    const intake = payload?.intake || {};
    const sessionId = openRouterSessionId("seo-research", model, {
      businessName: intake.businessName || intake.business?.name || "",
      email: intake.email || intake.business?.email || "",
      phone: intake.phone || intake.business?.phone || "",
      domain: intake.desiredDomain || intake.domain || "",
    });
    const promptCacheKey = openRouterPromptCacheKey(
      `seo-${role}-system`,
      model,
      systemPrompt,
    );
    const response = await openRouterChatCompletion({
      apiKey,
      title: `LaunchLoom SEO ${role}`,
      sessionId,
      body: {
        model,
        ...promptCacheRequestFields(model, promptCacheKey),
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [promptCachedText(model, systemPrompt)],
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok)
      throw new Error(`OpenRouter SEO ${role} returned ${response.status}.`);
    const body = await response.json();
    logOpenRouterCacheUsage(`seo-${role}`, body.usage);
    return parseModelJson(body.choices?.[0]?.message?.content || "{}");
  }
  return {
    plan: (payload) => ask("planner", payload),
    strategize: (payload) => ask("strategist", payload),
  };
}

function extractIntake(body) {
  const match = body.match(/```json\s*([\s\S]*?)\s*```/iu);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

async function main() {
  const source = process.argv[process.argv.indexOf("--source") + 1];
  const destination = process.argv[process.argv.indexOf("--out") + 1];
  if (!source || !destination)
    throw new Error(
      "Usage: node seo-research.mjs --source intake.md --out seo-research.json",
    );
  const intake = extractIntake(await fs.readFile(source, "utf8"));
  const login = process.env.DATAFORSEO_LOGIN || process.env.DATAFORSEO_USERNAME;
  const password = process.env.DATAFORSEO_PASSWORD;
  const dataForSeo =
    login && password ? createDataForSeoClient({ login, password }) : undefined;
  const model = process.env.OPENROUTER_API_KEY
    ? createOpenRouterResearchModel(process.env.OPENROUTER_API_KEY)
    : undefined;
  const dossier = await researchSiteContext(intake, {
    dataForSeo,
    model,
    maxTasks: Number(process.env.SEO_RESEARCH_MAX_TASKS || DEFAULT_MAX_TASKS),
    maxUsd: Number(process.env.SEO_RESEARCH_MAX_USD || DEFAULT_MAX_USD),
  });
  await fs.writeFile(destination, `${JSON.stringify(dossier, null, 2)}\n`);
  console.log(`seo_research_mode=${dossier.mode}`);
  console.log(`seo_research_tasks=${dossier.cost.tasks}`);
  console.log(`seo_research_cost_usd=${dossier.cost.usd}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
