import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createPrivacyPolicy,
  TRACE_LIMITS,
} from "../src/lib/generation-activity-contract.mjs";
import { createActivityProducer } from "./generation-activity-client.mjs";
import { apiOrigin, requestOidcToken } from "./operations-client.mjs";

const SECRET_NAME =
  /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|SIGNATURE|PRIVATE)/iu;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LEGACY_ATTEMPT = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,199}$/u;

export function collectSensitiveValues(env = process.env) {
  const values = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < 8) continue;
    if (name.startsWith("PUBLIC_")) continue;
    if (!SECRET_NAME.test(name)) continue;
    values.push(value);
  }
  return values;
}

/**
 * Resolve the trace identity from the trusted runner environment. The namespace
 * is explicit: operation-mode runs carry OPERATION_ID, legacy runs do not.
 */
export function activityIdentity(env = process.env) {
  const attemptId = String(env.TRACK_ATTEMPT || "").trim();
  if (!attemptId) return null;
  const namespace = env.OPERATION_ID ? "operations" : "legacy";
  if (namespace === "operations" && !UUID.test(attemptId)) return null;
  if (namespace === "legacy" && !LEGACY_ATTEMPT.test(attemptId)) return null;
  const producerId = UUID.test(
    String(env.GENERATION_ACTIVITY_PRODUCER_ID || ""),
  )
    ? String(env.GENERATION_ACTIVITY_PRODUCER_ID)
    : crypto.randomUUID();
  return { namespace, attemptId, producerId };
}

export function createActivityTransport({
  env = process.env,
  identity,
  fetchImpl = fetch,
}) {
  const api = apiOrigin(
    env.OPERATIONS_API_URL ||
      env.LAUNCHLOOM_API_URL ||
      "https://api.launchloom.wrazyos.com",
  );
  const audience = env.OPERATIONS_OIDC_AUDIENCE || "launchloom-operations";
  // Reuse the short-lived OIDC token across sends. Acquiring a fresh token for
  // every batch can exceed the delivery deadline on a cold runner.
  let cached = null;
  async function token() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const value = await requestOidcToken({ audience, env, fetchImpl });
    let expiresAt = Date.now() + 4 * 60_000;
    try {
      const payload = JSON.parse(
        Buffer.from(value.split(".")[1], "base64url").toString("utf8"),
      );
      if (Number.isSafeInteger(payload?.exp))
        expiresAt = payload.exp * 1000;
    } catch {
      // Keep the bounded conservative fallback.
    }
    cached = { value, expiresAt };
    return value;
  }
  return {
    async send(events, { signal } = {}) {
      const bearer = await token();
      const response = await fetchImpl(
        `${api}/api/internal/generation-activity`,
        {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "User-Agent": "LaunchLoom-Activity",
          },
          body: JSON.stringify({
            identity: {
              namespace: identity.namespace,
              attemptId: identity.attemptId,
            },
            events,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Controlled status/code only. Never log the token, body or evidence.
        console.warn(
          `generation_activity_delivery=rejected status=${response.status} code=${
            body?.error?.code || "unknown"
          }`,
        );
      }
      return {
        status: response.status,
        suppressed: body?.suppressed === true,
        expired: body?.expired === true,
      };
    },
  };
}

/** One bounded sanitized file at a time; never a durable delivery queue. */
export function createFileSpool({
  dir,
  fsImpl = fs,
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
}) {
  let written = null;
  return {
    async write(events) {
      await fsImpl.mkdir(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `batch-${now()}-${randomUUID()}.json`);
      await fsImpl.writeFile(file, JSON.stringify(events), { mode: 0o600 });
      if (written) await fsImpl.rm(written, { force: true });
      written = file;
    },
    async clear() {
      if (!written) return;
      await fsImpl.rm(written, { force: true });
      written = null;
    },
  };
}

export function noopActivityProducer() {
  const noop = {
    context: () => null,
    withContext: () => noop,
    addSensitiveValues: () => {},
    emit: () => false,
    flush: async () => {},
    close: async () => {},
    stats: () => ({
      disabled: true,
      queued: 0,
      queueBytes: 0,
      dropped: 0,
      rejected: 0,
      suppressed: false,
      lastHeartbeatAt: null,
      closed: false,
    }),
  };
  return noop;
}

/**
 * Build the producer for one runner process. Disabled or incomplete
 * configuration yields a no-op so generation behavior is unchanged.
 */
export function activityFromEnv(
  env = process.env,
  semantic = {},
  dependencies = {},
) {
  if (env.GENERATION_ACTIVITY_ENABLED !== "true") return noopActivityProducer();
  const identity = activityIdentity(env);
  if (!identity) return noopActivityProducer();
  const {
    fetchImpl = fetch,
    clock = undefined,
    spoolDir = env.RUNNER_TEMP
      ? path.join(env.RUNNER_TEMP, `launchloom-activity-${identity.producerId}`)
      : null,
    transport,
    fsImpl = fs,
  } = dependencies;
  const privacy = createPrivacyPolicy({
    allowSourceText: true,
    sensitiveValues: [
      ...collectSensitiveValues(env),
      ...(Array.isArray(semantic.sensitiveValues)
        ? semantic.sensitiveValues
        : []),
    ],
  });
  return createActivityProducer({
    context: {
      ...identity,
      stage: semantic.stage || "workflow",
      substep: semantic.substep ?? null,
      taskId: semantic.taskId ?? null,
      parentTaskId: semantic.parentTaskId ?? null,
      candidateId: semantic.candidateId ?? null,
      repairPass: semantic.repairPass ?? null,
      actor: semantic.actor || { kind: "orchestrator", role: "workflow" },
    },
    privacy,
    transport:
      transport ?? createActivityTransport({ env, identity, fetchImpl }),
    spool: spoolDir ? createFileSpool({ dir: spoolDir, fsImpl }) : undefined,
    clock,
    limits: TRACE_LIMITS,
  });
}

let processProducer = null;

/**
 * One producer per Node process for script-scoped instrumentation. Flushes on
 * normal event-loop drain; a hard termination loses unflushed events, which
 * stays visible as incomplete coverage rather than a durability claim.
 */
export function processActivity(semantic = {}, dependencies = {}) {
  if (processProducer) return processProducer;
  processProducer = activityFromEnv(process.env, semantic, dependencies);
  process.once("beforeExit", () => {
    void processProducer.close();
  });
  return processProducer;
}

/** Test-only reset hook; never used by production scripts. */
export function resetProcessActivity() {
  processProducer = null;
}
