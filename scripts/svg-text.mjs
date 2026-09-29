const XML_TEXT_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
});

export function escapeXmlText(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => XML_TEXT_ESCAPES[character]);
}
