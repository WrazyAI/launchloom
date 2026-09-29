export const FEEDBACK_ATTACHMENT_TARGETS = [
  "logo",
  "hero",
  "secondary",
  "tertiary",
  "team",
] as const;
export type FeedbackAttachmentTarget =
  (typeof FEEDBACK_ATTACHMENT_TARGETS)[number];

export const FEEDBACK_COLOR_ROLES = [
  "primary",
  "surface",
  "hero",
  "ink",
  "muted",
  "line",
] as const;
export type FeedbackColorRole = (typeof FEEDBACK_COLOR_ROLES)[number];

export const MAX_FEEDBACK_ATTACHMENTS = 4;
export const MAX_FEEDBACK_COLORS = 6;
export const MAX_FEEDBACK_PROMPT = 500;
export const MAX_FEEDBACK_ATTACHMENT_URL = 600;

export type FeedbackAttachment = {
  target: FeedbackAttachmentTarget;
  kind: "upload" | "generated";
  url: string;
  prompt?: string;
  model?: string;
};

export type FeedbackColor = {
  role: FeedbackColorRole;
  hex: string;
};

export type FeedbackStructure = {
  attachments: FeedbackAttachment[];
  colors: FeedbackColor[];
};

export const EMPTY_FEEDBACK_STRUCTURE: FeedbackStructure = {
  attachments: [],
  colors: [],
};

const ATTACHMENT_LABELS: Record<FeedbackAttachmentTarget, string> = {
  logo: "logo",
  hero: "hero image",
  secondary: "about or story image",
  tertiary: "gallery image",
  team: "team photo",
};

const COLOR_LABELS: Record<FeedbackColorRole, string> = {
  primary: "brand or accent color",
  surface: "page background",
  hero: "hero surface color",
  ink: "body text color",
  muted: "muted text color",
  line: "divider and line color",
};

function clean(value: unknown, limit = 200) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

function isTarget(value: unknown): value is FeedbackAttachmentTarget {
  return FEEDBACK_ATTACHMENT_TARGETS.includes(
    value as FeedbackAttachmentTarget,
  );
}

function isColorRole(value: unknown): value is FeedbackColorRole {
  return FEEDBACK_COLOR_ROLES.includes(value as FeedbackColorRole);
}

export function sanitizeFeedbackStructure(
  raw: unknown,
  assetBaseUrl: string,
):
  | { ok: true; structure: FeedbackStructure }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null)
    return { ok: true, structure: EMPTY_FEEDBACK_STRUCTURE };
  if (typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "Invalid feedback details." };
  const record = raw as Record<string, unknown>;
  const base = String(assetBaseUrl || "")
    .replace(/\/$/, "");
  const uploadPrefix = `${base}/feedback/`;
  const draftPrefix = `${base}/feedback-drafts/`;
  if (!base || !/^https:\/\//u.test(base))
    return { ok: false, error: "Image storage is not configured." };

  const attachments: FeedbackAttachment[] = [];
  const seenTargets = new Set<FeedbackAttachmentTarget>();
  const rawAttachments = Array.isArray(record.attachments)
    ? record.attachments
    : [];
  if (rawAttachments.length > MAX_FEEDBACK_ATTACHMENTS)
    return {
      ok: false,
      error: `Attach at most ${MAX_FEEDBACK_ATTACHMENTS} images.`,
    };
  for (const entry of rawAttachments) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return { ok: false, error: "Invalid image attachment." };
    const item = entry as Record<string, unknown>;
    const target = item.target;
    if (!isTarget(target) || seenTargets.has(target))
      return { ok: false, error: "Invalid image attachment target." };
    const kind = item.kind === "generated" ? "generated" : "upload";
    const url = clean(item.url, MAX_FEEDBACK_ATTACHMENT_URL);
    const expectedPrefix = kind === "generated" ? draftPrefix : uploadPrefix;
    if (!url.startsWith(expectedPrefix) || url.length <= expectedPrefix.length)
      return { ok: false, error: "Invalid image attachment URL." };
    const prompt =
      kind === "generated" ? clean(item.prompt, MAX_FEEDBACK_PROMPT) : "";
    if (kind === "generated" && !prompt)
      return {
        ok: false,
        error: "Describe the image you want generated.",
      };
    const model = kind === "generated" ? clean(item.model, 80) : "";
    seenTargets.add(target);
    attachments.push({
      target,
      kind,
      url,
      ...(prompt ? { prompt } : {}),
      ...(model ? { model } : {}),
    });
  }

  const colors: FeedbackColor[] = [];
  const seenRoles = new Set<FeedbackColorRole>();
  const rawColors = Array.isArray(record.colors) ? record.colors : [];
  if (rawColors.length > MAX_FEEDBACK_COLORS)
    return {
      ok: false,
      error: `Choose at most ${MAX_FEEDBACK_COLORS} colors.`,
    };
  for (const entry of rawColors) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return { ok: false, error: "Invalid color choice." };
    const item = entry as Record<string, unknown>;
    const role = item.role;
    const hex = clean(item.hex, 7).toLowerCase();
    if (!isColorRole(role) || seenRoles.has(role) || !/^#[0-9a-f]{6}$/u.test(hex))
      return { ok: false, error: "Invalid color choice." };
    seenRoles.add(role);
    colors.push({ role, hex });
  }

  return { ok: true, structure: { attachments, colors } };
}

export function parseFeedbackStructure(value: unknown): FeedbackStructure {
  if (typeof value !== "string" || !value.trim())
    return EMPTY_FEEDBACK_STRUCTURE;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return EMPTY_FEEDBACK_STRUCTURE;
    const attachments = (Array.isArray(parsed.attachments)
      ? parsed.attachments
      : []
    )
      .slice(0, MAX_FEEDBACK_ATTACHMENTS)
      .flatMap((entry): FeedbackAttachment[] => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        if (!isTarget(item.target)) return [];
        const url = clean(item.url, MAX_FEEDBACK_ATTACHMENT_URL);
        if (!url) return [];
        const kind = item.kind === "generated" ? "generated" : "upload";
        const prompt =
          kind === "generated" ? clean(item.prompt, MAX_FEEDBACK_PROMPT) : "";
        const model = kind === "generated" ? clean(item.model, 80) : "";
        return [
          {
            target: item.target,
            kind,
            url,
            ...(prompt ? { prompt } : {}),
            ...(model ? { model } : {}),
          },
        ];
      });
    const colors = (Array.isArray(parsed.colors) ? parsed.colors : [])
      .slice(0, MAX_FEEDBACK_COLORS)
      .flatMap((entry): FeedbackColor[] => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        const hex = clean(item.hex, 7).toLowerCase();
        if (!isColorRole(item.role) || !/^#[0-9a-f]{6}$/u.test(hex)) return [];
        return [{ role: item.role, hex }];
      });
    return { attachments, colors };
  } catch {
    return EMPTY_FEEDBACK_STRUCTURE;
  }
}

export function feedbackStructureIsEmpty(structure: FeedbackStructure) {
  return !structure.attachments.length && !structure.colors.length;
}

export function feedbackStructureSummary(
  structure: FeedbackStructure,
): string[] {
  const lines = structure.attachments.map((attachment) => {
    const label = ATTACHMENT_LABELS[attachment.target];
    if (attachment.kind === "upload")
      return `- Replace the ${label} with the uploaded image.`;
    return `- Replace the ${label} with a generated image: "${attachment.prompt}".`;
  });
  const colors = structure.colors.map(
    (color) => `${COLOR_LABELS[color.role]} ${color.hex}`,
  );
  if (colors.length)
    lines.push(`- Set ${colors.join(", ")}.`);
  return lines;
}

export function encodeFeedbackStructureMarker(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}
