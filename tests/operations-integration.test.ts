import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import http from "node:http";
import { chromium } from "playwright";
import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptIntake,
  type InviteAcceptanceAdapter,
  type InviteReservation,
} from "../worker/src/operations/acceptance";
import type {
  AcceptanceInput,
  AcceptanceResult,
} from "../worker/src/operations/contracts";
import {
  createOperationsStore,
  type OperationsSql,
} from "../worker/src/operations/store";
import {
  dispatchScheduled,
  githubDispatcher,
} from "../worker/src/operations/dispatch";
import {
  operationsClaim,
  operationsEvent,
  operationsIntake,
  OPERATIONS_WORKFLOW_REF,
  type WorkflowPolicy,
} from "../worker/src/operations/github-auth";
import { createAttemptReconciler } from "../worker/src/operations/reconcile";
import { operationsDashboardApi } from "../worker/src/admin/workspace-api";
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";
import { fixtureHealth, pageOf } from "./fixtures/admin-workspace";

const yaml: { load(source: string): unknown } = createRequire(import.meta.url)(
  "js-yaml",
);

function run(
  command: string,
  args: string[],
  env = process.env,
  input?: string,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      error = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (error += b));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(error)),
    );
    child.stdin.end(input);
  });
}

// Executes the actual workflow intake shell with inert external command adapters.
// Dropping the claimed ID propagation must fail this before any paid generation.
it.each(["postgres", "legacy"])(
  "propagates the %s intake identity into initial config and research",
  async (mode) => {
    const directory = await mkdtemp("/tmp/opencode/task7-intake-shell-");
    try {
      await mkdir(path.join(directory, "bin"));
      const stub = `#!/bin/bash
if [[ "$*" == *"operations-client.mjs intake"* ]]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = --out ]; then printf 'synthetic intake' > "$2"; break; fi
    shift
  done
elif [[ "$*" == *"generate-site-config.mjs"* || "$*" == *"compile-inspiration-pack.mjs"* ]]; then
  printf '%s=%s\\n' "$1" "$LAUNCHLOOM_INTAKE_ID" >> "$IDENTITY_LOG"
fi
`;
      await writeFile(path.join(directory, "bin/node"), stub, { mode: 0o700 });
      await writeFile(
        path.join(directory, "bin/gh"),
        '#!/bin/bash\nprintf "synthetic legacy intake"\n',
        { mode: 0o700 },
      );
      const workflow = yaml.load(
        await readFile(".github/workflows/generate-client.yml", "utf8"),
      ) as {
        jobs: { generate: { steps: Array<{ id?: string; run?: string }> } };
      };
      const step = workflow.jobs.generate.steps.find((s) => s.id === "intake")!;
      const script = step.run!.replaceAll("/tmp/", `${directory}/`);
      const intakeId = "11111111-1111-4111-8111-111111111111";
      await run(
        "bash",
        ["-e", "-o", "pipefail"],
        {
          ...process.env,
          PATH: `${directory}/bin:${process.env.PATH}`,
          OPERATION_ID:
            mode === "postgres" ? "44444444-4444-4444-8444-444444444444" : "",
          INTAKE_ID: mode === "postgres" ? intakeId : "",
          ISSUE: mode === "legacy" ? "123" : "",
          LAUNCHLOOM_INTAKE_ID: mode === "legacy" ? "123" : "",
          REUSE_AUTHORED_CANDIDATES: "false",
          RUNNER_TEMP: directory,
          GITHUB_OUTPUT: path.join(directory, "outputs"),
          IDENTITY_LOG: path.join(directory, "identity"),
        },
        script,
      );
      const values = (await readFile(path.join(directory, "identity"), "utf8"))
        .trim()
        .split("\n");
      expect(values).toEqual([
        `scripts/generate-site-config.mjs=${mode === "postgres" ? intakeId : "123"}`,
        `scripts/compile-inspiration-pack.mjs=${mode === "postgres" ? intakeId : "123"}`,
      ]);
      const outputs = await readFile(path.join(directory, "outputs"), "utf8");
      expect(outputs).toContain(
        `intake_key=${mode === "postgres" ? intakeId : "123"}`,
      );
      expect(outputs).toContain(`issue=${mode === "postgres" ? "" : "123"}\n`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const databaseUrl = process.env.OPERATIONS_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    target.search ||
    target.hash ||
    !/^\/launchloom_operations_test(?:_[a-z0-9_]+)?$/u.test(target.pathname) ||
    process.env.OPERATIONS_TEST_DISPOSABLE !== "1"
  )
    throw Error("Explicitly disposable loopback PostgreSQL required.");
}
function psql(text: string) {
  if (!databaseUrl) throw Error("Disposable PostgreSQL required.");
  const target = new URL(databaseUrl);
  return run(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("PG")),
      ),
      PGHOST: target.hostname.replace(/^\[|\]$/gu, ""),
      PGPORT: target.port || "5432",
      PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
      PGUSER: decodeURIComponent(target.username),
      PGPASSWORD: decodeURIComponent(target.password),
      PGCONNECT_TIMEOUT: "5",
    },
    text,
  );
}
const connection: OperationsSql = {
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const rendered = text.replace(/\$(\d+)/gu, (_, n) => {
      const value = params[Number(n) - 1];
      return value == null
        ? "NULL"
        : `'${String(value).replaceAll("'", "''")}'`;
    });
    return JSON.parse(
      await psql(`SET ROLE launchloom_operations_worker;
      SELECT coalesce(json_agg(row_to_json(q)), '[]') FROM (${rendered}) q;`),
    );
  },
};

// The browser talks to a loopback server executing the real dashboard API/store.
// Only the admin principal and unrelated legacy history are synthetic adapters;
// no real login, external browser request or deployed target is involved.
async function verifyBrowser(attemptId: string) {
  const directory = await mkdtemp("/tmp/opencode/task7-browser-");
  const principal = {
    id: `access:${"c".repeat(64)}`,
    role: "admin",
    email: "admin@example.test",
    displayName: "Synthetic Admin",
    authSource: "cloudflare-access",
  };
  let origin = "";
  const methods: string[] = [];
  const unexpectedPaths: string[] = [];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, origin);
      if (url.pathname.startsWith("/api/")) methods.push(req.method!);
      if (url.pathname.startsWith("/admin-assets/")) {
        if (
          !/^\/admin-assets\/[A-Za-z0-9/_.-]+$/u.test(url.pathname) ||
          url.pathname.includes("..")
        ) {
          res.writeHead(404).end();
          return;
        }
        const content = await readFile(path.join(directory, url.pathname));
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".js")
            ? "text/javascript"
            : url.pathname.endsWith(".css")
              ? "text/css"
              : "font/woff2",
        );
        res.end(content);
        return;
      }
      if (url.pathname === "/admin/onboarding-invites") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin-assets/app.css"></head><body class="admin-page" data-admin-view="workspace"><div id="admin-root"></div><script type="module" src="/admin-assets/app.js"></script></body></html>',
        );
        return;
      }
      if (url.pathname.includes("/operations/records")) {
        const result = await operationsDashboardApi(
          new Request(url, { method: req.method }),
          {
            OPERATIONS_RECONCILE_MODE: "observe-v1",
            OPERATIONS_DATABASE_URL: "synthetic-not-used",
          } as Parameters<typeof operationsDashboardApi>[1],
          principal,
          createOperationsStore(connection),
        );
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(await result.text());
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if (url.pathname.endsWith("/me"))
        res.end(
          JSON.stringify({ principal, capabilities: { operationsRead: true } }),
        );
      else if (url.pathname.endsWith("/health"))
        res.end(JSON.stringify(fixtureHealth()));
      else if (url.pathname.endsWith("/attempts"))
        res.end(
          JSON.stringify({
            ...pageOf([], 0, 50),
            recordSource: "legacy",
            readOnly: true,
          }),
        );
      else {
        unexpectedPaths.push(url.pathname);
        res.writeHead(404).end("{}");
      }
    } catch {
      res.writeHead(500).end("{}");
    }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await buildAdminWorkspace({ outDir: directory });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch({ headless: true });
    for (const viewport of [
      { width: 1512, height: 960 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`${origin}/admin/onboarding-invites?view=operations`);
      await page
        .getByRole("heading", { name: "Current operations", exact: true })
        .waitFor();
      const row = page.locator(`[data-operation-attempt="${attemptId}"]`);
      // List row uses a button containing the stable ID, not client identity.
      await page.getByRole("button", { name: new RegExp(attemptId) }).click();
      await row.waitFor();
      await row
        .getByRole("definition")
        .filter({ hasText: /^Verified preview$/u })
        .waitFor();
      await page.getByText("aaaaaaaaaaaa", { exact: true }).waitFor();
      expect(await page.locator("body").innerText()).not.toMatch(
        /private-task7|Synthetic Task Seven/u,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/opencode/task7-operations-${viewport.width}.png`,
        fullPage: true,
      });
      if (viewport.width < 600)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await page
        .getByRole("link", { name: "Legacy history", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Legacy history", exact: true })
        .waitFor();
      if (viewport.width < 600)
        await page.waitForFunction(
          () =>
            document.querySelector(".admin-sidebar")!.getBoundingClientRect()
              .right <= 0,
        );
      expect(await page.locator("body").innerText()).toContain("Read-only");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/opencode/task7-legacy-${viewport.width}.png`,
        fullPage: true,
      });
      expect(unexpectedPaths).toEqual([]);
      expect(errors).toEqual([]);
      await page.close();
    }
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  } finally {
    await browser?.close();
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    await rm(directory, { recursive: true, force: true });
  }
}

// Synthetic DO boundary with persisted routing semantics. Real DO SQL/alarm
// implementation is exercised separately by the Worker acceptance suites.
function invites(initialMode?: "legacy" | "postgres") {
  let reservation: InviteReservation | null = null;
  let confirmed: AcceptanceResult | null = null;
  const adapter: InviteAcceptanceAdapter = {
    async reserve(input) {
      reservation ??= {
        accepted: true,
        mode: initialMode ?? input.routingMode,
        state: "unconfirmed",
        fingerprint: input.fingerprint,
      };
      return { ...reservation, acceptance: confirmed };
    },
    async inspect() {
      return reservation;
    },
    async confirm(input) {
      confirmed = input.acceptance;
      return { confirmed: true, duplicate: false };
    },
    async markCommitStarted() {},
    async queueReceipt() {},
    async scheduleRecovery() {},
    async completeRecovery() {},
  };
  return adapter;
}
function input(): AcceptanceInput {
  const id = randomUUID();
  return {
    inviteId: `synthetic-${id}`,
    submissionId: `submission-${id}`,
    fingerprint: createHash("sha256").update(id).digest("hex"),
    payloadVersion: 2,
    payload: {
      businessName: "Synthetic Task Seven",
      email: "private-task7@example.test",
    },
    consent: { termsVersion: "task7-synthetic", rightsConfirmed: true },
    profile: "full",
  };
}

describe.skipIf(!databaseUrl)(
  "synthetic Postgres acceptance through authenticated handoff and dashboard",
  () => {
    const store = () =>
      createOperationsStore(connection, { uncertainDispatchRetry: true });
    let policy: WorkflowPolicy;
    let signingKey: CryptoKey;
    beforeAll(async () => {
      for (const name of [
        "001-operations",
        "002-acceptance-recovery",
        "003-dispatch",
        "004-run-ownership",
        "005-reconciliation",
        "006-cost-coverage",
        "007-dashboard",
      ])
        await psql(await readFile(`db/operations/${name}.sql`, "utf8"));
      const pair = (await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;
      signingKey = pair.privateKey;
      const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
      policy = {
        issuer: "https://token.actions.githubusercontent.com",
        audience: "launchloom-operations",
        repositoryId: "1352728020",
        repository: "WrazyAI/launchloom",
        workflowRef: OPERATIONS_WORKFLOW_REF,
        ref: "refs/heads/main",
        eventName: "workflow_dispatch",
        keys: [
          {
            kty: "RSA",
            kid: "task7",
            n: jwk.n!,
            e: jwk.e!,
            alg: "RS256",
            use: "sig",
          },
        ],
      };
    }, 60_000);
    async function token(runId: string, audience = policy.audience) {
      const encode = (v: unknown) =>
        Buffer.from(JSON.stringify(v)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: "RS256", kid: "task7", typ: "JWT" })}.${encode(
        {
          iss: policy.issuer,
          aud: audience,
          sub: "repo:WrazyAI/launchloom:ref:refs/heads/main",
          repository: policy.repository,
          repository_id: policy.repositoryId,
          workflow_ref: policy.workflowRef,
          ref: policy.ref,
          ref_type: "branch",
          event_name: policy.eventName,
          run_id: runId,
          run_attempt: "1",
          iat: now - 1,
          nbf: now - 1,
          exp: now + 300,
        },
      )}`;
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        signingKey,
        new TextEncoder().encode(unsigned),
      );
      return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
    }
    async function request(
      route: string,
      runId: string,
      body?: unknown,
      audience?: string,
    ) {
      return new Request(
        `https://api.example.test/api/internal/operations/${route}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${await token(runId, audience)}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
    }
    async function due(id: string) {
      await psql(
        `UPDATE launchloom_operations.dispatch_outbox SET next_attempt_at='2000-01-01' WHERE id='${id}';`,
      );
    }
    async function dashboard(id: string) {
      const response = await operationsDashboardApi(
        new Request(
          `https://api.example.test/api/admin/onboarding-invites/workspace/operations/records/${id}`,
        ),
        {
          OPERATIONS_RECONCILE_MODE: "observe-v1",
          OPERATIONS_DATABASE_URL: "synthetic-not-used",
        } as Parameters<typeof operationsDashboardApi>[1],
        { id: "task7-admin", role: "admin" },
        store(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        operation: Record<string, unknown>;
        recordSource: string;
        readOnly: boolean;
      };
      expect(body.recordSource).toBe("operations");
      expect(body.readOnly).toBe(true);
      return body.operation;
    }

    it("retains accepted IDs across GitHub outage, ambiguous sends, duplicate claims and rollback with an active owner", async () => {
      const data = input(),
        coordinator = invites();
      const accepted = await acceptIntake(data, {
        store: store(),
        invites: coordinator,
        routingMode: "postgres",
      });
      // Rollback stops NEW admissions only: the stored mode, IDs and owner survive.
      const replay = await acceptIntake(data, {
        store: store(),
        invites: coordinator,
        routingMode: "legacy",
      });
      expect(replay).toMatchObject({ ...accepted, created: false });
      expect(await store().getOperation(accepted.attemptId)).toMatchObject({
        status: "waiting_to_start",
      });
      const publicInputs: unknown[] = [];
      let githubAvailable = false;
      const send: typeof fetch = async (_url, init) => {
        publicInputs.push(JSON.parse(String(init?.body)));
        if (!githubAvailable) return new Response(null, { status: 429 });
        // GitHub accepted, then the response was lost. Only the claim grants work.
        throw Error("synthetic lost accepted response");
      };
      const dispatch = githubDispatcher(
        {
          repository: "WrazyAI/launchloom",
          workflow: "generate-client.yml",
          ref: "main",
          token: "synthetic",
        },
        send,
      );
      await due(accepted.operationId);
      await dispatchScheduled({ store: store(), dispatch });
      expect(await store().getOperation(accepted.attemptId)).toMatchObject({
        status: "waiting_to_start",
      });
      githubAvailable = true;
      await due(accepted.operationId);
      await dispatchScheduled({ store: store(), dispatch });
      await due(accepted.operationId);
      await dispatchScheduled({ store: store(), dispatch });
      expect(publicInputs).toEqual(
        Array.from({ length: 3 }, () => ({
          ref: "main",
          inputs: {
            operation_id: accepted.operationId,
            request_id: accepted.requestId,
            attempt_id: accepted.attemptId,
          },
        })),
      );
      expect(JSON.stringify(publicInputs)).not.toMatch(
        /private-task7|Synthetic Task Seven|issue|payload|email/u,
      );

      const deps = { store: store(), policy };
      const body = {
        operationId: accepted.operationId,
        requestId: accepted.requestId,
        attemptId: accepted.attemptId,
      };
      const unauthorized = await operationsClaim(
        await request("claim", "7700", body, "wrong-audience"),
        {},
        deps,
      );
      expect(unauthorized.status).toBe(401);
      expect(
        (
          await operationsIntake(
            await request("intake", "7701"),
            {},
            accepted.intakeId,
            deps,
          )
        ).status,
      ).toBe(404);
      const claims = await Promise.all(
        ["7701", "7702"].map(async (runId) => ({
          runId,
          response: await operationsClaim(
            await request("claim", runId, body),
            {},
            deps,
          ),
        })),
      );
      expect(claims.map((c) => c.response.status).sort()).toEqual([200, 409]);
      const winner = claims.find((c) => c.response.status === 200)!.runId;
      const loser = claims.find((c) => c.response.status === 409)!.runId;
      const other = await store().createAcceptance(input());
      expect(
        (
          await operationsIntake(
            await request("intake", winner),
            {},
            other.intakeId,
            deps,
          )
        ).status,
      ).toBe(404);
      let executions = 0;
      for (const claim of claims)
        if (claim.response.status === 200) {
          const payload = await operationsIntake(
            await request("intake", claim.runId),
            {},
            accepted.intakeId,
            deps,
          );
          expect(await payload.json()).toMatchObject({
            intakeId: accepted.intakeId,
            payload: data.payload,
          });
          executions++;
        }
      expect(executions).toBe(1);
      expect(
        (
          await operationsIntake(
            await request("intake", loser),
            {},
            accepted.intakeId,
            deps,
          )
        ).status,
      ).toBe(404);
      const stillAccepted = await acceptIntake(data, {
        store: store(),
        invites: coordinator,
        routingMode: "legacy",
      });
      expect(stillAccepted.attemptId).toBe(accepted.attemptId);
      const stage = {
        attemptId: accepted.attemptId,
        eventKey: "render:completed",
        stage: "render",
        transition: "completed",
        costKind: "unreported",
      };
      expect(
        (await operationsEvent(await request("events", loser, stage), {}, deps))
          .status,
      ).toBe(409);
      const event = await operationsEvent(
        await request("events", winner, stage),
        {},
        deps,
      );
      expect(await event.json()).toEqual({ status: "inserted" });
      expect(
        await (
          await operationsEvent(
            await request("events", winner, stage),
            {},
            deps,
          )
        ).json(),
      ).toEqual({ status: "duplicate" });
      await due(accepted.operationId);
      await dispatchScheduled({ store: store(), dispatch });
      expect(publicInputs).toHaveLength(3);
      expect(await store().getOperation(accepted.attemptId)).toMatchObject({
        status: "running",
      });
      // Provider observations cannot substitute for the post-gate handoff.
      const reconciler = createAttemptReconciler(store(), async (run) => ({
        ...run,
        status: "completed",
        conclusion: "success",
      }));
      await reconciler.reconcileAttempt(accepted.attemptId);
      expect(await store().getOperation(accepted.attemptId)).toMatchObject({
        status: "attention",
        deliveryStatus: "none",
      });
      const handoff = {
        attemptId: accepted.attemptId,
        eventKey: "handoff:completed",
        stage: "handoff",
        transition: "completed",
        costKind: "unreported",
        buildSha: "a".repeat(40),
      };
      expect(
        await (
          await operationsEvent(
            await request("events", winner, handoff),
            {},
            deps,
          )
        ).json(),
      ).toEqual({ status: "inserted" });
      await reconciler.reconcileAttempt(accepted.attemptId);
      const record = await dashboard(accepted.attemptId);
      expect(JSON.stringify(record)).not.toMatch(
        /private-task7|Synthetic Task Seven|payload|consent|issueNumber/u,
      );
      expect(record).toMatchObject({
        status: "preview_ready",
        deliveryStatus: "preview_ready",
        telemetryIncomplete: true,
      });
      expect(record.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "handoff",
            buildSha: "a".repeat(40),
          }),
        ]),
      );
      await verifyBrowser(accepted.attemptId);
    }, 60_000);

    it("fails closed before DB commit and never moves a stored legacy reservation into Postgres", async () => {
      const data = input();
      const unavailable = createOperationsStore({
        async query() {
          throw Error("synthetic database outage");
        },
      });
      await expect(
        acceptIntake(data, {
          store: unavailable,
          invites: invites(),
          routingMode: "postgres",
        }),
      ).rejects.toMatchObject({ code: "dependency_unavailable" });
      expect(
        await store().getIntakeByBinding(data.inviteId, data.submissionId),
      ).toBeNull();
      const legacy = invites("legacy");
      await expect(
        acceptIntake(data, {
          store: store(),
          invites: legacy,
          routingMode: "postgres",
        }),
      ).rejects.toMatchObject({ code: "legacy_route" });
      expect(
        await store().getIntakeByBinding(data.inviteId, data.submissionId),
      ).toBeNull();
    }, 30_000);
  },
);
