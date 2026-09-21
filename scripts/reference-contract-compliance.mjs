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

function attributeValue(source, attribute) {
  return source.match(new RegExp(`${attribute}=["']([^"']+)["']`, "iu"))?.[1] || "";
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
  const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
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
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)
      bind(node.name, scope, {});
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
    }
    if (ts.isImportClause(node) && node.name) bind(node.name, scope, {});
    if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) bind(node.name, scope, {});
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
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
  const paths = (node) => {
    if (!node) return [];
    if (ts.isIdentifier(node)) {
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
    if (ts.isJsxElement(node)) return [...paths(node.openingElement), ...node.children.flatMap(paths)];
    if (ts.isJsxFragment(node)) return node.children.flatMap(paths);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) return node.attributes.properties.flatMap(paths);
    if (ts.isJsxAttribute(node)) return paths(node.initializer);
    if (ts.isJsxExpression(node) || ts.isJsxSpreadAttribute(node) || ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return paths(node.expression);
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
      if (node.operatorToken.kind === ts.SyntaxKind.CommaToken || node.operatorToken.kind === ts.SyntaxKind.EqualsToken) return paths(node.right);
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
  for (const match of source.matchAll(/<section\b[^>]*?(?:data-reference-section=["']([^"']+)["']|id=["']([^"']+)["'])[^>]*>/giu))
    sections.push(String(match[1] || match[2]).toLowerCase());
  return sections;
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
 */
export function validateReferenceContractCompliance({
  referenceDna,
  experienceSource = "",
  stylesSource = "",
  motionSource = "",
  renderedDom = "",
} = {}) {
  validateReferenceDna(referenceDna, { requireEvidence: true });
  const source = `${experienceSource}\n${stylesSource}\n${motionSource}`;
  const findings = [];
  for (const element of referenceDna.requiredSignatureElements) {
    if (!sourceHasSignature(experienceSource, element))
      findings.push(finding("missing-signature", "critical", `Missing required signature ${element.id}.`));
    if (renderedDom && !sourceHasSignature(renderedDom, element))
      findings.push(finding("missing-rendered-signature", "critical", `Rendered DOM is missing signature ${element.id}.`));
  }
  const sections = sourceSectionOrder(experienceSource);
  const expected = referenceDna.sectionSequence.map((item) => slug(item));
  const matched = expected.filter((item) => sections.includes(item) || source.toLowerCase().includes(item));
  if (matched.length < Math.min(3, expected.length))
    findings.push(finding("section-rhythm", "critical", "The authored section sequence does not represent the assigned reference rhythm."));
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
  if (!/data-mobile-recomposition=/iu.test(experienceSource) || !/@media/iu.test(stylesSource))
    findings.push(finding("mobile-recomposition", "critical", "The candidate does not declare a mobile recomposition and responsive CSS."));
  else if (!markerMatches(experienceSource, "data-mobile-recomposition", referenceDna.mobileRecomposition.strategy))
    findings.push(finding("mobile-recomposition-mismatch", "critical", "The mobile recomposition does not match Reference DNA."));
  if (!/mountExperienceMotion\s*\(/u.test(motionSource) || !/data-motion-primitive=/iu.test(experienceSource))
    findings.push(finding("motion-primitive", "critical", "The assigned motion primitive is not represented in the authored candidate."));
  else if (!markerMatches(experienceSource, "data-motion-primitive", referenceDna.motion.primitive))
    findings.push(finding("motion-primitive-mismatch", "critical", "The motion primitive does not match Reference DNA."));
  for (const pattern of referenceDna.prohibitedPatterns)
    if (hasProhibitedPattern(`${experienceSource}\n${renderedDom}`, pattern))
      findings.push(finding("prohibited-pattern", "critical", `Prohibited pattern detected: ${pattern}.`));
  for (const match of stylesSource.matchAll(/--([a-z][\w-]*)\s*:/giu))
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

export function assertReferenceContractCompliance(input) {
  const report = validateReferenceContractCompliance(input);
  if (!report.pass)
    throw new Error(`Reference fidelity failed: ${report.findings.map((item) => item.message).join(" | ")}`);
  return report;
}


export const validateReferenceCandidate = validateReferenceContractCompliance;
export const assertReferenceCandidate = assertReferenceContractCompliance;
