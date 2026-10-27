import type {
  DispatchDecision,
  DispatchOutcome,
  LeasedDispatch,
  OperationsStore,
} from "./contracts";
import { createOperationsStore, operationsDatabaseSql } from "./store";

type DispatchStore = Pick<OperationsStore, "leaseDispatch" | "recordDispatchResult">;
type Outcome = DispatchOutcome;
const MAX_RETRY_AFTER_SECONDS = 3600;

function boundedSeconds(value: number): number {
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.trunc(value)));
}

/** Only a bounded integer is forwarded; malformed plugin input is ignored. */
function decision(value: Outcome | DispatchDecision): DispatchDecision {
  const valid = (outcome: string): outcome is Outcome =>
    ["accepted", "retryable", "unknown", "rejected"].includes(outcome);
  if (typeof value === "string") return { outcome: valid(value) ? value : "unknown" };
  if (!value || typeof value !== "object" || !valid(value.outcome))
    return { outcome: "unknown" };
  const result: DispatchDecision = { outcome: value.outcome };
  const retryAfterSeconds = value.retryAfterSeconds;
  if (
    typeof retryAfterSeconds === "number" &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 1
  )
    result.retryAfterSeconds = boundedSeconds(retryAfterSeconds);
  return result;

}
export type DispatchEnvironment = {
  OPERATIONS_DATABASE_URL?: string;
  OPERATIONS_DISPATCH_MODE?: string;
  OPERATIONS_CLAIM_GATE?: string;
  OPERATIONS_DISPATCH_REPOSITORY?: string;
  OPERATIONS_DISPATCH_WORKFLOW?: string;
  OPERATIONS_DISPATCH_REF?: string;
  GITHUB_ORG_TOKEN?: string;
};

/** Each SQL call commits before network I/O. A new instance resumes from DB state. */
export async function dispatchScheduled(deps: {
  store: DispatchStore;
  dispatch: (item: LeasedDispatch) => Promise<Outcome | DispatchDecision>;
  now?: () => number;
}): Promise<void> {
  const now = deps.now ?? Date.now;
  for (let i = 0; i < 10; i++) {
    const item = await deps.store.leaseDispatch(now());
    if (!item) return;
    let result: DispatchDecision;
    try {
      result = decision(await deps.dispatch(item));
    } catch {
      result = { outcome: "unknown" };
    }
    // If this fails, stop. The persisted gate decides whether an uncertain
    // outcome may be re-queued; it is never inferred from the HTTP response.
    await deps.store.recordDispatchResult(item.operationId, item.fence, {
      ...result,
      now: now(),
    });
  }
}

function retryAfterSeconds(
  value: string | null,
  nowMs: number,
): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (/^[0-9]{1,6}$/u.test(text)) {
    const seconds = Number(text);
    return seconds >= 1 ? boundedSeconds(seconds) : undefined;
  }
  const when = Date.parse(text);
  if (!Number.isFinite(when)) return undefined;
  const seconds = Math.ceil((when - nowMs) / 1000);
  return seconds >= 1 ? boundedSeconds(seconds) : undefined;
}

function resetSeconds(
  value: string | null,
  nowMs: number,
): number | undefined {
  if (!value || !/^[0-9]{1,12}$/u.test(value.trim())) return undefined;
  const seconds = Math.ceil(Number(value.trim()) - nowMs / 1000);
  return seconds >= 1 ? boundedSeconds(seconds) : undefined;
}

function zeroRemaining(value: string | null): boolean {
  if (value === null || !/^[0-9]+$/u.test(value.trim())) return false;
  return Number(value.trim()) === 0;
}

/**
 * Reads only documented delay headers. A valid retry-after is a rate-limit
 * signal on its own (secondary limits). x-ratelimit-reset is trusted only with a
 * numeric zero remaining count; GitHub sends a reset header on ordinary 403s
 * too. Empty/malformed values establish nothing and fall back to the persisted
 * exponential backoff. The longer valid delay wins.
 */
function rateLimitSignal(
  headers: Headers,
  nowMs: number,
): { limited: boolean; delay?: number } {
  const retryAfter = retryAfterSeconds(headers.get("retry-after"), nowMs);
  const reset = resetSeconds(headers.get("x-ratelimit-reset"), nowMs);
  if (retryAfter !== undefined) {
    return {
      limited: true,
      delay: Math.max(retryAfter, reset ?? 0),
    };
  }
  if (zeroRemaining(headers.get("x-ratelimit-remaining")) && reset !== undefined) {
    return { limited: true, delay: reset };
  }
  return { limited: false };
}

export function githubDispatcher(
  target: { repository: string; workflow: string; ref: string; token: string },
  send: typeof fetch = fetch,
  clock: () => number = Date.now,
): (item: LeasedDispatch) => Promise<Outcome | DispatchDecision> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(target.repository) ||
    [".", ".."].includes(target.repository.split("/")[1]) ||
    !/^[A-Za-z0-9_-]+\.ya?ml$/u.test(target.workflow) ||
    !target.ref || target.ref.length > 200 || /[\u0000-\u0020\u007f]/u.test(target.ref) || !target.token
  )
    throw new Error("Operations dispatch target is not configured.");
  return async (item) => {
    const response = await send(`https://api.github.com/repos/${target.repository}/actions/workflows/${target.workflow}/dispatches`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "LaunchLoom-Operations",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: target.ref,
        inputs: {
          operation_id: item.payload.operationId,
          request_id: item.payload.requestId,
          attempt_id: item.payload.attemptId,
        },
      }),
    });
    // Do not parse/log provider bodies. New APIs return run details with 200;
    // older 204 responses supply none. Neither grants execution ownership.
    const headers = response.headers;
    await response.body?.cancel();
    if (response.status === 200 || response.status === 204) return "accepted";
    if (response.status === 429) {
      const signal = rateLimitSignal(headers, clock());
      return signal.delay === undefined
        ? "retryable"
        : { outcome: "retryable", retryAfterSeconds: signal.delay };
    }
    if (response.status === 403) {
      const signal = rateLimitSignal(headers, clock());
      if (signal.limited) {
        return signal.delay === undefined
          ? "retryable"
          : { outcome: "retryable", retryAfterSeconds: signal.delay };
      }
    }
    // A plain 403 is an authorization failure, not a proven temporary limit.
    if ([400, 401, 403, 404, 422].includes(response.status)) return "rejected";
    // Even a server error can follow acceptance. Only the persisted gate may
    // decide whether an uncertain result is safely replayable.
    return "unknown";
  };
}

export async function scheduledOperations(env: DispatchEnvironment): Promise<void> {
  // Both explicit opt-ins are required. Task 4 must prove the pre-side-effect
  // authenticated claim gate before an operator may enable either setting.
  if (env.OPERATIONS_DISPATCH_MODE !== "claim-gated-v1" || env.OPERATIONS_CLAIM_GATE !== "verified-v1") return;
  if (!env.OPERATIONS_DATABASE_URL) throw new Error("Operations dispatch storage is not configured.");
  const dispatch = githubDispatcher({
    repository: env.OPERATIONS_DISPATCH_REPOSITORY ?? "",
    workflow: env.OPERATIONS_DISPATCH_WORKFLOW ?? "",
    ref: env.OPERATIONS_DISPATCH_REF ?? "",
    token: env.GITHUB_ORG_TOKEN ?? "",
  });
  await dispatchScheduled({
    // Both flags above prove the operator has enabled the verified claim gate.
    // Uncertain dispatch may replay only then: a duplicate GitHub run exits
    // before side effects unless it wins the atomic claim election.
    store: createOperationsStore(operationsDatabaseSql(env.OPERATIONS_DATABASE_URL), {
      uncertainDispatchRetry: true,
    }),
    dispatch,
  });
}
