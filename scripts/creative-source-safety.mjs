/**
 * Normalize safe, deterministic route links in model-authored experiences.
 *
 * Service slugs are generated route identifiers, not homepage fragment IDs.
 * Authors occasionally express a service detail link as `#${service.slug}`;
 * that renders as a broken fragment because the homepage does not contain an
 * element for every service slug. Keep the authored composition intact while
 * correcting only this known routing contract.
 */
export function normalizeCreativeExperienceLinks(source) {
  let normalized = String(source || "");
  normalized = normalized.replace(
    /href=\{\s*`#\$\{(service|item)\.slug\}`\s*\}/gu,
    (_, objectName) => `href={\`/services/\${${objectName}.slug}/\`}`,
  );
  normalized = normalized.replace(
    /href=\{\s*["']#["']\s*\+\s*(service|item)\.slug\s*\}/gu,
    (_, objectName) => `href={\`/services/\${${objectName}.slug}/\`}`,
  );
  return normalized;
}

export function staticJsxStringAttributePattern(attribute, value) {
  const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return `\\b${attribute}\\s*=\\s*(?:\"${escapedValue}\"|'${escapedValue}'|\\{\\s*\"${escapedValue}\"\\s*\\}|\\{\\s*'${escapedValue}'\\s*\\})`;
}

export function hasStaticJsxStringAttribute(source, attribute, value) {
  return new RegExp(staticJsxStringAttributePattern(attribute, value), "u").test(
    String(source || ""),
  );
}
