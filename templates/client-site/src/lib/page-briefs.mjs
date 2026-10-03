import { compileRouteInventory, approvedRoutes } from "./route-inventory.mjs";
import { redactPrivateLocation, factText } from "./business-facts.mjs";
const text = (value) =>
  typeof value === "string" ? factText(value.replace(/—/gu, "-"), 1500) : "";
const list = (value) => (Array.isArray(value) ? value : []);
const kinds = new Set([
  "client_supplied",
  "verified_business_fact",
  "reviewed_copy",
]);
const fields = [
  "scope",
  "suitability",
  "problems",
  "approach",
  "options",
  "preparation",
  "nextStep",
  "localContext",
  "proof",
  "comparison",
  "projects",
];
const headings = {
  scope: "What this service covers",
  suitability: "Who this can help",
  problems: "Concerns to discuss",
  approach: "How the service works",
  options: "Available options",
  preparation: "What to prepare",
  nextStep: "Your next step",
  localContext: "Useful local information",
  proof: "Supported experience",
  comparison: "Compare the supported options",
  projects: "Approved project details",
};
const key = (value) => text(value).toLowerCase().replace(/\s+/gu, " ");
export function compilePageBriefs(raw = {}) {
  const config = redactPrivateLocation(raw, {
    addressVisibility: raw.business?.addressVisibility,
    address: raw.business?.address,
    placeId: raw.business?.placeId,
    googleMapsUrl: raw.business?.googleMapsUrl,
  });
  const inventory = compileRouteInventory(config);
  const approved = approvedRoutes(inventory);
  const routesById = new Map(approved.map((route) => [route.id, route]));
  const registry = list(config.pageEvidence).slice(0, 250);
  const evidence = new Map();
  const issues = [];
  for (const prior of list(config.pageBriefs?.briefs)) {
    if (
      prior.mode === "supported" &&
      routesById.has(prior.routeId) &&
      !config.pageContent?.[prior.routeId]
    )
      issues.push(
        `${prior.routeId}: page content was removed from a supported brief contract.`,
      );
  }
  for (const record of registry) {
    if (!record?.id || evidence.has(record.id)) {
      issues.push("Page evidence IDs must be present and unique.");
      continue;
    }
    evidence.set(record.id, record);
  }
  const briefs = [];
  for (const route of approved.filter((route) =>
    [
      "service",
      "location",
      "about",
      "contact",
      "faq",
      "privacy",
      "terms",
      "services-hub",
    ].includes(route.pageType),
  )) {
    const supplied = config.pageContent?.[route.id];
    const service = list(config.services).find(
      (item) => key(item.name) === key(route.target),
    );
    const location = list(config.locations).find(
      (item) => key(item.name) === key(route.target),
    );
    const map = list(config.seoPageMap).find(
      (page) =>
        page.pageType === route.pageType &&
        key(page.service || page.location || page.title) === key(route.target),
    );
    const omissions = [];
    const sections = [];
    const used = new Set();
    const routeIssues = [];
    function claim(value, field) {
      if (!value) {
        omissions.push({
          field,
          reason: "No route-specific supported material supplied.",
        });
        return null;
      }
      const refs = list(value.evidenceIds);
      const valid =
        refs.length > 0 &&
        refs.every((id) => {
          const record = evidence.get(id);
          return (
            record?.confirmed === true &&
            record.public === true &&
            kinds.has(record.kind) &&
            text(record.source) &&
            list(record.routeIds).includes(route.id) &&
            text(record.value) === text(value.text)
          );
        });
      if (!text(value.text) || !valid) {
        routeIssues.push(
          `${route.id}: ${field} lacks confirmed route-scoped evidence matching the supplied wording.`,
        );
        return null;
      }
      refs.forEach((id) => used.add(id));
      return { text: text(value.text), evidenceIds: refs };
    }
    const introduction = claim(supplied?.introduction, "introduction");
    const cardDescription = text(service?.description || location?.description);
    const metadataTitle = claim(supplied?.metadata?.title, "metadata.title");
    const metadataDescription = claim(
      supplied?.metadata?.description,
      "metadata.description",
    );
    for (const field of fields) {
      const entries = list(supplied?.[field])
        .slice(0, 8)
        .map((entry, index) => claim(entry, `${field}.${index}`))
        .filter(Boolean);
      if (entries.length)
        sections.push({
          kind: field,
          heading: headings[field],
          items: entries,
        });
      else
        omissions.push({
          field,
          reason:
            "Optional material omitted; no supported route-specific information.",
        });
    }
    const faqs = list(supplied?.faqs)
      .slice(0, 8)
      .flatMap((faq, index) => {
        const answer = claim(faq?.answer, `faqs.${index}.answer`);
        return answer && text(faq.question)
          ? [
              {
                question: text(faq.question),
                answer: answer.text,
                evidenceIds: answer.evidenceIds,
              },
            ]
          : [];
      });
    const process = list(supplied?.process)
      .slice(0, 6)
      .map((entry, index) => claim(entry, `process.${index}`))
      .filter(Boolean);
    // Reuse a company process only when explicit applicability and evidence are supplied.
    if (!process.length && supplied?.companyProcess?.applicable === true) {
      for (const [index, step] of list(config.conversion?.process)
        .slice(0, 6)
        .entries()) {
        const result = claim(
          {
            text: step,
            evidenceIds: supplied.companyProcess.evidenceIds?.[index],
          },
          `companyProcess.${index}`,
        );
        if (result) process.push(result);
      }
    }
    const researchQuestions = list(map?.fanOutQuestions)
      .map((question) => ({
        question: text(question),
        state: faqs.some((faq) => key(faq.question) === key(question))
          ? "answered"
          : "unanswered",
        source: "research_question_only",
      }))
      .filter((item) => item.question);
    const related = [];
    for (const item of list(supplied?.relatedServices).slice(0, 5)) {
      const target = routesById.get(item.routeId);
      const reason = claim(item.reason, `relatedServices.${item.routeId}`);
      if (target?.pageType === "service" && target.id !== route.id && reason)
        related.push({
          routeId: target.id,
          name: target.title,
          path: target.path,
          reason: reason.text,
          evidenceIds: reason.evidenceIds,
        });
      else if (
        !target ||
        target.pageType !== "service" ||
        target.id === route.id
      )
        routeIssues.push(
          `${route.id}: related service is not an approved distinct service target.`,
        );
    }
    const media = [];
    for (const item of list(supplied?.media).slice(0, 3)) {
      const record = evidence.get(item.evidenceId);
      const asset = list(config.assetReport?.used).find(
        (asset) => asset.asset === item.src,
      );
      const safePath =
        /^\/images\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpe?g|svg)$/u.test(
          text(item.src),
        ) && !text(item.src).includes("..");
      if (
        !record ||
        record.confirmed !== true ||
        record.public !== true ||
        !list(record.routeIds).includes(route.id) ||
        !text(record.source) ||
        record.value !== item.src ||
        !["client_asset", "reviewed_stock_pack"].includes(record.kind) ||
        !asset ||
        !safePath ||
        !text(item.alt) ||
        record.alt !== item.alt ||
        (record.kind === "reviewed_stock_pack" && !text(asset.license))
      ) {
        routeIssues.push(
          `${route.id}: page media has no approved contextual asset/provenance.`,
        );
        continue;
      }
      used.add(record.id);
      media.push({
        src: item.src,
        alt: text(item.alt),
        evidenceId: record.id,
        source: asset.source,
        license: asset.license || "client_supplied_rights_confirmation",
        placement: text(item.placement) || "context",
      });
    }
    const rich = Boolean(supplied);
    if (rich && !introduction)
      routeIssues.push(
        `${route.id}: a supplied page brief needs its own supported introduction.`,
      );
    if (
      rich &&
      ["service", "location"].includes(route.pageType) &&
      !metadataDescription
    )
      routeIssues.push(
        `${route.id}: independent supported page metadata is required.`,
      );
    if (rich && introduction?.text === cardDescription)
      routeIssues.push(`${route.id}: full introduction repeats card copy.`);
    if (
      rich &&
      route.pageType === "location" &&
      !sections.some((section) => section.kind === "localContext")
    )
      routeIssues.push(
        `${route.id}: location brief needs supported useful local context.`,
      );
    const supporting = config.supportingPages?.[route.pageType];
    const fallbackIntroduction = text(
      service?.description ||
        location?.description ||
        supporting?.body ||
        config.copy?.aboutBody ||
        config.business?.description,
    );
    const brief = {
      version: 1,
      routeId: route.id,
      pageType: route.pageType,
      path: route.path,
      mode: rich ? "supported" : "legacy",
      recipe: config.design?.recipe || "general-editorial",
      introduction: introduction?.text || fallbackIntroduction,
      cardDescription,
      metadata: {
        title:
          metadataTitle?.text ||
          `${route.title} | ${config.business?.name || ""}`,
        description:
          metadataDescription?.text || fallbackIntroduction.slice(0, 240),
      },
      sections,
      faqs,
      process: process.map((entry) => entry.text),
      related,
      media,
      researchQuestions,
      omissions,
      evidenceIds: [...used],
      supportingBody:
        route.pageType === "privacy" || route.pageType === "terms"
          ? typeof supporting?.body === "string"
            ? supporting.body
            : ""
          : "",
      sourceContentVersion: rich ? 1 : null,
      ready: routeIssues.length === 0,
      issues: routeIssues,
    };
    briefs.push(brief);
    issues.push(...routeIssues);
  }
  // Material for proposed/omitted routes stays out of all public/model page bindings.
  const deferred = Object.keys(config.pageContent || {})
    .filter((id) => !routesById.has(id))
    .map((routeId) => ({
      routeId,
      state: "draft",
      reason: "Route is not approved; content is excluded from page output.",
    }));
  return { version: 1, briefs, issues: [...new Set(issues)], deferred };
}
export function pageBriefFor(config, routeId) {
  return (
    compilePageBriefs(config).briefs.find(
      (brief) => brief.routeId === routeId,
    ) || null
  );
}
export function pageBriefReadiness(config) {
  if (config.pageContent === undefined && config.pageBriefs === undefined)
    return { allowed: true };
  const report = compilePageBriefs(config);
  return report.issues.length
    ? {
        allowed: false,
        code: "page_content_required",
        error: `Page content needs attention: ${report.issues.join(" ")}`,
      }
    : { allowed: true };
}
export function supplementalSections(brief) {
  return (
    brief?.sections?.filter(
      (section) => !["scope", "preparation", "nextStep"].includes(section.kind),
    ) || []
  );
}

export function applyPageContentRevision(config, operation) {
  if (
    operation?.kind !== "set_page_content" ||
    !config.pageContent?.[operation.routeId]
  )
    return false;
  if (
    ![
      "introduction",
      "metadataDescription",
      "faqs",
      "localContext",
      "media",
    ].includes(operation.field)
  )
    return false;
  if (
    ["faqs", "media"].includes(operation.field) &&
    (!Array.isArray(operation.value) || operation.value.length === 0)
  )
    return false;
  const before = pageBriefFor(config, operation.routeId);
  if (!before || before.mode !== "supported" || !before.ready) return false;
  if (operation.field === "faqs") {
    const confirmedQuestions = publicPageEvidence(config).filter(
      (record) =>
        kinds.has(record.kind) && record.routeIds.includes(operation.routeId),
    );
    if (
      operation.value.some(
        (faq) =>
          !before.faqs.some(
            (existing) => existing.question === text(faq.question),
          ) &&
          !confirmedQuestions.some(
            (record) => text(record.value) === text(faq.question),
          ),
      )
    )
      return false;
  }
  const draft = structuredClone(config);
  const target = draft.pageContent[operation.routeId];
  if (operation.field === "metadataDescription")
    target.metadata = { ...target.metadata, description: operation.value };
  else target[operation.field] = structuredClone(operation.value);
  const after = pageBriefFor(draft, operation.routeId);
  if (!after?.ready || !pageBriefReadiness(draft).allowed) return false;
  // Copy only the one requested input, then refresh derived reporting.
  config.pageContent[operation.routeId] = target;
  config.pageBriefs = compilePageBriefs(config);
  return true;
}
export function publicPageEvidence(config) {
  const safe = redactPrivateLocation(config, {
    addressVisibility: config.business?.addressVisibility,
    address: config.business?.address,
    placeId: config.business?.placeId,
    googleMapsUrl: config.business?.googleMapsUrl,
  });
  const approved = new Set(
    approvedRoutes(compileRouteInventory(config)).map((route) => route.id),
  );
  return list(safe.pageEvidence)
    .filter(
      (record) =>
        record?.confirmed === true &&
        record.public === true &&
        text(record.source) &&
        text(record.value) &&
        list(record.routeIds).some((id) => approved.has(id)),
    )
    .map((record) => ({
      id: record.id,
      value: record.value,
      kind: record.kind,
      ...(text(record.alt) ? { alt: text(record.alt) } : {}),
      routeIds: record.routeIds,
    }));
}
export function pageBriefExpectedContent(brief) {
  if (!brief || brief.mode !== "supported") return [];
  return [
    ...new Set([
      brief.introduction,
      ...brief.sections.flatMap((section) =>
        section.items.map((item) => item.text),
      ),
      ...brief.faqs.flatMap((faq) => [faq.question, faq.answer]),
      ...brief.process,
      ...brief.related.map((item) => item.reason),
    ]),
  ];
}
