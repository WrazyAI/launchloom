import type { Env } from "../index";
import { workspaceCapabilities } from "./workspace-capabilities";
import {
  buildAttemptObservation,
  buildAttemptEvents,
  strictKeys,
  redactTrackingText,
} from "../../../scripts/generation-tracking-contract.mjs";
import type {
  AdminPrincipal,
  ActorSnapshot,
  AttemptFilters,
} from "../../../src/lib/admin-contracts";
import type { OperationsReadStore } from "../operations/contracts";
import {
  createOperationsStore,
  operationsDatabaseSql,
  OperationsError,
} from "../operations/store";

const WORKSPACE_PREFIX = "/api/admin/onboarding-invites/workspace";
const OPERATION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Deterministic legacy ID derived only from a verified, normalized email. */
export async function legacyAccessId(verifiedEmail: string): Promise<string> {
  const email = verifiedEmail.trim().toLowerCase();
  if (!email) throw new Error("verified email required");
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)),
  );
  return `access:${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Called only after Access audience + allowlist verification, never with browser identity. */
export async function legacyAccessPrincipal(
  verifiedEmail: string,
): Promise<AdminPrincipal> {
  const email = verifiedEmail.trim().toLowerCase();
  if (!email) throw new Error("verified email required");
  return {
    id: await legacyAccessId(email),
    email,
    displayName: email,
    role: "admin",
    authSource: "cloudflare-access",
  };
}

/**
 * Interim read-only identity for the Settings surface. The browser cannot
 * supply any field. A null display name is deliberate: no profile store exists
 * yet, so inventing a person's name would misrepresent this identity.
 */
export type AccessModePrincipal = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin";
  authSource: "cloudflare-access";
};

export async function accessModePrincipal(
  verifiedEmail: string,
): Promise<AccessModePrincipal> {
  const legacy = await legacyAccessPrincipal(verifiedEmail);
  return {
    id: legacy.id,
    email: legacy.email,
    displayName: null,
    role: "admin",
    authSource: "cloudflare-access",
  };
}
export function principalActor(principal: AdminPrincipal): ActorSnapshot {
  return {
    kind: "admin",
    id: principal.id,
    name: principal.displayName,
    email: principal.email,
    source: principal.authSource,
  };
}
// Last-mile defense while trusted producers own ingestion redaction. Only measured
// GitHub run/issue evidence is exposed; private review/asset links never cross here.
function safeText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return redactTrackingText(value, 10000)?.replace(
    /https?:\/\/[^\s<>"']+/giu,
    (url) =>
      /^https:\/\/github\.com\/WrazyAI\/launchloom\/(?:actions\/runs\/\d+(?:\/attempts\/\d+)?|issues\/\d+|pull\/\d+)\/?$/iu.test(
        url,
      )
        ? url
        : "[link redacted]",
  );
}

// Client site links are operational evidence, not free text. Validate them at
// the field level instead of passing them through the global URL redactor.
function safeSiteLink(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    const allowedHost =
      url.hostname === "launchloom.wrazyos.com" ||
      url.hostname.endsWith(".wrazyos.com") ||
      url.hostname.endsWith(".pages.dev");
    if (
      url.protocol !== "https:" ||
      !allowedHost ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return "[link redacted]";
    return url.href;
  } catch {
    return "[link redacted]";
  }
}

const SITE_URL_FIELDS = new Set(["previewUrl", "productionUrl", "siteUrl"]);

/** Fixed contract reason codes only. Never surface a raw validation message. */
function trackingReason(error: unknown) {
  if (!(error instanceof Error) || !("reason" in error)) return null;
  const reason = (error as Error & { reason?: unknown }).reason;
  return typeof reason === "string" && /^[a-z_]{1,32}$/u.test(reason)
    ? reason
    : null;
}

/** The router authenticates the existing tracking secret before this boundary. */
export async function attemptIngest(
  request: Request,
  env: Env,
  reconciliation = false,
) {
  if (request.method !== "POST")
    return workspaceError("method_not_allowed", "Use POST.", 405);
  if (Number(request.headers.get("Content-Length")) > 512000)
    return workspaceError("too_large", "Payload too large.", 413);
  try {
    // Stream bound as well as declared length. Never buffer unbounded private text.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("invalid body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 512000) {
        await reader.cancel();
        return workspaceError("too_large", "Payload too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    strictKeys(
      body,
      reconciliation
        ? ["attempts", "checkpoint", "health"]
        : ["observation", "events"],
    );
    const entries = reconciliation ? body.attempts : [body];
    if (!Array.isArray(entries) || entries.length > 100)
      throw new Error("invalid batch");
    const batch = entries.map((entry: Record<string, unknown>) => {
      strictKeys(entry, ["observation", "events"]);
      const observation = buildAttemptObservation(entry.observation);
      if (reconciliation && observation.source !== "github-reconcile")
        throw new Error("invalid source");
      return {
        observation,
        events: buildAttemptEvents(entry.events, observation),
      };
    });
    let sync;
    if (reconciliation) {
      strictKeys(body.health, [
        "lastSyncAt",
        "coverageStart",
        "partial",
        "lastError",
      ]);
      const h = body.health;
      for (const key of ["lastSyncAt", "coverageStart"])
        if (h[key] !== null && (!Number.isSafeInteger(h[key]) || h[key] < 0))
          throw new Error("invalid health");
      if (
        typeof h.partial !== "boolean" ||
        (h.lastError !== null && typeof h.lastError !== "string") ||
        (body.checkpoint !== null &&
          (typeof body.checkpoint !== "string" ||
            body.checkpoint.length > 2000))
      )
        throw new Error("invalid health");
      if (body.checkpoint !== null) {
        const c = JSON.parse(body.checkpoint);
        strictKeys(c, ["workflow", "page", "from", "partial"]);
        if (
          !Number.isInteger(c.workflow) ||
          c.workflow < 0 ||
          c.workflow > 1 ||
          !Number.isInteger(c.page) ||
          c.page < 1 ||
          c.page > 100000 ||
          !Number.isSafeInteger(c.from) ||
          c.from < 0 ||
          (c.partial !== undefined && typeof c.partial !== "boolean")
        )
          throw new Error("invalid checkpoint");
      }
      sync = {
        checkpoint: body.checkpoint,
        health: {
          lastSyncAt: h.lastSyncAt,
          coverageStart: h.coverageStart,
          partial: h.partial,
          lastError: redactTrackingText(h.lastError),
        },
      };
    }
    const result = await env.GENERATION_LEDGER.getByName(
      "launchloom-generations",
    ).ingestObservations(batch, sync);
    if (!result.ok)
      return workspaceError(
        result.code,
        result.code === "conflict"
          ? "Record evidence conflicts."
          : result.code === "invalid_input"
            ? "Invalid tracking evidence."
            : "Tracking data temporarily unavailable.",
        result.code === "conflict"
          ? 409
          : result.code === "invalid_input"
            ? 400
            : 503,
      );
    return json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("conflict:"))
      return workspaceError("conflict", "Record evidence conflicts.", 409);
    const reason = trackingReason(error);
    return workspaceError(
      "invalid_input",
      reason
        ? `Invalid tracking evidence: ${reason}.`
        : "Invalid tracking evidence.",
      400,
    );
  }
}
const json = (
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(
    JSON.stringify(body, (key, value) =>
      SITE_URL_FIELDS.has(key) ? safeSiteLink(value) : safeText(value),
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
      },
    },
  );
export const workspaceError = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/**
 * Authenticated read-only current-operations API. The browser never receives a
 * database connection, provider text, intake payload, consent record or email.
 * Existing readonly reconciliation controls remain in operationsAdminApi.
 */
export async function operationsDashboardApi(
  request: Request,
  env: Env,
  principal: { id?: string; role?: string } | null | undefined,
  store?: OperationsReadStore,
) {
  if (!principal?.id || !["admin", "owner"].includes(principal.role ?? ""))
    return workspaceError("forbidden", "Admin access required.", 403);
  if (request.method !== "GET")
    return workspaceError("method_not_allowed", "Use GET.", 405);
  if (!workspaceCapabilities(env).operationsRead)
    return workspaceError(
      "not_enabled",
      "Current operations are not enabled in this environment.",
      503,
    );
  const suffix = new URL(request.url).pathname.slice(WORKSPACE_PREFIX.length);
  const list = suffix === "/operations/records";
  const detailMatch = /^\/operations\/records\/(.+)$/u.exec(suffix);
  const detail =
    detailMatch && OPERATION_UUID.test(detailMatch[1]) ? detailMatch[1] : null;
  if (!list && !detail)
    return workspaceError("not_found", "Route not found.", 404);
  const url = new URL(request.url);
  const query = url.searchParams;
  let limit = 50;
  if (query.has("limit")) {
    if (!/^\d+$/u.test(query.get("limit") ?? ""))
      return workspaceError("invalid_input", "Invalid query.", 400);
    limit = Number(query.get("limit"));
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      return workspaceError("invalid_input", "Invalid query.", 400);
  }
  const cursor = query.get("cursor");
  if (
    cursor !== null &&
    (!/^[A-Za-z0-9_-]{1,1024}$/u.test(cursor) || cursor.length < 1)
  )
    return workspaceError("invalid_input", "Invalid query.", 400);
  try {
    const reader =
      store ??
      createOperationsStore(
        operationsDatabaseSql(env.OPERATIONS_DATABASE_URL!),
      );
    if (list) {
      const page = await reader.listOperations(limit, cursor);
      return json(
        {
          ...page,
          recordSource: "operations",
          readOnly: true,
        },
        200,
        { "X-LaunchLoom-Record-Source": "operations" },
      );
    }
    if (!detail)
      return workspaceError("not_found", "Operation not found.", 404);
    const operation = await reader.getOperation(detail);
    if (!operation)
      return workspaceError("not_found", "Operation not found.", 404);
    return json(
      {
        operation,
        recordSource: "operations",
        readOnly: true,
      },
      200,
      { "X-LaunchLoom-Record-Source": "operations" },
    );
  } catch (error) {
    if (error instanceof OperationsError) {
      if (error.code === "invalid")
        return workspaceError("invalid_input", "Invalid query.", 400);
      if (error.code === "not_found")
        return workspaceError("not_found", "Operation not found.", 404);
    }
    return workspaceError(
      "unavailable",
      "Current operations are temporarily unavailable.",
      503,
    );
  }
}

/** Read-only operational APIs. No issue reads/creation, projection writes, dispatch or mail. */
export async function workspaceApi(
  request: Request,
  env: Env,
  verifiedEmail = "",
) {
  if (request.method !== "GET")
    return workspaceError("method_not_allowed", "Use GET.", 405);
  const url = new URL(request.url);
  let suffix = url.pathname.slice(WORKSPACE_PREFIX.length);
  if (suffix === "/legacy" || suffix.startsWith("/legacy/"))
    suffix = suffix.slice("/legacy".length) || "/";
  // Every existing ledger read is legacy history. There is deliberately no
  // browser-accessible write, projection or dispatch path here.
  const legacyMeta = {
    recordSource: "legacy" as const,
    readOnly: true as const,
  };
  const legacyHeaders = { "X-LaunchLoom-Record-Source": "legacy" };
  if (suffix === "/me") {
    if (env.ADMIN_AUTH_MODE === "neon")
      return workspaceError(
        "not_enabled",
        "Persistent account profiles are not enabled.",
        503,
      );
    if (!verifiedEmail)
      return workspaceError("signed_out", "Sign in required.", 401);
    return json({
      principal: await accessModePrincipal(verifiedEmail),
      capabilities: workspaceCapabilities(env),
    });
  }
  try {
    const ledger = env.GENERATION_LEDGER.getByName("launchloom-generations");
    const coordinator = env.ONBOARDING_INVITES.getByName(
      "launchloom-onboarding-invites",
    );
    const query = Object.fromEntries(url.searchParams);
    const number = (key: string) => {
      if (!(key in query)) return undefined;
      if (!/^\d+$/u.test(query[key])) throw new Error(`invalid ${key}`);
      const n = Number(query[key]);
      if (!Number.isSafeInteger(n)) throw new Error(`invalid ${key}`);
      return n;
    };
    const attention =
      query.attention === undefined
        ? undefined
        : query.attention === "true"
          ? true
          : query.attention === "false"
            ? false
            : (() => {
                throw new Error("invalid attention");
              })();
    const filters = {
      ...query,
      attention,
      limit: number("limit"),
      from: number("from"),
      to: number("to"),
    };
    const combinedHealth = async () => {
      const [health, projection, acceptance] = await Promise.all([
        ledger.getHealth(),
        coordinator.projectionHealth(),
        coordinator.acceptanceHealth(),
      ]);
      return {
        ...health,
        partial:
          health.partial || projection.partial || acceptance.attentionCount > 0,
        pendingProjectionCount: projection.pendingProjectionCount,
        lastError:
          projection.lastError ?? acceptance.lastError ?? health.lastError,
        acceptanceRecovery: acceptance,
      };
    };
    if (suffix === "/health")
      return json(
        { ...(await combinedHealth()), ...legacyMeta },
        200,
        legacyHeaders,
      );
    if (suffix === "/attempts")
      return json(
        {
          ...(await ledger.listAttempts(filters as AttemptFilters)),
          ...legacyMeta,
        },
        200,
        legacyHeaders,
      );
    if (suffix === "/invites") return json(await coordinator.listPage(filters));
    if (suffix === "/clients") {
      const [page, health] = await Promise.all([
        ledger.listClients(filters),
        combinedHealth(),
      ]);
      // Additive coverage metadata: consumers must not present partial directory as complete.
      return json({ ...page, health, ...legacyMeta }, 200, legacyHeaders);
    }
    const match = /^\/(attempts|clients)\/([^/]+)(\/events)?$/u.exec(suffix);
    if (match) {
      let id: string;
      try {
        id = decodeURIComponent(match[2]);
      } catch {
        throw new Error("invalid id");
      }
      if (match[1] === "clients" && !match[3]) {
        const client = await ledger.getClient(id);
        return client
          ? json({ client, ...legacyMeta }, 200, legacyHeaders)
          : workspaceError("not_found", "Client not found.", 404);
      }
      if (match[1] === "attempts") {
        const attempt = await ledger.getAttempt(id);
        if (!attempt)
          return workspaceError("not_found", "Attempt not found.", 404);
        return json(
          match[3]
            ? {
                ...(await ledger.getAttemptEvents(
                  id,
                  query.cursor,
                  filters.limit,
                )),
                ...legacyMeta,
              }
            : { attempt, ...legacyMeta },
          200,
          legacyHeaders,
        );
      }
    }
    return workspaceError("not_found", "Route not found.", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/invalid /u.test(message))
      return workspaceError("invalid_input", "Invalid query or cursor.", 400);
    if (/conflict:/u.test(message))
      return workspaceError("conflict", "Record evidence conflicts.", 409);
    return workspaceError(
      "unavailable",
      "Workspace data is temporarily unavailable.",
      503,
    );
  }
}
