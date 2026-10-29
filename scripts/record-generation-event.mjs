import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildAttemptObservation,
  buildAttemptEvents,
} from "./generation-tracking-contract.mjs";

const DEFAULT_API_URL = "https://api.launchloom.wrazyos.com";
export const MAX_HERO_BYTES = 1_800_000;

/**
 * A full-page screenshot can exceed the ledger's 1.8 MB row bound even after
 * the first WebP encode. Retry at a smaller width and lower quality before
 * declaring the thumbnail unusable. The ladder is deliberately bounded so a
 * pathological page cannot hold the preview step open indefinitely.
 */
export const HERO_ENCODE_ATTEMPTS = Object.freeze([
  Object.freeze({ width: 1280, quality: 72, effort: 4 }),
  Object.freeze({ width: 1024, quality: 62, effort: 4 }),
  Object.freeze({ width: 840, quality: 52, effort: 4 }),
]);

export class HeroImageTooLargeError extends Error {
  constructor({ maxBytes, attempts }) {
    const last = attempts.at(-1);
    super(
      `Hero thumbnail exceeds ${maxBytes} bytes after ${attempts.length} encode attempt(s)` +
        (last
          ? `; last was ${last.bytes} bytes at ${last.width}px/${last.quality}q.`
          : "."),
    );
    this.name = "HeroImageTooLargeError";
    this.code = "hero_too_large";
    this.maxBytes = maxBytes;
    this.attempts = attempts;
  }
}

export class HeroImageEncodingError extends Error {
  constructor(message = "Hero thumbnail encoding produced no usable image.") {
    super(message);
    this.name = "HeroImageEncodingError";
    this.code = "hero_encode_failed";
  }
}

export class HeroUploadError extends Error {
  constructor(status) {
    super(`Hero upload was rejected (${status}).`);
    this.name = "HeroUploadError";
    this.code = "hero_upload_rejected";
    this.status = status;
  }
}

async function encodeWithSharp(input, { width, quality, effort }) {
  return sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort })
    .toBuffer();
}

/**
 * Encode a screenshot into the largest bounded WebP the ledger accepts.
 * Exported with injectable encoding so the retry ladder and cap are testable
 * without generating multi-megabyte image fixtures.
 */
export async function encodeGenerationHero(
  input,
  {
    maxBytes = MAX_HERO_BYTES,
    attempts: ladder = HERO_ENCODE_ATTEMPTS,
    encode = encodeWithSharp,
  } = {},
) {
  const encodedAttempts = [];
  for (const attempt of ladder) {
    const bytes = await encode(input, attempt);
    if (!bytes?.length) throw new HeroImageEncodingError();
    encodedAttempts.push({ ...attempt, bytes: bytes.length });
    if (bytes.length <= maxBytes)
      return {
        bytes,
        width: attempt.width,
        quality: attempt.quality,
        attempts: encodedAttempts,
      };
  }
  throw new HeroImageTooLargeError({ maxBytes, attempts: encodedAttempts });
}

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
  if (!generationId)
    throw new Error("A generation id, submission id, or issue is required.");
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
  if (args.failure !== undefined)
    generation.failureReason = clean(args.failure, 500);
  const action = clean(args.action, 20).toLowerCase() || "event";
  if (!["start", "event", "complete"].includes(action))
    throw new Error(`Unsupported action: ${action}`);
  return { action, generationId, generation, events };
}

/**
 * A missing thumbnail must never be recorded as a clean preview. Keep the
 * preview deliverable, but surface the diagnostic as delivery attention with a
 * bounded reason. Failed or already-published states are never demoted.
 */
export function applyHeroFailure(args = {}, failure) {
  const action = clean(args.action, 20).toLowerCase() || "event";
  const status =
    clean(args.status, 40).toLowerCase() ||
    (action === "complete" ? "preview_ready" : "");
  if (status !== "preview_ready" && status !== "attention") return { ...args };
  const message = clean(
    failure instanceof Error ? failure.message : failure,
    240,
  );
  const prior = clean(args.failure, 240);
  const reason = `Generation thumbnail upload failed: ${message || "unknown error"}`;
  return {
    ...args,
    status: "attention",
    "delivery-status": "attention",
    failure: prior ? `${prior} ${reason}` : reason,
  };
}

export function safeHeroFailureMessage(error) {
  if (
    error instanceof HeroImageTooLargeError ||
    error instanceof HeroImageEncodingError ||
    error instanceof HeroUploadError
  )
    return error.message;
  return "Hero image could not be encoded or uploaded.";
}

async function reportHeroFailure(error) {
  const message = safeHeroFailureMessage(error);
  console.error(`generation_thumbnail=failed reason=${message.slice(0, 200)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs
      .appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Generation thumbnail failed\n\n${message}\n\nThe preview remains available, but the ledger is marked attention.\n\n`,
      )
      .catch(() => {});
  }
  process.exitCode = 1;
}

export function buildAttemptTrackingPayload(args = {}, events = []) {
  if (!args["run-id"]) return null; // legacy behavior is opt-in, never inferred from status/action
  const observedAt = Number(args["observed-at"]);
  const stage = clean(args.stage, 80);
  const stageStatus = clean(args["stage-status"], 40);
  const stageEvents = [...events];
  if (stage && stageStatus) {
    stageEvents.push({
      eventKey: `stage:${stage}:${stageStatus}:${observedAt}`,
      stage,
      status: stageStatus,
      detail: clean(args["stage-detail"], 2000) || null,
      observedAt,
    });
  }
  const observation = buildAttemptObservation({
    repository: process.env.GITHUB_REPOSITORY || "WrazyAI/launchloom",
    runId: String(args["run-id"]),
    runAttempt: Number(args["run-attempt"]),
    requestId: args["request-id"] || null,
    attemptId: args["attempt-id"] || null,
    profile: args.profile,
    issueNumber: numberOrNull(args.issue),
    triggeringActor: args["triggering-actor"] || null,
    executionStatus: args["execution-status"],
    deliveryStatus: args["delivery-status"],
    observedAt,
    createdAt: numberOrNull(args["created-at"]),
    startedAt: numberOrNull(args["started-at"]),
    completedAt: numberOrNull(args["completed-at"]),
    failure: args.failure
      ? {
          summary: args.failure,
          stage: clean(args["failure-stage"], 80) || null,
          category: clean(args["failure-category"], 80) || null,
          nextStep: clean(args["failure-next-step"], 500) || null,
        }
      : undefined,
  });
  return { observation, events: buildAttemptEvents(stageEvents, observation) };
}

async function postJson(
  api,
  secret,
  body,
  fetchImpl = fetch,
  endpoint = "generations",
) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${api}/api/internal/${endpoint}`, {
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
    if (attempt < 3)
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw lastError || new Error("Tracking endpoint is unavailable.");
}

export async function postAttemptTracking(
  payload,
  {
    secret = process.env.GENERATION_TRACKING_SECRET,
    api = process.env.LAUNCHLOOM_API_URL || DEFAULT_API_URL,
    fetchImpl = fetch,
  } = {},
) {
  if (!secret) return { ok: true, disabled: true };
  return postJson(
    api.replace(/\/$/u, ""),
    secret,
    payload,
    fetchImpl,
    "generation-attempts",
  );
}

/** Convert the hero screenshot to a bounded WebP and store it in the ledger. */
export async function uploadGenerationHero({
  api,
  secret,
  generationId,
  heroFile,
  fetchImpl = fetch,
  maxBytes = MAX_HERO_BYTES,
  encode = encodeWithSharp,
}) {
  const input = await fs.readFile(path.resolve(heroFile));
  const encoded = await encodeGenerationHero(input, { maxBytes, encode });
  const response = await fetchImpl(
    `${api}/api/internal/generations/hero?id=${encodeURIComponent(generationId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "image/webp",
      },
      body: encoded.bytes,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new HeroUploadError(response.status);
  return {
    bytes: encoded.bytes.length,
    width: encoded.width,
    quality: encoded.quality,
    attempts: encoded.attempts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv.slice(2));
  const required = args.required === "true";
  const secret = clean(
    args.secret || process.env.GENERATION_TRACKING_SECRET,
    500,
  );
  const api = clean(
    args.api || process.env.LAUNCHLOOM_API_URL || DEFAULT_API_URL,
    400,
  ).replace(/\/$/u, "");
  if (!secret) {
    if (required) throw new Error("GENERATION_TRACKING_SECRET is required.");
    console.log("generation_tracking=disabled reason=no-secret");
    process.exit(0);
  }
  let heroFailure = null;
  let hero = "skipped";
  try {
    const eventFiles = [args.events, args["cost-summary"]].filter(Boolean);
    const events = [];
    for (const file of eventFiles) {
      const parsed = await readJson(file);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.events)
          ? parsed.events
          : [];
      for (const event of list) {
        const index = events.findIndex(
          (item) => item.eventKey === event.eventKey,
        );
        if (index >= 0) events[index] = event;
        else events.push(event);
      }
    }
    // Upload before posting so a missing hero can never be recorded as a
    // clean preview_ready result. The workflow's preview step is allowed to
    // continue, but the ledger becomes attention and the step exits nonzero.
    if (args.hero && args["dry-run"] !== "true") {
      try {
        const uploaded = await uploadGenerationHero({
          api,
          secret,
          generationId: resolveGenerationId(args),
          heroFile: args.hero,
        });
        hero = `uploaded:${uploaded.bytes}:attempts=${uploaded.attempts.length}`;
      } catch (error) {
        heroFailure = error;
        hero = "failed";
        await reportHeroFailure(error);
      }
    }
    const trackingArgs = heroFailure
      ? applyHeroFailure(args, heroFailure)
      : args;
    let attemptPayload = null;
    try {
      attemptPayload = buildAttemptTrackingPayload(trackingArgs, events);
    } catch (error) {
      if (required) throw error;
      console.warn("attempt_tracking=skipped reason=invalid-evidence");
    }
    // An explicit observation without a legacy action is attempt-only. Existing
    // lifecycle callbacks retain their original payload, hero and status behavior.
    const payload =
      trackingArgs["run-id"] && !trackingArgs.action
        ? null
        : buildGenerationTrackingPayload(trackingArgs, events);
    if (args["dry-run"] === "true") {
      console.log(
        JSON.stringify(
          attemptPayload
            ? { legacy: payload, attempt: attemptPayload }
            : payload,
          null,
          2,
        ),
      );
      process.exit(0);
    }
    if (attemptPayload) {
      try {
        const attemptResult = await postJson(
          api,
          secret,
          attemptPayload,
          fetch,
          "generation-attempts",
        );
        if (!attemptResult.ok)
          throw new Error(
            `Attempt tracking rejected (${attemptResult.status}).`,
          );
      } catch (error) {
        if (required) throw error;
        const reason =
          error instanceof Error
            ? error.message.replace(/\s+/gu, " ").slice(0, 160)
            : "unavailable";
        console.warn(`attempt_tracking=skipped reason=${reason}`);
      }
    }
    if (payload) {
      const result = await postJson(api, secret, payload);
      if (!result.ok)
        throw new Error(
          `Tracking endpoint rejected the payload (${result.status}).`,
        );
    }
    console.log(
      `generation_tracked action=${payload?.action ?? "attempt"} id=${payload?.generationId ?? resolveGenerationId(trackingArgs)} events=${payload?.events.length ?? 0} hero=${hero} status=${payload?.generation.status ?? "attempt-only"}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) throw error;
    console.warn(`generation_tracking=skipped reason=${message.slice(0, 200)}`);
    if (heroFailure) process.exitCode = 1;
  }
}
