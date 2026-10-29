/**
 * Shared preview-proxy URL contract.
 *
 * The Worker route and the email/workflow link builder must agree on the exact
 * host allowlist and path shape. Keep this module dependency-free so both the
 * Worker bundle and Node scripts can import it.
 */

export const PREVIEW_PROXY_PREFIX = "/admin/preview/";
/**
 * Only the Access-covered focused-test project is proxied. Sending the Access
 * service token to an arbitrary `*.pages.dev` host would leak it to any
 * Cloudflare Pages customer. Override both the Worker and the link builder
 * together if the test project moves.
 */
export const DEFAULT_PREVIEW_HOST_SUFFIX =
  "launchloom-pipeline-preview.pages.dev";

export function previewHostSuffixes(value = "") {
  const configured = String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\./u, ""))
    .filter(Boolean);
  return configured.length ? configured : [DEFAULT_PREVIEW_HOST_SUFFIX];
}

/** Only hosts under the Access-covered preview project may be fetched. */
export function isAllowedPreviewHost(
  host,
  suffixes = [DEFAULT_PREVIEW_HOST_SUFFIX],
) {
  const normalized = String(host || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized.length > 253) return false;
  if (
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("@") ||
    normalized.includes(":") ||
    normalized.includes("..")
  )
    return false;
  const suffix = suffixes.find((value) => normalized.endsWith(`.${value}`));
  if (!suffix) return false;
  const labels = normalized.split(".");
  if (labels.length < 3) return false;
  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
  );
}

/**
 * Client sites and their review previews live on the client's own Pages
 * project or a connected custom domain, not on the focused pipeline preview
 * project. The admin dashboard may present these only as plain https links,
 * and the focused project must never be presented as a client delivery.
 */
export function isAllowedClientSiteHost(
  host,
  suffixes = [DEFAULT_PREVIEW_HOST_SUFFIX],
) {
  const normalized = String(host || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized.length > 253) return false;
  if (
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("@") ||
    normalized.includes(":") ||
    normalized.includes("..")
  )
    return false;
  if (isAllowedPreviewHost(normalized, suffixes)) return false;
  return (
    normalized === "launchloom.wrazyos.com" ||
    normalized.endsWith(".wrazyos.com") ||
    normalized.endsWith(".pages.dev")
  );
}

/** Absolute, token-free https client site link, or null when unproven. */
export function safeClientSiteUrl(
  value,
  suffixes = [DEFAULT_PREVIEW_HOST_SUFFIX],
) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !isAllowedClientSiteHost(url.hostname, suffixes)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Build `/admin/preview/<pages-host>/<path>` for one absolute preview URL. */
export function previewProxyPath(
  target,
  suffixes = [DEFAULT_PREVIEW_HOST_SUFFIX],
) {
  const url = target instanceof URL ? target : new URL(String(target));
  if (url.protocol !== "https:")
    throw new Error("Preview URLs must use https.");
  if (url.username || url.password || url.port)
    throw new Error("Preview URLs cannot contain credentials or a port.");
  if (!isAllowedPreviewHost(url.hostname, suffixes))
    throw new Error("Preview URLs must use an allowed Pages host.");
  return `${PREVIEW_PROXY_PREFIX}${url.hostname}${url.pathname || "/"}${url.search}`;
}
