const DEFAULT_TEXT_BUDGET = 400_000;
const INLINE_IMAGE_DATA_URI = /^data:image\/[^,]*,/iu;
const INLINE_IMAGE_DATA_URI_IN_TEXT = /data:image\/[^,\s"'`]+,[^\s"'`]*/iu;

/**
 * Remove sealed image payloads and bound unusually large strings before they
 * are serialized into model-readable text. The input is never mutated.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactPromptValue(value) {
  if (typeof value === "string") {
    if (INLINE_IMAGE_DATA_URI.test(value)) return "[sealed client image asset]";
    if (value.length > 12_000)
      return `${value.slice(0, 256)}...[sealed value truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redactPromptValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactPromptValue(item)]),
    );
  return value;
}

/**
 * Serialize a client content manifest for model context, without changing the
 * canonical sealed values retained by the renderer and content manifest.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatModelBoundContentShape(value) {
  return JSON.stringify(redactPromptValue(value), null, 2) ?? "null";
}

/**
 * Fail locally when image bytes leak into textual context or the serialized
 * text is too large to send safely. Multimodal image parts are not counted.
 *
 * @param {Array<Record<string, unknown>>} contentParts
 * @param {number} maximumCharacters
 * @returns {void}
 */
export function assertModelPromptTextBudget(
  contentParts,
  maximumCharacters = DEFAULT_TEXT_BUDGET,
) {
  const text = contentParts
    .filter((part) => part?.type === "text")
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n");
  if (INLINE_IMAGE_DATA_URI_IN_TEXT.test(text))
    throw new Error("An inline image data URI leaked into textual model context.");
  if (text.length > maximumCharacters)
    throw new Error(
      `Model-bound textual prompt exceeds the ${maximumCharacters} character safety budget (${text.length}).`,
    );
}
