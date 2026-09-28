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

function cacheKey(filePath, crop) {
  const resolved = path.resolve(filePath);
  return crop
    ? `${resolved}::crop:${crop.left},${crop.top},${crop.width},${crop.height}`
    : resolved;
}

/** Return source pixel dimensions before prompt transport resizes an image. */
export async function promptImageDimensions(filePath) {
  const input = await fs.readFile(cacheKey(filePath));
  if (!looksLikeImage(input))
    throw new Error(`Prompt evidence is not an image: ${filePath}`);
  const { width, height } = orientedDimensions(await sharp(input).metadata());
  if (!width || !height)
    throw new Error(`Prompt evidence has no dimensions: ${filePath}`);
  return { width, height };
}

function orientedDimensions(metadata) {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  return [5, 6, 7, 8].includes(metadata.orientation)
    ? { width: height, height: width }
    : { width, height };
}

function looksLikeImage(input) {
  return (
    (input.length >= 8 &&
      input[0] === 0x89 &&
      input[1] === 0x50 &&
      input[2] === 0x4e &&
      input[3] === 0x47) ||
    (input.length >= 3 &&
      input[0] === 0xff &&
      input[1] === 0xd8 &&
      input[2] === 0xff) ||
    (input.length >= 12 &&
      input.toString("ascii", 0, 4) === "RIFF" &&
      input.toString("ascii", 8, 12) === "WEBP") ||
    (input.length >= 12 &&
      input.toString("ascii", 4, 8) === "ftyp" &&
      /^(?:avif|avis|heic|heix|hevc|hevx|mif1|msf1)$/u.test(
        input.toString("ascii", 8, 12),
      )) ||
    (input.length >= 6 &&
      (input.toString("ascii", 0, 6) === "GIF87a" ||
        input.toString("ascii", 0, 6) === "GIF89a"))
  );
}

function fallbackPromptImage(resolved, input) {
  const extension = path.extname(resolved).toLowerCase();
  const mime =
    extension === ".png"
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

async function preparePromptImage(filePath, { crop } = {}) {
  const resolved = path.resolve(filePath);
  const preparedKey = cacheKey(resolved, crop);
  const cached = preparedCache.get(preparedKey);
  if (cached) return cached;

  const input = await fs.readFile(resolved);
  if (!looksLikeImage(input)) {
    if (crop)
      throw new Error(
        `Prompt evidence crop requires a supported image: ${resolved}`,
      );
    if (input.length > MAX_BYTES)
      throw new Error(`Prompt evidence is not a supported image: ${resolved}`);
    const result = fallbackPromptImage(resolved, input);
    preparedCache.set(preparedKey, result);
    return result;
  }
  let cropRegion = null;
  if (crop) {
    const metadata = orientedDimensions(await sharp(input).metadata());
    const validCrop =
      Number.isInteger(crop.left) &&
      Number.isInteger(crop.top) &&
      Number.isInteger(crop.width) &&
      Number.isInteger(crop.height) &&
      crop.left >= 0 &&
      crop.top >= 0 &&
      crop.width > 0 &&
      crop.height > 0 &&
      crop.left + crop.width <= (metadata.width || 0) &&
      crop.top + crop.height <= (metadata.height || 0);
    if (!validCrop)
      throw new Error(`Prompt evidence crop exceeds image bounds: ${resolved}`);
    cropRegion = crop;
  }
  const render = (quality) => {
    let image = sharp(input).rotate();
    if (cropRegion) image = image.extract(cropRegion);
    return image
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer();
  };
  let quality = JPEG_QUALITY;
  let output;
  try {
    output = await render(quality);
  } catch (error) {
    // A recognized image must never be sent under a mismatched MIME type.
    // Tiny non-image test fixtures still use the fallback above.
    throw new Error(`Could not normalize prompt evidence image: ${resolved}`, {
      cause: error,
    });
  }

  while (output.length > MAX_BYTES && quality > 48) {
    quality -= 8;
    output = await render(quality);
  }

  const result = {
    dataUrl: `data:image/jpeg;base64,${output.toString("base64")}`,
    bytes: output.length,
    quality,
    sourcePath: resolved,
  };
  preparedCache.set(preparedKey, result);
  return result;
}

/**
 * Convert a local screenshot into bounded multimodal evidence. The image is
 * still supplied in the request context; only its transport representation is
 * reduced so the textual contract and authored source remain usable.
 *
 * @param {string} filePath
 * @param {{ detail?: "low" | "high", crop?: {left: number, top: number, width: number, height: number} }} [options]
 */
export async function promptImagePart(filePath, { detail = "low", crop } = {}) {
  const prepared = await preparePromptImage(filePath, { crop });
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
 * Prepare reference evidence so authors see both page rhythm and legible
 * opening geometry. Full-page overviews stay low-detail; first-viewport crops
 * use high detail and the source dossier's recorded browser dimensions.
 *
 * @param {{ desktop?: { path?: string, viewport?: { width?: number, height?: number } }, mobile?: { path?: string, viewport?: { width?: number, height?: number } } }} reference
 * @param {{ retry?: boolean }} [options]
 * @returns {Promise<Array<{ path: string, detail: "low" | "high", purpose: string, crop?: { left: number, top: number, width: number, height: number } }>>}
 */
export async function selectAuthorReferenceEvidence(
  reference,
  { retry = false } = {},
) {
  const desktopPath = reference?.desktop?.path;
  if (!desktopPath) return [];

  const cropFor = async (capture) => {
    const viewport = capture?.viewport;
    if (
      !Number.isInteger(viewport?.width) ||
      !Number.isInteger(viewport?.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      return null;
    const dimensions = await promptImageDimensions(capture.path);
    return {
      left: 0,
      top: 0,
      width: Math.min(viewport.width, dimensions.width),
      height: Math.min(viewport.height, dimensions.height),
    };
  };

  const evidence = [];
  if (!retry)
    evidence.push({
      path: desktopPath,
      detail: "low",
      purpose: "full-page overview",
    });

  const desktopCrop = await cropFor(reference.desktop);
  evidence.push({
    path: desktopPath,
    detail: desktopCrop ? "high" : "low",
    purpose: "desktop opening viewport",
    ...(desktopCrop ? { crop: desktopCrop } : {}),
  });

  if (!retry && reference?.mobile?.path) {
    const mobileCrop = await cropFor(reference.mobile);
    evidence.push({
      path: reference.mobile.path,
      detail: mobileCrop ? "high" : "low",
      purpose: "mobile opening viewport",
      ...(mobileCrop ? { crop: mobileCrop } : {}),
    });
  }

  return evidence;
}

/**
 * Prepare authoring evidence for one route and retain its identity in errors.
 * @param {{ id?: string, referenceDna?: { evidence?: { desktopScreenshot?: { path?: string, viewport?: { width?: number, height?: number } }, mobileScreenshot?: { path?: string, viewport?: { width?: number, height?: number } } } }} route
 * @param {{ retry?: boolean }} [options]
 */
export async function selectAuthorEvidenceForRoute(
  route,
  { retry = false } = {},
) {
  try {
    return await selectAuthorReferenceEvidence(
      {
        desktop: route?.referenceDna?.evidence?.desktopScreenshot,
        mobile: route?.referenceDna?.evidence?.mobileScreenshot,
      },
      { retry },
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Reference screenshot preparation failed for ${route?.id || "route"}: ${detail}`,
      { cause },
    );
  }
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
export async function createPromptEvidenceDirectory(
  prefix = "launchloom-evidence-",
) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
