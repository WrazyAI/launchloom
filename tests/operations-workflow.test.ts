import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import {
  OPERATIONS_DEFAULT_AUDIENCE,
  requestOidcToken,
  runOperationsClient,
} from "../scripts/operations-client.mjs";
import { resolveWorkflowTestDispatch } from "../scripts/pipeline-test-policy.mjs";
import {
  PUBLIC_LAUNCH_BUSINESS_NAME,
  sanitizePublicLaunchConfig,
} from "../scripts/public-launch-config.mjs";

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
    expect(await readFile(output, "utf8")).toContain("claimed=true");
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
    expect(generate).toContain('PROJECT="launchloom-$INTAKE_REF"');
    expect(generate).toContain('PROJECT="launchloom-$INTAKE_REF-$LEGACY_SLUG"');
    expect(generate).not.toContain('steps.intake.outputs.slug');
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
    expect(() =>
      resolveWorkflowTestDispatch({
        profile: "full",
        eventName: "workflow_dispatch",
        issue: "123",
        operationId,
      }),
    ).toThrow(/cannot be mixed/u);
  });
});

describe("workflow job graph and public-log privacy", () => {
  const workflowPath = ".github/workflows/generate-client.yml";
  const need = (result: string, outputs: Record<string, string> = {}) => ({
    result,
    outputs,
  });

  type GuardContext = {
    needs: Record<string, { result: string; outputs: Record<string, string> }>;
    inputs: Record<string, unknown>;
    github: Record<string, unknown>;
    cancelled?: boolean;
  };

  function evaluate(expression: string, context: GuardContext) {
    const body = expression.replace(/^\$\{\{/u, "").replace(/\}\}$/u, "").trim();
    const fn = new Function(
      "needs",
      "inputs",
      "github",
      "always",
      "cancelled",
      "success",
      "failure",
      `return Boolean(${body});`,
    );
    return fn(
      context.needs,
      context.inputs,
      context.github,
      () => true,
      () => context.cancelled === true,
      () => true,
      () => false,
    ) as boolean;
  }

  /** Mirrors GitHub's dependency rule: a skipped/failed need skips the job
   * unless the job condition opts in with always(). */
  function jobRuns(
    job: { needs?: string | string[]; if?: string },
    context: GuardContext,
  ) {
    const dependencies = Array.isArray(job.needs)
      ? job.needs
      : job.needs
        ? [job.needs]
        : [];
    const blocked = dependencies.some(
      (dependency) => context.needs[dependency]?.result !== "success",
    );
    if (blocked && !/always\(\)/u.test(job.if || "")) return false;
    return job.if ? evaluate(job.if, context) : true;
  }

  function newModeContext(
    overrides: Partial<GuardContext["needs"]> = {},
    inputs: Record<string, unknown> = {},
  ): GuardContext {
    return {
      inputs: {
        operation_id: operationId,
        request_id: requestId,
        attempt_id: attemptId,
        issue: "",
        test_profile: "full",
        reuse_authored_candidates: false,
        ...inputs,
      },
      github: { event_name: "workflow_dispatch" },
      needs: {
        profile_policy: need("success", { profile: "full" }),
        renderer_policy: need("success"),
        intake_handoff_check: need("skipped"),
        generate: need("success", { claimed: "true" }),
        ...overrides,
      },
    };
  }

  function legacyContext(
    overrides: Partial<GuardContext["needs"]> = {},
    inputs: Record<string, unknown> = {},
  ): GuardContext {
    return {
      inputs: {
        operation_id: "",
        issue: "123",
        test_profile: "full",
        reuse_authored_candidates: false,
        ...inputs,
      },
      github: { event_name: "workflow_dispatch" },
      needs: {
        profile_policy: need("success", { profile: "full" }),
        renderer_policy: need("success"),
        intake_handoff_check: need("success", { completed: "false" }),
        generate: need("success", { claimed: "" }),
        ...overrides,
      },
    };
  }

  it("runs new mode when the legacy handoff job is skipped, and fails closed otherwise", async () => {
    const workflow = yaml.load(await readFile(workflowPath, "utf8")) as {
      jobs: Record<string, { needs?: string | string[]; if?: string }>;
    };
    const generate = workflow.jobs.generate;
    const oldShape = {
      needs: ["profile_policy", "renderer_policy", "intake_handoff_check"],
      if: "${{ needs.profile_policy.outputs.profile == 'full' && (needs.intake_handoff_check.outputs.completed != 'true' || (github.event_name == 'workflow_dispatch' && inputs.reuse_authored_candidates)) }}",
    };
    expect(jobRuns(oldShape, newModeContext())).toBe(false);
    expect(jobRuns(generate, newModeContext())).toBe(true);

    expect(jobRuns(generate, legacyContext())).toBe(true);
    expect(
      jobRuns(
        generate,
        legacyContext({
          intake_handoff_check: need("success", { completed: "true" }),
        }),
      ),
    ).toBe(false);
    expect(jobRuns(generate, legacyContext({ intake_handoff_check: need("skipped") }))).toBe(
      false,
    );
    expect(
      jobRuns(
        generate,
        legacyContext({ profile_policy: need("failure", { profile: "full" }) }),
      ),
    ).toBe(false);
    expect(jobRuns(generate, legacyContext({ renderer_policy: need("failure") }))).toBe(
      false,
    );
    expect(jobRuns(generate, newModeContext({ profile_policy: need("failure", { profile: "full" }) }))).toBe(
      false,
    );
    expect(jobRuns(generate, { ...newModeContext(), cancelled: true })).toBe(false);
    expect(jobRuns(generate, { ...legacyContext(), cancelled: true })).toBe(false);
  });

  it("prevents independent tracking and failure notifications before a new-mode claim", async () => {
    const workflow = yaml.load(await readFile(workflowPath, "utf8")) as {
      jobs: Record<
        string,
        {
          if?: string;
          outputs?: Record<string, string>;
          steps?: Array<{ name?: string; if?: string; run?: string }>;
        }
      >;
    };
    const generate = workflow.jobs.generate;
    expect(workflow.jobs.track_execution.if).toContain(
      "needs.generate.outputs.claimed == 'true'",
    );
    expect(workflow.jobs.track_execution.if).toContain("inputs.operation_id == ''");
    expect(generate.outputs?.claimed).toContain("steps.claim.outputs.claimed");
    const failureSteps = (generate.steps || []).filter((step) =>
      /failure\(\)/u.test(step.if || ""),
    );
    expect(failureSteps.map((step) => step.name)).toEqual([
      "Prepare private creative-recovery report",
      "Notify developer when generation stops",
      "Record generation failure",
    ]);
    for (const step of failureSteps) {
      expect(step.if).toContain("inputs.operation_id == ''");
      expect(step.if).toContain("steps.claim.outputs.claimed == 'true'");
    }
  });

  it("never substitutes client PII into public scripts, env, outputs, summaries or artifacts", async () => {
    const source = await readFile(workflowPath, "utf8");
    const workflow = yaml.load(source) as {
      jobs: Record<
        string,
        {
          steps?: Array<{
            name?: string;
            id?: string;
            env?: Record<string, string>;
            run?: string;
          }>;
        }
      >;
    };
    const pii = {
      businessName: "Synthetic Harbor Plumbing",
      email: "sam@example.test",
      leadEmail: "leads@example.test",
      phone: "555-0100",
      address: "1 Main Street",
      contactName: "Sam Owner",
    };
    const piiExpression = /steps\.intake\.outputs\.(?:email|business_name|lead_email|assets|slug|asset_summary|layout|research_mode|research_cost|research_queries)\b|client_payload\.client_email\b/u;
    const piiValues = Object.values(pii);

    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps || []);
    for (const step of steps) {
      for (const value of Object.values(step.env || {})) {
        if (!piiExpression.test(value)) continue;
        // The only permitted client-email reference is the legacy-only start
        // event, whose new-mode value is empty.
        expect(value).toContain("github.event_name == 'repository_dispatch'");
      }
      if (piiExpression.test(step.run || ""))
        throw new Error(`PII expression in run script: ${step.name}`);
    }

    // The intake step may publish opaque identifiers only.
    const intakeStep = steps.find((step) => step.id === "intake");
    expect(intakeStep).toBeDefined();
    const outputKeys = [
      ...(intakeStep?.run || "").matchAll(/echo "([a-z_]+)=.*"\s*>>\s*"\$GITHUB_OUTPUT"/gu),
    ].map((match) => match[1]);
    expect(new Set(outputKeys)).toEqual(
      new Set(["issue", "intake_ref", "intake_key"]),
    );

    expect(source).not.toContain("GITHUB_STEP_SUMMARY");
    expect(source).not.toContain("upload-artifact");
    // Review and repair capabilities stay in private files, not step outputs.
    expect(source).not.toMatch(/steps\.(?:review|creative_repair_link)\.outputs/u);

    // Simulate GitHub's pre-execution expression substitution with synthetic
    // PII available to every expression. If any expression can resolve to PII,
    // this catches it even when a branch would not run.
    const resolve = (expression: string) => {
      if (/steps\.intake\.outputs\.email/u.test(expression)) return pii.email;
      if (/steps\.intake\.outputs\.business_name/u.test(expression)) return pii.businessName;
      if (/steps\.intake\.outputs\.lead_email/u.test(expression)) return pii.leadEmail;
      if (/steps\.intake\.outputs\.asset/u.test(expression)) return "asset.png";
      if (/steps\.intake\.outputs\.slug/u.test(expression)) return "synthetic-harbor-plumbing";
      if (/client_payload\.client_email/u.test(expression))
        return /repository_dispatch/u.test(expression) ? "" : pii.email;
      if (/steps\.intake\.outputs\.issue/u.test(expression)) return "123";
      if (/steps\.intake\.outputs\.intake_ref/u.test(expression)) return "111111111111";
      if (/steps\.intake\.outputs\.intake_key/u.test(expression)) return intakeId;
      return "";
    };
    const substitute = (value: string) =>
      value.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) => resolve(expression));
    for (const step of steps) {
      for (const value of Object.values(step.env || {}))
        for (const valuePii of piiValues)
          expect(substitute(value), `${step.name} env leaked ${valuePii}`).not.toContain(valuePii);
      for (const valuePii of piiValues)
        expect(substitute(step.run || ""), `${step.name} leaked ${valuePii}`).not.toContain(valuePii);
    }
  });

  it("removes the client business name before a public launch-history write", () => {
    const sanitized = sanitizePublicLaunchConfig({
      business: {
        name: "Synthetic Harbor Plumbing",
        email: "sam@example.test",
        phone: "555-0100",
        address: "1 Main Street",
      },
      design: { experience: { packId: "pack-1", fingerprint: "fingerprint-1" } },
    });
    expect(sanitized.business.name).toBe(PUBLIC_LAUNCH_BUSINESS_NAME);
    expect(sanitized.design).toEqual({
      experience: { packId: "pack-1", fingerprint: "fingerprint-1" },
    });
    const serialized = JSON.stringify(sanitized);
    for (const value of ["Synthetic Harbor Plumbing", "sam@example.test", "555-0100", "1 Main Street"])
      expect(serialized).not.toContain(value);
  });

  it("captures new-mode run output privately and preserves exit/output behavior", async () => {
    const workflow = yaml.load(await readFile(workflowPath, "utf8")) as {
      jobs: { generate: { defaults?: { run?: { shell?: string } } } };
    };
    expect(workflow.jobs.generate.defaults?.run?.shell).toBe(
      "bash scripts/private-run.sh {0}",
    );

    const directory = await mkdtemp(path.join(tmpdir(), "launchloom-private-run-"));
    temporary.push(directory);
    const pii = ["Synthetic Harbor Plumbing", "sam@example.test", "555-0100"];
    const output = path.join(directory, "github-output");
    const publicSummary = path.join(directory, "public-summary.md");
    await writeFile(publicSummary, "");
    const script = path.join(directory, "step.sh");
    await writeFile(
      script,
      [
        "printf 'business=%s\\n' 'Synthetic Harbor Plumbing'",
        "printf 'email=%s\\n' 'sam@example.test' >&2",
        "printf 'phone=%s\\n' '555-0100'",
        "printf 'summary_business=%s\\n' 'Synthetic Harbor Plumbing' >> \"$GITHUB_STEP_SUMMARY\"",
        'echo "safe=1" >> "$GITHUB_OUTPUT"',
        "exit 0",
      ].join("\n"),
    );

    const run = (operationId: string) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = spawn("bash", ["scripts/private-run.sh", script], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              OPERATION_ID: operationId,
              RUNNER_TEMP: directory,
              GITHUB_OUTPUT: output,
              GITHUB_STEP_SUMMARY: publicSummary,
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
          });
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });
          child.once("error", reject);
          child.once("close", (code) => resolve({ code, stdout, stderr }));
        },
      );

    const newMode = await run(operationId);
    expect(newMode.code).toBe(0);
    expect(newMode.stdout).toBe("private_step=ok\n");
    expect(newMode.stderr).toBe("");
    for (const value of pii) {
      expect(newMode.stdout).not.toContain(value);
      expect(newMode.stderr).not.toContain(value);
    }
    expect(await readFile(output, "utf8")).toBe("safe=1\n");
    expect((await readdir(directory)).filter((name) => name.endsWith(".log"))).toEqual([]);

    await writeFile(
      script,
      [
        "printf 'business=%s\\n' 'Synthetic Harbor Plumbing'",
        "printf 'email=%s\\n' 'sam@example.test' >&2",
        "printf 'summary_business=%s\\n' 'Synthetic Harbor Plumbing' >> \"$GITHUB_STEP_SUMMARY\"",
        "exit 7",
      ].join("\n"),
    );
    const failed = await run(operationId);
    expect(failed.code).toBe(7);
    expect(failed.stdout).toBe("private_step=failed status=7\n");
    expect(failed.stderr).toBe("");
    for (const value of pii) expect(failed.stdout).not.toContain(value);

    const legacy = await run("");
    expect(legacy.code).toBe(7);
    expect(legacy.stdout).toContain("Synthetic Harbor Plumbing");
    expect(legacy.stderr).toContain("sam@example.test");
    expect(await readFile(publicSummary, "utf8")).toContain("Synthetic Harbor Plumbing");
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
