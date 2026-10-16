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

/**
 * Judge finding categories whose majors block even near-miss previews: they
 * describe content integrity or accessibility defects rather than design
 * fidelity, so an open-findings preview must never carry them.
 */
export const HARD_JUDGE_CATEGORIES = Object.freeze([
  "content-integrity",
  "accessibility",
]);

/**
 * Classify one rendered-judge finding.
 * @param {Record<string, any>} finding
 * @returns {"critical" | "hard" | "open"}
 */
export function classifyJudgeFinding(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const category = String(finding?.category || "").toLowerCase();
  if (severity === "critical") return "critical";
  if (severity === "major" && HARD_JUDGE_CATEGORIES.includes(category))
    return "hard";
  return "open";
}

function describeJudgment(finding) {
  const severity = String(finding?.severity || "major");
  const category = String(finding?.category || "reference");
  const detail = String(
    finding?.evidence || finding?.message || finding?.repair || "",
  )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
  return `${severity} ${category}: ${detail}`;
}

/** Injected scalar near-miss bars (Task 4 recalibrates these from a measured
 * distribution after the contrast fixes land; see docs/calibration). */
export const NEAR_MISS_PREVIEW_DEFAULTS = Object.freeze({
  overallBar: 50,
  dimensionFloor: 40,
});

/**
 * Assess one candidate for near-miss preview delivery: every hard deterministic
 * gate must be clean, no critical judge findings, the overall rendered score at
 * or above the scalar bar, and every rendered dimension at or above the
 * absolute floor. Design-fidelity findings travel as open findings.
 *
 * @param {Record<string, any>} candidate bakeoff candidate result
 * @param {{overallBar?: number, dimensionFloor?: number}} [options]
 * @returns {{eligible: boolean, reasons: string[], openFindings: string[], hardFailures: string[], criticalFindings: string[], overall: number | null, scores: Record<string, number> | null}}
 */
export function nearMissAssessment(
  candidate,
  {
    overallBar = NEAR_MISS_PREVIEW_DEFAULTS.overallBar,
    dimensionFloor = NEAR_MISS_PREVIEW_DEFAULTS.dimensionFloor,
  } = {},
) {
  const audit = candidate?.renderedReferenceFidelity?.audit || null;
  const { hard, open } = splitFailureLines(candidate?.failures || []);
  const judgments = (audit?.findings || []).map((finding) => ({
    classification: classifyJudgeFinding(finding),
    description: describeJudgment(finding),
  }));
  const criticalFindings = judgments
    .filter((judgment) => judgment.classification === "critical")
    .map((judgment) => judgment.description);
  const hardJudgments = judgments
    .filter((judgment) => judgment.classification === "hard")
    .map((judgment) => judgment.description);
  const openFindings = [
    ...open,
    ...judgments
      .filter((judgment) => judgment.classification === "open")
      .map((judgment) => judgment.description),
  ];
  const overall = Number(audit?.overallScore);
  const scores = {};
  for (const [key, value] of Object.entries(audit?.scores || {})) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) scores[key] = numeric;
  }
  const belowFloor = Object.entries(scores)
    .filter(([, value]) => value < Number(dimensionFloor))
    .map(([key, value]) => `${key} ${value}`);
  const reasons = [];
  if (hard.length) reasons.push(`hard failures: ${hard.length}`);
  if (criticalFindings.length)
    reasons.push(`critical findings: ${criticalFindings.length}`);
  if (hardJudgments.length)
    reasons.push(`content/accessibility majors: ${hardJudgments.length}`);
  if (!Number.isFinite(overall) || overall < Number(overallBar))
    reasons.push(
      `overall ${Number.isFinite(overall) ? overall : "missing"} below ${overallBar}`,
    );
  if (belowFloor.length)
    reasons.push(
      `dimensions below floor ${dimensionFloor}: ${belowFloor.join(", ")}`,
    );
  return {
    eligible: reasons.length === 0,
    reasons,
    openFindings,
    hardFailures: hard,
    criticalFindings,
    overall: Number.isFinite(overall) ? overall : null,
    scores,
  };
}
