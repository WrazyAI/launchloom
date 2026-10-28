#!/usr/bin/env node
/**
 * Authenticated client for new-mode Postgres generation runs.
 *
 * The workflow passes only opaque identifiers. This script asks GitHub Actions
 * for a short-lived OIDC token, presents it to the Worker, and never prints the
 * token, intake payload or provider response body. Duplicate or non-owning
 * claims exit before the workflow loads the intake, calls a model, creates a
 * repository or deploys anything.
 */
import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONS_DEFAULT_AUDIENCE = "launchloom-operations";
export const EXIT = Object.freeze({
  ok: 0,
  usage: 2,
  duplicate: 3,
  attention: 4,
  unauthorized: 5,
  unavailable: 6,
  oidc: 7,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_TIMEOUT_MILLISECONDS = 15_000;

export class OperationsClientError extends Error {
  constructor(code, exitCode) {
    super(code);
    this.name = "OperationsClientError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, exitCode) {
  throw new OperationsClientError(code, exitCode);
}

export function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (typeof flag !== "string" || !flag.startsWith("--"))
      fail("invalid_option", EXIT.usage);
    const name = flag.slice(2);
    if (!name || Object.hasOwn(options, name)) fail("invalid_option", EXIT.usage);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) fail("missing_value", EXIT.usage);
    options[name] = value;
    index += 1;
  }
  return options;
}

export function apiOrigin(value) {
  let url;
  try {
    url = new URL(String(value ?? ""));
  } catch {
    fail("invalid_api", EXIT.usage);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    fail("invalid_api", EXIT.usage);
  return url.origin;
}

function requireUuid(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !UUID.test(value)) fail("invalid_identifier", EXIT.usage);
  return value;
}

function cleanLabel(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`invalid_${name}`, EXIT.usage);
  return value;
}

async function jsonBody(response) {
  if (!String(response.headers.get("content-type") || "").includes("application/json"))
    return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function post(api, pathname, token, body, fetchImpl) {
  return fetchImpl(`${api}${pathname}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(MAX_TIMEOUT_MILLISECONDS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "LaunchLoom-Operations-Client",
    },
    body: JSON.stringify(body),
  });
}

async function get(api, pathname, token, fetchImpl) {
  return fetchImpl(`${api}${pathname}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(MAX_TIMEOUT_MILLISECONDS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "LaunchLoom-Operations-Client",
    },
  });
}

/** Requests a short-lived token from the Actions OIDC endpoint only. */
export async function requestOidcToken({
  audience = OPERATIONS_DEFAULT_AUDIENCE,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) fail("oidc_unavailable", EXIT.oidc);
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    fail("oidc_unavailable", EXIT.oidc);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pipelines.actions.githubusercontent.com" ||
    url.username ||
    url.password ||
    url.hash
  )
    fail("oidc_unavailable", EXIT.oidc);
  url.searchParams.set("audience", audience);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${requestToken}`,
        Accept: "application/json",
        "User-Agent": "LaunchLoom-Operations-Client",
      },
    });
  } catch {
    fail("oidc_unavailable", EXIT.oidc);
  }
  if (!response.ok) {
    await response.body?.cancel();
    fail("oidc_unavailable", EXIT.oidc);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail("oidc_unavailable", EXIT.oidc);
  }
  const value = payload?.value;
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 8_192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)
  )
    fail("oidc_unavailable", EXIT.oidc);
  return value;
}

/** Claims an operation. The Worker derives the run identity from the token. */
export async function claimGenerationRun({
  api,
  operationId,
  requestId,
  attemptId,
  token,
  fetchImpl = fetch,
}) {
  const body = { operationId };
  if (requestId) body.requestId = requestId;
  if (attemptId) body.attemptId = attemptId;
  let response;
  try {
    response = await post(api, "/api/internal/operations/claim", token, body, fetchImpl);
  } catch {
    fail("claim_unavailable", EXIT.unavailable);
  }
  if (response.status === 401) fail("claim_unauthorized", EXIT.unauthorized);
  if (response.status === 409) {
    const result = await jsonBody(response);
    if (result?.status === "duplicate") fail("claim_duplicate", EXIT.duplicate);
    fail("claim_attention", EXIT.attention);
  }
  if (response.status !== 200) fail("claim_unavailable", EXIT.unavailable);
  const result = await jsonBody(response);
  if (
    result?.status !== "claimed" ||
    !UUID.test(result.operationId || "") ||
    !UUID.test(result.intakeId || "") ||
    !UUID.test(result.requestId || "") ||
    !UUID.test(result.attemptId || "")
  )
    fail("claim_unavailable", EXIT.unavailable);
  return result;
}

/** Fetches private intake content for the winning run. Never prints the body. */
export async function fetchGenerationIntake({ api, intakeId, token, fetchImpl = fetch }) {
  let response;
  try {
    response = await get(api, `/api/internal/operations/intakes/${intakeId}`, token, fetchImpl);
  } catch {
    fail("intake_unavailable", EXIT.unavailable);
  }
  if (response.status === 401) fail("intake_unauthorized", EXIT.unauthorized);
  if (response.status === 404) fail("intake_not_found", EXIT.unavailable);
  if (response.status !== 200) fail("intake_unavailable", EXIT.unavailable);
  const result = await jsonBody(response);
  const payload = result?.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    result?.intakeId !== intakeId
  )
    fail("intake_unavailable", EXIT.unavailable);
  return result;
}

/** Appends one stage event to the claiming run. */
export async function appendGenerationEvent({
  api,
  attemptId,
  event,
  token,
  fetchImpl = fetch,
}) {
  let response;
  try {
    response = await post(
      api,
      "/api/internal/operations/events",
      token,
      { attemptId, ...event },
      fetchImpl,
    );
  } catch {
    fail("event_unavailable", EXIT.unavailable);
  }
  if (response.status === 401) fail("event_unauthorized", EXIT.unauthorized);
  if (response.status === 409) fail("event_attention", EXIT.attention);
  if (response.status !== 200) fail("event_unavailable", EXIT.unavailable);
  const result = await jsonBody(response);
  if (!["inserted", "duplicate"].includes(result?.status))
    fail("event_unavailable", EXIT.unavailable);
  return result.status;
}

function eventFrom(options) {
  const event = {
    eventKey: cleanLabel(options["event-key"], "event_key", /^[A-Za-z0-9:._/-]{1,200}$/u),
    stage: cleanLabel(options.stage, "stage", /^[a-z0-9_]{1,80}$/u),
    transition: cleanLabel(options.transition, "transition", /^[a-z0-9_]{1,80}$/u),
  };
  if (options["detail-code"] !== undefined)
    event.detailCode = cleanLabel(options["detail-code"], "detail_code", /^[a-z0-9_]{1,80}$/u);
  if (options.provider !== undefined)
    event.provider = cleanLabel(options.provider, "provider", /^[A-Za-z0-9._:/-]{1,120}$/u);
  if (options.model !== undefined)
    event.model = cleanLabel(options.model, "model", /^[A-Za-z0-9._:/-]{1,120}$/u);
  if (options["occurred-at"] !== undefined) {
    if (!Number.isFinite(Date.parse(options["occurred-at"]))) fail("invalid_occurred_at", EXIT.usage);
    event.occurredAt = options["occurred-at"];
  }
  if (options["cost-kind"] !== undefined) {
    if (!["actual", "estimated", "unreported"].includes(options["cost-kind"]))
      fail("invalid_cost_kind", EXIT.usage);
    event.costKind = options["cost-kind"];
  }
  if (event.costKind === "unreported" && (options.amount || options.currency))
    fail("invalid_cost", EXIT.usage);
  if (options.amount !== undefined || options.currency !== undefined) {
    if (!event.costKind || event.costKind === "unreported") fail("invalid_cost", EXIT.usage);
    if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$/u.test(options.amount || ""))
      fail("invalid_amount", EXIT.usage);
    if (!/^[A-Z]{3}$/u.test(options.currency || "")) fail("invalid_currency", EXIT.usage);
    event.amount = options.amount;
    event.currency = options.currency;
  }
  if (event.costKind === "actual" || event.costKind === "estimated") {
    if (event.amount === undefined || event.currency === undefined)
      fail("invalid_cost", EXIT.usage);
  }
  return event;
}

async function writeGithubOutput(file, values) {
  if (!file) return;
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (lines) await appendFile(file, lines, { mode: 0o600 });
}

async function writeIntake(out, payload) {
  if (!out) fail("missing_out", EXIT.usage);
  const target = path.resolve(out);
  await mkdir(path.dirname(target), { recursive: true });
  const document = `# LaunchLoom intake\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
  await writeFile(target, document, { mode: 0o600 });
  await chmod(target, 0o600).catch(() => {});
}

/**
 * Runs one client command. Returns a process exit code; injectable for tests.
 */
export async function runOperationsClient(argv, dependencies = {}) {
  const {
    env = process.env,
    fetchImpl = fetch,
    stdout = (line) => process.stdout.write(`${line}\n`),
    stderr = (line) => process.stderr.write(`${line}\n`),
    token: injectedToken,
  } = dependencies;
  const [command, ...values] = argv;
  try {
    if (!["claim", "intake", "event"].includes(command)) fail("invalid_command", EXIT.usage);
    const options = parseOptions(values);
    const api = apiOrigin(options.api);
    const audience = options.audience || OPERATIONS_DEFAULT_AUDIENCE;
    if (!/^[A-Za-z0-9._~:/-]{1,200}$/u.test(audience)) fail("invalid_audience", EXIT.usage);
    const token = injectedToken ?? (await requestOidcToken({ audience, env, fetchImpl }));

    if (command === "claim") {
      const operationId = requireUuid(options, "operation");
      const requestId = options.request ? requireUuid(options, "request") : undefined;
      const attemptId = options.attempt ? requireUuid(options, "attempt") : undefined;
      const result = await claimGenerationRun({
        api, operationId, requestId, attemptId, token, fetchImpl,
      });
      await writeGithubOutput(options["github-output"], {
        intake_id: result.intakeId,
        request_id: result.requestId,
        attempt_id: result.attemptId,
        operation_id: result.operationId,
      });
      stdout("claim=claimed");
      return EXIT.ok;
    }

    if (command === "intake") {
      const intakeId = requireUuid(options, "intake");
      const result = await fetchGenerationIntake({ api, intakeId, token, fetchImpl });
      await writeIntake(options.out, result.payload);
      stdout("intake=ready");
      return EXIT.ok;
    }

    const attemptId = requireUuid(options, "attempt");
    const event = eventFrom(options);
    const status = await appendGenerationEvent({ api, attemptId, event, token, fetchImpl });
    stdout(`event=${status}`);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof OperationsClientError) {
      const label = String(error.code).replace(new RegExp(`^${command}_`, "u"), "");
      stdout(`${command}=${label}`);
      if (error.exitCode === EXIT.usage) stderr("operations_client=invalid_arguments");
      return error.exitCode;
    }
    stdout(
      command === "event"
        ? "event=unavailable"
        : command === "intake"
          ? "intake=unavailable"
          : "claim=unavailable",
    );
    return EXIT.unavailable;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runOperationsClient(process.argv.slice(2));
}
