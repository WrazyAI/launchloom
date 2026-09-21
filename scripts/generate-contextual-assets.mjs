import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fal as defaultFal } from "@fal-ai/client";
import sharp from "sharp";
import { buildRouteContract } from "./creative-compiler.mjs";

export const DEFAULT_FAL_MODEL = "fal-ai/minimax/image-01";
export const DEFAULT_MAX_IMAGES = 3;
export const DEFAULT_MAX_REQUESTS = 6;
export const DEFAULT_MAX_PROMPT_LENGTH = 1500;

const PLACEMENTS = [
  {
    id: "hero",
    clientSlots: ["photoOne"],
    aspectRatio: "16:9",
    maxWidth: 1600,
    alt: "featured service context",
    focal: "Keep the main subject in the central safe crop with negative space for copy.",
  },
  {
    id: "secondary",
    clientSlots: ["photoTwo", "photoThree", "teamPhoto"],
    aspectRatio: "4:3",
    maxWidth: 1200,
    alt: "supporting service context",
    focal: "Keep the subject legible in a 4:3 crop and preserve a calm edge for overlays.",
  },
  {
    id: "tertiary",
    clientSlots: ["photoThree"],
    aspectRatio: "3:2",
    maxWidth: 1200,
    alt: "detail of the service experience",
    focal: "Use a tactile close crop with a clear subject at mobile width.",
  },
];

const PRIVATE_FIELD = /(?:phone|email|address|street|contact|password|token|secret|url|https?:\/\/)/iu;

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

function text(value, limit = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function safePromptPart(value, limit = 180) {
  const candidate = text(value, limit);
  if (!candidate || PRIVATE_FIELD.test(candidate)) return "";
  return candidate.replace(/[{}<>]/gu, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function list(value, limit = 6) {
  return (Array.isArray(value) ? value : [])
    .map((item) => safePromptPart(item, 140))
    .filter(Boolean)
    .slice(0, limit);
}

function clientAssetFor(site, placement) {
  const assets = site.assets || {};
  return placement.clientSlots.find((slot) => typeof assets[slot] === "string" && assets[slot].trim());
}

function visualDirection(site) {
  const style = site.style || {};
  return [style.visualDirection, style.preference, style.tone]
    .map((value) => safePromptPart(value, 180))
    .filter(Boolean)
    .join(", ");
}

function promptFor(site, route, placement) {
  const business = site.business || {};
  const seo = site.seoResearch || {};
  const services = list((site.services || []).map((service) => service?.name));
  const areas = list(business.serviceAreas, 3);
  const vocabulary = list(seo.copyVocabulary, 5);
  const problems = list(seo.customerQuestions, 3);
  const routeLanguage = [
    route?.familyId,
    route?.heroGeometry,
    route?.typographyCategory,
    route?.signature,
  ]
    .map((value) => safePromptPart(value, 120))
    .filter(Boolean)
    .join(", ");
  const direction = visualDirection(site);
  const dna = route?.referenceDna || {};
  const familyImageDirection = {
    "kokoro-editorial-architecture": "warm architectural interiors, editorial still life, restrained dark palette, tactile natural materials",
    "skyelite-cinematic-luxury": "luxury transport atmosphere, wide cinematic framing, soft horizon light, premium restraint",
    "health-portal-masked-mosaic": "modular clinical imagery, calm human-safe materials, mask-friendly windows, clean neutral surfaces",
    "3d-portfolio-object-led": "object-led renders, spatial compositions, sculptural materials, controlled studio lighting",
    "veyra-kinetic-typography": "high-energy action documentary framing with clear subject silhouettes and bold negative space",
    "digital-experiences-liquid-glass": "abstract atmospheric fields, liquid light, depth and translucent surfaces without readable text",
    "vortex-editorial-studio": "editorial project stills, expressive but credible studio materials, wide moving-strip crops",
  };
  const familyAssetBriefs = {
    "kokoro-editorial-architecture": {
      medium: "photorealistic architectural editorial photography",
      hero: "Create an architectural tableau with strong negative space, warm material depth, and a crop that can support monumental type without becoming a split hero.",
      secondary: "Create a vertical or offset interior chapter with tactile material detail and quiet editorial framing.",
      tertiary: "Create an architectural still life or material study suited to a magazine/archive rhythm.",
    },
    "skyelite-cinematic-luxury": {
      medium: "cinematic premium transport photography",
      hero: "Create a wide atmospheric horizon scene with motion energy, restrained luxury, and centered copy-safe space.",
      secondary: "Create a cinematic destination or transport detail with directional movement and broad tonal gradients.",
      tertiary: "Create a premium material or travel detail that reads as a film still rather than a catalog card.",
    },
    "health-portal-masked-mosaic": {
      medium: "clean modular clinical photography",
      hero: "Create one coherent clinical or wellness scene that can be cropped into multiple coordinated mask windows while keeping the subject relationship intact.",
      secondary: "Create a second calm clinical scene with strong crop-safe zones for modular windows.",
      tertiary: "Create a precise material, tool, or environment detail suitable for a masked mosaic.",
    },
    "3d-portfolio-object-led": {
      medium: "studio object render with realistic materials",
      hero: "Create a single sculptural service-relevant object on a spatial stage with dramatic negative space and deep-focus lighting.",
      secondary: "Create a second object-led composition that can anchor a stacked project chapter.",
      tertiary: "Create a close object/material study with controlled studio depth, not lifestyle photography.",
    },
    "veyra-kinetic-typography": {
      medium: "high-energy documentary action photography",
      hero: "Create a full-frame action scene with a clear silhouette, directional energy, and large negative zones for oversized condensed type.",
      secondary: "Create a directional performance scene suitable for horizontal program bands.",
      tertiary: "Create a tight action or equipment detail with graphic contrast and motion cues.",
    },
    "digital-experiences-liquid-glass": {
      medium: "abstract spatial light composition",
      hero: "Create an abstract atmospheric field with liquid light, depth, refraction, and quiet negative space for floating interface instruments.",
      secondary: "Create a layered translucent spatial scene with controlled blur and depth, without literal UI text.",
      tertiary: "Create a close abstract material/light study that can sit behind structural glass cells.",
    },
    "vortex-editorial-studio": {
      medium: "editorial project photography",
      hero: "Create a restrained authored image with broad horizontal crop potential for a narrow-column studio composition.",
      secondary: "Create a wide project still designed for a moving marquee strip.",
      tertiary: "Create a project/material detail with strong editorial cropping and calm contrast.",
    },
  };
  const familyBrief =
    familyAssetBriefs[dna.familyId] || {
      medium: "commercial editorial photography",
      hero: "Create a distinctive hero scene whose geometry follows the assigned Reference DNA.",
      secondary: "Create a supporting scene whose crop follows the assigned Reference DNA.",
      tertiary: "Create a tactile supporting detail whose crop follows the assigned Reference DNA.",
    };
  const subject = services.length
    ? services.join(", ")
    : safePromptPart(site.businessKind || site.industry || "local service", 100) || "local service";
  const areaContext = areas.length ? `Broad setting: ${areas.join(", ")}.` : "Do not imply a specific storefront or address.";
  const vocabularyContext = vocabulary.length
    ? `Natural customer language for context only: ${vocabulary.join(", ")}.`
    : "";
  const problemContext = problems.length
    ? `Customer concerns to understand visually, without adding claims: ${problems.join("; ")}.`
    : "";
  const routeContext = routeLanguage ? `Creative route: ${routeLanguage}.` : "";
  const dnaContext = dna.familyId
    ? `Reference DNA family: ${safePromptPart(dna.familyId, 100)}. Hero geometry: ${safePromptPart(dna.heroGeometry?.mode, 100)}. Image treatment: ${safePromptPart(dna.imageTreatment?.mode, 120)}. Crop strategy: ${safePromptPart(dna.imageTreatment?.crop, 140)}. Palette intent: ${safePromptPart(dna.palette?.contrastIntent, 140)}. ${familyImageDirection[dna.familyId] || "Follow the assigned reference mechanics without copying a brand."}`
    : "";
  const directionContext = direction ? `Visual direction: ${direction}.` : "";
  const placementBrief =
    placement.id === "hero"
      ? familyBrief.hero
      : placement.id === "secondary"
        ? familyBrief.secondary
        : familyBrief.tertiary;
  const prompt = [
    `Visual medium: ${familyBrief.medium}.`,
    `Asset type: ${placement.id} image for a local-business website.`,
    `Primary request: ${placementBrief}.`,
    `Business context: ${subject}.`,
    areaContext,
    routeContext,
    dnaContext,
    directionContext,
    vocabularyContext,
    problemContext,
    `Style: follow the assigned family mechanics and crop strategy. Preserve believable materials and production polish appropriate to ${familyBrief.medium}; do not normalize every family into the same editorial photograph.`,
    "Constraints: no readable text, no logos, no watermark, no signage, no invented credentials, no branded products, no medical claims, no identifiable people, no faces, no customer or staff implication, and no copied real-world campaign.",
    "Keep the image useful at the requested crop and avoid tiny details that disappear on mobile.",
    placement.focal,
  ]
    .filter(Boolean)
    .join(" ");
  return text(prompt, DEFAULT_MAX_PROMPT_LENGTH);
}

function fallbackImage(site, placement) {
  if (placement.id === "hero") return site.images?.hero || "";
  if (placement.id === "secondary") return site.images?.secondary || "";
  return site.images?.tertiary || "";
}

function pathFor(placement, promptHash) {
  return `/images/generated/${placement.id}-${promptHash.slice(0, 12)}.webp`;
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("FAL image request timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function normalizeImage(buffer, placement) {
  const sourceMetadata = await sharp(buffer).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height)
    throw new Error("Generated image has no readable dimensions.");
  if (sourceMetadata.width < 640 || sourceMetadata.height < 360)
    throw new Error("Generated image is too small for a website placement.");
  const { data, info } = await sharp(buffer)
    .resize({ width: placement.maxWidth, withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength > 2_500_000)
    throw new Error("Generated image exceeds the 2.5 MB optimized limit.");
  return {
    data,
    width: info.width,
    height: info.height,
    bytes: data.byteLength,
    sourceFormat: sourceMetadata.format || "unknown",
  };
}

async function downloadImage(url, fetchImpl = fetch, timeoutMs = 30_000) {
  if (!/^https:\/\//iu.test(String(url || "")))
    throw new Error("FAL returned a non-HTTPS image URL.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`FAL image download failed (${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//iu.test(contentType))
      throw new Error("FAL returned a non-image response.");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 8_000_000)
      throw new Error("FAL returned an oversized image.");
    if (!response.body?.getReader)
      throw new Error("FAL image response has no readable body.");
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > 8_000_000) {
          await reader.cancel("FAL returned an oversized image.");
          throw new Error("FAL returned an oversized image.");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const data = Buffer.concat(chunks, total);
    if (!data.length) throw new Error("FAL returned an empty image.");
    return { data, contentType };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("FAL image download timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestImage({ client, model, prompt, aspectRatio, timeoutMs }) {
  const result = await withTimeout(
    client.subscribe(model, {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        num_images: 1,
        prompt_optimizer: false,
      },
      logs: false,
    }),
    timeoutMs,
  );
  const image = result?.data?.images?.[0] || result?.images?.[0];
  if (!image?.url) throw new Error("FAL returned no image URL.");
  return { url: image.url, requestId: result?.requestId || "" };
}

function existingEntry(manifest, placement, promptHash, outputDir) {
  const entry = manifest?.placements?.find(
    (candidate) => candidate.placement === placement.id && candidate.promptHash === promptHash,
  );
  if (!entry?.path || !entry.path.startsWith("/images/generated/")) return null;
  const filename = path.basename(entry.path);
  return { ...entry, filePath: path.join(outputDir, filename) };
}

function setImage(site, placement, value) {
  site.images = { ...(site.images || {}), [placement.id]: value };
}

async function generateContextualAssetsForRoute({
  site,
  inspiration,
  outputDir,
  manifestPath,
  reuseManifest,
  key = process.env.FAL_KEY,
  model = process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_MODEL,
  maxImages = Number(process.env.FAL_IMAGE_MAX_IMAGES) || DEFAULT_MAX_IMAGES,
  maxRequests = Number(process.env.FAL_IMAGE_MAX_REQUESTS) || DEFAULT_MAX_REQUESTS,
  timeoutMs = Number(process.env.FAL_IMAGE_TIMEOUT_MS) || 120_000,
  falClient = /** @type {any} */ (defaultFal),
  fetchImpl = fetch,
  force = false,
} = {}) {
  if (!site || typeof site !== "object") throw new Error("A site config is required.");
  await fs.mkdir(outputDir, { recursive: true });
  const existingManifest = reuseManifest || (manifestPath
    ? await fs
        .readFile(manifestPath, "utf8")
        .then((value) => JSON.parse(value))
        .catch(() => ({}))
    : {});
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  const route = routes[0] || {};
  const routeContract = buildRouteContract(route);
  const imageBudget = Math.min(
    DEFAULT_MAX_IMAGES,
    Math.max(0, Number(maxImages) || 0),
  );
  const placements = PLACEMENTS.filter((placement) => !clientAssetFor(site, placement));
  const manifest = {
    version: 2,
    provider: "fal.ai",
    model,
    strategy: "client-first-fill-missing-route-directed",
    routeId: routeContract.id,
    familyId: routeContract.familyId,
    routeFingerprint: routeContract.fingerprint,
    generatedAt: new Date().toISOString(),
    placements: [],
    skipped: [],
  };
  let requests = 0;
  let filled = 0;
  const canGenerate = Boolean(key && !force);
  if (canGenerate) falClient.config({ credentials: key });

  for (const placement of placements) {
    const prompt = promptFor(site, route, placement);
    const promptHash = sha256(prompt);
    const existing = existingEntry(existingManifest, placement, promptHash, outputDir);
    if (existing) {
      try {
        await fs.access(existing.filePath);
        setImage(site, placement, existing.path);
        const { filePath: _filePath, ...reusedEntry } = existing;
        manifest.placements.push({ ...reusedEntry, reused: true });
        filled += 1;
        continue;
      } catch {
        // The manifest may outlive its asset directory. Generate or fall back below.
      }
    }

    if (!canGenerate || filled >= imageBudget || requests >= maxRequests) {
      const fallback = fallbackImage(site, placement);
      if (fallback) setImage(site, placement, fallback);
      manifest.skipped.push({
        placement: placement.id,
        reason: !canGenerate
          ? "FAL_KEY-not-configured"
          : filled >= imageBudget
            ? "image-budget-exhausted"
            : "request-budget-exhausted",
        fallback,
      });
      continue;
    }

    let outcome;
    let failure = "";
    for (let attempt = 0; attempt < 2 && requests < maxRequests; attempt += 1) {
      requests += 1;
      try {
        const requested = await requestImage({
          client: falClient,
          model,
          prompt: attempt === 0 ? prompt : `${prompt} Make the subject simpler, remove all incidental text-like marks, and keep the composition clear at a small mobile crop.`,
          aspectRatio: placement.aspectRatio,
          timeoutMs,
        });
        const downloaded = await downloadImage(requested.url, fetchImpl, timeoutMs);
        const normalized = await normalizeImage(downloaded.data, placement);
        const fileName = `${placement.id}-${promptHash.slice(0, 12)}.webp`;
        const filePath = path.join(outputDir, fileName);
        await fs.writeFile(filePath, normalized.data);
        outcome = {
          placement: placement.id,
          path: pathFor(placement, promptHash),
          promptHash,
          requestId: requested.requestId,
          providerSourceUrl: requested.url,
          sha256: sha256(normalized.data),
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes,
          alt: placement.alt,
          sourceFormat: normalized.sourceFormat,
          focal: placement.focal,
          familyId: routeContract.familyId,
        };
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : "FAL image generation failed.";
      }
    }
    if (outcome) {
      filled += 1;
      setImage(site, placement, outcome.path);
      manifest.placements.push(outcome);
    } else {
      const fallback = fallbackImage(site, placement);
      if (fallback) setImage(site, placement, fallback);
      manifest.skipped.push({ placement: placement.id, reason: failure || "FAL image generation failed.", fallback });
    }
  }

  const used = Array.isArray(site.assetReport?.used) ? site.assetReport.used : [];
  const generatedPlacements = new Set(manifest.placements.map((entry) => entry.placement));
  site.assetReport = {
    used: used.filter((entry) => !generatedPlacements.has(entry.placement)),
    skipped: Array.isArray(site.assetReport?.skipped) ? [...site.assetReport.skipped] : [],
  };
  for (const entry of manifest.placements) {
    site.assetReport.used.push({
      asset: entry.path,
      placement: entry.placement,
      source: "fal-generated",
      provider: "fal.ai",
      model,
      license: "fal.ai provider terms; verify current terms before production",
      subject: entry.alt,
      promptHash: entry.promptHash,
      requestId: entry.requestId,
      sha256: entry.sha256,
      generatedAt: manifest.generatedAt,
      width: entry.width,
      height: entry.height,
    });
  }
  for (const skipped of manifest.skipped) {
    site.assetReport.skipped.push({
      asset: skipped.placement,
      reason: skipped.fallback ? `${skipped.reason}; fallback selected` : skipped.reason,
    });
  }
  if (manifestPath) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { site, manifest, requests };
}

export async function generateContextualAssets(options = {}) {
  const site = options.site;
  if (!site || typeof site !== "object")
    throw new Error("A site config is required.");
  const routes = Array.isArray(options.inspiration?.routes)
    ? options.inspiration.routes
    : [];
  if (routes.length <= 1)
    return generateContextualAssetsForRoute(options);

  const requestBudget = Number(
    options.maxRequests ??
      process.env.FAL_IMAGE_MAX_REQUESTS ??
      DEFAULT_MAX_REQUESTS,
  );
  const imageBudget = Math.min(
    DEFAULT_MAX_IMAGES,
    Math.max(
      0,
      Number(
        options.maxImages ??
          process.env.FAL_IMAGE_MAX_IMAGES ??
          DEFAULT_MAX_IMAGES,
      ) || 0,
    ),
  );
  const existingManifest = options.manifestPath
    ? await fs
        .readFile(options.manifestPath, "utf8")
        .then((value) => JSON.parse(value))
        .catch(() => ({}))
    : {};
  let remainingRequests = Math.max(0, requestBudget);
  let remainingImages = imageBudget;
  let totalRequests = 0;
  const routeManifests = [];
  const creativeAssets = {};
  let firstRouteSite;

  for (const [index, route] of routes.entries()) {
    const remainingRoutes = routes.length - index;
    const routeRequestBudget = Math.max(
      0,
      Math.ceil(remainingRequests / remainingRoutes),
    );
    const routeImageBudget = Math.max(
      0,
      Math.ceil(remainingImages / remainingRoutes),
    );
    const routeSite = structuredClone(site);
    const result = await generateContextualAssetsForRoute({
      ...options,
      site: routeSite,
      inspiration: { ...(options.inspiration || {}), routes: [route] },
      manifestPath: undefined,
      reuseManifest: existingManifest.routes?.find(
        (manifest) => manifest.routeId === route.id,
      ),
      maxImages: routeImageBudget,
      maxRequests: routeRequestBudget,
    });
    const newlyGenerated = result.manifest.placements.filter(
      (entry) => !entry.reused,
    ).length;
    totalRequests += result.requests;
    remainingRequests = Math.max(0, remainingRequests - result.requests);
    remainingImages = Math.max(0, remainingImages - newlyGenerated);
    routeManifests.push(result.manifest);
    if (!firstRouteSite) firstRouteSite = result.site;
    creativeAssets[route.id] = {
      hero:
        site.assets?.photoOne ||
        result.site.images?.hero ||
        site.images?.hero ||
        "",
      secondary:
        site.assets?.photoTwo ||
        result.site.images?.secondary ||
        site.images?.secondary ||
        "",
      tertiary:
        site.assets?.photoThree ||
        result.site.images?.tertiary ||
        site.images?.tertiary ||
        "",
      familyId: result.manifest.familyId,
      routeFingerprint: result.manifest.routeFingerprint,
    };
  }

  if (firstRouteSite?.images)
    site.images = { ...(site.images || {}), ...firstRouteSite.images };
  site.creativeAssets = creativeAssets;

  const existingUsed = Array.isArray(site.assetReport?.used)
    ? site.assetReport.used.filter((entry) => entry.source !== "fal-generated")
    : [];
  const existingSkipped = Array.isArray(site.assetReport?.skipped)
    ? [...site.assetReport.skipped]
    : [];
  site.assetReport = { used: existingUsed, skipped: existingSkipped };

  const placements = [];
  const skipped = [];
  for (const manifest of routeManifests) {
    for (const entry of manifest.placements || []) {
      placements.push({ ...entry, routeId: manifest.routeId });
      site.assetReport.used.push({
        asset: entry.path,
        placement: entry.placement,
        routeId: manifest.routeId,
        familyId: manifest.familyId,
        source: "fal-generated",
        provider: "fal.ai",
        model: manifest.model,
        license: "fal.ai provider terms; verify current terms before production",
        subject: entry.alt,
        promptHash: entry.promptHash,
        requestId: entry.requestId,
        sha256: entry.sha256,
        generatedAt: manifest.generatedAt,
        width: entry.width,
        height: entry.height,
      });
    }
    for (const entry of manifest.skipped || []) {
      skipped.push({ ...entry, routeId: manifest.routeId });
      site.assetReport.skipped.push({
        asset: entry.placement,
        routeId: manifest.routeId,
        reason: entry.fallback
          ? `${entry.reason}; fallback selected`
          : entry.reason,
      });
    }
  }

  const manifest = {
    version: 3,
    provider: "fal.ai",
    model:
      options.model ||
      process.env.FAL_IMAGE_MODEL ||
      DEFAULT_FAL_MODEL,
    strategy: "client-first-per-route-reference-directed",
    generatedAt: new Date().toISOString(),
    routes: routeManifests,
    placements,
    skipped,
  };
  if (options.manifestPath) {
    await fs.mkdir(path.dirname(options.manifestPath), { recursive: true });
    await fs.writeFile(
      options.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  return { site, manifest, requests: totalRequests };
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.config || !args.output) throw new Error("--config and --output are required.");
  const site = JSON.parse(await fs.readFile(args.config, "utf8"));
  const inspiration = args.inspiration
    ? JSON.parse(await fs.readFile(args.inspiration, "utf8"))
    : undefined;
  const result = await generateContextualAssets({
    site,
    inspiration,
    outputDir: args.output,
    manifestPath: args.manifest || path.join(args.output, "generated-assets.json"),
    force: args["dry-run"] === "true",
  });
  await fs.writeFile(args.config, `${JSON.stringify(result.site, null, 2)}\n`);
  console.log(
    JSON.stringify({
      generated: result.manifest.placements.length,
      skipped: result.manifest.skipped.length,
      requests: result.requests,
      placements: result.manifest.placements.map((entry) => entry.placement),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
