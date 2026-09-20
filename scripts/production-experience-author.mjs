import crypto from "node:crypto";
import {
  assertIndependentRoutes,
  buildCandidateManifest,
  buildRouteContract,
} from "./creative-compiler.mjs";

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

function contentShape(site) {
  const business = site.business || {};
  const copy = site.copy || {};
  const assets = site.assets || {};
  const images = site.images || {};
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
      image: assets.photoOne || images.hero || images.secondary || "",
      secondaryImage: assets.photoTwo || images.secondary || "",
      tertiaryImage: assets.photoThree || images.tertiary || "",
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
  return assertIndependentRoutes(pack.routes);
}

function asText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Model stage returned no ${label}.`);
  return value.trim();
}

function normalizeAuthoredSource(value) {
  return value.replaceAll("—", "-");
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
  return normalized.length >= 4 ? [normalized] : [];
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
  if (!/from\s+["']@launchloom\/runtime["']/u.test(source))
    throw new Error(`Candidate ${route.id} must use the shared LaunchLoom runtime.`);
  if (!/\bLeadForm\b/u.test(source))
    throw new Error(`Candidate ${route.id} must render the shared LeadForm runtime surface.`);
  for (const token of [
    "content.hero.heading",
    "content.services",
    "content.faqs",
  ])
    if (!referencesContentPath(source, token))
      throw new Error(
        `Candidate ${route.id} is missing required sealed binding ${token}.`,
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
  if (/url\s*\(\s*["']?(?:https?:)?\/\//iu.test(source))
    throw new Error(`Candidate ${route.id} CSS contains a remote URL.`);
  if (/—/u.test(source))
    throw new Error(`Candidate ${route.id} CSS contains an em dash.`);
}

function validateMotion(source, route) {
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
  if (!/export\s+(?:function|const)\s+mountExperienceMotion\b/u.test(source))
    throw new Error(
      `Candidate ${route.id} motion must export mountExperienceMotion.`,
    );
}

function authorRules() {
  return [
    "Do not hardcode business facts or marketing copy. Render all visitor-facing business content through the supplied content tokens.",
    "Use only React, @launchloom/runtime, GSAP, and GSAP ScrollTrigger in Experience.jsx. The deterministic host imports and mounts motion.js; do not import or invoke ./motion.js from Experience.jsx.",
    "Do not use remote URLs, network calls, canvas, Three.js, dynamic code, remote scripts, or new packages.",
    "Expose Services, FAQs, and Contact navigation. Put conversion in the hero or immediately after it.",
    "Import LeadForm from @launchloom/runtime and render it for the primary conversion surface; do not fake a form or create a second lead endpoint.",
    "Use one H1, semantic landmarks, keyboard-visible controls, responsive recomposition, and a reduced-motion equivalent.",
    "The complete header, hero, image, promise, and action must fit at 1536x864 and 1366x768 at 100 percent zoom.",
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
  const result = await generateStageValue(generate, request, "content", stage);
  let source = normalizeAuthoredSource(result.value);
  let repaired = result.repaired;
  try {
    validate(source, request.route);
  } catch (error) {
    const repair = await generateStageValue(
      generate,
      {
        ...request,
        validationError: error instanceof Error ? error.message : String(error),
        previousSource: source,
      },
      "content",
      stage,
    );
    source = normalizeAuthoredSource(repair.value);
    repaired = true;
    validate(source, request.route);
  }
  return { source, repaired };
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
  model = "z-ai/glm-5.3-flash",
}) {
  if (typeof generate !== "function")
    throw new Error("A generation adapter is required.");
  const content = contentShape(site);
  const manifest = {
    version: 1,
    values: content,
    tokens: contentTokenDefinitions.map(([token, type]) => ({ token, type })),
  };
  const contentManifest = { ...manifest, digest: digest(manifest) };
  const rules = authorRules();

  const routes = assertInspirationPack(inspirationPack).map((route) =>
    buildRouteContract(route),
  );
  const authoredResults = await Promise.allSettled(
    routes.map(async (route, index) => {
      const base = { route, contentTokens, contentShape: content, rules };
      const contractResult = await generateContract(generate, {
        ...base,
        stage: "contract",
      });
      const designContract = contractResult.designContract;
      const designRationale = contractResult.designRationale;
      const experienceResult = await generateStageValue(
        generate,
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
        const repairedExperience = await generateStageValue(
          generate,
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
      }
      const [stylesOutput, motionOutput] = await Promise.all([
        generateValidatedSource({
          generate,
          request: {
            ...base,
            stage: "styles",
            designContract,
            experienceSource: experience,
          },
          stage: "styles",
          validate: validateStyles,
        }),
        generateValidatedSource({
          generate,
          request: {
            ...base,
            stage: "motion",
            designContract,
            experienceSource: experience,
          },
          stage: "motion",
          validate: validateMotion,
        }),
      ]);
      const styles = stylesOutput.source;
      const motion = motionOutput.source;
      complianceRepaired ||= stylesOutput.repaired || motionOutput.repaired;
      const creativeManifest = buildCandidateManifest({
        candidate: { candidateId: `candidate-${String.fromCharCode(97 + index)}` },
        route,
        model,
        contentManifestDigest: contentManifest.digest,
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
        mobileBehavior: route.mobileBehavior,
        fingerprint: creativeManifest.fingerprint,
        complianceRepaired,
        contentManifestDigest: contentManifest.digest,
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
