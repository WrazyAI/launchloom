// Approval is supplied by an operator/client contract, never inferred from SEO suggestions.
const types = new Set([
  "home",
  "services-hub",
  "service",
  "location",
  "about",
  "contact",
  "faq",
  "privacy",
  "terms",
  "blog-index",
  "blog-article",
]);
const states = new Set(["proposed", "approved", "deferred", "omitted"]);
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const key = (value) => clean(value).toLowerCase().replace(/\s+/gu, " ");
const array = (value) => (Array.isArray(value) ? value : []);
const slug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(clean(value));
const localSources = new Set([
  "verified_business_fact",
  "client_supplied_local_information",
]);
const corePaths = {
  home: "/",
  "services-hub": "/services/",
  about: "/about/",
  contact: "/contact/",
  faq: "/faq/",
  privacy: "/privacy/",
  terms: "/terms/",
  "blog-index": "/blog/",
};
const labels = {
  home: "Home",
  "services-hub": "All services",
  about: "About",
  contact: "Contact",
  faq: "FAQs",
  privacy: "Privacy",
  terms: "Terms",
  "blog-index": "Guides",
};
export function normalizeRoutePath(value) {
  const path = clean(value);
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[?#\\%\s]/u.test(path) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)
  )
    throw new Error("Route path must be a local, unencoded absolute path.");
  if (path === "/") return "/";
  if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/u.test(path))
    throw new Error("Route path contains unsupported characters.");
  return path.replace(/\/$/u, "") + "/";
}
export function compileRouteInventory(config = {}) {
  const explicit =
    config.routePolicy !== undefined ||
    config.routeInventory?.mode === "explicit";
  const policy = config.routePolicy || {};
  const issues = [];
  const decisions = array(policy.decisions);
  if (explicit && (policy.version !== 1 || !Array.isArray(policy.decisions)))
    issues.push("Route policy must be version 1 with explicit decisions.");
  const decisionMap = new Map();
  for (const decision of decisions) {
    if (
      !decision ||
      !types.has(decision.pageType) ||
      !states.has(decision.status)
    ) {
      issues.push("Invalid route approval decision.");
      continue;
    }
    const id = decision.id || `${decision.pageType}:${key(decision.target)}`;
    if (decisionMap.has(id)) issues.push(`Duplicate route decision: ${id}.`);
    decisionMap.set(id, decision);
  }
  const records = [];
  const used = new Set();
  function add(pageType, target, path, source, options = {}) {
    const id = options.id || `${pageType}:${key(target)}`;
    const decision = decisionMap.get(id);
    if (decision) used.add(id);
    let status = decision?.status || options.status || "approved";
    let reason =
      decision?.reason ||
      options.reason ||
      "Existing confirmed content and supported page host.";
    const requestedStatus = status;
    const blocking = [];
    if (pageType === "home" && status !== "approved")
      blocking.push("The homepage is required.");
    if (status === "approved" && options.requirements?.length)
      blocking.push(...options.requirements);
    if (blocking.length) {
      status = "deferred";
      reason = blocking.join(" ");
      issues.push(`${id}: ${reason}`);
    }
    let pathname = "";
    try {
      pathname = normalizeRoutePath(path);
    } catch (error) {
      issues.push(`${id}: ${error.message}`);
      status = "deferred";
    }
    const indexable =
      decision?.indexable !== false && decision?.previewOnly !== true;
    const navigation =
      decision?.navigation ||
      ([
        "services-hub",
        "about",
        "contact",
        "faq",
        "privacy",
        "terms",
        "blog-index",
      ].includes(pageType)
        ? "footer"
        : "contextual");
    if (!["header", "footer", "contextual"].includes(navigation))
      issues.push(`${id}: invalid navigation placement.`);
    records.push({
      id,
      pageType,
      title: options.title || labels[pageType] || target,
      path: pathname,
      source,
      target: target || null,
      visitorQuestion:
        clean(decision?.visitorQuestion) ||
        options.visitorQuestion ||
        `What should I know about ${options.title || labels[pageType] || target}?`,
      intentCluster:
        clean(decision?.intentCluster) ||
        clean(options.map?.primaryKeyword?.keyword) ||
        null,
      admissionRequirements: options.requirements || [],
      approval: {
        status,
        requestedStatus,
        reason,
        evidence: array(decision?.evidence).length
          ? decision.evidence
          : array(options.map?.evidence),
      },
      discovery: {
        navigation,
        internalLinks: [],
        sitemap: status === "approved" && indexable,
        indexable,
        previewOnly: decision?.previewOnly === true,
      },
      canonical: { origin: "approved-build-origin", path: pathname },
      acceptanceChecks: [
        "rendered-content",
        "canonical",
        "indexability",
        "crawlable-links",
        "business-facts",
      ],
      delivery: { generated: false, rendered: false, verified: false },
    });
  }
  add("home", "", "/", "homepage");
  add("services-hub", "", "/services/", "services");
  add("about", "", "/about/", "copy.aboutBody", {
    requirements:
      explicit && !clean(config.copy?.aboutBody || config.business?.description)
        ? ["About content is missing."]
        : [],
  });
  add("contact", "", "/contact/", "business");
  for (const pageType of ["faq", "privacy", "terms"]) {
    const content = config.supportingPages?.[pageType];
    const requirements =
      !content ||
      content.reviewed !== true ||
      !clean(content.body) ||
      !clean(content.source)
        ? [
            "Supplied or explicitly reviewed supporting content and its source are required.",
          ]
        : [];
    add(pageType, "", corePaths[pageType], `supportingPages.${pageType}`, {
      status: "omitted",
      requirements,
    });
  }
  const excluded = new Set(array(config.excludedServices).map(key));
  const serviceNames = new Set(
    array(config.services).map((item) => key(item.name)),
  );
  for (const service of array(config.services)) {
    const requirements = [];
    if (!slug(service.slug)) requirements.push("Service slug is invalid.");
    if (excluded.has(key(service.name)))
      requirements.push("Service is explicitly excluded.");
    add("service", service.name, `/services/${service.slug}/`, "services", {
      title: service.name,
      requirements,
    });
  }
  for (const location of array(config.locations)) {
    const map = array(config.seoPageMap).find(
      (page) =>
        page.pageType === "location" &&
        key(page.location || page.title) === key(location.name),
    );
    const decision = decisionMap.get(`location:${key(location.name)}`);
    const admission = decision?.admission;
    const requirements = [];
    if (!slug(location.slug)) requirements.push("Location slug is invalid.");
    if (explicit) {
      if (
        !array(config.business?.serviceAreas).some(
          (area) => key(area) === key(location.name),
        )
      )
        requirements.push("Location is not confirmed coverage.");
      if (
        !array(admission?.services).some(
          (name) => serviceNames.has(key(name)) && !excluded.has(key(name)),
        )
      )
        requirements.push("Applicable confirmed services are required.");
      if (!clean(admission?.visitorNeed) || !clean(admission?.distinctValue))
        requirements.push(
          "A distinct visitor need and useful local value are required.",
        );
      if (
        !array(admission?.localFacts).some(
          (fact) =>
            localSources.has(fact?.provenance) &&
            clean(fact.value) &&
            clean(fact.source),
        )
      )
        requirements.push(
          "Supported local information beyond coverage is required.",
        );
      if (
        !array(decision?.evidence).some((item) =>
          typeof item === "string" ? clean(item) : clean(item?.source),
        )
      )
        requirements.push("Editorial approval evidence is required.");
    }
    add(
      "location",
      location.name,
      `/locations/${location.slug}/`,
      "locations",
      {
        title: location.name,
        map,
        status: explicit
          ? "proposed"
          : config.industry === "home-services"
            ? "approved"
            : "omitted",
        requirements,
        reason: explicit
          ? "Confirmed coverage is not approval for a standalone location page."
          : "Legacy selected location page.",
      },
    );
  }
  const articles = array(config.blogArticles);
  add("blog-index", "", "/blog/", "blogArticles", {
    status: articles.length ? "approved" : "omitted",
    requirements: articles.length
      ? []
      : ["A blog index requires supplied articles."],
  });
  for (const article of articles) {
    const requirements = [];
    if (!slug(article.slug)) requirements.push("Article slug is invalid.");
    if (!clean(article.body)) requirements.push("Article content is missing.");
    add(
      "blog-article",
      article.slug,
      `/blog/${article.slug}/`,
      "blogArticles",
      { title: article.title, requirements },
    );
  }
  // Explicit requested cities absent from selected SEO/config records stay visible, never silently vanish.
  for (const [id, decision] of decisionMap) {
    if (used.has(id)) continue;
    if (decision.pageType === "location" && clean(decision.target)) {
      const unresolvedSlug = key(decision.target)
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");
      const pathname = `/locations/${unresolvedSlug}/`;
      const missing =
        "Location content is not supplied in the selected configuration.";
      if (
        !slug(unresolvedSlug) ||
        records.some((record) => record.path === pathname)
      ) {
        issues.push(
          `${id}: unresolved location slug is empty or duplicates a configured route. ${missing}`,
        );
        continue;
      }
      add("location", decision.target, pathname, "routePolicy.decisions", {
        id,
        status: decision.status,
        requirements: [missing],
      });
    } else {
      issues.push(
        `Route decision does not resolve to configured content: ${id}.`,
      );
    }
  }
  const paths = new Set();
  for (const record of records) {
    if (paths.has(record.path))
      issues.push(`Duplicate route path: ${record.path}.`);
    paths.add(record.path);
  }
  const approved = records.filter(
    (record) => record.approval.status === "approved",
  );
  const validIds = new Set(approved.map((record) => record.id));
  for (const record of approved) {
    const decision = decisionMap.get(record.id);
    record.discovery.internalLinks = Array.isArray(decision?.internalLinks)
      ? decision.internalLinks
      : approved
          .filter(
            (other) =>
              other.id !== record.id &&
              (record.pageType === "home" ||
                other.pageType === "home" ||
                ["services-hub", "contact"].includes(other.pageType) ||
                (["service", "location"].includes(record.pageType) &&
                  other.pageType === "service")),
          )
          .map((other) => other.id);
    for (const target of record.discovery.internalLinks)
      if (!validIds.has(target))
        issues.push(`${record.id}: unresolved internal target ${target}.`);
    if (
      record.path !== "/" &&
      record.discovery.navigation === "contextual" &&
      !approved.some((other) =>
        other.discovery.internalLinks.includes(record.id),
      )
    )
      issues.push(
        `${record.id}: approved route has no discovery relationship.`,
      );
  }
  const migrations = redirectProposals(policy.existingUrls, records);
  issues.push(...migrations.issues);
  return {
    version: 1,
    mode: explicit ? "explicit" : "legacy",
    records,
    issues: [...new Set(issues)],
    redirectProposal: migrations.proposals,
    domainTransition: {
      status: "deferred",
      requestedDomain: clean(config.business?.domain) || null,
      requires: [
        "verified-domain-connection",
        "canonical-review",
        "separate-release-authorization",
      ],
    },
  };
}
function redirectProposals(input, records) {
  const proposals = [],
    issues = [];
  const seen = new Set();
  for (const entry of array(input)) {
    let old;
    try {
      const raw = typeof entry === "string" ? entry : entry?.url;
      const url = new URL(raw);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      old = url;
    } catch {
      issues.push(
        "Existing-site URL is invalid or includes credentials/query/fragment.",
      );
      continue;
    }
    if (seen.has(old.href)) {
      issues.push(`Duplicate existing URL: ${old.href}.`);
      continue;
    }
    seen.add(old.href);
    const requested = typeof entry === "object" ? entry.routeId : null;
    const target = records.find(
      (record) =>
        record.approval.status === "approved" &&
        (requested ? record.id === requested : record.path === old.pathname),
    );
    proposals.push({
      from: old.href,
      to: target?.path || null,
      routeId: target?.id || null,
      status: target ? "proposed" : "needs-mapping",
      active: false,
      reason: target
        ? "Review mapping and domain ownership before activation."
        : "No approved destination supplied.",
    });
  }
  return { proposals, issues };
}
export function approvedRoutes(inventory, { production = false } = {}) {
  return inventory.records.filter(
    (record) =>
      record.approval.status === "approved" &&
      (!production || !record.discovery.previewOnly),
  );
}
export function routeReadiness(config) {
  if (
    config.routePolicy === undefined &&
    config.routeInventory?.mode !== "explicit"
  )
    return { allowed: true };
  const inventory = compileRouteInventory(config);
  return inventory.issues.length
    ? {
        allowed: false,
        code: "route_approval_required",
        error: `Route approvals need attention: ${inventory.issues.join(" ")}`,
      }
    : { allowed: true };
}
export function routeHref(inventory, path, fallback = "/") {
  return approvedRoutes(inventory).some((record) => record.path === path)
    ? path
    : fallback;
}

// Sealed authored/reviewed cards contain links. Keep their targets in the same inventory.
// Business coverage and the canonical service facts remain unchanged on the source config.
export function routeLinkedContent(config, { production = true } = {}) {
  if (
    config.routePolicy === undefined &&
    config.routeInventory?.mode !== "explicit"
  )
    return config;
  const inventory = compileRouteInventory(config);
  const paths = new Set(
    approvedRoutes(inventory, { production }).map((record) => record.path),
  );
  return {
    ...config,
    services: array(config.services).filter((service) =>
      paths.has(`/services/${service.slug}/`),
    ),
    locations: array(config.locations).filter((location) =>
      paths.has(`/locations/${location.slug}/`),
    ),
  };
}

export function productionRouteMode(environment = {}) {
  return (
    environment.PUBLIC_REVIEW_MODE !== "true" &&
    environment.PUBLIC_CREATIVE_DIAGNOSTIC !== "true"
  );
}
