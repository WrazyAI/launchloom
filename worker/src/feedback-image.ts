import type { FeedbackAttachmentTarget } from "./feedback-structure";

export const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/minimax/image-01";

export type FeedbackImagePlacement = {
  aspectRatio: string;
  label: string;
};

export const FEEDBACK_IMAGE_PLACEMENTS: Record<
  FeedbackAttachmentTarget,
  FeedbackImagePlacement
> = {
  logo: { aspectRatio: "1:1", label: "logo or brand mark" },
  hero: { aspectRatio: "16:9", label: "hero image" },
  secondary: { aspectRatio: "4:3", label: "about or story image" },
  tertiary: { aspectRatio: "3:2", label: "gallery image" },
  team: { aspectRatio: "4:3", label: "team photo" },
};

const PRIVATE_FIELD =
  /(?:phone|email|address|street|contact|password|token|secret|url|https?:\/\/|\+?\d[\d\s().-]{6,}\d)/iu;

export function feedbackImageRequestIsSafe(value: unknown) {
  return !PRIVATE_FIELD.test(String(value || ""));
}

function promptText(value: unknown, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function safeList(value: unknown, limit = 6, itemLimit = 80) {
  return (Array.isArray(value) ? value : [])
    .map((item) => promptText(item, itemLimit))
    .filter((item) => item && !PRIVATE_FIELD.test(item))
    .slice(0, limit);
}

export function buildFeedbackImagePrompt({
  site,
  target,
  request,
}: {
  site: Record<string, unknown>;
  target: FeedbackAttachmentTarget;
  request: string;
}) {
  const placement = FEEDBACK_IMAGE_PLACEMENTS[target];
  const business = (site.business || {}) as Record<string, unknown>;
  const style = (site.style || {}) as Record<string, unknown>;
  const businessName = promptText(business.name, 120);
  const businessKind = promptText(
    site.businessKind || business.kind || site.industry,
    80,
  );
  const services = safeList(
    (Array.isArray(site.services) ? site.services : []).map(
      (service) => (service as Record<string, unknown>)?.name,
    ),
  );
  const areas = safeList(business.serviceAreas, 3, 60);
  const visualDirection = promptText(
    [style.visualDirection, style.preference, style.tone]
      .map((value) => promptText(value, 120))
      .filter(Boolean)
      .join(", "),
    200,
  );
  const description =
    target === "logo"
      ? `Create a clean, professional logo or brand mark for ${businessName || "a local business"}${businessKind ? ` (${businessKind})` : ""}. ${promptText(request, 500)}`
      : `Create a ${placement.label} for ${businessName || "a local business"}${businessKind ? `, a ${businessKind} business` : ""}${areas.length ? ` serving ${areas.join(", ")}` : ""}. ${promptText(request, 500)}`;
  const context = [
    services.length ? `Services: ${services.join(", ")}.` : "",
    visualDirection ? `Visual direction: ${visualDirection}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const constraints =
    target === "logo"
      ? "Flat vector-style mark on a plain background, centered with generous margins. No readable text unless it is part of a mark, no photographic people, no mockups, no watermarks."
      : "Photorealistic or tasteful editorial photography as requested. No readable text, no logos, no watermarks, no identifiable people presented as staff or customers, no invented storefronts or signage.";
  return promptText(
    [description, context, constraints].filter(Boolean).join(" "),
    1_500,
  );
}

export async function requestFalImage({
  key,
  model,
  prompt,
  aspectRatio,
  timeoutMs = 60_000,
  fetchImpl = fetch,
}: {
  key: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`https://fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        num_images: 1,
        prompt_optimizer: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted)
      throw new Error("Image generation timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok)
    throw new Error(`Image generation failed (${response.status}).`);
  const payload = (await response.json()) as {
    images?: Array<{ url?: string }>;
    request_id?: string;
  };
  const url = payload.images?.[0]?.url;
  if (!url || !/^https:\/\//u.test(url))
    throw new Error("Image generation returned no usable image.");
  return { url, requestId: promptText(payload.request_id, 80) };
}

export async function downloadFalImage(
  url: string,
  {
    fetchImpl = fetch,
    timeoutMs = 30_000,
    maxBytes = 8_000_000,
  }: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
) {
  if (!/^https:\/\//u.test(String(url || "")))
    throw new Error("Image provider returned a non-HTTPS URL.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok)
      throw new Error(`Image download failed (${response.status}).`);
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!/^image\//u.test(contentType))
      throw new Error("Image provider returned a non-image response.");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes)
      throw new Error("Generated image is too large.");
    const data = await response.arrayBuffer();
    if (!data.byteLength) throw new Error("Generated image is empty.");
    if (data.byteLength > maxBytes)
      throw new Error("Generated image is too large.");
    const extension =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : contentType === "image/avif"
            ? "avif"
            : "jpg";
    return { data, contentType, extension };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("Image download timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
