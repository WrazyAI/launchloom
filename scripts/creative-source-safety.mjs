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

/**
 * Deterministic, dependency-free safety checks for an authored ServicePage.jsx.
 *
 * The service page renders the same sealed content as the homepage plus one
 * service record, so it must obey the same promotion contract: no remote code
 * or network primitives, exactly one shared LeadForm bound to sealed content,
 * the real /services/ router contract, and the provenance markers that the
 * rendered bakeoff asserts. These checks stay intentionally lighter than the
 * authoring validator so reused or previously authored candidates can still be
 * promoted when they pass the security surface.
 *
 * @param {string} source
 * @param {{candidateId?: string}} [options]
 * @returns {true}
 */
export function assertCreativeServicePageSource(source, { candidateId = "candidate" } = {}) {
  const value = String(source || "");
  const fail = (message) => {
    throw new Error(`Creative candidate ${candidateId} ServicePage.jsx ${message}.`);
  };
  if (!value.trim()) fail("is empty");
  const forbidden = [
    [/https?:\/\//iu, "contains a remote URL"],
    [/\bfetch\s*\(/iu, "contains a network request"],
    [/\bXMLHttpRequest\b|\bWebSocket\b/iu, "contains a network primitive"],
    [/\beval\s*\(|\bnew\s+Function\b/iu, "contains dynamic code"],
    [/<canvas\b|\bthree(?:\s*\.?\s*js)\b/iu, "uses an unapproved rendering engine"],
    [/<script\b/iu, "contains a script element"],
    [/<style\b|\sstyle\s*=/iu, "contains inline styles; visual rules belong in styles.css"],
    [/—/u, "contains an em dash"],
  ];
  for (const [pattern, message] of forbidden)
    if (pattern.test(value)) fail(message);
  if (
    !/import\s+\{[^}]*\bLeadForm\b[^}]*\}\s+from\s+["']@launchloom\/runtime["']/u.test(
      value,
    )
  )
    fail("must import LeadForm from @launchloom/runtime");
  const leadFormCount = (value.match(/<LeadForm\b/gu) || []).length;
  if (leadFormCount !== 1) fail("must render exactly one shared LeadForm");
  if (!/<LeadForm\b[^>]*\bcontent\s*=\s*\{\s*content\s*\}/u.test(value))
    fail("must pass sealed content to LeadForm");
  if (!/\bdata-service-page\b/u.test(value))
    fail("must expose data-service-page on the page root");
  if (!/<h1\b/u.test(value)) fail("must render a service H1 heading");
  if (!/\/services\//u.test(value))
    fail("must link related services through the /services/ route");
  return true;
}
