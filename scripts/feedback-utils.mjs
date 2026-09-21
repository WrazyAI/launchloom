export function feedbackTextFromComment(body) {
  const withoutMetadata = String(body || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n+_?Page:\s*https?:\/\/\S+\s*$/i, "")
    .trim();
  const match = withoutMetadata.match(
    /^\*\*(Developer|Client) feedback(?:\s+·\s+([^*]+))?\*\*\s*/i,
  );
  const note = (
    match ? withoutMetadata.slice(match[0].length) : withoutMetadata
  ).trim();
  const category = match?.[2]?.trim();
  return category ? `[${category}] ${note}` : note;
}

export function pendingFeedbackFromComments(comments, stage, exact = false) {
  const safeStage = stage === "client" ? "client" : "developer";
  const records = Array.isArray(comments) ? comments : [];
  const latestRevision = exact
    ? null
    : records
        .filter((comment) =>
          comment.body?.includes(`<!-- launchloom-revision:${safeStage} -->`),
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
        ?.created_at;
  return records
    .filter(
      (comment) =>
        comment.body?.includes(`<!-- launchloom-feedback:${safeStage} -->`) &&
        (exact ||
          !latestRevision ||
          new Date(comment.created_at) > new Date(latestRevision)),
    )
    .map((comment) => feedbackTextFromComment(comment.body))
    .filter(Boolean);
}

export function nextClientFeedbackContext(
  previousReport,
  stage,
  feedback,
  revisionPr,
) {
  const currentPr = String(revisionPr || "").trim();
  const previousPr = String(previousReport?.revisionPr || "").trim();
  const sameRevision =
    Boolean(currentPr) && Boolean(previousPr) && currentPr === previousPr;
  const prior = sameRevision
    ? Array.isArray(previousReport?.clientFeedbackContext)
      ? previousReport.clientFeedbackContext
      : previousReport?.stage === "client" &&
          Array.isArray(previousReport?.feedback)
        ? previousReport.feedback
        : []
    : [];
  const incoming = Array.isArray(feedback) ? feedback : [];
  const combined = stage === "client" ? [...prior, ...incoming] : prior;
  return [...new Set(combined.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function revisionIntakeFromConfig(config, feedback) {
  return {
    businessName: config.business?.name || "Your business",
    phone: config.business?.phone || "",
    email: config.business?.email || "",
    address: config.business?.address || "",
    serviceAreas: (config.business?.serviceAreas || []).join("\n"),
    hours: config.business?.hours || "",
    primaryCta: config.business?.primaryCta || "",
    offer: config.business?.offer || "",
    domain: config.business?.domain || "",
    leadEmail: config.business?.leadEmail || config.business?.email || "",
    placeId: config.business?.placeId || "",
    googleMapsUrl: config.business?.googleMapsUrl || "",
    preset: config.preset,
    industry: config.industry,
    services: (config.services || []).map((service) => service.name).join("\n"),
    differentiators: (config.differentiators || []).join("\n"),
    primaryColor: config.style?.primaryColor || "",
    tone: config.style?.tone || "",
    brandNotes: config.style?.brandNotes || "",
    assets: config.assets || {},
    feedback,
  };
}
