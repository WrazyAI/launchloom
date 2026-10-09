import { routeReadiness } from "./route-inventory.mjs";
import { businessFactReadiness } from "./business-facts.mjs";
export function isAffirmativeConfirmation(value) {
  return value === true || value === "yes" || value === "on";
}
export function seoResearchReadiness(config) {
  if (hasPipelineTest(config))
    return {
      allowed: false,
      mode: "baseline",
      code: "pipeline_test_only",
      error:
        "This is a test-only pipeline preview. Run the full pipeline before approving or publishing it.",
    };
  const facts = businessFactReadiness(config);
  if (!facts.allowed) return { ...facts, mode: "baseline" };
  const routes = routeReadiness(config);
  if (!routes.allowed) return { ...routes, mode: "baseline" };
  const research = config.seoResearch;
  if (!research || typeof research !== "object")
    return { allowed: true, mode: "legacy" };
  // New confirmed-city dossiers must prove readiness for every selected city.
  // Preserve the original policy for older single-city dossiers.
  if (
    research.coverageResearch !== undefined ||
    (research.coverageConfirmation?.status === "confirmed" &&
      research.coverageConfirmation.selectedCount > 0)
  ) {
    const coverage = research.coverageResearch;
    const areas = research.coverageAreas;
    const cities = coverage?.cities;
    const requireAll = coverage?.approvalPolicy === "all-confirmed-cities";
    const valid =
      research.version === 2 &&
      research.mode === "researched" &&
      research.publishReady === true &&
      coverage?.version === 1 &&
      ["primary-city", "all-confirmed-cities"].includes(
        coverage.approvalPolicy,
      ) &&
      Array.isArray(areas) &&
      areas.length > 1 &&
      areas.length <= 251 &&
      areas.every((city) => typeof city === "string" && city.trim()) &&
      new Set(areas).size === areas.length &&
      Array.isArray(coverage.areas) &&
      coverage.areas.length === areas.length &&
      coverage.areas.every((city, index) => city === areas[index]) &&
      Array.isArray(cities) &&
      cities.length === areas.length &&
      cities.every(
        (entry, index) =>
          entry &&
          typeof entry === "object" &&
          entry.city === areas[index] &&
          ["complete", "partial", "pending"].includes(entry.status),
      ) &&
      coverage.complete ===
        cities.every((entry) => entry.status === "complete") &&
      cities[0].status === "complete" &&
      (!requireAll || coverage.complete === true) &&
      (research.mode !== "researched" ||
        (research.cost?.complete === true &&
          research.cost.overBudget !== true)) &&
      cities
        .filter(
          (entry, index) =>
            requireAll || index === 0 || entry.status === "complete",
        )
        .every(
          (entry) =>
            entry.research &&
            entry.research.coverageResearch === undefined &&
            entry.research.marketSnapshot?.primaryCity === entry.city &&
            seoResearchReadiness({
              ...config,
              // The site's route policy was checked above. Per-city research
              // documents are evidence, not separate site configurations.
              routePolicy: undefined,
              routeInventory: undefined,
              pageContent: undefined,
              pageBriefs: undefined,
              pageEvidence: undefined,
              locations: entry.city === areas[0] ? config.locations : [],
              seoResearch: entry.research,
            }).allowed,
        );
    // Retain the original top-level release checks as well as city provenance.
    // Nested proof must not bypass the actual site's page map or spend checks.
    // Cited fallback observations can inform a private diagnostic review, but
    // they do not meet the measured evidence required for production approval.
    const primaryPolicyReady =
      research.mode === "researched" &&
      hasCompleteVersionTwoMap(config, research);
    return valid && primaryPolicyReady
      ? { allowed: true, mode: research.mode }
      : {
          allowed: false,
          mode: "context-only",
          code: "seo_research_required",
          error:
            "Required local research is incomplete. The preview remains available, but publishing is blocked until research succeeds.",
        };
  }

  const { version, mode, publishReady } = research;
  const schemaVersion = version === undefined ? 1 : Number(version);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > 2)
    return {
      allowed: false,
      mode: "baseline",
      code: "seo_research_required",
      error:
        "SEO research is incomplete. The preview remains available, but production publishing is blocked until research succeeds.",
    };
  if (schemaVersion === 1 && mode === "researched" && publishReady === true)
    return { allowed: true, mode };
  if (
    schemaVersion === 2 &&
    mode === "researched" &&
    publishReady === true &&
    hasCompleteVersionTwoMap(config, research)
  )
    return { allowed: true, mode };
  return {
    allowed: false,
    mode: mode === "context-only" ? "context-only" : "baseline",
    code: "seo_research_required",
    error:
      "SEO research is incomplete. The preview remains available, but production publishing is blocked until research succeeds.",
  };
}
export function hasPipelineTest(config) {
  // A malformed or edited marker cannot opt a diagnostic artifact into release.
  return Boolean(config && Object.hasOwn(config, "pipelineTest"));
}
function hasCompleteVersionTwoMap(config, research) {
  const completeness = research.completeness;
  const costs = research.cost;
  const services = Array.isArray(config.services) ? config.services : [];
  const pages = Array.isArray(research.pageMap) ? research.pageMap : [];
  const measuredServices = Array.isArray(completeness?.serviceMetrics)
    ? completeness.serviceMetrics
    : [];
  const competitorCount = Array.isArray(research.competitors)
    ? research.competitors.length
    : 0;
  const cost = Number(costs?.usd);
  const limit = Number(costs?.limitUsd);
  if (
    completeness?.keywordOverview !== true ||
    completeness?.searchIntent !== true ||
    completeness?.keywordDifficulty !== true ||
    completeness?.serviceSerps !== services.length ||
    completeness?.serviceSerpsRequired !== services.length ||
    competitorCount < 3 ||
    costs?.overBudget === true ||
    costs?.complete !== true ||
    Number(costs?.unreportedTasks) !== 0 ||
    !Number.isFinite(cost) ||
    !Number.isFinite(limit) ||
    cost > limit ||
    services.length === 0
  )
    return false;
  const measuredByName = new Map(
    measuredServices.map((item) => [
      String(item.service || "").toLowerCase(),
      item,
    ]),
  );
  const requiredCorePages = new Set([
    "home",
    "services-hub",
    "about",
    "contact",
  ]);
  for (const page of pages)
    requiredCorePages.delete(String(page.pageType || ""));
  if (requiredCorePages.size) return false;
  const servicePages = pages.filter((page) => page.pageType === "service");
  const serviceByName = new Map(
    servicePages.map((page) => [
      String(page.service || "").toLowerCase(),
      page,
    ]),
  );
  if (servicePages.length !== services.length) return false;
  for (const service of services) {
    const name = String(service.name || "").toLowerCase();
    const evidence = measuredByName.get(name);
    const page = serviceByName.get(name);
    const primary = page?.primaryKeyword;
    const sources = primary?.metricSources;
    if (
      evidence?.complete !== true ||
      !primary ||
      primary.keyword !== evidence.primaryKeyword ||
      primary.provenance !== "dataforseo" ||
      typeof primary.volume !== "number" ||
      !Number.isFinite(primary.volume) ||
      typeof primary.kd !== "number" ||
      !Number.isFinite(primary.kd) ||
      typeof primary.cpc !== "number" ||
      !Number.isFinite(primary.cpc) ||
      typeof primary.competition !== "number" ||
      !Number.isFinite(primary.competition) ||
      typeof primary.intent !== "string" ||
      !primary.intent.trim() ||
      !["volume", "kd", "cpc", "competition", "intent"].every((key) =>
        String(sources?.[key] || "").startsWith("dataforseo_"),
      )
    )
      return false;
  }
  const configLocations = Array.isArray(config.locations)
    ? config.locations
    : [];
  const locationPages = pages.filter((page) => page.pageType === "location");
  const mappedLocations = new Set(
    locationPages.map((page) => String(page.slug || "").toLowerCase()),
  );
  if (
    configLocations.length !== mappedLocations.size ||
    configLocations.some(
      (location) =>
        !mappedLocations.has(
          `/locations/${String(location.slug || "").toLowerCase()}/`,
        ),
    )
  )
    return false;
  return true;
}

// Web observations permit human release review, never measured SEO claims.
export function hasCompletedFallbackResearch(research) {
  if (!research || research.version !== 2 || research.mode !== "context-only")
    return false;
  const fallback = research.fallbackSearch;
  const evidence = research.externalSearchEvidence;
  if (
    !fallback ||
    fallback.status !== "complete" ||
    fallback.costComplete !== true ||
    fallback.budgetExhausted !== false ||
    fallback.failedQueries !== 0 ||
    !Number.isInteger(fallback.queriesAttempted) ||
    fallback.queriesAttempted < 1 ||
    !Number.isInteger(fallback.maxQueries) ||
    fallback.maxQueries < fallback.queriesAttempted ||
    fallback.maxQueries > 5 ||
    typeof fallback.costUsd !== "number" ||
    !Number.isFinite(fallback.costUsd) ||
    fallback.costUsd < 0 ||
    typeof fallback.maxUsd !== "number" ||
    !Number.isFinite(fallback.maxUsd) ||
    fallback.maxUsd <= 0 ||
    fallback.costUsd > fallback.maxUsd ||
    !Array.isArray(evidence) ||
    !evidence.length
  )
    return false;
  return evidence.every((item) => {
    if (
      !item ||
      item.provenance !== "external_search_observation" ||
      typeof item.query !== "string" ||
      !item.query.trim() ||
      typeof item.sourceUrl !== "string"
    )
      return false;
    try {
      const url = new URL(item.sourceUrl);
      return (
        url.protocol === "https:" &&
        !!url.hostname &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
}
