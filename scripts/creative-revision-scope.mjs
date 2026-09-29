import ts from "typescript";
import postcss from "postcss";

const MOTION_REQUEST =
  /\b(?:motion|animate|animation|animated|transition|parallax|scroll[ -]?trigger(?:ed)?)\b/iu;
const BROAD_SCOPE =
  /\b(?:whole|entire|all)\s+(?:site|website|page|sections?)\b|\b(?:site[ -]wide|throughout\s+(?:the\s+)?(?:site|website|page)|every\s+section)\b/iu;
const NEGATED_REQUEST =
  /\b(?:do\s+not|don['’]?t|never|no\s+need\s+to|avoid|leave\s+(?:it|that|the\s+section)\s+as\s+is|keep\s+(?:it|that|the\s+section)\s+as\s+is)\b/iu;
const ACTION_OR_ISSUE =
  /\b(?:change|make|improve|revise|update|rework|fix|adjust|add|remove|hide|show|move|reorder|simplify|shorten|expand|reduce|increase|decrease|use|swap|replace|need|needs|should|could|would|more|less|too|cluttered|busy|large|small|off|unclear|unreadable|hard|confusing|weak|strong|spacious|tight|overlap(?:ping)?|missing|absent|wrong|inconsistent|colorful|dark|light|bright|calm|modern|better|clearer|louder|quieter|denser|roomier|slow(?:er)?|fast(?:er)?|smooth(?:er)?|choppy|janky|stiff|subtle|excessive|fluid)\b/iu;
const STOP_ALIAS_WORDS = new Set([
  "a",
  "an",
  "the",
  "section",
  "chapter",
  "area",
  "part",
  "page",
  "site",
  "website",
  "homepage",
  "content",
]);
const CREATIVE_REPAIR_INTENTS = new Set([
  "layout",
  "color",
  "social-proof",
  "brand-name",
]);
const FIXED_UI_COPY = new Set([
  "Services",
  "FAQs",
  "Contact",
  "Menu",
  "Close",
  "Main navigation",
  "Open menu",
  "Close menu",
]);
const VISITOR_COPY_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "caption",
  "description",
  "heading",
  "label",
  "placeholder",
  "text",
  "title",
]);
const VISITOR_COPY_ATTRIBUTE_PATTERN =
  /(?:^|[-_])(?:alt|body|button|caption|content|copy|cta|description|eyebrow|heading|headline|intro|kicker|label|message|placeholder|quote|subtitle|summary|tagline|text|title|tooltip|value)(?:$|[-_])/iu;
const UNSUPPORTED_CLAIM_PATTERN =
  /\b(?:award(?:-?winning)?|certified|licensed|insured|guaranteed?|best|number one|#1|five[- ]star|top[- ]rated|years? of experience)\b/giu;
const NEGATED_CLAIM_PREFIX =
  /\b(?:not|never|no|without|cannot|can't|does\s+not|do\s+not|doesn't|don't|isn't|aren't)\s*$/iu;
const CLAIM_TEXT_BLOCKS = new Set([
  "a",
  "article",
  "blockquote",
  "button",
  "dd",
  "div",
  "dt",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "legend",
  "li",
  "p",
  "section",
  "summary",
  "td",
  "th",
]);
const UNSAFE_EXPERIENCE_GLOBALS = new Set([
  "document",
  "window",
  "globalThis",
  "self",
  "Function",
  "eval",
  "process",
  "fetch",
  "location",
  "history",
  "navigator",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "WebSocket",
  "requestAnimationFrame",
  "setTimeout",
  "setInterval",
]);
const UNSAFE_MOTION_DOM_PROPERTIES = new Set([
  "aria-label",
  "attr",
  "class",
  "classname",
  "data",
  "href",
  "hidden",
  "html",
  "id",
  "innerhtml",
  "innertext",
  "nodevalue",
  "outerhtml",
  "outertext",
  "role",
  "src",
  "text",
  "textcontent",
  "value",
]);

function isVisitorCopyAttribute(name) {
  const normalized = String(name || "")
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, "$1-$2")
    .toLowerCase();
  return (
    VISITOR_COPY_ATTRIBUTES.has(normalized) ||
    VISITOR_COPY_ATTRIBUTE_PATTERN.test(normalized)
  );
}

function scopeError(message) {
  const error = new Error(`Manual attention required: ${message}`);
  error.code = "CREATIVE_REVISION_SCOPE_REJECTED";
  return error;
}

/**
 * Persist only feedback items that enter the authored-source repair lane.
 * @param {{creativeRenderer?: boolean, feedback?: string[], results?: Array<{feedbackIndex?: number, feedback?: string, status?: string, intents?: string[]}>}} [options]
 * @returns {{required: boolean, declaration: Record<string, any> | null, feedbackText: string}}
 */
export function createCreativeRepairScopeDeclaration({
  creativeRenderer,
  feedback = [],
  results = [],
} = {}) {
  const feedbackValues = Array.isArray(feedback) ? feedback : [];
  const allFeedbackText = feedbackValues.join("\n\n").trim();
  const feedbackText = allFeedbackText.slice(0, 12_000);
  const relevant = (Array.isArray(results) ? results : []).filter(
    (result) =>
      result.status === "creative" ||
      result.intents?.some((intent) => CREATIVE_REPAIR_INTENTS.has(intent)),
  );
  const required = Boolean(creativeRenderer && relevant.length);
  const declaration = required
    ? {
        version: 1,
        requestText: allFeedbackText,
        feedbackItems: relevant
          .filter(
            (result) =>
              Number.isSafeInteger(result.feedbackIndex) &&
              result.feedbackIndex >= 0 &&
              result.feedbackIndex < feedbackValues.length &&
              typeof result.feedback === "string" &&
              result.feedback.trim().length > 0,
          )
          .map(({ feedbackIndex, feedback: itemFeedback }) => ({
            feedbackIndex,
            feedback: itemFeedback,
          })),
      }
    : null;
  return { required, declaration, feedbackText };
}

function parseSource(source, fileName, scriptKind) {
  const file = ts.createSourceFile(
    fileName,
    String(source || ""),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  if (file.parseDiagnostics.length) {
    const detail = ts.flattenDiagnosticMessageText(
      file.parseDiagnostics[0].messageText,
      " ",
    );
    throw scopeError(`${fileName} is not parseable: ${detail}`);
  }
  return file;
}

function openingElement(node) {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function attributeEntries(opening) {
  return opening.attributes.properties.filter(ts.isJsxAttribute);
}

function attributeValue(attribute) {
  if (!attribute?.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer))
    return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    ts.isStringLiteral(attribute.initializer.expression)
  )
    return attribute.initializer.expression.text;
  return "";
}

function sectionMarker(node, file) {
  const opening = openingElement(node);
  if (!opening) return null;
  const tag = opening.tagName.getText(file);
  if (tag.toLowerCase() !== "section") return null;
  const attributes = attributeEntries(opening).filter(
    (item) => item.name.getText(file) === "data-reference-section",
  );
  if (!attributes.length) return null;
  if (attributes.length !== 1)
    throw scopeError("a section has duplicate data-reference-section markers.");
  const value = attributeValue(attributes[0]).trim();
  if (!value || !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(value))
    throw scopeError("section markers must have a static, non-empty value.");
  return { id: value, opening };
}

function sectionStructuralSignals(sectionNode, file) {
  const signals = new Set();
  const visit = (node) => {
    if (node !== sectionNode && sectionMarker(node, file)) return;
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "content" &&
      ["services", "faqs"].includes(node.name.text)
    )
      signals.add(node.name.text);
    const opening = openingElement(node);
    if (opening) {
      const component = opening.tagName.getText(file);
      if (["LeadForm", "FAQList", "SocialProof"].includes(component))
        signals.add(component);
    }
    ts.forEachChild(node, visit);
  };
  visit(sectionNode);
  return signals;
}

function collectSections(source) {
  const file = parseSource(source, "Experience.jsx", ts.ScriptKind.TSX);
  const sections = [];
  const byId = new Map();
  const visit = (node) => {
    const marker = sectionMarker(node, file);
    if (marker) {
      if (byId.has(marker.id))
        throw scopeError(
          `duplicate data-reference-section="${marker.id}" markers make the target ambiguous.`,
        );
      const entries = attributeEntries(marker.opening);
      const getAttribute = (name) =>
        attributeValue(
          entries.find((item) => item.name.getText(file) === name),
        );
      const id = getAttribute("id");
      const values = entries.map((item) => item.name.getText(file)).join(" ");
      const aliases = new Set([marker.id, id].filter(Boolean));
      const identity = `${marker.id} ${id} ${values}`.toLowerCase();
      const structuralSignals = sectionStructuralSignals(node, file);
      if (/\bdata-hero\b|\bhero\b/u.test(identity)) {
        aliases.add("hero");
        aliases.add("opening");
        aliases.add("headline");
        aliases.add("main heading");
      }
      if (
        id.toLowerCase() === "services" ||
        /data-service-presentation|service(?:s)?\b|offerings?/u.test(
          identity,
        ) ||
        structuralSignals.has("services")
      ) {
        for (const alias of [
          "service",
          "services",
          "offering",
          "offerings",
          "program",
          "programs",
        ])
          aliases.add(alias);
      }
      if (
        id.toLowerCase() === "faqs" ||
        /\bfaqs?\b/u.test(identity) ||
        structuralSignals.has("faqs") ||
        structuralSignals.has("FAQList")
      ) {
        for (const alias of ["faq", "faqs", "question", "questions"])
          aliases.add(alias);
      }
      if (
        id.toLowerCase() === "contact" ||
        /\bcontact\b/u.test(identity) ||
        structuralSignals.has("LeadForm")
      ) {
        for (const alias of [
          "contact",
          "form",
          "consultation",
          "inquiry",
          "inquiries",
          "quote",
          "quotes",
        ])
          aliases.add(alias);
      }
      if (
        /socialproof|testimonials?|reviews?|proof/u.test(identity) ||
        structuralSignals.has("SocialProof")
      ) {
        for (const alias of [
          "proof",
          "testimonial",
          "testimonials",
          "review",
          "reviews",
        ])
          aliases.add(alias);
      }
      const section = { id: marker.id, aliases, node };
      sections.push(section);
      byId.set(marker.id, section);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!sections.length)
    throw scopeError(
      "the candidate has no uniquely marked sections to target.",
    );
  return { file, sections, byId };
}

function normalizedPhrase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function requestClauses(request) {
  return String(request || "").split(
    /(?:[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b|\band\s+(?=(?:keep|leave|do\s+not|don['’]?t|never|avoid)\b))/iu,
  );
}

function aliasMatchesRequest(alias, request) {
  const phrase = normalizedPhrase(alias);
  if (!phrase) return false;
  const escaped = phrase
    .split(" ")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("[\\s_-]+");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(String(request || ""));
}

function aliasIsActionable(request, alias) {
  return requestClauses(request).some(
    (clause) =>
      aliasMatchesRequest(alias, clause) &&
      ACTION_OR_ISSUE.test(clause) &&
      !NEGATED_REQUEST.test(clause),
  );
}

function explicitlyExcludesSection(request, aliases) {
  return requestClauses(request).some((clause) =>
    [...aliases].some((alias) => {
      const phrase = normalizedPhrase(alias)
        .split(" ")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
        .join("[\\s_-]+");
      if (!phrase) return false;
      return new RegExp(
        `\\b(?:keep|leave)\\s+(?:the\\s+)?${phrase}(?:\\s+section)?\\s+(?:unchanged|alone|intact|as\\s+is|the\\s+same)\\b|\\b(?:do\\s+not|don['’]?t|never|avoid)\\s+(?:change|edit|update|touch|alter|revise|modify|changing|editing|updating|touching|altering|revising|modifying)\\s+(?:the\\s+)?${phrase}(?:\\s+section)?\\b`,
        "iu",
      ).test(clause);
    }),
  );
}

function motionRequestIsActionable(request) {
  return String(request || "")
    .split(/(?:[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b)/iu)
    .some(
      (clause) =>
        MOTION_REQUEST.test(clause) &&
        ACTION_OR_ISSUE.test(clause) &&
        !NEGATED_REQUEST.test(clause),
    );
}

function broadScopeIsActionable(request) {
  return String(request || "")
    .split(/(?:[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b)/iu)
    .some(
      (clause) =>
        BROAD_SCOPE.test(clause) &&
        ACTION_OR_ISSUE.test(clause) &&
        !NEGATED_REQUEST.test(clause),
    );
}

function excludesNamedSection(request, aliases) {
  const sectionAliases = [...aliases];
  return String(request || "")
    .split(/(?:[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b)/iu)
    .some(
      (clause) =>
        (NEGATED_REQUEST.test(clause) ||
          /\bwithout\b|\b(?:leave|keep)\b.{0,90}\b(?:unchanged|as is|alone|intact)\b/iu.test(
            clause,
          )) &&
        sectionAliases.some((alias) => aliasMatchesRequest(alias, clause)),
    );
}

/**
 * Resolve a human creative request to explicit, unique section markers.
 * Ambiguous and unscoped language must be sent to manual attention.
 */
export function resolveCreativeRevisionScope({
  source,
  feedbackItems,
  requestText,
} = {}) {
  const { sections } = collectSections(source);
  if (!Array.isArray(feedbackItems) || feedbackItems.length === 0)
    throw scopeError("creative feedback did not declare a section target.");

  const aliasTargets = new Map();
  for (const section of sections) {
    for (const alias of section.aliases) {
      const key = normalizedPhrase(alias);
      if (!key || key.split(" ").every((part) => STOP_ALIAS_WORDS.has(part)))
        continue;
      const targets = aliasTargets.get(key) || new Set();
      targets.add(section.id);
      aliasTargets.set(key, targets);
    }
  }

  // Unique marker words can serve as short names. Shared words such as
  // "image" are omitted so a request cannot accidentally grant both sections.
  const markerWords = new Map();
  for (const section of sections) {
    const words = normalizedPhrase(section.id).split(" ");
    for (const word of words) {
      if (word.length < 4 || STOP_ALIAS_WORDS.has(word)) continue;
      const targets = markerWords.get(word) || new Set();
      targets.add(section.id);
      markerWords.set(word, targets);
    }
  }
  for (const [word, targets] of markerWords)
    if (targets.size === 1) aliasTargets.set(word, targets);

  const sectionIds = new Set();
  const feedbackIndexes = [];
  let allowMotion = false;
  for (const item of feedbackItems) {
    const text = String(item?.feedback || "").trim();
    if (!text)
      throw scopeError("a creative feedback item has no request text.");
    if (broadScopeIsActionable(text)) {
      if (
        /\b(?:except|excluding|other than)\b/iu.test(text) ||
        excludesNamedSection(text, aliasTargets.keys())
      )
        throw scopeError("partial site-wide scope is ambiguous.");
      for (const section of sections) sectionIds.add(section.id);
    } else {
      const targeted = new Set();
      const excluded = new Set(
        sections
          .filter((section) => explicitlyExcludesSection(text, section.aliases))
          .map((section) => section.id),
      );
      for (const [alias, targets] of aliasTargets) {
        if (
          !aliasMatchesRequest(alias, text) ||
          !aliasIsActionable(text, alias)
        )
          continue;
        if (targets.size !== 1)
          throw scopeError(
            `the phrase "${alias}" matches multiple candidate sections.`,
          );
        const id = [...targets][0];
        if (excluded.has(id))
          throw scopeError(
            `the request gives contradictory instructions for section "${id}".`,
          );
        targeted.add(id);
      }
      if (!targeted.size)
        throw scopeError(
          "the creative feedback does not identify one or more actionable section targets.",
        );
      for (const id of targeted) sectionIds.add(id);
    }
    if (Number.isInteger(item.feedbackIndex))
      feedbackIndexes.push(item.feedbackIndex);
    allowMotion ||= motionRequestIsActionable(text);
  }

  const orderedIds = sections
    .map((section) => section.id)
    .filter((id) => sectionIds.has(id));
  if (!orderedIds.length)
    throw scopeError("the creative feedback did not resolve to a section.");
  return {
    version: 1,
    sectionIds: orderedIds,
    allowMotion,
    feedbackIndexes: [...new Set(feedbackIndexes)].sort((a, b) => a - b),
    requestText: String(
      requestText || feedbackItems.map((item) => item.feedback).join("\n\n"),
    ).trim(),
  };
}

function jsxMarkerOrder(source) {
  return collectSections(source).sections.map((section) => section.id);
}

function maskedJsxTree(root, file, scopedIds) {
  const scoped = new Set(scopedIds);
  const factory = ts.factory;
  const transformer = (context) => {
    const visit = (node) => {
      const marker = sectionMarker(node, file);
      if (marker && scoped.has(marker.id))
        return factory.createJsxSelfClosingElement(
          factory.createIdentifier("section"),
          undefined,
          factory.createJsxAttributes([
            factory.createJsxAttribute(
              factory.createIdentifier("data-reference-section"),
              factory.createStringLiteral(`__ll_scope_${marker.id}__`),
            ),
          ]),
        );
      if (ts.isJsxText(node))
        return factory.createJsxText(
          node.text.replace(/\s+/gu, " "),
          node.containsOnlyTriviaWhiteSpaces,
        );
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit);
  };
  const transformed = ts.transform(root, [transformer]);
  try {
    const printer = ts.createPrinter({ removeComments: true });
    return ts.isSourceFile(root)
      ? printer.printFile(transformed.transformed[0])
      : printer.printNode(
          ts.EmitHint.Unspecified,
          transformed.transformed[0],
          file,
        );
  } finally {
    transformed.dispose();
  }
}

function maskedJsx(source, scopedIds) {
  const file = parseSource(source, "Experience.jsx", ts.ScriptKind.TSX);
  return maskedJsxTree(file, file, scopedIds);
}

function protectedSectionSnapshots(source, scopedIds) {
  const { file, sections } = collectSections(source);
  const scoped = new Set(scopedIds);
  return sections
    .filter((section) => !scoped.has(section.id))
    .map((section) => [
      section.id,
      maskedJsxTree(section.node, file, scopedIds),
    ]);
}

function normalizedVisibleCopy(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim();
}

function staticStringValue(expression) {
  let node = expression;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticStringValue(node.left);
    const right = staticStringValue(node.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function jsxPropertyName(property) {
  if (!property?.name) return null;
  if (ts.isComputedPropertyName(property.name))
    return staticStringValue(property.name.expression);
  if (
    ts.isIdentifier(property.name) ||
    ts.isStringLiteral(property.name) ||
    ts.isNoSubstitutionTemplateLiteral(property.name)
  )
    return property.name.text;
  return null;
}

function isExecutableJsxProp(name) {
  return (
    /^on[a-z]/iu.test(String(name || "")) ||
    String(name || "").toLowerCase() === "ref" ||
    name === "dangerouslySetInnerHTML"
  );
}

function collectStaticExpressionCopy(node, copy) {
  if (!node) return;
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  )
    return;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    const value = normalizedVisibleCopy(node.text);
    if (value) copy.add(value);
    return;
  }
  ts.forEachChild(node, (child) => collectStaticExpressionCopy(child, copy));
}

function scopedVisitorCopy(source, scopedIds) {
  const { file, sections } = collectSections(source);
  const scoped = new Set(scopedIds);
  const copy = new Set();
  for (const section of sections) {
    if (!scoped.has(section.id)) continue;
    const visit = (node) => {
      if (node !== section.node && sectionMarker(node, file)) return;
      if (ts.isJsxText(node)) {
        const value = normalizedVisibleCopy(node.text);
        if (value) copy.add(value);
      } else if (
        ts.isJsxExpression(node) &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
      ) {
        collectStaticExpressionCopy(node.expression, copy);
      }
      const opening = openingElement(node);
      if (opening) {
        for (const attribute of attributeEntries(opening)) {
          if (!isVisitorCopyAttribute(attribute.name.getText(file))) continue;
          const initializer = attribute.initializer;
          if (initializer && ts.isStringLiteral(initializer)) {
            const value = normalizedVisibleCopy(initializer.text);
            if (value) copy.add(value);
          } else if (initializer && ts.isJsxExpression(initializer)) {
            collectStaticExpressionCopy(initializer.expression, copy);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(section.node);
  }
  return copy;
}

function appendContentPath(base, property) {
  return base.map((prefix) => (prefix ? `${prefix}.${property}` : property));
}

function contentPathsInExpression(node, aliases) {
  if (ts.isIdentifier(node)) {
    if (node.text === "content") return [""];
    return aliases.get(node.text) || [];
  }
  if (ts.isPropertyAccessExpression(node)) {
    const base = contentPathsInExpression(node.expression, aliases);
    return base.length ? appendContentPath(base, node.name.text) : [];
  }
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    const key = argument && (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument))
      ? argument.text
      : null;
    const base = contentPathsInExpression(node.expression, aliases);
    return base.length && key !== null ? appendContentPath(base, key) : [];
  }
  const found = new Set();
  ts.forEachChild(node, (child) => {
    for (const path of contentPathsInExpression(child, aliases))
      if (path) found.add(path);
  });
  return [...found];
}

function addContentAlias(aliases, name, paths) {
  if (!name || !paths.length) return false;
  const existing = aliases.get(name) || [];
  const merged = [...new Set([...existing, ...paths])].sort();
  if (existing.length === merged.length && existing.every((path, index) => path === merged[index]))
    return false;
  aliases.set(name, merged);
  return true;
}

function bindContentPattern(pattern, basePaths, aliases) {
  if (ts.isIdentifier(pattern))
    return addContentAlias(aliases, pattern.text, basePaths);
  if (!ts.isObjectBindingPattern(pattern)) return false;
  let changed = false;
  for (const element of pattern.elements) {
    if (element.dotDotDotToken) {
      changed = addContentAlias(aliases, element.name.getText(), [
        ...basePaths.map((base) => (base ? `${base}.*` : "*")),
      ]) || changed;
      continue;
    }
    const property = element.propertyName || element.name;
    const key = ts.isIdentifier(property) || ts.isStringLiteral(property) || ts.isNumericLiteral(property)
      ? property.text
      : "*";
    changed = bindContentPattern(
      element.name,
      appendContentPath(basePaths, key),
      aliases,
    ) || changed;
  }
  return changed;
}

function contentAliasesForSection(section) {
  let owner = section.node;
  while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
  const aliases = new Map();
  if (!owner) return aliases;
  for (const parameter of owner.parameters || []) {
    if (ts.isIdentifier(parameter.name) && parameter.name.text === "content")
      addContentAlias(aliases, "content", [""]);
    else if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        const property = element.propertyName || element.name;
        if (
          (ts.isIdentifier(property) || ts.isStringLiteral(property)) &&
          property.text === "content"
        )
          bindContentPattern(element.name, [""], aliases);
      }
    }
  }
  const body = owner.body;
  if (!body) return aliases;
  // Resolve chains such as `const heroCopy = content.hero; const title =
  // heroCopy.heading` without leaking aliases from other component functions.
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    const visit = (node) => {
      if (node !== body && ts.isFunctionLike(node)) return;
      if (ts.isVariableDeclaration(node) && node.initializer)
        changed = bindContentPattern(
          node.name,
          contentPathsInExpression(node.initializer, aliases),
          aliases,
        ) || changed;
      ts.forEachChild(node, visit);
    };
    visit(body);
    if (!changed) break;
  }
  return aliases;
}

function scopedContentBindings(source, scopedIds) {
  const { file, sections } = collectSections(source);
  const scoped = new Set(scopedIds);
  return sections
    .filter((section) => scoped.has(section.id))
    .map((section) => {
      const aliases = contentAliasesForSection(section);
      const paths = [];
      const visit = (node) => {
        if (node !== section.node && sectionMarker(node, file)) return;
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const parent = node.parent;
          const parentContinuesPath =
            (ts.isPropertyAccessExpression(parent) ||
              ts.isElementAccessExpression(parent)) &&
            parent.expression === node &&
            contentPathsInExpression(parent, aliases).length > 0;
          if (!parentContinuesPath)
            paths.push(...contentPathsInExpression(node, aliases).filter(Boolean));
        }
        ts.forEachChild(node, visit);
      };
      visit(section.node);
      return [section.id, paths.sort()];
    });
}

function scopedPropSpreads(source, scopedIds) {
  const { file, sections } = collectSections(source);
  const scoped = new Set(scopedIds);
  const spreads = [];
  for (const section of sections) {
    if (!scoped.has(section.id)) continue;
    const visit = (node) => {
      if (node !== section.node && sectionMarker(node, file)) return;
      if (ts.isJsxSpreadAttribute(node))
        spreads.push(
          `${section.id}:${normalizedVisibleCopy(node.expression.getText(file))}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(section.node);
  }
  return spreads.sort();
}

/**
 * Detect JSX behavior that can escape the rendered section boundary.
 * @param {string} source
 * @param {string[] | null} [scopedIds=null]
 */
export function findUnsafeJsxBehavior(source, scopedIds = null) {
  const file = parseSource(source, "Experience.jsx", ts.ScriptKind.TSX);
  const scoped = Array.isArray(scopedIds) ? new Set(scopedIds) : null;
  const roots = scoped
    ? collectSections(source)
        .sections.filter((section) => scoped.has(section.id))
        .map((section) => ({ id: section.id, node: section.node }))
    : [{ id: "candidate", node: file }];
  const issues = new Set();

  const inspectGlobalReference = (node, sectionId) => {
    if (!ts.isIdentifier(node) || !UNSAFE_EXPERIENCE_GLOBALS.has(node.text))
      return;
    const parent = node.parent;
    const isPropertyName =
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isMethodDeclaration(parent) && parent.name === node);
    if (!isPropertyName)
      issues.add(`${sectionId}:page-wide global ${node.text}`);
  };

  for (const root of roots) {
    const visit = (node) => {
      if (node !== root.node && scoped && sectionMarker(node, file)) {
        const marker = sectionMarker(node, file);
        if (marker && !scoped.has(marker.id)) return;
      }
      inspectGlobalReference(node, root.id);
      const opening = openingElement(node);
      if (opening) {
        if (opening.tagName.getText(file).toLowerCase() === "form")
          issues.add(
            `${root.id}:native form bypasses the shared LaunchLoom LeadForm endpoint`,
          );
        for (const attribute of opening.attributes.properties) {
          if (ts.isJsxAttribute(attribute)) {
            const name = attribute.name.getText(file);
            if (["action", "formaction"].includes(name.toLowerCase()))
              issues.add(
                `${root.id}:unapproved form submission endpoint prop ${name}`,
              );
            else if (isExecutableJsxProp(name))
              issues.add(`${root.id}:executable JSX prop ${name}`);
          } else if (ts.isJsxSpreadAttribute(attribute)) {
            if (!ts.isObjectLiteralExpression(attribute.expression)) {
              issues.add(`${root.id}:dynamic JSX prop spread`);
              continue;
            }
            for (const property of attribute.expression.properties) {
              if (ts.isSpreadAssignment(property)) {
                issues.add(`${root.id}:nested JSX prop spread`);
                continue;
              }
              const name = jsxPropertyName(property);
              if (name === null) {
                issues.add(`${root.id}:computed JSX prop spread`);
                continue;
              }
              if (["action", "formaction"].includes(name.toLowerCase()))
                issues.add(
                  `${root.id}:unapproved form submission endpoint prop ${name}`,
                );
              else if (isExecutableJsxProp(name))
                issues.add(`${root.id}:executable JSX prop spread ${name}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(root.node);
  }
  return [...issues].sort();
}

function staticExpressionText(expression) {
  const pieces = [];
  const visit = (node) => {
    if (!node) return;
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      pieces.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      pieces.push(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        pieces.push(span.literal.text);
      }
      return;
    }
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    )
      return;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return pieces.join(" ");
}

function jsxStaticText(node, file, scopedIds = null) {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node)) return staticExpressionText(node.expression);
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    const marker = sectionMarker(node, file);
    if (marker && scopedIds && !scopedIds.has(marker.id)) return "";
    return node.children
      .map((child) => jsxStaticText(child, file, scopedIds))
      .join("");
  }
  return "";
}

function hasPositiveUnsupportedClaim(value) {
  const text = normalizedVisibleCopy(value);
  for (const match of text.matchAll(UNSUPPORTED_CLAIM_PATTERN)) {
    const precedingClause = text
      .slice(0, match.index)
      .split(/[.!?;:]/u)
      .at(-1);
    if (!NEGATED_CLAIM_PREFIX.test(precedingClause || "")) return true;
  }
  return false;
}

/**
 * Return positive, statically composed claim text, optionally within sections.
 * @param {string} source
 * @param {string[] | null} [scopedIds]
 * @returns {string[]}
 */
export function findUnsupportedClaimCopy(source, scopedIds = null) {
  const scoped = Array.isArray(scopedIds) ? new Set(scopedIds) : null;
  const roots = scoped
    ? collectSections(source)
        .sections.filter((section) => scoped.has(section.id))
        .map((section) => ({ id: section.id, node: section.node }))
    : [
        {
          id: "candidate",
          node: parseSource(source, "Experience.jsx", ts.ScriptKind.TSX),
        },
      ];
  const claims = new Set();

  for (const root of roots) {
    const visit = (node) => {
      if (
        node !== root.node &&
        scoped &&
        sectionMarker(node, node.getSourceFile())
      ) {
        const marker = sectionMarker(node, node.getSourceFile());
        if (marker && !scoped.has(marker.id)) return;
      }
      const opening = openingElement(node);
      if (opening) {
        const tag = opening.tagName.getText(node.getSourceFile()).toLowerCase();
        if (
          CLAIM_TEXT_BLOCKS.has(tag) &&
          (ts.isJsxElement(node) || ts.isJsxFragment(node))
        ) {
          const value = normalizedVisibleCopy(
            jsxStaticText(node, node.getSourceFile(), scoped),
          );
          if (value && hasPositiveUnsupportedClaim(value)) claims.add(value);
        }
        for (const attribute of attributeEntries(opening)) {
          if (
            !isVisitorCopyAttribute(
              attribute.name.getText(node.getSourceFile()),
            )
          )
            continue;
          const initializer = attribute.initializer;
          const value = !initializer
            ? ""
            : ts.isStringLiteral(initializer)
              ? initializer.text
              : ts.isJsxExpression(initializer)
                ? staticExpressionText(initializer.expression)
                : "";
          if (value && hasPositiveUnsupportedClaim(value)) claims.add(value);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(root.node);
  }
  return [...claims].sort();
}

/** Reject motion-side writes to DOM text, HTML, or attributes. */
export function findUnsafeMotionDomProperty(source) {
  const file = parseSource(source, "motion.js", ts.ScriptKind.JS);
  const declarations = new Map();
  const gsapObjects = new Set(["gsap"]);
  const collectDeclarations = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const values = declarations.get(node.name.text) || [];
      values.push(node.initializer);
      declarations.set(node.name.text, values);
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "gsap" &&
      node.importClause
    ) {
      const clause = node.importClause;
      if (clause.name) gsapObjects.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        gsapObjects.add(clause.namedBindings.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const element of clause.namedBindings.elements)
          if ((element.propertyName || element.name).text === "gsap")
            gsapObjects.add(element.name.text);
    }
    ts.forEachChild(node, collectDeclarations);
  };
  collectDeclarations(file);

  const resolveGsapCallName = (expression, seen = new Set()) => {
    let node = expression;
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    if (!node) return "";
    if (ts.isIdentifier(node)) {
      if (gsapObjects.has(node.text)) return "gsap";
      if (seen.has(node.text)) return "";
      const initializers = declarations.get(node.text) || [];
      if (initializers.length !== 1) return "";
      const nextSeen = new Set(seen);
      nextSeen.add(node.text);
      return resolveGsapCallName(initializers[0], nextSeen);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const target = resolveGsapCallName(node.expression, seen);
      return target.startsWith("gsap") ? `${target}.${node.name.text}` : "";
    }
    if (ts.isElementAccessExpression(node)) {
      const target = resolveGsapCallName(node.expression, seen);
      const argument = node.argumentExpression;
      const property =
        argument && ts.isStringLiteralLike(argument) ? argument.text : "";
      return target.startsWith("gsap") && property
        ? `${target}.${property}`
        : "";
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "bind"
    )
      return resolveGsapCallName(node.expression.expression, seen);
    return "";
  };

  let unsafe = "";
  const inspectVars = (root, seen = new Set()) => {
    if (!root || unsafe) return;
    let node = root;
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) {
        unsafe = "recursive GSAP vars";
        return;
      }
      const initializers = declarations.get(node.text) || [];
      if (initializers.length !== 1) {
        unsafe = `indirect GSAP vars ${node.text}`;
        return;
      }
      const nextSeen = new Set(seen);
      nextSeen.add(node.text);
      inspectVars(initializers[0], nextSeen);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          let name = "";
          if (ts.isComputedPropertyName(property.name)) {
            const expression = property.name.expression;
            if (
              ts.isStringLiteralLike(expression) ||
              ts.isNoSubstitutionTemplateLiteral(expression)
            )
              name = expression.text;
            else {
              unsafe = "computed GSAP property";
              return;
            }
          } else if (
            ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name) ||
            ts.isNoSubstitutionTemplateLiteral(property.name)
          ) {
            name = property.name.text;
          }
          if (UNSAFE_MOTION_DOM_PROPERTIES.has(name.toLowerCase())) {
            unsafe = name;
            return;
          }
          if (
            ts.isObjectLiteralExpression(property.initializer) ||
            ts.isArrayLiteralExpression(property.initializer)
          )
            inspectVars(property.initializer, seen);
          if (unsafe) return;
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const name = property.name.text;
          if (UNSAFE_MOTION_DOM_PROPERTIES.has(name.toLowerCase())) {
            unsafe = name;
            return;
          }
          inspectVars(property.name, seen);
          if (unsafe) return;
        } else if (ts.isSpreadAssignment(property)) {
          inspectVars(property.expression, seen);
          if (unsafe) return;
        }
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) inspectVars(element, seen);
      return;
    }
    if (
      ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    )
      unsafe = "indirect GSAP vars";
  };
  const visitCalls = (node) => {
    if (unsafe) return;
    if (
      ts.isCallExpression(node) &&
      resolveGsapCallName(node.expression).startsWith("gsap.")
    )
      for (const argument of node.arguments.slice(1)) inspectVars(argument);
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(file);
  if (unsafe) return unsafe;

  const domMutationMethods = new Set([
    "after",
    "append",
    "appendchild",
    "before",
    "insertbefore",
    "insertadjacentelement",
    "insertadjacenthtml",
    "insertadjacenttext",
    "prepend",
    "removeattribute",
    "removeattributens",
    "removeattributenode",
    "removechild",
    "remove",
    "replacechild",
    "replacechildren",
    "replacewith",
    "setattribute",
    "setattributens",
    "setattributenode",
    "toggleattribute",
    "write",
    "writeln",
  ]);
  const propertyChainContains = (node, names) => {
    let current = node;
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    ) {
      if (
        ts.isPropertyAccessExpression(current) &&
        names.has(current.name.text.toLowerCase())
      )
        return true;
      current = current.expression;
    }
    return false;
  };
  const directMutationContainers = new Set(["classlist", "dataset", "style"]);
  const classMutationMethods = new Set(["add", "remove", "replace", "toggle"]);
  const styleMutationMethods = new Set(["removeproperty", "setproperty"]);
  const propertyName = (node) => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node))
      return staticStringValue(node.argumentExpression);
    return "";
  };
  const isAssignment = (node) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  const findDirectDomWrite = (node) => {
    if (unsafe) return;
    if (isAssignment(node)) {
      const name = propertyName(node.left);
      if (
        (name && UNSAFE_MOTION_DOM_PROPERTIES.has(name.toLowerCase())) ||
        (ts.isElementAccessExpression(node.left) && !name) ||
        propertyChainContains(node.left, directMutationContainers)
      ) {
        unsafe = name || "computed DOM property";
        return;
      }
    }
    if (ts.isDeleteExpression(node)) {
      const name = propertyName(node.expression);
      if (
        (name && UNSAFE_MOTION_DOM_PROPERTIES.has(name.toLowerCase())) ||
        (ts.isElementAccessExpression(node.expression) && !name) ||
        propertyChainContains(node.expression, directMutationContainers)
      ) {
        unsafe = name || "computed DOM property";
        return;
      }
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      )
    ) {
      const name = propertyName(node.operand);
      if (name && UNSAFE_MOTION_DOM_PROPERTIES.has(name.toLowerCase())) {
        unsafe = name;
        return;
      }
    }
    if (ts.isCallExpression(node)) {
      const method = propertyName(node.expression);
      const normalizedMethod = method.toLowerCase();
      const writesClass =
        propertyChainContains(node.expression, new Set(["classlist"])) &&
        classMutationMethods.has(normalizedMethod);
      const writesStyle =
        propertyChainContains(node.expression, new Set(["style"])) &&
        styleMutationMethods.has(normalizedMethod);
      if (
        domMutationMethods.has(normalizedMethod) ||
        writesClass ||
        writesStyle
      ) {
        unsafe = method;
        return;
      }
    }
    ts.forEachChild(node, findDirectDomWrite);
  };
  findDirectDomWrite(file);
  return unsafe;
}

function expressionReferencesContentPath(expression, path, file) {
  let found = false;
  const expected = path.replace(/\s+/gu, "").replace(/\?\./gu, ".");
  const visit = (node) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node)) {
      const actual = node
        .getText(file)
        .replace(/\s+/gu, "")
        .replace(/\?\./gu, ".");
      if (actual === expected) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  if (expression) visit(expression);
  return found;
}

function collectVariableInitializers(file) {
  const declarations = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const values = declarations.get(node.name.text) || [];
      values.push(node.initializer);
      declarations.set(node.name.text, values);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return declarations;
}

function resolveContactExpression(expression, declarations, seen = new Set()) {
  let node = expression;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (!node || !ts.isIdentifier(node) || seen.has(node.text)) return node;
  const initializers = declarations.get(node.text) || [];
  if (initializers.length !== 1) return node;
  const nextSeen = new Set(seen);
  nextSeen.add(node.text);
  return resolveContactExpression(initializers[0], declarations, nextSeen);
}

function staticStringPrefix(expression) {
  let node = expression;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (!node) return "";
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return staticStringPrefix(node.left);
  return "";
}

function isExactSealedContactExpression(expression, scheme, token, file) {
  let node = expression;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  const expectedPrefix = `${scheme}:`;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text === expectedPrefix &&
      node.templateSpans.length === 1 &&
      node.templateSpans[0].literal.text === "" &&
      expressionReferencesContentPath(
        node.templateSpans[0].expression,
        token,
        file,
      ) &&
      node.templateSpans[0].expression
        .getText(file)
        .replace(/\s+/gu, "")
        .replace(/\?\./gu, ".") === token
    );
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    let left = node.left;
    let right = node.right;
    while (ts.isParenthesizedExpression(left)) left = left.expression;
    while (ts.isParenthesizedExpression(right)) right = right.expression;
    return (
      (ts.isStringLiteral(left) || ts.isNoSubstitutionTemplateLiteral(left)) &&
      left.text === expectedPrefix &&
      expressionReferencesContentPath(right, token, file) &&
      right.getText(file).replace(/\s+/gu, "").replace(/\?\./gu, ".") === token
    );
  }
  return false;
}

function contactDestinationInfo(initializer, file, declarations) {
  if (!initializer) return null;
  let expression = null;
  let prefix = "";
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    expression = resolveContactExpression(initializer.expression, declarations);
    prefix = staticStringPrefix(expression);
  } else if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    prefix = initializer.text;
  } else {
    expression = resolveContactExpression(initializer, declarations);
    prefix = staticStringPrefix(expression);
  }

  const scheme = prefix.match(/^(tel|mailto):/iu)?.[1]?.toLowerCase() || "";
  if (!scheme) return null;
  const token =
    scheme === "tel" ? "content.brand.phone" : "content.brand.email";
  if (
    expression &&
    isExactSealedContactExpression(expression, scheme, token, file)
  )
    return null;
  return `${scheme} destination must use ${token} directly after the scheme`;
}

/** Require telephone and email links to use the sealed business values. */
export function findUnsealedContactDestinations(source, scopedIds = null) {
  const scoped = Array.isArray(scopedIds) ? new Set(scopedIds) : null;
  const roots = scoped
    ? collectSections(source)
        .sections.filter((section) => scoped.has(section.id))
        .map((section) => ({ id: section.id, node: section.node }))
    : [
        {
          id: "candidate",
          node: parseSource(source, "Experience.jsx", ts.ScriptKind.TSX),
        },
      ];
  const declarations = collectVariableInitializers(
    scoped ? collectSections(source).file : roots[0].node,
  );
  const issues = new Set();
  for (const root of roots) {
    const visit = (node) => {
      if (
        node !== root.node &&
        scoped &&
        sectionMarker(node, node.getSourceFile())
      ) {
        const marker = sectionMarker(node, node.getSourceFile());
        if (marker && !scoped.has(marker.id)) return;
      }
      const opening = openingElement(node);
      if (opening) {
        for (const attribute of opening.attributes.properties) {
          if (ts.isJsxAttribute(attribute)) {
            if (attribute.name.getText(node.getSourceFile()) !== "href")
              continue;
            const issue = contactDestinationInfo(
              attribute.initializer,
              node.getSourceFile(),
              declarations,
            );
            if (issue) issues.add(`${root.id}: ${issue}`);
          } else if (
            ts.isJsxSpreadAttribute(attribute) &&
            ts.isObjectLiteralExpression(attribute.expression)
          ) {
            for (const property of attribute.expression.properties) {
              if (jsxPropertyName(property)?.toLowerCase() !== "href") continue;
              const initializer = ts.isPropertyAssignment(property)
                ? property.initializer
                : ts.isShorthandPropertyAssignment(property)
                  ? property.name
                  : null;
              const issue = contactDestinationInfo(
                initializer,
                node.getSourceFile(),
                declarations,
              );
              if (issue) issues.add(`${root.id}: ${issue}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(root.node);
  }
  return [...issues].sort();
}

function splitSelectors(selector) {
  const values = [];
  let start = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = "";
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (quote) {
      if (char === quote && selector[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "," && bracketDepth === 0 && parenDepth === 0) {
      values.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(selector.slice(start).trim());
  return values.filter(Boolean);
}

function combineSelectors(parents, childSelector) {
  const children = splitSelectors(childSelector);
  if (!parents.length) return children;
  return parents.flatMap((parent) =>
    children.map((child) =>
      child.includes("&") ? child.replace(/&/gu, parent) : `${parent} ${child}`,
    ),
  );
}

function isSafeScopedSelector(selector, allowedIds) {
  if (/:not\s*\(|:has\s*\(|:is\s*\(|:where\s*\(|:matches\s*\(/iu.test(selector))
    return false;
  const attributes = [
    ...selector.matchAll(/\[\s*data-reference-section\b[^\]]*\]/giu),
  ];
  if (attributes.length !== 1) return false;
  const exact = attributes[0][0].match(
    /^\[\s*data-reference-section\s*=\s*(["'])([^"']+)\1\s*\]$/iu,
  );
  if (!exact || !allowedIds.has(exact[2])) return false;
  const end = (attributes[0].index || 0) + attributes[0][0].length;
  const suffix = selector.slice(end);
  let quote = "";
  let bracketDepth = 0;
  let parenDepth = 0;
  for (let index = 0; index < suffix.length; index += 1) {
    const char = suffix[index];
    if (quote) {
      if (char === quote && suffix[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (
      (char === "+" || char === "~") &&
      bracketDepth === 0 &&
      parenDepth === 0
    )
      return false;
  }
  return true;
}

function normalizeCssText(value) {
  let output = "";
  let quote = "";
  let pendingSpace = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      output += char;
      if (char === quote && value[index - 1] !== "\\") quote = "";
    } else if (char === '"' || char === "'") {
      if (pendingSpace && output) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
    } else if (/\s/u.test(char)) pendingSpace = true;
    else {
      if (pendingSpace && output) output += " ";
      pendingSpace = false;
      output += char;
    }
  }
  return output.trim();
}

// Only selector-preserving grouping rules are allowed to inherit a scoped
// section selector. Rules such as @keyframes, @font-face, @property, and
// unknown at-rules remain visible in the outside-scope comparison so a scoped
// edit cannot mutate global CSS behavior from inside a section block.
const SCOPED_CSS_GROUPING_AT_RULES = new Set([
  "container",
  "media",
  "supports",
]);

function stripScopedDeclarations(container, parentSelectors, allowedIds) {
  for (const node of [...(container.nodes || [])]) {
    if (node.type === "rule") {
      const selectors = combineSelectors(parentSelectors, node.selector);
      stripScopedDeclarations(node, selectors, allowedIds);
      if (
        selectors.length &&
        selectors.every((selector) =>
          isSafeScopedSelector(selector, allowedIds),
        )
      ) {
        for (const child of [...(node.nodes || [])])
          if (child.type === "decl" || child.type === "comment") child.remove();
      }
      if (!(node.nodes || []).some((child) => child.type !== "comment"))
        node.remove();
    } else if (node.type === "atrule") {
      if (!SCOPED_CSS_GROUPING_AT_RULES.has(node.name.toLowerCase()))
        continue;
      stripScopedDeclarations(node, parentSelectors, allowedIds);
      if (
        Array.isArray(node.nodes) &&
        !node.nodes.some((child) => child.type !== "comment")
      )
        node.remove();
    } else if (
      (node.type === "decl" || node.type === "comment") &&
      parentSelectors.length &&
      parentSelectors.every((selector) =>
        isSafeScopedSelector(selector, allowedIds),
      )
    ) {
      node.remove();
    }
  }
}

function cssShape(node) {
  if (node.type === "root")
    return ["root", ...(node.nodes || []).map(cssShape)];
  if (node.type === "rule")
    return [
      "rule",
      normalizeCssText(node.selector),
      ...(node.nodes || []).map(cssShape),
    ];
  if (node.type === "atrule")
    return [
      "atrule",
      node.name,
      normalizeCssText(node.params || ""),
      ...(node.nodes || []).map(cssShape),
    ];
  if (node.type === "decl")
    return ["decl", node.prop, node.value, Boolean(node.important)];
  return [node.type, node.text || ""];
}

function cssOutsideScope(source, allowedIds) {
  const root = postcss.parse(String(source || ""), { from: "styles.css" });
  stripScopedDeclarations(root, [], allowedIds);
  return JSON.stringify(cssShape(root));
}

function scopedCssVisitorCopy(source, allowedIds) {
  const root = postcss.parse(String(source || ""), { from: "styles.css" });
  const copy = new Set();
  const visit = (container, parentSelectors = []) => {
    for (const node of container.nodes || []) {
      if (node.type === "rule") {
        const selectors = combineSelectors(parentSelectors, node.selector);
        if (
          selectors.length &&
          selectors.every((selector) =>
            isSafeScopedSelector(selector, allowedIds),
          )
        ) {
          for (const child of node.nodes || []) {
            if (child.type !== "decl" || child.prop.toLowerCase() !== "content")
              continue;
            const value = normalizeCssText(child.value);
            if (
              value &&
              !/^(?:none|normal|open-quote|close-quote|no-open-quote|no-close-quote|["']\s*["'])$/iu.test(
                value,
              )
            )
              copy.add(value);
          }
        }
        visit(node, selectors);
      } else if (node.type === "atrule" && Array.isArray(node.nodes)) {
        visit(node, parentSelectors);
      }
    }
  };
  visit(root);
  return copy;
}

function isExported(node) {
  return (ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function findSingleTopLevelMotionHook(file) {
  const declarations = [];
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === "mountExperienceMotion"
    ) {
      declarations.push({
        kind: "function",
        declaration: node,
        body: node.body,
        topLevel:
          ts.isFunctionDeclaration(node) &&
          node.parent === file &&
          isExported(node),
      });
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "mountExperienceMotion"
    ) {
      const statement = node.parent?.parent;
      const initializer = node.initializer;
      const body =
        initializer &&
        (ts.isArrowFunction(initializer) ||
          ts.isFunctionExpression(initializer))
          ? initializer.body
          : null;
      declarations.push({
        kind: "variable",
        declaration: node,
        initializer,
        body,
        topLevel:
          Boolean(statement) &&
          ts.isVariableStatement(statement) &&
          statement.parent === file &&
          isExported(statement) &&
          (node.parent.flags & ts.NodeFlags.Const) !== 0,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (
    declarations.length !== 1 ||
    !declarations[0].topLevel ||
    !declarations[0].body ||
    !ts.isBlock(declarations[0].body)
  )
    throw scopeError(
      "motion edits require exactly one top-level exported mountExperienceMotion hook with a block body.",
    );
  return declarations[0];
}

function motionOutsideMount(source) {
  const file = parseSource(source, "motion.js", ts.ScriptKind.JS);
  const hook = findSingleTopLevelMotionHook(file);
  const transformer = (context) => {
    const visit = (node) => {
      if (node === hook.declaration && hook.kind === "function") {
        return ts.factory.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          ts.factory.createBlock([], true),
        );
      }
      if (node === hook.declaration && hook.kind === "variable") {
        const initializer = hook.initializer;
        const emptyBody = ts.factory.createBlock([], true);
        const emptyInitializer = ts.isArrowFunction(initializer)
          ? ts.factory.updateArrowFunction(
              initializer,
              initializer.modifiers,
              initializer.typeParameters,
              initializer.parameters,
              initializer.type,
              initializer.equalsGreaterThanToken,
              emptyBody,
            )
          : ts.factory.updateFunctionExpression(
              initializer,
              initializer.modifiers,
              initializer.asteriskToken,
              initializer.name,
              initializer.typeParameters,
              initializer.parameters,
              initializer.type,
              emptyBody,
            );
        return ts.factory.updateVariableDeclaration(
          node,
          node.name,
          node.exclamationToken,
          node.type,
          emptyInitializer,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit);
  };
  const transformed = ts.transform(file, [transformer]);
  try {
    return {
      found: true,
      source: ts
        .createPrinter({ removeComments: true })
        .printFile(transformed.transformed[0]),
    };
  } finally {
    transformed.dispose();
  }
}

function memberCallName(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return "";
  const receiver = call.expression.expression;
  return ts.isIdentifier(receiver)
    ? `${receiver.text}.${call.expression.name.text}`
    : "";
}

function declaredMotionTargets(body, allowedIds) {
  const targets = new Map();
  const selectorPattern =
    /^\[\s*data-reference-section\s*=\s*(["'])([^"']+)\1\s*\]$/iu;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      memberCallName(node) === "document.querySelector"
    ) {
      const declaration = node.parent;
      const isConstBinding =
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer === node &&
        ts.isIdentifier(declaration.name) &&
        ts.isVariableDeclarationList(declaration.parent) &&
        (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
      const selector = node.arguments.length === 1 && node.arguments[0];
      const match =
        selector && ts.isStringLiteral(selector)
          ? selector.text.match(selectorPattern)
          : null;
      if (
        !isConstBinding ||
        !match ||
        !allowedIds.has(match[2]) ||
        targets.has(declaration.name.text)
      )
        throw scopeError(
          "motion target must be a declared section element selected by its exact marker.",
        );
      targets.set(declaration.name.text, match[2]);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return targets;
}

function validateMotionScope(source, scope) {
  const file = parseSource(source, "motion.js", ts.ScriptKind.JS);
  const allowedIds = new Set(scope.sectionIds);
  const body = findSingleTopLevelMotionHook(file).body;

  const targets = declaredMotionTargets(body, allowedIds);
  if (!targets.size)
    throw scopeError("motion target must be a declared section element.");

  const allowedCalls = new Set();
  const animatedTargets = new Set();
  const allowedGlobals = new Set();
  const isIdentifier = (node, name) =>
    Boolean(node && ts.isIdentifier(node) && node.text === name);
  const isTarget = (node) =>
    Boolean(node && ts.isIdentifier(node) && targets.has(node.text));

  const visit = (node) => {
    if (
      ts.isDeleteExpression(node) ||
      ((ts.isPrefixUnaryExpression(node) ||
        ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          node.operator,
        ))
    )
      throw scopeError(
        "motion hooks cannot write directly to scoped DOM elements; use section-scoped GSAP calls.",
      );
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      throw scopeError(
        "motion hooks cannot write directly to scoped DOM elements; use section-scoped GSAP calls.",
      );
    if (ts.isNewExpression(node))
      throw scopeError(
        "motion constructors or remote URLs are not allowed in human motion edits.",
      );
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)) &&
      /https?:\/\//iu.test(node.text)
    )
      throw scopeError(
        "motion constructors or remote URLs are not allowed in human motion edits.",
      );
    if (ts.isCallExpression(node)) {
      const callName = memberCallName(node);
      if (callName === "document.querySelector") {
        allowedCalls.add(node);
        allowedGlobals.add(node.expression.expression);
      } else if (callName === "window.matchMedia") {
        const query = node.arguments.length === 1 && node.arguments[0];
        if (
          !query ||
          !ts.isStringLiteral(query) ||
          query.text !== "(prefers-reduced-motion: reduce)"
        )
          throw scopeError(
            "motion may only read the standard reduced-motion preference from window.",
          );
        allowedCalls.add(node);
        allowedGlobals.add(node.expression.expression);
      } else if (callName.startsWith("gsap.")) {
        const method = callName.slice("gsap.".length);
        const target = node.arguments[0];
        if (
          !["from", "fromTo", "set", "to", "killTweensOf"].includes(method) ||
          !isTarget(target)
        )
          throw scopeError(
            "motion target must be a declared section element; global or string selectors are not allowed.",
          );
        animatedTargets.add(target.text);
        allowedCalls.add(node);
        allowedGlobals.add(node.expression.expression);
      } else if (
        isIdentifier(node.expression, "Boolean") &&
        node.arguments.length === 1
      ) {
        allowedCalls.add(node);
      } else {
        throw scopeError(
          "motion edits may only use section-scoped GSAP calls and the reduced-motion preference.",
        );
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      if (["trigger", "endTrigger", "scroller"].includes(node.name.text)) {
        if (!isTarget(node.initializer))
          throw scopeError(
            `motion ${node.name.text} must use a declared section element.`,
          );
      }
    }
    if (ts.isIdentifier(node)) {
      if (
        [
          "globalThis",
          "self",
          "process",
          "fetch",
          "location",
          "history",
          "navigator",
          "localStorage",
          "sessionStorage",
          "XMLHttpRequest",
          "requestAnimationFrame",
          "setTimeout",
          "setInterval",
        ].includes(node.text)
      )
        throw scopeError(
          "motion edits cannot access page-wide or external browser globals.",
        );
      if (["document", "window", "gsap"].includes(node.text)) {
        const parent = node.parent;
        const directTypeof =
          parent && ts.isTypeOfExpression(parent) && parent.expression === node;
        const member =
          parent &&
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node
            ? parent
            : null;
        const call =
          member && member.parent && ts.isCallExpression(member.parent)
            ? member.parent
            : null;
        if (
          !directTypeof &&
          (!call || !allowedCalls.has(call) || !allowedGlobals.has(node))
        )
          throw scopeError(
            "motion edits cannot access global objects outside the scoped animation API.",
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  const unsafeProperty = findUnsafeMotionDomProperty(source);
  if (unsafeProperty)
    throw scopeError(
      `GSAP motion cannot change DOM text, HTML, or attributes through ${unsafeProperty}.`,
    );
  if (!animatedTargets.size)
    throw scopeError("motion edits must animate a declared section element.");
}

function assertApprovedMotionChange(before, after, scope) {
  if (!scope.allowMotion)
    throw scopeError("the candidate changed motion without explicit approval.");
  const beforeMount = motionOutsideMount(before);
  const afterMount = motionOutsideMount(after);
  if (
    !beforeMount.found ||
    !afterMount.found ||
    beforeMount.source !== afterMount.source
  )
    throw scopeError("motion edits must stay inside mountExperienceMotion.");
  validateMotionScope(after, scope);
}

/**
 * Check proposed human-repair files against the resolved source-level scope.
 * Only listed JSX sections and CSS rules anchored to those sections may vary.
 */
export function assertCreativeRevisionScope(before, after, scope) {
  if (!before || !after || !scope || scope.version !== 1)
    throw scopeError("a versioned source scope is required for human repair.");
  const sectionIds = Array.isArray(scope.sectionIds) ? scope.sectionIds : [];
  if (
    !sectionIds.length ||
    sectionIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(sectionIds).size !== sectionIds.length
  )
    throw scopeError("the declared section scope is empty or duplicated.");

  const beforeOrder = jsxMarkerOrder(before.experience);
  const afterOrder = jsxMarkerOrder(after.experience);
  if (
    beforeOrder.length !== afterOrder.length ||
    beforeOrder.some((id, index) => id !== afterOrder[index])
  )
    throw scopeError("section markers or their order changed during repair.");
  const beforeSet = new Set(beforeOrder);
  if (sectionIds.some((id) => !beforeSet.has(id)))
    throw scopeError("the declared scope references a missing section marker.");
  const allowed = new Set(sectionIds);

  const unsafeBehavior = findUnsafeJsxBehavior(after.experience, sectionIds);
  if (unsafeBehavior.length)
    throw scopeError(
      `JSX event handlers and page-wide behavior are not allowed in human creative repairs: ${unsafeBehavior[0]}.`,
    );
  const unsealedDestinations = findUnsealedContactDestinations(
    after.experience,
    sectionIds,
  );
  if (unsealedDestinations.length)
    throw scopeError(
      `contact destinations inside the scoped section must use sealed business content: ${unsealedDestinations[0]}.`,
    );

  if (
    maskedJsx(before.experience, sectionIds) !==
    maskedJsx(after.experience, sectionIds)
  )
    throw scopeError("JSX changed outside declared section scope.");
  if (
    JSON.stringify(protectedSectionSnapshots(before.experience, sectionIds)) !==
    JSON.stringify(protectedSectionSnapshots(after.experience, sectionIds))
  )
    throw scopeError("JSX changed outside declared section scope.");
  if (
    JSON.stringify(scopedContentBindings(before.experience, sectionIds)) !==
    JSON.stringify(scopedContentBindings(after.experience, sectionIds))
  )
    throw scopeError(
      "sealed content bindings changed inside a declared section; content edits must use the approved revision path.",
    );
  const approvedCopy = scopedVisitorCopy(before.experience, sectionIds);
  for (const value of scopedVisitorCopy(after.experience, sectionIds))
    if (!approvedCopy.has(value) && !FIXED_UI_COPY.has(value))
      throw scopeError(
        `new visitor-facing copy inside the scoped section needs factual review: ${value.slice(0, 90)}.`,
      );
  const existingClaims = new Set(
    findUnsupportedClaimCopy(before.experience, sectionIds),
  );
  for (const claim of findUnsupportedClaimCopy(after.experience, sectionIds))
    if (!existingClaims.has(claim))
      throw scopeError(
        `a new factual claim inside the scoped section needs review: ${claim.slice(0, 90)}.`,
      );
  if (
    JSON.stringify(scopedPropSpreads(before.experience, sectionIds)) !==
    JSON.stringify(scopedPropSpreads(after.experience, sectionIds))
  )
    throw scopeError(
      "a new or changed JSX prop spread may add visitor-facing copy and needs factual review.",
    );
  const approvedCssCopy = scopedCssVisitorCopy(before.styles, allowed);
  for (const value of scopedCssVisitorCopy(after.styles, allowed))
    if (!approvedCssCopy.has(value))
      throw scopeError(
        `new visitor-facing CSS content inside the scoped section needs factual review: ${value.slice(0, 90)}.`,
      );
  try {
    if (
      cssOutsideScope(before.styles, allowed) !==
      cssOutsideScope(after.styles, allowed)
    )
      throw scopeError(
        "global or unrelated CSS changed outside declared section scope.",
      );
  } catch (error) {
    if (error?.code === "CREATIVE_REVISION_SCOPE_REJECTED") throw error;
    throw scopeError(
      `styles.css could not be safely compared: ${error?.message || error}`,
    );
  }

  if (String(before.motion || "") !== String(after.motion || ""))
    assertApprovedMotionChange(before.motion, after.motion, scope);
  return {
    sectionIds: [...sectionIds],
    allowMotion: Boolean(scope.allowMotion),
  };
}
