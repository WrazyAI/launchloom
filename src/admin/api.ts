const ADMIN_API_PREFIX = "/api/admin/";
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
