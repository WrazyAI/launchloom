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

/** Return source pixel dimensions before prompt transport resizes an image. */
export async function promptImageDimensions(filePath) {
  const input = await fs.readFile(cacheKey(filePath));
  if (!looksLikeImage(input)) throw new Error(`Prompt evidence is not an image: ${filePath}`);
  const { width, height } = await sharp(input).metadata();
  if (!width || !height) throw new Error(`Prompt evidence has no dimensions: ${filePath}`);
  return { width, height };
}

function looksLikeImage(input) {
  const prefix = input.toString("utf8", 0, Math.min(input.length, 256)).trimStart();
  return (
    (input.length >= 8 && input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4e && input[3] === 0x47) ||
    (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) ||
    (input.length >= 12 && input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP") ||
    (input.length >= 12 &&
      input.toString("ascii", 4, 8) === "ftyp" &&
      /^(?:avif|avis|heic|heix|hevc|hevx|mif1|msf1)$/u.test(input.toString("ascii", 8, 12))) ||
    (input.length >= 6 && (input.toString("ascii", 0, 6) === "GIF87a" || input.toString("ascii", 0, 6) === "GIF89a")) ||
    prefix.startsWith("<svg") ||
    (prefix.startsWith("<?xml") && /<svg\b/iu.test(prefix))
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
    // A recognized image must never be sent under a mismatched MIME type.
    // Tiny non-image test fixtures still use the fallback above.
    throw new Error(`Could not normalize prompt evidence image: ${resolved}`, {
      cause: error,
    });
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
 * Keep both reference screenshots on an authoring pass. A repair retry keeps
 * the desktop image and the complete textual Reference DNA, avoiding another
 * large visual payload while preserving the analyzed mobile geometry.
 *
 * @param {{ desktop?: string, mobile?: string }} reference
 * @param {{ retry?: boolean }} [options]
 * @returns {string[]}
 */
export function selectAuthorReferenceScreenshots(
  reference,
  { retry = false } = {},
) {
  const paths = [reference?.desktop, ...(retry ? [] : [reference?.mobile])];
  return [...new Set(paths.filter(Boolean))].slice(0, 2);
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
