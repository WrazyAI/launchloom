const INLINE_IMAGE_DATA_URI_IN_TEXT =
  /data:image\//iu;

function textParts(messages) {
  const text = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message?.content === "string") {
      text.push(message.content);
      continue;
    }
    if (!Array.isArray(message?.content)) continue;
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string")
        text.push(part.text);
    }
  }
  return text;
}

/**
 * Fail locally before provider transport if serialized author text contains
 * sealed image bytes or exceeds the conservative per-request safety budget.
 * Multimodal image_url blocks are intentionally not counted as text.
 *
 * @param {Array<{role?: string, content?: string | Array<any>}>} messages
 * @param {{maxCharacters?: number}} [options]
 * @returns {{textCharacters: number, maxCharacters: number}}
 */
export function assertAuthorPromptBudget(messages, { maxCharacters = 400_000 } = {}) {
  const text = textParts(messages);
  for (const part of text) {
    if (INLINE_IMAGE_DATA_URI_IN_TEXT.test(part)) {
      throw new Error(
        "Creative author prompt contains an inline image data URI in text; redact sealed assets before provider transport.",
      );
    }
  }

  const textCharacters = text.reduce((total, part) => total + part.length, 0);
  if (textCharacters > maxCharacters) {
    throw new Error(
      `Creative author prompt exceeds the ${maxCharacters}-character safety budget (${textCharacters} characters).`,
    );
  }

  return { textCharacters, maxCharacters };
}
