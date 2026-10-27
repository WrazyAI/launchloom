import type { DispatchResult, LeasedDispatch, OperationsStore } from "./contracts";
import { createOperationsStore, operationsDatabaseSql } from "./store";

type DispatchStore = Pick<OperationsStore, "leaseDispatch" | "recordDispatchResult">;
type Outcome = DispatchResult["outcome"];
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
  dispatch: (item: LeasedDispatch) => Promise<Outcome>;
  now?: () => number;
}): Promise<void> {
  const now = deps.now ?? Date.now;
  for (let i = 0; i < 10; i++) {
    const item = await deps.store.leaseDispatch(now());
    if (!item) return;
    let outcome: Outcome;
    try {
      outcome = await deps.dispatch(item);
    } catch {
      outcome = "unknown";
    }
    // If this fails, stop. An expired lease is unknown, NOT a retry permission.
    await deps.store.recordDispatchResult(item.operationId, item.fence, {
      outcome,
      now: now(),
    });
  }
}

export function githubDispatcher(
  target: { repository: string; workflow: string; ref: string; token: string },
  send: typeof fetch = fetch,
): (item: LeasedDispatch) => Promise<Outcome> {
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
    await response.body?.cancel();
    if (response.status === 200 || response.status === 204) return "accepted";
    if (response.status === 429) return "retryable";
    if ([400, 401, 403, 404, 422].includes(response.status)) return "rejected";
    // Even a server error can follow acceptance. Never blindly replay it.
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
    store: createOperationsStore(operationsDatabaseSql(env.OPERATIONS_DATABASE_URL)),
    dispatch,
  });
}
