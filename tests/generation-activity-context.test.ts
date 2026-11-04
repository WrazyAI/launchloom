import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityFromEnv,
  activityIdentity,
  collectSensitiveValues,
  createActivityTransport,
  createFileSpool,
} from "../scripts/generation-activity-context.mjs";
import { TRACE_LIMITS } from "../src/lib/generation-activity-contract.mjs";
import type { TraceEvent } from "../src/lib/generation-activity";

const env = {
  GENERATION_ACTIVITY_ENABLED: "true",
  OPERATION_ID: "44444444-4444-4444-8444-444444444444",
  TRACK_ATTEMPT: "33333333-3333-4333-8333-333333333333",
  LAUNCHLOOM_API_URL: "https://api.launchloom.test",
  OPERATIONS_OIDC_AUDIENCE: "launchloom-operations",
  OPENROUTER_API_KEY: "sk-abcdefghijklmnopqrst",
  PUBLIC_SENTRY_DSN: "https://public.example/1",
  SHORT_TOKEN: "abc",
  JOB_SECRET_NAME: "not-secret-enough?",
  GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz",
};

describe("generation activity environment context", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-03T10:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves operations identity only from a valid attempt UUID", () => {
    expect(activityIdentity(env)).toMatchObject({
      namespace: "operations",
      attemptId: env.TRACK_ATTEMPT,
    });
    expect(
      activityIdentity({ ...env, TRACK_ATTEMPT: "not-a-uuid" }),
    ).toBeNull();
    expect(activityIdentity({ ...env, TRACK_ATTEMPT: "" })).toBeNull();
    expect(
      activityIdentity({
        TRACK_ATTEMPT: "github:123:1",
        GENERATION_ACTIVITY_ENABLED: "true",
      }),
    ).toMatchObject({ namespace: "legacy", attemptId: "github:123:1" });
  });

  it("collects secret-bearing values but never public configuration", () => {
    const values = collectSensitiveValues(env);
    expect(values).toContain(env.OPENROUTER_API_KEY);
    expect(values).toContain(env.GITHUB_TOKEN);
    expect(values).not.toContain(env.PUBLIC_SENTRY_DSN);
    expect(values).not.toContain(env.SHORT_TOKEN);
  });

  it("returns a harmless no-op when the capability is disabled", async () => {
    const producer = activityFromEnv({}, { stage: "authoring" });
    expect(producer.emit("model_started", {
      callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      provider: "opencode-go",
      model: "m",
    })).toBe(false);
    await expect(producer.close()).resolves.toBeUndefined();
    expect(producer.stats()).toMatchObject({ disabled: true, queued: 0 });
    expect(producer.context()).toBeNull();
  });

  it("returns a no-op when identity is incomplete", () => {
    const producer = activityFromEnv({ ...env, TRACK_ATTEMPT: "" });
    expect(producer.stats()).toMatchObject({ disabled: true });
  });

  it("delivers scrubbed events through an injected transport", async () => {
    const sent: TraceEvent[][] = [];
    const producer = activityFromEnv(
      env,
      {
        stage: "authoring",
        actor: { kind: "model", role: "site_builder" },
        sensitiveValues: ["Private Client Contact 555-0100"],
      },
      {
        transport: {
          async send(events) {
            sent.push(events as TraceEvent[]);
            return { status: 200 };
          },
        },
        spoolDir: null,
      },
    );
    expect(
      producer.emit("output", {
        callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        message: {
          kind: "text",
          text: `Hello Private Client Contact 555-0100 and ${env.OPENROUTER_API_KEY}`,
        },
      }),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(TRACE_LIMITS.flushIntervalMs);
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain(env.OPENROUTER_API_KEY);
    expect(producer.context()).toMatchObject({
      stage: "authoring",
      actor: { kind: "model", role: "site_builder" },
    });
    await producer.close();
  });

  it("sends with a cached OIDC token", async () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      calls.push(target.includes("pipelines.actions.githubusercontent.com") ? "oidc" : "worker");
      const body = target.includes("pipelines.actions.githubusercontent.com")
        ? { value: jwt }
        : { accepted: 1 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const transport = createActivityTransport({
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL:
          "https://pipelines.actions.githubusercontent.com/token?api-version=2.0",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
        LAUNCHLOOM_API_URL: "https://api.launchloom.wrazyos.com",
      },
      identity: { namespace: "legacy", attemptId: "test" },
      fetchImpl,
    });
    await expect(
      transport.send([], { signal: AbortSignal.timeout(2_000), attempt: 1 }),
    ).resolves.toMatchObject({ status: 200 });
    await transport.send([], { signal: AbortSignal.timeout(2_000), attempt: 1 });
    expect(calls).toEqual(["oidc", "worker", "worker"]);
  });

  it("lets a Node script exit without an explicit close", async () => {
    // Regression: a ref'd heartbeat timer used to keep generate-site-config
    // alive when the feature was enabled.
    const moduleUrl = pathToFileURL(
      path.resolve("scripts/generation-activity-context.mjs"),
    ).href;
    const script = `
      import { processActivity } from ${JSON.stringify(moduleUrl)};
      const producer = processActivity(
        { stage: "test" },
        {
          spoolDir: null,
          transport: { async send() { return { status: 200 }; } },
        },
      );
      producer.emit("heartbeat", { intervalMs: 10000 });
    `;
    const run = promisify(execFile);
    const result = await run(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        timeout: 8_000,
        env: {
          PATH: process.env.PATH,
          GENERATION_ACTIVITY_ENABLED: "true",
          OPERATION_ID: env.OPERATION_ID,
          TRACK_ATTEMPT: env.TRACK_ATTEMPT,
          LAUNCHLOOM_API_URL: env.LAUNCHLOOM_API_URL,
        },
      },
    );
    expect(result.stderr).toBe("");
  }, 15_000);

  it("keeps only one sanitized spool file and removes it after delivery", async () => {
    const files = new Map<string, { data: string; mode: number }>();
    let counter = 0;
    const spool = createFileSpool({
      dir: "/tmp/opencode/activity",
      fsImpl: {
        async mkdir() {},
        async writeFile(path, data, options) {
          files.set(path, { data, mode: options.mode });
        },
        async rm(path) {
          files.delete(path);
        },
      },
      now: () => 1000,
      randomUUID: () => `id-${(counter += 1)}`,
    });
    const event = {
      eventId: "11111111-1111-4111-8111-111111111111",
      kind: "model_started",
    };
    await spool.write([event]);
    await spool.write([event]);
    expect(files.size).toBe(1);
    const [entry] = [...files.values()];
    expect(entry?.mode).toBe(0o600);
    expect(entry?.data).toContain("model_started");
    await spool.clear();
    expect(files.size).toBe(0);
  });
});
