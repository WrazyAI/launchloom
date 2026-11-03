import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGenerationActivityStore } from "../worker/src/generation-activity/store";
import {
  generationActivityIngest,
  generationActivityRead,
} from "../worker/src/generation-activity/http";
import { createActivityProducer } from "../scripts/generation-activity-client.mjs";
import {
  TRACE_LIMITS,
  createPrivacyPolicy,
} from "../src/lib/generation-activity-contract.mjs";
import {
  GITHUB_OIDC_ISSUER,
  OPERATIONS_EVENT,
  OPERATIONS_REF,
  OPERATIONS_REPOSITORY,
  OPERATIONS_WORKFLOW_REF,
  type GitHubOidcKey,
  type WorkflowPolicy,
} from "../worker/src/operations/github-auth";
import type {
  GenerationActivityPage,
  TraceEvent,
} from "../src/lib/generation-activity";
import type { OperationsSql } from "../worker/src/operations/store";
import { traceEvent } from "./fixtures/generation-activity";

const url = process.env.OPERATIONS_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.search ||
    !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(target.pathname) ||
    process.env.OPERATIONS_TEST_DISPOSABLE !== "1"
  )
    throw Error("Disposable loopback PostgreSQL required.");
}

async function sql(text: string): Promise<string> {
  const target = new URL(url!);
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
        ),
        PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: target.port || "5432",
        PGDATABASE: target.pathname.slice(1),
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
        PGCONNECT_TIMEOUT: "5",
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(text);
  });
}

const asWorker = (text: string) =>
  sql(`begin; set local role launchloom_operations_worker; ${text}; commit;`);

const connection: OperationsSql = {
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const rendered = text.replace(/\$(\d+)/gu, (_, index) => {
      const value = params[Number(index) - 1];
      return value === null || value === undefined
        ? "NULL"
        : `'${String(value).replaceAll("'", "''")}'`;
    });
    return JSON.parse(
      await asWorker(
        `select coalesce(json_agg(row_to_json(q)), '[]') from (${rendered}) q`,
      ),
    );
  },
};

const store = createGenerationActivityStore(connection);
const encoder = new TextEncoder();
const nowMs = Date.now();
const audience = "launchloom-operations";
const repositoryId = "1352728020";

const keyPair = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const publicJwk = (await crypto.subtle.exportKey(
  "jwk",
  keyPair.publicKey,
)) as JsonWebKey;
const keys: GitHubOidcKey[] = [
  {
    kty: "RSA",
    kid: "synthetic-key",
    n: publicJwk.n as string,
    e: publicJwk.e as string,
    alg: "RS256",
    use: "sig",
  },
];

function base64url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function token(runId: string) {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "synthetic-key" }));
  const claims = {
    iss: GITHUB_OIDC_ISSUER,
    aud: audience,
    sub: `repo:${OPERATIONS_REPOSITORY}:ref:${OPERATIONS_REF}`,
    repository: OPERATIONS_REPOSITORY,
    repository_id: repositoryId,
    workflow_ref: OPERATIONS_WORKFLOW_REF,
    job_workflow_ref: OPERATIONS_WORKFLOW_REF,
    ref: OPERATIONS_REF,
    ref_type: "branch",
    event_name: OPERATIONS_EVENT,
    run_id: runId,
    run_attempt: "1",
    iat: Math.floor(nowMs / 1000) - 5,
    nbf: Math.floor(nowMs / 1000) - 5,
    exp: Math.floor(nowMs / 1000) + 600,
  };
  const body = base64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    encoder.encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
}

function policy(): WorkflowPolicy {
  return {
    issuer: GITHUB_OIDC_ISSUER,
    audience,
    repositoryId,
    repository: OPERATIONS_REPOSITORY,
    workflowRef: OPERATIONS_WORKFLOW_REF,
    ref: OPERATIONS_REF,
    eventName: OPERATIONS_EVENT,
    now: () => nowMs,
    keys,
  };
}

const env = {
  GENERATION_ACTIVITY_ENABLED: "true",
  OPERATIONS_DATABASE_URL: "postgresql://example.invalid/db",
};
const admin = { id: "admin-e2e", role: "admin" };
const privacy = createPrivacyPolicy({ allowSourceText: true });

let counter = 0;
async function createAttempt() {
  counter += 1;
  const row = JSON.parse(
    await sql(
      `select row_to_json(r) from launchloom_operations.create_acceptance(
        'e2e-${counter}', 'submission-${counter}', '${"e".repeat(64)}', 1, '{}',
        '{"rightsConfirmed":true,"termsVersion":"test"}', 'full') r`,
    ),
  ) as { attempt_id: string };
  const runId = String(7000 + counter);
  await sql(
    `update launchloom_operations.generation_attempts
        set workflow_repository = 'WrazyAI/launchloom',
            workflow_run_id = '${runId}', workflow_run_attempt = 1
      where id = '${row.attempt_id}'`,
  );
  return { attemptId: row.attempt_id, runId };
}

async function readPage(attemptId: string): Promise<GenerationActivityPage> {
  const path = `/api/admin/onboarding-invites/workspace/operations/records/${attemptId}/activity`;
  const response = await generationActivityRead(
    new Request(`https://api.launchloom.test${path}`),
    env,
    admin,
    path,
    { store, attemptExists: async () => true },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.activity as GenerationActivityPage;
}

describe.skipIf(!url)("generation activity end to end", () => {
  beforeAll(async () => {
    for (const name of [
      "001-operations",
      "002-acceptance-recovery",
      "003-dispatch",
      "004-run-ownership",
      "005-reconciliation",
      "006-cost-coverage",
      "007-dashboard",
      "008-generation-activity",
    ])
      await sql(await readFile(`db/operations/${name}.sql`, "utf8"));
  }, 60_000);

  beforeEach(async () => {
    await sql(
      "truncate launchloom_operations.activity_expired, launchloom_operations.activity_partitions cascade",
    );
    await sql("truncate launchloom_operations.clients cascade");
  });

  it("shows a pending model call, then live output, then a replayed page", async () => {
    const { attemptId, runId } = await createAttempt();
    const bearer = await token(runId);
    const identity = { namespace: "operations" as const, attemptId };
    const transport = {
      async send(events: TraceEvent[]) {
        const response = await generationActivityIngest(
          new Request(
            "https://api.launchloom.test/api/internal/generation-activity",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${bearer}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ identity, events }),
            },
          ),
          env,
          { store, policy: policy() },
        );
        const body = await response.json();
        return { status: response.status, suppressed: body.suppressed === true };
      },
    };
    const producer = createActivityProducer({
      context: {
        ...traceEvent().context,
        ...identity,
      },
      privacy,
      transport,
      limits: TRACE_LIMITS,
    });
    const callId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    producer.emit("model_started", {
      callId,
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
    });
    await producer.flush();
    const pending = await readPage(attemptId);
    expect(pending.items.map((event) => event.kind)).toEqual(["model_started"]);
    expect(pending.recording).toBe("recording");
    expect(pending.usage.responses).toBe(0);

    producer.emit("model_finished", { callId, status: "completed" });
    producer.emit("output", {
      callId,
      message: {
        kind: "text",
        text: "The approved service scope is ready for review.",
      },
    });
    producer.emit("usage", {
      callId,
      usage: {
        inputTokens: 1200,
        outputTokens: 340,
        cachedInputTokens: 300,
        cacheWriteTokens: null,
        reasoningTokens: 40,
        costUsd: "0.12000000",
        costKind: "actual",
      },
    });
    await producer.flush();
    const live = await readPage(attemptId);
    expect(live.items.map((event) => event.kind)).toEqual([
      "model_started",
      "model_finished",
      "output",
      "usage",
    ]);
    expect(
      live.items.find((event) => event.kind === "output")?.payload,
    ).toMatchObject({
      message: {
        kind: "text",
        text: "The approved service scope is ready for review.",
      },
    });
    expect(live.usage).toMatchObject({
      responses: 1,
      inputTokens: 1200,
      outputTokens: 340,
      cost: { actual: "0.12000000", currency: "USD" },
    });

    // Reloading the same page must not duplicate retained evidence.
    const replay = await readPage(attemptId);
    expect(replay.items.map((event) => event.eventId)).toEqual(
      live.items.map((event) => event.eventId),
    );

    await producer.close();
    const finished = await readPage(attemptId);
    // A per-script producer finishing early does not close the whole run.
    expect(finished.recording).toBe("recording");
  });

  it("keeps a killed producer's evidence pending instead of reporting completion", async () => {
    const { attemptId, runId } = await createAttempt();
    const bearer = await token(runId);
    const identity = { namespace: "operations" as const, attemptId };
    const transport = {
      async send(events: TraceEvent[]) {
        const response = await generationActivityIngest(
          new Request(
            "https://api.launchloom.test/api/internal/generation-activity",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${bearer}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ identity, events }),
            },
          ),
          env,
          { store, policy: policy() },
        );
        return { status: response.status };
      },
    };
    const producer = createActivityProducer({
      context: { ...traceEvent().context, ...identity },
      privacy,
      transport,
      limits: TRACE_LIMITS,
    });
    producer.emit("action_started", {
      actionId: "render:1",
      name: "render_candidate",
      input: { path: "src/index.astro" },
    });
    await producer.flush();
    // Simulate a hard termination: no close(), no producer_finished.
    const page = await readPage(attemptId);
    expect(page.items).toHaveLength(1);
    expect(page.recording).toBe("recording");
    expect(
      page.items.some((event) => event.kind === "producer_finished"),
    ).toBe(false);
  });

  it("lets only the run finalizer declare the trace complete", async () => {
    const { attemptId, runId } = await createAttempt();
    const bearer = await token(runId);
    const identity = { namespace: "operations" as const, attemptId };
    const transport = {
      async send(events: TraceEvent[]) {
        const response = await generationActivityIngest(
          new Request(
            "https://api.launchloom.test/api/internal/generation-activity",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${bearer}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ identity, events }),
            },
          ),
          env,
          { store, policy: policy() },
        );
        return { status: response.status };
      },
    };
    const producer = createActivityProducer({
      context: {
        ...traceEvent().context,
        ...identity,
        actor: { kind: "orchestrator", role: "run_finalizer" },
      },
      privacy,
      transport,
      limits: TRACE_LIMITS,
    });
    producer.emit("producer_finished", { status: "complete", detail: null });
    await producer.flush();
    const page = await readPage(attemptId);
    expect(page.recording).toBe("complete");
    expect(
      page.items.some(
        (event) =>
          event.kind === "producer_finished" &&
          event.context.actor.role === "run_finalizer",
      ),
    ).toBe(true);
  });
});
