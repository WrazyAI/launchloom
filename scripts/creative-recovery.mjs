const requiredViewports = [
  ["desktop", 1536, 864],
  ["compact", 1366, 768],
  ["mobile", 390, 844],
];

/** Select the best complete rendered candidate without changing gate results. */
export function chooseRecoveryCandidate(candidates) {
  if (!Array.isArray(candidates)) return null;
  return [...candidates]
    .filter(
      (candidate) =>
        candidate &&
        typeof candidate.candidateId === "string" &&
        typeof candidate.directory === "string",
    )
    .sort(
      (left, right) =>
        (Number(right.score) || 0) - (Number(left.score) || 0) ||
        left.candidateId.localeCompare(right.candidateId),
    )[0] || null;
}

/**
 * A failed visual/reference score may be shown as a diagnostic, but hard
 * render, accessibility, required-content, and desktop-fit defects may not.
 */
export function candidateDiagnosticSafety(candidate) {
  const reasons = [];
  const viewports = Array.isArray(candidate?.viewports)
    ? candidate.viewports
    : [];
  for (const [name, width, height] of requiredViewports) {
    const evidence = viewports.find((viewport) => viewport.name === name);
    if (!evidence) {
      reasons.push(`missing-${name}-render`);
      continue;
    }
    if (evidence.width !== width || evidence.viewportHeight !== height)
      reasons.push(`invalid-${name}-viewport`);
    if (evidence.browserErrors?.length) reasons.push(`${name}-browser-error`);
    if (evidence.h1Count !== 1) reasons.push(`${name}-heading-structure`);
    if (!evidence.hasHero || !evidence.hasEarlyConversion)
      reasons.push(`${name}-opening-content`);
    if (!evidence.hasServices || !evidence.hasFaqs || !evidence.hasContact)
      reasons.push(`${name}-required-section`);
    if (evidence.missingFragments || evidence.missingNavTargets)
      reasons.push(`${name}-navigation-target`);
    if (!evidence.hasLeadForm) reasons.push(`${name}-lead-runtime`);
    if (evidence.missingAlt) reasons.push(`${name}-image-accessibility`);
    if (evidence.unnamedControls) reasons.push(`${name}-unnamed-control`);
    if (evidence.overflow) reasons.push(`${name}-horizontal-overflow`);
    if (evidence.brokenImages) reasons.push(`${name}-broken-image`);
    if (evidence.emDashes) reasons.push(`${name}-copy-integrity`);
    if (evidence.creativeRenderer !== "creative-candidate")
      reasons.push(`${name}-renderer-integrity`);
    if (
      name !== "mobile" &&
      Number(evidence.heroBottom) > Number(evidence.viewportHeight) + 1
    )
      reasons.push(`${name}-hero-overflow`);
  }
  return { safe: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function summarizeCreativeRepairFindings(candidate, visualGate = null) {
  const findings = [];
  const add = (finding) => {
    const category = String(finding?.category || "visual-quality")
      .replace(/[<>\u0000-\u001f]/gu, " ")
      .trim()
      .slice(0, 80);
    const evidence = String(finding?.evidence || finding?.message || "")
      .replace(/[<>\u0000-\u001f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 600);
    if (!category || !evidence) return;
    const severity = ["critical", "major", "minor", "info"].includes(
      finding.severity,
    )
      ? finding.severity
      : "major";
    const recommendation = String(finding.recommendation || "")
      .replace(/[<>\u0000-\u001f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 600);
    const key = `${category.toLowerCase()}\n${evidence.toLowerCase()}`;
    if (findings.some((item) => item.key === key)) return;
    findings.push({
      key,
      category,
      severity,
      evidence,
      ...(recommendation ? { recommendation } : {}),
    });
  };

  for (const finding of candidate?.renderedReferenceFidelity?.audit?.findings || [])
    add(finding);
  for (const finding of candidate?.referenceFidelity?.renderedVisualFindings || [])
    add({ category: "reference-fidelity", message: finding.message || finding.code });
  for (const finding of visualGate?.audit?.findings || []) add(finding);

  const score = Number(candidate?.renderedReferenceFidelity?.score);
  if (
    Number.isFinite(score) &&
    candidate?.renderedReferenceFidelity?.pass === false
  )
    add({
      category: "reference-fidelity",
      severity: "major",
      evidence: `Rendered reference fidelity scored ${Math.round(score)} and did not meet the required threshold.`,
      recommendation: "Preserve the assigned reference composition and revise the rendered geometry, hierarchy, and section rhythm.",
    });
  for (const failure of candidate?.failures || []) {
    const text = String(failure).toLowerCase();
    if (text.includes("reference") || text.includes("signature"))
      add({
        category: "reference-fidelity",
        evidence: "The rendered design did not satisfy all assigned reference-contract checks.",
      });
    else if (text.includes("visual") || text.includes("generic"))
      add({
        category: "visual-quality",
        evidence: "The candidate did not clear the visual-quality threshold.",
      });
  }
  if (!findings.length)
    add({
      category: "visual-quality",
      severity: "major",
      evidence: "The candidate was rendered, but it did not pass the full preview-quality gate.",
    });
  return findings.slice(0, 20).map(({ key: _key, ...finding }) => finding);
}
