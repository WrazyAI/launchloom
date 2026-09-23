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

/**
 * Keep model prompts bounded when a local canary or an intake carries an
 * inline image. The runtime still receives the sealed asset value unchanged;
 * only the authoring prompt gets a descriptive placeholder.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactPromptValue(value) {
  if (typeof value === "string") {
    if (/^data:image\/[\w.+-]+;base64,/iu.test(value))
      return "[sealed client image asset]";
    if (value.length > 12_000)
      return `${value.slice(0, 256)}...[sealed value truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redactPromptValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactPromptValue(item),
      ]),
    );
  return value;
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
    version: 1,
    values: contentShape(site || {}, route),
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
  return contracts;
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
        return matches.filter(
          (candidate) =>
            !matches.some(
              (other) =>
                other !== candidate &&
                other.node.getStart(repaired.file) >
                  candidate.node.getStart(repaired.file) &&
                other.node.end < candidate.node.end,
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
  if (!contact?.body.includes("<LeadForm"))
    throw new Error(
      `Candidate ${route.id} must render the shared LeadForm inside the contact section, not in the hero.`,
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

    const href = jsxAttribute(opening, "href")?.initializer;
    return Boolean(
      href && ts.isStringLiteral(href) && href.text === `#${target}`,
    );
  });
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
    const key = name && ts.isComputedPropertyName(name) ? name.expression : name;
    if (
      !key ||
      (!ts.isIdentifier(key) &&
        !ts.isStringLiteral(key) &&
        !ts.isNoSubstitutionTemplateLiteral(key))
    )
      return undefined;
    if (key.text !== "display") continue;
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
    const key = name && ts.isComputedPropertyName(name) ? name.expression : name;
    if (
      !key ||
      (!ts.isIdentifier(key) &&
        !ts.isStringLiteral(key) &&
        !ts.isNoSubstitutionTemplateLiteral(key))
    )
      return undefined;
    if (key.text !== "style") continue;
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
      if (
        !ts.isStringLiteral(key) &&
        !ts.isNoSubstitutionTemplateLiteral(key)
      )
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
    [/<canvas\b|\bthree(?:\s*\.?\s*js)\b/iu, "unapproved rendering engine"],
    [/<script\b/iu, "script element"],
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
      `Candidate ${route.id} must render exactly one shared LeadForm in the contact section; keep the hero conversion as a compact link.`,
    );
  if (!/<LeadForm\b[^>]*\bcontent\s*=\s*\{\s*content\s*\}/u.test(source))
    throw new Error(
      `Candidate ${route.id} must pass sealed content to the shared LeadForm runtime surface.`,
    );
  const helperSealedBindings = validateContentBoundRuntimeHelpers(
    source,
    route,
  );
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
  for (const target of ["services", "faqs", "contact"])
    if (
      !navigations.some((navigation) =>
        hasLiteralNavigationAnchor(elements, navigation, target),
      )
    )
      throw new Error(
        `Candidate ${route.id} navigation must expose href="#${target}".`,
      );
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
  const embeddedFact = scalarContentValues(content).find((value) =>
    source.includes(value),
  );
  if (embeddedFact)
    throw new Error(
      `Candidate ${route.id} hardcodes sealed content instead of using a token: ${embeddedFact}`,
    );
}

function validateStyles(source, route) {
  if (
    /<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<style\b/iu.test(source)
  )
    throw new Error(
      `Candidate ${route.id} styles must contain CSS only, not an HTML document.`,
    );
  if (/url\s*\(\s*["']?(?:https?:)?\/\//iu.test(source))
    throw new Error(`Candidate ${route.id} CSS contains a remote URL.`);
  if (/—/u.test(source))
    throw new Error(`Candidate ${route.id} CSS contains an em dash.`);
  if (/(?:^|\n)\s*["']\s*\n?\}\s*$/u.test(source))
    throw new Error(
      `Candidate ${route.id} CSS contains a malformed trailing wrapper.`,
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
  if (
    /<[A-Za-z][^>]*>/u.test(source) ||
    /\b(?:React|useState|useEffect|LeadForm)\b/u.test(source)
  )
    throw new Error(
      `Candidate ${route.id} motion must be JavaScript without JSX or React components.`,
    );
}

/**
 * @param {{files?: {experience?: string, styles?: string, motion?: string}, route?: Record<string, any>, content?: Record<string, any>}} [options]
 * @returns {{files: {experience: string, styles: string, motion: string}, referenceFidelity: Record<string, any> | null}}
 */
export function validateProductionCandidateFiles({
  files,
  route = {},
  content = {},
} = {}) {
  const experience = normalizeAuthoredSource(String(files?.experience || ""));
  const styles = normalizeAuthoredSource(String(files?.styles || ""));
  const motion = normalizeAuthoredSource(String(files?.motion || ""));
  if (!experience || !styles || !motion)
    throw new Error("A complete creative candidate file bundle is required.");
  const referenceDna = route.referenceDna
    ? validateReferenceDna(route.referenceDna, { requireEvidence: true })
    : null;
  validateExperience(experience, route, content);
  validateStyles(styles, route);
  validateMotion(motion, route);
  const isolatedStyles = namespaceCreativeCss(styles);
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
    files: { experience, styles: isolatedStyles, motion },
    referenceFidelity,
  };
}

function authorRules() {
  return [
    "Do not hardcode business facts or marketing copy. Render all visitor-facing business content through the supplied content tokens.",
    "Use only React, @launchloom/runtime, GSAP, and GSAP ScrollTrigger in Experience.jsx. The deterministic host imports and mounts motion.js; do not import or invoke ./motion.js from Experience.jsx.",
    "Do not use remote URLs, network calls, canvas, Three.js, dynamic code, remote scripts, or new packages.",
    "Expose Services, FAQs, and Contact navigation. Put conversion in the hero or immediately after it.",
    "Import LeadForm from @launchloom/runtime and render exactly one instance inside the contact section; use a compact anchor CTA for early conversion and do not fake a form or create a second lead endpoint.",
    "Every content-bound @launchloom/runtime helper must receive the sealed object exactly as content={content}: render FAQList, ContactLinks, LocationMap, and SocialProof with content={content}; pass runtime={runtime} to SocialProof when rendering signed live reviews.",
    "Use one H1, semantic landmarks, keyboard-visible controls, responsive recomposition, and a reduced-motion equivalent.",
    'Give every <img> a usable alt attribute. Use concise descriptive text for informative images. Use alt="" only for purely decorative images or when adjacent text fully conveys the image\'s relevant information. Preserve supplied or reviewed descriptions for known informative assets; do not replace them with generic filler.',
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

/**
 * Deep module interface for Phase 2 production authorship.
 *
 * @param {{
 *   site: Record<string, any>;
 *   inspirationPack: Record<string, any>;
 *   generate: (request: AuthorStageRequest) => Promise<Record<string, any>>;
 *   model?: string;
 *   creativeSession?: Record<string, any> | null;
 * }} input
 */
export async function authorExperienceCandidates({
  site,
  inspirationPack,
  generate,
  model = "openai/gpt-6-luna",
  creativeSession = null,
}) {
  if (typeof generate !== "function")
    throw new Error("A generation adapter is required.");
  const contentManifest = buildCreativeContentManifest(site);
  const rules = authorRules();

  const routes = assertInspirationPack(inspirationPack).map((route) =>
    buildRouteContract(route),
  );
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
          validateExperience(experience, route, content);
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
        let fidelity = validateReferenceCandidate({
          referenceDna: route.referenceDna,
          experienceSource: experience,
          stylesSource: styles,
          motionSource: motion,
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
              validationError: `Reference fidelity repair cycle ${referenceRepairCycles}/2. Fix every finding without simplifying the assigned composition: ${fidelity.findings.map((item) => item.message).join(" | ")}`,
            },
            "content",
            "experience",
          );
          experience = normalizeAuthoredSource(repaired.value);
          complianceRepaired = true;
          validateExperience(experience, route, content);
          fidelity = validateReferenceCandidate({
            referenceDna: route.referenceDna,
            experienceSource: experience,
            stylesSource: styles,
            motionSource: motion,
          });
        }
        if (!fidelity.pass || !fidelity.visualPass)
          throw new Error(
            `Reference fidelity failed for ${route.id}: ${fidelity.findings.map((item) => item.message).join(" | ")}`,
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
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
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
