import ts from "typescript";
import { validateReferenceDna } from "./reference-dna.mjs";

const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");

function finding(code, severity, message) {
  return { code, severity, message };
}

const VISUAL_REFERENCE_CODES = new Set([
  "missing-signature",
  "missing-rendered-signature",
  "section-rhythm",
  "hero-geometry",
  "hero-geometry-mismatch",
  "navigation-geometry",
  "navigation-geometry-mismatch",
  "service-presentation",
  "service-presentation-mismatch",
  "cta-placement",
  "cta-placement-mismatch",
  "mobile-recomposition",
  "mobile-recomposition-mismatch",
  "motion-primitive",
  "motion-primitive-mismatch",
  "prohibited-pattern",
]);

function sourceHasSignature(source, element) {
  const selector = String(element.selector || "");
  const match = selector.match(/data-reference-signature\s*=\s*["']?([a-z0-9_-]+)/iu);
  const value = match?.[1] || element.id;
  return Boolean(value && new RegExp(`data-reference-signature\\s*=\\s*["']?${value}\\b`, "iu").test(source));
}

function staticStringExpression(source, expression, seen = new Set()) {
  const value = String(expression || "").trim();
  if (!value) return "";
  if ((value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith("`") && value.endsWith("`")))
    return value.slice(1, -1);
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u.test(value) || seen.has(value))
    return "";
  seen.add(value);
  const parts = value.split(".");
  const root = parts.shift();
  if (parts.length) {
    const objectBody = source.match(new RegExp(`(?:const|let|var)\\s+${root}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;?`, "u"))?.[1] || "";
    const objectProperty = objectBody.match(new RegExp(`(?:^|[,\\n]\\s*)${parts[0]}\\s*:\\s*([^,\\n}]+)`, "u"))?.[1] || "";
    return parts.length === 1 ? staticStringExpression(source, objectProperty, seen) : "";
  }
  const declaration = source.match(new RegExp(`(?:const|let|var)\\s+${root}\\s*=\\s*([^;\\n]+)`, "u"))?.[1] || "";
  if (!declaration) return "";
  return staticStringExpression(source, declaration, seen);
}

function attributeValue(source, attribute) {
  const literal = source.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "iu"))?.[1];
  if (literal) return literal;
  const expression = source.match(new RegExp(`${attribute}\\s*=\\s*\\{\\s*([^{}]+?)\\s*\\}`, "iu"))?.[1];
  return staticStringExpression(source, expression);
}

function markerMatches(source, attribute, expected) {
  const actual = slug(attributeValue(source, attribute));
  const target = slug(expected);
  return Boolean(actual && target && actual === target);
}

function outputContentPaths(source) {
  // Raw JSX fixtures can contain adjacent roots without a component wrapper.
  const input = source.trimStart().startsWith("<") ? `<>${source}</>` : source;
  const file = ts.createSourceFile("Experience.tsx", input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scopes = new WeakMap();
  const roots = [];
  const writes = [];
  const componentDefinitions = new Map();
  const moduleScope = { bindings: new Map(), parent: null, functionScope: true };
  const propertyName = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) ? node.text : null;
  const lookup = (scope, name) => {
    for (; scope; scope = scope.parent)
      if (scope.bindings.has(name)) return scope.bindings.get(name);
    return null;
  };
  const bind = (name, scope, value, path = []) => {
    if (ts.isIdentifier(name)) {
      scope.bindings.set(name.text, { ...value, path });
    } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, index) => {
        if (!ts.isBindingElement(element)) return;
        const key = ts.isArrayBindingPattern(name) ? String(index) : propertyName(element.propertyName || element.name);
        bind(element.name, scope, element.dotDotDotToken || key === null ? {} : value, [...path, key]);
      });
    }
  };
  const exported = (node) => node.modifiers?.some((modifier) => modifier?.kind === ts.SyntaxKind.ExportKeyword);
  const entryNames = new Set(["Experience"]);
  for (const statement of file.statements)
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) entryNames.add(statement.expression.text);
  const isEntryFunction = (node) => {
    if (node.parent === file) return exported(node) || entryNames.has(node.name?.text);
    if (ts.isExportAssignment(node.parent)) return true;
    const declaration = node.parent;
    return ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent) &&
      ts.isVariableStatement(declaration.parent.parent) && declaration.parent.parent.parent === file &&
      (entryNames.has(declaration.name.getText(file)) || exported(declaration.parent.parent));
  };
  const returnedExpressions = (body) => {
    if (!body) return [];
    if (!ts.isBlock(body)) return [body];
    const expressions = [];
    const visit = (node) => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node)) {
        if (node.expression) expressions.push(node.expression);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return expressions;
  };
  const index = (node, scope) => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      bind(node.name, scope, {});
      if (ts.isFunctionDeclaration(node)) componentDefinitions.set(node.name.text, node);
    }
    if (ts.isFunctionLike(node)) {
      const entry = isEntryFunction(node);
      scope = { bindings: new Map(), parent: scope, functionScope: true };
      if (node.name && ts.isIdentifier(node.name)) bind(node.name, scope, {});
      for (const parameter of node.parameters)
        bind(parameter.name, scope, entry ? { seed: ts.isIdentifier(parameter.name) && parameter.name.text === "content" ? "content" : "$props" } : {});
      if (entry) roots.push(...returnedExpressions(node.body));
    } else if (ts.isBlock(node) || ts.isCaseBlock(node) || ts.isCatchClause(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      scope = { bindings: new Map(), parent: scope, functionScope: false };
    }
    scopes.set(node, scope);
    if (ts.isVariableDeclaration(node)) {
      let target = scope;
      if (ts.isVariableDeclarationList(node.parent) && !(node.parent.flags & ts.NodeFlags.BlockScoped))
        while (!target.functionScope) target = target.parent;
      bind(node.name, target, { expression: node.initializer });
      if (ts.isIdentifier(node.name) && node.initializer && ts.isFunctionLike(node.initializer))
        componentDefinitions.set(node.name.text, node.initializer);
    }
    if (ts.isImportClause(node) && node.name) bind(node.name, scope, {});
    if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) bind(node.name, scope, {});
    if (ts.isBinaryExpression(node) && node.operatorToken?.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken?.kind <= ts.SyntaxKind.LastAssignment)
      writes.push(node.left);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) writes.push(node.operand);
    if (ts.isReturnStatement(node) && node.expression) {
      let owner = scope;
      while (!owner.functionScope) owner = owner.parent;
      if (owner === moduleScope) roots.push(node.expression);
    }
    if (node.parent === file) {
      if (ts.isExpressionStatement(node) && (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression) || ts.isJsxFragment(node.expression)))
        roots.push(node.expression);
      if (ts.isExportAssignment(node) && !ts.isFunctionLike(node.expression)) roots.push(node.expression);
    }
    ts.forEachChild(node, (child) => index(child, scope));
  };
  index(file, moduleScope);
  // Reassigned aliases are deliberately not evidence. This is a dependency walk,
  // not an execution engine for control flow or mutable state.
  const invalidate = (node) => {
    if (ts.isIdentifier(node)) {
      const binding = lookup(scopes.get(node), node.text);
      if (binding) binding.written = true;
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      invalidate(node.expression);
    } else {
      ts.forEachChild(node, invalidate);
    }
  };
  writes.forEach(invalidate);
  const append = (paths, keys) => paths.map((path) => [path, ...keys].join(".").replace(/^\$props\.content(?=\.|$)/u, "content"));
  const active = new Set();
  const overrideStack = [];
  const activeComponents = new Set();
  const currentOverrides = () => overrideStack.length ? overrideStack[overrideStack.length - 1] : new Map();
  const componentName = (node) => {
    const tag = node?.tagName;
    return tag && ts.isIdentifier(tag) && /^[A-Z]/u.test(tag.text) ? tag.text : "";
  };
  const componentBindings = (definition, opening, parentOverrides) => {
    const props = new Map();
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
      const initializer = attribute.initializer;
      if (!initializer) continue;
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      if (expression) props.set(attribute.name.text, paths(expression, parentOverrides));
    }
    const parameter = definition.parameters?.[0]?.name;
    const bindings = new Map();
    const bindProp = (name, key) => {
      if (!ts.isIdentifier(name)) return;
      const value = props.get(key);
      if (value?.length) bindings.set(name.text, value);
    };
    if (parameter && ts.isIdentifier(parameter)) {
      if (props.has(parameter.text)) bindProp(parameter, parameter.text);
      else if (props.has("content")) bindProp(parameter, "content");
    } else if (parameter && ts.isObjectBindingPattern(parameter)) {
      for (const element of parameter.elements) {
        if (!ts.isBindingElement(element)) continue;
        const key = propertyName(element.propertyName || element.name);
        if (key !== null) bindProp(element.name, key);
      }
    }
    return bindings;
  };
  const componentPaths = (node, parentOverrides) => {
    const name = componentName(node.openingElement || node);
    const definition = componentDefinitions.get(name);
    if (!definition || activeComponents.has(definition)) return [];
    const bindings = componentBindings(definition, node.openingElement || node, parentOverrides);
    activeComponents.add(definition);
    overrideStack.push(bindings);
    const result = returnedExpressions(definition.body).flatMap(paths);
    overrideStack.pop();
    activeComponents.delete(definition);
    return result;
  };
  const paths = (node, overrides = currentOverrides()) => {
    if (!node) return [];
    if (!(overrides instanceof Map)) overrides = currentOverrides();
    if (ts.isIdentifier(node)) {
      if (overrides.has(node.text)) return overrides.get(node.text);
      const binding = lookup(scopes.get(node), node.text);
      if (!binding) return node.text === "content" ? ["content"] : [];
      if (binding.written || active.has(binding)) return [];
      active.add(binding);
      const result = append(binding.seed ? [binding.seed] : paths(binding.expression), binding.path);
      active.delete(binding);
      return result;
    }
    if (ts.isPropertyAccessExpression(node)) return append(paths(node.expression), [node.name.text]);
    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      return key && (ts.isStringLiteral(key) || ts.isNumericLiteral(key)) ? append(paths(node.expression), [key.text]) : paths(node.expression);
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))
      return paths(node.expression);
    if (ts.isJsxElement(node)) return [...paths(node.openingElement, overrides), ...node.children.flatMap((child) => paths(child, overrides)), ...componentPaths(node, overrides)];
    if (ts.isJsxFragment(node)) return node.children.flatMap(paths);
    if (ts.isJsxSelfClosingElement(node)) return [...node.attributes.properties.flatMap((property) => paths(property, overrides)), ...componentPaths(node, overrides)];
    if (ts.isJsxOpeningElement(node)) return node.attributes.properties.flatMap((property) => paths(property, overrides));
    if (ts.isJsxAttribute(node)) return paths(node.initializer, overrides);
    if (ts.isJsxExpression(node) || ts.isJsxSpreadAttribute(node) || ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return paths(node.expression, overrides);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const mapped = ts.isPropertyAccessExpression(callee) && callee.name.text === "map";
      return [
        ...paths(callee),
        ...node.arguments.flatMap((argument) => mapped && ts.isFunctionLike(argument)
          ? returnedExpressions(argument.body).flatMap(paths) : paths(argument)),
      ];
    }
    if (ts.isConditionalExpression(node)) return [...paths(node.condition), ...paths(node.whenTrue), ...paths(node.whenFalse)];
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken?.kind === ts.SyntaxKind.CommaToken || node.operatorToken?.kind === ts.SyntaxKind.EqualsToken) return paths(node.right);
      return [...paths(node.left), ...paths(node.right)];
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(paths);
    if (ts.isObjectLiteralExpression(node)) return node.properties.flatMap(paths);
    if (ts.isPropertyAssignment(node)) return paths(node.initializer);
    if (ts.isShorthandPropertyAssignment(node)) return paths(node.name);
    if (ts.isTemplateExpression(node)) return node.templateSpans.flatMap((span) => paths(span.expression));
    // Literals, comments, type nodes, declarations, and uninvoked functions do
    // not contribute output dependencies.
    return [];
  };
  return new Set(roots.flatMap(paths));
}

function sourceSectionOrder(source) {
  const sections = [];
  for (const match of source.matchAll(/<section\b([^>]*)>/giu)) {
    const attributes = match[1] || "";
    const reference = attributes.match(/data-reference-section\s*=\s*["']([^"']+)["']/iu)?.[1];
    const id = attributes.match(/id\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (reference || id) sections.push(slug(reference || id));
  }
  return sections;
}

/**
 * Return the exact section marker values an author must use for a reference.
 * These are derived from the evidence-backed sequence, rather than from a
 * route's generic section names. Keeping this helper deterministic gives the
 * author prompt and the source validator one shared contract.
 */
export function referenceSectionMarkers(referenceDna) {
  return (Array.isArray(referenceDna?.sectionSequence)
    ? referenceDna.sectionSequence
    : []
  )
    .map((item) => slug(item))
    .filter(Boolean);
}

export function referenceSignatureIds(referenceDna) {
  return (Array.isArray(referenceDna?.requiredSignatureElements)
    ? referenceDna.requiredSignatureElements
    : []
  )
    .map((item) => slug(item?.id))
    .filter(Boolean);
}

export function referenceAuthoringContract(referenceDna) {
  const sectionMarkers = referenceSectionMarkers(referenceDna);
  const signatureIds = referenceSignatureIds(referenceDna);
  const exactMarkers = [
    ["data-hero-geometry", referenceDna?.heroGeometry?.mode],
    ["data-navigation-geometry", referenceDna?.navigationGeometry?.mode],
    ["data-service-presentation", referenceDna?.servicePresentation?.pattern],
    ["data-cta-placement", referenceDna?.ctaPlacement?.early],
    ["data-mobile-recomposition", referenceDna?.mobileRecomposition?.strategy],
    ["data-motion-primitive", referenceDna?.motion?.primitive],
  ].filter(([, value]) => value);
  return `CANONICAL REFERENCE SECTION SEQUENCE
These are ordered, machine-checked DOM markers. Render the assigned composition in this order and copy each value exactly into a major section's data-reference-section attribute:
${sectionMarkers.map((marker, index) => `${index + 1}. data-reference-section="${marker}"`).join("\n")}
Do not replace these with generic values such as hero, services, projects, faq, or contact. Those generic labels do not satisfy the assigned reference rhythm. Do not mention the markers only in prose or comments: each implemented beat must be represented by its actual section element.

REQUIRED SIGNATURE MARKERS
Place each of these exact values in the rendered DOM as data-reference-signature attributes on the corresponding visual mechanic:
${signatureIds.map((id) => `- data-reference-signature="${id}"`).join("\n")}
Every signature is a required visual mechanic, not a metadata claim.

REQUIRED REFERENCE-FIDELITY ATTRIBUTES
Preserve these exact values on the corresponding authored elements. They are machine-checked implementation markers, not prose:
${exactMarkers.map(([attribute, value]) => `- ${attribute}="${slug(value)}"`).join("\n")}
When repairing a candidate, keep every marker above unchanged unless the assigned Reference DNA itself changes.`;
}

function orderedSectionMatchCount(actual, expected) {
  let cursor = 0;
  let matched = 0;
  for (const value of actual) {
    const target = expected[cursor];
    if (!target) break;
    if (value === target || value.includes(target) || target.includes(value)) {
      matched += 1;
      cursor += 1;
    }
  }
  return matched;
}

function hasProhibitedPattern(source, pattern) {
  const value = slug(pattern);
  if (!value) return false;
  const escaped = value.replace(/-/gu, "[-_ ]?");
  return new RegExp(`\\s(?:data-reference-pattern|data-layout|data-grammar|className|class)\\s*=\\s*["'][^"']*\\b${escaped}\\b[^"']*["']`, "iu").test(source);
}

/**
 * Checks the authored source before it reaches the Astro shell. This is
 * intentionally evidence-oriented: a model claim in contract.json cannot
 * satisfy a missing signature or mobile recomposition.
 *
 * @param {{referenceDna: any, experienceSource?: string, stylesSource?: string, motionSource?: string, renderedDom?: string}} options
 */
export function validateReferenceContractCompliance({
  referenceDna,
  experienceSource = "",
  stylesSource = "",
  motionSource = "",
  renderedDom = "",
  phase = "full",
} = {}) {
  validateReferenceDna(referenceDna, { requireEvidence: true });
  const structureOnly = phase === "experience";
  const findings = [];
  for (const element of referenceDna.requiredSignatureElements) {
    if (!sourceHasSignature(experienceSource, element))
      findings.push(finding("missing-signature", "critical", `Missing required signature ${element.id}.`));
    if (renderedDom && !sourceHasSignature(renderedDom, element))
      findings.push(finding("missing-rendered-signature", "critical", `Rendered DOM is missing signature ${element.id}.`));
  }
  const sections = sourceSectionOrder(experienceSource);
  const expected = referenceSectionMarkers(referenceDna);
  const matched = orderedSectionMatchCount(sections, expected);
  if (matched < Math.min(3, expected.length))
    findings.push(finding(
      "section-rhythm",
      "critical",
      `The authored section sequence does not represent the assigned reference rhythm. Expected markers: ${expected.join(" -> ")}. Observed markers: ${sections.join(" -> ") || "(none)"}.`,
    ));
  if (!/data-hero(?:\s|=)/iu.test(experienceSource) || !/data-hero-geometry=/iu.test(experienceSource))
    findings.push(finding("hero-geometry", "critical", "The authored hero is missing its explicit reference geometry marker."));
  else if (!markerMatches(experienceSource, "data-hero-geometry", referenceDna.heroGeometry.mode))
    findings.push(finding("hero-geometry-mismatch", "critical", "The authored hero geometry does not match Reference DNA."));
  if (!/data-navigation-geometry=/iu.test(experienceSource))
    findings.push(finding("navigation-geometry", "major", "The authored navigation is missing its reference geometry marker."));
  else if (!markerMatches(experienceSource, "data-navigation-geometry", referenceDna.navigationGeometry.mode))
    findings.push(finding("navigation-geometry-mismatch", "critical", "The authored navigation geometry does not match Reference DNA."));
  if (!/data-service-presentation=/iu.test(experienceSource))
    findings.push(finding("service-presentation", "critical", "The authored service presentation is missing its reference marker."));
  else if (!markerMatches(experienceSource, "data-service-presentation", referenceDna.servicePresentation.pattern))
    findings.push(finding("service-presentation-mismatch", "critical", "The authored service presentation does not match Reference DNA."));
  if (!/data-early-conversion(?:=|\s|>)/iu.test(experienceSource) || !/data-cta-placement=/iu.test(experienceSource))
    findings.push(finding("cta-placement", "critical", "The early CTA is missing its explicit reference placement marker."));
  else if (!markerMatches(experienceSource, "data-cta-placement", referenceDna.ctaPlacement.early))
    findings.push(finding("cta-placement-mismatch", "critical", "The early CTA placement does not match Reference DNA."));
  if (!/data-mobile-recomposition=/iu.test(experienceSource) || (!structureOnly && !/@media/iu.test(stylesSource)))
    findings.push(finding("mobile-recomposition", "critical", "The candidate does not declare a mobile recomposition and responsive CSS."));
  else if (!markerMatches(experienceSource, "data-mobile-recomposition", referenceDna.mobileRecomposition.strategy))
    findings.push(finding("mobile-recomposition-mismatch", "critical", "The mobile recomposition does not match Reference DNA."));
  if ((!structureOnly && !/mountExperienceMotion\s*\(/u.test(motionSource)) || !/data-motion-primitive=/iu.test(experienceSource))
    findings.push(finding("motion-primitive", "critical", "The assigned motion primitive is not represented in the authored candidate."));
  else if (!markerMatches(experienceSource, "data-motion-primitive", referenceDna.motion.primitive))
    findings.push(finding("motion-primitive-mismatch", "critical", "The motion primitive does not match Reference DNA."));
  for (const pattern of referenceDna.prohibitedPatterns)
    if (hasProhibitedPattern(`${experienceSource}\n${renderedDom}`, pattern))
      findings.push(finding("prohibited-pattern", "critical", `Prohibited pattern detected: ${pattern}.`));
  if (!structureOnly)
    for (const match of stylesSource.matchAll(/(?:^|[;{])\s*--([a-z][\w-]*)\s*:/gimu))
      if (!match[1].startsWith("ll-creative-"))
        findings.push(finding("css-token-collision", "critical", `Candidate CSS variable --${match[1]} is not isolated.`));
  const contentPaths = [...outputContentPaths(experienceSource)];
  for (const token of ["content.hero.image", "content.services", "content.faqs"])
    if (!contentPaths.some((path) => path === token || path.startsWith(`${token}.`)))
      findings.push(finding("unbound-content-token", "critical", `Required sealed token ${token} does not flow into output.`));
  const visualFindings = findings.filter((item) =>
    VISUAL_REFERENCE_CODES.has(item.code),
  );
  const hardFindings = findings.filter(
    (item) => !VISUAL_REFERENCE_CODES.has(item.code),
  );
  const critical = findings.filter((item) => item.severity === "critical").length;
  const score = Math.max(0, Math.round(100 - critical * 18 - findings.filter((item) => item.severity === "major").length * 8));
  return {
    version: 1,
    pass: hardFindings.length === 0,
    visualPass: visualFindings.length === 0,
    score,
    findings,
    hardFindings,
    visualFindings,
    requiredSignatures: referenceDna.requiredSignatureElements.map((item) => item.id),
    sectionOrder: sections,
  };
}

/**
 * Validate only what is knowable from Experience.jsx. This runs before the
 * CSS and motion stages so a generic composition is repaired or rejected
 * before LaunchLoom spends more model calls rendering it.
 *
 * @param {{referenceDna: any, experienceSource?: string, renderedDom?: string}} options
 */
export function validateReferenceExperienceStructure({
  referenceDna,
  experienceSource = "",
  renderedDom = "",
} = {}) {
  return validateReferenceContractCompliance({
    referenceDna,
    experienceSource,
    renderedDom,
    phase: "experience",
  });
}

export function assertReferenceContractCompliance(input) {
  const report = validateReferenceContractCompliance(input);
  if (!report.pass)
    throw new Error(`Reference fidelity failed: ${report.findings.map((item) => item.message).join(" | ")}`);
  return report;
}


export const validateReferenceCandidate = validateReferenceContractCompliance;
export const assertReferenceCandidate = assertReferenceContractCompliance;
