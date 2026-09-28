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

function configuredNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PLACEMENTS = [
  {
    id: "hero",
    clientSlots: ["photoOne"],
    aspectRatio: "16:9",
    maxWidth: 1600,
    alt: "featured service context",
    focal: "Keep the main subject in a central crop-safe zone with uncluttered surroundings.",
  },
  {
    id: "secondary",
    clientSlots: ["photoTwo", "photoThree", "teamPhoto"],
    aspectRatio: "4:3",
    maxWidth: 1200,
    alt: "supporting service context",
    focal: "Keep the subject legible in a 4:3 crop and avoid tiny text-like details.",
  },
  {
    id: "tertiary",
    clientSlots: ["photoThree"],
    aspectRatio: "3:2",
    maxWidth: 1200,
    alt: "detail of the service experience",
    focal: "Use a tactile close crop with one clear subject at mobile width.",
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

function clientAssetPath(site, placement) {
  const slot = clientAssetFor(site, placement);
  return slot ? site.assets?.[slot] || "" : "";
}

function promptFor(site, route, placement) {
  const services = list((site.services || []).map((service) => service?.name));
  const dna = route?.referenceDna || {};
  const familyImageDirection = {
    "kokoro-editorial-architecture": "warm architectural interiors and tactile natural materials photographed as a quiet standalone scene",
    "skyelite-cinematic-luxury": "premium transport materials, soft horizon light, and restrained cinematic atmosphere in one standalone scene",
    "health-portal-masked-mosaic": "calm clinical materials, clean neutral surfaces, and simple forms that remain clear under close cropping",
    "3d-portfolio-object-led": "one sculptural service-relevant object with realistic materials and controlled studio lighting",
    "veyra-kinetic-typography": "high-energy sports equipment, surfaces, and environment with directional physical movement and no people",
    "digital-experiences-liquid-glass": "abstract atmospheric fields, liquid light, depth, and translucent physical materials",
    "vortex-editorial-studio": "expressive but credible studio materials and authored project details, photographed as an isolated scene",
    "neighborhood-table-collage": "warm food-market still life with tactile ingredients, local table energy, and crop-safe product groupings",
    "hvac-symptom-first-choice-grid": "equipment-only residential HVAC photography: a furnace, condenser, or diagnostic detail with no worker or person",
    "hvac-mountain-photo-plus-diagnostic-promise": "heating and cooling equipment alone at an ordinary home, without people, resort cues, or aspirational lifestyle staging",
    "hvac-local-aerial-hero": "an anonymous residential roofline and HVAC equipment only, with no people, specific address, or map",
    "hvac-three-part-contact-ribbon": "one standalone residential HVAC equipment subject, no worker, face, tools in hand, text, or logo",
    "hvac-dense-phone-first-header": "a close residential HVAC equipment detail only, no person, face, or handheld tool",
    "hvac-equipment-montage-opening": "one coherent close view of HVAC equipment only, no workers or people, without graphic overlays or a montage",
    "web-auto-repair-abees-hi-tech-family": "an unbranded brake rotor, socket set and plain workbench arranged as an automotive still life",
    "web-auto-repair-ade-auto-repairs-family": "an isolated automotive brake rotor and clean repair tool arranged as a mechanical still life",
    "web-auto-repair-fallsbrook-motors-family": "a yellow mechanical torque wrench and wheel nuts arranged as an automotive still life",
    "web-auto-repair-michael-auto-family": "an unbranded engine component and diagnostic tool arranged as a dark technical still life",
    "web-auto-repair-reliance-autos-family": "a small green automotive sensor and unbranded metal parts arranged as a clean still life",
    "web-auto-repair-urban-autocare-family": "an unbranded wheel hub and mechanical parts arranged on a graphite workshop surface",
    "web-painting-av": "wide, recognizable residential facade with freshly painted siding and trim, framed to show the home rather than an isolated surface",
    "web-painting-concept-pro": "a dark painted exterior detail on an empty, unbranded home with no visible people",
    "web-painting-house-doctor": "a paint-preparation surface study showing a primed wall and a fresh paint edge, without people",
    "web-painting-mfl": "a coastal home exterior with carefully painted trim and no people or addresses",
    "web-painting-novak": "an ivory interior wall and layered paint-surface study in an empty room",
    "web-painting-southern": "a bright, empty room with a freshly painted wall and restrained color contrast",
  };
  const familyAssetBriefs = {
    "kokoro-editorial-architecture": {
      medium: "photorealistic architectural editorial photography",
      hero: "Photograph one warm architectural interior with tactile materials, natural light, and a clear spatial focal point.",
      secondary: "Photograph one interior detail with wood, stone, or daylight and quiet editorial restraint.",
      tertiary: "Photograph one architectural material study as a clean still life.",
    },
    "skyelite-cinematic-luxury": {
      medium: "cinematic premium transport photography",
      hero: "Photograph one premium transport subject against a quiet horizon with believable movement and refined light.",
      secondary: "Photograph one destination or transport detail with directional movement and broad tonal gradients.",
      tertiary: "Photograph one premium material or travel detail as a cinematic still.",
    },
    "health-portal-masked-mosaic": {
      medium: "clean modular clinical photography",
      hero: "Photograph one calm clinical or wellness environment with clean neutral materials and a clear focal subject.",
      secondary: "Photograph one second clinical detail with simple forms that tolerate varied crops.",
      tertiary: "Photograph one precise material, tool, or environment detail.",
    },
    "3d-portfolio-object-led": {
      medium: "studio object render with realistic materials",
      hero: "Render one sculptural service-relevant object with realistic materials, depth, and controlled studio light.",
      secondary: "Render one second object with distinct silhouette and consistent materials.",
      tertiary: "Render one close object or material detail with controlled studio depth.",
    },
    "veyra-kinetic-typography": {
      medium: "high-energy sports environment and equipment photography",
      hero: "Photograph one dynamic sports environment with directional light and motion implied by equipment or terrain, no people.",
      secondary: "Photograph one performance-space detail with physical movement cues and grounded material detail, no people.",
      tertiary: "Photograph one tight equipment or surface detail with graphic contrast, no people.",
    },
    "digital-experiences-liquid-glass": {
      medium: "abstract spatial light composition",
      hero: "Create one abstract atmospheric image with liquid light, depth, refraction, and translucent physical materials.",
      secondary: "Create one layered translucent material study with controlled blur and depth.",
      tertiary: "Create one close abstract study of light and material.",
    },
    "vortex-editorial-studio": {
      medium: "editorial project photography",
      hero: "Photograph one authored project detail with restrained color and credible materials.",
      secondary: "Photograph one wide project scene with a distinct subject and calm contrast.",
      tertiary: "Photograph one close project or material detail with editorial restraint.",
    },
    "neighborhood-table-collage": {
      medium: "warm editorial food and market still-life photography",
      hero: "Photograph one warm neighborhood food still life with bread, pastry, produce, and tactile table materials.",
      secondary: "Photograph one pastry shelf or market-counter detail with a natural repeated product rhythm.",
      tertiary: "Photograph one close detail of bread, herbs, paper, or serving materials.",
    },
    "hvac-symptom-first-choice-grid": {
      medium: "documentary residential HVAC service photography",
      hero: "Photograph one outdoor condenser unit beside an ordinary home. Show equipment only, with no worker, person, face, hand, tool in hand, or label.",
      secondary: "Create a close, tidy furnace or air-handler diagnostic scene with practical tools and no people, readable labels, or branded controls.",
      tertiary: "Create a crop-safe heat-pump or vent detail with realistic materials, natural light, and a concise visual subject.",
    },
    "hvac-mountain-photo-plus-diagnostic-promise": {
      medium: "grounded residential HVAC equipment photography",
      hero: "Photograph one technically credible furnace or condenser at an ordinary home, equipment only. No worker, person, face, or resort staging.",
      secondary: "Create a close furnace-service detail with safe, orderly diagnostic tools and clear equipment geometry.",
      tertiary: "Create a heat-pump or thermostat-adjacent material detail without readable controls or implied product brands.",
    },
    "hvac-local-aerial-hero": {
      medium: "residential HVAC service and neighborhood-context photography",
      hero: "Photograph an anonymous residential roofline with visible heating or cooling equipment only. No people, worker, or specific address.",
      secondary: "Create a residential condenser or furnace scene with crop-safe equipment and no identifiable residents.",
      tertiary: "Create a simple, tactile equipment detail suited to a short service-routing section.",
    },
    "hvac-three-part-contact-ribbon": {
      medium: "coordinated documentary HVAC service photography",
      hero: "Photograph one residential HVAC equipment unit alone, with crisp edges and balanced natural light. No worker or person.",
      secondary: "Create a matching furnace or air-handler scene with the same restrained contrast and a distinct diagnostic subject.",
      tertiary: "Create a matching outdoor heat-pump detail that completes the set without turning it into product advertising.",
    },
    "hvac-dense-phone-first-header": {
      medium: "compact-crop HVAC equipment photography",
      hero: "Photograph one tightly framed residential HVAC equipment detail only, with a simple silhouette and no person.",
      secondary: "Create a narrow-crop furnace diagnostic detail with clear silhouette and no fine text.",
      tertiary: "Create a compact condenser or heat-pump material detail with a strong central subject.",
    },
    "hvac-equipment-montage-opening": {
      medium: "residential HVAC equipment photography",
      hero: "Photograph one coherent close view of furnace, condenser, or heat-pump equipment only, with natural light and neutral materials. No person or worker.",
      secondary: "Create a closer equipment view with clean composition and no logos or readable labels.",
      tertiary: "Create a quiet filter, vent, or heat-pump material detail to complete the montage rhythm.",
    },
    "web-auto-repair-abees-hi-tech-family": {
      medium: "restrained automotive parts and tool still-life photography",
      hero: "Photograph a brake rotor, socket set and workbench as an unbranded automotive still life; no repair bay, people, hands, or body parts.",
      secondary: "Photograph a tidy automotive tool-and-parts still life on a workbench, with no people or readable labels.",
      tertiary: "Photograph one close mechanical detail with clean edges and no person or branding.",
    },
    "web-auto-repair-ade-auto-repairs-family": {
      medium: "precise mechanical-part still-life photography",
      hero: "Photograph an isolated brake rotor and one clean repair tool as a precise mechanical still life, with no people, hands, or body parts.",
      secondary: "Photograph a small arrangement of unbranded vehicle components on a neutral workshop surface, with no people.",
      tertiary: "Photograph a close detail of a brake component with no labels, hands, or people.",
    },
    "web-auto-repair-fallsbrook-motors-family": {
      medium: "bright automotive diagnostic-tool still-life photography",
      hero: "Photograph a yellow torque wrench and wheel nuts on a neutral workbench as a mechanical still life; no screens, electronics, text, people, hands, or body parts.",
      secondary: "Photograph an empty service bay with a distinct vehicle silhouette and one restrained yellow equipment accent, with no people.",
      tertiary: "Photograph a close, unbranded tool or vehicle detail with no visible person.",
    },
    "web-auto-repair-michael-auto-family": {
      medium: "high-contrast automotive diagnostic still-life photography",
      hero: "Photograph a diagnostic tool and unbranded engine component on a dark workbench, with no people, hands, or body parts.",
      secondary: "Photograph dark, unbranded engine parts and one diagnostic tool on a workbench, without people.",
      tertiary: "Photograph a close mechanical detail in directional light with no human presence or logos.",
    },
    "web-auto-repair-reliance-autos-family": {
      medium: "calm automotive sensor and part still-life photography",
      hero: "Photograph a small green automotive sensor and unbranded metal parts on a clean workbench; no people, hands, or body parts.",
      secondary: "Photograph a clean vehicle component and diagnostic tool on an empty workbench, with no people or branding.",
      tertiary: "Photograph one mechanical material detail with neutral light and no human presence.",
    },
    "web-auto-repair-urban-autocare-family": {
      medium: "graphic automotive component still-life photography",
      hero: "Photograph an unbranded wheel hub and metal parts on a graphite workshop surface, with no people, hands, or body parts.",
      secondary: "Photograph a close arrangement of unbranded automotive components against a dark workbench, no people or signage.",
      tertiary: "Photograph one unbranded automotive component against a dark workshop surface, without people.",
    },
    "web-painting-av": {
      medium: "wide contextual residential exterior photography",
      hero: "Photograph a wide landscape view of a recognizable finished home exterior with freshly painted siding and trim, including the full facade and surrounding context. Avoid an extreme close-up; no people, tools, house numbers, signage, or logos.",
      secondary: "Photograph a distinct painted room or exterior project view that preserves the recognizable home context without people or addresses.",
      tertiary: "Photograph a restrained paint-and-wood surface detail with no labels or people.",
    },
    "web-painting-concept-pro": {
      medium: "dark architectural painting photography",
      hero: "Photograph a dark painted exterior detail on an empty, unbranded home, with no people, signage, or house numbers.",
      secondary: "Photograph a dark interior wall and painted trim detail with one quiet reflected highlight; no people or text.",
      tertiary: "Photograph a close dark paint-finish material detail without labels or logos.",
    },
    "web-painting-house-doctor": {
      medium: "editorial paint-preparation and surface photography",
      hero: "Photograph a paint-preparation surface study: a primed wall meeting a fresh paint edge in an empty room, no people, hands, or text.",
      secondary: "Photograph an unbranded preparation tool and clean wall surface as a still life, with no people or labels.",
      tertiary: "Photograph a close paint-layer and wall texture detail without signs, text, or people.",
    },
    "web-painting-mfl": {
      medium: "coastal residential exterior painting photography",
      hero: "Photograph a coastal home exterior with carefully painted trim and no people, addresses, or signage.",
      secondary: "Photograph a close, crop-safe painted siding and trim detail in soft coastal daylight.",
      tertiary: "Photograph a neutral paint finish and weathered wood material study without labels.",
    },
    "web-painting-novak": {
      medium: "quiet interior finish and paint-layer photography",
      hero: "Photograph an ivory interior wall and layered paint-surface study in an empty room, no people or text.",
      secondary: "Photograph a plain interior corner with painted trim and natural light, without furniture branding or people.",
      tertiary: "Photograph an unmarked paint swatch and wall-material still life without words or people.",
    },
    "web-painting-southern": {
      medium: "bright residential interior painting photography",
      hero: "Photograph a bright, empty room with a freshly painted wall and restrained color contrast; no people or signage.",
      secondary: "Photograph a clean painted room corner with natural light and no identifiable home address or people.",
      tertiary: "Photograph a close, unbranded paint finish and trim detail without words or people.",
    },
  };
  const familyBrief =
    familyAssetBriefs[dna.familyId] || {
      medium: "commercial editorial photography",
      hero: "Create one distinctive standalone image whose subject and crop fit the assigned image treatment.",
      secondary: "Create one supporting image subject that fits the assigned image treatment.",
      tertiary: "Create one tactile image detail that fits the assigned image treatment.",
  };
  const subject = services.length
    ? safePromptPart(services.join(", "), 200)
    : safePromptPart(site.businessKind || site.industry || "local service", 100) || "local service";
  const routeImageTreatment = [
    safePromptPart(dna.imageTreatment?.mode, 200),
    safePromptPart(dna.imageTreatment?.crop, 160),
  ]
    .filter(Boolean)
    .join("; ");
  const imageDirection = [
    safePromptPart(familyImageDirection[dna.familyId], 180),
    routeImageTreatment,
    safePromptPart(dna.palette?.contrastIntent, 80),
  ]
    .filter(Boolean)
    .join("; ") || "Use a distinct image medium and a simple, credible crop.";
  const placementBrief =
    placement.id === "hero"
      ? familyBrief.hero
      : placement.id === "secondary"
        ? familyBrief.secondary
        : familyBrief.tertiary;
  const prompt = [
    "Create exactly one standalone image asset: one physical scene, object, or clean illustration, never a website screenshot, web page, UI mockup, poster, advertisement, or interface.",
    "Hard exclusions: no words, letters, pseudo-text, numbers, logos, watermarks, signage, labels, screens, menus, cards, buttons, forms, device frames, certificates, or branded products. No people, faces, hands, body parts, human reflections or silhouettes. Do not imply an actual employee or customer.",
    `Image medium: ${familyBrief.medium}.`,
    `Image subject: ${placementBrief}.`,
    `Use believable materials, realistic details, and a clean crop suitable for ${placement.id} placement. ${placement.focal}`,
    `Business context for subject selection only: ${subject}. Never render the supplied business or service names.`,
    `Reference image treatment: ${imageDirection}.`,
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
  maxRequests = configuredNumber(
    process.env.FAL_IMAGE_MAX_REQUESTS,
    DEFAULT_MAX_REQUESTS,
  ),
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

    if (filled >= imageBudget) {
      const fallback = fallbackImage(site, placement);
      if (fallback) setImage(site, placement, fallback);
      manifest.skipped.push({
        placement: placement.id,
        reason: "image-budget-exhausted",
        fallback,
      });
      continue;
    }

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

    if (!canGenerate || requests >= maxRequests) {
      const fallback = fallbackImage(site, placement);
      if (fallback) setImage(site, placement, fallback);
      manifest.skipped.push({
        placement: placement.id,
        reason: !canGenerate
          ? "FAL_KEY-not-configured"
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

  const requestBudget = configuredNumber(
    options.maxRequests ?? process.env.FAL_IMAGE_MAX_REQUESTS,
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
    const retainedRouteImages = result.manifest.placements.length;
    totalRequests += result.requests;
    remainingRequests = Math.max(0, remainingRequests - result.requests);
    remainingImages = Math.max(0, remainingImages - retainedRouteImages);
    routeManifests.push(result.manifest);
    if (!firstRouteSite) firstRouteSite = result.site;
    creativeAssets[route.id] = {
      hero:
        clientAssetPath(site, PLACEMENTS[0]) ||
        result.site.images?.hero ||
        site.images?.hero ||
        "",
      secondary:
        clientAssetPath(site, PLACEMENTS[1]) ||
        result.site.images?.secondary ||
        site.images?.secondary ||
        "",
      tertiary:
        clientAssetPath(site, PLACEMENTS[2]) ||
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
