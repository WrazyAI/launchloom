import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPERATIONS_DEFAULT_AUDIENCE,
  requestOidcToken,
  runOperationsClient,
} from "../scripts/operations-client.mjs";
import { resolveWorkflowTestDispatch } from "../scripts/pipeline-test-policy.mjs";

const operationId = "44444444-4444-4444-8444-444444444444";
const intakeId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const api = "https://api.launchloom.test";
const oidcUrl = "https://pipelines.actions.githubusercontent.com/token?api-version=2.0";
const oidcRequestToken = "synthetic-oidc-request-token";
const syntheticJwt = "synthetic.header.signature";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace() {
  const directory = await mkdtemp(path.join(tmpdir(), "launchloom-operations-client-"));
  temporary.push(directory);
  return directory;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientHarness(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  });
  return {
    fetchImpl,
    calls,
    stdout,
    stderr,
    deps: {
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcRequestToken,
      },
      fetchImpl,
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe("operations client", () => {
  it("requests a short-lived OIDC token only from the Actions endpoint for the fixed audience", async () => {
    const harness = clientHarness(() => jsonResponse({ value: syntheticJwt }));
    const token = await requestOidcToken({
      audience: OPERATIONS_DEFAULT_AUDIENCE,
      env: harness.deps.env,
      fetchImpl: harness.fetchImpl,
    });
    expect(token).toBe(syntheticJwt);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].url.searchParams.get("audience")).toBe(OPERATIONS_DEFAULT_AUDIENCE);
    expect(new Headers(harness.calls[0].init?.headers).get("authorization")).toBe(
      `Bearer ${oidcRequestToken}`,
    );
  });

  it("claims with the verified identity flow and never sends a body-supplied run identity", async () => {
    const directory = await workspace();
    const output = path.join(directory, "github-output");
    const harness = clientHarness((url) => {
      if (url.hostname === "pipelines.actions.githubusercontent.com") return jsonResponse({ value: syntheticJwt });
      expect(url.pathname).toBe("/api/internal/operations/claim");
      return jsonResponse({ status: "claimed", operationId, intakeId, requestId, attemptId });
    });
    const env = { ...harness.deps.env, GITHUB_RUN_ID: "999999", GITHUB_RUN_ATTEMPT: "7" };
    const code = await runOperationsClient(
      [
        "claim",
        "--api", api,
        "--operation", operationId,
        "--request", requestId,
        "--attempt", attemptId,
        "--github-output", output,
      ],
      { ...harness.deps, env },
    );
    expect(code).toBe(0);
    const claim = harness.calls.find((call) => call.url.hostname === "api.launchloom.test");
    expect(claim).toBeDefined();
    const body = JSON.parse(String(claim?.init?.body));
    expect(body).toEqual({ operationId, requestId, attemptId });
    expect(JSON.stringify(body)).not.toMatch(/run|repository|token/iu);
    expect(new Headers(claim?.init?.headers).get("authorization")).toBe(`Bearer ${syntheticJwt}`);
    expect(harness.stdout.join("\n")).toBe("claim=claimed");
    expect(await readFile(output, "utf8")).toContain(`intake_id=${intakeId}`);
  });

  it.each([
    [409, { status: "duplicate" }, 3, "claim=duplicate"],
    [409, { status: "attention" }, 4, "claim=attention"],
    [401, { error: "unauthorized" }, 5, "claim=unauthorized"],
    [503, { error: "unavailable" }, 6, "claim=unavailable"],
  ])("exits a duplicate or non-owning claim before generation: %s", async (status, body, expected, line) => {
    const harness = clientHarness((url) => {
      if (url.hostname === "pipelines.actions.githubusercontent.com") return jsonResponse({ value: syntheticJwt });
      return jsonResponse(body, status);
    });
    const code = await runOperationsClient(
      ["claim", "--api", api, "--operation", operationId],
      harness.deps,
    );
    expect(code).toBe(expected);
    expect(harness.stdout.join("\n")).toBe(line);
  });

  it("writes intake to a private file without printing its content", async () => {
    const directory = await workspace();
    const out = path.join(directory, "intake.md");
    const harness = clientHarness((url) => {
      if (url.hostname === "pipelines.actions.githubusercontent.com") return jsonResponse({ value: syntheticJwt });
      expect(url.pathname).toBe(`/api/internal/operations/intakes/${intakeId}`);
      return jsonResponse({
        schemaVersion: 1,
        intakeId,
        requestId,
        attemptId,
        operationId,
        profile: "full",
        payloadVersion: 2,
        payload: {
          businessName: "Synthetic Harbor Plumbing",
          email: "sam@example.test",
          phone: "555-0100",
        },
      });
    });
    const code = await runOperationsClient(
      ["intake", "--api", api, "--intake", intakeId, "--out", out],
      harness.deps,
    );
    expect(code).toBe(0);
    const printed = [...harness.stdout, ...harness.stderr].join("\n");
    expect(printed).toBe("intake=ready");
    expect(printed).not.toMatch(/Harbor|sam@example|555-0100/u);
    const file = await readFile(out, "utf8");
    const blocks = [...file.matchAll(/```json\s*([\s\S]*?)```/gu)];
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0][1])).toEqual({
      businessName: "Synthetic Harbor Plumbing",
      email: "sam@example.test",
      phone: "555-0100",
    });
    if (process.platform !== "win32")
      expect((await stat(out)).mode & 0o777).toBe(0o600);
  });

  it("records a sanitized stage event through the authenticated run identity", async () => {
    const harness = clientHarness((url) => {
      if (url.hostname === "pipelines.actions.githubusercontent.com") return jsonResponse({ value: syntheticJwt });
      expect(url.pathname).toBe("/api/internal/operations/events");
      return jsonResponse({ status: "inserted" });
    });
    const code = await runOperationsClient(
      [
        "event",
        "--api", api,
        "--attempt", attemptId,
        "--event-key", "intake:started",
        "--stage", "intake",
        "--transition", "started",
        "--detail-code", "payload_loaded",
        "--provider", "synthetic",
        "--model", "synthetic-model",
        "--cost-kind", "unreported",
      ],
      harness.deps,
    );
    expect(code).toBe(0);
    expect(harness.stdout.join("\n")).toBe("event=inserted");
    const event = harness.calls.find((call) => call.url.hostname === "api.launchloom.test");
    expect(JSON.parse(String(event?.init?.body))).toEqual({
      attemptId,
      eventKey: "intake:started",
      stage: "intake",
      transition: "started",
      detailCode: "payload_loaded",
      provider: "synthetic",
      model: "synthetic-model",
      costKind: "unreported",
    });
  });

  it("rejects non-HTTPS and malformed APIs before any network call", async () => {
    const harness = clientHarness(() => jsonResponse({}));
    for (const target of ["http://api.example.test", "https://", "not-a-url", "file:///tmp/x"]) {
      const code = await runOperationsClient(
        ["claim", "--api", target, "--operation", operationId],
        harness.deps,
      );
      expect(code).toBe(2);
    }
    expect(harness.fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed without Actions OIDC configuration", async () => {
    const harness = clientHarness(() => jsonResponse({}));
    const code = await runOperationsClient(
      ["claim", "--api", api, "--operation", operationId],
      { ...harness.deps, env: {} },
    );
    expect(code).toBe(7);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect([...harness.stdout, ...harness.stderr].join("\n")).not.toMatch(/token/iu);
  });
});

describe("new-mode workflow authorization", () => {
  const workflowPath = ".github/workflows/generate-client.yml";

  async function workflow() {
    return readFile(workflowPath, "utf8");
  }

  function jobBlock(source: string, name: string) {
    const start = source.indexOf(`\n  ${name}:\n`);
    if (start < 0) throw new Error(`Missing job ${name}`);
    const rest = source.slice(start + 1);
    const next = rest.slice(1).search(/\n  [a-z_]+:\n/u);
    return next < 0 ? rest : rest.slice(0, next + 1);
  }

  it("mints an OIDC token only in the generation job", async () => {
    const source = await workflow();
    expect(source.match(/^\s+id-token: write\s*$/gmu)).toHaveLength(1);
    const generate = jobBlock(source, "generate");
    expect(generate).toMatch(/permissions:\s*\n\s+contents: write\s*\n\s+issues: write\s*\n\s+id-token: write/u);
    for (const other of ["track_execution", "profile_policy", "renderer_policy", "intake_handoff_check", "focused_test", "private_preview_access_smoke"]) {
      expect(jobBlock(source, other)).not.toContain("id-token: write");
    }
  });

  it("claims before dependency install, model calls, payload fetch or client side effects", async () => {
    const generate = jobBlock(await workflow(), "generate");
    const claim = generate.indexOf("operations-client.mjs claim");
    expect(claim).toBeGreaterThan(0);
    const claimStepStart = generate.lastIndexOf("      - name:", claim);
    expect(claimStepStart).toBeGreaterThan(0);
    expect(claim).toBeLessThan(generate.indexOf("npm ci"));
    expect(claim).toBeLessThan(generate.indexOf("playwright install"));
    expect(claim).toBeLessThan(generate.indexOf("Record generation started"));
    expect(claim).toBeLessThan(generate.indexOf("coverage-areas.mjs"));
    expect(claim).toBeLessThan(generate.indexOf("Create private repository"));
    expect(generate.slice(0, claimStepStart)).not.toMatch(/node scripts\/|gh api|gh repo|gh pr|gh issue/u);
    const claimStep = generate.slice(claimStepStart, generate.indexOf("\n      - uses: actions/setup-node", claim));
    expect(claimStep).toContain('if: ${{ inputs.operation_id != \'\' }}');
    expect(claimStep).toContain('OPERATION_ID: ${{ inputs.operation_id }}');
    expect(claimStep).toContain('--operation "$OPERATION_ID"');
    expect(claimStep).not.toMatch(/--run-id|--run-attempt|--repository-id/u);
  });

  it("declares opaque new-mode identifiers and keeps them out of public run names", async () => {
    const source = await workflow();
    const runName = source.slice(0, source.indexOf("\non:\n"));
    expect(runName).not.toContain("LLGEN issue=");
    expect(runName).toContain("inputs.operation_id");
    expect(runName).not.toMatch(/client_payload\.(?:business|email|phone)/u);
    for (const input of ["operation_id", "request_id", "attempt_id"]) {
      expect(source).toMatch(new RegExp(`\\n      ${input}:\\n`, "u"));
    }
    expect(source).toContain("inputs.operation_id || github.run_id");
    expect(source).toContain("TRACK_REQUEST: ${{ github.event.client_payload.request_id || inputs.request_id }}");
    expect(source).toContain("TRACK_ATTEMPT: ${{ github.run_attempt == 1 && (github.event.client_payload.attempt_id || inputs.attempt_id) || '' }}");
  });

  it("fetches the new-mode payload through the Worker and keeps the legacy issue path", async () => {
    const generate = jobBlock(await workflow(), "generate");
    expect(generate).toContain("node scripts/operations-client.mjs intake \\\n");
    expect(generate).toContain('INTAKE_ID: ${{ steps.claim.outputs.intake_id }}');
    expect(generate).toContain('--intake "$INTAKE_ID"');
    expect(generate).toContain('gh api "repos/WrazyAI/launchloom/issues/$ISSUE" --jq .body > /tmp/intake.md');
    expect(generate).toContain('if [ -n "$OPERATION_ID" ]; then');
    expect(generate).toContain('PROJECT="launchloom-${{ steps.intake.outputs.intake_ref }}-${{ steps.intake.outputs.slug }}"');
    expect(generate).not.toContain('PROJECT="launchloom-${{ steps.intake.outputs.issue }}');
  });

  it("skips issue-only handoff checks and comments for a new-mode run", async () => {
    const source = await workflow();
    expect(jobBlock(source, "intake_handoff_check")).toContain("!inputs.operation_id");
    const generate = jobBlock(source, "generate");
    const handoff = generate.indexOf("Mark intake handoff complete");
    expect(handoff).toBeGreaterThan(0);
    expect(generate.slice(handoff, handoff + 700)).toMatch(/if:.*inputs\.operation_id == ''/u);
    expect(generate).toContain('if [ -n "$INTAKE_ISSUE" ]; then\n            gh issue comment');
    const notify = generate.indexOf("Notify developer when generation stops");
    expect(notify).toBeGreaterThan(0);
    expect(generate.slice(notify, notify + 900)).toContain('if [ -n "$ISSUE" ]; then');
  });

  it("accepts an opaque operation instead of a fabricated issue for policy resolution", () => {
    expect(
      resolveWorkflowTestDispatch({
        profile: "full",
        eventName: "workflow_dispatch",
        issue: "",
        operationId,
      }),
    ).toEqual({ profile: "full", requiresIntakeIssue: false });
    expect(() =>
      resolveWorkflowTestDispatch({ profile: "full", eventName: "workflow_dispatch", issue: "" }),
    ).toThrow(/intake issue|operations identifier/u);
    expect(() =>
      resolveWorkflowTestDispatch({
        profile: "creative-only",
        eventName: "workflow_dispatch",
        operationId,
      }),
    ).toThrow(/full profile/u);
    expect(() =>
      resolveWorkflowTestDispatch({
        profile: "access-only",
        eventName: "workflow_dispatch",
        operationId,
      }),
    ).toThrow(/without an operations identifier/u);
  });
});

describe("run ownership migration", () => {
  it("gates intake and event access on the exact verified run identity", async () => {
    const sql = await readFile("db/operations/004-run-ownership.sql", "utf8");
    for (const name of ["get_claimed_operation", "get_claimed_intake", "append_run_event"]) {
      expect(sql).toContain(`FUNCTION launchloom_operations.${name}`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION launchloom_operations.${name}`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION launchloom_operations.${name}`);
    }
    expect(sql.match(/i\.acceptance_state = 'confirmed'/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("a.workflow_repository = p_repository");
    expect(sql).toContain("a.workflow_run_id = p_run");
    expect(sql).toContain("a.workflow_run_attempt = p_attempt");
    expect(sql).toContain("a.state = 'running'");
    expect(sql).toContain("o.state = 'dispatched'");
    expect(sql).toContain("SET search_path = pg_catalog, launchloom_operations, pg_temp");
    expect(sql).not.toMatch(/GRANT[^;]*ON ALL TABLES|CREATE ROLE|CREATE DATABASE/u);
  });
});
