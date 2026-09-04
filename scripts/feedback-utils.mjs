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
