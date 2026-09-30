export const SYNTHETIC_DEMO_NOTICE = "Fictional pipeline demo";

function boundedText(value, limit) {
  return String(value ?? "")
    .replace(/\u0000/gu, "")
    .replace(/—/gu, "-")
    .trim()
    .slice(0, limit)
    .toLowerCase();
}

/** Return the fixed notice only for an explicitly declared synthetic intake. */
export function fictionalPipelineDemoNotice(intake = {}) {
  if (
    intake.type === "CanonicalSiteBrief" &&
    intake.version === 1 &&
    intake.demoNotice === SYNTHETIC_DEMO_NOTICE
  )
    return SYNTHETIC_DEMO_NOTICE;

  const submissionId = boundedText(intake.submissionId, 120);
  const accuracy = boundedText(intake.confirmAccuracy, 240);
  const notes = boundedText(intake.additionalNotes, 1800);
  const declaredSyntheticDemo =
    /^demo[-_]/u.test(submissionId) &&
    /\bsynthetic demo brief\b/u.test(accuracy) &&
    /\bfictional demo only\b/u.test(notes);

  return declaredSyntheticDemo ? SYNTHETIC_DEMO_NOTICE : undefined;
}
