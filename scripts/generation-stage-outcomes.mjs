// Stable stage IDs, mapped to exact, source-controlled Actions names. Never
// copy an arbitrary job/step name, output, annotation, or log into the ledger.
const stages = [
  ["profile_policy", "profile_policy", "Resolve generation execution policy"],
  ["renderer_policy", "renderer_policy", "Resolve generation renderer"],
  [
    "intake_handoff_check",
    "intake_handoff_check",
    "Check successful handoff marker",
  ],
  ["setup", "generate", "Verify required secrets"],
  ["intake", "generate", "Read and generate from intake"],
  ["seo_telemetry", "generate", "Record SEO research result"],
  ["inspiration_selection", "generate", "Reserve inspiration routes"],
  [
    "reference_analysis",
    "generate",
    "Analyze reserved inspiration and freeze creative session",
  ],
  [
    "client_repo",
    "generate",
    "Create private repository and Cloudflare Pages project",
  ],
  ["review_branch", "generate", "Build private review branch"],
  ["imagery", "generate", "Generate or reuse contextual imagery"],
  ["pack_select", "generate", "Select experience pack"],
  ["foundation_select", "generate", "Select source foundation"],
  ["authoring", "generate", "Author independent experience candidates"],
  ["authored_evidence", "generate", "Commit authored experience evidence"],
  [
    "creative_render",
    "generate",
    "Render and repair creative candidates in the production shell",
  ],
  [
    "diagnostic_preview",
    "generate",
    "Build and deploy noindex diagnostic preview",
  ],
  ["preview_deploy", "generate", "Build and direct-upload public preview"],
  ["preview_verification", "generate", "Wait for secure preview URL"],
  ["review_link", "generate", "Create secure review link"],
  ["handoff", "generate", "Mark intake handoff complete"],
];

const conclusions = new Map([
  ["success", "completed"],
  ["failure", "failed"],
  ["timed_out", "failed"],
  ["cancelled", "cancelled"],
  ["skipped", "skipped"],
]);

export const generationStageOrder = stages.map(([stage]) => stage);

/**
 * Step conclusions belong to one verified run attempt. Never infer a result
 * from missing steps, a similarly named job, or the whole run's conclusion.
 * The diagnostic excerpt is constructed entirely from fixed, reviewed labels.
 */
export function generationStageOutcomes(jobs, observedAt) {
  const events = [];
  for (const [stage, jobName, stepName] of stages) {
    const matchingJobs = jobs.filter((job) => job.name === jobName);
    if (matchingJobs.length !== 1) continue;
    const job = matchingJobs[0];
    const matches = Array.isArray(job.steps)
      ? job.steps.filter((step) => step?.name === stepName)
      : [];
    if (matches.length !== 1 || matches[0].status !== "completed") continue;
    const step = matches[0];
    const status = conclusions.get(step.conclusion);
    if (!status) continue;
    const completedAt = Date.parse(step.completed_at);
    const timestamp =
      Number.isSafeInteger(completedAt) &&
      completedAt >= 0 &&
      completedAt <= observedAt
        ? completedAt
        : observedAt;
    events.push({
      eventKey: `github-step:${stage}`,
      stage,
      status,
      observedAt,
      createdAt: timestamp,
      ...(status === "failed"
        ? {
            detail: {
              errorCode: `LL_STAGE_${stage.toUpperCase()}_${step.conclusion === "timed_out" ? "TIMED_OUT" : "FAILED"}`,
              diagnosticExcerpt: `${stepName}: ${step.conclusion}.`,
            },
          }
        : {}),
    });
  }
  return events;
}
