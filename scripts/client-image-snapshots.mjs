import { createHash } from "node:crypto";

export const MAX_CLIENT_IMAGE_SNAPSHOTS = 16;
export const MAX_CLIENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CLIENT_IMAGE_SET_BYTES = 20 * 1024 * 1024;
export const MAX_CLIENT_IMAGE_CACHE_ENTRIES = 64;
export const MAX_CLIENT_IMAGE_CACHE_BYTES = 64 * 1024 * 1024;
const CLIENT_IMAGE_TIMEOUT_MS = 15_000;
const ALLOWED_ORIGIN = "https://assets.launchloom.wrazyos.com";
const ALLOWED_PATH =
  /^\/intakes\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(?:png|webp|jpg|jpeg|avif)$/iu;
const RASTER_MIME = /^image\/(?:png|webp|jpeg|avif)$/u;

export function isClientImageSnapshotUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const canonical = `${url.origin}${url.pathname}`;
    return (
      value === canonical &&
      url.origin === ALLOWED_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ALLOWED_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function hasAllowedAssetOrigin(value) {
  try {
    return new URL(value).origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

export function isRetainedClientImage(image) {
  return (
    image &&
    Buffer.isBuffer(image.body) &&
    image.body.length > 0 &&
    image.body.length <= MAX_CLIENT_IMAGE_BYTES &&
    RASTER_MIME.test(String(image.contentType || ""))
  );
}

function cacheBytes(cache) {
  let total = 0;
  for (const image of cache.values())
    if (Buffer.isBuffer(image?.body)) total += image.body.length;
  return total;
}

function trimCache(cache) {
  while (
    cache.size > MAX_CLIENT_IMAGE_CACHE_ENTRIES ||
    cacheBytes(cache) > MAX_CLIENT_IMAGE_CACHE_BYTES
  ) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function snapshotUrls(content) {
  const urls = new Set();
  const seen = new WeakSet();
  const visit = (value) => {
    if (typeof value === "string") {
      if (isClientImageSnapshotUrl(value)) urls.add(value);
      else if (hasAllowedAssetOrigin(value))
        throw new Error("Noncanonical sealed client image URL");
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(content);
  return urls;
}

/**
 * Snapshot sealed client uploads before entering the network-free browser.
 * Exact URL bindings are reused across candidates and viewports in one
 * bakeoff. The browser receives only retained bytes for the exact approved
 * URL; every other image request stays blocked.
 */
export async function snapshotClientImages(
  content,
  { retrieve = fetch, cache = new Map() } = {},
) {
  const urls = snapshotUrls(content);
  if (urls.size > MAX_CLIENT_IMAGE_SNAPSHOTS)
    throw new Error("Too many sealed client images to snapshot");
  if (!(cache instanceof Map)) throw new Error("Invalid client image cache");

  const snapshots = new Map();
  let total = 0;
  for (const url of urls) {
    let image = cache.get(url);
    if (image) {
      if (!isRetainedClientImage(image))
        throw new Error("Invalid retained client-image snapshot");
    } else {
      const response = await retrieve(url, {
        redirect: "error",
        signal: AbortSignal.timeout(CLIENT_IMAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Client image snapshot HTTP ${response.status}`);
      }
      const contentType =
        response.headers.get("content-type")?.split(";")[0].trim() || "";
      if (!RASTER_MIME.test(contentType)) {
        await response.body?.cancel();
        throw new Error("Client image snapshot must be a raster image");
      }
      if (!response.body) throw new Error("Client image snapshot has no body");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_CLIENT_IMAGE_BYTES) {
          await response.body.cancel().catch(() => {});
          throw new Error("Client image snapshot exceeds upload size limit");
        }
        chunks.push(chunk);
      }
      if (!size) throw new Error("Client image snapshot is empty");
      image = { body: Buffer.concat(chunks), contentType };
      cache.set(url, image);
      trimCache(cache);
    }
    total += image.body.length;
    if (total > MAX_CLIENT_IMAGE_SET_BYTES)
      throw new Error("Client image snapshot set exceeds size limit");
    snapshots.set(url, image);
  }
  return snapshots;
}

export function clientImageDigests(snapshots) {
  return [...snapshots].map(([url, image]) => ({
    urlDigest: createHash("sha256").update(url).digest("hex"),
    contentDigest: createHash("sha256").update(image.body).digest("hex"),
  }));
}
