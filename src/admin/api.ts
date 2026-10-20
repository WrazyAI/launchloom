import type {
  AdminPrincipal,
  AttemptDetail,
  AttemptEventRecord,
  AttemptFilters,
  AttemptSummary,
  ClientFilters,
  ClientRecord,
  Health,
  Page,
} from "../lib/admin-contracts";

const ADMIN_API_PREFIX = "/api/admin/";
const WORKSPACE_PREFIX =
  "/api/admin/onboarding-invites/workspace";
const MAX_ERROR_MESSAGE = 300;

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export type AdminRequestInit<T> = RequestInit & {
  /** Only for an endpoint whose success contract is explicitly empty. */
  expectNoContent?: boolean;
  /** Optional runtime shape guard for the parsed JSON body. */
  validate?: (value: unknown) => value is T;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

// Retain the earlier exported name for callers that adopted it during Task 7.
export { ApiRequestError as AdminApiError };

function safeMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/gu, " ").slice(0, MAX_ERROR_MESSAGE)
    : fallback;
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/u.test(value)
    ? value
    : "request_failed";
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorEnvelope(text: string): ErrorEnvelope {
  const parsed = text ? parseJson(text) : undefined;
  return parsed && typeof parsed === "object" ? (parsed as ErrorEnvelope) : {};
}

function isJsonContentType(value: string | null) {
  const mediaType = (value || "").split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

/**
 * Same-origin admin transport. Cookies are sent by the browser; no bearer or
 * storage token is read or written here. A successful response must carry a
 * JSON body unless the caller explicitly marks the endpoint as no-content.
 * Error bodies are reduced to a safe message rather than being forwarded.
 */
export async function fetchAdmin<T>(
  path: string,
  init: AdminRequestInit<T> = {},
): Promise<T> {
  if (
    !path.startsWith(ADMIN_API_PREFIX) ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("\n") ||
    path.includes("\r")
  )
    throw new ApiRequestError(0, "invalid_path", "Invalid admin request path.");

  const { expectNoContent = false, validate, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...requestInit,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    });
  } catch {
    throw new ApiRequestError(
      0,
      "network_unavailable",
      "The admin workspace is unavailable.",
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response could not be read.",
    );
  }

  if (!response.ok) {
    const envelope = errorEnvelope(text);
    throw new ApiRequestError(
      response.status,
      safeCode(envelope.error?.code),
      safeMessage(envelope.error?.message, "The admin request failed."),
    );
  }

  if (response.status === 204 || expectNoContent) return undefined as T;

  if (!isJsonContentType(response.headers.get("Content-Type")))
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was not JSON.",
    );
  if (!text.trim())
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was empty.",
    );
  const payload = parseJson(text);
  if (payload === undefined || payload === null)
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response was malformed.",
    );
  if (validate && !validate(payload))
    throw new ApiRequestError(
      response.status,
      "invalid_response",
      "The admin response had an unexpected shape.",
    );
  return payload as T;
}

export type AdminRequestOptions = {
  signal?: AbortSignal;
};

export type ClientPage = Page<ClientRecord> & { health: Health };

/**
 * Read-only workspace API used by the implemented views. `getMe` is part of
 * the shared contract for the accounts rollout; the Access-mode shell keeps
 * its neutral identity and does not call it or invent a profile.
 */
export type AdminApi = {
  getMe(options?: AdminRequestOptions): Promise<AdminPrincipal>;
  listAttempts(
    filters: AttemptFilters,
    options?: AdminRequestOptions,
  ): Promise<Page<AttemptSummary>>;
  getAttempt(
    id: string,
    options?: AdminRequestOptions,
  ): Promise<AttemptDetail>;
  getAttemptEvents(
    id: string,
    cursor?: string | null,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Page<AttemptEventRecord>>;
  listClients(
    filters: ClientFilters,
    options?: AdminRequestOptions,
  ): Promise<ClientPage>;
  getClient(
    id: string,
    options?: AdminRequestOptions,
  ): Promise<ClientRecord>;
  getHealth(options?: AdminRequestOptions): Promise<Health>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageShape(value: unknown): value is Page<unknown> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0 &&
    (value.nextCursor === null || typeof value.nextCursor === "string")
  );
}

function isHealth(value: unknown): value is Health {
  return (
    isRecord(value) &&
    (value.lastSyncAt === null || typeof value.lastSyncAt === "number") &&
    (value.coverageStart === null ||
      typeof value.coverageStart === "number") &&
    typeof value.partial === "boolean" &&
    (value.lastError === null || typeof value.lastError === "string") &&
    typeof value.pendingProjectionCount === "number" &&
    Number.isSafeInteger(value.pendingProjectionCount)
  );
}

function isAttemptEnvelope(
  value: unknown,
): value is { attempt: AttemptDetail } {
  return (
    isRecord(value) &&
    isRecord(value.attempt) &&
    typeof value.attempt.attemptId === "string"
  );
}

function isClientEnvelope(
  value: unknown,
): value is { client: ClientRecord } {
  return (
    isRecord(value) &&
    isRecord(value.client) &&
    typeof value.client.clientId === "string"
  );
}

function isClientPage(value: unknown): value is ClientPage {
  return (
    isPageShape(value) &&
    isHealth((value as { health?: unknown }).health)
  );
}

function isPrincipal(value: unknown): value is AdminPrincipal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    (value.role === "owner" || value.role === "admin") &&
    (value.authSource === "neon" || value.authSource === "cloudflare-access")
  );
}

function add(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  params.set(key, text);
}

/** Server filter names, not browser route aliases. */
export function buildAttemptQuery(filters: AttemptFilters = {}) {
  const params = new URLSearchParams();
  add(params, "search", filters.search?.trim());
  add(params, "executionStatus", filters.executionStatus);
  add(params, "initiatorId", filters.initiatorId);
  add(params, "creatorId", filters.creatorId);
  add(params, "profile", filters.profile);
  add(params, "clientId", filters.clientId);
  if (Number.isSafeInteger(filters.from)) add(params, "from", filters.from);
  if (Number.isSafeInteger(filters.to)) add(params, "to", filters.to);
  add(params, "cursor", filters.cursor);
  if (
    Number.isSafeInteger(filters.limit) &&
    filters.limit! >= 1 &&
    filters.limit! <= 100
  )
    add(params, "limit", filters.limit);
  return params;
}

export function buildClientQuery(filters: ClientFilters = {}) {
  const params = new URLSearchParams();
  add(params, "search", filters.search?.trim());
  if (Number.isSafeInteger(filters.from)) add(params, "from", filters.from);
  if (Number.isSafeInteger(filters.to)) add(params, "to", filters.to);
  add(params, "cursor", filters.cursor);
  if (
    Number.isSafeInteger(filters.limit) &&
    filters.limit! >= 1 &&
    filters.limit! <= 100
  )
    add(params, "limit", filters.limit);
  return params;
}

function querySuffix(params: URLSearchParams) {
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createAdminApi(
  fetcher: typeof fetchAdmin = fetchAdmin,
): AdminApi {
  return {
    getMe(options) {
      return fetcher<AdminPrincipal>(`${WORKSPACE_PREFIX}/me`, {
        signal: options?.signal,
        validate: isPrincipal,
      });
    },
    listAttempts(filters, options) {
      return fetcher<Page<AttemptSummary>>(
        `${WORKSPACE_PREFIX}/attempts${querySuffix(buildAttemptQuery(filters))}`,
        {
          signal: options?.signal,
          validate: (value): value is Page<AttemptSummary> =>
            isPageShape(value),
        },
      );
    },
    async getAttempt(id, options) {
      const payload = await fetcher<{ attempt: AttemptDetail }>(
        `${WORKSPACE_PREFIX}/attempts/${encodeURIComponent(id)}`,
        { signal: options?.signal, validate: isAttemptEnvelope },
      );
      return payload.attempt;
    },
    getAttemptEvents(id, cursor, limit, signal) {
      const params = new URLSearchParams();
      add(params, "cursor", cursor);
      if (Number.isSafeInteger(limit) && limit! >= 1 && limit! <= 100)
        add(params, "limit", limit);
      return fetcher<Page<AttemptEventRecord>>(
        `${WORKSPACE_PREFIX}/attempts/${encodeURIComponent(id)}/events${querySuffix(params)}`,
        {
          signal,
          validate: (value): value is Page<AttemptEventRecord> =>
            isPageShape(value),
        },
      );
    },
    listClients(filters, options) {
      return fetcher<ClientPage>(
        `${WORKSPACE_PREFIX}/clients${querySuffix(buildClientQuery(filters))}`,
        { signal: options?.signal, validate: isClientPage },
      );
    },
    async getClient(id, options) {
      const payload = await fetcher<{ client: ClientRecord }>(
        `${WORKSPACE_PREFIX}/clients/${encodeURIComponent(id)}`,
        { signal: options?.signal, validate: isClientEnvelope },
      );
      return payload.client;
    },
    getHealth(options) {
      return fetcher<Health>(`${WORKSPACE_PREFIX}/health`, {
        signal: options?.signal,
        validate: isHealth,
      });
    },
  };
}
