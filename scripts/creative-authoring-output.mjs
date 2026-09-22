export const AUTHORING_STAGE_BUDGETS = Object.freeze({
  contract: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
  experience: Object.freeze({ maxTokens: 48_000, timeoutMs: 8 * 60_000 }),
  styles: Object.freeze({ maxTokens: 40_000, timeoutMs: 8 * 60_000 }),
  motion: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
});

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
    `max_tokens=${diagnostics.maxTokens}`,
    `completion_tokens=${diagnostics.completionTokens ?? "not-reported"}`,
    `reasoning_tokens=${diagnostics.reasoningTokens ?? "not-reported"}`,
    `content_chars=${diagnostics.contentChars}`,
  ].join(" ");
}
