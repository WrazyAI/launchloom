import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const text = (value, limit = 1000) => String(value ?? "").replace(/\u0000/gu, "").replace(/—/gu, "-").trim().slice(0, limit);
const MAX_CORE_SERVICES = 5;
const values = (value, limit = 20, splitCommas = false) => {
  const source = Array.isArray(value) ? value : [value];
  const result = [];
  for (const entry of source) {
    for (const item of text(entry, 1000).split(/\r?\n/u)) {
      const candidates = splitCommas && !Array.isArray(value) ? item.split(",") : [item];
      for (const candidate of candidates) {
        const normalized = text(candidate, 240);
        if (normalized && !result.some((known) => known.toLowerCase() === normalized.toLowerCase())) result.push(normalized);
      }
    }
  }
  return result.slice(0, limit);
};
const cityKey = (value) => text(value, 180).toLocaleLowerCase().replace(/\s+/gu, " ");
const mapTypes = new Set(["home", "services-hub", "service", "location", "about", "contact", "blog-index", "blog-opportunity"]);
const trustedLocalFactSources = new Set(["client_confirmed_coverage", "verified_business_fact"]);

function confirmedPageMap(research, services, coverageAreas) {
  const serviceByKey = new Map(services.map((service) => [service.toLocaleLowerCase(), service]));
  const areas = new Set(coverageAreas.map(cityKey));
  return (Array.isArray(research?.pageMap) ? research.pageMap : []).flatMap((page) => {
    if (!page || !mapTypes.has(page.pageType) || !text(page.id, 100)) return [];
    if (page.pageType === "service") {
      const confirmed = serviceByKey.get(text(page.service || page.title, 160).toLocaleLowerCase());
      return confirmed ? [{ ...page, service: confirmed, title: confirmed }] : [];
    }
    if (page.pageType === "location") {
      const localFacts = Array.isArray(page.localFacts) ? page.localFacts : [];
      const verified = localFacts.some((fact) =>
        trustedLocalFactSources.has(text(fact?.provenance, 80)) && text(fact?.value, 500),
      );
      return areas.has(cityKey(page.location || page.title)) && verified &&
        Array.isArray(page.evidence) && page.evidence.length
        ? [page]
        : [];
    }
    return [page];
  });
}

/** @returns {{ type: string, version: number, legacy: boolean, pageMap: Array<Record<string, any>>, seoResearch: { pageMap: Array<Record<string, any>>, publishReady?: boolean, [key: string]: any }, businessTruth: { services: Array<{ value: string, provenance: string }>, [key: string]: any }, coverage: Record<string, any>, coverageAreas: string[], services: string[], primaryCity: string, [key: string]: any }} */
export function compileCanonicalSiteBrief({ intake = {}, enrichment = {}, research = {} }) {
  const legacy = text(intake.intakeVersion, 10) !== "2";
  const allConfirmedServices = values(intake.confirmedServices || intake.services, 100, legacy);
  const services = allConfirmedServices.slice(0, MAX_CORE_SERVICES);
  const rawPrimaryCity = text(intake.primaryCity, 180) || values(intake.serviceAreas, 20)[0] || "";
  const enrichmentAreas = values(enrichment.coverageAreas, 20);
  const suppliedAreas = enrichmentAreas.length ? enrichmentAreas : values(intake.coverageAreas || intake.serviceAreas, 20);
  const coverageAreas = rawPrimaryCity
    ? [rawPrimaryCity, ...suppliedAreas.filter((area) => cityKey(area) !== cityKey(rawPrimaryCity))]
    : suppliedAreas;
  const primaryCity = rawPrimaryCity || coverageAreas[0] || "";
  const serviceRadius = intake.serviceRadius === "50+" ? "50+" : Number.isFinite(Number(intake.serviceRadius)) ? Number(intake.serviceRadius) : null;
  const pageMap = confirmedPageMap(research, services, coverageAreas);
  const seoResearch = {
    ...research,
    warnings: [
      ...(Array.isArray(research.warnings) ? research.warnings : []),
      ...(allConfirmedServices.length > MAX_CORE_SERVICES
        ? [`Only the first ${MAX_CORE_SERVICES} client-confirmed services were included in the canonical site brief.`]
        : []),
    ],
    pageMap,
    pageDecisions: pageMap.filter((page) => ["service", "location"].includes(page.pageType)).map((page) => ({
      type: page.pageType,
      title: page.title,
      slug: page.slug,
      service: page.service,
      location: page.location,
      provenance: page.pageType === "service" ? "client_confirmed_service" : "research_and_verified_local_fact",
    })),
  };
  const businessTruth = {
    name: text(intake.businessName, 120),
    category: text(intake.industry, 120),
    contactName: text(intake.contactName, 120),
    previewEmail: text(intake.email, 240),
    phone: text(intake.phone, 80),
    address: text(intake.address, 300),
    website: text(intake.website, 500),
    desiredDomain: text(intake.domain || intake.desiredDomain, 180),
    services: services.map((value) => ({ value, provenance: "client_confirmed" })),
    primaryCity: primaryCity ? { value: primaryCity, provenance: intake.primaryCity ? "client_confirmed" : "legacy_client_area" } : null,
    coverageAreas: coverageAreas.map((value) => ({ value, provenance: value === primaryCity ? "client_confirmed_primary_city" : enrichment.coverageEvidence?.source || "legacy_client_supplied_area" })),
    serviceRadius: serviceRadius === null ? null : { value: serviceRadius, provenance: "client_confirmed" },
    differentiators: values(intake.differentiators, 12).map((value) => ({ value, provenance: "client_supplied" })),
    leadEmail: text(intake.leadEmail || intake.email, 240),
    primaryAction: text(intake.primaryCta, 120),
  };
  const assets = intake.assets && typeof intake.assets === "object" ? intake.assets : {};
  const brandNotes = text(intake.brandNotes, 1000);
  const brandColor = text(intake.brandColor || intake.primaryColor, 80);
  const primaryColor = /^#[0-9a-f]{6}$/iu.test(brandColor) ? brandColor : "";
  const brandNote = [brandNotes, brandColor && !primaryColor ? `Client-supplied existing brand colour: ${brandColor}` : ""].filter(Boolean).join("\n");

  return {
    type: "CanonicalSiteBrief",
    version: 1,
    createdAt: new Date().toISOString(),
    legacy,
    submissionId: text(intake.submissionId, 100),
    businessTruth,
    pageMap,
    seoResearch,
    coverage: {
      primaryCity,
      serviceRadius,
      coverageAreas,
      evidence: enrichment.coverageEvidence || { source: primaryCity ? "client_confirmed_primary_city" : "unavailable", lookups: 0 },
      warnings: Array.isArray(enrichment.warnings) ? enrichment.warnings : [],
    },
    verifiedAssets: Object.fromEntries(Object.entries(assets).filter(([, value]) => typeof value === "string" && value).map(([key, value]) => [key, { url: value, provenance: "client_supplied_asset" }])),
    brand: {
      notes: brandNote,
      primaryColor: primaryColor || null,
      colorProvenance: primaryColor ? "client_supplied_existing_color" : null,
    },
    // The flattened fields below keep the current generator's business-truth lane compatible.
    businessName: businessTruth.name,
    contactName: businessTruth.contactName,
    email: businessTruth.previewEmail,
    phone: businessTruth.phone,
    address: businessTruth.address,
    website: businessTruth.website,
    domain: businessTruth.desiredDomain,
    desiredDomain: businessTruth.desiredDomain,
    industry: businessTruth.category,
    preset: businessTruth.category,
    services,
    confirmedServices: services,
    serviceAreas: coverageAreas.join("\n"),
    primaryCity,
    serviceRadius,
    coverageAreas,
    differentiators: businessTruth.differentiators.map((fact) => fact.value).join("\n"),
    primaryCta: businessTruth.primaryAction,
    offer: text(intake.offer, 240),
    leadEmail: businessTruth.leadEmail,
    brandNotes: brandNote,
    primaryColor: primaryColor || "",
    assets: Object.fromEntries(Object.entries(assets).filter(([, value]) => typeof value === "string")),
    seoResearch,
    conversionAiChat: "",
    faqNotes: "",
    qualityConstraints: "Business facts and confirmed services are authoritative. Research is evidence, never a business claim.",
  };
}

function extractJson(body) {
  const match = String(body).match(/```json\s*([\s\S]*?)\s*```/iu);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
  if (!args.source || !args.research || !args.enrichment || !args.out)
    throw new Error("Usage: node compile-canonical-site-brief.mjs --source intake.md --research seo-research.json --enrichment business-enrichment.json --out canonical-site-brief.json");
  const [body, researchText, enrichmentText] = await Promise.all([
    fs.readFile(path.resolve(args.source), "utf8"),
    fs.readFile(path.resolve(args.research), "utf8"),
    fs.readFile(path.resolve(args.enrichment), "utf8"),
  ]);
  const brief = compileCanonicalSiteBrief({ intake: extractJson(body), research: JSON.parse(researchText), enrichment: JSON.parse(enrichmentText) });
  await fs.writeFile(path.resolve(args.out), `${JSON.stringify(brief, null, 2)}\n`);
  console.log(`canonical_site_brief=${args.out}`);
  console.log(`canonical_confirmed_services=${brief.services.length}`);
  console.log(`canonical_coverage_areas=${brief.coverageAreas.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
