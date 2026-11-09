import crypto from "node:crypto";

const MODEL_STATUSES = new Set([
  "completed",
  "error",
  "incomplete",
  "requires-action",
  "cancelled",
  "transport",
]);
const CODE = /^[a-z0-9_.-]{1,80}$/u;

/** Exact decimal string for reported cost; never exponent notation. */
export function traceDecimal(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  const fixed = value.toFixed(8).replace(/0+$/u, "").replace(/\.$/u, "");
  return fixed || "0";
}

function tokens(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Map normalized inference usage to the trace contract without inventing values. */
export function toTraceUsage(usage) {
  const empty = {
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    costUsd: null,
    costKind: "unreported",
  };
  if (!usage || typeof usage !== "object") return empty;
  const costUsd = traceDecimal(usage.costUsd);
  const reported = costUsd !== null && usage.costKind === "provider-reported";
  return {
    inputTokens: tokens(usage.inputTokens),
    outputTokens: tokens(usage.outputTokens),
    cachedInputTokens: tokens(usage.cachedInputTokens),
    cacheWriteTokens: tokens(usage.cacheWriteTokens),
    reasoningTokens: tokens(usage.reasoningTokens),
    costUsd: reported ? costUsd : null,
    costKind: reported ? "actual" : "unreported",
  };
}

function summarize(value) {
  const result = value?.result ?? value;
  return {
    status: result?.status,
    text: result?.text,
    usage: result?.usage,
    error: result?.error,
  };
}

/**
 * Observe one model dispatch without changing it.
 *
 * The start event is written before the request. The completed visible text,
 * usage and terminal status are written as soon as the response is normalized.
 * The current transport is non-streaming, so nothing here claims token
 * streaming. Usage is deduplicated by the local dispatch ID at ingest.
 */
export async function observeModelCall({
  producer,
  provider,
  model,
  callId = crypto.randomUUID(),
  invoke,
  normalize = summarize,
}) {
  if (!producer) return invoke();
  producer.emit("model_started", { callId, provider, model });
  const onProgress = ({ visibleChars, reasoningDeltas, elapsedMs } = {}) => {
    producer.emit("output_delta", {
      callId,
      visibleChars:
        Number.isSafeInteger(visibleChars) && visibleChars >= 0
          ? visibleChars
          : 0,
      reasoningTokens:
        Number.isSafeInteger(reasoningDeltas) && reasoningDeltas >= 0
          ? reasoningDeltas
          : 0,
      elapsedMs:
        Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0,
    });
  };
  let value;
  try {
    value = await invoke(onProgress);
  } catch (error) {
    producer.emit("model_finished", { callId, status: "error" });
    const code = String(error?.code ?? "");
    producer.emit("error", {
      scope: "model",
      code: CODE.test(code) ? code : "model_dispatch_failed",
      message: {
        kind: "text",
        text: String(error?.message || "Model dispatch failed."),
      },
    });
    throw error;
  }
  const summary = normalize(value) || {};
  const status = MODEL_STATUSES.has(summary.status) ? summary.status : "error";
  producer.emit("model_finished", { callId, status });
  if (status !== "completed" && summary.error) {
    const code = String(summary.error.code ?? "");
    producer.emit("error", {
      scope: "model",
      code: CODE.test(code) ? code : "model_request_failed",
      // Never echo raw provider prose. The machine-readable code is enough to
      // classify the failure, and the lifecycle record keeps the authority.
      message: {
        kind: "text",
        text: `Model request did not complete (${CODE.test(code) ? code : "error"}).`,
      },
    });
  }
  if (typeof summary.text === "string" && summary.text.trim())
    producer.emit("output", {
      callId,
      message: { kind: "text", text: summary.text },
    });
  producer.emit("usage", { callId, usage: toTraceUsage(summary.usage) });
  return value;
}
