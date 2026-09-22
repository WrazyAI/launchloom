function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter(
        (part) =>
          ["text", "output_text"].includes(part?.type) &&
          typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("");
  return "";
}

function parsedValue(candidate) {
  try {
    return { parsed: true, value: JSON.parse(candidate) };
  } catch {
    return { parsed: false, value: null };
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function parseModelJson(content) {
  const source = contentText(content).trim();
  const direct = parsedValue(source);
  if (direct.parsed) {
    if (isObject(direct.value)) return direct.value;
    throw new Error("OpenRouter did not return a valid JSON object.");
  }

  const candidates = [];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    candidates.push(match[1].trim());
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidates.push(source.slice(firstBrace, lastBrace + 1));

  for (const candidate of [...new Set(candidates)]) {
    const result = parsedValue(candidate);
    if (result.parsed && isObject(result.value)) return result.value;
  }
  throw new Error("OpenRouter did not return a valid JSON object.");
}
