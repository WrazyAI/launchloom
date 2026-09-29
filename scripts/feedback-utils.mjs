const STRUCTURE_MARKER =
  /<!--\s*launchloom-feedback-structure:([A-Za-z0-9_-]+)\s*-->/i;

const ATTACHMENT_LABELS = {
  logo: "logo",
  hero: "hero image",
  secondary: "about or story image",
  tertiary: "gallery image",
  team: "team photo",
};

const COLOR_LABELS = {
  primary: "brand or accent color",
  surface: "page background",
  hero: "hero surface color",
  ink: "body text color",
  muted: "muted text color",
  line: "divider and line color",
};

export function feedbackTextFromComment(body) {
  const withoutMetadata = String(body || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n+_Requested changes:_[\s\S]*?(?=\n+_?Page:\s*https?:\/\/|$)/i, "")
    .replace(/\n+_?Page:\s*https?:\/\/\S+\s*$/i, "")
    .trim();
  const match = withoutMetadata.match(
    /^\*\*(Developer|Client) feedback(?:\s+·\s+([^*]+))?\*\*\s*/i,
  );
  const note = (
    match ? withoutMetadata.slice(match[0].length) : withoutMetadata
  ).trim();
  const category = match?.[2]?.trim();
  return (category ? `[${category}] ${note}` : note).trim();
}

function safeStructure(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { attachments: [], colors: [] };
  const attachments = (Array.isArray(value.attachments)
    ? value.attachments
    : []
  )
    .slice(0, 4)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const target = String(entry.target || "").trim();
      const url = String(entry.url || "").trim();
      if (!target || !/^https:\/\//u.test(url)) return [];
      const kind = entry.kind === "generated" ? "generated" : "upload";
      const prompt =
        kind === "generated" ? String(entry.prompt || "").trim().slice(0, 500) : "";
      const model =
        kind === "generated" ? String(entry.model || "").trim().slice(0, 80) : "";
      return [
        {
          target,
          kind,
          url,
          ...(prompt ? { prompt } : {}),
          ...(model ? { model } : {}),
        },
      ];
    });
  const colors = (Array.isArray(value.colors) ? value.colors : [])
    .slice(0, 6)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const role = String(entry.role || "").trim();
      const hex = String(entry.hex || "").trim().toLowerCase();
      if (!role || !/^#[0-9a-f]{6}$/u.test(hex)) return [];
      return [{ role, hex }];
    });
  return { attachments, colors };
}

export function feedbackStructureFromComment(body) {
  const match = STRUCTURE_MARKER.exec(String(body || ""));
  if (!match) return { attachments: [], colors: [] };
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    return safeStructure(JSON.parse(decoded));
  } catch {
    return { attachments: [], colors: [] };
  }
}

export function feedbackRequestFromComment(body) {
  const feedback = feedbackTextFromComment(body);
  return {
    text: feedback,
    structure: feedbackStructureFromComment(body),
  };
}

export function feedbackRequestSummary(request) {
  const lines = [];
  if (request?.text) lines.push(request.text);
  for (const attachment of request?.structure?.attachments || []) {
    const label = ATTACHMENT_LABELS[attachment.target] || "image";
    if (attachment.kind === "generated")
      lines.push(
        `Replace the ${label} with a generated image: "${attachment.prompt}".`,
      );
    else lines.push(`Replace the ${label} with the uploaded image.`);
  }
  const colors = (request?.structure?.colors || []).map(
    (color) => `${COLOR_LABELS[color.role] || color.role} ${color.hex}`,
  );
  if (colors.length) lines.push(`Set ${colors.join(", ")}.`);
  return lines.join("\n");
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
    .map((comment) => feedbackRequestFromComment(comment.body))
    .filter(
      (request) =>
        request.text ||
        request.structure.attachments.length ||
        request.structure.colors.length,
    );
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
