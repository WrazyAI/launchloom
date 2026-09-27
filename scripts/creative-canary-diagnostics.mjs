/**
 * Explain why a selected design reference did not produce an authored candidate.
 * The authoring report is diagnostic evidence; this helper does not alter gates.
 *
 * @param {{ id: string; label?: string; referenceFamilyId?: string }} route
 * @param {{ failures?: Array<{ routeId?: string; candidateId?: string; error?: string }> } | null} creativeRun
 * @returns {string}
 */
export function missingCanaryCandidateDiagnostic(route, creativeRun) {
  const failures = Array.isArray(creativeRun?.failures)
    ? creativeRun.failures
    : [];
  const failure = failures.find((item) => item?.routeId === route.id);
  const label = route.label || route.referenceFamilyId || route.id;
  const referenceFamily = route.referenceFamilyId
    ? ` (${route.referenceFamilyId})`
    : "";
  const cause = failure
    ? `${failure.candidateId ? `${failure.candidateId}: ` : ""}${failure.error || "authoring failed without an error message"}`
    : "No route-specific authoring failure was recorded.";

  return `Luna did not produce the selected architecture-reference candidate for ${label}${referenceFamily}. ${cause}`;
}
