import type { RunIdentity } from "./contracts";
import {
  createOperationsStore,
  operationsDatabaseSql,
  type OperationsSql,
} from "./store";

export type ReconcileResult = "updated" | "unchanged" | "attention";
type Snapshot = { attemptId: string; run: RunIdentity | null; state: string };
type Observation = RunIdentity & { status: string; conclusion: string | null };
export type ReconciliationStore = {
  getReconciliationAttempt(id: string): Promise<Snapshot | null>;
  recordRunObservation(
    id: string,
    run: RunIdentity | null,
    conclusion: string,
  ): Promise<ReconcileResult>;
  resolveAttention(
    id: string,
    actorId: string,
    evidenceRef: string,
  ): Promise<ReconcileResult>;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONCLUSIONS = new Set([
  "success",
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "neutral",
  "skipped",
  "stale",
  "startup_failure",
]);
function sameRun(a: RunIdentity, b: RunIdentity) {
  return (
    a.repositoryId === b.repositoryId &&
    a.runId === b.runId &&
    a.runAttempt === b.runAttempt
  );
}

/** No API call occurs inside a database transaction. The apply step rechecks ownership. */
export function createAttemptReconciler(
  store: ReconciliationStore,
  observe: (run: RunIdentity) => Promise<Observation>,
) {
  return {
    async reconcileAttempt(attemptId: string): Promise<ReconcileResult> {
      if (!UUID.test(attemptId)) throw new Error("Invalid attempt.");
      const attempt = await store.getReconciliationAttempt(attemptId);
      if (!attempt) return "unchanged";
      let conclusion = "unknown";
      if (attempt.run) {
        try {
          const result = await observe(attempt.run);
          if (sameRun(attempt.run, result)) {
            if (
              result.status === "completed" &&
              result.conclusion &&
              CONCLUSIONS.has(result.conclusion)
            )
              conclusion = result.conclusion;
            else if (
              [
                "queued",
                "in_progress",
                "waiting",
                "pending",
                "requested",
              ].includes(result.status) &&
              result.conclusion === null
            )
              conclusion = "pending";
          }
        } catch {
          /* Only a controlled classification is persisted, never response bodies/errors. */
        }
      }
      return store.recordRunObservation(attemptId, attempt.run, conclusion);
    },
  };
}

/** Exact attempt endpoint, not the latest re-run and never a guessed workflow run. */
export function githubRunObserver(
  target: { repository: string; token: string },
  send: typeof fetch = fetch,
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(
      target.repository,
    ) ||
    !target.token ||
    [".", ".."].includes(target.repository.split("/")[1])
  )
    throw Error("Run observation unavailable.");
  return async (run: RunIdentity): Promise<Observation> => {
    if (
      !/^[1-9][0-9]{0,19}$/u.test(run.runId) ||
      !/^[1-9][0-9]{0,19}$/u.test(run.repositoryId) ||
      !Number.isSafeInteger(run.runAttempt) ||
      run.runAttempt < 1
    )
      throw Error("Run observation unavailable.");
    try {
      const response = await send(
        `https://api.github.com/repos/${target.repository}/actions/runs/${run.runId}/attempts/${run.runAttempt}`,
        {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${target.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "LaunchLoom-Operations",
          },
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw Error();
      }
      // Bound untrusted provider data; no provider text is stored or logged.
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      let text = "";
      let size = 0;
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 262144) throw Error();
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const body = JSON.parse(text);
      // GitHub's numeric IDs must be safe integers to avoid a rounded identity match.
      if (
        !Number.isSafeInteger(body.id) ||
        !Number.isSafeInteger(body.repository?.id) ||
        String(body.id) !== run.runId ||
        String(body.repository.id) !== run.repositoryId ||
        body.run_attempt !== run.runAttempt ||
        typeof body.status !== "string" ||
        !(body.conclusion === null || CONCLUSIONS.has(body.conclusion))
      )
        throw Error();
      return { ...run, status: body.status, conclusion: body.conclusion };
    } catch {
      throw Error("Run observation unavailable.");
    }
  };
}

/** Privileged resolution deliberately cannot redispatch or transfer ownership.
 * Unknown side effects have no generic safe recovery procedure in this release.
 */
export async function operationsResolutionApi(
  request: Request,
  principal: { id: string; role: string },
  store: ReconciliationStore,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!["admin", "owner"].includes(principal.role) || !principal.id)
    return reply({ error: "forbidden" }, 403);
  if (request.method !== "POST")
    return reply({ error: "method_not_allowed" }, 405);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "invalid" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) return reply({ error: "invalid" }, 400);
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !body ||
      Object.keys(body).some(
        (key) => !["attemptId", "decision", "evidenceRef"].includes(key),
      ) ||
      !UUID.test(body.attemptId) ||
      body.decision !== "retain_attention" ||
      !/^[a-f0-9]{40,64}$/u.test(body.evidenceRef)
    )
      return reply({ error: "invalid" }, 400);
    const result = await store.resolveAttention(
      body.attemptId,
      principal.id,
      body.evidenceRef,
    );
    return reply({ status: result });
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export type ReconciliationEnvironment = {
  OPERATIONS_RECONCILE_MODE?: string;
  OPERATIONS_DATABASE_URL?: string;
  OPERATIONS_DISPATCH_REPOSITORY?: string;
  GITHUB_ORG_TOKEN?: string;
};
/** Only reached inside the existing verified session/Access + origin guard. */
export async function operationsAdminApi(
  request: Request,
  env: ReconciliationEnvironment,
  principal: { id: string; role: string },
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!["admin", "owner"].includes(principal.role) || !principal.id)
    return reply({ error: "forbidden" }, 403);
  if (
    env.OPERATIONS_RECONCILE_MODE !== "observe-v1" ||
    !env.OPERATIONS_DATABASE_URL
  )
    return reply({ error: "unavailable" }, 503);
  const path = new URL(request.url).pathname;
  try {
    const store = createOperationsStore(
      operationsDatabaseSql(env.OPERATIONS_DATABASE_URL),
    );
    if (path.endsWith("/operations/alerts") && request.method === "GET")
      return reply({ alerts: await store.getOperationAlerts(), limit: 100 });
    if (path.endsWith("/operations/resolutions"))
      return operationsResolutionApi(request, principal, store);
    const attempt = /\/operations\/attempts\/([a-f0-9-]{36})\/reconcile$/u.exec(
      path,
    )?.[1];
    if (attempt && UUID.test(attempt) && request.method === "POST") {
      const reconciler = createAttemptReconciler(
        store,
        githubRunObserver({
          repository: env.OPERATIONS_DISPATCH_REPOSITORY ?? "",
          token: env.GITHUB_ORG_TOKEN ?? "",
        }),
      );
      return reply({ status: await reconciler.reconcileAttempt(attempt) });
    }
    return reply({ error: "not_found" }, 404);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
export async function scheduledReconciliation(
  env: ReconciliationEnvironment,
  sql?: OperationsSql,
): Promise<void> {
  if (env.OPERATIONS_RECONCILE_MODE !== "observe-v1") return;
  if (!env.OPERATIONS_DATABASE_URL && !sql)
    throw Error("Operations reconciliation unavailable.");
  const connection = sql ?? operationsDatabaseSql(env.OPERATIONS_DATABASE_URL!);
  const store = createOperationsStore(connection);
  const reconciler = createAttemptReconciler(
    store,
    githubRunObserver({
      repository: env.OPERATIONS_DISPATCH_REPOSITORY ?? "",
      token: env.GITHUB_ORG_TOKEN ?? "",
    }),
  );
  // Selection is fair by last observation, deterministic and bounded per wake.
  const attempts = await store.listReconciliationAttempts();
  for (const id of attempts) await reconciler.reconcileAttempt(id);
  const alerts = await store.getOperationAlerts();
  // Identifiers and controlled codes only, not intake payloads or provider errors.
  for (const alert of alerts)
    console.warn(
      JSON.stringify({
        operations_alert: alert.code,
        attemptId: alert.attemptId,
      }),
    );
}
