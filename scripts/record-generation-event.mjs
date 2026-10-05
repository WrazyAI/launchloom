import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_API_URL = "https://api.launchloom.wrazyos.com";
const MAX_HERO_BYTES = 1_800_000;

function argsFrom(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) continue;
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[value.replace(/^--/u, "")] = "true";
      continue;
    }
    result[value.replace(/^--/u, "")] = next;
    index += 1;
  }
  return result;
}

function clean(value, limit = 500) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function readJson(file) {
  if (!file) return null;
  try {
    return JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
  } catch {
    return null;
  }
}

export function resolveGenerationId(args) {
  const explicit = clean(args["generation-id"], 120).toLowerCase();
  if (explicit) return explicit;
  // Issue-based ids are stable across the generation, publish, and revision
  // workflows, which only share the client repository name.
  const issue = numberOrNull(args.issue);
  if (issue !== null && issue > 0) return `issue:${Math.round(issue)}`;
  const submissionId = clean(args["submission-id"], 100).toLowerCase();
  if (submissionId) return submissionId;
  return "";
}

/**
 * Build the exact JSON body the Worker ingestion endpoint accepts. Kept pure
 * so the payload contract stays unit-testable without network access.
 */
export function buildGenerationTrackingPayload(args = {}, events = []) {
  const generationId = resolveGenerationId(args);
  if (!generationId) throw new Error("A generation id, submission id, or issue is required.");
  const generation = { generationId };
  const textFields = {
    submissionId: clean(args["submission-id"], 100).toLowerCase(),
    businessName: clean(args.business, 200),
    slug: clean(args.slug, 80),
    siteId: clean(args.site, 63).toLowerCase(),
    repo: clean(args.repo, 240),
    clientEmail: clean(args["client-email"], 240).toLowerCase(),
    status: clean(args.status, 40).toLowerCase(),
    previewUrl: clean(args["preview-url"], 600),
    productionUrl: clean(args["production-url"], 600),
    reviewedSha: clean(args.sha, 40).toLowerCase(),
    repairSessionId: clean(args["repair-session"], 100).toLowerCase(),
  };
  for (const [key, value] of Object.entries(textFields)) {
    if (value) generation[key] = value;
  }
  const numericFields = {
    issueNumber: numberOrNull(args.issue),
    reviewPr: numberOrNull(args.pr),
    startedAt: numberOrNull(args["started-at"]),
    completedAt: numberOrNull(args["completed-at"]),
  };
  for (const [key, value] of Object.entries(numericFields)) {
    if (value !== null) generation[key] = Math.round(value);
  }
  if (args.failure !== undefined) generation.failureReason = clean(args.failure, 500);
  const action = clean(args.action, 20).toLowerCase() || "event";
  if (!["start", "event", "complete"].includes(action))
    throw new Error(`Unsupported action: ${action}`);
  return { action, generationId, generation, events };
}

async function postJson(api, secret, body, fetchImpl = fetch) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${api}/api/internal/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return { ok: true, status: response.status };
      if (![429, 500, 502, 503, 504].includes(response.status))
        return { ok: false, status: response.status };
      lastError = new Error(`Tracking endpoint returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw lastError || new Error("Tracking endpoint is unavailable.");
}

/** Convert the hero screenshot to a bounded WebP and store it in the ledger. */
export async function uploadGenerationHero({
  api,
  secret,
  generationId,
  heroFile,
  fetchImpl = fetch,
}) {
  const input = await fs.readFile(path.resolve(heroFile));
  const webp = await sharp(input)
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
  if (!webp.length || webp.length > MAX_HERO_BYTES)
    throw new Error(`Hero thumbnail exceeds ${MAX_HERO_BYTES} bytes.`);
  const response = await fetchImpl(
    `${api}/api/internal/generations/hero?id=${encodeURIComponent(generationId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "image/webp",
      },
      body: webp,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(`Hero upload was rejected (${response.status}).`);
  return { bytes: webp.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv.slice(2));
  const required = args.required === "true";
  const secret = clean(args.secret || process.env.GENERATION_TRACKING_SECRET, 500);
  const api = clean(
    args.api || process.env.LAUNCHLOOM_API_URL || DEFAULT_API_URL,
    400,
  ).replace(/\/$/u, "");
  if (!secret) {
    if (required) throw new Error("GENERATION_TRACKING_SECRET is required.");
    console.log("generation_tracking=disabled reason=no-secret");
    process.exit(0);
  }
  try {
    const eventFiles = [args.events, args["cost-summary"]].filter(Boolean);
    const events = [];
    for (const file of eventFiles) {
      const parsed = await readJson(file);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
      for (const event of list) {
        const index = events.findIndex((item) => item.eventKey === event.eventKey);
        if (index >= 0) events[index] = event;
        else events.push(event);
      }
    }
    const payload = buildGenerationTrackingPayload(args, events);
    if (args["dry-run"] === "true") {
      console.log(JSON.stringify(payload, null, 2));
      process.exit(0);
    }
    const result = await postJson(api, secret, payload);
    if (!result.ok) throw new Error(`Tracking endpoint rejected the payload (${result.status}).`);
    let hero = "skipped";
    if (args.hero) {
      try {
        const uploaded = await uploadGenerationHero({
          api,
          secret,
          generationId: payload.generationId,
          heroFile: args.hero,
        });
        hero = `uploaded:${uploaded.bytes}`;
      } catch (error) {
        hero = `failed:${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`;
      }
    }
    console.log(
      `generation_tracked action=${payload.action} id=${payload.generationId} events=${payload.events.length} hero=${hero}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) throw error;
    console.warn(`generation_tracking=skipped reason=${message.slice(0, 200)}`);
  }
}
