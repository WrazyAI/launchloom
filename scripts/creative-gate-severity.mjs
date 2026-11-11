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
  // A full-height desktop hero is a composition preference; the mobile CTA
  // visibility lines stay hard because they describe a real conversion defect.
  if (inner === "hero exceeds desktop viewport") return "open";
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

/** Severities and categories the current judge schemas can emit. */
const KNOWN_JUDGE_SEVERITIES = new Set(["critical", "major", "minor"]);
const KNOWN_JUDGE_CATEGORIES = new Set([
  ...HARD_JUDGE_CATEGORIES,
  "hero-geometry",
  "typography",
  "spatial-rhythm",
  "imagery",
  "service-presentation",
  "navigation",
  "cta-placement",
  "mobile-recomposition",
  "interaction-evidence",
  "palette-adherence",
  "client-art-direction",
  "generic-grammar",
  "industry-fit",
  "hierarchy",
  "conversion",
  "distinctiveness",
  "responsive-layout",
]);

/**
 * Classify one rendered-judge finding. Unknown severities and categories are
 * hard: a new judge output must make an explicit classification decision
 * before it can travel as an advisory finding.
 * @param {Record<string, any>} finding
 * @returns {"critical" | "hard" | "open"}
 */
export function classifyJudgeFinding(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const category = String(finding?.category || "").toLowerCase();
  if (
    !KNOWN_JUDGE_SEVERITIES.has(severity) ||
    !KNOWN_JUDGE_CATEGORIES.has(category)
  )
    return "hard";
  // Accessibility defects and fabricated/unverified facts stay hard. Design
  // and copy quality findings are advisory on a warned preview; the local
  // design repair pass owns them after delivery.
  if (severity === "critical") {
    if (category === "accessibility") return "critical";
    if (category === "content-integrity") {
      const evidence = String(
        finding?.evidence || finding?.message || finding?.recommendation || "",
      );
      const copyDefect =
        /clipped|cropped|malformed|stray|truncated|overlap|fragment/iu.test(
          evidence,
        );
      const factDefect =
        /fabricat|invent|unverified|not present|missing from|credential|price|review|guarantee|licen[cs]e|contact|phone|email|address/iu.test(
          evidence,
        );
      if (copyDefect && !factDefect) return "open";
      return "critical";
    }
    return "open";
  }
  if (severity === "major" && category === "accessibility") return "hard";
  if (severity === "major" && category === "content-integrity") {
    const evidence = String(
      finding?.evidence || finding?.message || finding?.recommendation || "",
    );
    if (/copied|templated|repeated|duplicat|filler/iu.test(evidence))
      return "open";
    return "hard";
  }
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

/** Scalar near-miss bars, calibrated 2026-10-17 from 353 judged samples
 * (docs/calibration/2026-10-17-final-creative-gates.json): bar 47 with floor
 * 30 is the maximum combination meeting a 5% run-rate floor on both the
 * calibration and holdout splits. The strict gate shares these bars and adds
 * the majors allowance. */
export const NEAR_MISS_PREVIEW_DEFAULTS = Object.freeze({
  overallBar: 47,
  dimensionFloor: 30,
});

/**
 * Assess one candidate for near-miss preview delivery: every hard deterministic
 * gate must be clean, no critical judge findings, the overall rendered score at
 * or above the scalar bar, and every rendered dimension at or above the
 * absolute floor. Design-fidelity findings travel as open findings.
 *
 * @param {Record<string, any>} candidate bakeoff candidate result
 * @param {{overallBar?: number, dimensionFloor?: number, allowContrastWarnings?: boolean}} [options]
 * @returns {{eligible: boolean, reasons: string[], openFindings: string[], hardFailures: string[], criticalFindings: string[], overall: number | null, scores: Record<string, number> | null}}
 */
export function nearMissAssessment(
  candidate,
  {
    overallBar = NEAR_MISS_PREVIEW_DEFAULTS.overallBar,
    dimensionFloor = NEAR_MISS_PREVIEW_DEFAULTS.dimensionFloor,
    allowContrastWarnings = false,
  } = {},
) {
  const audit = candidate?.renderedReferenceFidelity?.audit || null;
  const split = splitFailureLines(candidate?.failures || []);
  const hard = [...split.hard];
  const open = [...split.open];
  if (allowContrastWarnings) {
    for (let index = hard.length - 1; index >= 0; index -= 1) {
      if (/^contrast fail/u.test(hard[index])) {
        open.unshift(...hard.splice(index, 1));
      }
    }
  }
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

function describeBlocker(blocker) {
  if (!blocker || typeof blocker !== "object") return "unclassified blocker";
  const severity = String(blocker.severity || "major");
  const category = String(blocker.category || "unclassified");
  const detail = String(
    blocker.evidence || blocker.message || blocker.recommendation || "",
  )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
  return `${severity} ${category}: ${detail}`;
}

/**
 * Decide whether a final visual gate report can deliver a preview.
 *
 * Clean means the strict gate passed with no findings. Warned means only
 * open design findings remain and every hard integrity finding is absent.
 * Reject covers missing evidence, gate errors, unknown verdicts, critical
 * findings, content/accessibility majors, and unclassified blockers.
 *
 * @param {Record<string, any> | null | undefined} report
 * @returns {{decision: "clean" | "warned" | "reject", hard: string[], warnings: string[], reasons: string[]}}
 */
export function classifyVisualGateReport(report) {
  if (!report || typeof report !== "object")
    return {
      decision: "reject",
      hard: ["missing report"],
      warnings: [],
      reasons: ["missing report"],
    };
  if (report.status === "error")
    return {
      decision: "reject",
      hard: ["gate error"],
      warnings: [],
      reasons: ["gate error"],
    };
  if (!report.audit || typeof report.audit !== "object")
    return {
      decision: "reject",
      hard: ["missing audit"],
      warnings: [],
      reasons: ["missing audit"],
    };
  const verdict = report.audit.verdict;
  if (!["pass", "revise", "block"].includes(verdict))
    return {
      decision: "reject",
      hard: ["unknown verdict"],
      warnings: [],
      reasons: ["unknown verdict"],
    };
  if (!Array.isArray(report.audit.findings))
    return {
      decision: "reject",
      hard: ["missing findings"],
      warnings: [],
      reasons: ["missing findings"],
    };
  if (report.status === "quality-blocked" && !Array.isArray(report.blockers))
    return {
      decision: "reject",
      hard: ["missing blockers"],
      warnings: [],
      reasons: ["missing blockers"],
    };
  const findings = report.audit.findings;
  const hard = [];
  const warnings = [];
  for (const finding of findings) {
    if (!finding || typeof finding !== "object") {
      hard.push("unclassified finding");
      continue;
    }
    const classification = classifyJudgeFinding(finding);
    if (classification === "critical" || classification === "hard")
      hard.push(describeJudgment(finding));
    else warnings.push(describeJudgment(finding));
  }
  for (const blocker of Array.isArray(report.blockers) ? report.blockers : []) {
    if (
      !blocker ||
      typeof blocker !== "object" ||
      !blocker.severity ||
      !blocker.category
    ) {
      hard.push(describeBlocker(blocker));
      continue;
    }
    const classification = classifyJudgeFinding(blocker);
    if (classification === "critical" || classification === "hard")
      hard.push(describeBlocker(blocker));
    else warnings.push(describeBlocker(blocker));
  }
  if (hard.length)
    return { decision: "reject", hard, warnings, reasons: hard };
  if (verdict === "pass" && warnings.length === 0)
    return { decision: "clean", hard: [], warnings: [], reasons: [] };
  if (verdict === "pass" || verdict === "revise")
    return { decision: "warned", hard: [], warnings, reasons: [] };
  return {
    decision: "reject",
    hard: ["blocked verdict"],
    warnings,
    reasons: ["blocked verdict"],
  };
}
