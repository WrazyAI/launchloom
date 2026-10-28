import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_OIDC_ISSUER,
  OPERATIONS_EVENT,
  OPERATIONS_REF,
  OPERATIONS_REPOSITORY,
  OPERATIONS_WORKFLOW_REF,
  OperationsAuthError,
  operationsClaim,
  operationsEvent,
  operationsIntake,
  verifyRunIdentity,
  type GitHubOidcKey,
  type WorkflowPolicy,
} from "../src/operations/github-auth";
import type { IntakeRecord, OperationsStore, RunIdentity } from "../src/operations/contracts";

const encoder = new TextEncoder();
const nowSeconds = 1_780_000_000;
const now = () => nowSeconds * 1000;
const audience = "launchloom-operations";
const repositoryId = "1352728020";
const intakeId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";

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
const publicJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
const otherPair = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
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

type Claims = Record<string, unknown>;

function claims(overrides: Claims = {}): Claims {
  return {
    iss: GITHUB_OIDC_ISSUER,
    aud: audience,
    sub: `repo:${OPERATIONS_REPOSITORY}:ref:${OPERATIONS_REF}`,
    repository: OPERATIONS_REPOSITORY,
    repository_id: repositoryId,
    repository_owner: "WrazyAI",
    repository_owner_id: "1",
    workflow: "Generate client site",
    workflow_ref: OPERATIONS_WORKFLOW_REF,
    job_workflow_ref: OPERATIONS_WORKFLOW_REF,
    workflow_sha: "a".repeat(40),
    ref: OPERATIONS_REF,
    ref_type: "branch",
    event_name: OPERATIONS_EVENT,
    run_id: "424242",
    run_attempt: "1",
    actor: "synthetic-actor",
    actor_id: "2",
    iat: nowSeconds - 5,
    nbf: nowSeconds - 5,
    exp: nowSeconds + 300,
    jti: "synthetic-jti",
    ...overrides,
  };
}

async function token(
  payload: Claims = claims(),
  options: {
    kid?: string;
    alg?: string;
    signer?: CryptoKey;
    omitSignature?: boolean;
  } = {},
) {
  const header = base64url(
    JSON.stringify({ alg: options.alg ?? "RS256", typ: "JWT", kid: options.kid ?? "synthetic-key" }),
  );
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  if (options.omitSignature) return `${data}.`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      options.signer ?? keyPair.privateKey,
      encoder.encode(data),
    ),
  );
  return `${data}.${base64url(signature)}`;
}

function policy(overrides: Partial<WorkflowPolicy> = {}): WorkflowPolicy {
  return {
    issuer: GITHUB_OIDC_ISSUER,
    audience,
    repositoryId,
    repository: OPERATIONS_REPOSITORY,
    workflowRef: OPERATIONS_WORKFLOW_REF,
    ref: OPERATIONS_REF,
    eventName: OPERATIONS_EVENT,
    now,
    keys,
    ...overrides,
  };
}

async function authCode(tokenValue: string, overrides: Partial<WorkflowPolicy> = {}) {
  try {
    await verifyRunIdentity(tokenValue, policy(overrides));
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(OperationsAuthError);
    return (error as OperationsAuthError).code;
  }
}

describe("GitHub OIDC run identity", () => {
  it("derives identity exclusively from a correctly signed trusted run token", async () => {
    const value = await token();
    await expect(verifyRunIdentity(value, policy())).resolves.toEqual({
      repositoryId,
      runId: "424242",
      runAttempt: 1,
    });
  });

  it("fetches current GitHub keys for a token kid and requires RS256", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const value = await token();
    await expect(
      verifyRunIdentity(value, policy({ keys: undefined, fetch: fetchImpl })),
    ).resolves.toEqual({ repositoryId, runId: "424242", runAttempt: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "token.actions.githubusercontent.com/.well-known/jwks",
    );

    expect(await authCode(await token(claims(), { alg: "none" }), { keys })).toBe("malformed");
    expect(await authCode(await token(claims(), { alg: "HS256" }), { keys })).toBe("malformed");
  });

  it("fails closed when the published keys cannot be obtained", async () => {
    const network = vi.fn().mockRejectedValue(new Error("synthetic network outage"));
    expect(
      await authCode(await token(claims(), { kid: "rotated-key" }), { keys: undefined, fetch: network }),
    ).toBe("keys_unavailable");

    const unavailable = vi.fn().mockResolvedValue(new Response("no", { status: 503 }));
    expect(
      await authCode(await token(claims(), { kid: "other-rotated-key" }), {
        keys: undefined,
        fetch: unavailable,
      }),
    ).toBe("keys_unavailable");
  });

  it("rejects an unknown key id instead of trusting an unlisted key", async () => {
    expect(await authCode(await token(claims(), { kid: "other-key" }))).toBe(
      "keys_unavailable",
    );
  });

  it("rejects a token signed by any key outside the published set", async () => {
    expect(await authCode(await token(claims(), { signer: otherPair.privateKey }))).toBe(
      "invalid_signature",
    );
    expect(await authCode(await token(claims(), { omitSignature: true }))).toBe(
      "malformed",
    );
  });

  it("rejects malformed tokens without throwing parser errors", async () => {
    for (const value of [
      "",
      "one.two",
      "one.two.three.four",
      "!!!.@@@.###",
      `${base64url("{}")}.${base64url("{}")}.abc`,
    ])
      expect(await authCode(value)).toBe("malformed");
  });

  it.each([
    ["issuer", { iss: "https://token.example.test" }, "issuer"],
    ["audience", { aud: "some-other-service" }, "audience"],
    ["audience array", { aud: [audience] }, "audience"],
    ["repository id", { repository_id: "999999" }, "repository"],
    ["repository name", { repository: "WrazyAI/other" }, "repository"],
    ["subject", { sub: "repo:WrazyAI/launchloom:environment:production" }, "subject"],
    ["workflow ref", { workflow_ref: `${OPERATIONS_REPOSITORY}/.github/workflows/test-generation.yml@${OPERATIONS_REF}` }, "workflow"],
    ["job workflow ref", { job_workflow_ref: `${OPERATIONS_REPOSITORY}/.github/workflows/publish-site.yml@${OPERATIONS_REF}` }, "workflow"],
    ["ref", { ref: "refs/heads/preview" }, "ref"],
    ["ref type", { ref_type: "tag" }, "ref"],
    ["event", { event_name: "pull_request" }, "event"],
    ["run id", { run_id: "0" }, "run"],
    ["run attempt", { run_attempt: "0" }, "run"],
    ["numeric run attempt", { run_attempt: 1 }, "run"],
    ["fractional run attempt", { run_attempt: "1.5" }, "run"],
    ["padded run attempt", { run_attempt: " 1" }, "run"],
    ["oversized run attempt", { run_attempt: "2147483648" }, "run"],
    ["expiration", { exp: nowSeconds }, "expired"],
    ["missing expiration", { exp: undefined }, "claims"],
    ["future issue time", { iat: nowSeconds + 120 }, "issued_in_future"],
    ["stale issue time", { iat: nowSeconds - 601 }, "stale"],
    ["future not-before", { nbf: nowSeconds + 120 }, "not_yet_valid"],
    ["string not-before", { nbf: String(nowSeconds - 5) }, "claims"],
    ["fractional not-before", { nbf: nowSeconds + 0.5 }, "claims"],
    ["negative not-before", { nbf: -1 }, "claims"],
    ["null not-before", { nbf: null }, "claims"],
    ["not-before after expiry", { nbf: nowSeconds + 400 }, "claims"],
  ])("denies a token with a wrong %s", async (_label, overrides, code) => {
    expect(await authCode(await token(claims(overrides)))).toBe(code);
  });
});

function fakeStore(claimResult: "claimed" | "duplicate" | "attention" = "claimed") {
  const calls = {
    claim: [] as Array<{ operationId: string; run: RunIdentity }>,
    intake: [] as Array<{ intakeId: string; run: RunIdentity }>,
    events: [] as Array<{ attemptId: string; run: RunIdentity }>,
  };
  const bound: RunIdentity = { repositoryId, runId: "424242", runAttempt: 1 };
  const same = (run: RunIdentity) =>
    run.repositoryId === bound.repositoryId && run.runId === bound.runId &&
    run.runAttempt === bound.runAttempt;
  const record: IntakeRecord = {
    schemaVersion: 1,
    intakeId,
    clientId: "55555555-5555-4555-8555-555555555555",
    inviteId: "invite-opaque",
    submissionId: "submission-opaque",
    fingerprint: "b".repeat(64),
    payloadVersion: 2,
    payload: { businessName: "Synthetic Harbor Plumbing", email: "sam@example.test" },
    consent: { termsVersion: "client-intake-v2", rightsConfirmed: true },
    acceptanceState: "confirmed",
    receivedAt: "2026-10-28T00:00:00.000Z",
    confirmedAt: "2026-10-28T00:00:01.000Z",
    requestId,
    attemptId,
    operationId,
    profile: "full",
  };
  const store = {
    async claimRun(operation: string, run: RunIdentity) {
      calls.claim.push({ operationId: operation, run });
      return same(run) ? claimResult : "attention";
    },
    async getClaimedOperation(operation: string, run: RunIdentity) {
      return operation === operationId && same(run)
        ? { operationId, intakeId, requestId, attemptId }
        : null;
    },
    async getIntakeForRun(id: string, run: RunIdentity) {
      calls.intake.push({ intakeId: id, run });
      return id === intakeId && same(run) ? record : null;
    },
    async appendEvent(id: string, run: RunIdentity) {
      calls.events.push({ attemptId: id, run });
      return same(run) && id === attemptId ? "inserted" : "attention";
    },
  } as unknown as OperationsStore;
  return { store, calls, bound };
}

const apiEnv = {
  OPERATIONS_OIDC_AUDIENCE: audience,
  OPERATIONS_OIDC_REPOSITORY_ID: repositoryId,
  OPERATIONS_DATABASE_URL: "postgresql://synthetic.invalid/operations",
};

function request(path: string, body?: unknown, bearer?: string) {
  return new Request(`https://api.launchloom.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("operations claim and intake API", () => {
  it("binds the verified run and rejects forged run identity in the body", async () => {
    const { store, calls, bound } = fakeStore();
    const forged = {
      operationId,
      requestId,
      attemptId,
      repositoryId: "999999999",
      runId: "999999",
      runAttempt: 77,
      run_id: "999999",
    };
    const denied = await operationsClaim(
      request("/api/internal/operations/claim", forged, await token()),
      apiEnv,
      { store, policy: policy() },
    );
    expect(denied.status).toBe(400);
    expect(await denied.json()).toEqual({ error: "invalid" });
    expect(calls.claim).toHaveLength(0);

    const response = await operationsClaim(
      request("/api/internal/operations/claim", { operationId, requestId, attemptId }, await token()),
      apiEnv,
      { store, policy: policy() },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const json = await response.json() as Record<string, unknown>;
    expect(json).toEqual({
      status: "claimed",
      operationId,
      intakeId,
      requestId,
      attemptId,
    });
    expect(calls.claim).toEqual([{ operationId, run: bound }]);
  });

  it("rejects missing or invalid bearer credentials before touching storage", async () => {
    const { store, calls } = fakeStore();
    for (const bearer of [undefined, "not-a-jwt", await token(claims(), { signer: otherPair.privateKey })]) {
      const response = await operationsClaim(
        request("/api/internal/operations/claim", { operationId }, bearer),
        apiEnv,
        { store, policy: policy() },
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(calls.claim).toHaveLength(0);
  });

  it("fails closed when the trust policy is not configured", async () => {
    const { store } = fakeStore();
    const response = await operationsClaim(
      request("/api/internal/operations/claim", { operationId }, await token()),
      {},
      { store },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("returns a controlled duplicate or attention status without intake content", async () => {
    const duplicateStore = fakeStore("duplicate").store;
    const duplicate = await operationsClaim(
      request("/api/internal/operations/claim", { operationId }, await token()),
      apiEnv,
      { store: duplicateStore, policy: policy() },
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ status: "duplicate" });

    const { store } = fakeStore();
    const otherRunToken = await token(claims({ run_id: "777777" }));
    const response = await operationsClaim(
      request("/api/internal/operations/claim", { operationId }, otherRunToken),
      apiEnv,
      { store, policy: policy() },
    );
    expect(response.status).toBe(409);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toEqual({ status: "attention" });
    expect(JSON.stringify(json)).not.toContain("Synthetic Harbor");
  });

  it("refuses a rerun attempt that does not own the operation", async () => {
    const { store, calls } = fakeStore();
    const rerun = await operationsClaim(
      request("/api/internal/operations/claim", { operationId }, await token(claims({ run_attempt: "2" }))),
      apiEnv,
      { store, policy: policy() },
    );
    expect(rerun.status).toBe(409);
    expect(await rerun.json()).toEqual({ status: "attention" });
    expect(calls.claim[0].run).toEqual({ repositoryId, runId: "424242", runAttempt: 2 });
  });

  it("serves intake content only to the verified winning run", async () => {
    const { store, calls, bound } = fakeStore();
    const ok = await operationsIntake(
      request(`/api/internal/operations/intakes/${intakeId}`, undefined, await token()),
      apiEnv,
      intakeId,
      { store, policy: policy() },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toMatchObject({
      intakeId,
      requestId,
      attemptId,
      operationId,
      payloadVersion: 2,
      payload: { businessName: "Synthetic Harbor Plumbing" },
    });
    expect(calls.intake).toEqual([{ intakeId, run: bound }]);

    const other = await operationsIntake(
      request(`/api/internal/operations/intakes/${intakeId}`, undefined, await token(claims({ run_id: "777777" }))),
      apiEnv,
      intakeId,
      { store, policy: policy() },
    );
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: "not_found" });
  });

  it("rejects an intake identifier that is not an opaque UUID", async () => {
    const { store, calls } = fakeStore();
    for (const id of ["../../secrets", "1", "not-a-uuid", "11111111111141118111111111111111"]) {
      const response = await operationsIntake(
        request(`/api/internal/operations/intakes/${id}`, undefined, await token()),
        apiEnv,
        id,
        { store, policy: policy() },
      );
      expect(response.status).toBe(400);
    }
    expect(calls.intake).toHaveLength(0);
  });

  it("accepts a stage event only from the owning run", async () => {
    const { store, calls } = fakeStore();
    const event = {
      attemptId,
      eventKey: "intake:started",
      stage: "intake",
      transition: "started",
      occurredAt: "2026-10-28T00:00:00.000Z",
    };
    const ok = await operationsEvent(
      request("/api/internal/operations/events", event, await token()),
      apiEnv,
      { store, policy: policy() },
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: "inserted" });
    expect(calls.events).toEqual([
      { attemptId, run: { repositoryId, runId: "424242", runAttempt: 1 } },
    ]);

    const wrong = await operationsEvent(
      request("/api/internal/operations/events", event, await token(claims({ run_id: "777777" }))),
      apiEnv,
      { store, policy: policy() },
    );
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toEqual({ status: "attention" });
  });
  it('accepts SHA-bound handoff but rejects free text, forged identity and malformed transitions', async () => {
    const { store, calls } = fakeStore();
    const event = { attemptId, eventKey: `${attemptId}:handoff:completed:1`, stage: 'handoff', transition: 'completed', buildSha: 'a'.repeat(40) };
    const valid = await operationsEvent(request('/api/internal/operations/events', event, await token()), apiEnv, { store, policy: policy() });
    expect(valid.status).toBe(200);
    for (const change of [
      { buildSha: undefined }, { buildSha: 'not-a-sha' }, { transition: 'preview_ready' },
      { detail: 'private@example.test Bearer secret' }, { runId: '777777' },
      { eventKey: 'private@example.test' },
    ]) {
      const response = await operationsEvent(request('/api/internal/operations/events', { ...event, ...change }, await token()), apiEnv, { store, policy: policy() });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toMatch(/private|secret|777777/);
    }
    expect(calls.events).toHaveLength(1);
  });
});
