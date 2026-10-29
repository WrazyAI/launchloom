import { describe, expect, it } from "vitest";
import {
  buildOperationsEvent,
  buildOperationsCostEvents,
  postOperationsEvent,
} from "../scripts/record-generation-event.mjs";
import { appendGenerationEvent } from "../scripts/operations-client.mjs";
import { readFile } from "node:fs/promises";
import { recordGenerationStage } from "../scripts/record-generation-stage.mjs";
import { mkdtemp, access, rm } from "node:fs/promises";

const attempt = "11111111-1111-4111-8111-111111111111";
describe("private operations event producer", () => {
  it("uses stable occurrence keys, drops private detail and never invents cost", () => {
    const args = {
      stage: "intake",
      "stage-status": "completed",
      "stage-detail": "private@example.test Bearer secret",
      failure: "secret",
      business: "Private",
      "observed-at": "1000",
    };
    const a = buildOperationsEvent(attempt, args);
    const b = buildOperationsEvent(attempt, { ...args, "observed-at": "2000" });
    expect(a).toEqual(b);
    expect(a).toEqual({
      eventKey: `${attempt}:intake:completed:1`,
      stage: "intake",
      transition: "completed",
      costKind: "unreported",
    });
    expect(JSON.stringify(a)).not.toMatch(/private|secret|1000/);
  });
  it("does not turn legacy preview-ready into a handoff", () => {
    expect(
      buildOperationsEvent(attempt, {
        action: "complete",
        status: "preview_ready",
        sha: "a".repeat(40),
      }).stage,
    ).not.toBe("handoff");
    expect(() =>
      buildOperationsEvent(attempt, {
        stage: "handoff",
        "stage-status": "completed",
      }),
    ).toThrow();
    expect(
      buildOperationsEvent(attempt, {
        stage: "handoff",
        "stage-status": "completed",
        sha: "a".repeat(40),
      }).buildSha,
    ).toBe("a".repeat(40));
  });
  it("retries transport failure with exactly the same body and bounded safe errors", async () => {
    const bodies: string[] = [];
    const event = buildOperationsEvent(attempt, {
      stage: "intake",
      "stage-status": "completed",
    });
    const result = await appendGenerationEvent({
      api: "https://worker.test",
      attemptId: attempt,
      event,
      token: "private-token",
      fetchImpl: async (_url, init) => {
        bodies.push(String(init?.body));
        if (bodies.length < 3) throw new Error("private@example.test secret");
        return Response.json({ status: "duplicate" });
      },
    });
    expect(result).toBe("duplicate");
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies).size).toBe(1);
  });
  it("new mode obtains workload identity, not the legacy tracking secret", async () => {
    const requests: string[] = [];
    await postOperationsEvent(
      { stage: "intake", "stage-status": "completed" },
      {
        env: {
          OPERATION_ID: attempt,
          TRACK_ATTEMPT: attempt,
          OPERATIONS_API_URL: "https://worker.test",
          GENERATION_TRACKING_SECRET: "never-send",
        },
        token: "workload",
        fetchImpl: async (_url, init) => {
          requests.push(JSON.stringify(init));
          return Response.json({ status: "inserted" });
        },
      },
    );
    expect(requests.join()).toContain("workload");
    expect(requests.join()).not.toContain("never-send");
  });
  it("new-mode stage tracking never falls through to the legacy authority", async () => {
    const urls: string[] = [];
    const env = {
      OPERATION_ID: attempt,
      TRACK_ATTEMPT: attempt,
      OPERATIONS_API_URL: "https://worker.test",
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "https://pipelines.actions.githubusercontent.com/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "private",
    };
    await recordGenerationStage({
      stage: "intake",
      status: "completed",
      env,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return String(url).includes("actions.githubusercontent")
          ? Response.json({ value: "aaaaaaaa.bbbbbbbb.cccccccc" })
          : Response.json({ status: "inserted" });
      },
    });
    expect(
      urls.some((url) => url.endsWith("/api/internal/operations/events")),
    ).toBe(true);
    expect(urls.some((url) => url.includes("generation-attempts"))).toBe(false);
  });
  it("places mandatory authenticated handoff after successful delivery, never at legacy preview marker", async () => {
    const source = await readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain("OPERATIONS_API_URL:");
    const handoff = source.indexOf(
      "- name: Record authenticated operations handoff",
    );
    expect(handoff).toBeGreaterThan(
      source.indexOf("- name: Send developer preview email"),
    );
    expect(
      source.slice(handoff, source.indexOf("- name:", handoff + 8)),
    ).toContain("--stage handoff");
    expect(
      source.slice(handoff, source.indexOf("- name:", handoff + 8)),
    ).not.toContain("continue-on-error: true");
  });
  it("scheduled wake runs reconciliation independently from dispatch and admin APIs use verified identities", async () => {
    const source = await readFile("worker/src/index.ts", "utf8");
    expect(source.includes("scheduledReconciliation(env)")).toBe(true);
    expect(source).toContain(
      "operationsAdminApi(request, env, guard.principal)",
    );
    expect(source).toContain(
      "operationsAdminApi(request, env, await legacyAccessPrincipal(verifiedEmail))",
    );
  });
  it("never runs the independent legacy terminal producer for new-mode operations", async () => {
    const source = await readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const job = source.slice(
      source.indexOf("  track_execution:"),
      source.indexOf("  profile_policy:"),
    );
    expect(
      job.includes("if: ${{ always() && inputs.operation_id == '' &&"),
    ).toBe(true);
  });
  it("a lost telemetry write marks the runner incomplete and blocks handoff", async () => {
    const dir = await mkdtemp("/tmp/opencode/task5-events-");
    try {
      const env = {
        OPERATION_ID: attempt,
        TRACK_ATTEMPT: attempt,
        RUNNER_TEMP: dir,
        OPERATIONS_API_URL: "https://worker.test",
      };
      await expect(
        postOperationsEvent(
          { stage: "intake", "stage-status": "completed" },
          {
            env,
            token: "token",
            fetchImpl: async () => {
              throw Error("private@example.test token");
            },
          },
        ),
      ).rejects.toThrow();
      await access(`${dir}/operations-telemetry-incomplete`);
      const requests: unknown[] = [];
      await expect(
        postOperationsEvent(
          {
            stage: "handoff",
            "stage-status": "completed",
            sha: "a".repeat(40),
          },
          {
            env,
            token: "token",
            fetchImpl: async (...args) => {
              requests.push(args);
              return Response.json({ status: "inserted" });
            },
          },
        ),
      ).rejects.toThrow("Incomplete operations telemetry.");
      expect(requests).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("preserves reported decimal costs and their estimate labels without leaking summary detail", () => {
    const events = buildOperationsCostEvents(attempt, {
      events: [
        {
          stage: "authoring",
          costUsd: "0.10000001",
          costKind: "estimated",
          detail: "private@example.test",
          model: "secret",
        },
        { stage: "imagery", costUsd: 0.2, costKind: "actual" },
        { stage: "seo_research", costUsd: null, costKind: "unreported" },
      ],
    });
    expect(events.map((event) => event.costKind)).toEqual([
      "estimated",
      "actual",
      "unreported",
    ]);
    expect(events[0].amount).toBe("0.10000001");
    expect(events[2]).not.toHaveProperty("amount");
    expect(JSON.stringify(events)).not.toMatch(/private|secret/);
    expect(() =>
      buildOperationsCostEvents(attempt, {
        events: [{ stage: "imagery", costUsd: null, costKind: "actual" }],
      }),
    ).toThrow();
  });
  it('rejects unsafe callback origins before obtaining or sending a workload credential', async () => {
    let sent = false;
    await expect(postOperationsEvent({ stage: 'intake', 'stage-status': 'completed' }, {
      env: { TRACK_ATTEMPT: attempt, OPERATIONS_API_URL: 'http://untrusted.test' }, token: 'private-token',
      fetchImpl: async () => { sent = true; return Response.json({ status: 'inserted' }); },
    })).rejects.toThrow();
    expect(sent).toBe(false);
  });
});
