import crypto from "node:crypto";
import ts from "typescript";
import {
  assertIndependentRoutes,
  buildCandidateManifest,
  buildRouteContract,
} from "./creative-compiler.mjs";
import { validateReferenceDna } from "./reference-dna.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";

/**
 * @typedef {"contract" | "experience" | "styles" | "motion"} AuthorStage
 * @typedef {{
 *   stage: AuthorStage;
 *   route: Record<string, any>;
 *   contentTokens: string[];
 *   contentShape: Record<string, any>;
 *   rules: string;
 *   designContract?: string;
 *   experienceSource?: string;
 *   validationError?: string;
 *   previousSource?: string;
 * }} AuthorStageRequest
 */

const candidateDirectories = ["candidate-a", "candidate-b", "candidate-c"];
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function contentShape(site, route) {
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
      image: assets.photoOne || routeImages.hero || images.hero || images.secondary || "",
      secondaryImage: assets.photoTwo || routeImages.secondary || images.secondary || "",
      tertiaryImage: assets.photoThree || routeImages.tertiary || images.tertiary || "",
      offer: String(business.offer || ""),
    },
    services: site.services || [],
    proof: (site.differentiators || []).slice(0, 3).map(String),
    process: (site.conversion?.process || []).slice(0, 4).map(String),
    faqs: (site.conversion?.faqs || []).slice(0, 8),
    locations: site.locations || [],
    copy,
    businessDescription: String(business.description || ""),
    showLocationMap:
      String(business.primaryCta || "").trim().toLowerCase() ===
        "get directions" &&
      (Boolean(String(business.placeId || "").trim()) ||
        /(?:^|,\s*)\d+[a-z]?\s+[a-z]/i.test(String(business.address || "").trim())),
    hasSocialProof:
      socialProofPoints.length > 0 ||
      fallbackProofPoints.length > 0 ||
      hasLiveGoogleProof,
  };
}

function assertInspirationPack(pack) {
  if (!pack || !Array.isArray(pack.routes) || pack.routes.length !== 3)
    throw new Error("Creative authorship requires exactly three inspiration routes.");
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
  return contracts;
}

function asText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Model stage returned no ${label}.`);
  return value.trim();
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
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    " ",
  );
  throw new Error(`Candidate ${route.id} ${fileName} has invalid syntax: ${message}`);
}

function bindingPatternContains(pattern, name) {
  if (ts.isIdentifier(pattern)) return pattern.text === name;
  if (ts.isBindingElement(pattern))
    return bindingPatternContains(pattern.name, name);
  if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern))
    return pattern.elements.some((element) => bindingPatternContains(element, name));
  return false;
}

function functionHasParameter(node, name) {
  return node.parameters.some((parameter) =>
    bindingPatternContains(parameter.name, name),
  );
}

function functionUsesUnboundContent(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (child !== node && ts.isFunctionLike(child)) return;
    if (ts.isIdentifier(child) && child.text === "content") {
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

function scopeErrorFor(source, route) {
  const file = ts.createSourceFile(
    "Experience.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  for (const statement of file.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.name.text !== "Experience" &&
      !functionHasParameter(statement, "content") &&
      functionUsesUnboundContent(statement)
    )
      return `Candidate ${route.id} component ${statement.name.text} references content without receiving it.`;
  }
}

function replaceEmptyImageAlt(source) {
  return source.replace(/\balt\s*=\s*(["'])\s*\1/gu, 'alt="Decorative image"');
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

function validateExperience(source, route, content) {
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
    [/<canvas\b|\bthree(?:\.js)?\b/iu, "unapproved rendering engine"],
    [/<script\b/iu, "script element"],
    [/—/u, "em dash"],
  ];
  for (const [pattern, label] of forbidden)
    if (pattern.test(source))
      throw new Error(`Candidate ${route.id} contains forbidden ${label}.`);
  for (const marker of [
    "data-hero",
    "data-early-conversion",
    'id="services"',
    'id="faqs"',
    'id="contact"',
  ])
    if (!source.includes(marker))
      throw new Error(
        `Candidate ${route.id} is missing required marker ${marker}.`,
      );
  if (!/import\s+\{[^}]*\bLeadForm\b[^}]*\}\s+from\s+["']@launchloom\/runtime["']/u.test(source))
    throw new Error(`Candidate ${route.id} must use the shared LaunchLoom runtime.`);
  if (!/\bLeadForm\b/u.test(source))
    throw new Error(`Candidate ${route.id} must render the shared LeadForm runtime surface.`);
  const leadFormCount = (source.match(/<LeadForm\b/gu) || []).length;
  if (leadFormCount !== 1)
    throw new Error(
      `Candidate ${route.id} must render exactly one shared LeadForm in the contact section; keep the hero conversion as a compact link.`,
    );
  if (!/<LeadForm\b[^>]*\bcontent\s*=\s*\{\s*content\s*\}/u.test(source))
    throw new Error(
      `Candidate ${route.id} must pass sealed content to the shared LeadForm runtime surface.`,
    );
  if (/\balt\s*=\s*["']\s*["']/iu.test(source))
    throw new Error(`Candidate ${route.id} contains an empty image alt attribute.`);
  for (const target of ["services", "faqs", "contact"])
    if (!new RegExp(`href\\s*=\\s*["']#${target}["']`, "u").test(source))
      throw new Error(
        `Candidate ${route.id} navigation must expose href="#${target}".`,
      );
  if (!/id\s*=\s*["']contact["'][\s\S]{0,5000}<LeadForm\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} must render the shared LeadForm inside the contact section, not in the hero.`,
    );
  for (const binding of requiredExperienceBindings)
    if (!binding.aliases.some((token) => referencesContentPath(source, token)))
      throw new Error(
        `Candidate ${route.id} is missing required sealed binding ${binding.token}.`,
      );
  const literals = unsupportedClaimLiterals(source);
  if (literals.length)
    throw new Error(
      `Candidate ${route.id} contains an unsupported claim literal: ${literals[0]}`,
    );
  const embeddedFact = scalarContentValues(content).find((value) =>
    source.includes(value),
  );
  if (embeddedFact)
    throw new Error(
      `Candidate ${route.id} hardcodes sealed content instead of using a token: ${embeddedFact}`,
    );
}

function validateStyles(source, route) {
  if (/<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<style\b/iu.test(source))
    throw new Error(`Candidate ${route.id} styles must contain CSS only, not an HTML document.`);
  if (/url\s*\(\s*["']?(?:https?:)?\/\//iu.test(source))
    throw new Error(`Candidate ${route.id} CSS contains a remote URL.`);
  if (/—/u.test(source))
    throw new Error(`Candidate ${route.id} CSS contains an em dash.`);
  if (/(?:^|\n)\s*["']\s*\n?\}\s*$/u.test(source))
    throw new Error(`Candidate ${route.id} CSS contains a malformed trailing wrapper.`);
}

/**
 * Candidate styles are mounted inside the production shell, whose body owns
 * generic tokens such as --ink and --muted for the deterministic renderer.
 * Rename variables declared by the candidate so those local design decisions
 * cannot be overridden by inherited shell tokens. References to host-owned
 * variables remain available when a candidate intentionally consumes them.
 */
export function namespaceCreativeCss(source) {
  const declared = new Set(
    [...source.matchAll(/(?:^|[;{])\s*(--[A-Za-z][\w-]*)\s*:/gu)].map(
      (match) => match[1],
    ),
  );
  if (!declared.size) return source;
  return source.replace(/--[A-Za-z][\w-]*/gu, (token) =>
    declared.has(token) && !token.startsWith("--ll-creative-")
      ? `--ll-creative-${token.slice(2)}`
      : token,
  );
}

function validateMotion(source, route) {
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
  if (/<[A-Za-z][^>]*>/u.test(source) || /\b(?:React|useState|useEffect|LeadForm)\b/u.test(source))
    throw new Error(`Candidate ${route.id} motion must be JavaScript without JSX or React components.`);
}

function authorRules() {
  return [
    "Do not hardcode business facts or marketing copy. Render all visitor-facing business content through the supplied content tokens.",
    "Use only React, @launchloom/runtime, GSAP, and GSAP ScrollTrigger in Experience.jsx. The deterministic host imports and mounts motion.js; do not import or invoke ./motion.js from Experience.jsx.",
    "Do not use remote URLs, network calls, canvas, Three.js, dynamic code, remote scripts, or new packages.",
    "Expose Services, FAQs, and Contact navigation. Put conversion in the hero or immediately after it.",
    "Import LeadForm from @launchloom/runtime and render exactly one instance inside the contact section; use a compact anchor CTA for early conversion and do not fake a form or create a second lead endpoint.",
    "Use one H1, semantic landmarks, keyboard-visible controls, responsive recomposition, and a reduced-motion equivalent.",
    "Never hide required sections or their content with opacity, visibility, or display before a scroll trigger. The full page must remain readable without JavaScript and in a no-scroll screenshot; animate visible content into place instead.",
    "The complete header and hero must fit at 1536x864 and 1366x768 at 100 percent zoom. Keep the hero compact: no full LeadForm, service list, or long-copy block in the first fold.",
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
      previousSource: result
        ? JSON.stringify(result).slice(0, 12000)
        : "No valid structured output was returned.",
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
      previousSource: result
        ? JSON.stringify(result).slice(0, 12000)
        : "No valid structured output was returned.",
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
      validate(source, request.route);
      return {
        source: stage === "styles" ? namespaceCreativeCss(source) : source,
        repaired,
      };
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
      if (cycle === 2) throw error;
    }
  }
  throw new Error(`Candidate ${request.route.id} ${stage} validation did not complete.`);
}

async function generateMotionSource({ generate, request, validate }) {
  try {
    return await generateValidatedSource({ generate, request, stage: "motion", validate });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/(?:No motion content returned|invalid syntax|motion must|motion lacks|motion contains)/iu.test(message))
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

/**
 * Deep module interface for Phase 2 production authorship.
 *
 * @param {{
 *   site: Record<string, any>;
 *   inspirationPack: Record<string, any>;
 *   generate: (request: AuthorStageRequest) => Promise<Record<string, any>>;
 *   model?: string;
 * }} input
 */
export async function authorExperienceCandidates({
  site,
  inspirationPack,
  generate,
  model = "openai/gpt-5.6-luna",
}) {
  if (typeof generate !== "function")
    throw new Error("A generation adapter is required.");
  const baseContent = contentShape(site);
  const manifest = {
    version: 1,
    values: baseContent,
    tokens: contentTokenDefinitions.map(([token, type]) => ({ token, type })),
  };
  const contentManifest = { ...manifest, digest: digest(manifest) };
  const rules = authorRules();

  const routes = assertInspirationPack(inspirationPack).map((route) =>
    buildRouteContract(route),
  );
  // OpenRouter's in-flight budget is shared across the account. Keep the
  // independent candidates, but never put more than two model stages in
  // flight at once. This protects the creative lane without falling back to a
  // deterministic renderer.
  const limitedGenerate = createGenerationLimiter(generate, 2);
  const authoredResults = await Promise.allSettled(
    routes.map(async (route, index) => {
      const content = contentShape(site, route);
      const routeManifest = {
        version: 1,
        values: content,
        tokens: contentTokenDefinitions.map(([token, type]) => ({ token, type })),
      };
      const routeContentManifest = { ...routeManifest, digest: digest(routeManifest) };
      const base = { route, contentTokens, contentShape: content, rules };
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
        validateExperience(experience, route, content);
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
          validateExperience(experience, route, content);
        } catch (repairError) {
          const repairMessage =
            repairError instanceof Error ? repairError.message : String(repairError);
          if (/empty image alt attribute/iu.test(repairMessage)) {
            experience = replaceEmptyImageAlt(experience);
            validateExperience(experience, route, content);
          } else {
            const finalRepair = await generateStageValue(
              limitedGenerate,
              {
                ...base,
                stage: "experience",
                designContract,
                previousSource: experience,
                validationError: `The first repair still failed validation: ${repairMessage}. This is the final repair attempt. Return complete JSX with every listed contract requirement fixed.`,
              },
              "content",
              "experience",
            );
            experience = normalizeAuthoredSource(finalRepair.value);
            try {
              validateExperience(experience, route, content);
            } catch (finalError) {
              const finalMessage =
                finalError instanceof Error ? finalError.message : String(finalError);
              if (!/empty image alt attribute/iu.test(finalMessage)) throw finalError;
              experience = replaceEmptyImageAlt(experience);
              validateExperience(experience, route, content);
            }
          }
        }
      }
      const [stylesOutput, motionOutput] = await Promise.all([
        generateValidatedSource({
          generate: limitedGenerate,
          request: {
            ...base,
            stage: "styles",
            designContract,
            experienceSource: experience,
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
      let referenceRepairCycles = 0;
      if (route.referenceDna?.complete) {
        let fidelity = validateReferenceCandidate({ referenceDna: route.referenceDna, experienceSource: experience, stylesSource: styles, motionSource: motion });
        while (!fidelity.pass && referenceRepairCycles < 2) {
          referenceRepairCycles += 1;
          const repaired = await generateStageValue(
            limitedGenerate,
            {
              ...base,
              stage: "experience",
              designContract,
              previousSource: experience,
              validationError: `Reference fidelity repair cycle ${referenceRepairCycles}/2. Fix every finding without simplifying the assigned composition: ${fidelity.findings.map((item) => item.message).join(" | ")}`,
            },
            "content",
            "experience",
          );
          experience = normalizeAuthoredSource(repaired.value);
          complianceRepaired = true;
          validateExperience(experience, route, content);
          fidelity = validateReferenceCandidate({ referenceDna: route.referenceDna, experienceSource: experience, stylesSource: styles, motionSource: motion });
        }
        if (!fidelity.pass)
          throw new Error(`Reference fidelity failed for ${route.id}: ${fidelity.findings.map((item) => item.message).join(" | ")}`);
      }
      const creativeManifest = buildCandidateManifest({
        candidate: { candidateId: `candidate-${String.fromCharCode(97 + index)}` },
        route,
        model,
        contentManifestDigest: routeContentManifest.digest,
        assets: ["content.hero.image", "content.hero.secondaryImage", "content.hero.tertiaryImage"],
      });
      const metadata = {
        version: 2,
        candidateId: `candidate-${String.fromCharCode(97 + index)}`,
        routeId: route.id,
        routeLabel: route.label,
        model,
        signature: route.signature,
        navigation: route.navigation,
        heroGeometry: route.heroGeometry,
        servicePresentation: route.servicePresentation,
        sectionRhythm: route.sectionRhythm,
        typographyCategory: route.typographyCategory,
        imageStrategy: route.imageStrategy,
        motionOpportunity: route.motionOpportunity,
        familyId: route.familyId,
        referenceFamilyId: route.referenceDna.familyId,
        referenceName: route.referenceDna.referenceName,
        referenceDna: route.referenceDna,
        mobileBehavior: route.mobileBehavior,
        fingerprint: creativeManifest.fingerprint,
        complianceRepaired,
        referenceRepairCycles,
        motionFallback: Boolean(motionOutput.fallback),
        contentManifestDigest: routeContentManifest.digest,
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
        rules: rules.split("\n"),
        contentTokens,
        creativeManifest,
      };
      return {
        id: metadata.candidateId,
        directory: candidateDirectories[index],
        metadata,
        files: {
          "contract.json": `${JSON.stringify(contract, null, 2)}\n`,
          "Experience.jsx": `${experience}\n`,
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
    failures.push({
      routeId: routes[index].id,
      candidateId: `candidate-${String.fromCharCode(97 + index)}`,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
  if (!candidates.length)
    throw new Error(
      `All creative candidates failed: ${failures.map((failure) => `${failure.routeId}: ${failure.error}`).join(" | ")}`,
    );

  return {
    version: 1,
    model,
    selectionKey: inspirationPack.selectionKey || "",
    contentManifest,
    candidates,
    failures,
  };
}
