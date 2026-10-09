import { compilePageBriefs } from "../templates/client-site/src/lib/page-briefs.mjs";
import { redactPrivateLocation } from "../templates/client-site/src/lib/business-facts.mjs";
import { auditUnsupportedBusinessClaims } from "./business-copy-claims.mjs";
import { routeLinkedContent } from "../templates/client-site/src/lib/route-inventory.mjs";
import { resolvePalette } from "./palette-policy.mjs";
import { fontFamilyById, resolveFontPairing } from "./font-catalog.mjs";
import crypto from "node:crypto";
import { redactPromptValue } from "./author-prompt-budget.mjs";
import { safeAuthorFailureText } from "./author-failure-evidence.mjs";
import { resolvePipelineTestPolicy } from "./pipeline-test-policy.mjs";
import postcss from "postcss";
import ts from "typescript";
import {
  assertIndependentRoutes,
  buildCandidateManifest,
} from "./creative-compiler.mjs";
import {
  EARLY_CONVERSION_OUTPUT_CONTRACT,
  REFERENCE_PROVENANCE_OUTPUT_CONTRACT,
} from "./creative-authoring-output.mjs";
import {
  assertCreativeInnerPageSource,
  assertCreativeServicePageSource,
} from "./creative-source-safety.mjs";
import { validateReferenceDna } from "./reference-dna.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";
import { MAX_REPAIR_FILE_SOURCE_CHARS } from "./creative-repair-contract.mjs";

/**
 * @typedef {"contract" | "experience" | "service" | "location" | "service-index" | "styles" | "motion"} AuthorStage
 * @typedef {{
 *   stage: AuthorStage;
 *   route: Record<string, any>;
 *   contentTokens: string[];
 *   contentShape: Record<string, any>;
 *   visualBrief?: Record<string, any>;
 *   rules: string;
 *   designContract?: string;
 *   experienceSource?: string;
 *   servicePageSource?: string;
 *   locationPageSource?: string;
 *   servicesIndexSource?: string;
 *   validationError?: string;
 *   previousSource?: string;
 * }} AuthorStageRequest
 */

const candidateDirectories = ["candidate-a", "candidate-b", "candidate-c"];
const MAX_REPAIR_CONTEXT_CHARS = 1_800;
const allowedImports = new Set([
  "react",
  "@launchloom/runtime",
  "gsap",
  "gsap/ScrollTrigger",
]);
const requiredRouteKeys = [
  "navigation",
  "heroGeometry",
  "servicePresentation",
  "sectionRhythm",
  "typographyCategory",
  "imageStrategy",
  "signature",
];
const allowedInterfaceCopy = new Set([
  "Services",
  "FAQs",
  "Contact",
  "Menu",
  "Close",
  "Main navigation",
  "Open menu",
  "Close menu",
]);

const contentTokenDefinitions = [
  ["content.brand.name", "string"],
  ["content.brand.logo", "string?"],
  ["content.brand.phone", "string"],
  ["content.brand.email", "string"],
  ["content.brand.address", "string"],
  ["content.brand.serviceAreas", "array"],
  ["content.hero.kicker", "string"],
  ["content.hero.heading", "string"],
  ["content.hero.body", "string"],
  ["content.hero.primaryLabel", "string"],
  ["content.hero.image", "string?"],
  ["content.hero.secondaryImage", "string?"],
  ["content.hero.tertiaryImage", "string?"],
  ["content.hero.offer", "string?"],
  ["content.services", "array"],
  ["content.services[].name", "string"],
  ["content.services[].description", "string"],
  ["content.services[].slug", "string?"],
  ["content.proof", "array"],
  ["content.process", "array"],
  ["content.faqs", "array"],
  ["content.faqs[].question", "string"],
  ["content.faqs[].answer", "string"],
  ["content.locations", "array"],
  ["content.locations[].name", "string"],
  ["content.locations[].description", "string?"],
  ["content.copy.heroKicker", "string?"],
  ["content.copy.heroHeading", "string?"],
  ["content.copy.heroBody", "string?"],
  ["content.copy.servicesHeading", "string?"],
  ["content.copy.servicesIntro", "string?"],
  ["content.copy.aboutKicker", "string?"],
  ["content.copy.aboutHeading", "string?"],
  ["content.copy.aboutBody", "string?"],
  ["content.copy.contactKicker", "string?"],
  ["content.copy.contactHeading", "string?"],
  ["content.copy.processKicker", "string?"],
  ["content.copy.processHeading", "string?"],
  ["content.copy.faqKicker", "string?"],
  ["content.copy.faqHeading", "string?"],
  ["content.copy.formIntro", "string?"],
  ["content.businessDescription", "string"],
  ["content.showLocationMap", "boolean"],
  ["content.hasSocialProof", "boolean"],
  ["content.socialProof", "object?"],
  ["content.socialProof.source", "string?"],
  ["content.socialProof.heading", "string?"],
  ["content.socialProof.intro", "string?"],
  ["content.socialProof.points", "array"],
];
const contentTokens = contentTokenDefinitions.map(([token]) => token);
const requiredExperienceBindings = [
  {
    token: "content.hero.heading",
    aliases: ["content.hero.heading", "content.copy.heroHeading"],
  },
  { token: "content.services", aliases: ["content.services"] },
  { token: "content.faqs", aliases: ["content.faqs"] },
];
const sealedImageSourcePaths = new Set([
  "content.brand.logo",
  "content.hero.image",
  "content.hero.secondaryImage",
  "content.hero.tertiaryImage",
]);
const urlBearingJsxAttributes = new Set([
  "action",
  "archive",
  "background",
  "cite",
  "codebase",
  "data",
  "form",
  "formaction",
  "href",
  "icon",
  "itemid",
  "longdesc",
  "manifest",
  "ping",
  "poster",
  "profile",
  "resource",
  "src",
  "srcdoc",
  "srcset",
  "usemap",
  "vocab",
  "xlinkhref",
  "xmlbase",
]);

/**
 * The render-time shape a service page receives beside the sealed homepage
 * content. The host builds this from the verified site configuration and
 * normalizes optional fields, so every property below is always present.
 */
export function creativeServicePageShape() {
  return {
    service: {
      name: "string",
      slug: "string",
      description: "string",
      brief: { version: "number", routeId: "string", mode: "string", sections: [{kind:"string",heading:"string",items:[{text:"string",evidenceIds:["string"]}]}] },
      support: {
        scope: "string",
        preparation: "string",
        nextStep: "string",
      },
      related: [{ name: "string", slug: "string", description: "string" }],
      process: ["string"],
      faqs: [{ question: "string", answer: "string" }],
      images: { context: "string?", alt: "string" },
    },
  };
}

const servicePageRequiredPaths = [
  "name",
  "slug",
  "description",
  "support.scope",
  "support.preparation",
  "support.nextStep",
  "related",
  "process",
  "faqs",
];

/**
 * The render-time shape a location page receives beside the sealed homepage
 * content. The host builds this from the verified site configuration and
 * normalizes optional fields, so every property below is always present.
 */
export function creativeLocationPageShape() {
  return {
    location: {
      name: "string",
      slug: "string",
      description: "string",
      brief: { version: "number", routeId: "string", mode: "string", sections: [{kind:"string",heading:"string",items:[{text:"string",evidenceIds:["string"]}]}], faqs:[{question:"string",answer:"string"}], process:["string"] },
      localNote: "string",
      services: [{ name: "string", slug: "string", description: "string" }],
      otherAreas: [{ name: "string", slug: "string" }],
      images: { context: "string?", alt: "string" },
    },
  };
}

const locationPageRequiredPaths = [
  "name",
  "slug",
  "description",
  "localNote",
  "services",
  "otherAreas",
];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Keep a route's canonical design template from being serialized redundantly. */
export function omitDuplicateRouteDesignTemplates(
  routeDesignTemplate,
  referenceDna,
  evidence = [],
) {
  const routeTemplate = stableJson(routeDesignTemplate);
  const matchesRouteTemplate = (value) => stableJson(value) === routeTemplate;
  let normalizedReferenceDna = referenceDna;
  if (referenceDna && typeof referenceDna === "object") {
    normalizedReferenceDna = { ...referenceDna };
    if (referenceDna.evidence && typeof referenceDna.evidence === "object") {
      const { designTemplate, ...remainingEvidence } = referenceDna.evidence;
      normalizedReferenceDna.evidence = matchesRouteTemplate(designTemplate)
        ? remainingEvidence
        : { ...referenceDna.evidence };
    }
  }
  const normalizedEvidence = Array.isArray(evidence)
    ? evidence.map((item) => {
        if (!item || typeof item !== "object") return item;
        const { designTemplate, ...remainingEvidence } = item;
        return matchesRouteTemplate(designTemplate)
          ? remainingEvidence
          : { ...item };
      })
    : evidence;
  return {
    referenceDna: normalizedReferenceDna,
    evidence: normalizedEvidence,
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

/**
 * Keep model prompts bounded when a local canary or an intake carries an
 * inline image. The runtime still receives the sealed asset value unchanged;
 * only the authoring prompt gets a descriptive placeholder.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export { redactPromptValue };

function visualBrief(site) {
  const style = { ...(site.style || {}), ...resolvePalette(site.style || {}) };
  const pairing = resolveFontPairing(site.style || {});
  const hex = (value) =>
    /^#[a-f0-9]{6}$/iu.test(value || "") ? String(value) : "";
  const accent = hex(style.accentColor)
    ? {
        color: style.accentColor,
        textColor: hex(style.accentTextColor),
        contrastColor: hex(style.accentContrastColor),
      }
    : null;
  return {
    palette: {
      primaryColor: String(style.primaryColor || ""),
      contrastColor: String(style.contrastColor || ""),
      brandTextColor: String(style.brandTextColor || ""),
      brandSurfaceColor: String(style.brandSurfaceColor || ""),
      brandSurfaceTextColor: String(style.brandSurfaceTextColor || ""),
      surfaceColor: String(style.surfaceColor || ""),
      heroColor: String(style.heroColor || ""),
      inkColor: String(style.inkColor || ""),
      mutedColor: String(style.mutedColor || ""),
      lineColor: String(style.lineColor || ""),
      surfaces: style.surfaces,
    },
    typography: {
      heading: pairing.heading
        ? {
            id: pairing.heading,
            name: fontFamilyById(pairing.heading)?.name || "",
            stack: pairing.headingStack,
          }
        : null,
      body: pairing.body
        ? {
            id: pairing.body,
            name: fontFamilyById(pairing.body)?.name || "",
            stack: pairing.bodyStack,
          }
        : null,
    },
    accent,
    tone: String(style.tone || ""),
    preference: String(style.preference || ""),
    visualDirection: String(style.visualDirection || ""),
    artDirection: String(style.artDirection || ""),
  };
}

function contentShape(site, route) {
  const sourceBusiness = site.business || {};
  site = redactPrivateLocation(site, {
    addressVisibility: sourceBusiness.addressVisibility,
    address: sourceBusiness.address,
    placeId: sourceBusiness.placeId,
    googleMapsUrl: sourceBusiness.googleMapsUrl,
  });
  site = routeLinkedContent(site);
  const business = site.business || {};
  const copy = site.copy || {};
  const assets = site.assets || {};
  const images = site.images || {};
  const routeImages = route?.id ? site.creativeAssets?.[route.id] || {} : {};
  const serviceAreas = Array.isArray(business.serviceAreas)
    ? business.serviceAreas.map(String)
    : [];
  const socialProofPoints = (site.socialProof?.points || []).filter(Boolean);
  const fallbackProofPoints = (site.socialProof?.fallback?.points || []).filter(
    Boolean,
  );
  const hasLiveGoogleProof = Boolean(
    site.socialProof?.source === "google_reviews" &&
    site.socialProof.google?.apiUrl &&
    site.socialProof.google?.token,
  );
  const publicAddress = business.addressVisibility === "private"
    ? ""
    : String(business.address || "");
  const claimEvidence = {
    credentials: site.credentials || business.credentials || [],
    offer: site.offer || business.offer || "",
    price: site.price || business.price || "",
    prices: site.prices || business.prices || [],
    pricing: site.pricing || business.pricing || "",
    priceRange: site.priceRange || business.priceRange || "",
    startingPrice: site.startingPrice || business.startingPrice || "",
    guarantee: site.guarantee || business.guarantee || "",
    guarantees: site.guarantees || business.guarantees || [],
    warranty: site.warranty || business.warranty || "",
    reviews: site.reviews || business.reviews || [],
    testimonials: site.testimonials || business.testimonials || [],
    awards: site.awards || business.awards || [],
    rating: site.rating || business.rating || "",
    reviewCount: site.reviewCount || business.reviewCount || "",
    yearEstablished: site.yearEstablished || business.yearEstablished || "",
    yearsExperience: site.yearsExperience || business.yearsExperience || "",
    yearsInBusiness: site.yearsInBusiness || business.yearsInBusiness || "",
    businessSince: site.businessSince || business.businessSince || "",
    experience: site.experience || business.experience || "",
    availability: site.availability || business.availability || "",
    responseTime: site.responseTime || business.responseTime || "",
    emergencyAvailability:
      site.emergencyAvailability || business.emergencyAvailability || "",
    hours: business.hours || "",
    results: site.results || business.results || [],
    metrics: site.metrics || business.metrics || [],
    caseStudies: site.caseStudies || business.caseStudies || [],
    proofPoints: site.proofPoints || site.differentiators || [],
    staff: site.staff || business.staff || [],
    teamMembers: site.teamMembers || business.teamMembers || [],
    team: site.team || business.team || [],
    address: publicAddress,
    addressVisibility: business.addressVisibility || "public",
    business: {
      credentials: business.credentials || [],
      offer: business.offer || "",
      address: publicAddress,
      addressVisibility: business.addressVisibility || "public",
      yearEstablished: business.yearEstablished || "",
      yearsExperience: business.yearsExperience || "",
      yearsInBusiness: business.yearsInBusiness || "",
      businessSince: business.businessSince || "",
      experience: business.experience || "",
      staff: business.staff || [],
    },
  };
  return {
    brand: {
      name: String(business.name || ""),
      logo: assets.logo || "",
      phone: String(business.phone || ""),
      email: String(business.email || ""),
      address: String(business.address || ""),
      serviceAreas,
    },
    hero: {
      kicker: String(copy.heroKicker || serviceAreas[0] || "Local service"),
      heading: String(copy.heroHeading || business.tagline || ""),
      body: String(copy.heroBody || business.description || ""),
      primaryLabel: String(business.primaryCta || ""),
      image:
        assets.photoOne ||
        routeImages.hero ||
        images.hero ||
        images.secondary ||
        "",
      secondaryImage:
        assets.photoTwo || routeImages.secondary || images.secondary || "",
      tertiaryImage:
        assets.photoThree || routeImages.tertiary || images.tertiary || "",
      offer: String(business.offer || ""),
    },
    pageBriefContractVersion: compilePageBriefs(site).briefs.some(brief => brief.mode === "supported") ? 1 : null,
    claimEvidence,
    services: site.services || [],
    proof: (site.differentiators || []).slice(0, 3).map(String),
    process: (site.conversion?.process || []).slice(0, 4).map(String),
    faqs: (site.conversion?.faqs || []).slice(0, 8),
    locations: site.locations || [],
    copy,
    businessDescription: String(business.description || ""),
    showLocationMap:
      String(business.primaryCta || "")
        .trim()
        .toLowerCase() === "get directions" &&
      (Boolean(String(business.placeId || "").trim()) ||
        /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(
          String(business.address || "").trim(),
        )),
    hasSocialProof:
      socialProofPoints.length > 0 ||
      fallbackProofPoints.length > 0 ||
      hasLiveGoogleProof,
    socialProof: site.socialProof
      ? {
          source: String(site.socialProof.source || ""),
          heading: String(
            site.socialProof.heading ||
              site.socialProof.fallback?.heading ||
              "",
          ),
          intro: String(
            site.socialProof.intro || site.socialProof.fallback?.intro || "",
          ),
          points: (site.socialProof.source === "google_reviews"
            ? fallbackProofPoints
            : socialProofPoints
          )
            .slice(0, 4)
            .map(String),
        }
      : null,
  };
}

export function buildCreativeContentManifest(site, route) {
  const manifest = {
    version: 2,
    values: contentShape(site || {}, route),
    visualBrief: visualBrief(site || {}),
    tokens: contentTokenDefinitions.map(([token, type]) => ({ token, type })),
  };
  return { ...manifest, digest: digest(manifest) };
}

function assertInspirationPack(pack) {
  if (!pack || !Array.isArray(pack.routes) || pack.routes.length !== 3)
    throw new Error(
      "Creative authorship requires exactly three inspiration routes.",
    );
  for (const route of pack.routes) {
    for (const key of requiredRouteKeys)
      if (!String(route[key] || "").trim())
        throw new Error(
          `Inspiration route ${route.id || "unknown"} is missing ${key}.`,
        );
  }
  const contracts = assertIndependentRoutes(pack.routes);
  if (pack.referenceEvidenceRequired || Number(pack.version || 1) >= 2) {
    for (const route of contracts)
      validateReferenceDna(route.referenceDna, { requireEvidence: true });
  }
  return contracts.map((contract, index) => {
    const referenceDossier = pack.routes[index]?.referenceDossier;
    return referenceDossier ? { ...contract, referenceDossier } : contract;
  });
}

function asText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Model stage returned no ${label}.`);
  return value.trim();
}

function boundedRepairContext(value) {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!serialized) return "No valid structured output was returned.";
  if (serialized.length <= MAX_REPAIR_CONTEXT_CHARS) return serialized;

  const marker = `\n...[${serialized.length - MAX_REPAIR_CONTEXT_CHARS} characters omitted to preserve model context]...\n`;
  const remaining = Math.max(0, MAX_REPAIR_CONTEXT_CHARS - marker.length);
  const headLength = Math.ceil(remaining * 0.65);
  const tailLength = remaining - headLength;
  return `${serialized.slice(0, headLength)}${marker}${tailLength ? serialized.slice(-tailLength) : ""}`;
}

function contractRepairSummary(value) {
  if (!value || typeof value !== "object")
    return "No valid structured output was returned.";
  const fields = ["stage", "designContract", "designRationale", "content"]
    .map((key) => {
      const field = value[key];
      const shape =
        typeof field === "string"
          ? `${field.trim().length} characters`
          : field === undefined
            ? "missing"
            : typeof field;
      return `${key}=${shape}`;
    })
    .join(", ");
  return `Prior structured contract response field summary: ${fields}. Regenerate the complete contract fields; do not repeat blank values.`;
}

function normalizeAuthoredSource(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:[a-z]+)?\s*\n([\s\S]*?)\n```$/iu);
  return (fenced ? fenced[1] : trimmed).replaceAll("—", "-");
}

function syntaxErrorFor(source, route, fileName, jsx) {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      allowJs: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  const diagnostic = result.diagnostics?.find(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (!diagnostic) return;
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  throw new Error(
    `Candidate ${route.id} ${fileName} has invalid syntax: ${message}`,
  );
}

function bindingPatternContains(pattern, name) {
  if (ts.isIdentifier(pattern)) return pattern.text === name;
  if (ts.isBindingElement(pattern))
    return bindingPatternContains(pattern.name, name);
  if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern))
    return pattern.elements.some((element) =>
      bindingPatternContains(element, name),
    );
  return false;
}

function functionHasParameter(node, name) {
  return node.parameters.some((parameter) =>
    bindingPatternContains(parameter.name, name),
  );
}

function functionUsesUnboundIdentifier(node, identifierName) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (child !== node && ts.isFunctionLike(child)) return;
    if (ts.isIdentifier(child) && child.text === identifierName) {
      const parent = child.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === child) ||
        (ts.isPropertyAssignment(parent) && parent.name === child)
      )
        return;
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  if (node.body) visit(node.body);
  return found;
}

function scopeErrorFor(
  source,
  route,
  {
    fileName = "Experience.jsx",
    rootComponent = "Experience",
    identifiers = ["content"],
  } = {},
) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  for (const statement of file.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    const componentName = statement.name.text;
    for (const identifier of identifiers) {
      if (componentName === rootComponent) continue;
      if (
        !functionHasParameter(statement, identifier) &&
        functionUsesUnboundIdentifier(statement, identifier)
      )
        return `Candidate ${route.id} component ${componentName} references ${identifier} without receiving it.`;
    }
  }
}

function reducedMotionFallback() {
  return `export function mountExperienceMotion(runtime) {
  const reduced = Boolean(runtime?.reducedMotion) ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  if (reduced) return () => {};
  return () => {};
}`;
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(/\bimport\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gu),
  ].map((match) => match[1]);
}

function parseJsxSource(source) {
  return ts.createSourceFile(
    "Experience.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
}

function jsxOpeningName(opening) {
  return opening?.tagName && ts.isIdentifier(opening.tagName)
    ? opening.tagName.text
    : "";
}

function jsxAttributes(opening) {
  return opening?.attributes?.properties || [];
}

function jsxAttribute(opening, name) {
  return jsxAttributes(opening).find(
    (attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
}

function jsxAttributeValue(attribute, file) {
  const initializer = attribute?.initializer;
  if (!initializer) return "";
  if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  )
    return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression)
    return initializer.expression.getText(file).trim();
  return "";
}

function collectJsxElements(source) {
  const file = parseJsxSource(source);
  const elements = [];
  const visit = (node) => {
    if (ts.isJsxElement(node))
      elements.push({
        node,
        opening: node.openingElement,
        body: source.slice(
          node.openingElement.end,
          node.closingElement.getStart(file),
        ),
      });
    else if (ts.isJsxSelfClosingElement(node))
      elements.push({ node, opening: node, body: "" });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, elements };
}

const contentBoundRuntimeHelpers = new Set([
  "ContactLinks",
  "FAQList",
  "LocationMap",
  "SocialProof",
]);
const optionalSealedImagePaths = new Set([
  "content.brand.logo",
  "content.hero.image",
  "content.hero.secondaryImage",
  "content.hero.tertiaryImage",
]);

function validateContentBoundRuntimeHelpers(source, route) {
  const { file, elements } = collectJsxElements(source);
  const namedHelpers = new Map();
  const runtimeNamespaces = new Set();
  const sealedBindings = new Set();

  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@launchloom/runtime"
    )
      continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      runtimeNamespaces.add(bindings.name.text);
      continue;
    }
    if (!ts.isNamedImports(bindings)) continue;

    for (const specifier of bindings.elements) {
      const importedName = specifier.propertyName?.text || specifier.name.text;
      if (contentBoundRuntimeHelpers.has(importedName))
        namedHelpers.set(specifier.name.text, importedName);
    }
  }

  for (const { opening } of elements) {
    let localName = jsxOpeningName(opening);
    let helperName = namedHelpers.get(localName);
    const tagName = opening.tagName;
    if (
      !helperName &&
      tagName &&
      ts.isPropertyAccessExpression(tagName) &&
      ts.isIdentifier(tagName.expression) &&
      ts.isIdentifier(tagName.name) &&
      runtimeNamespaces.has(tagName.expression.text) &&
      contentBoundRuntimeHelpers.has(tagName.name.text)
    ) {
      localName = `${tagName.expression.text}.${tagName.name.text}`;
      helperName = tagName.name.text;
    }
    if (!helperName) continue;

    const contentValue = jsxAttributeValue(
      jsxAttribute(opening, "content"),
      file,
    );
    if (contentValue !== "content")
      throw new Error(
        `Candidate ${route.id} runtime helper ${localName} must receive sealed content through content={content}.`,
      );
    // FAQList is a trusted runtime adapter that reads content.faqs itself.
    // Count that as the FAQ token binding only when it is inside the required
    // FAQ section; unrelated helpers and unbound helper calls cannot satisfy it.
    if (
      helperName === "FAQList" &&
      isInsideSemanticSection(opening, "faqs", file)
    )
      sealedBindings.add("content.faqs");
  }
  return sealedBindings;
}

function bindingPatternNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    return name.elements.flatMap((element) =>
      ts.isOmittedExpression(element) ? [] : bindingPatternNames(element.name),
    );
  return [];
}

function expressionReferencesContentBinding(
  expression,
  binding,
  aliases,
  file,
) {
  let found = false;
  const normalizedBinding = binding.replace(/\s+/gu, "").replace(/\?\./gu, ".");
  const visit = (node) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node)) {
      const path = node
        .getText(file)
        .replace(/\s+/gu, "")
        .replace(/\?\./gu, ".");
      if (path === normalizedBinding) {
        found = true;
        return;
      }
      visit(node.expression);
      return;
    }
    if (ts.isIdentifier(node) && aliases.has(node.text)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (expression) visit(expression);
  return found;
}

/**
 * Resolve simple, unambiguous local values derived from a sealed content
 * token. Some authored headings are split into words before being rendered
 * inside their h1, so checking only the JSX expression misses that binding.
 */
function localContentBindingAliases(file, binding) {
  const declarations = [];
  const nameCounts = new Map();
  const recordNames = (name) => {
    for (const value of bindingPatternNames(name))
      nameCounts.set(value, (nameCounts.get(value) || 0) + 1);
  };
  const collect = (node) => {
    if (ts.isVariableDeclaration(node)) {
      recordNames(node.name);
      if (ts.isIdentifier(node.name) && node.initializer)
        declarations.push({
          name: node.name.text,
          initializer: node.initializer,
        });
    } else if (ts.isParameter(node)) recordNames(node.name);
    else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    )
      recordNames(node.name);
    ts.forEachChild(node, collect);
  };
  collect(file);

  const aliases = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        nameCounts.get(declaration.name) === 1 &&
        !aliases.has(declaration.name) &&
        expressionReferencesContentBinding(
          declaration.initializer,
          binding,
          aliases,
          file,
        )
      ) {
        aliases.add(declaration.name);
        changed = true;
      }
    }
  }
  return aliases;
}

function jsxChildrenContainBinding(children, binding, file) {
  const aliases = localContentBindingAliases(file, binding);
  const visit = (items) => {
    for (const child of items || []) {
      if (
        ts.isJsxExpression(child) &&
        expressionReferencesContentBinding(
          child.expression,
          binding,
          aliases,
          file,
        )
      )
        return true;
      if (
        (ts.isJsxElement(child) || ts.isJsxFragment(child)) &&
        visit(child.children)
      )
        return true;
    }
    return false;
  };
  return visit(children);
}

function jsxDescendantElementContainsBinding(
  container,
  descendantName,
  binding,
  file,
) {
  if (!ts.isJsxElement(container)) return false;
  const visit = (children) => {
    for (const child of children || []) {
      if (ts.isJsxElement(child)) {
        if (
          jsxOpeningName(child.openingElement) === descendantName &&
          jsxChildrenContainBinding(child.children, binding, file)
        )
          return true;
        if (visit(child.children)) return true;
      } else if (ts.isJsxFragment(child) && visit(child.children)) return true;
    }
    return false;
  };
  return visit(container.children);
}

function jsxAncestorAttributeValue(node, attributeName, file) {
  let current = node;
  while (current) {
    const opening = ts.isJsxElement(current)
      ? current.openingElement
      : ts.isJsxSelfClosingElement(current)
        ? current
        : undefined;
    if (opening) {
      const value = jsxAttributeValue(
        jsxAttribute(opening, attributeName),
        file,
      ).trim();
      if (value) return value;
    }
    current = current.parent;
  }
  return "";
}

function jsxAttributeInsertionPoint(source, opening, file) {
  const close = source.lastIndexOf(">", opening.end - 1);
  if (close < opening.getStart(file)) return -1;
  let cursor = close - 1;
  while (cursor > opening.getStart(file) && /\s/u.test(source[cursor]))
    cursor -= 1;
  return source[cursor] === "/" ? cursor : close;
}

function semanticSectionMatch(element, sectionName, file) {
  if (jsxOpeningName(element.opening) !== "section") return false;
  const attrs = jsxAttributes(element.opening).filter(ts.isJsxAttribute);
  const attrValue = (name) =>
    jsxAttributeValue(
      attrs.find((attribute) => attribute.name.getText() === name),
      file,
    );
  const identity = [
    attrValue("id"),
    attrValue("className"),
    attrValue("class"),
    attrValue("aria-label"),
    attrValue("data-reference-section"),
    attrValue("data-service-presentation"),
  ]
    .join(" ")
    .toLowerCase();
  const body = element.body.toLowerCase();

  if (sectionName === "services")
    return (
      Boolean(attrValue("data-service-presentation")) ||
      /\b(?:services?|offerings?|capabilities|programs?)\b/u.test(identity) ||
      /content\.services\b|<service[a-z]*/u.test(body)
    );
  if (sectionName === "faqs")
    return (
      /\b(?:faqs?|questions?|answers?)\b/u.test(identity) ||
      /content\.faqs\b|<faqlist\b|<details\b/u.test(body)
    );
  if (sectionName === "contact")
    return (
      /<leadform\b/u.test(body) ||
      /\b(?:contact|consultation|appointment|inquiry|enquir(?:y|ies))\b/u.test(
        identity,
      )
    );
  return false;
}

function isInsideSemanticSection(node, sectionName, file) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const body = current.closingElement
        ? file.text.slice(
            current.openingElement.end,
            current.closingElement.getStart(file),
          )
        : "";
      if (
        semanticSectionMatch(
          { opening: current.openingElement, body },
          sectionName,
          file,
        )
      )
        return true;
    }
    current = current.parent;
  }
  return false;
}

function idAttributeValue(element, file) {
  const attribute = jsxAttribute(element.opening, "id");
  return { attribute, value: jsxAttributeValue(attribute, file) };
}

function explicitSemanticSectionMatch(element, sectionName, file) {
  const attrs = jsxAttributes(element.opening).filter(ts.isJsxAttribute);
  const attrValue = (name) =>
    jsxAttributeValue(
      attrs.find((attribute) => attribute.name.getText() === name),
      file,
    );
  if (sectionName === "services")
    return Boolean(attrValue("data-service-presentation"));
  if (sectionName === "faqs")
    return attrValue("data-reference-section")?.trim().toLowerCase() === "faqs";
  if (sectionName === "contact") return /<LeadForm\b/u.test(element.body);
  return false;
}

function assertSectionIdIsNotOverridden(element, attribute, route, id) {
  if (!attribute) return;
  const laterSpread = jsxAttributes(element.opening).some(
    (item) =>
      ts.isJsxSpreadAttribute(item) && item.getStart() > attribute.getStart(),
  );
  if (laterSpread)
    throw new Error(
      `Candidate ${route.id} section id="${id}" may be overridden by a later JSX spread.`,
    );
}

/**
 * Restore the host's navigation anchors only on uniquely identifiable,
 * semantically matching sections. Ambiguous or dynamically overridden IDs
 * remain a hard failure instead of being guessed.
 */
export function restoreRequiredSectionIdsOnSemanticSections(
  source,
  route = { id: "candidate" },
) {
  const { file, elements } = collectJsxElements(source);
  const edits = [];
  const required = ["services", "faqs", "contact"];
  for (const id of required) {
    const sections = elements.filter(
      (element) => jsxOpeningName(element.opening) === "section",
    );
    const semantic = sections.filter((element) =>
      semanticSectionMatch(element, id, file),
    );
    const explicitlyAnchored = semantic.filter(
      (element) => idAttributeValue(element, file).value === id,
    );
    const explicitlyIdentified = semantic.filter((element) =>
      explicitSemanticSectionMatch(element, id, file),
    );
    const preferred = explicitlyAnchored.length
      ? explicitlyAnchored
      : explicitlyIdentified.length
        ? explicitlyIdentified
        : semantic;
    if (preferred.length !== 1)
      throw new Error(
        `Candidate ${route.id} cannot safely restore id="${id}": found ${semantic.length} matching semantic sections.`,
      );
    const target = preferred[0];
    const assigned = elements.filter(({ opening }) => {
      const { value } = idAttributeValue({ opening }, file);
      return value === id;
    });
    if (assigned.some(({ opening }) => opening !== target.opening))
      throw new Error(
        `Candidate ${route.id} has id="${id}" on a different element than its semantic section.`,
      );

    const { attribute, value } = idAttributeValue(target, file);
    assertSectionIdIsNotOverridden(target, attribute, route, id);
    if (value === id && attribute?.getText(file) === `id="${id}"`) continue;
    if (attribute && !value)
      throw new Error(
        `Candidate ${route.id} has a dynamic or unsupported id on the ${id} section.`,
      );
    if (attribute)
      edits.push({
        start: attribute.getStart(file),
        end: attribute.end,
        text: `id="${id}"`,
      });
    else {
      const insertAt = jsxAttributeInsertionPoint(source, target.opening, file);
      if (insertAt < 0)
        throw new Error(
          `Candidate ${route.id} has an invalid opening tag for ${id}.`,
        );
      edits.push({ start: insertAt, end: insertAt, text: ` id="${id}"` });
    }
  }
  let restored = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    restored = `${restored.slice(0, edit.start)}${edit.text}${restored.slice(edit.end)}`;
  return restored;
}

function resolveSealedImageExpression(node, content) {
  if (!node) return { resolved: false };
  if (ts.isParenthesizedExpression(node))
    return resolveSealedImageExpression(node.expression, content);
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
    return resolveSealedImageExpression(node.expression, content);
  if (ts.isSatisfiesExpression(node))
    return resolveSealedImageExpression(node.expression, content);
  if (ts.isIdentifier(node))
    return node.text === "content"
      ? { resolved: true, value: content }
      : { resolved: false };
  if (ts.isPropertyAccessExpression(node)) {
    const base = resolveSealedImageExpression(node.expression, content);
    if (!base.resolved) return { resolved: false };
    if (base.value == null && node.questionDotToken)
      return { resolved: true, value: undefined };
    if (base.value == null || typeof base.value !== "object")
      return { resolved: false };
    if (!Object.prototype.hasOwnProperty.call(base.value, node.name.text)) {
      if (
        Object.prototype.hasOwnProperty.call(Object.prototype, node.name.text)
      )
        return { resolved: false };
      return { resolved: true, value: undefined };
    }
    return { resolved: true, value: base.value[node.name.text] };
  }
  if (ts.isBinaryExpression(node)) {
    const left = resolveSealedImageExpression(node.left, content);
    if (!left.resolved) return { resolved: false };
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      return left.value
        ? left
        : resolveSealedImageExpression(node.right, content);
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      return left.value == null
        ? resolveSealedImageExpression(node.right, content)
        : left;
  }
  return { resolved: false };
}

function resolvedImageValue(attribute, content) {
  if (!content) return undefined;
  const initializer = attribute?.initializer;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const result = resolveSealedImageExpression(
      initializer.expression,
      content,
    );
    return result.resolved &&
      typeof result.value === "string" &&
      result.value.trim()
      ? result.value
      : undefined;
  }
  return undefined;
}

function expressionPath(expression, file) {
  if (!expression) return "";
  if (ts.isParenthesizedExpression(expression))
    return expressionPath(expression.expression, file);
  if (ts.isPropertyAccessExpression(expression))
    return expression.getText(file).replace(/\s+/gu, "").replace(/\?\./gu, ".");
  return "";
}

function isRootExperienceFunction(fn, file) {
  if (!fn) return false;
  if (
    ts.isFunctionDeclaration(fn) &&
    fn.name?.text === "Experience" &&
    fn.parent === file
  )
    return true;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  if (ts.isExportAssignment(fn.parent) && fn.parent.parent === file)
    return true;
  const declaration = fn.parent;
  return (
    ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    declaration.name.text === "Experience" &&
    lexicalScope(declaration) === file
  );
}

function isRootExperienceContentIdentifier(identifier, file) {
  if (!ts.isIdentifier(identifier) || identifier.text !== "content")
    return false;
  const binding = visibleBinding("content", identifier);
  return (
    binding?.kind === "parameter" &&
    isRootExperienceFunction(binding.node.parent, file) &&
    bindingPathForName(binding.node.name, "content")?.join(".") === "content" &&
    !isBindingMutated(binding.node, file)
  );
}

function assignmentTargetRoots(node) {
  const target = unwrapUrlExpression(node);
  if (!target) return [];
  if (ts.isIdentifier(target)) return [target];
  if (ts.isPropertyAccessExpression(target))
    return assignmentTargetRoots(target.expression);
  if (ts.isElementAccessExpression(target))
    return assignmentTargetRoots(target.expression);
  if (ts.isArrayLiteralExpression(target))
    return target.elements.flatMap((element) =>
      ts.isSpreadElement(element)
        ? assignmentTargetRoots(element.expression)
        : assignmentTargetRoots(element),
    );
  if (ts.isObjectLiteralExpression(target))
    return target.properties.flatMap((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return [property.name];
      if (ts.isPropertyAssignment(property))
        return assignmentTargetRoots(property.initializer);
      if (ts.isSpreadAssignment(property))
        return assignmentTargetRoots(property.expression);
      return [];
    });
  if (
    ts.isBinaryExpression(target) &&
    target.operatorToken.kind === ts.SyntaxKind.EqualsToken
  )
    return assignmentTargetRoots(target.left);
  return [];
}

const bindingMutationCache = new WeakMap();

function staticMemberAccess(expression) {
  const node = unwrapUrlExpression(expression);
  if (!node) return null;
  if (ts.isPropertyAccessExpression(node))
    return { receiver: node.expression, name: node.name.text };
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteral(node.argumentExpression)
  )
    return {
      receiver: node.expression,
      name: node.argumentExpression.text,
    };
  return null;
}

function isBindingMutated(bindingNode, file) {
  if (bindingMutationCache.has(bindingNode))
    return bindingMutationCache.get(bindingNode);
  let mutated = false;
  const trackedBindings = new Set([bindingNode]);
  let discoveredAlias = true;
  while (discoveredAlias) {
    discoveredAlias = false;
    const collectAliases = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        ts.isIdentifier(node.initializer) &&
        !trackedBindings.has(node)
      ) {
        const initializerBinding = visibleBinding(
          node.initializer.text,
          node.initializer,
        );
        if (initializerBinding && trackedBindings.has(initializerBinding.node)) {
          trackedBindings.add(node);
          discoveredAlias = true;
        }
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(file);
  }
  const targetWritesBinding = (target) =>
    assignmentTargetRoots(target).some(
      (identifier) =>
        trackedBindings.has(visibleBinding(identifier.text, identifier)?.node),
    );
  const isAssignmentOperator = (kind) =>
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment;
  const mutatingMethods = new Set([
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift",
  ]);
  const objectMutators = new Set([
    "assign",
    "defineProperty",
    "defineProperties",
    "setPrototypeOf",
  ]);
  const reflectMutators = new Set([
    "set",
    "defineProperty",
    "deleteProperty",
    "setPrototypeOf",
  ]);
  const isKnownMutatorCallee = (expression, seen = new Set()) => {
    const callee = unwrapUrlExpression(expression);
    if (!callee) return false;
    const member = staticMemberAccess(callee);
    if (
      member &&
      ((member.receiver.getText(file) === "Object" &&
        objectMutators.has(member.name)) ||
        (member.receiver.getText(file) === "Reflect" &&
          reflectMutators.has(member.name)))
    )
      return true;
    if (!ts.isIdentifier(callee) || seen.has(callee.text)) return false;
    seen.add(callee.text);
    const binding = visibleBinding(callee.text, callee);
    if (
      !binding ||
      binding.kind !== "variable" ||
      !(binding.node.parent.flags & ts.NodeFlags.Const)
    )
      return false;
    const bindingPath = bindingPathForName(
      binding.node.name,
      callee.text,
    )?.join(".");
    const initializer = unwrapUrlExpression(binding.node.initializer);
    if (
      bindingPath &&
      initializer &&
      ts.isIdentifier(initializer) &&
      ((initializer.text === "Object" &&
        objectMutators.has(bindingPath)) ||
        (initializer.text === "Reflect" && reflectMutators.has(bindingPath)))
    )
      return true;
    return isKnownMutatorCallee(binding.node.initializer, seen);
  };
  const visit = (node) => {
    if (mutated) return;
    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperator(node.operatorToken.kind) &&
      targetWritesBinding(node.left)
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      [
        ts.SyntaxKind.PlusPlusToken,
        ts.SyntaxKind.MinusMinusToken,
        ts.SyntaxKind.DeleteKeyword,
      ].includes(node.operator) &&
      targetWritesBinding(node.operand)
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isPostfixUnaryExpression(node) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      ) &&
      targetWritesBinding(node.operand)
    ) {
      mutated = true;
      return;
    }
    const method = ts.isCallExpression(node)
      ? staticMemberAccess(node.expression)
      : null;
    if (
      method &&
      mutatingMethods.has(method.name) &&
      targetWritesBinding(method.receiver)
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      staticMemberAccess(node.expression) &&
      isKnownMutatorCallee(node.expression) &&
      node.arguments.some((argument) => targetWritesBinding(argument))
    ) {
      mutated = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      isKnownMutatorCallee(node.expression) &&
      node.arguments.some((argument) => targetWritesBinding(argument))
    ) {
      mutated = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  bindingMutationCache.set(bindingNode, mutated);
  return mutated;
}

function isSealedImageExpression(expression, file) {
  if (!expression) return false;
  if (ts.isParenthesizedExpression(expression))
    return isSealedImageExpression(expression.expression, file);
  if (sealedImageSourcePaths.has(expressionPath(expression, file))) return true;
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  )
    return (
      isSealedImageExpression(expression.left, file) &&
      isSealedImageExpression(expression.right, file)
    );
  return false;
}

function isSafeSealedImageUrl(value) {
  const url = String(value || "").trim();
  if (
    /^\/(?:images|assets|_astro)\/[A-Za-z0-9._~!$&'()*+,;=@%-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=@%-]+)*(?:\?[^\s#]*)?(?:#[^\s]*)?$/u.test(
      url,
    )
  ) {
    const pathname = url.split(/[?#]/u, 1)[0];
    try {
      return pathname.split("/").every((segment) => {
        const decoded = decodeURIComponent(segment);
        return (
          decoded !== "." &&
          decoded !== ".." &&
          !/[\\/\u0000-\u001f]/u.test(decoded)
        );
      });
    } catch {
      return false;
    }
  }
  if (
    /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/iu.test(
      url,
    )
  )
    return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "assets.launchloom.wrazyos.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname.startsWith("/") &&
      !parsed.pathname.split("/").some((part) => part === "." || part === "..")
    );
  } catch {
    return false;
  }
}

function isSafeLocalHref(value) {
  const href = String(value || "").trim();
  if (!href || /[\u0000-\u0020\\]/u.test(href)) return false;
  if (href.startsWith("#")) return href.length > 1;
  return href.startsWith("/") && !href.startsWith("//");
}

function containsNode(ancestor, descendant, file) {
  return (
    ancestor.getStart(file) <= descendant.getStart(file) &&
    ancestor.end >= descendant.end
  );
}

function isGuardedOptionalImage(node, expression, file) {
  const path = expressionPath(expression, file);
  if (!optionalSealedImagePaths.has(path)) return false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      expressionPath(parent.left, file) === path &&
      containsNode(parent.right, node, file)
    )
      return true;
    if (
      ts.isConditionalExpression(parent) &&
      expressionPath(parent.condition, file) === path &&
      containsNode(parent.whenTrue, node, file)
    )
      return true;
  }
  return false;
}

function unwrapUrlExpression(expression) {
  let current = expression;
  while (current && ts.isParenthesizedExpression(current))
    current = current.expression;
  return current;
}

function contentGroupAliases(source, group) {
  const aliases = new Set();
  const patterns = [
    /\bcontent\s*:\s*\{([^}]*)\}/gu,
    /\b(?:const|let)\s*\{([^}]*)\}\s*=\s*content\b/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const property = new RegExp(
        `(?:^|,)\\s*${group}(?:\\s*:\\s*([A-Za-z_$][\\w$]*))?\\s*(?=,|$)`,
        "u",
      ).exec(match[1]);
      if (property) aliases.add(property[1] || group);
    }
  }
  return aliases;
}

function isSealedContactPath(expression, tokenPath, file, source) {
  const path = expressionPath(expression, file);
  if (path === tokenPath) return true;
  const parts = tokenPath.split(".");
  const group = parts.at(-2);
  const member = parts.at(-1);
  if (parts.length !== 3 || parts[0] !== "content") return false;
  const aliases = contentGroupAliases(source, group);
  return [...aliases].some((alias) => path === `${alias}.${member}`);
}

function isPrefixedContactExpression(
  expression,
  prefix,
  tokenPath,
  file,
  source,
  seen = new Set(),
) {
  const node = unwrapUrlExpression(expression);
  if (!node) return false;
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return false;
    const binding = visibleBinding(node.text, node);
    const declarations = binding?.node?.parent;
    if (
      binding?.kind !== "variable" ||
      !ts.isVariableDeclarationList(declarations) ||
      (declarations.flags & ts.NodeFlags.Const) === 0 ||
      !binding.node.initializer
    )
      return false;
    const nextSeen = new Set(seen);
    nextSeen.add(node.text);
    return isPrefixedContactExpression(
      binding.node.initializer,
      prefix,
      tokenPath,
      file,
      source,
      nextSeen,
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return (
      ts.isStringLiteral(node.left) &&
      node.left.text === prefix &&
      isSealedContactValueExpression(node.right, tokenPath, file, source)
    );
  return (
    ts.isTemplateExpression(node) &&
    node.head.text === prefix &&
    node.templateSpans.length === 1 &&
    isSealedContactValueExpression(
      node.templateSpans[0].expression,
      tokenPath,
      file,
      source,
    ) &&
    node.templateSpans[0].literal.text === ""
  );
}

function lexicalScope(node) {
  for (let current = node?.parent; current; current = current.parent)
    if (
      ts.isBlock(current) ||
      ts.isSourceFile(current) ||
      ts.isFunctionLike(current) ||
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isCatchClause(current)
    )
      return current;
  return null;
}

function bindingPathForName(bindingName, name, prefix = []) {
  if (ts.isIdentifier(bindingName))
    return bindingName.text === name ? prefix : null;
  if (!ts.isObjectBindingPattern(bindingName)) return null;
  for (const element of bindingName.elements) {
    if (element.dotDotDotToken || ts.isOmittedExpression(element)) continue;
    const property = element.propertyName || element.name;
    const propertyName =
      ts.isComputedPropertyName(property) &&
      ts.isStringLiteral(property.expression)
        ? property.expression.text
        : ts.isIdentifier(property) || ts.isStringLiteral(property)
        ? property.text
        : null;
    if (!propertyName) continue;
    const result = bindingPathForName(element.name, name, [
      ...prefix,
      propertyName,
    ]);
    if (result) return result;
  }
  return null;
}

function isScopeBoundary(node) {
  return (
    ts.isBlock(node) ||
    ts.isSourceFile(node) ||
    ts.isFunctionLike(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node)
  );
}

function visibleBinding(name, use) {
  for (let scope = use?.parent; scope; scope = scope.parent) {
    if (!isScopeBoundary(scope)) continue;
    const declarations = [];
    const visit = (node) => {
      if (node !== scope && isScopeBoundary(node)) return;
      if (
        ts.isVariableDeclaration(node) &&
        lexicalScope(node) === scope &&
        bindingPathForName(node.name, name)
      )
        declarations.push({ kind: "variable", node });
      else if (
        ts.isParameter(node) &&
        node.parent === scope &&
        bindingPathForName(node.name, name)
      )
        declarations.push({ kind: "parameter", node });
      else if (
        ((ts.isFunctionDeclaration(node) && node.name) ||
          (ts.isClassDeclaration(node) && node.name)) &&
        node.name.text === name &&
        lexicalScope(node) === scope
      )
        declarations.push({ kind: "other", node });
      ts.forEachChild(node, visit);
    };
    visit(scope);
    if (declarations.length)
      return declarations.length === 1 ? declarations[0] : null;
  }
  return null;
}

function isSealedContactValueExpression(
  expression,
  tokenPath,
  file,
  source,
  seen = new Set(),
) {
  const node = unwrapUrlExpression(expression);
  if (!node) return false;
  if (isSealedContactPath(node, tokenPath, file, source)) return true;
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return false;
    const binding = visibleBinding(node.text, node);
    const declarations = binding?.node?.parent;
    if (
      binding?.kind !== "variable" ||
      !ts.isVariableDeclarationList(declarations) ||
      (declarations.flags & ts.NodeFlags.Const) === 0 ||
      !binding.node.initializer
    )
      return false;
    const nextSeen = new Set(seen);
    nextSeen.add(node.text);
    return isSealedContactValueExpression(
      binding.node.initializer,
      tokenPath,
      file,
      source,
      nextSeen,
    );
  }

  if (
    tokenPath !== "content.brand.phone" ||
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== "replace" ||
    node.arguments.length !== 2 ||
    !ts.isRegularExpressionLiteral(node.arguments[0]) ||
    !ts.isStringLiteral(node.arguments[1]) ||
    node.arguments[1].text !== ""
  )
    return false;

  const pattern = node.arguments[0].getText(file).replace(/\s+/gu, "");
  const safePhoneNormalizers = new Set([
    "/[^0-9+]/g",
    "/[^0-9+]/gu",
    "/[^\\d+]/g",
    "/[^\\d+]/gu",
  ]);
  return (
    safePhoneNormalizers.has(pattern) &&
    isSealedContactValueExpression(
      node.expression.expression,
      tokenPath,
      file,
      source,
      seen,
    )
  );
}

function isSealedServiceCollectionExpression(
  expression,
  file,
  seen = new Set(),
) {
  if (!expression) return false;
  const node = unwrapUrlExpression(expression);
  const directPath = expressionPath(node, file);
  if (
    directPath === "content.services" &&
    ts.isPropertyAccessExpression(node) &&
    isRootExperienceContentIdentifier(node.expression, file)
  )
    return true;
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ["filter", "slice"].includes(node.expression.name.text)
  )
    return isSealedServiceCollectionExpression(
      node.expression.expression,
      file,
      seen,
    );
  if (!ts.isIdentifier(node) || seen.has(node.text)) return false;
  const binding = visibleBinding(node.text, node);
  if (!binding || binding.kind === "other") return false;
  seen.add(node.text);
  const bindingPath = bindingPathForName(binding.node.name, node.text);
  if (binding.kind === "parameter")
    return (
      bindingPath?.join(".") === "content.services" &&
      isRootExperienceFunction(binding.node.parent, file) &&
      !isBindingMutated(binding.node, file)
    );
  if (!(binding.node.parent.flags & ts.NodeFlags.Const)) return false;
  if (isBindingMutated(binding.node, file)) return false;
  if (bindingPath?.join(".") === "services")
    return (
      ts.isIdentifier(binding.node.initializer) &&
      isRootExperienceContentIdentifier(binding.node.initializer, file)
    );
  if (bindingPath?.length) return false;
  return isSealedServiceCollectionExpression(
    binding.node.initializer,
    file,
    seen,
  );
}

function isSealedServiceSlug(expression, file) {
  const slugPath = expressionPath(expression, file);
  const match = /^([A-Za-z_$][\w$]*)\.slug$/u.exec(slugPath);
  if (!match) return false;
  const serviceName = match[1];
  let current = expression;
  while (current && current !== file) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const serviceParameter = current.parameters.find(
        (parameter) =>
          ts.isIdentifier(parameter.name) &&
          parameter.name.text === serviceName,
      );
      if (serviceParameter && !isBindingMutated(serviceParameter, file)) {
        const call = unwrapUrlExpression(current.parent);
        if (
          ts.isCallExpression(call) &&
          ts.isPropertyAccessExpression(call.expression) &&
          call.expression.name.text === "map" &&
          call.arguments.some(
            (argument) => unwrapUrlExpression(argument) === current,
          ) &&
          isSealedServiceCollectionExpression(call.expression.expression, file)
        )
          return true;
      }
    }
    current = current.parent;
  }
  return false;
}

/**
 * Accept a `something.slug` route segment when the bound variable is
 * initialized from a sealed service record, such as
 * `const selectedService = content.services[0]`. Merely mentioning the
 * collection in an initializer does not establish returned-value provenance.
 */
function isSealedServiceSlugBinding(expression, file) {
  const node = unwrapUrlExpression(expression);
  if (!node || !ts.isPropertyAccessExpression(node)) return false;
  if (node.name.text !== "slug") return false;
  const identifier = node.expression;
  if (!ts.isIdentifier(identifier)) return false;
  const binding = visibleBinding(identifier.text, identifier);
  if (!binding || binding.kind !== "variable" ||
      !ts.isIdentifier(binding.node.name) ||
      !(binding.node.parent.flags & ts.NodeFlags.Const) ||
      !binding.node.initializer ||
      isBindingMutated(binding.node, file))
    return false;
  return isSealedServiceRecordExpression(binding.node.initializer, file);
}

function isSealedServiceLookupCall(node, file) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== "find" ||
    node.arguments.length < 1
  )
    return false;
  const callback = node.arguments[0];
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
    return false;
  const recordParameter = callback.parameters[0];
  if (
    recordParameter &&
    (!ts.isIdentifier(recordParameter.name) ||
      isBindingMutated(recordParameter, file))
  )
    return false;
  return isSealedServiceCollectionExpression(node.expression.expression, file);
}

function isSealedServiceRecordExpression(expression, file, seen = new Set()) {
  const node = unwrapUrlExpression(expression);
  if (!node) return false;
  if (ts.isElementAccessExpression(node))
    return isSealedServiceCollectionExpression(node.expression, file);
  if (isSealedServiceLookupCall(node, file)) return true;
  if (ts.isConditionalExpression(node))
    return (
      isSealedServiceRecordExpression(node.whenTrue, file, new Set(seen)) &&
      isSealedServiceRecordExpression(node.whenFalse, file, new Set(seen))
    );
  if (!ts.isIdentifier(node) || seen.has(node.text)) return false;
  seen.add(node.text);
  const binding = visibleBinding(node.text, node);
  if (!binding || binding.kind !== "variable" ||
      !ts.isIdentifier(binding.node.name) ||
      !(binding.node.parent.flags & ts.NodeFlags.Const) ||
      isBindingMutated(binding.node, file)) return false;
  return isSealedServiceRecordExpression(binding.node.initializer, file, seen);
}

function isServiceRouteExpression(expression, file) {
  const node = unwrapUrlExpression(expression);
  if (!node) return false;
  // Same-page fragment anchors such as `#practice-${service.slug}` cannot
  // resolve to an external URL, so a fragment expression is acceptable.
  if (ts.isTemplateExpression(node) && node.head.text.startsWith("#"))
    return true;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    ts.isStringLiteral(node.left) &&
    node.left.text.startsWith("#")
  )
    return true;
  let valid = false;
  let slugExpression = null;
  if (ts.isTemplateExpression(node))
    if (node.head.text === "/services/" && node.templateSpans.length === 1) {
      slugExpression = node.templateSpans[0].expression;
      valid = node.templateSpans[0].literal.text === "/";
    }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    ts.isBinaryExpression(node.left) &&
    node.left.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    valid =
      ts.isStringLiteral(node.left.left) &&
      node.left.left.text === "/services/" &&
      ts.isStringLiteral(node.right) &&
      node.right.text === "/";
  if (valid && ts.isBinaryExpression(node) && ts.isBinaryExpression(node.left))
    slugExpression = node.left.right;
  if (!valid || !slugExpression) return false;
  // The literal /services/ prefix pins the route to this origin; the slug must
  // still trace to sealed services, either as a sealed map parameter or as a
  // binding initialized from the sealed service collection.
  return (
    isSealedServiceSlug(slugExpression, file) ||
    isSealedServiceSlugBinding(slugExpression, file)
  );
}

function staticSpreadUrlKey(property) {
  if (!property.name) return "";
  if (ts.isComputedPropertyName(property.name)) {
    const expression = property.name.expression;
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    )
      return expression.text.toLowerCase();
    return "*";
  }
  if (
    ts.isIdentifier(property.name) ||
    ts.isStringLiteral(property.name) ||
    ts.isNoSubstitutionTemplateLiteral(property.name)
  )
    return property.name.text.toLowerCase();
  return "*";
}

function validateAuthoredUrlAttributes(source, route, content) {
  const { file, elements } = collectJsxElements(source);
  for (const { opening, node } of elements) {
    const tag = jsxOpeningName(opening).toLowerCase();
    for (const property of jsxAttributes(opening)) {
      if (ts.isJsxSpreadAttribute(property)) {
        if (!ts.isObjectLiteralExpression(property.expression))
          throw new Error(
            `Candidate ${route.id} contains an unsafe URL attribute spread; use explicit allowlisted attributes.`,
          );
        for (const spreadProperty of property.expression.properties) {
          const key = staticSpreadUrlKey(spreadProperty);
          if (
            key === "*" ||
            urlBearingJsxAttributes.has(key) ||
            ts.isSpreadAssignment(spreadProperty)
          )
            throw new Error(
              `Candidate ${route.id} contains an unsafe URL attribute in a JSX spread.`,
            );
        }
        continue;
      }
      if (!ts.isJsxAttribute(property)) continue;
      const attributeName = property.name.getText(file).toLowerCase();
      if (!urlBearingJsxAttributes.has(attributeName)) continue;
      const initializer = property.initializer;
      const expression =
        initializer && ts.isJsxExpression(initializer)
          ? initializer.expression
          : null;
      const literalValue =
        initializer &&
        (ts.isStringLiteral(initializer) ||
          ts.isNoSubstitutionTemplateLiteral(initializer))
          ? initializer.text
          : null;

      if (attributeName === "src" && tag === "img") {
        if (!isSealedImageExpression(expression, file))
          throw new Error(
            `Candidate ${route.id} image source must use a sealed image content token.`,
          );
        const value = resolvedImageValue(property, content);
        const imagePath = expressionPath(expression, file);
        const tokenValue = resolveSealedImageExpression(expression, content);
        const tokenIsFalsy = tokenValue.resolved && !tokenValue.value;
        if (
          !value &&
          tokenIsFalsy &&
          optionalSealedImagePaths.has(imagePath) &&
          isGuardedOptionalImage(node, expression, file)
        )
          continue;
        if (!value && tokenIsFalsy && optionalSealedImagePaths.has(imagePath))
          throw new Error(
            `Candidate ${route.id} optional image token ${imagePath} may be empty; conditionally render the image only when that same sealed token is truthy.`,
          );
        if (!isSafeSealedImageUrl(value))
          throw new Error(
            `Candidate ${route.id} image source must resolve to a safe local or LaunchLoom-hosted image asset.`,
          );
        continue;
      }

      if (attributeName === "href" && (tag === "a" || tag === "area")) {
        if (literalValue !== null && isSafeLocalHref(literalValue)) continue;
        if (
          isPrefixedContactExpression(
            expression,
            "tel:",
            "content.brand.phone",
            file,
            source,
          ) ||
          isPrefixedContactExpression(
            expression,
            "mailto:",
            "content.brand.email",
            file,
            source,
          ) ||
          isServiceRouteExpression(expression, file)
        )
          continue;
      }

      throw new Error(
        `Candidate ${route.id} contains an unsafe URL attribute ${property.name.getText(file)} on <${tag}> (${initializer?.getText(file) || "missing value"}).`,
      );
    }
  }
}

function validateImageRoleReuse(source, route, content) {
  const heroImage = String(content?.hero?.image || "").trim();
  if (!heroImage) return;

  const { elements } = collectJsxElements(source);
  const primaryImageUses = elements.filter(({ opening }) => {
    if (jsxOpeningName(opening).toLowerCase() !== "img") return false;
    return (
      resolvedImageValue(jsxAttribute(opening, "src"), content) === heroImage
    );
  }).length;

  const missingSupportingFallbacks = ["secondaryImage", "tertiaryImage"].filter(
    (slot) => {
      if (String(content?.hero?.[slot] || "").trim()) return false;
      return new RegExp(
        `content\\.hero\\.${slot}\\s*(?:\\|\\||\\?\\?)\\s*content\\.hero\\.image`,
        "u",
      ).test(source);
    },
  );

  if (primaryImageUses < 3 && missingSupportingFallbacks.length < 2) return;
  throw new Error(
    `Candidate ${route.id} reuses the primary hero image across distinct image roles. Do not silently fill missing secondary or tertiary media with the hero asset; keep the hero unique and adapt unsupported image chapters to a non-duplicative treatment.`,
  );
}

function visualBriefText(visualBrief) {
  return [
    visualBrief?.artDirection,
    visualBrief?.visualDirection,
    visualBrief?.preference,
  ]
    .map((value) => String(value || ""))
    .filter(Boolean)
    .join(" ");
}

function requiresPurposefulInteraction(visualBrief) {
  return /\b(?:purposeful\s+interactive|interactive\s+(?:care\s+)?(?:guide|selector|chooser|navigator|flow)|(?:guide|selector|chooser|navigator)\s+interaction)\b/iu.test(
    visualBriefText(visualBrief),
  );
}

function validatePurposefulInteraction(source, route, visualBrief) {
  if (!requiresPurposefulInteraction(visualBrief)) return;
  const marker = /data-purposeful-interaction(?:\s|=|>)/iu.exec(source);
  if (!marker)
    throw new Error(
      `Candidate ${route.id} must implement the purposeful interaction requested by the client visual brief and mark its dedicated guide or selector with data-purposeful-interaction.`,
    );

  const close = source.indexOf("</section>", marker.index);
  const interactionSource = source.slice(
    marker.index,
    close >= 0 ? close + "</section>".length : marker.index + 5000,
  );
  if (
    /\bid\s*=\s*["']faqs["']|\bclassName\s*=\s*["'][^"']*(?:faq|social)[^"']*["']|<LeadForm\b|<ChatLauncher\b/iu.test(
      interactionSource,
    )
  )
    throw new Error(
      `Candidate ${route.id} cannot satisfy a purposeful interaction request with FAQ disclosure, the lead form, chat, or an image carousel alone.`,
    );
  if (
    !/<details\b|<select\b|<button\b|\brole\s*=\s*["'](?:tab|radiogroup|listbox)["']/iu.test(
      interactionSource,
    )
  )
    throw new Error(
      `Candidate ${route.id} purposeful interaction must expose visible native stateful controls.`,
    );
  if (
    !/<details\b|\baria-(?:selected|pressed|expanded)\s*=|\bon(?:Click|Change)\s*=/u.test(
      interactionSource,
    )
  )
    throw new Error(
      `Candidate ${route.id} purposeful interaction must expose a visible state change or native disclosure state.`,
    );
}

/**
 * Restore reviewed alt text from the exact original src binding, or from an
 * unambiguous image URL resolved through sealed content tokens. New and
 * ambiguous images remain untouched so accessibility validation fails closed.
 * @param {string} repairedSource
 * @param {string} originalSource
 * @param {Record<string, any> | null} [content=null]
 */
export function restoreImageAltsFromOriginal(
  repairedSource,
  originalSource,
  content = null,
) {
  const original = collectJsxElements(originalSource);
  const repaired = collectJsxElements(repairedSource);
  const originalAlts = new Map();
  const expressionPrinter = ts.createPrinter({ removeComments: true });
  const imageSourceKey = (attribute, file) => {
    const initializer = attribute?.initializer;
    if (!initializer) return "";
    if (ts.isJsxExpression(initializer) && initializer.expression) {
      return `expression:${expressionPrinter.printNode(
        ts.EmitHint.Expression,
        initializer.expression,
        file,
      )}`;
    }
    return `literal:${jsxAttributeValue(attribute, file)}`;
  };
  for (const { opening } of original.elements) {
    if (jsxOpeningName(opening).toLowerCase() !== "img") continue;
    const src = jsxAttribute(opening, "src");
    const alt = jsxAttribute(opening, "alt");
    const srcKey = imageSourceKey(src, original.file);
    const altValue = jsxAttributeValue(alt, original.file);
    if (!srcKey || !alt || !altValue.trim()) continue;
    const queue = originalAlts.get(srcKey) || [];
    queue.push(alt.getText(original.file));
    originalAlts.set(srcKey, queue);
  }

  const originalAltsByResolvedSource = new Map();
  if (content) {
    for (const { opening } of original.elements) {
      if (jsxOpeningName(opening).toLowerCase() !== "img") continue;
      const src = jsxAttribute(opening, "src");
      const alt = jsxAttribute(opening, "alt");
      const value = resolvedImageValue(src, content);
      const altValue = jsxAttributeValue(alt, original.file);
      if (!value || !alt || !altValue.trim()) continue;
      const alts = originalAltsByResolvedSource.get(value) || new Set();
      alts.add(alt.getText(original.file));
      originalAltsByResolvedSource.set(value, alts);
    }
  }

  const used = new Map();
  const edits = [];
  for (const { opening } of repaired.elements) {
    if (jsxOpeningName(opening).toLowerCase() !== "img") continue;
    const src = jsxAttribute(opening, "src");
    const alt = jsxAttribute(opening, "alt");
    const srcKey = imageSourceKey(src, repaired.file);
    if (!srcKey || (alt && jsxAttributeValue(alt, repaired.file).trim()))
      continue;
    const queue = originalAlts.get(srcKey) || [];
    const index = used.get(srcKey) || 0;
    let reviewedAlt =
      queue[index] ||
      (queue.length > 0 && new Set(queue).size === 1 ? queue[0] : undefined);
    if (!reviewedAlt) {
      const value = resolvedImageValue(src, content);
      const resolvedAlts = value
        ? originalAltsByResolvedSource.get(value)
        : undefined;
      if (resolvedAlts?.size === 1)
        reviewedAlt = resolvedAlts.values().next().value;
    }
    if (!reviewedAlt) continue;
    if (index < queue.length) used.set(srcKey, index + 1);
    if (alt)
      edits.push({
        start: alt.getStart(repaired.file),
        end: alt.end,
        text: reviewedAlt,
      });
    else {
      const insertAt = jsxAttributeInsertionPoint(
        repaired.file.text,
        opening,
        repaired.file,
      );
      if (insertAt < 0) continue;
      edits.push({ start: insertAt, end: insertAt, text: ` ${reviewedAlt}` });
    }
  }
  let restored = repairedSource;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    restored = `${restored.slice(0, edit.start)}${edit.text}${restored.slice(edit.end)}`;
  return restored;
}

/**
 * Restore lost opening-scene markers only when the repaired JSX still has a
 * unique semantic hero and contact-bound primary action. Otherwise validation
 * remains fail-closed instead of attaching markers to arbitrary elements.
 */
export function restoreRequiredExperienceMarkers(
  repairedSource,
  originalSource,
  route = { id: "candidate" },
) {
  const original = collectJsxElements(originalSource);
  const repaired = collectJsxElements(repairedSource);
  const edits = [];
  const markerSpecs = [
    {
      name: "data-hero",
      targetAttributes: [
        "data-reference-section",
        "data-reference-signature",
        "data-hero-geometry",
      ],
      targets: () => {
        const matches = repaired.elements.filter((element) => {
          if (jsxOpeningName(element.opening) !== "section") return false;
          return jsxDescendantElementContainsBinding(
            element.node,
            "h1",
            "content.hero.heading",
            repaired.file,
          );
        });
        const semanticMatches = matches.filter(
          (candidate) =>
            !matches.some(
              (other) =>
                other !== candidate &&
                other.node.getStart(repaired.file) >
                  candidate.node.getStart(repaired.file) &&
                other.node.end < candidate.node.end,
            ),
        );
        if (semanticMatches.length > 1)
          throw new Error(
            `Candidate ${route.id} cannot safely restore data-hero: found ${semanticMatches.length} semantic targets.`,
          );
        if (semanticMatches.length > 0) return semanticMatches;

        const originalHero = original.elements.find(({ opening }) =>
          jsxAttribute(opening, "data-hero"),
        );
        const identityAttributes = [
          "data-reference-section",
          "data-reference-signature",
          "data-hero-geometry",
        ]
          .map((name) => ({
            name,
            value: jsxAttributeValue(
              jsxAttribute(originalHero?.opening, name),
              original.file,
            ).trim(),
          }))
          .filter(({ value }) => value);
        if (identityAttributes.length === 0) return [];
        return repaired.elements.filter(
          ({ opening }) =>
            jsxOpeningName(opening) === "section" &&
            identityAttributes.every(
              ({ name, value }) =>
                jsxAttributeValue(
                  jsxAttribute(opening, name),
                  repaired.file,
                ).trim() === value,
            ),
        );
      },
    },
    {
      name: "data-early-conversion",
      targetAttributes: ["data-cta-placement", "className"],
      targets: () =>
        repaired.elements.filter((element) => {
          if (jsxOpeningName(element.opening) !== "a") return false;
          const href = jsxAttributeValue(
            jsxAttribute(element.opening, "href"),
            repaired.file,
          ).trim();
          return (
            href === "#contact" &&
            ts.isJsxElement(element.node) &&
            jsxChildrenContainBinding(
              element.node.children,
              "content.hero.primaryLabel",
              repaired.file,
            )
          );
        }),
    },
  ];

  for (const { name, targetAttributes = [], targets } of markerSpecs) {
    const originalMatches = original.elements.filter(({ opening }) =>
      jsxAttribute(opening, name),
    );
    if (originalMatches.length !== 1)
      throw new Error(
        `Candidate ${route.id} cannot safely restore ${name}: original source has ${originalMatches.length} matching markers.`,
      );
    let candidates = targets();
    for (const attributeName of targetAttributes) {
      if (candidates.length <= 1) break;
      const originalValue = jsxAttributeValue(
        jsxAttribute(originalMatches[0].opening, attributeName),
        original.file,
      ).trim();
      const signatureValue =
        attributeName === "data-cta-placement"
          ? jsxAncestorAttributeValue(
              originalMatches[0].node,
              attributeName,
              original.file,
            )
          : originalValue;
      if (!signatureValue) continue;
      const matching = candidates.filter(({ node, opening }) => {
        const value =
          attributeName === "data-cta-placement"
            ? jsxAncestorAttributeValue(node, attributeName, repaired.file)
            : jsxAttributeValue(
                jsxAttribute(opening, attributeName),
                repaired.file,
              ).trim();
        return value === signatureValue;
      });
      if (matching.length > 0) candidates = matching;
    }
    if (candidates.length !== 1)
      throw new Error(
        `Candidate ${route.id} cannot safely restore ${name}: found ${candidates.length} semantic targets.`,
      );
    const existing = repaired.elements.filter(({ opening }) =>
      jsxAttribute(opening, name),
    );
    for (const marker of existing) {
      if (marker === candidates[0]) continue;
      const misplaced = jsxAttribute(marker.opening, name);
      edits.push({
        start: misplaced.getStart(repaired.file),
        end: misplaced.end,
        text: "",
      });
    }
    if (existing.includes(candidates[0])) continue;
    const insertAt = jsxAttributeInsertionPoint(
      repairedSource,
      candidates[0].opening,
      repaired.file,
    );
    if (insertAt < 0)
      throw new Error(
        `Candidate ${route.id} has an invalid opening tag for ${name}.`,
      );
    edits.push({ start: insertAt, end: insertAt, text: ` ${name}` });
  }

  let restored = repairedSource;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    restored = `${restored.slice(0, edit.start)}${edit.text}${restored.slice(edit.end)}`;
  return restored;
}

function routeRequiresHeroUtilityForm(route) {
  const topologies = [
    route?.compositionTopology,
    route?.referenceDna?.compositionTopology,
  ].filter(Boolean);
  return topologies.some(
    (topology) =>
      topology.hero === "utility-panel" ||
      topology.mobileHero === "utility-panel",
  );
}

function assertRequiredSectionAnchors(source, route) {
  const { file, elements } = collectJsxElements(source);
  for (const marker of ["data-hero", "data-early-conversion"])
    if (!elements.some(({ opening }) => jsxAttribute(opening, marker)))
      throw new Error(
        `Candidate ${route.id} is missing required marker ${marker}.`,
      );

  for (const id of ["services", "faqs", "contact"]) {
    const assigned = elements.filter(
      (element) => idAttributeValue(element, file).value === id,
    );
    if (assigned.length !== 1 || !semanticSectionMatch(assigned[0], id, file))
      throw new Error(
        `Candidate ${route.id} must place id="${id}" on its unique semantic ${id} section.`,
      );
    const { attribute } = idAttributeValue(assigned[0], file);
    assertSectionIdIsNotOverridden(assigned[0], attribute, route, id);
  }
  const contact = elements.find(
    (element) =>
      jsxOpeningName(element.opening) === "section" &&
      idAttributeValue(element, file).value === "contact",
  );
  const leadForms = elements.filter(
    ({ opening }) => jsxOpeningName(opening) === "LeadForm",
  );
  if (leadForms.length !== 1) return;

  const hero = elements.find(({ opening }) =>
    jsxAttribute(opening, "data-hero"),
  );
  if (
    routeRequiresHeroUtilityForm(route) &&
    (!hero || !isDescendantOf(leadForms[0].node, hero.node))
  )
    throw new Error(
      `Candidate ${route.id} must place the single shared LeadForm inside the assigned utility-panel hero.`,
    );
  if (
    !routeRequiresHeroUtilityForm(route) &&
    (!contact || !isDescendantOf(leadForms[0].node, contact.node))
  )
    throw new Error(
      `Candidate ${route.id} must render the shared LeadForm inside the contact section for this reference.`,
    );
}

/** Check that a navigation subtree contains a renderable literal section link. */
function hasLiteralNavigationAnchor(elements, navigation, target) {
  return elements.some(({ node, opening }) => {
    if (
      jsxOpeningName(opening) !== "a" ||
      !isDescendantOf(node, navigation.node) ||
      isNavigationAnchorHidden(navigation, node, elements) ||
      isStaticallyUnreachable(node)
    )
      return false;

    return jsxHrefTarget(opening) === `#${target}`;
  });
}

/** Resolve href in JSX prop order, failing closed when a spread is dynamic. */
function jsxHrefTarget(opening) {
  let href = { known: false, value: undefined };
  for (const property of jsxAttributes(opening)) {
    if (ts.isJsxAttribute(property) && property.name.getText() === "href") {
      const initializer = property.initializer;
      href = {
        known: true,
        value:
          initializer &&
          (ts.isStringLiteral(initializer) ||
            ts.isNoSubstitutionTemplateLiteral(initializer))
            ? initializer.text
            : undefined,
      };
      continue;
    }
    if (!ts.isJsxSpreadAttribute(property)) continue;
    href = spreadHrefState(property, href);
  }
  return href.known ? href.value : undefined;
}

/** Apply the href effect of a static object spread, if it can be proven. */
function spreadHrefState(spread, current) {
  const expression = spread.expression;
  if (!ts.isObjectLiteralExpression(expression))
    return { known: false, value: undefined };

  let href = current;
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      href = { known: false, value: undefined };
      continue;
    }

    const name = property.name;
    let key;
    if (name && ts.isComputedPropertyName(name)) {
      const computed = name.expression;
      if (
        !ts.isStringLiteral(computed) &&
        !ts.isNoSubstitutionTemplateLiteral(computed)
      ) {
        href = { known: false, value: undefined };
        continue;
      }
      key = computed.text;
    } else if (
      name &&
      (ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name))
    ) {
      key = name.text;
    } else {
      href = { known: false, value: undefined };
      continue;
    }

    if (key !== "href") continue;
    const value =
      ts.isPropertyAssignment(property) &&
      (ts.isStringLiteral(property.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(property.initializer))
        ? property.initializer.text
        : undefined;
    href = { known: true, value };
  }
  return href;
}

/** Reject native hidden attributes on a navigation link or any of its containers. */
function isNavigationAnchorHidden(navigation, anchor, elements) {
  return elements.some(({ node, opening }) => {
    if (
      (node !== navigation.node &&
        !isDescendantOf(node, navigation.node) &&
        !isDescendantOf(navigation.node, node)) ||
      (node !== anchor && !isDescendantOf(anchor, node))
    )
      return false;

    return hasPotentiallyHiddenJsxAttribute(opening);
  });
}

/** Preserve JSX prop order while detecting hidden values from attributes/spreads. */
function hasPotentiallyHiddenJsxAttribute(opening) {
  let hidden = false;
  let displayNone = false;
  for (const attribute of jsxAttributes(opening)) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText() === "hidden") {
      const initializer = attribute.initializer;
      hidden = Boolean(
        !initializer ||
        !ts.isJsxExpression(initializer) ||
        !initializer.expression ||
        !isBooleanLiteral(initializer.expression, false),
      );
      continue;
    }
    if (ts.isJsxAttribute(attribute) && attribute.name.getText() === "style") {
      displayNone = inlineStyleDisplayNone(attribute.initializer);
      continue;
    }
    if (ts.isJsxSpreadAttribute(attribute)) {
      const spreadHidden = staticSpreadHiddenValue(attribute);
      if (spreadHidden !== null) hidden = spreadHidden;
      const spreadDisplayNone = staticSpreadDisplayNone(attribute);
      if (spreadDisplayNone !== null) displayNone = spreadDisplayNone;
    }
  }
  return hidden !== false || displayNone !== false;
}

/** Return inline `display: none`, treating dynamic style objects as unsafe. */
function inlineStyleDisplayNone(initializer) {
  if (!initializer || !ts.isJsxExpression(initializer)) return undefined;
  return styleObjectDisplayNone(initializer.expression);
}

function styleObjectDisplayNone(expression) {
  if (!expression) return undefined;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return false;
  if (!ts.isObjectLiteralExpression(expression)) return undefined;

  let displayNone = false;
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) return undefined;
    const name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      const key = name.expression;
      if (!ts.isStringLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key))
        return undefined;
      if (key.text !== "display") continue;
    } else if (
      !name ||
      (!ts.isIdentifier(name) &&
        !ts.isStringLiteral(name) &&
        !ts.isNoSubstitutionTemplateLiteral(name))
    ) {
      return undefined;
    } else if (name.text !== "display") continue;
    if (!ts.isPropertyAssignment(property)) return undefined;
    const value = property.initializer;
    if (
      !ts.isStringLiteral(value) &&
      !ts.isNoSubstitutionTemplateLiteral(value)
    )
      return undefined;
    displayNone = value.text.trim().toLowerCase() === "none";
  }
  return displayNone;
}

/** Return display visibility from a static JSX props object spread. */
function staticSpreadDisplayNone(attribute) {
  const expression = attribute.expression;
  if (!ts.isObjectLiteralExpression(expression)) return undefined;

  let foundStyle = false;
  let displayNone;
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) return undefined;
    const name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      const key = name.expression;
      if (!ts.isStringLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key))
        return undefined;
      if (key.text !== "style") continue;
    } else if (
      !name ||
      (!ts.isIdentifier(name) &&
        !ts.isStringLiteral(name) &&
        !ts.isNoSubstitutionTemplateLiteral(name))
    ) {
      return undefined;
    } else if (name.text !== "style") continue;
    foundStyle = true;
    if (!ts.isPropertyAssignment(property)) return undefined;
    const value = property.initializer;
    if (value.kind === ts.SyntaxKind.NullKeyword) displayNone = false;
    else displayNone = styleObjectDisplayNone(value);
  }
  return foundStyle ? displayNone : null;
}

/** Return a known hidden value, null when absent, or undefined when dynamic. */
function staticSpreadHiddenValue(attribute) {
  const expression = attribute.expression;
  if (!ts.isObjectLiteralExpression(expression)) return undefined;

  let foundHidden = false;
  let hidden;
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) return undefined;
    const name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      const key = name.expression;
      if (!ts.isStringLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key))
        return undefined;
      if (key.text !== "hidden") continue;
    } else if (
      !name ||
      (!ts.isIdentifier(name) &&
        !ts.isStringLiteral(name) &&
        !ts.isNoSubstitutionTemplateLiteral(name))
    ) {
      return undefined;
    } else if (name.text !== "hidden") continue;

    foundHidden = true;
    if (!ts.isPropertyAssignment(property)) {
      hidden = undefined;
      continue;
    }
    if (isBooleanLiteral(property.initializer, true)) hidden = true;
    else if (isBooleanLiteral(property.initializer, false)) hidden = false;
    else hidden = undefined;
  }
  return foundHidden ? hidden : null;
}

/** Return whether node is nested below ancestor in the parsed JSX tree. */
function isDescendantOf(node, ancestor) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent === ancestor) return true;
  return false;
}

/** Return whether node is ancestor itself or one of its descendants. */
function isWithinOrSelf(node, ancestor) {
  return node === ancestor || isDescendantOf(node, ancestor);
}

/** Match a boolean literal after removing harmless expression parentheses. */
function isBooleanLiteral(expression, value) {
  let unwrapped = expression;
  while (ts.isParenthesizedExpression(unwrapped))
    unwrapped = unwrapped.expression;
  return (
    unwrapped.kind ===
    (value ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword)
  );
}

/** Detect JSX nested in branches proven unreachable by literal booleans. */
function isStaticallyUnreachable(node) {
  for (let current = node; current?.parent; current = current.parent) {
    const parent = current.parent;
    if (ts.isBinaryExpression(parent)) {
      const inRight = isWithinOrSelf(current, parent.right);
      if (
        inRight &&
        ((parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          isBooleanLiteral(parent.left, false)) ||
          (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
            isBooleanLiteral(parent.left, true)))
      )
        return true;
    }
    if (ts.isConditionalExpression(parent)) {
      if (
        (isWithinOrSelf(current, parent.whenTrue) &&
          isBooleanLiteral(parent.condition, false)) ||
        (isWithinOrSelf(current, parent.whenFalse) &&
          isBooleanLiteral(parent.condition, true))
      )
        return true;
    }
    if (
      ts.isIfStatement(parent) &&
      ((isWithinOrSelf(current, parent.thenStatement) &&
        isBooleanLiteral(parent.expression, false)) ||
        (parent.elseStatement &&
          isWithinOrSelf(current, parent.elseStatement) &&
          isBooleanLiteral(parent.expression, true)))
    )
      return true;
  }
  return false;
}

function unsupportedClaimLiterals(source) {
  const withoutImports = source.replace(/^\s*import[^;]+;?\s*$/gmu, "");
  const textNodes = [...withoutImports.matchAll(/>([^<>{}\n]+)</gu)].map(
    (match) => match[1].trim(),
  );
  const visitorAttributes = [
    ...withoutImports.matchAll(
      /\b(?:alt|aria-label|placeholder|title)\s*=\s*["']([^"']+)["']/gu,
    ),
  ].map((match) => match[1].trim());
  return [...textNodes, ...visitorAttributes].filter(
    (value) =>
      value &&
      !allowedInterfaceCopy.has(value) &&
      /\b(?:award(?:-?winning)?|certified|licensed|insured|guaranteed?|best|number one|#1|five[- ]star|top[- ]rated|years? of experience)\b/iu.test(
        value,
      ),
  );
}

function authoredSourceText(source) {
  const file = ts.createSourceFile(
    "authored-claim-copy.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const values = [];
  function visit(node) {
    if (ts.isJsxText(node)) values.push(node.text.trim());
    else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    )
      values.push(node.text);
    else if (ts.isTemplateExpression(node))
      values.push([
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ].join(" "));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return values.filter(Boolean).join(". ");
}

function assertAuthoredCopyClaims(source, route, content, fileLabel) {
  const unsupported = auditUnsupportedBusinessClaims(
    { copy: { authoredSource: authoredSourceText(source) } },
    content?.claimEvidence || {},
  );
  if (unsupported.length)
    throw new Error(
      `Candidate ${route.id} ${fileLabel} contains unsupported business claims: ${unsupported.join(", ")}.`,
    );
}

function scalarContentValues(value) {
  if (Array.isArray(value)) return value.flatMap(scalarContentValues);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(scalarContentValues);
  if (typeof value !== "string") return [];
  const normalized = value.trim();
  const isMeaningfulPhrase =
    normalized.length >= 12 ||
    normalized.split(/\s+/u).length >= 3 ||
    /[@+()\d]/u.test(normalized);
  return isMeaningfulPhrase ? [normalized] : [];
}

function referencesContentPath(source, token) {
  if (source.includes(token)) return true;
  const [group, member] = token.replace(/^content\./u, "").split(".");
  if (!group) return false;
  if (
    member &&
    new RegExp(`\\bcontent\\.${group}(?:\\.|\\?\\.)${member}\\b`, "u").test(
      source,
    )
  )
    return true;
  const aliasedGroup = source.match(
    new RegExp(
      `(?:const|let)\\s+\\{\\s*${group}\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*\\}\\s*=\\s*content\\b`,
      "u",
    ),
  )?.[1];
  if (member && aliasedGroup && source.includes(`${aliasedGroup}.${member}`))
    return true;
  const groupBinding = new RegExp(
    `(?:const|let)\\s+${group}\\s*=\\s*content\\.${group}\\b|(?:const|let)\\s*\\{[^}]*\\b${group}\\b[^}]*\\}\\s*=\\s*content\\b`,
    "u",
  );
  const parameterGroupBinding = new RegExp(
    `\\bcontent\\s*:\\s*\\{[\\s\\S]{0,500}?\\b${group}\\b`,
    "u",
  );
  if (!member)
    return groupBinding.test(source) || parameterGroupBinding.test(source);
  if (groupBinding.test(source) && source.includes(`${group}.${member}`))
    return true;
  if (
    parameterGroupBinding.test(source) &&
    source.includes(`${group}.${member}`)
  )
    return true;
  const nestedBinding = new RegExp(
    `\\b${group}\\s*:\\s*\\{[^}]*\\b${member}\\b[^}]*\\}\\s*\\}\\s*=\\s*content\\b|\\bcontent\\s*:\\s*\\{[\\s\\S]{0,500}?\\b${group}\\s*:\\s*\\{[^}]*\\b${member}\\b`,
    "u",
  );
  if (nestedBinding.test(source)) return true;
  const memberBinding = new RegExp(
    `(?:const|let)\\s+${member}\\s*=\\s*content\\.${group}\\.${member}\\b|(?:const|let)\\s*\\{[^}]*\\b${member}\\b[^}]*\\}\\s*=\\s*content\\.${group}\\b`,
    "u",
  );
  const chainedMemberBinding = new RegExp(
    `(?:const|let)\\s*\\{[^}]*\\b${member}\\b[^}]*\\}\\s*=\\s*${group}\\b`,
    "u",
  );
  if (groupBinding.test(source) && chainedMemberBinding.test(source))
    return true;
  return memberBinding.test(source);
}

function referencesObjectPath(source, root, path) {
  const [group, member] = String(path).split(".");
  const rootName = String(root);
  const access = (suffix) =>
    new RegExp(`\\b${rootName}\\s*\\??\\s*\\.\\s*${suffix}\\b`, "u").test(
      source,
    );
  const destructuredTop = (name) =>
    new RegExp(
      `(?:const|let)\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*${rootName}\\b`,
      "u",
    ).test(source) ||
    new RegExp(
      `\\b${rootName}\\s*:\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`,
      "u",
    ).test(source);
  if (!member) return access(group) || destructuredTop(group);
  if (access(`${group}\\s*\\??\\s*\\.\\s*${member}`)) return true;
  if (destructuredTop(group)) {
    if (
      new RegExp(`\\b${group}\\s*\\??\\s*\\.\\s*${member}\\b`, "u").test(source)
    )
      return true;
    if (destructuredTop(member)) return true;
  }
  if (
    new RegExp(
      `(?:const|let)\\s*\\{[^}]*\\b${member}\\b[^}]*\\}\\s*=\\s*${rootName}\\s*\\??\\s*\\.\\s*${group}\\b`,
      "u",
    ).test(source) ||
    new RegExp(
      `(?:const|let)\\s*\\{[^}]*\\b${member}\\b[^}]*\\}\\s*=\\s*${group}\\b`,
      "u",
    ).test(source)
  )
    return true;
  return false;
}

function assertRepairableSourceSize(source, route, file) {
  if (source.length > MAX_REPAIR_FILE_SOURCE_CHARS)
    throw new Error(
      `Candidate ${route.id} ${file} exceeds the ${MAX_REPAIR_FILE_SOURCE_CHARS}-character repairable source limit. Simplify the authored file without changing its assigned composition.`,
    );
}

function validateInnerPageSource({
  source,
  route,
  content,
  file,
  rootComponent,
  identifiers,
  markers = [],
  pathRoot = "",
  requiredPaths = [],
  requiredContentPaths = [],
}) {
  assertRepairableSourceSize(source, route, file);
  syntaxErrorFor(source, route, file, true);
  const scopeError = scopeErrorFor(source, route, {
    fileName: file,
    rootComponent,
    identifiers,
  });
  if (scopeError) throw new Error(scopeError);
  for (const specifier of importSpecifiers(source))
    if (!allowedImports.has(specifier))
      throw new Error(
        `Candidate ${route.id} uses unapproved import ${specifier}.`,
      );
  const forbidden = [
    [/https?:\/\/|(?:src|href)\s*=\s*["']\/\//iu, "remote URL"],
    [/\bfetch\s*\(/iu, "network request"],
    [/\bXMLHttpRequest\b|\bWebSocket\b/iu, "network primitive"],
    [/\beval\s*\(|\bnew\s+Function\b/iu, "dynamic code"],
    [/<canvas\b|\bthree(?:\s*\.?\s*js)\b/iu, "unapproved rendering engine"],
    [/<script\b/iu, "script element"],
    [
      /<style\b|\sstyle\s*=|\.\.\.\s*\{\s*(?:style\b|\[[^\]]*style[^\]]*\])\s*:/iu,
      "inline styles; visual rules belong in styles.css",
    ],
    [/—/u, "em dash"],
  ];
  for (const [pattern, label] of forbidden)
    if (pattern.test(source))
      throw new Error(
        `Candidate ${route.id} ${file} contains forbidden ${label}.`,
      );
  for (const marker of markers)
    if (!source.includes(marker))
      throw new Error(
        `Candidate ${route.id} ${file} is missing the ${marker} region marker.`,
      );
  if (!/<section\b[^>]*\bid\s*=\s*["']contact["']/u.test(source))
    throw new Error(
      `Candidate ${route.id} ${file} must include a contact section with id="contact".`,
    );
  const { elements } = collectJsxElements(source);
  const headings = elements.filter(
    ({ opening }) => jsxOpeningName(opening).toLowerCase() === "h1",
  );
  if (headings.length !== 1)
    throw new Error(
      `Candidate ${route.id} ${file} must render exactly one H1 heading.`,
    );
  if (
    !elements.some(
      ({ opening }) => jsxOpeningName(opening).toLowerCase() === "main",
    )
  )
    throw new Error(
      `Candidate ${route.id} ${file} must render a main landmark.`,
    );
  for (const path of requiredPaths)
    if (!referencesObjectPath(source, pathRoot, path))
      throw new Error(
        `Candidate ${route.id} ${file} is missing required sealed binding ${pathRoot}.${path}.`,
      );
  for (const token of requiredContentPaths)
    if (!referencesContentPath(source, token))
      throw new Error(
        `Candidate ${route.id} ${file} is missing required sealed binding ${token}.`,
      );
  validateContentBoundRuntimeHelpers(source, route);
  validateImageRoleReuse(source, route, content);
  for (const { opening } of elements) {
    if (jsxOpeningName(opening).toLowerCase() !== "img") continue;
    const altAttribute = jsxAttribute(opening, "alt");
    const initializer = altAttribute?.initializer;
    const expression =
      initializer && ts.isJsxExpression(initializer)
        ? initializer.expression
        : null;
    const invalidExpression =
      initializer &&
      ts.isJsxExpression(initializer) &&
      (!expression ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(expression) && expression.text === "undefined"));
    if (!altAttribute || !initializer || invalidExpression)
      throw new Error(
        `Candidate ${route.id} ${file} has an image that must have a usable alt attribute; use alt="" only for decorative or redundant imagery.`,
      );
  }
  const literals = unsupportedClaimLiterals(source);
  if (literals.length)
    throw new Error(
      `Candidate ${route.id} ${file} contains an unsupported claim literal: ${literals[0]}`,
    );
  assertAuthoredCopyClaims(source, route, content, file);
  const embeddedFact = scalarContentValues(content).find((value) =>
    source.includes(value),
  );
  if (embeddedFact) {
    const matchAt = source.indexOf(embeddedFact);
    const nearby = source
      .slice(
        Math.max(0, matchAt - 80),
        matchAt + embeddedFact.length + 80,
      )
      .replace(/\s+/gu, " ")
      .trim();
    throw new Error(
      `Candidate ${route.id} ${file} hardcodes sealed content instead of using a token: ${embeddedFact}. Replace that literal with the matching content binding. Nearby source: ${nearby}`,
    );
  }
}

/**
 * Validate an authored service detail page. The page renders the same sealed
 * site content as the homepage plus one service record, so it must expose the
 * shared router, conversion, and design-system contracts for the rendered
 * identity checks in the creative bakeoff.
 */
function assertPageBriefBinding(source, root, route, content) {
  if (content?.pageBriefContractVersion !== 1) return;
  const { file, elements } = collectJsxElements(source);
  const bound = elements.some(({opening}) => jsxOpeningName(opening) === "PageBriefSections" && jsxAttributeValue(jsxAttribute(opening,"brief"),file) === `${root}.brief`);
  const imported = file.statements.some(statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "@launchloom/runtime" && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings) && statement.importClause.namedBindings.elements.some(binding => binding.name.text === "PageBriefSections" && (!binding.propertyName || binding.propertyName.text === "PageBriefSections")));
  if (!bound || !imported) throw new Error(`Candidate ${route.id} must render shared PageBriefSections bound to ${root}.brief.`);
}

export function validateServicePage(source, route, content) {
  assertPageBriefBinding(source,"service",route,content);
  validateInnerPageSource({
    source,
    route,
    content,
    file: "ServicePage.jsx",
    rootComponent: "ServicePage",
    identifiers: ["content", "service"],
    markers: [
      "data-service-hero",
      "data-service-support",
      "data-service-related",
    ],
    pathRoot: "service",
    requiredPaths: servicePageRequiredPaths,
    requiredContentPaths: ["content.brand.name"],
  });
  assertCreativeServicePageSource(source, {
    candidateId: route.id || "candidate",
  });
}

/**
 * Validate an authored location detail page. The page renders the same sealed
 * site content as the homepage plus one location record, and must keep the
 * coverage language truthful for the listed service area.
 */
export function validateLocationPage(source, route, content) {
  assertPageBriefBinding(source,"location",route,content);
  validateInnerPageSource({
    source,
    route,
    content,
    file: "LocationPage.jsx",
    rootComponent: "LocationPage",
    identifiers: ["content", "location"],
    markers: [
      "data-location-hero",
      "data-location-coverage",
      "data-location-related",
    ],
    pathRoot: "location",
    requiredPaths: locationPageRequiredPaths,
    requiredContentPaths: ["content.brand.name"],
  });
  assertCreativeInnerPageSource(source, {
    candidateId: route.id || "candidate",
    pageLabel: "LocationPage.jsx",
    rootMarker: "data-location-page",
    requireServiceRoute: true,
  });
}

/**
 * Validate an authored services index. The page renders entirely from the
 * sealed homepage content and must expose the confirmed service list as real
 * /services/ routes with the shared conversion path.
 */
export function validateServicesIndexPage(source, route, content) {
  validateInnerPageSource({
    source,
    route,
    content,
    file: "ServicesIndexPage.jsx",
    rootComponent: "ServicesIndexPage",
    identifiers: ["content"],
    markers: ["data-services-index-hero", "data-services-index-list"],
    pathRoot: "",
    requiredPaths: [],
    requiredContentPaths: [
      "content.copy.servicesHeading",
      "content.copy.servicesIntro",
      "content.services",
      "content.brand.name",
    ],
  });
  assertCreativeInnerPageSource(source, {
    candidateId: route.id || "candidate",
    pageLabel: "ServicesIndexPage.jsx",
    rootMarker: "data-services-index",
    requireServiceRoute: true,
  });
}

function validateExperience(source, route, content, visualBrief = {}) {
  assertRepairableSourceSize(source, route, "Experience.jsx");
  syntaxErrorFor(source, route, "Experience.jsx", true);
  const scopeError = scopeErrorFor(source, route);
  if (scopeError) throw new Error(scopeError);
  for (const specifier of importSpecifiers(source))
    if (!allowedImports.has(specifier))
      throw new Error(
        `Candidate ${route.id} uses unapproved import ${specifier}.`,
      );
  const forbidden = [
    [/https?:\/\/|(?:src|href)\s*=\s*["']\/\//iu, "remote URL"],
    [/\bfetch\s*\(/iu, "network request"],
    [/\bXMLHttpRequest\b|\bWebSocket\b/iu, "network primitive"],
    [/\beval\s*\(|\bnew\s+Function\b/iu, "dynamic code"],
    [/<canvas\b|\bthree(?:\s*\.?\s*js)\b/iu, "unapproved rendering engine"],
    [/<script\b/iu, "script element"],
    [
      /<style\b|\sstyle\s*=|\.\.\.\s*\{\s*(?:style\b|\[[^\]]*style[^\]]*\])\s*:/iu,
      "inline styles; visual rules belong in styles.css",
    ],
    [/—/u, "em dash"],
  ];
  for (const [pattern, label] of forbidden)
    if (pattern.test(source))
      throw new Error(`Candidate ${route.id} contains forbidden ${label}.`);
  assertRequiredSectionAnchors(source, route);
  if (
    !/import\s+\{[^}]*\bLeadForm\b[^}]*\}\s+from\s+["']@launchloom\/runtime["']/u.test(
      source,
    )
  )
    throw new Error(
      `Candidate ${route.id} must use the shared LaunchLoom runtime.`,
    );
  if (!/\bLeadForm\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} must render the shared LeadForm runtime surface.`,
    );
  const leadFormCount = (source.match(/<LeadForm\b/gu) || []).length;
  if (leadFormCount !== 1)
    throw new Error(
      `Candidate ${route.id} must render exactly one shared LeadForm in the reference-directed location.`,
    );
  if (!/<LeadForm\b[^>]*\bcontent\s*=\s*\{\s*content\s*\}/u.test(source))
    throw new Error(
      `Candidate ${route.id} must pass sealed content to the shared LeadForm runtime surface.`,
    );
  const helperSealedBindings = validateContentBoundRuntimeHelpers(
    source,
    route,
  );
  validateImageRoleReuse(source, route, content);
  validatePurposefulInteraction(source, route, visualBrief);
  for (const { opening } of collectJsxElements(source).elements) {
    if (jsxOpeningName(opening).toLowerCase() !== "img") continue;
    const altAttribute = jsxAttribute(opening, "alt");
    const initializer = altAttribute?.initializer;
    const expression =
      initializer && ts.isJsxExpression(initializer)
        ? initializer.expression
        : null;
    const invalidExpression =
      initializer &&
      ts.isJsxExpression(initializer) &&
      (!expression ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(expression) && expression.text === "undefined"));
    if (!altAttribute || !initializer || invalidExpression)
      throw new Error(
        `Candidate ${route.id} has an image that must have a usable alt attribute; use alt="" only for decorative or redundant imagery.`,
      );
  }
  const { elements } = collectJsxElements(source);
  const navigations = elements.filter(
    ({ opening }) => jsxOpeningName(opening) === "nav",
  );
  if (route.referenceDna?.complete) {
    if (!navigations.length)
      throw new Error(
        `Candidate ${route.id} must expose a visible native <nav> while preserving its assigned reference navigation geometry.`,
      );
  } else {
    for (const target of ["services", "faqs", "contact"])
      if (
        !navigations.some((navigation) =>
          hasLiteralNavigationAnchor(elements, navigation, target),
        )
      )
        throw new Error(
          `Candidate ${route.id} navigation must expose literal <a href="#${target}"> inside a visible native <nav>.`,
        );
  }
  validateAuthoredUrlAttributes(source, route, content);
  for (const binding of requiredExperienceBindings)
    if (
      !helperSealedBindings.has(binding.token) &&
      !binding.aliases.some((token) => referencesContentPath(source, token))
    )
      throw new Error(
        `Candidate ${route.id} is missing required sealed binding ${binding.token}.`,
      );
  const literals = unsupportedClaimLiterals(source);
  if (literals.length)
    throw new Error(
      `Candidate ${route.id} contains an unsupported claim literal: ${literals[0]}`,
    );
  assertAuthoredCopyClaims(source, route, content, "Experience.jsx");
  const embeddedFact = scalarContentValues(content).find((value) =>
    source.includes(value),
  );
  if (embeddedFact) {
    const matchAt = source.indexOf(embeddedFact);
    const nearby = source
      .slice(
        Math.max(0, matchAt - 80),
        matchAt + embeddedFact.length + 80,
      )
      .replace(/\s+/gu, " ")
      .trim();
    throw new Error(
      `Candidate ${route.id} hardcodes sealed content instead of using a token: ${embeddedFact}. Replace that literal with the matching content binding. Nearby source: ${nearby}`,
    );
  }
}

function validateStyles(source, route, visualBrief = {}) {
  assertRepairableSourceSize(source, route, "styles.css");
  if (
    /<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<style\b/iu.test(source)
  )
    throw new Error(
      `Candidate ${route.id} styles must contain CSS only, not an HTML document.`,
    );
  if (/url\s*\(/iu.test(source) || /@import\b/iu.test(source))
    throw new Error(
      `Candidate ${route.id} CSS must use sealed image content tokens instead of CSS URL resources.`,
    );
  if (/—/u.test(source))
    throw new Error(`Candidate ${route.id} CSS contains an em dash.`);
  if (/(?:^|\n)\s*["']\s*\n?\}\s*$/u.test(source))
    throw new Error(
      `Candidate ${route.id} CSS contains a malformed trailing wrapper.`,
    );
  const typography = visualBrief.typography || {};
  if (typography.heading && !/var\(\s*--font-heading\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} CSS must bind the chosen heading family through var(--font-heading, <palette stack>) so the client font choice applies.`,
    );
  if (typography.body && !/var\(\s*--font-body\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} CSS must bind the chosen body family through var(--font-body, <palette stack>) so the client font choice applies.`,
    );
  if (
    /(?:^|[{};\s])\s*--(?:font-heading|font-body|accent|accent-ink|on-accent)\s*:/u.test(
      source,
    )
  )
    throw new Error(
      `Candidate ${route.id} CSS must not redeclare host typography or accent variables (--font-heading, --font-body, --accent).`,
    );
}

/**
 * Candidate styles are mounted inside the production shell, whose body owns
 * generic tokens such as --ink and --muted for the deterministic renderer.
 * Rename variables declared by the candidate so those local design decisions
 * cannot be overridden by inherited shell tokens. References to host-owned
 * variables remain available when a candidate intentionally consumes them.
 */
export function namespaceCreativeCss(source) {
  const root = postcss.parse(source);
  const declared = new Set();
  root.walkDecls((declaration) => {
    if (/^--[A-Za-z][\w-]*$/u.test(declaration.prop))
      declared.add(declaration.prop);
  });
  if (!declared.size) return source;
  return source.replace(/--[A-Za-z][\w-]*/gu, (token) =>
    declared.has(token) &&
    !token.startsWith("--ll-creative-") &&
    !/^--ll-(?:surface|text|muted-text|link|action|on-action|border|focus)$/.test(
      token,
    )
      ? `--ll-creative-${token.slice(2)}`
      : token,
  );
}

function validateMotion(source, route) {
  assertRepairableSourceSize(source, route, "motion.js");
  syntaxErrorFor(source, route, "motion.js", false);
  for (const specifier of importSpecifiers(source))
    if (!allowedImports.has(specifier))
      throw new Error(
        `Candidate ${route.id} motion uses unapproved import ${specifier}.`,
      );
  if (
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\beval\s*\(/iu.test(source)
  )
    throw new Error(
      `Candidate ${route.id} motion contains an unsafe primitive.`,
    );
  if (!/reducedMotion|prefers-reduced-motion/u.test(source))
    throw new Error(
      `Candidate ${route.id} motion lacks a reduced-motion path.`,
    );
  if (
    /\.(?:textContent|innerHTML|outerHTML)\s*(?:=(?!=)|[+*/%&|^\-]=|\?\?=|\|\|=|&&=)|\.insertAdjacentHTML\s*\(/u.test(
      source,
    )
  )
    throw new Error(
      `Candidate ${route.id} motion must not rewrite visitor-facing content or HTML.`,
    );
  if (
    /\.setAttribute\s*\(\s*["'](?:href|src|action|value|name|id|role)["']/iu.test(
      source,
    )
  )
    throw new Error(
      `Candidate ${route.id} motion must not rewrite URLs, form values, or semantic identity.`,
    );
  for (const match of source.matchAll(
    /\.style\.setProperty\s*\(\s*["']([^"']+)["']/gu,
  ))
    if (!match[1].startsWith("--ll-creative-"))
      throw new Error(
        `Candidate ${route.id} motion may only set isolated --ll-creative-* CSS variables.`,
      );
  if (
    /gsap\.set\(\s*(?:children|sections|sectionElements)\s*,\s*\{[^}]*opacity\s*:\s*0/isu.test(
      source,
    )
  )
    throw new Error(
      `Candidate ${route.id} motion hides required sections before scroll; keep public content visible without JavaScript or scrolling.`,
    );
  if (!/export\s+(?:function|const)\s+mountExperienceMotion\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} motion must export mountExperienceMotion.`,
    );
  if (
    /<[A-Za-z][^>]*>/u.test(source) ||
    /\b(?:React|useState|useEffect|LeadForm)\b/u.test(source)
  )
    throw new Error(
      `Candidate ${route.id} motion must be JavaScript without JSX or React components.`,
    );
}

/**
 * @param {{files?: {experience?: string, styles?: string, motion?: string, servicePage?: string, locationPage?: string, servicesIndexPage?: string}, route?: Record<string, any>, content?: Record<string, any>, visualBrief?: Record<string, any>}} [options]
 * @returns {{files: {experience: string, styles: string, motion: string}, referenceFidelity: Record<string, any> | null}}
 */
export function validateProductionCandidateFiles({
  files,
  route = {},
  content = {},
  visualBrief = {},
} = {}) {
  const experience = normalizeAuthoredSource(String(files?.experience || ""));
  const styles = normalizeAuthoredSource(String(files?.styles || ""));
  const motion = normalizeAuthoredSource(String(files?.motion || ""));
  const servicePage = normalizeAuthoredSource(String(files?.servicePage || ""));
  const locationPage = normalizeAuthoredSource(
    String(files?.locationPage || ""),
  );
  const servicesIndexPage = normalizeAuthoredSource(
    String(files?.servicesIndexPage || ""),
  );
  if (!experience || !styles || !motion)
    throw new Error("A complete creative candidate file bundle is required.");
  const referenceDna = route.referenceDna
    ? validateReferenceDna(route.referenceDna, { requireEvidence: true })
    : null;
  validateExperience(experience, route, content, visualBrief);
  validateStyles(styles, route, visualBrief);
  validateMotion(motion, route);
  if (servicePage) validateServicePage(servicePage, route, content);
  if (locationPage) validateLocationPage(locationPage, route, content);
  if (servicesIndexPage)
    validateServicesIndexPage(servicesIndexPage, route, content);
  const isolatedStyles = namespaceCreativeCss(styles);
  assertRepairableSourceSize(isolatedStyles, route, "styles.css");
  let referenceFidelity = null;
  if (referenceDna) {
    referenceFidelity = validateReferenceCandidate({
      referenceDna,
      experienceSource: experience,
      stylesSource: isolatedStyles,
      motionSource: motion,
    });
    if (!referenceFidelity.pass)
      throw new Error(
        `Reference-safe source validation failed for ${route.id || "candidate"}: ${referenceFidelity.hardFindings.map((item) => item.message).join(" | ")}`,
      );
  }
  return {
    files: {
      experience,
      styles: isolatedStyles,
      motion,
      ...(servicePage ? { servicePage } : {}),
      ...(locationPage ? { locationPage } : {}),
      ...(servicesIndexPage ? { servicesIndexPage } : {}),
    },
    referenceFidelity,
  };
}

function authorRules() {
  return [
    "Do not hardcode business facts or marketing copy. Render all visitor-facing business content through the supplied content tokens.",
    "Use only React, @launchloom/runtime, GSAP, and GSAP ScrollTrigger in Experience.jsx. The deterministic host imports and mounts motion.js; do not import or invoke ./motion.js from Experience.jsx.",
    "Do not use remote URLs, network calls, canvas, Three.js, dynamic code, remote scripts, or new packages.",
    "Keep literal Services, FAQs, and Contact section anchors in the page. For dossier-backed routes, let the primary navigation follow the assigned reference geometry instead of forcing all three anchors into one conventional menu. Put conversion in the hero or immediately after it.",
    "Import LeadForm from @launchloom/runtime and render exactly one instance in the reference-directed location: when desktop or mobile compositionTopology is utility-panel, place it in that utility panel inside the hero and retain the contact section for contact details; otherwise place it inside the contact section. Never fake a form or create a second lead endpoint.",
    EARLY_CONVERSION_OUTPUT_CONTRACT,
    REFERENCE_PROVENANCE_OUTPUT_CONTRACT,
    "Every content-bound @launchloom/runtime helper must receive the sealed object exactly as content={content}: render FAQList, ContactLinks, LocationMap, and SocialProof with content={content}; pass runtime={runtime} to SocialProof when rendering signed live reviews.",
    "Use one H1, semantic landmarks, keyboard-visible controls, responsive recomposition, and a reduced-motion equivalent.",
    `Keep every individual authored source file at or below ${MAX_REPAIR_FILE_SOURCE_CHARS} characters so the safe bounded repair path can represent it. Prefer concise markup and avoid repeated CSS rules; simplify an oversized file without changing the assigned composition.`,
    'Phone and email links must use their sealed tokens. Telephone links may prefix content.brand.phone with tel: and may normalize it only with replace(/[^\\d+]/g, "") or replace(/[^0-9+]/g, ""); a local const href is allowed only when its initializer is that exact safe expression. Do not compute URLs from any other data.',
    "For service-page links, use the validator-approved same-origin form href={`/services/${service.slug}/`} only inside a direct map over a sealed service list. Do not search for a selected service, bind its slug into a computed href, concatenate arbitrary path parts, or derive href values from unsealed input.",
    "The sealed hero image tokens may be empty. Render each optional image only inside a direct truthiness guard for that same token, such as {content.hero.secondaryImage && <img src={content.hero.secondaryImage} ... />}; do not emit an img with a blank src, remote URL, or a fallback that reuses the hero for a missing supporting image.",
    'Give every <img> a usable alt attribute. Use concise descriptive text for informative images. Use alt="" only for purely decorative images or when adjacent text fully conveys the image\'s relevant information. Preserve supplied or reviewed descriptions for known informative assets; do not replace them with generic filler.',
    "Do not silently reuse the primary hero image to fill missing secondary or tertiary image roles. When supporting image tokens are unavailable, keep the hero unique and adapt that chapter to a non-duplicative text-led or graphic treatment that still preserves the assigned reference mechanics.",
    "When the client visual brief explicitly requests a purposeful interaction, guide, selector, chooser, or navigator, implement a clearly labeled stateful native interaction marked with data-purposeful-interaction. Keep a useful visible default/static state. FAQ disclosure, LeadForm, ChatLauncher, ordinary navigation, or an image carousel alone do not satisfy that request; use only sealed service and decision-support content and never invent advice.",
    "Never hide required sections or their content with opacity, visibility, or display before a scroll trigger. The full page must remain readable without JavaScript and in a no-scroll screenshot; animate visible content into place instead.",
    "The complete header and hero must fit at 1536x864 and 1366x768 at 100 percent zoom. Keep the hero compact and preserve the assigned composition; a reference-required utility-panel form may appear in the first fold but must remain concise and usable.",
    "Do not use em dashes, numbered service cards, bento grids, generic card walls, glassmorphism, or decorative motion without narrative purpose.",
  ].join("\n");
}

function stageValue(value, key, stage) {
  if (!value || typeof value !== "object")
    throw new Error(`Model returned invalid ${stage} output.`);
  return asText(value[key], `${stage}.${key}`);
}

async function generateStageValue(generate, request, key, stage) {
  let result;
  try {
    result = await generate(request);
    return { value: stageValue(result, key, stage), repaired: false };
  } catch (error) {
    result = await generate({
      ...request,
      validationError: error instanceof Error ? error.message : String(error),
      previousSource: boundedRepairContext(result),
    });
    return { value: stageValue(result, key, stage), repaired: true };
  }
}

async function generateContract(generate, request) {
  let result;
  try {
    result = await generate(request);
    return {
      designContract: stageValue(result, "designContract", "contract"),
      designRationale: stageValue(result, "designRationale", "contract"),
      repaired: false,
    };
  } catch (error) {
    result = await generate({
      ...request,
      validationError: error instanceof Error ? error.message : String(error),
      previousSource: contractRepairSummary(result),
    });
    return {
      designContract: stageValue(result, "designContract", "contract"),
      designRationale: stageValue(result, "designRationale", "contract"),
      repaired: true,
    };
  }
}

async function generateValidatedSource({ generate, request, stage, validate }) {
  let source = "";
  let repaired = false;
  let validationError = "";
  for (let cycle = 0; cycle <= 2; cycle += 1) {
    const result = await generateStageValue(
      generate,
      cycle === 0
        ? request
        : {
            ...request,
            validationError: `Reference-safe ${stage} repair cycle ${cycle}/2. Fix this exact validation error without changing the assigned composition: ${validationError}`,
            previousSource: source,
          },
      "content",
      stage,
    );
    source = normalizeAuthoredSource(result.value);
    repaired ||= result.repaired || cycle > 0;
    try {
      validate(source, request.route, request.visualBrief);
      const candidateSource =
        stage === "styles" ? namespaceCreativeCss(source) : source;
      const fileName = {
        experience: "Experience.jsx",
        service: "ServicePage.jsx",
        location: "LocationPage.jsx",
        "service-index": "ServicesIndexPage.jsx",
        styles: "styles.css",
        motion: "motion.js",
      }[stage];
      assertRepairableSourceSize(candidateSource, request.route, fileName);
      return {
        source: candidateSource,
        repaired,
      };
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
      if (cycle === 2) throw error;
    }
  }
  throw new Error(
    `Candidate ${request.route.id} ${stage} validation did not complete.`,
  );
}

async function generateMotionSource({ generate, request, validate }) {
  try {
    return await generateValidatedSource({
      generate,
      request,
      stage: "motion",
      validate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/(?:No motion content returned|invalid syntax|motion must|motion lacks|motion contains)/iu.test(
        message,
      )
    )
      throw error;
    validate(reducedMotionFallback(), request.route);
    return { source: reducedMotionFallback(), repaired: true, fallback: true };
  }
}

function createGenerationLimiter(generate, maxConcurrency = 2) {
  const queue = [];
  let active = 0;

  const drain = () => {
    while (active < maxConcurrency && queue.length) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(() => generate(job.request))
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return (request) =>
    new Promise((resolve, reject) => {
      queue.push({ request, resolve, reject });
      drain();
    });
}

function safeAuthorFailureStack(error) {
  if (!(error instanceof Error) || typeof error.stack !== "string")
    return undefined;
  const frames = error.stack
    .split("\n")
    .slice(1, 13)
    .map((frame) => frame.trim().replaceAll(process.cwd(), "<workspace>"));
  return frames.length ? frames.join("\n").slice(0, 2400) : undefined;
}

/**
 * Deep module interface for Phase 2 production authorship.
 *
 * @param {{
 *   site: Record<string, any>;
 *   inspirationPack: Record<string, any>;
 *   generate: (request: AuthorStageRequest) => Promise<Record<string, any>>;
 *   model?: string;
 *   creativeSession?: Record<string, any> | null;
 *   testProfile?: "full" | "full-preview" | "seo-only" | "creative-only";
 * }} input
 */
export async function authorExperienceCandidates({
  site,
  inspirationPack,
  generate,
  model = "openai/gpt-6-luna",
  creativeSession = null,
  testProfile = "full",
}) {
  if (typeof generate !== "function")
    throw new Error("A generation adapter is required.");
  const contentManifest = buildCreativeContentManifest(site);
  const rules = authorRules();

  const policy = resolvePipelineTestPolicy({ profile: testProfile });
  // Validate the complete reference contract first; a focused test limits
  // provider work, not reference/source safety or normal intake diversity.
  const routes = assertInspirationPack(inspirationPack).slice(0, policy.candidateCount);
  // OpenRouter's in-flight budget is shared across the account. Keep the
  // independent candidates, but never put more than two model stages in
  // flight at once. This protects the creative lane without falling back to a
  // deterministic renderer.
  const configuredConcurrency = Number(
    process.env.CREATIVE_EXPERIENCE_MAX_IN_FLIGHT || 2,
  );
  const maxConcurrency = Number.isInteger(configuredConcurrency)
    ? Math.min(2, Math.max(1, configuredConcurrency))
    : 2;
  const limitedGenerate = createGenerationLimiter(generate, maxConcurrency);
  const authoredResults = await Promise.allSettled(
    routes.map(async (route, index) => {
      const routeContentManifest = buildCreativeContentManifest(site, route);
      const content = routeContentManifest.values;
      const base = {
        route,
        contentTokens,
        contentShape: content,
        visualBrief: routeContentManifest.visualBrief,
        rules,
      };
      const contractResult = await generateContract(limitedGenerate, {
        ...base,
        stage: "contract",
      });
      const designContract = contractResult.designContract;
      const designRationale = contractResult.designRationale;
      const experienceResult = await generateStageValue(
        limitedGenerate,
        { ...base, stage: "experience", designContract },
        "content",
        "experience",
      );
      let experience = normalizeAuthoredSource(experienceResult.value);
      let complianceRepaired =
        contractResult.repaired || experienceResult.repaired;
      try {
        validateExperience(
          experience,
          route,
          content,
          routeContentManifest.visualBrief,
        );
      } catch (error) {
        complianceRepaired = true;
        let repairedExperience;
        try {
          repairedExperience = await generateStageValue(
            limitedGenerate,
            {
              ...base,
              stage: "experience",
              designContract,
              previousSource: experience,
              validationError:
                error instanceof Error ? error.message : String(error),
            },
            "content",
            "experience",
          );
          experience = normalizeAuthoredSource(repairedExperience.value);
          validateExperience(
            experience,
            route,
            content,
            routeContentManifest.visualBrief,
          );
        } catch (repairError) {
          const repairMessage =
            repairError instanceof Error
              ? repairError.message
              : String(repairError);
          const finalRepair = await generateStageValue(
            limitedGenerate,
            {
              ...base,
              stage: "experience",
              designContract,
              previousSource: experience,
              validationError: `The first repair still failed validation: ${repairMessage}. This is the final repair attempt. Return complete JSX with every listed contract requirement fixed. Give every image a usable alt attribute; use an empty alt only for decorative imagery or when adjacent text fully conveys its relevant information, and preserve reviewed descriptions for informative assets.`,
            },
            "content",
            "experience",
          );
          experience = normalizeAuthoredSource(finalRepair.value);
          try {
            validateExperience(
              experience,
              route,
              content,
              routeContentManifest.visualBrief,
            );
          } catch (finalRepairError) {
            const finalRepairMessage =
              finalRepairError instanceof Error
                ? finalRepairError.message
                : String(finalRepairError);
            const lastRepair = await generateStageValue(
              limitedGenerate,
              {
                ...base,
                stage: "experience",
                designContract,
                previousSource: experience,
                validationError: `The previous validation repairs still failed: ${finalRepairMessage}. This is the final bounded retry. Correct that exact source-safety issue while preserving the assigned composition, sealed content bindings, required sections, and all other validated structure.`,
              },
              "content",
              "experience",
            );
            experience = normalizeAuthoredSource(lastRepair.value);
            validateExperience(
              experience,
              route,
              content,
              routeContentManifest.visualBrief,
            );
          }
        }
      }
      let referenceRepairCycles = 0;
      if (route.referenceDna?.complete) {
        let fidelity = validateReferenceCandidate({
          referenceDna: route.referenceDna,
          experienceSource: experience,
          // The pre-style repair pass validates Experience-owned reference
          // mechanics. Neutral placeholders satisfy only the cross-stage
          // presence checks; the real CSS/motion are fully validated below.
          stylesSource: "@media (max-width: 1px) {}",
          motionSource: "export function mountExperienceMotion() {}",
        });
        while (
          (!fidelity.pass || !fidelity.visualPass) &&
          referenceRepairCycles < 2
        ) {
          referenceRepairCycles += 1;
          const repaired = await generateStageValue(
            limitedGenerate,
            {
              ...base,
              stage: "experience",
              designContract,
              previousSource: experience,
              validationError: `Reference fidelity repair cycle ${referenceRepairCycles}/2. Fix every source-level finding without simplifying the assigned composition. CSS and motion will be authored only after this structure is stable: ${fidelity.findings.map((item) => item.message).join(" | ")}`,
            },
            "content",
            "experience",
          );
          experience = normalizeAuthoredSource(repaired.value);
          complianceRepaired = true;
          validateExperience(
            experience,
            route,
            content,
            routeContentManifest.visualBrief,
          );
          fidelity = validateReferenceCandidate({
            referenceDna: route.referenceDna,
            experienceSource: experience,
            stylesSource: "@media (max-width: 1px) {}",
            motionSource: "export function mountExperienceMotion() {}",
          });
        }
        if (!fidelity.pass || !fidelity.visualPass)
          throw new Error(
            `Reference fidelity failed for ${route.id}: ${fidelity.findings.map((item) => item.message).join(" | ")}`,
          );
      }
      const servicePageOutput = await generateValidatedSource({
        generate: limitedGenerate,
        request: {
          ...base,
          stage: "service",
          designContract,
          experienceSource: experience,
        },
        stage: "service",
        validate: (source, serviceRoute) =>
          validateServicePage(source, serviceRoute, content),
      });
      const servicePage = servicePageOutput.source;
      complianceRepaired ||= servicePageOutput.repaired;
      const locations = content.locations || [];
      const authorLocationPage =
        site.industry === "home-services" && locations.length > 0;
      let locationPage = "";
      if (authorLocationPage) {
        const locationPageOutput = await generateValidatedSource({
          generate: limitedGenerate,
          request: {
            ...base,
            stage: "location",
            designContract,
            experienceSource: experience,
            servicePageSource: servicePage,
          },
          stage: "location",
          validate: (source, locationRoute) =>
            validateLocationPage(source, locationRoute, content),
        });
        locationPage = locationPageOutput.source;
        complianceRepaired ||= locationPageOutput.repaired;
      }
      const servicesIndexOutput = await generateValidatedSource({
        generate: limitedGenerate,
        request: {
          ...base,
          stage: "service-index",
          designContract,
          experienceSource: experience,
          servicePageSource: servicePage,
          locationPageSource: locationPage,
        },
        stage: "service-index",
        validate: (source, serviceIndexRoute) =>
          validateServicesIndexPage(source, serviceIndexRoute, content),
      });
      const servicesIndexPage = servicesIndexOutput.source;
      complianceRepaired ||= servicesIndexOutput.repaired;
      const [stylesOutput, motionOutput] = await Promise.all([
        generateValidatedSource({
          generate: limitedGenerate,
          request: {
            ...base,
            stage: "styles",
            designContract,
            experienceSource: experience,
            servicePageSource: servicePage,
            locationPageSource: locationPage,
            servicesIndexSource: servicesIndexPage,
          },
          stage: "styles",
          validate: validateStyles,
        }),
        generateMotionSource({
          generate: limitedGenerate,
          request: {
            ...base,
            stage: "motion",
            designContract,
            experienceSource: experience,
          },
          validate: validateMotion,
        }),
      ]);
      const styles = stylesOutput.source;
      const motion = motionOutput.source;
      complianceRepaired ||= stylesOutput.repaired || motionOutput.repaired;
      if (route.referenceDna?.complete) {
        const finalFidelity = validateReferenceCandidate({
          referenceDna: route.referenceDna,
          experienceSource: experience,
          stylesSource: styles,
          motionSource: motion,
        });
        if (!finalFidelity.pass || !finalFidelity.visualPass)
          throw new Error(
            `Reference fidelity failed for ${route.id}: ${finalFidelity.findings.map((item) => item.message).join(" | ")}`,
          );
      }
      const creativeManifest = buildCandidateManifest({
        candidate: {
          candidateId: `candidate-${String.fromCharCode(97 + index)}`,
        },
        route,
        model,
        contentManifestDigest: routeContentManifest.digest,
        assets: [
          "content.hero.image",
          "content.hero.secondaryImage",
          "content.hero.tertiaryImage",
        ],
      });
      const metadata = {
        version: 2,
        candidateId: `candidate-${String.fromCharCode(97 + index)}`,
        routeId: route.id,
        routeLabel: route.label,
        model,
        reasoning: creativeSession
          ? {
              effort: creativeSession.reasoningEffort,
              recommendedEffort: creativeSession.recommendedEffort,
              mode: creativeSession.mode,
              sessionId: creativeSession.sessionId,
              policyVersion: creativeSession.reasoningPolicyVersion,
              selectorModelVersion: creativeSession.selectorModelVersion,
            }
          : null,
        signature: route.signature,
        navigation: route.navigation,
        heroGeometry: route.heroGeometry,
        heroArchetype: route.heroArchetype || "",
        referenceIds: Array.isArray(route.referenceIds)
          ? [...route.referenceIds]
          : [],
        referenceDossierId:
          "referenceDossier" in route ? route.referenceDossier?.id || "" : "",
        servicePresentation: route.servicePresentation,
        sectionRhythm: route.sectionRhythm,
        typographyCategory: route.typographyCategory,
        imageStrategy: route.imageStrategy,
        motionOpportunity: route.motionOpportunity,
        familyId: route.familyId,
        referenceFamilyId: route.referenceDna.familyId,
        referenceName: route.referenceDna.referenceName,
        intakeFitScore: Number(route.intakeFitScore || 0),
        explicitReferenceMatch: route.explicitReferenceMatch === true,
        referenceDna: route.referenceDna,
        mobileBehavior: route.mobileBehavior,
        fingerprint: creativeManifest.fingerprint,
        complianceRepaired,
        referenceRepairCycles,
        motionFallback: Boolean(motionOutput.fallback),
        servicePageAuthored: true,
        locationPageAuthored: Boolean(locationPage),
        servicesIndexAuthored: true,
        contentManifestDigest: routeContentManifest.digest,
        contentManifestPath: "content-manifest.json",
        allowedImports: [...allowedImports],
        runtimeInstrumentation: {
          rootAttribute: "data-model-experience",
          rootValue: route.id,
        },
        creativeManifest,
      };
      const contract = {
        version: 2,
        route,
        designContract,
        designRationale,
        reasoning: creativeSession
          ? {
              effort: creativeSession.reasoningEffort,
              recommendedEffort: creativeSession.recommendedEffort,
              mode: creativeSession.mode,
              sessionId: creativeSession.sessionId,
              policyVersion: creativeSession.reasoningPolicyVersion,
            }
          : null,
        rules: rules.split("\n"),
        contentTokens,
        creativeManifest,
      };
      return {
        id: metadata.candidateId,
        directory: candidateDirectories[index],
        metadata,
        files: {
          "content-manifest.json": `${JSON.stringify(routeContentManifest, null, 2)}\n`,
          "contract.json": `${JSON.stringify(contract, null, 2)}\n`,
          "Experience.jsx": `${experience}\n`,
          "ServicePage.jsx": `${servicePage}\n`,
          ...(locationPage ? { "LocationPage.jsx": `${locationPage}\n` } : {}),
          "ServicesIndexPage.jsx": `${servicesIndexPage}\n`,
          "styles.css": `${styles}\n`,
          "motion.js": `${motion}\n`,
          "metadata.json": `${JSON.stringify(metadata, null, 2)}\n`,
        },
      };
    }),
  );

  const candidates = [];
  const failures = [];
  for (const [index, result] of authoredResults.entries()) {
    if (result.status === "fulfilled") {
      candidates.push(result.value);
      continue;
    }
    const failure = {
      routeId: routes[index].id,
      candidateId: `candidate-${String.fromCharCode(97 + index)}`,
      error: safeAuthorFailureText(result.reason, 2000),
    };
    const stack = safeAuthorFailureStack(result.reason);
    if (stack) failure.stack = safeAuthorFailureText(stack, 2400);
    failures.push(failure);
  }
  if (!candidates.length) {
    const error = new Error(
      safeAuthorFailureText(
        `All creative candidates failed: ${failures.map((failure) => `${failure.routeId}: ${failure.error}`).join(" | ")}`,
      ),
    );
    error.failures = failures;
    throw error;
  }

  return {
    version: 1,
    model,
    selectionKey: inspirationPack.selectionKey || "",
    contentManifest,
    candidates,
    failures,
  };
}
