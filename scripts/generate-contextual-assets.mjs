import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fal as defaultFal } from "@fal-ai/client";
import sharp from "sharp";
import { buildRouteContract } from "./creative-compiler.mjs";

export const DEFAULT_FAL_MODEL = "fal-ai/minimax/image-01";
export const DEFAULT_MAX_IMAGES = 3;
export const DEFAULT_MAX_REQUESTS = 4;
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
  const directionContext = direction ? `Visual direction: ${direction}.` : "";
  const placementBrief =
    placement.id === "hero"
      ? "Create a wide editorial hero image with a clear subject and calm negative space for website copy."
      : placement.id === "secondary"
        ? "Create a supporting scene that shows the service environment, materials, tools, or setting in use."
        : "Create a tactile detail image that adds a second visual rhythm to the page: material, texture, process, or a meaningful object."
  const prompt = [
    "Use case: photorealistic-natural.",
    `Asset type: ${placement.id} image for a local-business website.`,
    `Primary request: ${placementBrief}.`,
    `Business context: ${subject}.`,
    areaContext,
    routeContext,
    directionContext,
    vocabularyContext,
    problemContext,
    "Style: distinctive editorial art direction, believable materials, natural light, restrained composition, and a polished commercial website photograph.",
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

export async function generateContextualAssets({
  site,
  inspiration,
  outputDir,
  manifestPath,
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
  const existingManifest = manifestPath
    ? await fs
        .readFile(manifestPath, "utf8")
        .then((value) => JSON.parse(value))
        .catch(() => ({}))
    : {};
  const routes = Array.isArray(inspiration?.routes) ? inspiration.routes : [];
  const route = routes[0] || {};
  const routeContract = buildRouteContract(route);
  const placements = PLACEMENTS.filter((placement) => !clientAssetFor(site, placement)).slice(0, maxImages);
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
        continue;
      } catch {
        // The manifest may outlive its asset directory. Generate or fall back below.
      }
    }

    if (!canGenerate || requests >= maxRequests) {
      const fallback = fallbackImage(site, placement);
      if (fallback) setImage(site, placement, fallback);
      manifest.skipped.push({
        placement: placement.id,
        reason: canGenerate ? "request-budget-exhausted" : "FAL_KEY-not-configured",
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
