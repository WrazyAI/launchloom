import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const FEEDBACK_IMAGE_SPECS = {
  logo: { label: "logo", maxWidth: 512, minWidth: 48, minHeight: 48 },
  hero: { label: "main image", maxWidth: 1600, minWidth: 640, minHeight: 360 },
  secondary: {
    label: "about image",
    maxWidth: 1200,
    minWidth: 480,
    minHeight: 360,
  },
  tertiary: {
    label: "gallery image",
    maxWidth: 1200,
    minWidth: 480,
    minHeight: 320,
  },
  team: { label: "team photo", maxWidth: 1000, minWidth: 300, minHeight: 300 },
};

const MAX_SOURCE_BYTES = 8_000_000;
const MAX_OPTIMIZED_BYTES = 2_500_000;

export function feedbackAssetPath(target, url) {
  const digest = crypto
    .createHash("sha256")
    .update(`${target}\n${url}`)
    .digest("hex")
    .slice(0, 12);
  return `/images/feedback/${target}-${digest}.webp`;
}

function storedFeedbackUrl(url, base) {
  const value = String(url || "").trim();
  if (value.length > 1_000 || !/^https:\/\//u.test(value)) return false;
  return (
    value.startsWith(`${base}/feedback/`) ||
    value.startsWith(`${base}/feedback-drafts/`)
  );
}

async function loadAttachment(url, base, fetchImpl, timeoutMs = 30_000) {
  if (!storedFeedbackUrl(url, base))
    throw new Error("image URL is outside LaunchLoom storage");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`image download failed (${response.status})`);
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!/^image\//u.test(contentType))
      throw new Error("the download is not an image");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error("the image is too large");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("the image is empty");
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error("the image is too large");
    return buffer;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("image download timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function normalizeFeedbackImage(buffer, spec) {
  const metadata = await sharp(buffer)
    .metadata()
    .catch(() => undefined);
  if (!metadata?.width || !metadata?.height)
    throw new Error("the image has no readable dimensions");
  if (metadata.width < spec.minWidth || metadata.height < spec.minHeight)
    throw new Error(
      `use an image of at least ${spec.minWidth} by ${spec.minHeight} pixels`,
    );
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: spec.maxWidth, withoutEnlargement: true })
    .webp({ quality: 84, effort: 4, alphaQuality: 100 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength > MAX_OPTIMIZED_BYTES)
    throw new Error("the optimized image is larger than 2.5 MB");
  return {
    data,
    width: info.width,
    height: info.height,
    bytes: data.byteLength,
  };
}

export async function materializeFeedbackAssets({
  items,
  assetBaseUrl,
  outputDir,
  fetchImpl = fetch,
}) {
  const base = String(assetBaseUrl || "")
    .replace(/\/$/u, "");
  if (!/^https:\/\//u.test(base))
    throw new Error("An HTTPS asset base URL is required.");
  const records = Array.isArray(items) ? items : [];
  const cache = new Map();
  const files = [];
  const failures = [];
  const output = [];
  await fs.mkdir(outputDir, { recursive: true });
  for (const item of records) {
    const attachments = Array.isArray(item?.structure?.attachments)
      ? item.structure.attachments
      : [];
    const assets = [];
    for (const attachment of attachments) {
      const spec = FEEDBACK_IMAGE_SPECS[attachment?.target];
      if (!spec) {
        failures.push(
          `Unsupported image target: ${String(attachment?.target || "unknown")}.`,
        );
        continue;
      }
      try {
        if (!cache.has(attachment.url))
          cache.set(
            attachment.url,
            loadAttachment(attachment.url, base, fetchImpl),
          );
        const buffer = await cache.get(attachment.url);
        const normalized = await normalizeFeedbackImage(buffer, spec);
        const relative = feedbackAssetPath(attachment.target, attachment.url);
        const filePath = path.join(outputDir, path.basename(relative));
        await fs.writeFile(filePath, normalized.data);
        const prompt =
          attachment.kind === "generated"
            ? String(attachment.prompt || "").trim().slice(0, 500)
            : "";
        assets.push({
          target: attachment.target,
          kind: attachment.kind === "generated" ? "generated" : "upload",
          path: relative,
          source:
            attachment.kind === "generated" ? "fal-generated" : "client",
          ...(prompt ? { prompt } : {}),
          ...(attachment.kind === "generated" && attachment.model
            ? { model: String(attachment.model).slice(0, 80) }
            : {}),
          ...(prompt
            ? {
                promptHash: crypto
                  .createHash("sha256")
                  .update(prompt)
                  .digest("hex")
                  .slice(0, 16),
              }
            : {}),
          sha256: crypto
            .createHash("sha256")
            .update(normalized.data)
            .digest("hex"),
          width: normalized.width,
          height: normalized.height,
        });
        files.push({ path: relative, bytes: normalized.bytes });
      } catch (error) {
        failures.push(
          `${spec.label}: ${error instanceof Error ? error.message : "could not prepare the image"}`,
        );
      }
    }
    output.push({
      ...item,
      assets,
      colors: Array.isArray(item?.structure?.colors)
        ? item.structure.colors
        : [],
    });
  }
  return { items: output, files, failures };
}
