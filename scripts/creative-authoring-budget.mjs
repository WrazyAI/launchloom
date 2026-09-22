const AUTHOR_STAGE_MAX_TOKENS = Object.freeze({
  contract: 16_000,
  experience: 64_000,
  styles: 48_000,
  motion: 32_000,
});

const AUTHOR_STAGE_TIMEOUT_MS = Object.freeze({
  contract: 180_000,
  experience: 240_000,
  styles: 240_000,
  motion: 240_000,
});

export function authorStageMaxTokens(stage) {
  return AUTHOR_STAGE_MAX_TOKENS[stage] ?? AUTHOR_STAGE_MAX_TOKENS.motion;
}

export function authorStageTimeoutMs(stage) {
  return AUTHOR_STAGE_TIMEOUT_MS[stage] ?? AUTHOR_STAGE_TIMEOUT_MS.motion;
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
