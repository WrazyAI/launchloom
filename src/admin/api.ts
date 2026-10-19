const ADMIN_API_PREFIX = "/api/admin/";
const MAX_ERROR_MESSAGE = 300;

type ErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

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

/**
 * Same-origin admin transport. Cookies are sent by the browser; no bearer or
 * storage token is read or written here. Error bodies are reduced to a safe
 * message rather than being forwarded verbatim.
 */
export async function fetchAdmin<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (
    !path.startsWith(ADMIN_API_PREFIX) ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("\n") ||
    path.includes("\r")
  )
    throw new AdminApiError(0, "invalid_path", "Invalid admin request path.");

  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    });
  } catch {
    throw new AdminApiError(
      0,
      "network_unavailable",
      "The admin workspace is unavailable.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope =
      payload && typeof payload === "object" ? (payload as ErrorEnvelope) : {};
    throw new AdminApiError(
      response.status,
      safeCode(envelope.error?.code),
      safeMessage(envelope.error?.message, "The admin request failed."),
    );
  }

  if (response.status === 204) return undefined as T;
  return payload as T;
}
