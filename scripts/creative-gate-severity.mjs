/**
 * Creative gate severity classification.
 *
 * Single source of truth for how a candidate's failure lines are graded:
 *
 * - `hard` failures block every path (strict promotion, near-miss previews,
 *   and future delivery rules). They cover deterministic accessibility and
 *   integrity gates: overflow, broken images, missing required sections,
 *   unnamed controls, missing alt text, browser errors, sealed-content
 *   contract violations, broken navigation targets, authored-page overflow,
 *   and contrast findings with a provable ratio below the required minimum.
 * - `open` failures are design-fidelity observations that may travel with a
 *   near-miss preview as open findings: rendered-reference findings, dimension
 *   misses, composition-topology misses, and contrast findings the audit
 *   cannot prove either way.
 *
 * Unknown lines classify as `hard`: the classifier fails closed so no new
 * failure class can slip through as "open" without an explicit decision here.
 */

/** Candidate failure lines that precondition on an authored inner page. */
const AUTHORED_PAGE_PREFIX =
  /^(?:service-page|location-page|services-index-page)\s+/u;

/** Per-viewport failure prefixes produced by the bakeoff capture loop. */
const VIEWPORT_PREFIX = /^(?:desktop|compact|mobile):\s*/u;

/**
 * Classify one candidate failure line.
 * @param {unknown} line
 * @returns {"hard" | "open"}
 */
export function classifyFailureLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return "hard";
  // Judge reference findings are design fidelity: allowed as open findings.
  if (text.startsWith("rendered-reference:")) return "open";
  if (text.startsWith("rendered composition:")) return "open";
  // Sealed-content and source-contract violations are integrity failures.
  if (text.startsWith("source:") || text.startsWith("repaired source:"))
    return "hard";
  // Provable contrast failures are accessibility failures; unprovable ones are
  // resolved by the pixel pass before this classification matters.
  if (text.startsWith("contrast fail")) return "hard";
  if (text.startsWith("contrast unresolved")) return "open";
  const withoutPage = text.replace(AUTHORED_PAGE_PREFIX, "");
  const viewport = withoutPage.match(VIEWPORT_PREFIX);
  const inner = viewport ? withoutPage.slice(viewport[0].length) : withoutPage;
  if (inner.startsWith("rendered composition:")) return "open";
  if (/missing after hydration/iu.test(inner)) return "open";
  return "hard";
}

/**
 * Split a candidate failure list into hard and open failures.
 * @param {unknown[]} failures
 * @returns {{hard: string[], open: string[]}}
 */
export function splitFailureLines(failures) {
  const hard = [];
  const open = [];
  for (const failure of failures || []) {
    const text = String(failure);
    if (classifyFailureLine(text) === "hard") hard.push(text);
    else open.push(text);
  }
  return { hard, open };
}
