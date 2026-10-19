import type { Env } from "../index";
import type {
  AdminPrincipal,
  ActorSnapshot,
  AttemptFilters,
} from "../../../src/lib/admin-contracts";

/** Called only after Access audience + allowlist verification, never with browser identity. */
export async function legacyAccessPrincipal(
  verifiedEmail: string,
): Promise<AdminPrincipal> {
  const email = verifiedEmail.trim().toLowerCase();
  if (!email) throw new Error("verified email required");
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)),
  );
  return {
    id: `access:${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
    email,
    displayName: email,
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
  return value.replace(/https?:\/\/[^\s<>"']+/giu, (url) =>
    /^https:\/\/github\.com\/WrazyAI\/launchloom\/(?:actions\/runs\/\d+|issues\/\d+|pull\/\d+)\/?$/iu.test(
      url,
    )
      ? url
      : "[link redacted]",
  );
}
const json = (body: unknown, status = 200) =>
  new Response(
    JSON.stringify(body, (_key, value) => safeText(value)),
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
export async function workspaceApi(request: Request, env: Env) {
  if (request.method !== "GET")
    return workspaceError("method_not_allowed", "Use GET.", 405);
  const url = new URL(request.url);
  const suffix = url.pathname.slice(
    "/api/admin/onboarding-invites/workspace".length,
  );
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
    const filters = {
      ...query,
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
