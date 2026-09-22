const DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_TYPESAFE_MODEL = "jev-1.13.0";

export class TypeSafeSystemOneError extends Error {
  constructor(message, { status = 0, code = "", body = "", cause } = {}) {
    super(message, { cause });
    this.name = "TypeSafeSystemOneError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function normalizedBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/u, "");
}

function boundedTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4_000;
  return Math.max(500, Math.min(15_000, Math.trunc(parsed)));
}

function safeBody(value, limit = 1_500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

/**
 * Call TypeSafe System One once. The reasoning router deliberately avoids an
 * internal retry cascade; the caller owns the max-safe fallback.
 *
 * @param {{
 *   apiKey?: string,
 *   baseUrl?: string,
 *   model?: string,
 *   state: unknown,
 *   questions: Record<string, unknown>,
 *   timeoutMs?: number,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export async function requestSystemOne({
  apiKey = process.env.TYPESAFE_API_KEY,
  baseUrl = process.env.TYPESAFE_BASE_URL || DEFAULT_BASE_URL,
  model = DEFAULT_TYPESAFE_MODEL,
  state,
  questions,
  timeoutMs = Number(process.env.REASONING_PREFLIGHT_TIMEOUT_MS || 4_000),
  fetchImpl = fetch,
} = {}) {
  if (!apiKey)
    throw new TypeSafeSystemOneError(
      "TYPESAFE_API_KEY is unavailable for reasoning preflight.",
      { code: "missing-api-key" },
    );
  if (!questions || typeof questions !== "object" || Array.isArray(questions))
    throw new TypeSafeSystemOneError(
      "TypeSafe reasoning preflight requires a questions object.",
      { code: "invalid-questions" },
    );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeout(timeoutMs));
  const startedAt = Date.now();
  try {
    let response;
    try {
      response = await fetchImpl(
        `${normalizedBaseUrl(baseUrl)}/v1/systemone`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, state, questions }),
        },
      );
    } catch (error) {
      const aborted =
        controller.signal.aborted || error?.name === "AbortError";
      throw new TypeSafeSystemOneError(
        aborted
          ? "TypeSafe reasoning preflight timed out."
          : "TypeSafe reasoning preflight request failed.",
        {
          code: aborted ? "timeout" : "network-error",
          cause: error instanceof Error ? error : undefined,
        },
      );
    }

    const rawBody = await response.text().catch(() => "");
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
      if (response.ok)
        throw new TypeSafeSystemOneError(
          "TypeSafe returned malformed JSON.",
          {
            status: response.status,
            code: "malformed-json",
            body: safeBody(rawBody),
            cause: error instanceof Error ? error : undefined,
          },
        );
    }

    if (!response.ok) {
      const detail =
        payload?.error?.message ||
        payload?.detail ||
        payload?.message ||
        safeBody(rawBody) ||
        "unknown TypeSafe error";
      throw new TypeSafeSystemOneError(
        `TypeSafe returned ${response.status}: ${detail}`,
        {
          status: response.status,
          code: "http-error",
          body: safeBody(rawBody),
        },
      );
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      !payload.answers ||
      typeof payload.answers !== "object" ||
      Array.isArray(payload.answers)
    )
      throw new TypeSafeSystemOneError(
        "TypeSafe returned an invalid System One envelope.",
        { status: response.status, code: "invalid-envelope" },
      );

    return {
      ...payload,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
