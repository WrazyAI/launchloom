import { isPublicHttpsUrl } from "../emails/render-email.mjs";
import {
  isAllowedPreviewHost,
  previewHostSuffixes,
  previewProxyPath,
} from "../src/lib/preview-proxy-contract.mjs";

/**
 * Resolve the link that should be emailed for a preview.
 *
 * A public preview stays direct. A preview that Cloudflare Access intercepts
 * is routed through the authenticated Worker proxy so the recipient signs in
 * with their LaunchLoom account instead of the retired Access one-time PIN.
 * Probing is best effort: a network failure keeps the direct link rather than
 * blocking the email.
 */

export function normalizeAdminOrigin(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\/$/u, "");
  if (!isPublicHttpsUrl(raw))
    throw new Error("The admin origin must be a public https origin.");
  const url = new URL(raw);
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("The admin origin must not contain a path, query or hash.");
  return url.origin;
}

export function buildPreviewProxyUrl(
  previewUrl,
  adminOrigin,
  suffixes = previewHostSuffixes(),
) {
  const raw = String(previewUrl || "").trim();
  if (!isPublicHttpsUrl(raw))
    throw new Error("The preview URL must be a public https URL.");
  return `${normalizeAdminOrigin(adminOrigin)}${previewProxyPath(raw, suffixes)}`;
}

function accessRedirect(response) {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location") || "";
  try {
    const target = new URL(location, "https://preview.invalid");
    return (
      /(?:^|\.)cloudflareaccess\.com$/iu.test(target.hostname) ||
      /\/cdn-cgi\/access\/login(?:\/|$)/iu.test(target.pathname)
    );
  } catch {
    return false;
  }
}

export function isAccessProtectedResponse(response) {
  if (accessRedirect(response)) return true;
  return response.status === 401 || response.status === 403;
}

export async function resolvePreviewLink({
  previewUrl = "",
  adminOrigin = "",
  suffixes = previewHostSuffixes(),
  fetch: send = fetch,
  timeoutMs = 5_000,
} = {}) {
  const raw = String(previewUrl || "").trim();
  if (!isPublicHttpsUrl(raw))
    throw new Error("The preview URL must be a public https URL.");

  const target = new URL(raw);
  if (!isAllowedPreviewHost(target.hostname, suffixes))
    return { url: raw, proxied: false };
  if (!adminOrigin) return { url: raw, proxied: false };

  let response;
  try {
    response = await send(raw, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "LaunchLoomPreviewLink/1.0" },
    });
    if (response.status === 405 || response.status === 501)
      response = await send(raw, {
        method: "GET",
        redirect: "manual",
        headers: {
          Range: "bytes=0-0",
          "User-Agent": "LaunchLoomPreviewLink/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
  } catch {
    return { url: raw, proxied: false };
  }

  if (!isAccessProtectedResponse(response)) return { url: raw, proxied: false };
  return {
    url: buildPreviewProxyUrl(raw, adminOrigin, suffixes),
    proxied: true,
  };
}
