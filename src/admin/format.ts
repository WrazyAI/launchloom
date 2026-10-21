import type {
  ActorSnapshot,
  AttemptSummary,
  ClientRecord,
  DeliveryStatus,
  ExecutionStatus,
  GenerationProfile,
} from "../lib/admin-contracts";

const MAX_TIMESTAMP = 8.64e15;

const SOURCE_LABELS: Record<ActorSnapshot["source"], string> = {
  neon: "Admin account",
  "cloudflare-access": "Access",
  intake: "Client submission",
  github: "GitHub",
  system: "System",
  legacy: "Legacy record",
};

const PROFILE_LABELS: Record<GenerationProfile, string> = {
  full: "Full generation",
  "full-preview": "Full preview",
  "creative-only": "Creative only",
  "seo-only": "SEO only",
};

const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  unknown: "Unknown",
};

const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  none: "No delivery",
  diagnostic: "Diagnostic",
  attention: "Needs attention",
  preview_ready: "Preview ready",
  published: "Published",
};

function trimmed(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Render only the recorded actor snapshot. A stable ID alone is not a name and
 * an absent name/email is reported as unknown rather than inferred.
 */
export function formatActor(
  actor: ActorSnapshot | null | undefined,
): { label: string; sourceLabel: string } {
  if (!actor)
    return { label: "Not recorded", sourceLabel: "Unknown source" };
  const recorded = trimmed(actor.name) || trimmed(actor.email);
  const category =
    actor.kind === "system"
      ? "System"
      : actor.kind === "github"
        ? "GitHub actor"
        : actor.kind === "client"
          ? "Client"
          : "Not recorded";
  return {
    label: recorded || category,
    sourceLabel: SOURCE_LABELS[actor.source] || "Unknown source",
  };
}

function validCost(value: number | null | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000_000
  );
}

function formatUsd(value: number | null | undefined) {
  if (!validCost(value)) return "Not reported";
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

/** Missing costs stay unknown. They are never shown as zero. */
export function formatCost(costs: {
  actualUsd: number | null;
  estimatedUsd: number | null;
  unreportedCount: number;
}): { actual: string; estimated: string; unreported: string } {
  const count = Number.isSafeInteger(costs.unreportedCount)
    ? Math.max(0, costs.unreportedCount)
    : 0;
  return {
    actual: formatUsd(costs.actualUsd),
    estimated: formatUsd(costs.estimatedUsd),
    unreported: count > 0 ? `${count} unreported` : "None unreported",
  };
}

export function describeAttempt(attempt: {
  executionStatus: ExecutionStatus;
  deliveryStatus: DeliveryStatus;
}): { executionLabel: string; deliveryLabel: string } {
  return {
    executionLabel:
      EXECUTION_LABELS[attempt.executionStatus] || EXECUTION_LABELS.unknown,
    deliveryLabel:
      DELIVERY_LABELS[attempt.deliveryStatus] || DELIVERY_LABELS.none,
  };
}

export function formatProfile(profile: GenerationProfile): string {
  return PROFILE_LABELS[profile] || profile;
}

export function formatTimestamp(value: number | null | undefined): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_TIMESTAMP
  )
    return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(value: number | null | undefined): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_TIMESTAMP
  )
    return "Not recorded";
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, "0")} ${
    MONTHS[date.getUTCMonth()]
  } ${date.getUTCFullYear()}`;
}

export function formatElapsed(
  startedAt: number | null | undefined,
  completedAt: number | null | undefined,
  terminal = false,
): string {
  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    Math.abs(startedAt) > MAX_TIMESTAMP
  )
    return "Not started";
  if (
    typeof completedAt !== "number" ||
    !Number.isFinite(completedAt) ||
    Math.abs(completedAt) > MAX_TIMESTAMP ||
    completedAt < startedAt
  )
    return terminal ? "Not recorded" : "In progress";
  const unit = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? "" : "s"}`;
  const seconds = Math.max(0, Math.round((completedAt - startedAt) / 1000));
  if (seconds < 60) return unit(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return unit(hours, "hour");
  return unit(Math.round(hours / 24), "day");
}

export function formatClientName(
  client: Pick<ClientRecord, "businessName" | "contactName" | "clientId"> | null,
): string {
  if (!client) return "Not recorded";
  return (
    trimmed(client.businessName) ||
    trimmed(client.contactName) ||
    trimmed(client.clientId) ||
    "Not recorded"
  );
}

function safeHttpUrl(value: string | null | undefined, hostAllowed: (host: string) => boolean) {
  const raw = trimmed(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!hostAllowed(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Approved GitHub evidence routes only, with no query token. */
export function safeEvidenceUrl(value: string | null | undefined): string | null {
  const raw = trimmed(value);
  if (
    !/^https:\/\/github\.com\/WrazyAI\/launchloom\/(?:actions\/runs\/\d+(?:\/attempts\/\d+)?|issues\/\d+|pull\/\d+)\/?$/u.test(
      raw,
    )
  )
    return null;
  return safeHttpUrl(raw, (host) => host === "github.com");
}

/** Approved generated-site hosts only, with no credentials, query or hash. */
export function safeSiteUrl(value: string | null | undefined): string | null {
  return safeHttpUrl(
    value,
    (host) =>
      host === "launchloom.wrazyos.com" ||
      host.endsWith(".wrazyos.com") ||
      host.endsWith(".pages.dev"),
  );
}

export function isSafeEvidenceUrl(value: string | null | undefined) {
  return safeEvidenceUrl(value) !== null;
}

export function clientHasKnownIdentity(
  client: Pick<ClientRecord, "businessName" | "contactName" | "email">,
) {
  return Boolean(
    trimmed(client.businessName) ||
      trimmed(client.contactName) ||
      trimmed(client.email),
  );
}

export function staleExecutionLabel(attempt: AttemptSummary) {
  const { executionLabel } = describeAttempt(attempt);
  return attempt.stale ? `${executionLabel} (stale)` : executionLabel;
}

export function dateInputValue(value: number | null | undefined) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_TIMESTAMP
  )
    return "";
  return new Date(value).toISOString().slice(0, 10);
}

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const time = Date.UTC(year, month, day);
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day
  )
    return null;
  return time;
}

export function parseDateStart(value: string): number | undefined {
  return dateParts(value) ?? undefined;
}

export function parseDateEnd(value: string): number | undefined {
  const start = dateParts(value);
  return start === null ? undefined : start + 86_400_000 - 1;
}

export function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function requestErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim())
    return error.message.trim().slice(0, 300);
  return "The workspace request failed.";
}
