import type { IntakeRecord, OperationsStore, RunIdentity } from "./contracts";
import { operationsStoreFromEnv } from "./acceptance";

/**
 * Trusted GitHub Actions run identity boundary.
 *
 * A GitHub OIDC token is only a claim about the run that requested it. The
 * deployment therefore verifies the exact published key, issuer, audience,
 * immutable repository ID, workflow path/ref and event before deriving any
 * identity. A caller-supplied run ID is never accepted as evidence.
 */
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GITHUB_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
export const OPERATIONS_REPOSITORY = "WrazyAI/launchloom";
export const OPERATIONS_WORKFLOW_PATH = ".github/workflows/generate-client.yml";
export const OPERATIONS_REF = "refs/heads/main";
export const OPERATIONS_EVENT = "workflow_dispatch";
export const OPERATIONS_WORKFLOW_REF =
  `${OPERATIONS_REPOSITORY}/${OPERATIONS_WORKFLOW_PATH}@${OPERATIONS_REF}`;
/** Requested by the workflow when it asks GitHub for an ID token. */
export const OPERATIONS_OIDC_AUDIENCE = "launchloom-operations";

const MAX_TOKEN_LENGTH = 8_192;
const KEY_CACHE_MILLISECONDS = 5 * 60 * 1000;
const DEFAULT_MAX_TOKEN_AGE_SECONDS = 600;
const CLOCK_SKEW_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$/u;
const EVENT_FIELD = /^[a-z0-9_]{1,80}$/u;
const SAFE_LABEL = /^[A-Za-z0-9._:/-]{1,120}$/u;

export type GitHubOidcKey = {
  kty: "RSA";
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

/**
 * The trust policy is built from fixed repository constants plus two required
 * deployment settings. `keys`, `fetch` and `now` exist so the verifier can be
 * exercised against a synthetic key ring without contacting GitHub.
 */
export type WorkflowPolicy = {
  issuer: string;
  audience: string;
  repositoryId: string;
  repository: string;
  workflowRef: string;
  ref: string;
  eventName: string;
  maxTokenAgeSeconds?: number;
  now?: () => number;
  keys?: GitHubOidcKey[];
  fetch?: typeof fetch;
};

export type OperationsAuthErrorCode =
  | "not_configured"
  | "malformed"
  | "invalid_signature"
  | "keys_unavailable"
  | "claims"
  | "issuer"
  | "audience"
  | "subject"
  | "repository"
  | "workflow"
  | "ref"
  | "event"
  | "run"
  | "expired"
  | "not_yet_valid"
  | "issued_in_future"
  | "stale";

export class OperationsAuthError extends Error {
  constructor(readonly code: OperationsAuthErrorCode) {
    super("The GitHub run identity is not trusted.");
    this.name = "OperationsAuthError";
  }
}

function deny(code: OperationsAuthErrorCode): never {
  throw new OperationsAuthError(code);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) deny("malformed");
  try {
    const binary = atob(value.replace(/-/gu, "+").replace(/_/gu, "/"));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return deny("malformed");
  }
}

function decodeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
    if (!record(parsed)) deny("malformed");
    return parsed;
  } catch (error) {
    if (error instanceof OperationsAuthError) throw error;
    return deny("malformed");
  }
}

function numericClaim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The required deployment settings. Fixed identity constants are not env-overridable. */
export function operationsWorkflowPolicy(env: {
  OPERATIONS_OIDC_AUDIENCE?: string;
  OPERATIONS_OIDC_REPOSITORY_ID?: string;
}): WorkflowPolicy {
  const audience = env.OPERATIONS_OIDC_AUDIENCE?.trim() || "";
  const repositoryId = env.OPERATIONS_OIDC_REPOSITORY_ID?.trim() || "";
  if (!/^[A-Za-z0-9._~:/-]{1,200}$/u.test(audience)) deny("not_configured");
  if (!/^[1-9][0-9]{0,19}$/u.test(repositoryId)) deny("not_configured");
  return {
    issuer: GITHUB_OIDC_ISSUER,
    audience,
    repositoryId,
    repository: OPERATIONS_REPOSITORY,
    workflowRef: OPERATIONS_WORKFLOW_REF,
    ref: OPERATIONS_REF,
    eventName: OPERATIONS_EVENT,
  };
}

let keyCache: { keys: GitHubOidcKey[]; expiresAt: number } | undefined;

function validKey(value: unknown): value is GitHubOidcKey {
  return (
    record(value) &&
    value.kty === "RSA" &&
    typeof value.kid === "string" && value.kid.length >= 1 && value.kid.length <= 200 &&
    typeof value.n === "string" && /^[A-Za-z0-9_-]{64,2048}$/u.test(value.n) &&
    typeof value.e === "string" && /^[A-Za-z0-9_-]{1,16}$/u.test(value.e) &&
    (value.alg === undefined || value.alg === "RS256") &&
    (value.use === undefined || value.use === "sig")
  );
}

async function publishedKeys(
  policy: WorkflowPolicy,
  nowSeconds: number,
  refresh: boolean,
): Promise<GitHubOidcKey[]> {
  if (policy.keys) {
    if (!policy.keys.length || !policy.keys.every(validKey)) deny("keys_unavailable");
    return policy.keys;
  }
  const nowMilliseconds = nowSeconds * 1000;
  if (!refresh && keyCache && keyCache.expiresAt > nowMilliseconds) return keyCache.keys;
  let response: Response;
  try {
    response = await (policy.fetch ?? fetch)(GITHUB_OIDC_JWKS_URL, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "LaunchLoom-Operations",
      },
    });
  } catch {
    return deny("keys_unavailable");
  }
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("application/json")) {
    await response.body?.cancel();
    return deny("keys_unavailable");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return deny("keys_unavailable");
  }
  if (!record(body) || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 20)
    return deny("keys_unavailable");
  const keys = body.keys.filter(validKey) as GitHubOidcKey[];
  if (!keys.length) deny("keys_unavailable");
  keyCache = { keys, expiresAt: nowMilliseconds + KEY_CACHE_MILLISECONDS };
  return keys;
}

async function verifySignature(data: string, signature: Uint8Array, key: GitHubOidcKey) {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return deny("keys_unavailable");
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(data),
    );
  } catch {
    valid = false;
  }
  if (!valid) deny("invalid_signature");
}

function exactString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Verifies a GitHub Actions OIDC token against the fixed, trusted workflow
 * policy and returns only the identity proven by its verified claims.
 */
export async function verifyRunIdentity(
  token: string,
  policy: WorkflowPolicy,
): Promise<RunIdentity> {
  if (typeof token !== "string" || token.length < 20 || token.length > MAX_TOKEN_LENGTH)
    deny("malformed");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) deny("malformed");

  const header = decodeJson(parts[0]);
  if (header.alg !== "RS256") deny("malformed");
  const kid = exactString(header.kid);
  if (!kid || kid.length > 200) deny("malformed");

  const now = policy.now ?? Date.now;
  const nowSeconds = Math.floor(now() / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) deny("claims");

  const claims = decodeJson(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  const verify = async (keys: GitHubOidcKey[]) => {
    const key = keys.find((candidate) => candidate.kid === kid);
    if (!key) return false;
    await verifySignature(`${parts[0]}.${parts[1]}`, signature, key);
    return true;
  };
  if (!(await verify(await publishedKeys(policy, nowSeconds, false)))) {
    if (policy.keys) deny("keys_unavailable");
    // A rotated key ring may not be cached yet. Refetch once for an unknown kid.
    if (!(await verify(await publishedKeys(policy, nowSeconds, true))))
      deny("keys_unavailable");
  }

  if (claims.iss !== policy.issuer) deny("issuer");
  if (claims.aud !== policy.audience) deny("audience");

  const expectedSubject = `repo:${policy.repository}:ref:${policy.ref}`;
  if (claims.sub !== expectedSubject) deny("subject");
  if (typeof claims.environment === "string" && claims.environment) deny("subject");

  if (claims.repository !== policy.repository) deny("repository");
  if (claims.repository_id !== policy.repositoryId) deny("repository");

  if (claims.workflow_ref !== policy.workflowRef) deny("workflow");
  if (claims.job_workflow_ref !== undefined && claims.job_workflow_ref !== policy.workflowRef)
    deny("workflow");

  if (claims.ref !== policy.ref) deny("ref");
  if (claims.ref_type !== "branch") deny("ref");
  if (claims.event_name !== policy.eventName) deny("event");

  const runId = exactString(claims.run_id);
  if (!runId || !/^[1-9][0-9]{0,19}$/u.test(runId)) deny("run");
  const runAttempt = numericClaim(claims.run_attempt);
  if (!runAttempt || !Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 2147483647)
    deny("run");

  const expiration = numericClaim(claims.exp);
  if (expiration === undefined) deny("claims");
  if (nowSeconds >= expiration) deny("expired");
  const issuedAt = numericClaim(claims.iat);
  if (issuedAt === undefined) deny("claims");
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) deny("issued_in_future");
  const maxAge = policy.maxTokenAgeSeconds ?? DEFAULT_MAX_TOKEN_AGE_SECONDS;
  if (issuedAt < nowSeconds - maxAge) deny("stale");
  const notBefore = numericClaim(claims.nbf);
  if (notBefore !== undefined && notBefore > nowSeconds + CLOCK_SKEW_SECONDS) deny("not_yet_valid");

  return { repositoryId: claims.repository_id, runId, runAttempt };
}

/* -------------------------------------------------------------------------- */
/* Authenticated operations API                                                */
/* -------------------------------------------------------------------------- */

type OperationsApiEnv = {
  OPERATIONS_OIDC_AUDIENCE?: string;
  OPERATIONS_OIDC_REPOSITORY_ID?: string;
  OPERATIONS_DATABASE_URL?: string;
};
type RouteDependencies = {
  store?: OperationsStore;
  policy?: WorkflowPolicy;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function reply(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function bearer(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.exec(
    authorization,
  );
  return match?.[1];
}

async function trustedRun(
  request: Request,
  env: OperationsApiEnv,
  dependencies: RouteDependencies,
): Promise<RunIdentity> {
  const token = bearer(request);
  if (!token) deny("malformed");
  const policy = dependencies.policy ?? operationsWorkflowPolicy(env);
  return verifyRunIdentity(token, policy);
}

function storeFor(
  env: OperationsApiEnv,
  dependencies: RouteDependencies,
): OperationsStore {
  if (dependencies.store) return dependencies.store;
  try {
    return operationsStoreFromEnv(env);
  } catch {
    deny("not_configured");
  }
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(declared) || declared > 4_096) deny("malformed");
  const text = await request.text();
  if (!text || text.length > 4_096) deny("malformed");
  try {
    const parsed = JSON.parse(text);
    if (!record(parsed)) deny("malformed");
    return parsed;
  } catch (error) {
    if (error instanceof OperationsAuthError) throw error;
    return deny("malformed");
  }
}

function uuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

/** POST /api/internal/operations/claim: bind the verified run before all effects. */
export async function operationsClaim(
  request: Request,
  env: OperationsApiEnv,
  dependencies: RouteDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let identity: RunIdentity;
  let store: OperationsStore;
  try {
    identity = await trustedRun(request, env, dependencies);
    store = storeFor(env, dependencies);
  } catch (error) {
    if (error instanceof OperationsAuthError)
      return reply({ error: error.code === "not_configured" ? "unavailable" : "unauthorized" },
        error.code === "not_configured" ? 503 : 401);
    return reply({ error: "unavailable" }, 503);
  }
  let body: Record<string, unknown>;
  try {
    body = await requestBody(request);
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const operationId = uuid(body.operationId);
  if (!operationId) return reply({ error: "invalid" }, 400);
  // Run identity is derived from the token only. Reject, rather than silently
  // ignore, any attempt to supply identity-shaped fields in the body.
  const allowed = new Set(["operationId", "requestId", "attemptId"]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    return reply({ error: "invalid" }, 400);
  // Optional correlation identifiers are validated but never used as authority.
  for (const key of ["requestId", "attemptId"])
    if (body[key] !== undefined && !uuid(body[key])) return reply({ error: "invalid" }, 400);

  try {
    const result = await store.claimRun(operationId, identity);
    if (result === "duplicate") return reply({ status: "duplicate" }, 409);
    if (result !== "claimed") return reply({ status: "attention" }, 409);
    const claimed = await store.getClaimedOperation(operationId, identity);
    if (
      !claimed ||
      !uuid(claimed.intakeId) || !uuid(claimed.requestId) || !uuid(claimed.attemptId)
    )
      return reply({ status: "attention" }, 409);
    return reply({
      status: "claimed",
      operationId,
      intakeId: claimed.intakeId,
      requestId: claimed.requestId,
      attemptId: claimed.attemptId,
    });
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

/** GET /api/internal/operations/intakes/:id: only the winning run may read it. */
export async function operationsIntake(
  request: Request,
  env: OperationsApiEnv,
  intakeId: string,
  dependencies: RouteDependencies = {},
): Promise<Response> {
  if (request.method !== "GET") return reply({ error: "method_not_allowed" }, 405);
  if (!uuid(intakeId)) return reply({ error: "invalid" }, 400);
  let identity: RunIdentity;
  let store: OperationsStore;
  try {
    identity = await trustedRun(request, env, dependencies);
    store = storeFor(env, dependencies);
  } catch (error) {
    if (error instanceof OperationsAuthError)
      return reply({ error: error.code === "not_configured" ? "unavailable" : "unauthorized" },
        error.code === "not_configured" ? 503 : 401);
    return reply({ error: "unavailable" }, 503);
  }
  let intake: IntakeRecord | null;
  try {
    intake = await store.getIntakeForRun(intakeId, identity);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
  if (!intake || intake.acceptanceState !== "confirmed") return reply({ error: "not_found" }, 404);
  return reply({
    schemaVersion: 1,
    intakeId: intake.intakeId,
    requestId: intake.requestId,
    attemptId: intake.attemptId,
    operationId: intake.operationId,
    profile: intake.profile,
    payloadVersion: intake.payloadVersion,
    payload: intake.payload,
  });
}

/* -------------------------------------------------------------------------- */
/* Authenticated stage events (expanded by the reconciliation task)            */
/* -------------------------------------------------------------------------- */

export type RunStageEvent = {
  eventKey: string;
  stage: string;
  transition: string;
  occurredAt?: string;
  detailCode?: string;
  provider?: string;
  model?: string;
  costKind?: "actual" | "estimated" | "unreported";
  amount?: string;
  currency?: string;
};

function stageEvent(value: Record<string, unknown>): RunStageEvent | undefined {
  const eventKey = exactString(value.eventKey);
  const stage = exactString(value.stage);
  const transition = exactString(value.transition);
  if (!eventKey || eventKey.length > 200 || /[\u0000-\u001f\u007f]/u.test(eventKey)) return undefined;
  if (!stage || !EVENT_FIELD.test(stage) || !transition || !EVENT_FIELD.test(transition))
    return undefined;
  const event: RunStageEvent = { eventKey, stage, transition };
  if (value.occurredAt !== undefined) {
    const occurredAt = exactString(value.occurredAt);
    if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) return undefined;
    event.occurredAt = occurredAt;
  }
  if (value.detailCode !== undefined) {
    const detail = exactString(value.detailCode);
    if (!detail || !EVENT_FIELD.test(detail)) return undefined;
    event.detailCode = detail;
  }
  for (const key of ["provider", "model"] as const) {
    if (value[key] === undefined) continue;
    const label = exactString(value[key]);
    if (!label || !SAFE_LABEL.test(label)) return undefined;
    event[key] = label;
  }
  const costKind = value.costKind ?? "unreported";
  if (!["actual", "estimated", "unreported"].includes(String(costKind))) return undefined;
  event.costKind = costKind as RunStageEvent["costKind"];
  if (costKind === "unreported") {
    if (value.amount !== undefined || value.currency !== undefined) return undefined;
    return event;
  }
  const amount = exactString(value.amount);
  const currency = exactString(value.currency);
  if (!amount || !DECIMAL.test(amount) || !currency || !/^[A-Z]{3}$/u.test(currency))
    return undefined;
  event.amount = amount;
  event.currency = currency;
  return event;
}

/** POST /api/internal/operations/events: a stage write fenced to the claiming run. */
export async function operationsEvent(
  request: Request,
  env: OperationsApiEnv,
  dependencies: RouteDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let identity: RunIdentity;
  let store: OperationsStore;
  try {
    identity = await trustedRun(request, env, dependencies);
    store = storeFor(env, dependencies);
  } catch (error) {
    if (error instanceof OperationsAuthError)
      return reply({ error: error.code === "not_configured" ? "unavailable" : "unauthorized" },
        error.code === "not_configured" ? 503 : 401);
    return reply({ error: "unavailable" }, 503);
  }
  let body: Record<string, unknown>;
  try {
    body = await requestBody(request);
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const attemptId = uuid(body.attemptId);
  const event = stageEvent(body);
  const allowed = new Set([
    "attemptId", "eventKey", "stage", "transition", "occurredAt",
    "detailCode", "provider", "model", "costKind", "amount", "currency",
  ]);
  if (
    !attemptId ||
    !event ||
    Object.keys(body).some((key) => !allowed.has(key))
  )
    return reply({ error: "invalid" }, 400);
  try {
    const result = await store.appendEvent(attemptId, identity, event);
    if (result === "attention") return reply({ status: "attention" }, 409);
    return reply({ status: result });
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
