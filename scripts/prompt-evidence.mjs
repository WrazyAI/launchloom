import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

// Full-page reference captures can be several thousand pixels tall. Sending
// those originals as data URLs makes the visual evidence dominate the model
// context before the author can read the contract or return source. Keep the
// evidence multimodal, but bound its visual footprint first.
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1800;
const JPEG_QUALITY = 72;
const MAX_BYTES = 900_000;
const preparedCache = new Map();

function cacheKey(filePath) {
  return path.resolve(filePath);
}

function looksLikeImage(input) {
  return (
    (input.length >= 8 && input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4e && input[3] === 0x47) ||
    (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) ||
    (input.length >= 12 && input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP") ||
    (input.length >= 6 && (input.toString("ascii", 0, 6) === "GIF87a" || input.toString("ascii", 0, 6) === "GIF89a"))
  );
}

function fallbackPromptImage(resolved, input) {
  const extension = path.extname(resolved).toLowerCase();
  const mime = extension === ".png"
    ? "image/png"
    : extension === ".webp"
      ? "image/webp"
      : extension === ".gif"
        ? "image/gif"
        : "image/jpeg";
  return {
    dataUrl: `data:${mime};base64,${input.toString("base64")}`,
    bytes: input.length,
    quality: null,
    sourcePath: resolved,
  };
}

async function preparePromptImage(filePath) {
  const resolved = cacheKey(filePath);
  const cached = preparedCache.get(resolved);
  if (cached) return cached;

  const input = await fs.readFile(resolved);
  if (!looksLikeImage(input)) {
    if (input.length > MAX_BYTES)
      throw new Error(`Prompt evidence is not a supported image: ${resolved}`);
    const result = fallbackPromptImage(resolved, input);
    preparedCache.set(resolved, result);
    return result;
  }
  let quality = JPEG_QUALITY;
  let output;
  try {
    output = await sharp(input)
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    // Unit tests and provider fixtures may use tiny sentinel files instead of
    // real images. Preserve those bounded bytes so the request shape remains
    // testable, while still rejecting an oversized unsupported asset.
    if (input.length > MAX_BYTES) throw error;
    const result = fallbackPromptImage(resolved, input);
    preparedCache.set(resolved, result);
    return result;
  }

  while (output.length > MAX_BYTES && quality > 48) {
    quality -= 8;
    output = await sharp(input)
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer();
  }

  const result = {
    dataUrl: `data:image/jpeg;base64,${output.toString("base64")}`,
    bytes: output.length,
    quality,
    sourcePath: resolved,
  };
  preparedCache.set(resolved, result);
  return result;
}

/**
 * Convert a local screenshot into bounded multimodal evidence. The image is
 * still supplied in the request context; only its transport representation is
 * reduced so the textual contract and authored source remain usable.
 *
 * @param {string} filePath
 * @param {{ detail?: "low" | "high" }} [options]
 */
export async function promptImagePart(filePath, { detail = "low" } = {}) {
  const prepared = await preparePromptImage(filePath);
  return {
    type: "image_url",
    image_url: { url: prepared.dataUrl, detail },
  };
}

/**
 * Pick the non-redundant screenshots needed for an author repair. Compact
 * desktop repeats most of the desktop composition, while desktop + mobile
 * preserves both geometry regimes with half the image context.
 *
 * @param {string[]} screenshots
 */
export function selectRepairScreenshots(screenshots) {
  const paths = screenshots.filter(Boolean);
  const mobile = paths.find((item) => /mobile/iu.test(item));
  const desktop = paths.find((item) => /desktop/iu.test(item));
  return [...new Set([desktop, mobile, ...paths].filter(Boolean))].slice(0, 2);
}

/**
 * Return a temporary directory for callers that need to persist evidence
 * during a run. Keeping this helper here gives scripts one consistent place
 * to use the operating system temp area without putting prompt-only images in
 * the generated site.
 */
export async function createPromptEvidenceDirectory(prefix = "launchloom-evidence-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
