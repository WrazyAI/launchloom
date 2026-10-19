import { describe, expect, it } from "vitest";
import * as history from "../scripts/reconcile-generation-history.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const repo = { id: 42, full_name: "WrazyAI/launchloom" };
const run = (id = 9001, extra = {}) => ({
  id,
  run_attempt: 1,
  workflow_id: 10,
  repository: repo,
  path: ".github/workflows/generate-client.yml",
  event: "workflow_dispatch",
  display_title: "LLGEN issue=5 profile=full request=none",
  status: "completed",
  conclusion: "failure",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:02:00Z",
  triggering_actor: { login: "qa-operator" },
  ...extra,
});
function fixture(
  runs: any[],
  options: {
    deny?: number;
    retry?: boolean;
    duplicate?: boolean;
    expired?: boolean;
  } = {},
) {
  const reads: string[] = [];
  const writes: any[] = [];
  let retried = false;
  return {
    reads,
    writes,
    postImpl: async (body: any) => {
      writes.push(body);
    },
    fetchImpl: async (url: string, init?: RequestInit) => {
      reads.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      if (url.endsWith("/repos/WrazyAI/launchloom")) return Response.json(repo);
      if (url.includes("/workflows/") && !url.includes("/runs"))
        return Response.json({
          id: url.includes("test-generation") ? 11 : 10,
          path: url.includes("test-generation")
            ? ".github/workflows/test-generation.yml"
            : ".github/workflows/generate-client.yml",
        });
      if (options.deny && url.includes("/runs?"))
        return new Response("", { status: options.deny });
      if (options.retry && !retried && url.includes("/runs?")) {
        retried = true;
        return new Response("", { status: 429 });
      }
      if (url.includes("/jobs"))
        return options.expired
          ? new Response("", { status: 410 })
          : Response.json({
              total_count: 1,
              jobs: [
                {
                  id: 70001,
                  name: "configure token=private https://private.test/?token=secret",
                  conclusion: "failure",
                  completed_at: "2026-10-01T00:02:00Z",
                  steps: [{ name: "private raw text", conclusion: "failure" }],
                },
              ],
            });
      if (/\/attempts\/\d+$/u.test(url)) {
        const id = Number(url.match(/runs\/(\d+)/)?.[1]);
        return Response.json({
          ...runs.find((r) => r.id === id),
          run_attempt: Number(url.split("/").at(-1)),
          conclusion: "cancelled",
        });
      }
      if (url.includes("/workflows/11/runs"))
        return Response.json({ total_count: 0, workflow_runs: [] });
      return Response.json({ total_count: runs.length, workflow_runs: runs });
    },
  };
}
describe("fixture-only independent history reconciliation", () => {
  it.each([
    [
      "truncated",
      [
        {
          total_count: 101,
          jobs: [{ id: 1, completed_at: "2026-10-01T00:01:00Z" }],
        },
      ],
    ],
    ["empty", [{ total_count: 1, jobs: [] }]],
    [
      "duplicate within page",
      [{ total_count: 2, jobs: [{ id: 1 }, { id: 1 }] }],
    ],
    [
      "duplicate across pages",
      [
        {
          total_count: 101,
          jobs: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
        },
        { total_count: 101, jobs: [{ id: 1 }] },
      ],
    ],
    ["missing total", [{ jobs: [{ id: 1 }] }]],
    ["malformed job", [{ total_count: 1, jobs: [null] }]],
    ["negative total", [{ total_count: -1, jobs: [] }]],
  ])(
    "keeps the source cursor and partial health for %s job evidence",
    async (_name, pages) => {
      const f = fixture([run()]);
      const baseFetch = f.fetchImpl;
      const fetchImpl = async (url: string, init?: RequestInit) =>
        url.includes("/jobs")
          ? Response.json(
              (pages as unknown[])[
                Number(new URL(url).searchParams.get("page")) - 1
              ],
            )
          : baseFetch(url, init);
      const report = await history.reconcileGenerationHistory({
        ...f,
        fetchImpl,
        mode: "incremental",
        dryRun: false,
      });
      expect(report.complete).toBe(false);
      expect(report.upsertCount).toBe(0);
      expect(report.errors).toContain("invalid GitHub jobs page");
      expect(JSON.parse(report.nextCheckpoint!)).toMatchObject({
        workflow: 0,
        page: 1,
      });
      expect(f.writes.flatMap((b) => b.attempts)).toEqual([]);
      expect(f.writes.at(-1)).toMatchObject({
        checkpoint: report.nextCheckpoint,
        health: { partial: true, lastError: "invalid GitHub jobs page" },
      });
    },
  );
  it("uses the complete unique paginated job set for the execution completion time", async () => {
    const f = fixture([run()]);
    const baseFetch = f.fetchImpl;
    const fetchImpl = async (url: string, init?: RequestInit) =>
      url.includes("/jobs")
        ? Response.json({
            total_count: 101,
            jobs: url.includes("page=2")
              ? [{ id: 101, completed_at: "2026-10-01T00:03:00Z" }]
              : Array.from({ length: 100 }, (_, i) => ({
                  id: i + 1,
                  completed_at: "2026-10-01T00:01:00Z",
                })),
          })
        : baseFetch(url, init);
    const report = await history.reconcileGenerationHistory({
      ...f,
      fetchImpl,
      mode: "incremental",
      dryRun: false,
    });
    expect(report.complete).toBe(true);
    expect(report.errors).toEqual([]);
    expect(f.writes.flatMap((b) => b.attempts)[0].observation.completedAt).toBe(
      Date.parse("2026-10-01T00:03:00Z"),
    );
    expect(f.writes.at(-1).health.partial).toBe(false);
  });
  it("deduplicates executions across actual page boundaries without skipping the next workflow", async () => {
    const runs = Array.from({ length: 100 }, (_, i) => run(10000 + i));
    const f = fixture(runs);
    const baseFetch = f.fetchImpl;
    const fetchImpl = async (url: string, init?: RequestInit) =>
      url.includes("/workflows/10/runs") && url.includes("page=2")
        ? Response.json({
            total_count: 102,
            workflow_runs: [run(10000), run(10100)],
          })
        : baseFetch(url, init);
    const report = await history.reconcileGenerationHistory({
      ...f,
      fetchImpl,
      mode: "incremental",
      dryRun: false,
      pageBudget: 2,
    });
    expect(report.upsertCount).toBe(101);
    expect(report.complete).toBe(false);
    expect(JSON.parse(report.nextCheckpoint!).workflow).toBe(1);
    expect(f.writes.flatMap((b) => b.attempts)).toHaveLength(101);
  });
  it("reports an incomplete GitHub result window instead of claiming full retained coverage", async () => {
    const f = fixture([]);
    const baseFetch = f.fetchImpl;
    const fetchImpl = async (url: string, init?: RequestInit) =>
      url.includes("/workflows/10/runs")
        ? Response.json({ total_count: 1001, workflow_runs: [] })
        : baseFetch(url, init);
    const report = await history.reconcileGenerationHistory({
      ...f,
      fetchImpl,
      mode: "backfill",
      dryRun: true,
    });
    expect(report.complete).toBe(false);
    expect(report.errors).toContain(
      "GitHub result window incomplete; narrow the requested range.",
    );
    expect(JSON.parse(report.nextCheckpoint!).page).toBe(1);
  });
  it("retains partial-coverage warnings across cursor resumes instead of claiming complete history", async () => {
    const first = fixture([
      run(99, { display_title: "legacy title with no verified profile" }),
    ]);
    const a = await history.reconcileGenerationHistory({
      ...first,
      mode: "incremental",
      dryRun: false,
      pageBudget: 1,
    });
    const second = fixture([]);
    const b = await history.reconcileGenerationHistory({
      ...second,
      mode: "incremental",
      dryRun: false,
      checkpoint: a.nextCheckpoint,
    });
    expect(b.complete).toBe(true);
    expect(second.writes.at(-1).health.partial).toBe(true);
    expect(b.warnings.length).toBeGreaterThan(0);
  });
  it("runs the real dry-run CLI with a local report and all external fetches forbidden", async () => {
    const folder = await fs.mkdtemp("/tmp/opencode/task3-cli-");
    const out = `${folder}/report.json`;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/admin-reconciliation-deny-network.mjs",
        "scripts/reconcile-generation-history.mjs",
        "--mode",
        "backfill",
        "--dry-run",
        "--fixture",
        "tests/fixtures/admin-generation-history.json",
        "--out",
        out,
      ],
      { env: { PATH: process.env.PATH } },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      complete: true,
      readCount: 6,
      upsertCount: 1,
      errors: [],
    });
    expect(JSON.parse(await fs.readFile(out, "utf8"))).toEqual(
      JSON.parse(stdout),
    );
  });
  it("records early setup/prerequisite failures and excludes called workflow duplicates", async () => {
    const f = fixture([
      run(21, { conclusion: "startup_failure" }),
      run(22, { conclusion: "failure" }),
      run(23, { event: "workflow_call" }),
    ]);
    const report = await history.reconcileGenerationHistory({
      ...f,
      mode: "incremental",
      dryRun: false,
    });
    expect(report.upsertCount).toBe(2);
    expect(
      f.writes
        .flatMap((b) => b.attempts)
        .map((a) => a.observation.executionStatus),
    ).toEqual(["failed", "failed"]);
  });
  it("retains terminal runs when job evidence has expired without inventing reason or times", async () => {
    const f = fixture([run()], { expired: true });
    const report = await history.reconcileGenerationHistory({
      ...f,
      mode: "backfill",
      dryRun: false,
    });
    expect(report.complete).toBe(true);
    expect(report.warnings).toContain(
      "Job evidence expired; failure details not recorded.",
    );
    expect(f.writes.at(-1).health.partial).toBe(true);
    expect(f.writes.flatMap((b) => b.attempts)[0].observation).toMatchObject({
      executionStatus: "failed",
      completedAt: null,
      failure: { summary: null },
    });
  });
  it("deduplicates executions, preserves cancellation/reruns and does not guess reason/cost/actor", async () => {
    const f = fixture([
      run(),
      run(),
      run(9002, { run_attempt: 2 }),
      run(9003, {
        display_title: "LLGEN issue=8 profile=creative-only request=none",
      }),
      run(9004, { display_title: "access-only" }),
    ]);
    const report = await history.reconcileGenerationHistory({
      ...f,
      mode: "backfill",
      dryRun: false,
      from: 0,
    });
    expect(report.complete).toBe(true);
    expect(report.upsertCount).toBe(4);
    const rows = f.writes.flatMap((b) => b.attempts);
    expect(rows).toHaveLength(4);
    expect(
      rows.find(
        (r) => r.observation.runId === "9002" && r.observation.runAttempt === 1,
      ).observation.executionStatus,
    ).toBe("cancelled");
    expect(rows[0].observation.failure.summary).toBeNull();
    expect(rows[0].observation.source).toBe("github-reconcile");
    expect(JSON.stringify(f.writes)).not.toMatch(
      /private|token=|secret|costUsd":0/u,
    );
    expect(
      f.reads.every(
        (u) =>
          !u.includes("dispatch") && !u.includes("logs") && !u.includes("mail"),
      ),
    ).toBe(true);
  });
  it("dry-run never posts or mutates a checkpoint and repeated fixture totals are deterministic", async () => {
    const checkpoint = { workflow: 0, page: 1, from: 0 };
    const before = JSON.stringify(checkpoint);
    const a = fixture([run()]);
    const b = fixture([run()]);
    const first = await history.reconcileGenerationHistory({
      ...a,
      mode: "backfill",
      dryRun: true,
      checkpoint,
    });
    const second = await history.reconcileGenerationHistory({
      ...b,
      mode: "backfill",
      dryRun: true,
      checkpoint,
    });
    expect(first).toEqual(second);
    expect(a.writes).toEqual([]);
    expect(JSON.stringify(checkpoint)).toBe(before);
  });
  it.each([403, 429])(
    "does not advance past an unread page on API %s",
    async (status) => {
      const f = fixture([run()], { deny: status });
      const report = await history.reconcileGenerationHistory({
        ...f,
        mode: "incremental",
        dryRun: true,
        sleepImpl: async () => {},
      });
      expect(report.complete).toBe(false);
      expect(report.errors).toHaveLength(1);
      expect(JSON.parse(report.nextCheckpoint!).page).toBe(1);
      expect(f.writes).toEqual([]);
    },
  );
  it("retries rate limits boundedly and preserves resumable page budgets", async () => {
    const f = fixture([run()], { retry: true });
    const report = await history.reconcileGenerationHistory({
      ...f,
      mode: "incremental",
      dryRun: true,
      pageBudget: 1,
      sleepImpl: async () => {},
    });
    expect(report.errors).toEqual([]);
    expect(report.complete).toBe(false);
    expect(JSON.parse(report.nextCheckpoint!).workflow).toBe(1);
  });
  it("never accepts a foreign workflow/repository or unvalidated metadata", async () => {
    const f = fixture([
      run(1, { repository: { id: 77, full_name: "evil/repo" } }),
      run(2, { workflow_id: 99 }),
      run(3, { display_title: "LLGEN issue=abc profile=full request=none" }),
    ]);
    const report = await history.reconcileGenerationHistory({
      ...f,
      mode: "backfill",
      dryRun: true,
    });
    expect(report.upsertCount).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});
