export type SeoResearchReadiness =
  | { allowed: true; mode: "legacy" | "researched" }
  | {
      allowed: false;
      mode: "context-only" | "baseline";
      code: "seo_research_required";
      error: string;
    };

export function isAffirmativeConfirmation(value: unknown): boolean {
  return value === true || value === "yes" || value === "on";
}

export function seoResearchReadiness(
  config: Record<string, unknown>,
): SeoResearchReadiness {
  const research = config.seoResearch;
  if (!research || typeof research !== "object")
    return { allowed: true, mode: "legacy" };
  const { version, mode, publishReady } = research as {
    version?: unknown;
    mode?: unknown;
    publishReady?: unknown;
  };
  const schemaVersion = version === undefined ? 1 : Number(version);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > 2)
    return {
      allowed: false,
      mode: "baseline",
      code: "seo_research_required",
      error: "SEO research is incomplete. The preview remains available, but production publishing is blocked until research succeeds.",
    };
  if (schemaVersion === 1 && mode === "researched" && publishReady === true)
    return { allowed: true, mode };
  if (schemaVersion === 2 && mode === "researched" && publishReady === true && hasCompleteVersionTwoMap(config, research as Record<string, unknown>))
    return { allowed: true, mode };
  return {
    allowed: false,
    mode: mode === "context-only" ? "context-only" : "baseline",
    code: "seo_research_required",
    error:
      "SEO research is incomplete. The preview remains available, but production publishing is blocked until research succeeds.",
  };
}

function hasCompleteVersionTwoMap(config: Record<string, unknown>, research: Record<string, unknown>) {
  const completeness = research.completeness as Record<string, unknown> | undefined;
  const costs = research.cost as Record<string, unknown> | undefined;
  const services = Array.isArray(config.services) ? config.services as Array<Record<string, unknown>> : [];
  const pages = Array.isArray(research.pageMap) ? research.pageMap as Array<Record<string, unknown>> : [];
  const measuredServices = Array.isArray(completeness?.serviceMetrics)
    ? completeness.serviceMetrics as Array<Record<string, unknown>>
    : [];
  const competitorCount = Array.isArray(research.competitors) ? research.competitors.length : 0;
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
  ) return false;

  const measuredByName = new Map(measuredServices.map((item) => [String(item.service || "").toLowerCase(), item]));

  const requiredCorePages = new Set(["home", "services-hub", "about", "contact"]);
  for (const page of pages) requiredCorePages.delete(String(page.pageType || ""));
  if (requiredCorePages.size) return false;

  const servicePages = pages.filter((page) => page.pageType === "service");
  const serviceByName = new Map(servicePages.map((page) => [String(page.service || "").toLowerCase(), page]));
  if (servicePages.length !== services.length) return false;
  for (const service of services) {
    const name = String(service.name || "").toLowerCase();
    const evidence = measuredByName.get(name);
    const page = serviceByName.get(name);
    const primary = page?.primaryKeyword as Record<string, unknown> | undefined;
    const sources = primary?.metricSources as Record<string, unknown> | undefined;
    if (
      evidence?.complete !== true ||
      !primary ||
      primary.keyword !== evidence.primaryKeyword ||
      primary.provenance !== "dataforseo" ||
      typeof primary.volume !== "number" || !Number.isFinite(primary.volume) ||
      typeof primary.kd !== "number" || !Number.isFinite(primary.kd) ||
      typeof primary.cpc !== "number" || !Number.isFinite(primary.cpc) ||
      typeof primary.competition !== "number" || !Number.isFinite(primary.competition) ||
      typeof primary.intent !== "string" || !primary.intent.trim() ||
      !["volume", "kd", "cpc", "competition", "intent"].every((key) => String(sources?.[key] || "").startsWith("dataforseo_"))
    ) return false;
  }

  const configLocations = Array.isArray(config.locations) ? config.locations as Array<Record<string, unknown>> : [];
  const locationPages = pages.filter((page) => page.pageType === "location");
  const mappedLocations = new Set(locationPages.map((page) => String(page.slug || "").toLowerCase()));
  if (configLocations.length !== mappedLocations.size || configLocations.some((location) => !mappedLocations.has(`/locations/${String(location.slug || "").toLowerCase()}/`)))
    return false;
  return true;
}
