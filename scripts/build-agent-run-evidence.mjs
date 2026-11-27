const MAX_CANDIDATES = 12;
const MAX_GATES = 20;
const MAX_ROUTES = 20;
const MAX_FAILURES = 8;
const MAX_TEXT = 240;

function text(value, limit = MAX_TEXT) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function stageGates(stages) {
  if (!stages || typeof stages !== "object" || Array.isArray(stages)) return [];
  return Object.entries(stages)
    .slice(0, MAX_GATES)
    .map(([name, value]) => {
      const stage =
        value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      return {
        name: text(name, 80) || "stage",
        status: text(stage.status, 40) || "unknown",
        summary: text(stage.error || stage.detail || stage.summary),
      };
    });
}

function candidates(report) {
  const declared =
    report && Array.isArray(report.candidates) ? report.candidates : [];
  if (declared.length) {
    return declared.slice(0, MAX_CANDIDATES).map((candidate, index) => ({
      id: text(candidate?.id || candidate?.candidateId, 80) || `candidate-${index + 1}`,
      score: Number.isFinite(Number(candidate?.score ?? candidate?.visualScore))
        ? Number(candidate.score ?? candidate.visualScore)
        : null,
      selected:
        candidate?.selected === true ||
        candidate?.id === report.selectedCandidateId ||
        candidate?.candidateId === report.selectedCandidateId,
    }));
  }
  const total = Math.min(MAX_CANDIDATES, count(report?.candidateCount));
  return Array.from({ length: total }, (_, index) => {
    const id = `candidate-${String.fromCharCode(97 + index)}`;
    return { id, score: null, selected: id === report?.selectedCandidateId };
  });
}

function routeChecks(routeReport) {
  const rows = Array.isArray(routeReport)
    ? routeReport
    : Array.isArray(routeReport?.routes)
      ? routeReport.routes
      : Array.isArray(routeReport?.checks)
        ? routeReport.checks
        : [];
  return rows.slice(0, MAX_ROUTES).map((row) => ({
    route: text(row?.route || row?.path, 160) || "/",
    viewport: text(row?.viewport || row?.width, 40) || "unknown",
    status: text(row?.status || (row?.passed === true ? "passed" : "failed"), 40) || "unknown",
    issues: Array.isArray(row?.issues)
      ? row.issues.slice(0, 8).map((issue) => text(issue, 160)).filter(Boolean)
      : [],
  }));
}

function assetSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const failure = value.providerFailure;
  return {
    requested: count(value.requested ?? value.requestCount),
    placed: count(value.placed ?? value.placementCount),
    skipped: count(value.skipped ?? value.skippedCount),
    providerFailure: text(
      typeof failure === "string"
        ? failure
        : failure?.message || failure?.status || null,
    ),
  };
}

export function buildAgentRunEvidence({
  report = {},
  creativeSummary = null,
  assets = null,
  routeReport = null,
  preview = null,
  attemptId = preview?.attemptId || "",
  repository = preview?.repository || "",
  recordedAt = Date.now(),
} = {}) {
  const safeReport =
    report && typeof report === "object" && !Array.isArray(report) ? report : {};
  const gates = stageGates(safeReport.stages);
  const failures = gates
    .filter((gate) => gate.status === "failed")
    .slice(0, MAX_FAILURES)
    .map((gate) => ({
      stage: gate.name,
      code: null,
      summary: gate.summary,
    }));
  const verdict =
    safeReport.verdict === "passed" && !failures.length ? "passed" : "failed";
  return {
    attemptId,
    repository,
    siteId: text(safeReport.siteId || null, 80),
    issueNumber: Number.isSafeInteger(Number(safeReport.issue))
      ? Number(safeReport.issue)
      : null,
    profile: text(safeReport.profile, 60) || "unknown",
    renderer: text(safeReport.renderer || creativeSummary?.renderer || null, 60),
    verdict,
    selectedCandidateId: text(
      safeReport.selectedCandidateId || creativeSummary?.selectedCandidateId || null,
      80,
    ),
    candidates: candidates(safeReport),
    gates,
    failures,
    routeChecks: routeChecks(routeReport),
    assets: assetSummary(assets),
    preview,
    recordedAt,
  };
}
