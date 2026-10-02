/** Keep failure diagnostics bounded and free of image bytes or credential URLs. */
export function safeAuthorFailureText(value, maximum = 4000) {
  const text =
    value instanceof Error
      ? value.message
      : String(value || "Unknown authoring failure");
  return text
    .replace(/data(?::|%3a)image[^\s"'`<>)]*/giu, "[redacted image asset]")
    .replace(/sk-or-v1-[a-z0-9_-]+/giu, "[redacted API key]")
    .replace(/https?:\/\/[^\s"'`<>]+/giu, "[redacted URL]")
    .slice(0, maximum);
}
