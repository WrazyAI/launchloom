const AUTHOR_STAGE_MAX_TOKENS = Object.freeze({
  contract: 4_000,
  experience: 18_000,
  styles: 18_000,
  motion: 12_000,
});

export function authorStageMaxTokens(stage) {
  return AUTHOR_STAGE_MAX_TOKENS[stage] ?? AUTHOR_STAGE_MAX_TOKENS.motion;
}

export function describeAuthorResponseFailure({ stage, routeId, payload }) {
  const choice = payload?.choices?.[0] || {};
  const usage = payload?.usage || {};
  const finishReason = choice.finish_reason || "unknown";
  const content = choice.message?.content;
  const contentChars = typeof content === "string" ? content.length : 0;
  const completionTokens = Number.isFinite(usage.completion_tokens)
    ? usage.completion_tokens
    : "unknown";
  const reasoningTokens = Number.isFinite(
    usage.completion_tokens_details?.reasoning_tokens,
  )
    ? usage.completion_tokens_details.reasoning_tokens
    : "unknown";
  const issue = ["length", "max_tokens"].includes(finishReason)
    ? "was truncated"
    : "returned no content";

  return `OpenRouter ${stage} response for ${routeId} ${issue} (finish_reason=${finishReason}, completion_tokens=${completionTokens}, reasoning_tokens=${reasoningTokens}, content_chars=${contentChars}).`;
}
