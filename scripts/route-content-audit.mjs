import fs from "node:fs/promises";
import path from "node:path";
import { redactPrivateLocation } from "../templates/client-site/src/lib/business-facts.mjs";
import {
  compilePageBriefs,
  pageBriefExpectedContent,
} from "../templates/client-site/src/lib/page-briefs.mjs";

export const decodeHtml = (value = "") =>
  String(value).replace(
    /&(?:#(\d+)|#x([a-f0-9]+)|(amp|lt|gt|quot|apos));/giu,
    (all, decimal, hex, named) => {
      const number = decimal ? Number(decimal) : hex ? parseInt(hex, 16) : null;
      return number !== null
        ? number >= 0 && number <= 0x10ffff
          ? String.fromCodePoint(number)
          : all
        : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[
            named.toLowerCase()
          ] || all;
    },
  );
export const htmlAttribute = (tag, name) =>
  decodeHtml(
    tag
      .match(
        new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu"),
      )
      ?.slice(1)
      .find((value) => value !== undefined) || "",
  );
export const htmlTags = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "giu"))].map(
    (match) => match[0],
  );
export const htmlText = (html = "") =>
  decodeHtml(
    html
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]*>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
const normalized = (value) => htmlText(String(value || "")).toLowerCase();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const graphNodes = (value, context, relation = "", depth = 0) => {
  if (depth > 30)
    throw new Error("Schema nesting exceeds the bounded validator.");
  if (Array.isArray(value))
    return value.flatMap((item) =>
      graphNodes(item, context, relation, depth + 1),
    );
  if (!value || typeof value !== "object") return [];
  const inherited = value["@context"] || context;
  return [
    { ...value, "@context": inherited, __relation: relation },
    ...Object.entries(value)
      .filter(([key]) => key !== "@context")
      .flatMap(([key, nested]) =>
        graphNodes(nested, inherited, key, depth + 1),
      ),
  ];
};
const types = (node) =>
  Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
const businessTypes = new Set([
  "LocalBusiness",
  "HomeAndConstructionBusiness",
  "MedicalClinic",
  "Dentist",
  "ProfessionalService",
  "HealthAndBeautyBusiness",
]);
const declaredAssets = (config) =>
  new Set([
    ...(config.assetReport?.used || []).map((item) => item.asset),
    ...Object.values(config.images || {}),
    ...Object.values(config.assets || {}).filter(
      (item) => typeof item === "string",
    ),
  ]);
const mainHtml = (html) =>
  html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] || "";
const meta = (html, property) =>
  htmlTags(html, "meta").find(
    (tag) =>
      htmlAttribute(tag, "property") === property ||
      htmlAttribute(tag, "name") === property,
  ) || "";

/** Technical/content evidence inside the existing SEO gate. No promotion authority. */
export async function auditRouteContent({
  config,
  records,
  htmlPages,
  dist,
  origin = "",
  mode,
}) {
  const report = compilePageBriefs(config);
  const assets = declaredAssets(config);
  const routes = [];
  const diagnostics = [];
  const titles = new Map(),
    descriptions = new Map();
  const substantive = [];
  const businessId = origin ? new URL("/#business", origin).href : "";
  for (const record of records) {
    const html = htmlPages[record.path] || "";
    const main = mainHtml(html);
    const visible = htmlText(main);
    const brief = report.briefs.find((item) => item.routeId === record.id);
    const checks = [];
    const add = (name, ok, detail) =>
      checks.push({ name, status: ok ? "pass" : "fail", detail });
    add(
      "initial-html",
      Boolean(html),
      "Approved route must have a built HTML document.",
    );
    const h1s = [...main.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].map(
      (match) => htmlText(match[1]),
    );
    const expectedTarget = ["service", "location"].includes(record.pageType)
      ? record.target
      : null;
    add(
      "h1",
      h1s.length === 1 &&
        h1s[0].length > 0 &&
        (!expectedTarget ||
          normalized(h1s[0]).includes(normalized(expectedTarget))),
      "Exactly one meaningful main H1 must identify the service or locality where applicable.",
    );
    const title = htmlText(
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] || "",
    );
    const description = htmlAttribute(meta(html, "description"), "content");
    for (const [name, value, index] of [
      ["title", title, titles],
      ["description", description, descriptions],
    ]) {
      const key = normalized(value);
      const previous = index.get(key);
      add(
        "unique-" + name,
        Boolean(key) && !previous,
        previous
          ? `duplicate ${name} with ${previous}.`
          : `Route-specific ${name}.`,
      );
      if (key && !previous) index.set(key, record.path);
    }
    add(
      "open-graph-copy",
      htmlAttribute(meta(html, "og:title"), "content") === title &&
        htmlAttribute(meta(html, "og:description"), "content") === description,
      "Open Graph title and description must match the page metadata.",
    );
    if (mode === "production")
      add(
        "open-graph-url",
        htmlAttribute(meta(html, "og:url"), "content") ===
          new URL(record.path, origin).href,
        "Open Graph URL must identify this canonical route.",
      );
    const ogImage = htmlAttribute(meta(html, "og:image"), "content");
    if (ogImage) {
      let ok = false;
      try {
        const image = new URL(ogImage);
        const src =
          image.origin === new URL(origin || "https://review.invalid").origin ||
          (mode === "review" && image.hostname.endsWith(".pages.dev"))
            ? image.pathname
            : ogImage;
        ok =
          image.protocol === "https:" &&
          (assets.has(src) ||
            brief?.media.some((media) => media.src === src)) &&
          (image.origin ===
            new URL(origin || "https://review.invalid").origin ||
            (mode === "review" && image.hostname.endsWith(".pages.dev")) ||
            image.hostname === "assets.launchloom.wrazyos.com");
      } catch {}
      add(
        "open-graph-image",
        ok,
        "Open Graph image must be absolute HTTPS and an approved page/site asset.",
      );
    }
    const placeholders =
      /\b(?:TODO|PLACEHOLDER|UNKNOWN)\b|lorem ipsum|\{\{[^}]+\}\}|__PLACEHOLDER__/u.test(
        visible,
      );
    const remnants = (config.verification?.forbiddenRemnants || []).filter(
      (value) => typeof value === "string" && value.trim().length >= 4,
    );
    add(
      "remnants",
      !placeholders &&
        !remnants.some((value) =>
          normalized(visible).includes(normalized(value)),
        ),
      "No unauthorized placeholder or configured stale identifier may remain in visible copy.",
    );
    const privateValues =
      config.business?.addressVisibility === "private"
        ? [
            config.business.address,
            config.business.placeId,
            config.business.googleMapsUrl,
          ].filter((value) => typeof value === "string" && value.length >= 4)
        : [];
    add(
      "privacy",
      !privateValues.some((value) =>
        decodeHtml(html).toLowerCase().includes(value.toLowerCase()),
      ),
      "Known private location fields must not occur anywhere in public HTML.",
    );
    if (brief?.mode === "supported") {
      add(
        "supported-content",
        pageBriefExpectedContent(brief).every((value) =>
          normalized(visible).includes(normalized(value)),
        ),
        "Every expected supported claim/question belongs in initial main HTML.",
      );
      add(
        "related-links",
        brief.related.every((item) =>
          htmlTags(main, "a").some((tag) => {
            try {
              return (
                new URL(
                  htmlAttribute(tag, "href"),
                  origin || "https://review.invalid",
                ).pathname === item.path
              );
            } catch {
              return false;
            }
          }),
        ),
        "Expected relevance-backed related routes must be crawlable.",
      );
    }
    const imageObservations = [];
    for (const tag of htmlTags(main, "img")) {
      const src = htmlAttribute(tag, "src");
      let ok = false;
      let local = false;
      try {
        const url = new URL(src, origin || "https://review.invalid");
        local =
          url.origin === new URL(origin || "https://review.invalid").origin;
        if (local) {
          const file = path.resolve(
            dist,
            "." + decodeURIComponent(url.pathname),
          );
          if (file.startsWith(path.resolve(dist) + path.sep))
            ok = (await fs.stat(file).catch(() => null))?.isFile() === true;
        } else
          ok =
            url.protocol === "https:" &&
            assets.has(src) &&
            url.hostname === "assets.launchloom.wrazyos.com";
      } catch {}
      imageObservations.push({ src, local, status: ok ? "pass" : "fail" });
      add(
        "media-asset",
        ok,
        "Page asset must exist locally or have approved hosted provenance; hosted loading is verified separately in the browser.",
      );
    }
    let parsed = true;
    const nodes = [];
    for (const script of [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu),
    ]) {
      if (htmlAttribute(" " + script[1], "type") !== "application/ld+json")
        continue;
      try {
        nodes.push(...graphNodes(JSON.parse(script[2])));
      } catch {
        parsed = false;
      }
    }
    add(
      "json-ld",
      parsed && nodes.some((node) => node["@type"]),
      "Every JSON-LD block must parse and contain structured nodes.",
    );
    const permittedTypes = new Set([
      ...businessTypes,
      "WebPage",
      "WebSite",
      "Service",
      "FAQPage",
      "Question",
      "Answer",
      "BreadcrumbList",
      "ListItem",
      "PostalAddress",
      "GeoCoordinates",
      "ImageObject",
      "Organization",
    ]);
    const partialProvider = (node) =>
      node.__relation === "provider" &&
      Object.keys(node).every((key) =>
        [
          "@type",
          "@context",
          "@id",
          "name",
          "telephone",
          "email",
          "address",
          "areaServed",
          "__relation",
        ].includes(key),
      );
    const businesses = nodes.filter((node) =>
      types(node).some((type) => businessTypes.has(type)),
    );
    add(
      "schema-business",
      businesses.some((node) => !partialProvider(node)) &&
        businesses.every((node) =>
          partialProvider(node)
            ? node["@context"] === "https://schema.org" &&
              node.name === config.business?.name &&
              (!node["@id"] || node["@id"] === businessId) &&
              ["telephone", "email", "address", "areaServed"].every(
                (key) =>
                  node[key] === undefined ||
                  JSON.stringify(node[key]) ===
                    JSON.stringify(
                      {
                        telephone: config.business?.phone,
                        email: config.business?.email,
                        address: config.business?.address,
                        areaServed: config.business?.serviceAreas,
                      }[key],
                    ),
              )
            : node["@context"] === "https://schema.org" &&
              node.name === config.business?.name &&
              node.telephone === (config.business?.phone || undefined) &&
              node.email === (config.business?.email || undefined) &&
              JSON.stringify(node.address) ===
                (config.business?.address
                  ? JSON.stringify(config.business.address)
                  : undefined) &&
              JSON.stringify(node.areaServed || []) ===
                JSON.stringify(config.business?.serviceAreas || []) &&
              (!node["@id"] || !businessId || node["@id"] === businessId) &&
              (!origin ||
                mode !== "production" ||
                node.url === new URL(record.path, origin).href),
        ),
      "All structured business facts must match the approved identity and a stable business identifier.",
    );
    add(
      "schema-context",
      nodes
        .filter((node) => node["@type"] !== undefined)
        .every(
          (node) =>
            node["@context"] === "https://schema.org" &&
            types(node).length > 0 &&
            types(node).every((type) => permittedTypes.has(type)),
        ),
      "Schema context and types must be suitable structured records.",
    );
    for (const node of nodes.filter((node) => types(node).includes("Service")))
      add(
        "schema-service",
        record.pageType === "service" &&
          node.name === record.target &&
          node.serviceType === record.target &&
          (node.provider?.name === config.business?.name ||
            (businessId && node.provider?.["@id"] === businessId)),
        "Service schema must identify the requested route and current provider.",
      );
    for (const node of nodes.filter((node) =>
      types(node).includes("FAQPage"),
    )) {
      const faqs =
        brief?.mode === "supported"
          ? brief.faqs
          : config.conversion?.faqs || [];
      add(
        "schema-faq",
        Array.isArray(node.mainEntity) &&
          node.mainEntity.every(
            (question) =>
              question["@type"] === "Question" &&
              question.acceptedAnswer?.["@type"] === "Answer" &&
              faqs.some(
                (faq) =>
                  faq.question === question.name &&
                  faq.answer === question.acceptedAnswer?.text,
              ),
          ),
        "FAQ schema answers must match supported page questions.",
      );
    }
    add(
      "schema-claims",
      nodes.every(
        (node) =>
          ![
            "aggregateRating",
            "review",
            "hasCredential",
            "award",
            "priceRange",
          ].some((field) => node[field] !== undefined),
      ),
      "Unbound rating, testimonial, credential and price schema claims require explicit supported integration.",
    );
    // Shared shell, conversion UI and repeated business facts are excluded from similarity.
    const uniqueMain = main.replace(
      /<(header|footer|nav|form)\b[^>]*>[\s\S]*?<\/\1>/giu,
      " ",
    );
    let substance = normalized(uniqueMain);
    for (const value of [
      config.business?.name,
      config.business?.description,
      ...(config.business?.serviceAreas || []),
      ...(config.services || []).map((item) => item.name),
    ]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      if (value)
        substance = substance.replace(
          new RegExp(escape(normalized(value)), "gu"),
          " ",
        );
    substance = substance.replace(/\s+/gu, " ").trim();
    substantive.push({
      routeId: record.id,
      path: record.path,
      pageType: record.pageType,
      text: substance,
    });
    routes.push({
      routeId: record.id,
      path: record.path,
      pageType: record.pageType,
      briefVersion: brief?.version || null,
      briefMode: brief?.mode || "none",
      status: checks.every((check) => check.status === "pass")
        ? "pass"
        : "fail",
      checks,
      expected: {
        h1Target: expectedTarget,
        content:
          brief?.mode === "supported" ? pageBriefExpectedContent(brief) : [],
        media: (brief?.media || []).map(({ src, alt, evidenceId }) => ({
          src,
          alt,
          evidenceId,
        })),
      },
      observations: {
        h1: h1s,
        title,
        description,
        wordCount: visible.split(/\s+/u).filter(Boolean).length,
        images: imageObservations,
      },
    });
  }
  for (let i = 0; i < substantive.length; i++)
    for (let j = i + 1; j < substantive.length; j++) {
      const a = substantive[i],
        b = substantive[j];
      if (
        a.pageType !== b.pageType ||
        !["service", "location"].includes(a.pageType)
      )
        continue;
      const left = new Set(
          a.text.split(/\W+/u).filter((word) => word.length > 2),
        ),
        right = new Set(b.text.split(/\W+/u).filter((word) => word.length > 2));
      const union = new Set([...left, ...right]);
      const score = union.size
        ? [...left].filter((word) => right.has(word)).length / union.size
        : 0;
      diagnostics.push({
        kind: "content-similarity",
        routes: [a.path, b.path],
        score,
        blocking: false,
        note: "Shared facts/shell excluded. Similarity is diagnostic, never the sole promotion authority.",
      });
      if (a.text === b.text && a.text.split(" ").length >= 40) {
        for (const entry of routes.filter((route) =>
          [a.path, b.path].includes(route.path),
        )) {
          entry.checks.push({
            name: "distinct-page-substance",
            status: "fail",
            detail:
              "Exact city/service substitution duplicates page-specific substance.",
          });
          entry.status = "fail";
        }
      }
    }
  return redactPrivateLocation(
    {
      routes,
      diagnostics,
      failures: routes.flatMap((route) =>
        route.checks
          .filter((check) => check.status === "fail")
          .map((check) => `${route.path}: ${check.name}: ${check.detail}`),
      ),
    },
    config.business || {},
  );
}
