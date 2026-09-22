const EMAIL =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const PHONE = /\+?\d[\d\s().-]{7,}\d/gu;
const URL = /https?:\/\/[^\s"'\x60]+/giu;
const BASIC_AUTH =
  /\bAuthorization\s*:\s*Basic\s+[A-Za-z0-9+/=._~-]+/giu;
const BEARER_AUTH =
  /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+\/-]+/giu;
const CREDENTIAL_ASSIGNMENT =
  /\b(?:api[_-]?key|authToken|accessToken|token|secret|password)\b\s*[:=]\s*(?:["'][^"'\r\n]+["']|[A-Za-z0-9._~+\/-]{8,})/giu;

export function sanitizeDiagnosticText(value) {
  return String(value || "")
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(BASIC_AUTH, "Authorization: [redacted-credential]")
    .replace(BEARER_AUTH, "Authorization: [redacted-credential]")
    .replace(CREDENTIAL_ASSIGNMENT, "[redacted-credential]")
    .replace(URL, "[redacted-url]");
}
