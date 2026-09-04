const COPY_FIELDS = new Set([
  "heroKicker",
  "servicesHeading",
  "aboutKicker",
  "aboutHeading",
  "contactKicker",
  "contactHeading",
  "processKicker",
  "processHeading",
  "faqKicker",
  "faqHeading",
  "formIntro",
]);

const socialProofRequest =
  /\b(testimonials?|testimony|testimonies|review section|google reviews?|customer reviews?|client reviews?)\b/i;
const brandNameRequest =
  /\b(company|business|brand) name\b.{0,80}\b(nav|header|logo|navbar)\b|\b(nav|header|logo|navbar)\b.{0,80}\b(company|business|brand) name\b/i;

function clean(value, limit = 360) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function proofFallback(config) {
  const points = (config.differentiators || [])
    .map((value) => clean(value, 140))
    .filter(Boolean)
    .slice(0, 4);
  return {
    source: "verified_differentiators",
    heading: `Why families choose ${config.business.name}`,
    intro:
      "A clear, personal path forward starts with the details that matter most.",
    points: points.length
      ? points
      : ["A conversation focused on your needs and the next right step."],
  };
}

export function socialProofOperation(config) {
  if (clean(config.business?.placeId, 200)) {
    return {
      kind: "set_social_proof",
      source: "google_reviews",
      heading: `Reviews from families we serve`,
      fallback: proofFallback(config),
    };
  }
  return { kind: "set_social_proof", ...proofFallback(config) };
}

export function deterministicOperations(feedback, config) {
  const operations = [];
  if (socialProofRequest.test(feedback))
    operations.push(socialProofOperation(config));
  if (brandNameRequest.test(feedback))
    operations.push({ kind: "show_brand_name" });
  return operations;
}

export async function modelOperations(
  feedback,
  config,
  model = "z-ai/glm-5.3-flash",
) {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "LaunchLoom revision operations",
      },
      body: JSON.stringify({
      model,
        reasoning_effort: "low",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return JSON only: {operations:[...]}. You are planning a strictly minimal website revision. Allowed operations are only {kind:'set_copy',field,value} using these copy fields: heroKicker, servicesHeading, aboutKicker, aboutHeading, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. Do not add sections, invent testimonials, alter business facts, services, assets, colors, layout, claims, or unrelated copy. If feedback cannot be fulfilled by this allowlist, return an empty operations array.",
          },
          {
            role: "user",
            content: `Feedback:\n${feedback}\n\nCurrent approved copy:\n${JSON.stringify(config.copy || {})}`,
          },
        ],
      }),
    },
  );
  if (!response.ok) return [];
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.operations) ? parsed.operations.slice(0, 3) : [];
}

export function applyOperation(config, operation) {
  if (!operation || typeof operation !== "object") return false;
  if (operation.kind === "set_social_proof") {
    config.socialProof = {
      source:
        operation.source === "google_reviews"
          ? "google_reviews"
          : "verified_differentiators",
      heading: clean(operation.heading, 140),
      intro: clean(operation.intro, 240),
      points: Array.isArray(operation.points)
        ? operation.points
            .map((point) => clean(point, 140))
            .filter(Boolean)
            .slice(0, 4)
        : [],
      fallback: operation.fallback || undefined,
    };
    return true;
  }
  if (operation.kind === "show_brand_name") {
    config.style = { ...(config.style || {}), showBrandName: true };
    return true;
  }
  if (operation.kind === "set_copy" && COPY_FIELDS.has(operation.field)) {
    const value = clean(
      operation.value,
      operation.field === "formIntro" ? 260 : 180,
    );
    if (!value) return false;
    config.copy = { ...(config.copy || {}), [operation.field]: value };
    return true;
  }
  return false;
}

export function expectedArtifacts(operations) {
  return operations.flatMap((operation) => {
    if (operation.kind === "set_social_proof")
      return [{ type: "html", marker: 'id="social-proof"' }];
    if (operation.kind === "show_brand_name")
      return [{ type: "html", marker: 'class="wordmark__name"' }];
    if (operation.kind === "set_copy")
      return [{ type: "config", field: `copy.${operation.field}` }];
    return [];
  });
}

export function verifyRevision(config, report, html = "") {
  const failures = [];
  for (const artifact of report.expectedArtifacts || []) {
    if (artifact.type === "html" && !html.includes(artifact.marker))
      failures.push(`Missing rendered artifact: ${artifact.marker}`);
    if (artifact.type === "config") {
      const [group, field] = artifact.field.split(".");
      if (!clean(config[group]?.[field]))
        failures.push(`Missing config value: ${artifact.field}`);
    }
  }
  if (report.requestedSocialProof && !config.socialProof)
    failures.push("Requested social proof was not configured.");
  if (
    config.socialProof?.source === "google_reviews" &&
    !clean(config.business?.placeId)
  )
    failures.push("Google reviews were selected without a Place ID.");
  return { ok: failures.length === 0, failures };
}

export { COPY_FIELDS };
