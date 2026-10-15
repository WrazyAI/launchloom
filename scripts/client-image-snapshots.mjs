import { isClientImageSnapshotUrl } from "./rendered-interaction-evidence.mjs";

// Snapshot sealed client uploads before entering the network-free browser.
// Exact URL bindings are reused across candidates and viewports in one bakeoff.
export async function snapshotClientImages(
  content,
  { retrieve = fetch, cache = new Map() } = {},
) {
  const urls = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      if (isClientImageSnapshotUrl(value)) urls.add(value);
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(content);
  if (urls.size > 16)
    throw new Error("Too many sealed client images to snapshot");
  const snapshots = new Map();
  let total = 0;
  for (const url of urls) {
    let image = cache.get(url);
    if (!image) {
      const response = await retrieve(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Client image snapshot HTTP ${response.status}`);
      const contentType =
        response.headers.get("content-type")?.split(";")[0].trim() || "";
      if (!/^image\/(?:png|webp|jpeg|avif)$/u.test(contentType)) {
        await response.body?.cancel();
        throw new Error("Client image snapshot must be a raster image");
      }
      const chunks = [];
      let size = 0;
      if (!response.body) throw new Error("Client image snapshot has no body");
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024)
          throw new Error("Client image snapshot exceeds upload size limit");
        chunks.push(chunk);
      }
      if (!size) throw new Error("Client image snapshot is empty");
      image = { body: Buffer.concat(chunks), contentType };
      cache.set(url, image);
    }
    total += image.body.length;
    if (total > 20 * 1024 * 1024)
      throw new Error("Client image snapshot set exceeds size limit");
    snapshots.set(url, image);
  }
  return snapshots;
}
