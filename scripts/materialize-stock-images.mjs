import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STOCK_HOST = "images.unsplash.com";

export function isReviewedStockImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === STOCK_HOST;
  } catch {
    return false;
  }
}

export function stockImageExtension(contentType, sourceUrl = "") {
  const type = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type === "image/avif") return "avif";
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  const extension = path
    .extname(new URL(String(sourceUrl), "https://x.invalid").pathname)
    .toLowerCase();
  if ([".avif", ".webp", ".png", ".jpg", ".jpeg"].includes(extension))
    return extension === ".jpeg" ? "jpg" : extension.slice(1);
  return "jpg";
}

export async function materializeStockImages({
  site = ".",
  fetchImpl = fetch,
  timeoutMs = 30_000,
} = {}) {
  const root = path.resolve(site);
  const configPath = path.join(root, "src/site.config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const images =
    config.images && typeof config.images === "object" ? config.images : {};
  let localized = 0;
  for (const [placement, value] of Object.entries(images)) {
    if (!isReviewedStockImageUrl(value)) continue;
    const response = await fetchImpl(value, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      throw new Error(
        `Reviewed stock image download failed (${response.status}).`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length)
      throw new Error("Reviewed stock image download was empty.");
    const extension = stockImageExtension(
      response.headers.get("content-type"),
      value,
    );
    const hash = crypto
      .createHash("sha256")
      .update(String(value))
      .digest("hex")
      .slice(0, 12);
    const relative = `/images/stock/${placement}-${hash}.${extension}`;
    const target = path.join(root, "public", relative.replace(/^\//u, ""));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    images[placement] = relative;
    localized += 1;
  }
  if (localized) {
    config.images = images;
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { localized, configPath };
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const index = process.argv.indexOf("--site");
  const site = index >= 0 ? process.argv[index + 1] : ".";
  const result = await materializeStockImages({ site });
  console.log(`stock_images_localized=${result.localized}`);
}
