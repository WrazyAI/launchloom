import { describe, expect, it } from "vitest";
import {
  GITHUB_OIDC_ISSUER,
  OPERATIONS_EVENT,
  OPERATIONS_REF,
  OPERATIONS_REPOSITORY,
  OPERATIONS_WORKFLOW_REF,
  type GitHubOidcKey,
  type WorkflowPolicy,
} from "../src/operations/github-auth";
import {
  generationActivityIngest,
  generationActivityRead,
} from "../src/generation-activity/http";
import type { GenerationActivityStore } from "../src/generation-activity/store";
import type {
  GenerationActivityPage,
  TraceEvent,
  TraceIdentity,
} from "../../src/lib/generation-activity";
import { OperationsError } from "../src/operations/store";
import { traceEvent } from "../../tests/fixtures/generation-activity";

const encoder = new TextEncoder();
const nowMs = 1_780_000_000_000;
const now = () => nowMs;
const audience = "launchloom-operations";
const repositoryId = "1352728020";
const attemptId = "33333333-3333-4333-8333-333333333333";
const legacyAttempt = "github:424242:1";
const path = (suffix: string) =>
  `/api/admin/onboarding-invites/workspace${suffix}`;

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

function claims(overrides: Record<string, unknown> = {}) {
  return {
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
    run_id: "424242",
    run_attempt: "1",
    iat: Math.floor(nowMs / 1000) - 5,
    nbf: Math.floor(nowMs / 1000) - 5,
    exp: Math.floor(nowMs / 1000) + 600,
    ...overrides,
  };
}

async function token(overrides: Record<string, unknown> = {}) {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "synthetic-key" }));
  const body = base64url(JSON.stringify(claims(overrides)));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    encoder.encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
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

function contextFor(identity: TraceIdentity) {
  return {
    namespace: identity.namespace,
    attemptId: identity.attemptId,
    producerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    stage: "authoring",
    substep: null,
    taskId: null,
    parentTaskId: null,
    candidateId: null,
    repairPass: null,
    actor: { kind: "model", role: "site_builder" },
  };
}

function eventsFor(identity: TraceIdentity): TraceEvent[] {
  return [
    traceEvent({
      context: contextFor(identity),
      eventId: "11111111-1111-4111-8111-111111111111",
      sequence: 1,
    }),
  ];
}

function page(identity: TraceIdentity): GenerationActivityPage {
  return {
    identity,
    items: [],
    nextCursor: null,
    hasMore: false,
    observedAt: nowMs,
    lastHeartbeatAt: null,
    recording: "recording",
    coverage: [],
    usage: {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      responses: 0,
      unknownResponses: 0,
      cost: { currency: null, actual: null, estimated: null, unreportedCount: 0 },
    },
    retentionDays: 30,
  };
}

class FakeStore implements GenerationActivityStore {
  appended: { owner: unknown; events: TraceEvent[] }[] = [];
  failure: Error | null = null;
  async append(owner: unknown, events: TraceEvent[]) {
    if (this.failure) throw this.failure;
    this.appended.push({ owner, events });
    return { accepted: events.length, lastCursor: null, suppressed: false, expired: false };
  }
  async read(identity: TraceIdentity) {
    if (this.failure) throw this.failure;
    return page(identity);
  }
  async pruneExpired() {
    return { deleted: 0, hasMore: false };
  }
}

const enabledEnv = {
  GENERATION_ACTIVITY_ENABLED: "true",
  OPERATIONS_DATABASE_URL: "postgresql://example.invalid/db",
};

function ingestRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://api.launchloom.test/api/internal/generation-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("generation activity ingest", () => {
  it("accepts a bound legacy attempt with a verified run identity", async () => {
    const store = new FakeStore();
    const response = await generationActivityIngest(
      ingestRequest(
        {
          identity: { namespace: "legacy", attemptId: legacyAttempt },
          events: eventsFor({ namespace: "legacy", attemptId: legacyAttempt }),
        },
        { Authorization: `Bearer ${await token()}` },
      ),
      enabledEnv,
      {
        store,
        policy: policy(),
        legacyOwner: async () => ({
          repository: OPERATIONS_REPOSITORY,
          runId: "424242",
          runAttempt: 1,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ accepted: 1 });
    expect(store.appended).toHaveLength(1);
    expect(store.appended[0]?.owner).toMatchObject({
      namespace: "legacy",
      attemptId: legacyAttempt,
      repositoryId,
      runId: "424242",
      runAttempt: 1,
    });
  });

  it("denies an unknown or differently-bound legacy attempt", async () => {
    const store = new FakeStore();
    const request = async () =>
      ingestRequest(
        {
          identity: { namespace: "legacy", attemptId: legacyAttempt },
          events: eventsFor({ namespace: "legacy", attemptId: legacyAttempt }),
        },
        { Authorization: `Bearer ${await token()}` },
      );
    for (const owner of [
      null,
      { repository: "someone/else", runId: "424242", runAttempt: 1 },
      { repository: OPERATIONS_REPOSITORY, runId: "424242", runAttempt: 2 },
    ]) {
      const response = await generationActivityIngest(
        await request(),
        enabledEnv,
        {
          store,
          policy: policy(),
          legacyOwner: async () => owner,
        },
      );
      expect(response.status).toBe(403);
    }
    expect(store.appended).toHaveLength(0);
  });

  it("uses the store ownership boundary for operations identities", async () => {
    const store = new FakeStore();
    const identity = { namespace: "operations" as const, attemptId };
    const response = await generationActivityIngest(
      ingestRequest(
        { identity, events: eventsFor(identity) },
        { Authorization: `Bearer ${await token()}` },
      ),
      enabledEnv,
      {
        store,
        policy: policy(),
        legacyOwner: async () => {
          throw new Error("legacy lookup must not run");
        },
      },
    );
    expect(response.status).toBe(200);
    expect(store.appended[0]?.owner).toMatchObject({ attemptId, repositoryId });
  });

  it("rejects untrusted run claims and never falls back to a shared secret", async () => {
    const store = new FakeStore();
    const body = {
      identity: { namespace: "legacy", attemptId: legacyAttempt },
      events: eventsFor({ namespace: "legacy", attemptId: legacyAttempt }),
    };
    const wrongRepository = await generationActivityIngest(
      ingestRequest(body, { Authorization: `Bearer ${await token({ repository_id: "1" })}` }),
      enabledEnv,
      { store, policy: policy(), legacyOwner: async () => null },
    );
    expect(wrongRepository.status).toBe(401);
    const wrongEvent = await generationActivityIngest(
      ingestRequest(body, {
        Authorization: `Bearer ${await token({ event_name: "push" })}`,
      }),
      enabledEnv,
      { store, policy: policy(), legacyOwner: async () => null },
    );
    expect(wrongEvent.status).toBe(401);
    const sharedSecret = await generationActivityIngest(
      ingestRequest(body, { "x-generation-tracking-secret": "legacy-secret" }),
      enabledEnv,
      { store, policy: policy(), legacyOwner: async () => null },
    );
    expect(sharedSecret.status).toBe(401);
    expect(store.appended).toHaveLength(0);
  });

  it("accepts both trusted main-branch generation entry points", async () => {
    const store = new FakeStore();
    const identity = { namespace: "operations" as const, attemptId };
    for (const event_name of ["workflow_dispatch", "repository_dispatch"]) {
      const response = await generationActivityIngest(
        ingestRequest(
          { identity, events: eventsFor(identity) },
          { Authorization: `Bearer ${await token({ event_name })}` },
        ),
        enabledEnv,
        { store, policy: policy({ eventNames: ["workflow_dispatch", "repository_dispatch"] }) },
      );
      expect(response.status).toBe(200);
    }
    expect(store.appended).toHaveLength(2);
    const rejected = await generationActivityIngest(
      ingestRequest(
        { identity, events: eventsFor(identity) },
        { Authorization: `Bearer ${await token({ event_name: "push" })}` },
      ),
      enabledEnv,
      { store, policy: policy({ eventNames: ["workflow_dispatch", "repository_dispatch"] }) },
    );
    expect(rejected.status).toBe(401);
  });

  it("rejects extra envelope fields and mismatched event identity", async () => {
    const store = new FakeStore();
    const identity = { namespace: "operations" as const, attemptId };
    const extra = await generationActivityIngest(
      ingestRequest(
        {
          identity,
          events: eventsFor(identity),
          owner: { runId: "424242" },
        },
        { Authorization: `Bearer ${await token()}` },
      ),
      enabledEnv,
      { store, policy: policy() },
    );
    expect(extra.status).toBe(400);
    const mismatch = await generationActivityIngest(
      ingestRequest(
        {
          identity,
          events: eventsFor({
            namespace: "operations",
            attemptId: "44444444-4444-4444-8444-444444444444",
          }),
        },
        { Authorization: `Bearer ${await token()}` },
      ),
      enabledEnv,
      { store, policy: policy() },
    );
    expect(mismatch.status).toBe(400);
    expect(store.appended).toHaveLength(0);
  });

  it("rejects an oversized delivery before validation", async () => {
    const store = new FakeStore();
    const identity = { namespace: "operations" as const, attemptId };
    const response = await generationActivityIngest(
      ingestRequest(
        { identity, events: eventsFor(identity), padding: "x".repeat(300_000) },
        { Authorization: `Bearer ${await token()}` },
      ),
      enabledEnv,
      { store, policy: policy() },
    );
    expect([400, 413]).toContain(response.status);
    expect(store.appended).toHaveLength(0);
  });

  it("is disabled without an explicit capability", async () => {
    const response = await generationActivityIngest(
      ingestRequest({}),
      { OPERATIONS_DATABASE_URL: "postgresql://example.invalid/db" },
      { policy: policy() },
    );
    expect(response.status).toBe(503);
  });

  it("does not accept GET", async () => {
    const response = await generationActivityIngest(
      new Request("https://api.launchloom.test/api/internal/generation-activity"),
      enabledEnv,
      { store: new FakeStore(), policy: policy() },
    );
    expect(response.status).toBe(405);
  });
});

describe("generation activity admin reads", () => {
  const admin = { id: "admin-1", role: "admin" };
  const identity = { namespace: "legacy" as const, attemptId: legacyAttempt };

  it("requires an admin principal, GET and an existing attempt", async () => {
    const store = new FakeStore();
    const forbidden = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`),
      enabledEnv,
      { id: "viewer-1", role: "viewer" },
      path(`/legacy/attempts/${legacyAttempt}/activity`),
      { store, attemptExists: async () => true },
    );
    expect(forbidden.status).toBe(403);
    const missing = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`),
      enabledEnv,
      admin,
      path(`/legacy/attempts/${legacyAttempt}/activity`),
      { store, attemptExists: async () => false },
    );
    expect(missing.status).toBe(404);
    const post = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`, {
        method: "POST",
      }),
      enabledEnv,
      admin,
      path(`/legacy/attempts/${legacyAttempt}/activity`),
      { store, attemptExists: async () => true },
    );
    expect(post.status).toBe(405);
  });

  it("returns a no-store page for an authorized read", async () => {
    const response = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`),
      enabledEnv,
      admin,
      path(`/legacy/attempts/${legacyAttempt}/activity`),
      { store: new FakeStore(), attemptExists: async (value) => value.attemptId === legacyAttempt },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ readOnly: true, activity: { identity } });
  });

  it("rejects unknown query parameters and malformed cursors", async () => {
    const attemptExists = async () => true;
    for (const query of ["?unknown=1", "?limit=0", "?limit=101", "?limit=x", "?after=nope"]) {
      const response = await generationActivityRead(
        new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}${query}`),
        enabledEnv,
        admin,
        path(`/legacy/attempts/${legacyAttempt}/activity`),
        { store: new FakeStore(), attemptExists },
      );
      expect(response.status).toBe(400);
    }
  });

  it("rejects duplicate cursor parameters and both directions", async () => {
    const attemptExists = async () => true;
    for (const query of [
      "?after=v1.1.00000000&after=v1.2.00000000",
      "?after=v1.1.00000000&before=v1.2.00000000",
    ]) {
      const response = await generationActivityRead(
        new Request(
          `https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}${query}`,
        ),
        enabledEnv,
        admin,
        path(`/legacy/attempts/${legacyAttempt}/activity`),
        { store: new FakeStore(), attemptExists },
      );
      expect(response.status).toBe(400);
    }
  });

  it("maps storage failures without leaking details", async () => {
    const store = new FakeStore();
    store.failure = new OperationsError("dependency_unavailable", "db down");
    const response = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`),
      enabledEnv,
      admin,
      path(`/legacy/attempts/${legacyAttempt}/activity`),
      { store, attemptExists: async () => true },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("db down");
  });

  it("is disabled without an explicit capability", async () => {
    const response = await generationActivityRead(
      new Request(`https://api.launchloom.test${path(`/legacy/attempts/${legacyAttempt}/activity`)}`),
      { OPERATIONS_DATABASE_URL: "postgresql://example.invalid/db" },
      admin,
      path(`/legacy/attempts/${legacyAttempt}/activity`),
    );
    expect(response.status).toBe(503);
  });

  it("rejects traversal and unknown activity paths", async () => {
    const response = await generationActivityRead(
      new Request(`https://api.launchloom.test${path("/legacy/attempts/a/b/activity")}`),
      enabledEnv,
      admin,
      path("/legacy/attempts/a/b/activity"),
      { store: new FakeStore(), attemptExists: async () => true },
    );
    expect(response.status).toBe(404);
  });
});
