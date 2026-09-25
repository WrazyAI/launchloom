const INLINE_IMAGE_DATA_URI = /data:image\/[\w.+-]+;base64,/iu;

export const DEFAULT_AUTHOR_PROMPT_TEXT_LIMIT = 400_000;

/**
 * Fail before provider transport when model-bound text unexpectedly contains
 * inline image bytes or grows beyond the bounded creative-author budget.
 *
 * Multimodal image parts are intentionally excluded from this character
 * budget: they are already normalized by prompt-evidence.mjs and accounted for
 * by the provider as image input rather than serialized text.
 *
 * @param {string} systemPrompt
 * @param {Array<Record<string, any>>} userContent
 * @param {{ maxTextChars?: number }} [options]
 * @returns {{ textChars: number }}
 */
export function assertAuthorPromptContext(
  systemPrompt,
  userContent,
  { maxTextChars = DEFAULT_AUTHOR_PROMPT_TEXT_LIMIT } = {},
) {
  const textParts = [
    String(systemPrompt || ""),
    ...(Array.isArray(userContent)
      ? userContent
          .filter((part) => part?.type === "text")
          .map((part) => String(part.text || ""))
      : []),
  ];

  let textChars = 0;
  for (const part of textParts) {
    if (INLINE_IMAGE_DATA_URI.test(part))
      throw new Error(
        "Creative author prompt contains an inline image data URI. Keep sealed client assets out of model-bound text and send intentional visual evidence as bounded multimodal input instead.",
      );
    textChars += part.length;
  }

  if (textChars > maxTextChars)
    throw new Error(
      `Creative author prompt unexpectedly reached ${textChars} text characters (limit ${maxTextChars}). Reduce or summarize authoring context before calling the model.`,
    );

  return { textChars };
}
