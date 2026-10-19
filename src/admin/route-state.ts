import type {
  AttemptFilters,
  ExecutionStatus,
  GenerationProfile,
} from "../lib/admin-contracts";

export const ADMIN_VIEWS = [
  "generations",
  "clients",
  "invitations",
  "team",
  "integrations",
  "settings",
] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number];

export type AdminRouteState = {
  view: AdminView;
  clientId: string | null;
  attemptId: string | null;
  filters: AttemptFilters;
  cursor: string | null;
};

const VIEW_SET = new Set<string>(ADMIN_VIEWS);
const EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "unknown",
]);
const PROFILES = new Set<GenerationProfile>([
  "full",
  "full-preview",
  "creative-only",
  "seo-only",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const FALLBACK_ORIGIN = "https://admin.invalid";

function first(value: string | null, max = 200) {
  if (!value) return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

function safeId(value: string | null) {
  const text = first(value, 160);
  return text && SAFE_ID.test(text) ? text : null;
}

function safeInteger(value: string | null, min: number, max: number) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max
    ? number
    : undefined;
}

function safeView(value: string | null): AdminView {
  return value && VIEW_SET.has(value) ? (value as AdminView) : "generations";
}

export function readRouteState(input: URL | string): AdminRouteState {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input, FALLBACK_ORIGIN);
  } catch {
    url = new URL("/admin/onboarding-invites", FALLBACK_ORIGIN);
  }
  const params = url.searchParams;
  const filters: AttemptFilters = {};
  const search = first(params.get("search"), 160);
  if (search) filters.search = search;
  const executionStatus = params.get("status");
  if (executionStatus && EXECUTION_STATUSES.has(executionStatus as ExecutionStatus))
    filters.executionStatus = executionStatus as ExecutionStatus;
  const profile = params.get("profile");
  if (profile && PROFILES.has(profile as GenerationProfile))
    filters.profile = profile as GenerationProfile;
  const initiatorId = safeId(params.get("initiator"));
  if (initiatorId) filters.initiatorId = initiatorId;
  const creatorId = safeId(params.get("creator"));
  if (creatorId) filters.creatorId = creatorId;
  const from = safeInteger(params.get("from"), 0, Number.MAX_SAFE_INTEGER);
  if (from !== undefined) filters.from = from;
  const to = safeInteger(params.get("to"), 0, Number.MAX_SAFE_INTEGER);
  if (to !== undefined) filters.to = to;
  const limit = safeInteger(params.get("limit"), 1, 100);
  if (limit !== undefined) filters.limit = limit;

  return {
    view: safeView(params.get("view")),
    clientId: safeId(params.get("client")),
    attemptId: safeId(params.get("attempt")),
    filters,
    cursor: first(params.get("cursor"), 500),
  };
}

export function writeRouteState(state: AdminRouteState): URL {
  const origin =
    typeof window === "undefined" ? FALLBACK_ORIGIN : window.location.origin;
  const url = new URL("/admin/onboarding-invites", origin);
  const params = url.searchParams;
  params.set("view", safeView(state.view));
  if (state.clientId) params.set("client", state.clientId);
  if (state.attemptId) params.set("attempt", state.attemptId);
  const filters = state.filters;
  if (filters.search) params.set("search", filters.search);
  if (filters.executionStatus) params.set("status", filters.executionStatus);
  if (filters.profile) params.set("profile", filters.profile);
  if (filters.initiatorId) params.set("initiator", filters.initiatorId);
  if (filters.creatorId) params.set("creator", filters.creatorId);
  if (filters.from !== undefined) params.set("from", String(filters.from));
  if (filters.to !== undefined) params.set("to", String(filters.to));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (state.cursor) params.set("cursor", state.cursor);
  return url;
}
