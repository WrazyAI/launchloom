import {
  isTraceIdentity,
  validateTraceBatch,
} from "../../../src/lib/generation-activity-contract.mjs";
import type {
  GenerationActivityPage,
  TraceIdentity,
} from "../../../src/lib/generation-activity";
import {
  OperationsAuthError,
  trustedWorkflowRun,
  type WorkflowPolicy,
} from "../operations/github-auth";
import {
  createOperationsStore,
  OperationsError,
  operationsDatabaseSql,
} from "../operations/store";
import type { OperationsReadStore } from "../operations/contracts";
import { workspaceError } from "../admin/workspace-api";
import {
  createGenerationActivityStore,
  type GenerationActivityStore,
} from "./store";
import { workspaceCapabilities } from "../admin/workspace-capabilities";

const INTERNAL_PATH = "/api/internal/generation-activity";
const MAX_INGEST_BYTES = 256 * 1024;
const WORKSPACE_PREFIX = "/api/admin/onboarding-invites/workspace";
const ACTIVITY_ROUTE =
  /^\/(legacy\/attempts|operations\/records)\/([^/]+)\/activity$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LEGACY_ATTEMPT = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,199}$/u;

type LegacyOwner = {
  repository: string;
  runId: string;
  runAttempt: number;
};

type LegacyLedger = {
  getActivityOwner(id: string): Promise<LegacyOwner | null>;
  getAttempt?(id: string): Promise<unknown | null>;
};

type ActivityEnv = {
  OPERATIONS_DATABASE_URL?: string;
  OPERATIONS_OIDC_AUDIENCE?: string;
  OPERATIONS_OIDC_REPOSITORY_ID?: string;
  GENERATION_ACTIVITY_ENABLED?: string;
  GENERATION_LEDGER?: { getByName(name: string): LegacyLedger };
};

export type ActivityIngestDependencies = {
  store?: GenerationActivityStore;
  legacyOwner?: (attemptId: string) => Promise<LegacyOwner | null>;
  policy?: WorkflowPolicy;
};

export type ActivityReadDependencies = {
  store?: GenerationActivityStore;
  /** Existing, authorized detail lookup in the owning store. */
  attemptExists?: (identity: TraceIdentity) => Promise<boolean>;
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function ledger(env: ActivityEnv): LegacyLedger | null {
  return env.GENERATION_LEDGER?.getByName("launchloom-generations") ?? null;
}

function activityStore(env: ActivityEnv): GenerationActivityStore | null {
  const connectionString = env.OPERATIONS_DATABASE_URL?.trim();
  if (!connectionString) return null;
  return createGenerationActivityStore(
    operationsDatabaseSql(connectionString),
  );
}

function operationsReader(env: ActivityEnv): OperationsReadStore | null {
  const connectionString = env.OPERATIONS_DATABASE_URL?.trim();
  if (!connectionString) return null;
  return createOperationsStore(operationsDatabaseSql(connectionString));
}

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit)
    throw new ActivityRequestError("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new ActivityRequestError("invalid");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new ActivityRequestError("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

class ActivityRequestError extends Error {
  constructor(readonly code: "invalid" | "too_large") {
    super(code);
  }
}

function parseIdentity(value: unknown): TraceIdentity {
  if (!isTraceIdentity(value))
    throw new ActivityRequestError("invalid");
  const identity = value as TraceIdentity;
  if (
    identity.namespace === "operations" &&
    !UUID.test(identity.attemptId)
  )
    throw new ActivityRequestError("invalid");
  if (identity.namespace === "legacy" && !LEGACY_ATTEMPT.test(identity.attemptId))
    throw new ActivityRequestError("invalid");
  return identity;
}

function operationError(error: OperationsError): Response {
  if (error.code === "invalid")
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  if (error.code === "not_found")
    return workspaceError("not_found", "Generation activity not found.", 404);
  if (error.code === "conflict")
    return workspaceError(
      "conflict",
      "Conflicting activity evidence.",
      409,
    );
  return workspaceError(
    "unavailable",
    "Generation activity is temporarily unavailable.",
    503,
  );
}

/**
 * Trusted ingest for the diagnostic trace. Authorization comes only from the
 * GitHub OIDC run identity; there is no shared-secret fallback. Lifecycle and
 * cost authority live elsewhere and are never touched here.
 */
export async function generationActivityIngest(
  request: Request,
  env: ActivityEnv,
  dependencies: ActivityIngestDependencies = {},
): Promise<Response> {
  if (request.method !== "POST")
    return workspaceError("method_not_allowed", "Use POST.", 405);
  if (
    !dependencies.store &&
    (env.GENERATION_ACTIVITY_ENABLED !== "true" || !env.OPERATIONS_DATABASE_URL?.trim())
  )
    return workspaceError(
      "not_enabled",
      "Detailed generation activity is not enabled.",
      503,
    );

  let run;
  try {
    run = await trustedWorkflowRun(request, env, dependencies.policy);
  } catch (error) {
    if (error instanceof OperationsAuthError)
      return workspaceError("unauthorized", "Unauthorized.", 401);
    return workspaceError("unavailable", "Authorization unavailable.", 503);
  }

  let body: unknown;
  try {
    body = JSON.parse(await readBounded(request, MAX_INGEST_BYTES));
  } catch (error) {
    if (error instanceof ActivityRequestError && error.code === "too_large")
      return workspaceError("too_large", "Payload too large.", 413);
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  }
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "events,identity"
  )
    return workspaceError("invalid_input", "Invalid activity request.", 400);

  let identity: TraceIdentity;
  let events;
  try {
    identity = parseIdentity((body as { identity: unknown }).identity);
    events = validateTraceBatch((body as { events: unknown }).events);
  } catch {
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  }
  if (
    events.some(
      (event) =>
        event.context.namespace !== identity.namespace ||
        event.context.attemptId !== identity.attemptId,
    )
  )
    return workspaceError("invalid_input", "Invalid activity request.", 400);

  try {
    if (identity.namespace === "legacy") {
      if (!dependencies.legacyOwner && !ledger(env))
        return workspaceError(
          "unavailable",
          "Generation activity is temporarily unavailable.",
          503,
        );
      const owner = dependencies.legacyOwner
        ? await dependencies.legacyOwner(identity.attemptId)
        : await ledger(env)!.getActivityOwner(identity.attemptId);
      // A legacy attempt must already exist and be bound to exactly this
      // verified run. Unknown attempts are denied, never created.
      if (
        !owner ||
        owner.repository !== "WrazyAI/launchloom" ||
        owner.runId !== run.runId ||
        owner.runAttempt !== run.runAttempt
      )
        return workspaceError("forbidden", "Activity is not owned by this run.", 403);
    }
    const store = dependencies.store ?? activityStore(env);
    if (!store)
      return workspaceError(
        "unavailable",
        "Generation activity is temporarily unavailable.",
        503,
      );
    const result = await store.append(
      {
        ...identity,
        repositoryId: run.repositoryId,
        runId: run.runId,
        runAttempt: run.runAttempt,
      },
      events,
    );
    return json({ ...result, recordedAt: Date.now() });
  } catch (error) {
    if (error instanceof OperationsError) return operationError(error);
    return workspaceError(
      "unavailable",
      "Generation activity is temporarily unavailable.",
      503,
    );
  }
}

/**
 * Authenticated, read-only activity pages for the existing attempt inspector.
 * The owning store must confirm the attempt before any trace is read, and every
 * page rechecks the admin principal.
 */
export async function generationActivityRead(
  request: Request,
  env: ActivityEnv,
  principal: { id?: string; role?: string } | null | undefined,
  pathname: string,
  dependencies: ActivityReadDependencies = {},
): Promise<Response> {
  if (!principal?.id || !["admin", "owner"].includes(principal.role ?? ""))
    return workspaceError("forbidden", "Admin access required.", 403);
  if (request.method !== "GET")
    return workspaceError("method_not_allowed", "Use GET.", 405);
  if (
    !dependencies.store &&
    !workspaceCapabilities(env).generationActivityRead
  )
    return workspaceError(
      "not_enabled",
      "Detailed generation activity is not enabled.",
      503,
    );

  const suffix = pathname.startsWith(WORKSPACE_PREFIX)
    ? pathname.slice(WORKSPACE_PREFIX.length)
    : pathname;
  const match = ACTIVITY_ROUTE.exec(suffix);
  if (!match) return workspaceError("not_found", "Route not found.", 404);
  let attemptId: string;
  try {
    attemptId = decodeURIComponent(match[2]);
  } catch {
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  }
  const identity: TraceIdentity = {
    namespace: match[1] === "legacy/attempts" ? "legacy" : "operations",
    attemptId,
  };
  try {
    parseIdentity(identity);
  } catch {
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  }

  const url = new URL(request.url);
  for (const key of url.searchParams.keys())
    if (!["after", "before", "limit"].includes(key))
      return workspaceError("invalid_input", "Invalid activity request.", 400);
  const cursor = (name: "after" | "before") => {
    if (url.searchParams.getAll(name).length > 1)
      throw new ActivityRequestError("invalid");
    const value = url.searchParams.get(name);
    if (value !== null && !/^v1\.[0-9a-f]{1,8}\.[0-9a-f]{8}$/u.test(value))
      throw new ActivityRequestError("invalid");
    return value;
  };
  let after: string | null;
  let before: string | null;
  let limit = 100;
  try {
    after = cursor("after");
    before = cursor("before");
    if (after !== null && before !== null)
      throw new ActivityRequestError("invalid");
    if (url.searchParams.has("limit")) {
      const raw = url.searchParams.get("limit") ?? "";
      if (!/^\d{1,3}$/u.test(raw))
        throw new ActivityRequestError("invalid");
      limit = Number(raw);
      if (limit < 1 || limit > 100) throw new ActivityRequestError("invalid");
    }
  } catch {
    return workspaceError("invalid_input", "Invalid activity request.", 400);
  }

  try {
    const exists = dependencies.attemptExists
      ? await dependencies.attemptExists(identity)
      : await defaultAttemptExists(env, identity);
    if (!exists)
      return workspaceError("not_found", "Attempt not found.", 404);
    const store = dependencies.store ?? activityStore(env);
    if (!store)
      return workspaceError(
        "unavailable",
        "Generation activity is temporarily unavailable.",
        503,
      );
    const page: GenerationActivityPage = await store.read(identity, {
      after,
      before,
      limit,
    });
    return json({ activity: page, readOnly: true });
  } catch (error) {
    if (error instanceof OperationsError) return operationError(error);
    return workspaceError(
      "unavailable",
      "Generation activity is temporarily unavailable.",
      503,
    );
  }
}

async function defaultAttemptExists(
  env: ActivityEnv,
  identity: TraceIdentity,
): Promise<boolean> {
  if (identity.namespace === "legacy") {
    const owner = ledger(env);
    if (!owner?.getAttempt) return false;
    return Boolean(await owner.getAttempt(identity.attemptId));
  }
  const reader = operationsReader(env);
  if (!reader) return false;
  return Boolean(await reader.getOperation(identity.attemptId));
}

export const GENERATION_ACTIVITY_INTERNAL_PATH = INTERNAL_PATH;
