import type { Env } from "../index";
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

const SITE_URL_FIELDS = new Set(["previewUrl", "productionUrl"]);

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
    return workspaceError("invalid_input", "Invalid tracking evidence.", 400);
  }
}
const json = (body: unknown, status = 200) =>
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
      },
    },
  );
export const workspaceError = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/** Read-only operational APIs. No issue reads/creation, projection writes, dispatch or mail. */
export async function workspaceApi(
  request: Request,
  env: Env,
  verifiedEmail = "",
) {
  if (request.method !== "GET")
    return workspaceError("method_not_allowed", "Use GET.", 405);
  const url = new URL(request.url);
  const suffix = url.pathname.slice(
    "/api/admin/onboarding-invites/workspace".length,
  );
  if (suffix === "/me") {
    if (env.ADMIN_AUTH_MODE === "neon")
      return workspaceError(
        "not_enabled",
        "Persistent account profiles are not enabled.",
        503,
      );
    if (!verifiedEmail)
      return workspaceError("signed_out", "Sign in required.", 401);
    return json({ principal: await accessModePrincipal(verifiedEmail) });
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
      const [health, projection] = await Promise.all([
        ledger.getHealth(),
        coordinator.projectionHealth(),
      ]);
      return {
        ...health,
        partial: health.partial || projection.partial,
        pendingProjectionCount: projection.pendingProjectionCount,
        lastError: projection.lastError ?? health.lastError,
      };
    };
    if (suffix === "/health") return json(await combinedHealth());
    if (suffix === "/attempts")
      return json(await ledger.listAttempts(filters as AttemptFilters));
    if (suffix === "/invites") return json(await coordinator.listPage(filters));
    if (suffix === "/clients") {
      const [page, health] = await Promise.all([
        ledger.listClients(filters),
        combinedHealth(),
      ]);
      // Additive coverage metadata: consumers must not present partial directory as complete.
      return json({ ...page, health });
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
          ? json({ client })
          : workspaceError("not_found", "Client not found.", 404);
      }
      if (match[1] === "attempts") {
        const attempt = await ledger.getAttempt(id);
        if (!attempt)
          return workspaceError("not_found", "Attempt not found.", 404);
        return json(
          match[3]
            ? await ledger.getAttemptEvents(id, query.cursor, filters.limit)
            : { attempt },
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
