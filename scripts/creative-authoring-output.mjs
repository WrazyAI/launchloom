export const AUTHORING_STAGE_BUDGETS = Object.freeze({
  contract: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
  experience: Object.freeze({ maxTokens: 48_000, timeoutMs: 8 * 60_000 }),
  styles: Object.freeze({ maxTokens: 40_000, timeoutMs: 8 * 60_000 }),
  motion: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
});

export const CREATIVE_REPAIR_MAX_COMPLETION_TOKENS = 48_000;

export function completionLimitRequestField(tokens) {
  if (!Number.isSafeInteger(tokens) || tokens < 1)
    throw new Error("OpenRouter completion-token limit must be a positive integer.");
  return { max_completion_tokens: tokens };
}

export function referenceImplementationChecklist(referenceDna) {
  if (referenceDna == null) return "";

  const sections = Array.isArray(referenceDna?.sectionSequence)
    ? referenceDna.sectionSequence
    : [];
  const sectionIds = sections.map((section) => {
    const id = String(section || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    return id;
  });
  if (
    sectionIds.length < 3 ||
    sectionIds.some((id) => !id) ||
    new Set(sectionIds).size !== sectionIds.length
  )
    throw new Error(
      "Reference DNA sectionSequence must contain at least three unique, non-empty marker IDs.",
    );
  return [
    'REQUIRED LITERAL SECTION IDS: put id="services", id="faqs", and id="contact" on the actual matching content sections. These must be literal JSX string attributes, not variables, expressions, aliases, or empty anchor elements.',
    'REFERENCE SECTION ORDER: put each data-reference-section value on its corresponding visible <section> element, in this exact DOM order:',
    ...sectionIds.map(
      (id, index) => `${index + 1}. data-reference-section="${id}"`,
    ),
    'Before returning Experience.jsx, check that all three required IDs exist literally and that every reference section marker appears once, on the semantically matching section, in this order.',
  ].join("\n");
}

function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function authoringCompletionDiagnostics({
  stage,
  routeId,
  maxTokens,
  payload,
  content,
}) {
  const usage = payload?.usage || {};
  const completionDetails = usage.completion_tokens_details || {};
  return {
    stage,
    routeId,
    finishReason: payload?.choices?.[0]?.finish_reason || "unknown",
    maxTokens,
    completionTokens: finiteNumberOrNull(usage.completion_tokens),
    reasoningTokens: finiteNumberOrNull(
      completionDetails.reasoning_tokens ?? usage.reasoning_tokens,
    ),
    contentChars:
      typeof content === "string"
        ? content.length
        : Array.isArray(content)
          ? content.reduce(
              (total, part) =>
                total + (typeof part?.text === "string" ? part.text.length : 0),
              0,
            )
          : 0,
  };
}

export function formatAuthoringCompletionDiagnostics(diagnostics) {
  return [
    `finish_reason=${diagnostics.finishReason}`,
    `max_completion_tokens=${diagnostics.maxTokens}`,
    `completion_tokens=${diagnostics.completionTokens ?? "not-reported"}`,
    `reasoning_tokens=${diagnostics.reasoningTokens ?? "not-reported"}`,
    `content_chars=${diagnostics.contentChars}`,
  ].join(" ");
}
