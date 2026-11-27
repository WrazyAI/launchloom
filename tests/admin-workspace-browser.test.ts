import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "playwright";
import sharp from "sharp";
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";
import type {
  AttemptDetail,
  AttemptSummary,
  Health,
  RelatedIssuePreview,
} from "../src/lib/admin-contracts";
import {
  attemptDetail,
  fixtureHealth,
  pageOf,
  syntheticAttempts,
  syntheticClients,
  syntheticEvents,
} from "./fixtures/admin-workspace";

const ATTEMPTS = syntheticAttempts();
const CLIENTS = syntheticClients().map((client) =>
  client.clientId === "submission:client-a"
    ? {
        ...client,
        workflow: {
          attemptId: "attempt-diagnostic",
          executionStatus: "failed" as const,
          deliveryStatus: "diagnostic" as const,
          stale: false,
          failureStage: "preview_deploy",
          stages: [
            { stage: "intake", status: "completed" },
            { stage: "seo_telemetry", status: "completed" },
            { stage: "client_repo", status: "completed" },
            { stage: "pack_select", status: "completed" },
            { stage: "preview_deploy", status: "failed" },
            { stage: "preview_verification", status: "skipped" },
            { stage: "preview_ready", status: "completed" },
          ],
        },
      }
    : { ...client, workflow: null },
);
const ATTENTION_ATTEMPTS = ATTEMPTS.filter(
  (attempt) =>
    attempt.executionStatus === "failed" ||
    attempt.executionStatus === "unknown" ||
    attempt.stale ||
    attempt.deliveryStatus === "attention" ||
    attempt.deliveryStatus === "diagnostic",
).length;
const adminPrincipal = {
  id: `access:${"a".repeat(64)}`,
  email: "admin@example.test",
  displayName: "Browser Admin",
  role: "admin",
  authSource: "cloudflare-access",
} as const;

type RecordedRequest = {
  path: string;
  params: Record<string, string>;
};

vi.setConfig({ testTimeout: 30_000 });

let browser: Browser;
let server: http.Server;
let origin = "";
let assetsDirectory = "";
let requests: RecordedRequest[] = [];
let health: Health = fixtureHealth();
let delays = new Map<string, number>();
let failAttemptListOnce = false;
let failHealth = false;
let legacyWorkflow = false;
let workflowOverride: AttemptDetail | null = null;
let attemptListDelay = 0;
let relatedPreviews = new Map<string, RelatedIssuePreview>();
let eventDetails = new Map<string, string>();
type HeroMode = "ok" | "notFound" | "unauthorized";
let heroMode: HeroMode = "ok";
let heroPng: Buffer;
let operationsReadCapability = false;
let activityEnabled = false;
let activityFixture: unknown = null;
let seoDetail: string | null = null;

function sendJson(response: http.ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendText(
  response: http.ServerResponse,
  body: string,
  status = 200,
  contentType = "text/plain; charset=utf-8",
) {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
}

function record(pathname: string, params: URLSearchParams) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  requests.push({ path: decoded, params: Object.fromEntries(params) });
}

function lastRequest(pathname: string) {
  return requests
    .filter((entry) => entry.path === pathname && entry.params.limit !== "1")
    .at(-1);
}

function attentionRequests(pathname = "/attempts") {
  return requests.filter(
    (entry) =>
      entry.path === pathname &&
      entry.params.limit === "1" &&
      entry.params.attention === "true",
  );
}

function attemptPage(params: URLSearchParams) {
  const search = params.get("search")?.trim().toLowerCase() || "";
  const status = params.get("executionStatus");
  const initiator = params.get("initiatorId");
  const creator = params.get("creatorId");
  const profile = params.get("profile");
  const clientId = params.get("clientId");
  const issueNumber = Number(params.get("issueNumber") || 0);
  const siteOnly = params.get("siteOnly") === "true";
  const from = Number(params.get("from") || 0);
  const to = Number(params.get("to") || 0);
  const attention = params.get("attention") === "true";
  const filtered = ATTEMPTS.filter((attempt) => {
    const client = CLIENTS.find((entry) => entry.clientId === attempt.clientId);
    const haystack = [
      attempt.attemptId,
      attempt.requestId,
      attempt.clientId,
      attempt.runId,
      attempt.repository,
      attempt.issueNumber,
      client?.businessName,
      client?.contactName,
      client?.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!search || haystack.includes(search)) &&
      (!status || attempt.executionStatus === status) &&
      (!initiator || attempt.initiator.id === initiator) &&
      (!creator || attempt.invitationCreator.id === creator) &&
      (!profile || attempt.profile === profile) &&
      (!clientId ||
        attempt.clientId === clientId ||
        (!attempt.clientId &&
          CLIENTS.some(
            (record) =>
              record.clientId === clientId &&
              record.issueNumber === attempt.issueNumber,
          ))) &&
      (!issueNumber || attempt.issueNumber === issueNumber) &&
      (!siteOnly ||
        attempt.profile === "full" ||
        attempt.profile === "full-preview") &&
      (!attention ||
        attempt.executionStatus === "failed" ||
        attempt.executionStatus === "unknown" ||
        attempt.stale ||
        attempt.deliveryStatus === "attention" ||
        attempt.deliveryStatus === "diagnostic") &&
      (!from || attempt.createdAt >= from) &&
      (!to || attempt.createdAt <= to)
    );
  });
  return filtered;
}

function parsePage(params: URLSearchParams) {
  const cursor = params.get("cursor") || "";
  const offset = /^offset:(\d+)$/u.test(cursor)
    ? Number(cursor.slice("offset:".length))
    : 0;
  const limit = Number(params.get("limit") || 50);
  return { offset, limit: Number.isFinite(limit) ? limit : 50 };
}

function clientPage(params: URLSearchParams) {
  const search = params.get("search")?.trim().toLowerCase() || "";
  const from = Number(params.get("from") || 0);
  const to = Number(params.get("to") || 0);
  return CLIENTS.filter((client) => {
    const haystack = [
      client.clientId,
      client.inviteId,
      client.submissionId,
      client.issueNumber,
      client.businessName,
      client.contactName,
      client.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!search || haystack.includes(search)) &&
      (!from || client.createdAt >= from) &&
      (!to || client.createdAt <= to)
    );
  });
}

function eventPage(attempt: AttemptSummary, params: URLSearchParams) {
  const events = syntheticEvents(attempt);
  const { offset, limit } = parsePage(params);
  return pageOf(events, offset, limit);
}

function assetContentType(file: string) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

const shell = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LaunchLoom operations</title>
<link rel="stylesheet" href="/admin-assets/app.css">
</head>
<body class="admin-page" data-admin-view="workspace">
<div id="admin-root"><main class="admin-fallback"><h1>Operations workspace</h1><p>Loading the workspace shell...</p></main></div>
<script type="module" src="/admin-assets/app.js"></script>
</body>
</html>`;

async function serve(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  const url = new URL(request.url || "/", origin);
  const pathname = url.pathname;

  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname.endsWith("/generation-hero")) {
    record("/generation-hero", url.searchParams);
    if (heroMode === "notFound") {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("Not found");
      return;
    }
    if (heroMode === "unauthorized") {
      response.writeHead(401, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "WWW-Authenticate": "Bearer",
      });
      response.end("Unauthorized");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(heroPng);
    return;
  }

  if (pathname === "/admin/onboarding-invites") {
    sendText(response, shell, 200, "text/html; charset=utf-8");
    return;
  }

  if (pathname.startsWith("/admin-assets/")) {
    const relative = pathname.slice("/admin-assets/".length);
    if (
      !relative ||
      relative.includes("..") ||
      relative.includes("\\") ||
      !/^[A-Za-z0-9._/-]+$/u.test(relative)
    ) {
      sendText(response, "Not found", 404);
      return;
    }
    try {
      const content = await readFile(
        path.join(assetsDirectory, "admin-assets", relative),
      );
      response.writeHead(200, {
        "Content-Type": assetContentType(relative),
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      sendText(response, "Not found", 404);
    }
    return;
  }

  const prefix = "/api/admin/onboarding-invites/workspace";
  if (!pathname.startsWith(prefix)) {
    sendText(response, "Not found", 404);
    return;
  }

  const suffix = pathname.slice(prefix.length);
  const params = url.searchParams;
  record(suffix, params);

  if (suffix === "/health") {
    if (failHealth) {
      sendJson(
        response,
        { error: { code: "unavailable", message: "Health unavailable." } },
        503,
      );
      return;
    }
    sendJson(response, health);
    return;
  }
  if (suffix === "/me") {
    sendJson(response, {
      principal: adminPrincipal,
      capabilities: {
        operationsRead: operationsReadCapability,
        generationActivityRead: activityEnabled,
      },
    });
    return;
  }
  if (suffix === "/attempts") {
    if (attemptListDelay)
      await new Promise((resolve) => setTimeout(resolve, attemptListDelay));
    if (failAttemptListOnce) {
      failAttemptListOnce = false;
      sendJson(
        response,
        { error: { code: "unavailable", message: "Attempts unavailable." } },
        503,
      );
      return;
    }
    const filtered = attemptPage(params);
    const { offset, limit } = parsePage(params);
    sendJson(response, pageOf(filtered, offset, limit));
    return;
  }
  if (suffix === "/clients") {
    const filtered = clientPage(params);
    const { offset, limit } = parsePage(params);
    sendJson(response, { ...pageOf(filtered, offset, limit), health });
    return;
  }

  const clientMatch = /^\/clients\/([^/]+)$/u.exec(suffix);
  if (clientMatch) {
    const id = decodeURIComponent(clientMatch[1]);
    const delay = delays.get(id) || 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const client = CLIENTS.find((entry) => entry.clientId === id);
    if (!client) {
      sendJson(
        response,
        { error: { code: "not_found", message: "Not found." } },
        404,
      );
      return;
    }
    sendJson(response, { client });
    return;
  }

  const activityMatch = /^\/legacy\/attempts\/([^/]+)\/activity$/u.exec(suffix);
  if (activityMatch) {
    const id = decodeURIComponent(activityMatch[1]);
    sendJson(response, activityFixture ?? activityPageFor(id));
    return;
  }

  const attemptMatch = /^\/attempts\/([^/]+)(\/events)?$/u.exec(suffix);
  if (attemptMatch) {
    const id = decodeURIComponent(attemptMatch[1]);
    const delay = delays.get(id) || 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const attempt = ATTEMPTS.find((entry) => entry.attemptId === id);
    if (!attempt) {
      sendJson(
        response,
        { error: { code: "not_found", message: "Not found." } },
        404,
      );
      return;
    }
    const detail =
      workflowOverride?.attemptId === id
        ? structuredClone(workflowOverride)
        : legacyWorkflow && id === "attempt-0000"
          ? {
              ...attemptDetail(attempt),
              executionStatus: "failed" as const,
              failure: {
                category: "workflow",
                stage: "workflow",
                summary: "The workflow stopped before a preview was ready.",
                evidenceUrl: null,
                nextStep: "Inspect the run.",
              },
              events: [
                "intake",
                "seo_research",
                "inspiration_selection",
                "reference_analysis",
                "workflow",
              ].map((stage, index) => ({
                ...attemptDetail(attempt).events[0],
                eventKey: `github-step:${stage}`,
                stage,
                status: stage === "workflow" ? "failed" : "completed",
                source: "github-reconcile" as const,
                detail:
                  stage === "workflow"
                    ? "The workflow stopped before a preview was ready."
                    : null,
                createdAt: attempt.updatedAt + index,
              })),
            }
          : attemptDetail(attempt);
    if (id === "attempt-diagnostic" && workflowOverride?.attemptId !== id) {
      const base = detail.events[0];
      detail.events = [
        {
          ...base,
          eventKey: "github-step:intake",
          stage: "intake",
          status: "completed",
          source: "github-reconcile",
          detail: "Intake parsed and site configuration prepared.",
        },
        {
          ...base,
          eventKey: "github-step:seo_telemetry",
          stage: "seo_telemetry",
          status: "completed",
          source: "github-reconcile",
        },
        {
          ...base,
          eventKey: "github-step:client_repo",
          stage: "client_repo",
          status: "completed",
          source: "github-reconcile",
        },
        {
          ...base,
          eventKey: "github-step:pack_select",
          stage: "pack_select",
          status: "completed",
          source: "github-reconcile",
        },
        {
          ...base,
          eventKey: "github-step:preview_deploy",
          stage: "preview_deploy",
          status: "failed",
          source: "github-reconcile",
          detail: JSON.stringify({
            errorCode: "LL_STAGE_PREVIEW_DEPLOY_FAILED",
            diagnosticExcerpt:
              "Build and direct-upload public preview: failure.",
          }),
        },
        {
          ...base,
          eventKey: "github-step:preview_verification",
          stage: "preview_verification",
          status: "skipped",
          source: "github-reconcile",
        },
        {
          ...base,
          eventKey: "github-step:preview_ready",
          stage: "preview_ready",
          status: "completed",
          source: "github-reconcile",
        },
      ];
    }
    const detailOverride = eventDetails.get(id);
    const events = eventPage(attempt, params);
    if (seoDetail && id === "attempt-0000" && !params.has("cursor")) {
      const event = {
        ...detail.events[0],
        eventKey: "seo-fixture",
        stage: "seo_research",
        status: "recorded-incomplete",
        detail: seoDetail,
        costUsd: 0.10512,
        costKind: "actual" as const,
      };
      detail.events = [event, ...detail.events];
      events.items = [event, ...events.items];
      events.total += 1;
    }
    if (detailOverride) {
      detail.events = detail.events.map((event) =>
        event.stage === "creative"
          ? { ...event, detail: detailOverride }
          : event,
      );
      events.items = events.items.map((event) =>
        event.stage === "creative"
          ? { ...event, detail: detailOverride }
          : event,
      );
    }
    sendJson(
      response,
      attemptMatch[2]
        ? events
        : {
            attempt: {
              ...detail,
              relatedPreview: relatedPreviews.get(id) ?? null,
            },
          },
    );
    return;
  }

  sendJson(
    response,
    { error: { code: "not_found", message: "Not found." } },
    404,
  );
}

beforeAll(async () => {
  heroPng = await sharp({
    create: {
      width: 320,
      height: 200,
      channels: 3,
      background: { r: 229, g: 232, b: 223 },
    },
  })
    .png()
    .toBuffer();
  assetsDirectory = await mkdtemp(
    path.join(tmpdir(), "launchloom-admin-browser-"),
  );
  await buildAdminWorkspace({ outDir: assetsDirectory, production: true });
  server = http.createServer((request, response) => {
    void serve(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(assetsDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  operationsReadCapability = false;
  activityEnabled = false;
  activityFixture = null;
  requests = [];
  health = fixtureHealth();
  delays = new Map();
  failAttemptListOnce = false;
  failHealth = false;
  legacyWorkflow = false;
  workflowOverride = null;
  attemptListDelay = 0;
  heroMode = "ok";
  relatedPreviews = new Map();
  eventDetails = new Map();
});

type OpenOptions = {
  viewport?: { width: number; height: number };
  path?: string;
  clock?: boolean;
};

function activityEvent(index: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    context: {
      namespace: "legacy",
      attemptId: "attempt-diagnostic",
      producerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      stage: "authoring",
      substep: null,
      taskId: null,
      parentTaskId: null,
      candidateId: "candidate-1",
      repairPass: null,
      actor: { kind: "model", role: "site_builder" },
    },
    sequence: index,
    emittedAt: new Date(Date.now() - (10 - index) * 1_000).toISOString(),
    kind: "model_started",
    payload: {
      callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
    },
    ...overrides,
  };
}

function progressiveWorkflow(
  lastStage: string,
  status: "started" | "failed",
  attemptId = "attempt-0000",
): AttemptDetail {
  const base = attemptDetail(
    ATTEMPTS.find((attempt) => attempt.attemptId === attemptId)!,
  );
  const stages = [
    "profile_policy",
    "renderer_policy",
    "intake_handoff_check",
    "setup",
    "intake",
    "seo_research",
    "seo_telemetry",
    "inspiration_selection",
    "reference_analysis",
    "client_repo",
    "review_branch",
    "imagery",
    "authoring",
    "authored_evidence",
    "creative_render",
    "preview_deploy",
  ];
  const events = stages
    .slice(0, stages.indexOf(lastStage) + 1)
    .map((stage, index) => ({
      ...base.events[0],
      eventKey: `stage:${stage}`,
      stage,
      status: stage === lastStage ? status : "completed",
      source: "callback" as const,
      detail:
        stage === lastStage && status === "failed"
          ? "The upload failed after rendering."
          : `Evidence for ${stage}.`,
      createdAt: base.updatedAt + index,
      observedAt: base.updatedAt + index,
    }));
  return {
    ...base,
    stale: false,
    executionStatus: status === "failed" ? "failed" : "running",
    deliveryStatus: "none",
    completedAt: status === "failed" ? base.updatedAt : null,
    failure:
      status === "failed"
        ? {
            ...base.failure,
            stage: lastStage,
            category: "deploy",
            summary: "The upload failed after rendering.",
          }
        : {
            stage: null,
            category: null,
            summary: null,
            evidenceUrl: null,
            nextStep: null,
          },
    events,
    eventCount: events.length,
    eventsNextCursor: null,
    workflowEvents: [],
  };
}

function activityPageFor(attemptId: string) {
  const now = Date.now();
  const withAttempt = (event: ReturnType<typeof activityEvent>) => ({
    ...event,
    context: { ...event.context, attemptId },
    cursor: `v1.${event.sequence.toString(16)}.abcdabcd`,
    receivedAt: now - (10 - event.sequence) * 1_000,
  });
  const items = [
    activityEvent(1),
    activityEvent(2, {
      kind: "model_finished",
      payload: {
        callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        status: "completed",
      },
    }),
    activityEvent(3, {
      kind: "output",
      payload: {
        callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        message: {
          kind: "text",
          text: "I am building the opening section around the approved service scope.",
        },
      },
    }),
    activityEvent(4, {
      kind: "usage",
      payload: {
        callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        usage: {
          inputTokens: 1200,
          outputTokens: 340,
          cachedInputTokens: null,
          cacheWriteTokens: null,
          reasoningTokens: null,
          costUsd: "0.12000000",
          costKind: "actual",
        },
      },
    }),
    activityEvent(5, {
      context: {
        ...activityEvent(5).context,
        actor: { kind: "orchestrator", role: "renderer" },
      },
      kind: "action_started",
      payload: {
        actionId: "render:1",
        name: "render_candidate",
        input: { path: "src/pages/index.astro" },
      },
    }),
    activityEvent(6, {
      context: {
        ...activityEvent(6).context,
        actor: { kind: "orchestrator", role: "renderer" },
      },
      kind: "action_finished",
      payload: {
        actionId: "render:1",
        name: "render_candidate",
        status: "succeeded",
        durationMs: 420,
        result: { count: 1 },
      },
    }),
    activityEvent(7, {
      kind: "error",
      payload: {
        scope: "action",
        code: "render_error",
        message: { kind: "text", text: "The candidate render retried once." },
      },
    }),
    activityEvent(8, {
      kind: "coverage",
      payload: {
        boundary: "action.creative_authoring",
        status: "instrumented",
        detail: null,
      },
    }),
  ].map((event) => withAttempt(event as ReturnType<typeof activityEvent>));
  return {
    activity: {
      identity: { namespace: "legacy", attemptId },
      items,
      nextCursor: null,
      hasMore: false,
      observedAt: now,
      lastHeartbeatAt: now - 5_000,
      recording: "recording",
      coverage: [
        {
          boundary: "action.creative_authoring",
          status: "instrumented",
          detail: null,
        },
      ],
      usage: {
        inputTokens: 1200,
        outputTokens: 340,
        cachedInputTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        responses: 1,
        unknownResponses: 0,
        cost: {
          currency: "USD",
          actual: "0.12000000",
          estimated: null,
          unreportedCount: 0,
        },
      },
      retentionDays: 30,
    },
    readOnly: true,
  };
}

async function openPage(options: OpenOptions = {}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1512, height: 960 },
  });
  const errors: string[] = [];
  if (options.clock) await page.clock.install();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/workspace/revisions?**", (route) =>
    route.fulfill({ json: { version: 1, requests: [] } }),
  );
  await page.goto(
    `${origin}${options.path || "/admin/onboarding-invites?view=generations"}`,
    { waitUntil: "domcontentloaded" },
  );
  return { page, errors };
}

async function visible(locator: Locator, timeout = 8_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function waitForGenerations(page: Page) {
  await visible(page.locator("#generations-view"));
  // Most existing assertions describe the attempt ledger; the default view is
  // the site timeline, so switch to the ledger before returning. Deep-linked
  // attempts open a dialog and must keep their current view.
  if ((await page.getByRole("dialog").count()) === 0) {
    await page.getByRole("button", { name: "Ledger" }).click();
    await visible(
      page.getByText(new RegExp(`${ATTEMPTS.length} attempts`, "u")),
    );
  }
}

async function openFilters(page: Page) {
  if ((await page.getByRole("dialog").count()) > 0) return;
  const details = page.locator("details.admin-filter-disclosure");
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await details.locator("summary").click();
}

async function waitForClients(page: Page) {
  const summary = page.getByTestId("client-page-summary");
  await visible(summary);
  await expect
    .poll(() => summary.textContent())
    .toContain(`${CLIENTS.length} clients`);
}

async function focused(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => element === document.activeElement),
    )
    .toBe(true);
}

function colorChannels(value: string) {
  const match = /^rgba?\(([^)]+)\)$/u.exec(value.trim());
  if (!match) throw new Error(`Unsupported color value: ${value}`);
  const channels = match[1]
    .split(/[,\s/]+/u)
    .filter(Boolean)
    .map(Number);
  if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel)))
    throw new Error(`Unsupported color value: ${value}`);
  return channels.slice(0, 3);
}

function relativeLuminance(value: string) {
  const [red, green, blue] = colorChannels(value).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function autoErrors(
  errors: string[],
  options: {
    allowResource503?: boolean;
    allowResourceStatuses?: number[];
  } = {},
) {
  const allowedStatuses = new Set([
    ...(options.allowResource503 ? [503] : []),
    ...(options.allowResourceStatuses || []),
  ]);
  const unexpected = errors.filter((error) => {
    const status = /Failed to load resource: .*?(\d{3}) \(/u.exec(error)?.[1];
    return !(status && allowedStatuses.has(Number(status)));
  });
  expect(unexpected).toEqual([]);
}

describe("real admin workspace browser behavior", () => {
  it("renders nested event JSON as labeled fields without losing zero, false or escaped text", async () => {
    eventDetails.set(
      "attempt-0000",
      JSON.stringify({
        renderer: "pack",
        quality_metrics: { passedChecks: 0, approved: false },
        checks: [{ name: "contrast", passed: true }],
        note: null,
        html: '<img src=x onerror="window.__adminFxss=1">',
        evidenceUrl: "javascript:window.__adminFxss=2",
      }),
    );
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const detail = page
        .locator("#attempt-inspector .admin-timeline__item")
        .filter({ hasText: "creative" })
        .locator(".admin-structured-value");
      await visible(
        detail.locator("dt").getByText("Quality metrics", { exact: true }),
      );
      expect(
        await detail.locator("dd").getByText("0", { exact: true }).count(),
      ).toBe(1);
      expect(
        await detail.locator("dd").getByText("No", { exact: true }).count(),
      ).toBe(1);
      expect(
        await detail.locator("dd").getByText("Yes", { exact: true }).count(),
      ).toBe(1);
      expect(
        await detail
          .locator("dd")
          .getByText("Not recorded", { exact: true })
          .count(),
      ).toBe(1);
      expect(await detail.locator("ol > li").count()).toBe(1);
      expect(await detail.textContent()).toContain(
        '<img src=x onerror="window.__adminFxss=1">',
      );
      expect(await detail.locator("img, script, a").count()).toBe(0);
      expect(
        await page.evaluate(
          () => (window as unknown as { __adminFxss?: number }).__adminFxss,
        ),
      ).toBeUndefined();
    } finally {
      await page.close();
    }
  });

  it("keeps the complete attempt reference readable in the record disclosure", async () => {
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const record = page
        .locator("#attempt-inspector .admin-panel-disclosure")
        .filter({
          has: page.locator("summary").filter({ hasText: "Record details" }),
        });
      await record.locator("summary").click();
      await visible(
        record.locator("dt").getByText("Attempt reference", { exact: true }),
      );
      await visible(
        record.locator("dd").getByText("attempt-0000", { exact: true }),
      );
    } finally {
      await page.close();
    }
  });

  it("keeps large arrays expandable without losing retained event evidence", async () => {
    eventDetails.set(
      "attempt-0000",
      JSON.stringify(
        Array.from({ length: 46 }, (_, index) => ({
          result: `check-${index}`,
        })),
      ),
    );
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const detail = page.locator(".admin-structured-value");
      await visible(detail.locator("ol"));
      expect(await detail.locator("ol > li").count()).toBe(40);
      await detail
        .locator("summary")
        .filter({ hasText: "6 more items" })
        .click();
      await visible(detail.locator("pre").getByText(/check-45/u));
      expect(await detail.locator("pre").textContent()).toContain("check-40");
    } finally {
      await page.close();
    }
  });

  it("preserves empty containers and nested event values", async () => {
    eventDetails.set(
      "attempt-0000",
      JSON.stringify({
        emptyList: [],
        emptyObject: {},
        nested: { a: { b: { result: "retained-value" } } },
      }),
    );
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const detail = page.locator(".admin-structured-value");
      await visible(detail.getByText("No items", { exact: true }));
      await visible(detail.getByText("No fields", { exact: true }));
      await visible(detail.getByText("retained-value", { exact: true }));
    } finally {
      await page.close();
    }
  });

  it("keeps pathological JSON as original evidence without expanding or breaking the panel", async () => {
    const source = "[".repeat(3990) + "0" + "]".repeat(3990);
    eventDetails.set("attempt-0000", source);
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const evidence = page.locator(".admin-structured-value pre");
      await visible(evidence);
      expect(await evidence.textContent()).toBe(source);
      expect(
        await evidence.evaluate((element) => element.outerHTML.length),
      ).toBeLessThan(source.length + 1000);
      await page.getByRole("button", { name: "Close preview" }).click();
      await page.locator("#attempt-inspector").waitFor({ state: "detached" });
    } finally {
      await page.close();
    }
  });

  it("puts labeled run outcomes and metrics above the screenshot in a single scrolling panel", async () => {
    const { page } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const metrics = page.locator("[data-attempt-metrics]");
      await visible(metrics);
      expect(await metrics.getByText("Elapsed", { exact: true }).count()).toBe(
        1,
      );
      expect(await metrics.textContent()).toContain("2 minutes");
      expect(await metrics.textContent()).toContain("$0.00");
      expect(await metrics.textContent()).toContain("Not reported");
      const body = page.locator("#attempt-inspector .admin-sheet__body");
      expect(
        await body.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      const metricBox = await metrics.boundingBox();
      expect(metricBox!.y + metricBox!.height).toBeLessThan(500);
      const outcome = page.locator("[data-attempt-outcomes]");
      expect(await outcome.textContent()).toContain("ExecutionSucceeded");
      expect(await outcome.textContent()).toContain("DeliveryPublished");
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const closeBox = await page
        .getByRole("button", { name: "Close preview" })
        .boundingBox();
      expect(closeBox!.y).toBeGreaterThanOrEqual(0);
      expect(closeBox!.y).toBeLessThan(150);
    } finally {
      await page.close();
    }
  });

  it("shows server history totals without deriving a success rate from the loaded client page", async () => {
    const page = await browser.newPage();
    try {
      await page.route("**/workspace/attempts?**", (route) =>
        route.fulfill({
          json: {
            items: [
              ATTEMPTS.find(
                (attempt) => attempt.attemptId === "attempt-diagnostic",
              ),
            ],
            total: 7,
            nextCursor: "offset:1",
          },
        }),
      );
      await page.goto(
        `${origin}/admin/onboarding-invites?view=clients&client=submission:client-a`,
      );
      const metrics = page.locator("[data-client-metrics]");
      await visible(metrics);
      await expect.poll(() => metrics.textContent()).toContain("Attempts7");
      expect(await metrics.textContent()).not.toContain("%");
      expect(await metrics.textContent()).toContain("Available");
      await visible(page.getByText("1 of 7 attempts", { exact: true }));
    } finally {
      await page.close();
    }
  });

  it("keeps malformed and very long event details readable at 390px", async () => {
    eventDetails.set(
      "attempt-0000",
      '{"invalid_json":' + "long-value".repeat(150),
    );
    const { page } = await openPage({
      viewport: { width: 390, height: 844 },
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const detail = page.locator("#attempt-inspector .admin-timeline__detail");
      await visible(detail);
      expect(await detail.textContent()).toContain(
        '{"invalid_json":long-value',
      );
      const panel = page.locator("#attempt-inspector");
      await expect
        .poll(() =>
          panel.evaluate((element) =>
            Math.abs(element.getBoundingClientRect().right - window.innerWidth),
          ),
        )
        .toBeLessThanOrEqual(1);
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        await panel
          .locator(".admin-sheet__body")
          .evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(await page.locator(".admin-detail-panel").count()).toBe(1);
    } finally {
      await page.close();
    }
  });

  it("shows the authenticated admin in the sidebar without duplicate workspace copy", async () => {
    const { page } = await openPage();
    try {
      const account = page.locator(".admin-sidebar__account");
      await visible(account.getByText("Browser Admin", { exact: true }));
      expect(await account.textContent()).toContain("admin@example.test");
      expect(await account.textContent()).toContain("Admin");
      expect(await account.locator(".admin-avatar").textContent()).toBe("BA");
      expect(await page.locator(".admin-workspace-label").count()).toBe(0);
      await account.click();
      await visible(page.locator("#profile-view"));
    } finally {
      await page.close();
    }
  });

  it("uses verified email when a display name is missing and never invents an account", async () => {
    const page = await browser.newPage();
    try {
      await page.route("**/workspace/me", (route) =>
        route.fulfill({
          json: { principal: { ...adminPrincipal, displayName: null } },
        }),
      );
      await page.goto(`${origin}/admin/onboarding-invites`);
      const account = page.locator(".admin-sidebar__account");
      await visible(
        account.getByText("admin@example.test", { exact: true }).first(),
      );
      expect(await account.textContent()).not.toContain("Workspace account");
      expect(await account.locator("strong").textContent()).toBe(
        "admin@example.test",
      );
    } finally {
      await page.close();
    }
  });

  it("keeps account loading and failure distinct from an authenticated identity", async () => {
    const page = await browser.newPage();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await page.route("**/workspace/me", async (route) => {
        await gate;
        await route.fulfill({
          status: 503,
          json: { error: { code: "unavailable", message: "Unavailable" } },
        });
      });
      await page.goto(`${origin}/admin/onboarding-invites`);
      await visible(
        page.locator(".admin-sidebar__account [aria-label='Loading account']"),
      );
      release();
      await visible(
        page
          .locator(".admin-sidebar__account")
          .getByText("Account unavailable", { exact: true }),
      );
      expect(
        await page.locator(".admin-sidebar__account").textContent(),
      ).not.toContain("Browser Admin");
    } finally {
      release();
      await page.close();
    }
  });

  it("renders server counts, applies every filter and sends them to the server", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      expect(await page.locator("#generations-view tbody tr").count()).toBe(50);

      await page.getByLabel("Search attempts").fill("Acme");
      await page.getByLabel("Execution status").selectOption("failed");
      await page.getByLabel("Generation profile").selectOption("full");
      await page.getByLabel("Initiator ID").fill("admin:initiator");
      await page.getByLabel("Link creator ID").fill("admin:creator");
      await page.getByLabel("From date").fill("2026-10-01");
      await page.getByLabel("To date").fill("2026-10-19");
      await page.getByLabel("Rows per page").selectOption("100");
      await page.getByRole("button", { name: "Apply filters" }).click();

      await expect
        .poll(() => lastRequest("/attempts")?.params)
        .toMatchObject({
          search: "Acme",
          executionStatus: "failed",
          profile: "full",
          initiatorId: "admin:initiator",
          creatorId: "admin:creator",
          from: String(Date.UTC(2026, 9, 1)),
          to: String(Date.UTC(2026, 9, 20) - 1),
          limit: "100",
        });
      expect(page.url()).toContain("view=generations");
      expect(page.url()).toContain("search=Acme");
      expect(page.url()).toContain("status=failed");
      expect(page.url()).toContain("initiator=admin%3Ainitiator");
      expect(page.url()).toContain("creator=admin%3Acreator");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("paginates more than 251 attempts to the last page using opaque cursors", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      await page.getByLabel("Rows per page").selectOption("100");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.limit)
        .toBe("100");
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);

      await page.getByRole("button", { name: "Next page" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:100");
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);

      await page.getByRole("button", { name: "Next page" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:200");
      await visible(
        page.getByText(
          `Showing ${ATTEMPTS.length - 200} of ${ATTEMPTS.length} attempts`,
        ),
      );
      expect(
        await page.getByRole("button", { name: "Next page" }).isDisabled(),
      ).toBe(true);
      expect(await page.locator("#generations-view tbody tr").count()).toBe(
        ATTEMPTS.length - 200,
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("loads an off-page attempt and client directly from their IDs", async () => {
    const offPageAttempt = ATTEMPTS.find(
      (attempt) => attempt.attemptId === "attempt-0270",
    )!;
    expect(offPageAttempt).toBeTruthy();
    const first = await openPage({
      path: `/admin/onboarding-invites?view=generations&attempt=${offPageAttempt.attemptId}`,
    });
    try {
      await visible(
        first.page.getByRole("heading", {
          name: `Attempt ${offPageAttempt.attemptId}`,
        }),
      );
      await expect
        .poll(() => lastRequest(`/attempts/${offPageAttempt.attemptId}`))
        .toBeTruthy();
      expect(
        await first.page
          .getByRole("button", {
            name: new RegExp(`Open attempt ${offPageAttempt.attemptId}`, "u"),
          })
          .count(),
      ).toBe(0);
      autoErrors(first.errors);
    } finally {
      await first.page.close();
    }

    const second = await openPage({
      path: "/admin/onboarding-invites?view=clients&client=submission:client-150",
    });
    try {
      await visible(
        second.page.getByRole("heading", {
          name: /Client dossier: Business 150/u,
        }),
      );
      await expect
        .poll(() => lastRequest("/clients/submission:client-150"))
        .toBeTruthy();
      autoErrors(second.errors);
    } finally {
      await second.page.close();
    }
  });

  it("never lets a slow client detail replace a newer selection", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      delays.set("submission:client-a", 700);
      await page
        .getByRole("button", { name: /Open client submission:client-a/u })
        .click();
      await expect
        .poll(() =>
          requests.some(
            (entry) => entry.path === "/clients/submission:client-a",
          ),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Close client dossier" }).click();
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      await page
        .getByRole("button", { name: /Open client submission:client-b/u })
        .click();
      const heading = page.getByRole("heading", {
        name: "Client dossier: Acme & Sons Studio",
      });
      await visible(heading);
      await page.waitForTimeout(1_000);
      await visible(heading);
      await expect
        .poll(() =>
          page
            .locator("#client-inspector")
            .getByText("Acme & Sons", { exact: true })
            .count(),
        )
        .toBe(0);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("opens the client dossier as a modal sheet and restores focus on escape", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      const trigger = page.getByRole("button", {
        name: /Open client submission:client-a/u,
      });
      await trigger.click();
      const dossier = page.getByRole("dialog", {
        name: /Client dossier: Acme & Sons/u,
      });
      await visible(dossier);
      await expect
        .poll(() =>
          dossier.evaluate((element) =>
            Math.abs(element.getBoundingClientRect().right - window.innerWidth),
          ),
        )
        .toBeLessThanOrEqual(1);
      expect(
        await dossier.evaluate((element) => element.matches(":modal")),
      ).toBe(true);
      const dossierBox = await dossier.boundingBox();
      const viewport = page.viewportSize();
      expect(dossierBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(dossierBox!.x).toBeGreaterThanOrEqual(0);
      expect(
        Math.abs(dossierBox!.x + dossierBox!.width - viewport!.width),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(dossierBox!.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(dossierBox!.height - viewport!.height),
      ).toBeLessThanOrEqual(1);
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .toBe("hidden");
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .not.toBe("hidden");
      await focused(trigger);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps client search compact and opens advanced filters on demand", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      expect(await page.getByLabel("From date").count()).toBe(0);
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await visible(page.getByLabel("From date"));
      await page.getByLabel("From date").fill("2026-09-01");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect
        .poll(() => lastRequest("/clients")?.params.from)
        .toBeTruthy();
      expect(page.url()).toContain("from=");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("restores filters through browser back and forward", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const search = page.getByLabel("Search attempts");
      await search.fill("Zoë");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.search)
        .toBe("Zoë");
      expect(page.url()).toContain("search=Zo%C3%AB");

      await page.goBack();
      await expect
        .poll(() => lastRequest("/attempts")?.params.search)
        .toBe(undefined);
      await expect.poll(() => search.inputValue()).toBe("");

      await page.goForward();
      await expect
        .poll(() => lastRequest("/attempts")?.params.search)
        .toBe("Zoë");
      await expect.poll(() => search.inputValue()).toBe("Zoë");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows unknown actors, costs, failure cause and safe text without executing HTML", async () => {
    const first = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-unknown",
    });
    try {
      const inspector = first.page.locator("#attempt-inspector");
      await visible(
        inspector.getByRole("heading", { name: "Attempt attempt-unknown" }),
      );
      await visible(inspector.getByText("Zoë & Sons, Gardeners").first());
      expect(
        await inspector.getByText("Not recorded", { exact: true }).count(),
      ).toBeGreaterThanOrEqual(2);
      expect(
        await inspector.getByText("Not reported", { exact: true }).count(),
      ).toBeGreaterThanOrEqual(2);
      await visible(inspector.getByText("Cause not recorded."));
      autoErrors(first.errors);
    } finally {
      await first.page.close();
    }

    const second = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-unsafe",
    });
    try {
      const inspector = second.page.locator("#attempt-inspector");
      await visible(
        inspector.getByRole("heading", { name: "Attempt attempt-unsafe" }),
      );
      await visible(inspector.getByText(/build failed & review needed/u));
      expect(await inspector.locator("img[src^='data:']").count()).toBe(0);
      expect(
        await second.page.evaluate(
          () => (window as unknown as { __adminFxss?: number }).__adminFxss,
        ),
      ).toBeUndefined();
      expect(
        await inspector.getByRole("link", { name: /run evidence/u }).count(),
      ).toBe(0);
      autoErrors(second.errors);
    } finally {
      await second.page.close();
    }
  });

  it("connects legacy research stages and a terminal workflow failure in order", async () => {
    legacyWorkflow = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      const inspector = page.locator("#attempt-inspector");
      await inspector
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = inspector.getByRole("region", { name: "Workflow run" });
      const graph = workflow.getByRole("list", {
        name: "Workflow stage graph",
      });
      await visible(graph);
      for (const label of [
        "Intake: Passed",
        "SEO research: Passed",
        "References: Passed",
        "Reference analysis: Passed",
        "Run failure: Failed",
      ])
        await visible(graph.getByRole("button", { name: label }));
      expect(
        await workflow.locator(".flow-edge").count(),
      ).toBeGreaterThanOrEqual(4);
      await visible(
        workflow.getByText("The workflow stopped before a preview was ready."),
      );
      expect(
        await workflow
          .getByText("The workflow stopped before a preview was ready.")
          .count(),
      ).toBe(1);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it.each([390, 1440])(
    "lays out workflow stages downward and follows recent nodes at %ipx",
    async (width) => {
      workflowOverride = progressiveWorkflow("preview_deploy", "failed");
      const { page, errors } = await openPage({
        viewport: { width, height: 960 },
        path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
      });
      try {
        await page
          .getByRole("button", { name: "View workflow", exact: true })
          .click();
        const workflow = page.locator("[data-workflow-view]");
        const canvas = workflow.locator("[data-flow-canvas]");
        await visible(canvas);
        const positions = await workflow
          .locator(".flow-node")
          .evaluateAll((nodes) =>
            Object.fromEntries(
              nodes.map((node) => [
                node.getAttribute("data-stage"),
                node.getBoundingClientRect().top,
              ]),
            ),
          );
        for (const [before, after] of [
          ["renderer_policy", "setup"],
          ["intake_handoff_check", "setup"],
          ["intake", "seo_research"],
          ["seo_telemetry", "inspiration_selection"],
          ["reference_analysis", "client_repo"],
          ["imagery", "authoring"],
          ["creative_render", "preview_deploy"],
        ])
          expect(positions[after]).toBeGreaterThan(positions[before] + 68);
        expect(
          await canvas.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(
          await canvas.evaluate((el) => el.scrollHeight > el.clientHeight),
        ).toBe(true);
        const isLatestVisible = () =>
          canvas.evaluate((el) => {
            const last = el.querySelector(".flow-nodes > li:last-child")!;
            const frame = el.getBoundingClientRect();
            const node = last.getBoundingClientRect();
            return node.top >= frame.top && node.bottom <= frame.bottom;
          });
        await expect.poll(isLatestVisible).toBe(true);
        const follow = workflow.getByRole("button", {
          name: "Follow latest",
          exact: true,
        });
        expect(await follow.getAttribute("aria-pressed")).toBe("true");
        const edgesGoDown = await workflow
          .locator(".flow-edge")
          .evaluateAll((paths) =>
            paths.every((path) => {
              const edge = path as SVGPathElement;
              return (
                edge.getPointAtLength(edge.getTotalLength()).y >
                edge.getPointAtLength(0).y
              );
            }),
          );
        expect(edgesGoDown).toBe(true);
        const crossedStages = await workflow
          .locator(".flow-content")
          .evaluate((content) => {
            const origin = content.getBoundingClientRect();
            const boxes = [
              ...content.querySelectorAll<HTMLElement>(".flow-node"),
            ].map((node) => {
              const bounds = node.getBoundingClientRect();
              return {
                stage: node.dataset.stage,
                left: bounds.left - origin.left,
                right: bounds.right - origin.left,
                top: bounds.top - origin.top,
                bottom: bounds.bottom - origin.top,
              };
            });
            return [
              ...content.querySelectorAll<SVGPathElement>(".flow-edge"),
            ].flatMap((edge) => {
              for (
                let distance = 4;
                distance < edge.getTotalLength() - 4;
                distance += 4
              ) {
                const point = edge.getPointAtLength(distance);
                const crossed = boxes.find(
                  (box) =>
                    point.x > box.left + 1 &&
                    point.x < box.right - 1 &&
                    point.y > box.top + 1 &&
                    point.y < box.bottom - 1,
                );
                if (crossed) return [crossed.stage];
              }
              return [];
            });
          });
        expect(crossedStages).toEqual([]);
        await canvas.evaluate((el) => {
          el.scrollTop = 0;
        });
        await expect
          .poll(() => follow.getAttribute("aria-pressed"))
          .toBe("false");
        await workflow
          .getByRole("button", { name: "Run policy: Passed", exact: true })
          .click();
        await visible(
          workflow.getByRole("heading", { name: "Run policy", exact: true }),
        );
        await follow.click();
        await expect.poll(isLatestVisible).toBe(true);
        expect(await follow.getAttribute("aria-pressed")).toBe("true");
        // Following affects only the graph viewport, never keyboard focus.
        await focused(follow);
        await page.setViewportSize({ width, height: 720 });
        await expect.poll(isLatestVisible).toBe(true);
        await page.setViewportSize({ width, height: 960 });
        await expect.poll(isLatestVisible).toBe(true);
        const captures = process.env.CLIENT_WORKFLOW_SCREENSHOTS;
        if (captures) {
          await page.screenshot({
            path: path.join(captures, `vertical-workflow-${width}.png`),
            animations: "disabled",
          });
          await canvas.evaluate((el) => {
            el.scrollTop = 0;
          });
          await expect
            .poll(() => follow.getAttribute("aria-pressed"))
            .toBe("false");
          await page.screenshot({
            path: path.join(captures, `workflow-branches-${width}.png`),
            animations: "disabled",
          });
        }
        autoErrors(errors);
      } finally {
        await page.close();
      }
    },
  );

  it("keeps three renderer choices on one measured desktop row", async () => {
    workflowOverride = progressiveWorkflow("preview_deploy", "failed");
    workflowOverride.events = workflowOverride.events
      .flatMap((event) =>
        event.stage === "authoring"
          ? [
              ...["pack_select", "foundation_select"].map((stage) => ({
                ...event,
                eventKey: `stage:${stage}`,
                stage,
                detail: `Evidence for ${stage}.`,
              })),
              event,
            ]
          : [event],
      )
      .map((event, index) => ({
        ...event,
        createdAt: workflowOverride!.updatedAt + index,
        observedAt: workflowOverride!.updatedAt + index,
      }));
    workflowOverride.eventCount = workflowOverride.events.length;
    const { page, errors } = await openPage({
      viewport: { width: 1440, height: 960 },
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      await page
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = page.locator("[data-workflow-view]");
      await visible(workflow.locator('[data-stage="pack_select"]'));
      const bounds = await workflow.locator(".flow-node").evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return [
              node.getAttribute("data-stage"),
              {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
              },
            ];
          }),
        ),
      );
      expect(
        await workflow
          .locator("[data-flow-canvas]")
          .evaluate((el) => el.clientWidth),
      ).toBeGreaterThan(650);
      expect(
        Math.abs(bounds.pack_select.top - bounds.foundation_select.top),
      ).toBeLessThan(1);
      expect(
        Math.abs(bounds.foundation_select.top - bounds.authoring.top),
      ).toBeLessThan(1);
      expect(bounds.pack_select.right).toBeLessThan(
        bounds.foundation_select.left,
      );
      expect(bounds.foundation_select.right).toBeLessThan(
        bounds.authoring.left,
      );
      expect(bounds.authored_evidence.top).toBeGreaterThan(
        bounds.authoring.bottom,
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it.each(["sites", "clients"])(
    "updates the %s workflow live without losing inspected evidence",
    async (surface) => {
      const attemptId =
        surface === "sites" ? "attempt-0000" : "attempt-diagnostic";
      workflowOverride = progressiveWorkflow("authoring", "started", attemptId);
      const { page, errors } = await openPage({
        clock: true,
        path:
          surface === "sites"
            ? "/admin/onboarding-invites?view=generations&attempt=attempt-0000"
            : "/admin/onboarding-invites?view=clients&client=submission:client-a",
      });
      try {
        if (surface === "sites")
          await page
            .getByRole("button", { name: "View workflow", exact: true })
            .click();
        const workflow = page.locator("[data-workflow-view]");
        await visible(
          workflow.getByRole("button", {
            name: "Authoring: Running",
            exact: true,
          }),
        );
        workflowOverride = progressiveWorkflow(
          "creative_render",
          "started",
          attemptId,
        );
        await page.clock.runFor(2_100);
        await visible(
          workflow.getByRole("button", {
            name: "Authoring: Passed",
            exact: true,
          }),
        );
        await visible(
          workflow.getByRole("button", {
            name: "Creative render: Running",
            exact: true,
          }),
        );
        const canvas = workflow.locator("[data-flow-canvas]");
        await canvas.evaluate((el) => {
          el.scrollTop = 0;
        });
        await workflow
          .getByRole("button", { name: "Run policy: Passed", exact: true })
          .click();
        await visible(
          workflow.getByRole("heading", { name: "Run policy", exact: true }),
        );
        const position = await canvas.evaluate((el) => el.scrollTop);
        workflowOverride = progressiveWorkflow(
          "preview_deploy",
          "failed",
          attemptId,
        );
        await page.clock.runFor(2_100);
        await visible(
          workflow.getByRole("button", {
            name: "Preview deploy: Failed",
            exact: true,
          }),
        );
        await visible(
          workflow.getByRole("heading", { name: "Run policy", exact: true }),
        );
        expect(await canvas.evaluate((el) => el.scrollTop)).toBe(position);
        await workflow
          .getByRole("button", { name: "Follow latest", exact: true })
          .click();
        await workflow
          .getByRole("button", { name: "Preview deploy: Failed", exact: true })
          .click();
        await visible(
          workflow.getByText("The upload failed after rendering.", {
            exact: true,
          }),
        );
        expect(
          await workflow
            .getByRole("link", { name: "View run on GitHub" })
            .getAttribute("href"),
        ).toContain(`/actions/runs/${workflowOverride.runId}/attempts/1`);
        // Later reconciliation can enrich the same terminal snapshot/version.
        workflowOverride.failure.code = "LL_STAGE_PREVIEW_DEPLOY_FAILED";
        workflowOverride.failure.detail =
          "Upload rejected: missing project binding.";
        await page.clock.runFor(15_100);
        await visible(
          workflow.getByText("Upload rejected: missing project binding.", {
            exact: true,
          }),
        );
        await visible(
          workflow.getByText("LL_STAGE_PREVIEW_DEPLOY_FAILED", { exact: true }),
        );
        const captures = process.env.CLIENT_WORKFLOW_SCREENSHOTS;
        if (captures && surface === "sites") {
          await workflow.locator(".flow-focus").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(captures, "workflow-error-inspection.png"),
            animations: "disabled",
          });
        }
        autoErrors(errors);
      } finally {
        await page.close();
      }
    },
  );

  it("keeps the inspected workflow node anchored when earlier stages arrive", async () => {
    workflowOverride = progressiveWorkflow("authoring", "started");
    workflowOverride.events = workflowOverride.events.filter(
      (event) => event.stage !== "setup",
    );
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      await page
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = page.locator("[data-workflow-view]");
      const inspected = workflow.locator('[data-stage="client_repo"]');
      await inspected.click();
      const offset = () =>
        inspected.evaluate(
          (node) =>
            node.getBoundingClientRect().top -
            node.closest("[data-flow-canvas]")!.getBoundingClientRect().top,
        );
      const before = await offset();
      expect(
        await workflow
          .getByRole("button", { name: "Follow latest", exact: true })
          .getAttribute("aria-pressed"),
      ).toBe("false");
      workflowOverride = progressiveWorkflow("authoring", "started");
      await page.clock.runFor(2_100);
      await expect
        .poll(() => workflow.locator('[data-stage="setup"]').count())
        .toBe(1);
      await expect
        .poll(async () => Math.abs((await offset()) - before))
        .toBeLessThan(1);
      expect(await inspected.getAttribute("aria-pressed")).toBe("true");
      await visible(
        workflow.getByText("Evidence for client_repo.", { exact: true }),
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("clears a stale parent detail error when Workflow owns refresh", async () => {
    workflowOverride = progressiveWorkflow("authoring", "started");
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      const openWorkflow = page.getByRole("button", {
        name: "View workflow",
        exact: true,
      });
      await visible(openWorkflow);
      await page.route("**/workspace/attempts/attempt-0000", (route) =>
        route.fulfill({
          status: 503,
          json: {
            error: {
              code: "temporarily_unavailable",
              message: "Overview refresh temporarily failed.",
            },
          },
        }),
      );
      await page.clock.runFor(15_100);
      await visible(
        page.getByRole("button", { name: "Retry attempt detail", exact: true }),
      );
      await page.unroute("**/workspace/attempts/attempt-0000");
      await openWorkflow.click();
      await expect
        .poll(() =>
          page
            .getByRole("button", { name: "Retry attempt detail", exact: true })
            .count(),
        )
        .toBe(0);
      workflowOverride = progressiveWorkflow("creative_render", "started");
      await page.clock.runFor(2_100);
      await visible(
        page.locator("[data-workflow-view]").getByRole("button", {
          name: "Creative render: Running",
          exact: true,
        }),
      );
      autoErrors(errors, { allowResource503: true });
    } finally {
      await page.close();
    }
  });

  it("shows new terminal evidence instead of an older start message", async () => {
    workflowOverride = progressiveWorkflow("authoring", "started");
    const start = workflowOverride.events.at(-1)!;
    start.eventKey = "authoring-start";
    start.detail = "Authoring started; waiting for result.";
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      await page
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = page.locator("[data-workflow-view]");
      await workflow
        .getByRole("button", { name: "Authoring: Running", exact: true })
        .click();
      await visible(workflow.getByText(start.detail, { exact: true }));
      const terminal = {
        ...start,
        eventKey: "authoring-done",
        status: "completed",
        detail: "All three candidates were written.",
        createdAt: start.createdAt + 1,
        observedAt: start.observedAt + 1,
      };
      workflowOverride.events = [terminal];
      await page.clock.runFor(2_100);
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Passed",
          exact: true,
        }),
      );
      await visible(workflow.getByText(terminal.detail, { exact: true }));
      // Early stages remain available after they leave the newest events page.
      expect(
        await workflow
          .getByRole("button", { name: "Run policy: Passed", exact: true })
          .count(),
      ).toBe(1);
      workflowOverride.executionStatus = "failed";
      workflowOverride.failure = {
        category: null,
        stage: "authoring",
        summary: null,
        evidenceUrl: null,
        nextStep: null,
      };
      workflowOverride.events = [
        {
          ...terminal,
          eventKey: "authoring-failed",
          status: "failed",
          detail: "Renderer exited 137.",
          observedAt: terminal.observedAt + 1,
          createdAt: terminal.createdAt + 1,
        },
      ];
      await page.clock.runFor(2_100);
      await visible(
        workflow.getByText("Renderer exited 137.", { exact: true }),
      );
      workflowOverride.workflowEvents = [
        {
          ...terminal,
          eventKey: "github-step:authoring",
          source: "github-reconcile",
          status: "failed",
          detail: JSON.stringify({
            errorCode: "LL_STAGE_AUTHORING_FAILED",
            diagnosticExcerpt: "Authoring runner exited with code 1.",
          }),
        },
      ];
      await page.clock.runFor(15_100);
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Failed",
          exact: true,
        }),
      );
      await visible(
        workflow.getByText("LL_STAGE_AUTHORING_FAILED", { exact: true }),
      );
      await visible(
        workflow.getByText("Authoring runner exited with code 1.", {
          exact: true,
        }),
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("retains workflow history and selection through refresh failures and stale history pages", async () => {
    workflowOverride = progressiveWorkflow("authoring", "started");
    workflowOverride.eventsNextCursor = "history-page";
    const stale = { ...workflowOverride.events.at(-1)! };
    const earlier = {
      ...stale,
      eventKey: "preflight-evidence",
      stage: "preflight",
      status: "completed",
      detail: "Retained earlier diagnostic.",
      createdAt: stale.createdAt - 100,
      observedAt: stale.observedAt - 100,
    };
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      const historyPages = new Map([
        [
          "history-page",
          { items: [earlier, stale], nextCursor: null, total: 2 },
        ],
      ]);
      const historyRequests: string[] = [];
      await page.route(
        "**/workspace/attempts/attempt-0000/events?**",
        (route) => {
          const cursor =
            new URL(route.request().url()).searchParams.get("cursor") ?? "";
          historyRequests.push(cursor);
          const historyPage = historyPages.get(cursor);
          return route.fulfill(
            historyPage
              ? { json: historyPage }
              : {
                  status: 400,
                  json: {
                    error: {
                      code: "unexpected_cursor",
                      message: `Unexpected history cursor: ${cursor}`,
                    },
                  },
                },
          );
        },
      );
      await page
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = page.locator("[data-workflow-view]");
      await workflow
        .getByRole("button", { name: "Load earlier stage events", exact: true })
        .click();
      await workflow.locator('[data-stage="preflight"]').click();
      await visible(workflow.getByText(earlier.detail, { exact: true }));
      let fail = true;
      await page.route("**/workspace/attempts/attempt-0000", (route) =>
        fail
          ? route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "temporarily_unavailable",
                  message: "Temporary workflow read failure.",
                },
              },
            })
          : route.fallback(),
      );
      await page.clock.runFor(2_100);
      await visible(workflow.getByText(/Live updates interrupted/u));
      await visible(workflow.getByText(earlier.detail, { exact: true }));
      fail = false;
      workflowOverride = progressiveWorkflow("creative_render", "started");
      await page.clock.runFor(2_100);
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Passed",
          exact: true,
        }),
      );
      await visible(workflow.getByText(earlier.detail, { exact: true }));
      expect(
        await workflow.getByText(/Live updates interrupted/u).count(),
      ).toBe(0);
      await workflow
        .getByRole("button", { name: "Refresh workflow", exact: true })
        .click();
      await expect
        .poll(() =>
          workflow
            .getByRole("button", { name: "Refresh workflow", exact: true })
            .isEnabled(),
        )
        .toBe(true);
      await visible(workflow.getByText(earlier.detail, { exact: true }));
      // More than a page can arrive between polls, including while a tab is hidden.
      // Exhausting an earlier traversal must not make that gap unreachable.
      historyPages.set("missed-page", {
        items: [
          {
            ...earlier,
            eventKey: "missed-repair",
            stage: "repair",
            detail: "Missed repair diagnostic.",
          },
        ],
        nextCursor: null,
        total: 1,
      });
      workflowOverride.events = Array.from({ length: 50 }, (_, index) => ({
        ...stale,
        eventKey: `cost:new:${index}`,
        observedAt: stale.observedAt + 100 + index,
        createdAt: stale.createdAt + 100 + index,
      }));
      workflowOverride.eventsNextCursor = "missed-page";
      await page.clock.runFor(2_100);
      await workflow
        .getByRole("button", { name: "Load earlier stage events", exact: true })
        .click();
      await workflow.locator('[data-stage="repair"]').click();
      await visible(
        workflow.getByText("Missed repair diagnostic.", { exact: true }),
      );
      expect(historyRequests).toEqual(["history-page", "missed-page"]);
      autoErrors(errors.filter((error) => !error.includes("503")));
    } finally {
      await page.close();
    }
  });

  it("aborts a stalled workflow read, retains evidence and resumes live polling", async () => {
    workflowOverride = progressiveWorkflow(
      "authoring",
      "started",
      "attempt-diagnostic",
    );
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=clients&client=submission:client-a",
    });
    try {
      const workflow = page.locator("[data-workflow-view]");
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Running",
          exact: true,
        }),
      );
      const held: Route[] = [];
      await page.route("**/workspace/attempts/attempt-diagnostic", (route) => {
        held.push(route);
      });
      await page.clock.runFor(2_100);
      await expect.poll(() => held.length).toBe(1);
      const aborted = page.waitForEvent("requestfailed", {
        predicate: (request) => request === held[0].request(),
        timeout: 5_000,
      });
      await page.clock.runFor(10_100);
      expect((await aborted).failure()?.errorText).toBe("net::ERR_ABORTED");
      await visible(
        workflow.getByText("The workflow request timed out.", { exact: true }),
      );
      await visible(workflow.getByText(/Live updates interrupted/u));
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Running",
          exact: true,
        }),
      );
      expect(
        await workflow
          .getByRole("button", { name: "Retry workflow run", exact: true })
          .isEnabled(),
      ).toBe(true);
      expect(held).toHaveLength(1);
      await page.unroute("**/workspace/attempts/attempt-diagnostic");
      workflowOverride = progressiveWorkflow(
        "creative_render",
        "started",
        "attempt-diagnostic",
      );
      await page.clock.runFor(2_100);
      await visible(
        workflow.getByRole("button", {
          name: "Creative render: Running",
          exact: true,
        }),
      );
      expect(
        await workflow.getByText(/Live updates interrupted/u).count(),
      ).toBe(0);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("pauses hidden workflow reads, avoids overlapping polls and isolates a changed run", async () => {
    workflowOverride = progressiveWorkflow(
      "authoring",
      "started",
      "attempt-diagnostic",
    );
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=clients&client=submission:client-a",
    });
    try {
      const workflow = page.locator("[data-workflow-view]");
      await visible(
        workflow.getByRole("button", {
          name: "Authoring: Running",
          exact: true,
        }),
      );
      const countReads = () =>
        requests.filter(
          (request) => request.path === "/attempts/attempt-diagnostic",
        ).length;
      const initialReads = countReads();
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.clock.runFor(6_100);
      expect(countReads()).toBe(initialReads);
      workflowOverride = progressiveWorkflow(
        "creative_render",
        "started",
        "attempt-diagnostic",
      );
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await visible(
        workflow.getByRole("button", {
          name: "Creative render: Running",
          exact: true,
        }),
      );
      const held: Route[] = [];
      await page.route("**/workspace/attempts/attempt-diagnostic", (route) => {
        held.push(route);
      });
      await page.clock.runFor(2_100);
      await expect.poll(() => held.length).toBe(1);
      await page.clock.runFor(6_100);
      expect(held).toHaveLength(1);
      const aborted = page.waitForEvent("requestfailed", {
        predicate: (request) => request === held[0].request(),
        timeout: 5_000,
      });
      await page
        .getByRole("button", {
          name: "Open attempt attempt-published-earlier from client history",
          exact: true,
        })
        .click();
      expect((await aborted).failure()?.errorText).toBe("net::ERR_ABORTED");
      await visible(
        workflow.getByRole("heading", {
          name: "All recorded stages passed",
          exact: true,
        }),
      );
      await page.clock.runFor(100);
      expect(
        await workflow.locator('[data-stage="preview_deploy"]').count(),
      ).toBe(0);
      expect(
        await workflow
          .getByRole("link", { name: "View run on GitHub" })
          .getAttribute("href"),
      ).toContain(
        `/actions/runs/${ATTEMPTS.find((attempt) => attempt.attemptId === "attempt-published-earlier")!.runId}/`,
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("uses one selected-attempt reader in Sites and refreshes Overview on return", async () => {
    workflowOverride = progressiveWorkflow("authoring", "started");
    const { page, errors } = await openPage({
      clock: true,
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      await page
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const held: Route[] = [];
      await page.route("**/workspace/attempts/attempt-0000", (route) => {
        held.push(route);
      });
      await page.clock.runFor(2_100);
      await expect.poll(() => held.length).toBe(1);
      const beforeList = requests.filter(
        (request) => request.path === "/attempts",
      ).length;
      await page.clock.runFor(6_100);
      expect(held).toHaveLength(1);
      workflowOverride = progressiveWorkflow("creative_render", "started");
      await held[0].fulfill({ json: { attempt: workflowOverride } });
      await visible(
        page.locator("[data-workflow-view]").getByRole("button", {
          name: "Creative render: Running",
          exact: true,
        }),
      );
      await page.clock.runFor(2_100);
      await expect.poll(() => held.length).toBe(2);
      await page.clock.runFor(6_900);
      await expect
        .poll(
          () =>
            requests.filter((request) => request.path === "/attempts").length,
        )
        .toBeGreaterThan(beforeList);
      expect(held).toHaveLength(2);
      workflowOverride = progressiveWorkflow("preview_deploy", "failed");
      await held[1].fulfill({ json: { attempt: workflowOverride } });
      await page.unroute("**/workspace/attempts/attempt-0000");
      await visible(
        page
          .locator("[data-workflow-view]")
          .getByRole("button", { name: "Preview deploy: Failed", exact: true }),
      );
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await visible(
        page
          .locator('[aria-labelledby="attempt-failure-title"]')
          .getByText("The upload failed after rendering.", { exact: true }),
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("opens the workflow inside Sites instead of sending the admin to GitHub", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
    });
    try {
      const inspector = page.locator("#attempt-inspector");
      await visible(
        inspector.getByRole("heading", { name: "Attempt attempt-diagnostic" }),
      );
      expect(await inspector.locator('a[href*="github.com"]').count()).toBe(0);
      expect(
        await inspector.getByRole("link", { name: /workflow run/iu }).count(),
      ).toBe(0);
      await inspector
        .getByRole("button", { name: "View workflow", exact: true })
        .click();
      const workflow = inspector.getByRole("region", { name: "Workflow run" });
      await visible(
        workflow.getByRole("list", { name: "Workflow stage graph" }),
      );
      await visible(
        workflow.getByRole("button", { name: "Preview deploy: Failed" }),
      );
      expect(page.url()).toContain("view=generations");
      const github = workflow
        .locator("footer")
        .getByRole("link", { name: "View run on GitHub" });
      await visible(github);
      expect(await github.getAttribute("href")).toMatch(/actions\/runs\/\d+/u);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it.each([390, 1440])(
    "summarizes the run in Clients at %ipx and opens the connected graph in the drawer",
    async (width) => {
      const { page, errors } = await openPage({
        viewport: { width, height: 844 },
        path: "/admin/onboarding-invites?view=clients&search=same@example.test",
      });
      try {
        const row = page.locator('[data-client-id="submission:client-a"]');
        await visible(row.getByText("Preview deploy failed", { exact: true }));
        await visible(row.getByText("5 of 7 stages passed", { exact: true }));
        expect(await row.locator("[data-flow-canvas]").count()).toBe(0);
        expect(await row.locator('a[href*="github.com"]').count()).toBe(0);
        expect(await row.getByText(/Issue #|Intake #/u).count()).toBe(0);
        await visible(
          page
            .locator('[data-client-id="submission:client-b"]')
            .getByText("No workflow yet"),
        );
        const captures = process.env.CLIENT_WORKFLOW_SCREENSHOTS;
        if (captures) {
          await page.screenshot({
            path: path.join(captures, `clients-${width}.png`),
            animations: "disabled",
          });
        }
        const trigger = row.getByRole("button", {
          name: /Open client submission:client-a/u,
        });
        await trigger.click();
        const dossier = page.getByRole("dialog", {
          name: "Client dossier: Acme & Sons",
        });
        const workflow = dossier.getByRole("region", { name: "Workflow" });
        await page.waitForTimeout(1200);
        await visible(
          workflow.getByRole("heading", { name: "Preview deploy failed" }),
        );
        const graph = workflow.getByRole("list", {
          name: "Workflow stage graph",
        });
        await visible(graph);
        await visible(
          graph.getByRole("button", { name: "Preview deploy: Failed" }),
        );
        expect(
          await workflow.locator(".flow-edge").count(),
        ).toBeGreaterThanOrEqual(5);
        await visible(
          workflow.getByText("The public preview upload did not complete."),
        );
        await visible(
          workflow
            .locator("code")
            .getByText("LL_STAGE_PREVIEW_DEPLOY_FAILED", { exact: true }),
        );
        await visible(
          workflow.getByText(
            "Build and direct-upload public preview: failure.",
            { exact: true },
          ),
        );
        await visible(workflow.getByText("1 skipped stage", { exact: true }));
        await graph
          .getByRole("button", { name: "Pack choice: Passed" })
          .click();
        await visible(workflow.getByRole("heading", { name: "Pack choice" }));
        const github = workflow
          .locator("footer")
          .getByRole("link", { name: "View run on GitHub" });
        await visible(github);
        expect(await github.getAttribute("href")).toBe(
          "https://github.com/WrazyAI/launchloom/actions/runs/90008/attempts/1",
        );
        if (captures) {
          await page.screenshot({
            path: path.join(captures, `workflow-${width}.png`),
            animations: "disabled",
          });
        }
        expect(
          await dossier.evaluate((el) => el.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
        await focused(trigger);
        autoErrors(errors);
      } finally {
        await page.close();
      }
    },
  );

  it("keeps failed diagnostic execution separate and never demotes a published site", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients&client=submission:client-a",
    });
    try {
      const inspector = page.locator("#client-inspector");
      await visible(
        inspector.getByRole("heading", { name: "Client dossier: Acme & Sons" }),
      );
      expect(
        await inspector
          .getByRole("link", { name: /Published site/u })
          .getAttribute("href"),
      ).toBe("https://acme.pages.dev/");
      const verifiedSite = inspector.getByRole("link", {
        name: /Verified site/u,
      });
      await visible(verifiedSite);
      expect(await verifiedSite.getAttribute("href")).toBe(
        "https://acme-verified.pages.dev/",
      );
      await visible(
        inspector.getByText(/diagnostic delivery is for review only/iu),
      );
      await visible(
        inspector.getByRole("button", {
          name: /Open attempt attempt-diagnostic/u,
        }),
      );
      const history = inspector.locator("[data-client-attempts]");
      await visible(history.getByText("Failed", { exact: true }));
      await visible(history.getByText("Published", { exact: true }));
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows both same-email businesses as separate clients", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients&search=same@example.test",
    });
    try {
      await expect
        .poll(() => lastRequest("/clients")?.params.search)
        .toBe("same@example.test");
      const rows = page.locator("#clients-view tbody tr");
      await expect.poll(() => rows.count()).toBe(2);
      await visible(
        page.getByRole("button", { name: /Open client submission:client-a/u }),
      );
      await visible(
        page.getByRole("button", { name: /Open client submission:client-b/u }),
      );
      await visible(page.getByText("Acme & Sons", { exact: true }));
      await visible(page.getByText("Acme & Sons Studio", { exact: true }));
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("marks a partial client directory as incomplete with real backlog counts", async () => {
    health = fixtureHealth({
      partial: true,
      pendingProjectionCount: 3,
      lastError: "GitHub reconciliation is delayed.",
      lastSyncAt: Date.UTC(2026, 9, 19, 13, 55),
      coverageStart: Date.UTC(2026, 8, 1),
    });
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      await visible(page.getByText(/Client directory may be incomplete/u));
      await visible(page.getByText(/3 records are waiting to project/u));
      await visible(page.getByText(/GitHub reconciliation is delayed\./u));
      await visible(page.getByText(/History coverage starts 01 Sep 2026/u));
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps unknown or invalid submitted dates honest in the dossier", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients&client=submission:client-unknown",
    });
    try {
      const dossier = page.locator("#client-inspector");
      await visible(
        dossier.getByRole("heading", {
          name: "Client dossier: Zoë & Sons, Gardeners",
        }),
      );
      const submitted = dossier.locator("[data-client-submitted]");
      await expect.poll(() => submitted.textContent()).toBe("Not recorded");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it.each([390, 320])(
    "has no body overflow and scrolls the table inside its own region at %ipx",
    async (width) => {
      const { page, errors } = await openPage({
        viewport: { width, height: 844 },
        path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
      });
      try {
        await waitForGenerations(page);
        await openFilters(page);
        const inspector = page.getByRole("dialog", {
          name: "Attempt attempt-diagnostic",
        });
        await visible(inspector);
        await visible(
          inspector.getByRole("heading", {
            name: "Attempt attempt-diagnostic",
          }),
        );
        const metrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);

        await page.keyboard.press("Escape");
        await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
        await page.getByRole("button", { name: "Ledger" }).click();
        const table = await page
          .locator(".admin-table-wrap")
          .first()
          .evaluate((element) => ({
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }));
        expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth + 1);
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.getByRole("link", { name: "Clients", exact: true }).click();
        await waitForClients(page);
        await page
          .getByRole("button", { name: /Open client submission:client-a/u })
          .click();
        await visible(
          page.getByRole("heading", { name: "Client dossier: Acme & Sons" }),
        );
        await page.waitForTimeout(300);
        const dossierBox = await page
          .locator("#client-inspector")
          .boundingBox();
        expect(dossierBox).not.toBeNull();
        expect(dossierBox!.x).toBeGreaterThanOrEqual(0);
        expect(dossierBox!.x + dossierBox!.width).toBeLessThanOrEqual(
          width + 1,
        );
        expect(Math.abs(dossierBox!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(dossierBox!.height - 844)).toBeLessThanOrEqual(1);
        const afterMetrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(afterMetrics.documentWidth).toBeLessThanOrEqual(
          afterMetrics.viewport,
        );
        expect(afterMetrics.bodyWidth).toBeLessThanOrEqual(
          afterMetrics.viewport,
        );
        autoErrors(errors);
      } finally {
        await page.close();
      }
    },
    60_000,
  );

  it.each([390, 320])(
    "opens attempt details in a modal sheet at %ipx and returns focus to the row",
    async (width) => {
      const { page, errors } = await openPage({
        viewport: { width, height: 844 },
      });
      try {
        await waitForGenerations(page);
        await openFilters(page);
        const row = page.getByRole("button", {
          name: /Open attempt attempt-0000/u,
        });
        await row.scrollIntoViewIfNeeded();
        await row.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: "Attempt attempt-0000",
        });
        await visible(dialog);
        await dialog
          .locator("summary")
          .filter({ hasText: "Record details" })
          .click();
        await visible(dialog.getByText("Attempt summary"));
        await visible(dialog.getByText("Stage timeline"));

        await expect
          .poll(() =>
            dialog.evaluate((element) =>
              Math.abs(
                element.getBoundingClientRect().right - window.innerWidth,
              ),
            ),
          )
          .toBeLessThanOrEqual(1);
        const sheet = await dialog.boundingBox();
        expect(sheet).not.toBeNull();
        expect(sheet!.y).toBeGreaterThanOrEqual(0);
        expect(sheet!.y).toBeLessThan(844);
        expect(sheet!.height).toBeLessThanOrEqual(844);
        expect(sheet!.width).toBeLessThanOrEqual(width);
        expect(sheet!.x).toBeGreaterThanOrEqual(0);
        expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(width + 1);
        expect(Math.abs(sheet!.x + sheet!.width - width)).toBeLessThanOrEqual(
          1,
        );
        expect(Math.abs(sheet!.height - 844)).toBeLessThanOrEqual(1);
        const innerSheet = await dialog
          .locator(".admin-sheet__body")
          .boundingBox();
        expect(innerSheet).not.toBeNull();
        expect(innerSheet!.y).toBeGreaterThan(0);
        expect(
          Math.abs(innerSheet!.y + innerSheet!.height - 844),
        ).toBeLessThanOrEqual(1);
        const heading = dialog.getByRole("heading", {
          name: "Attempt attempt-0000",
        });
        await visible(heading);
        expect(page.url()).toContain("attempt=attempt-0000");

        const openMetrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(openMetrics.documentWidth).toBeLessThanOrEqual(
          openMetrics.viewport,
        );
        expect(openMetrics.bodyWidth).toBeLessThanOrEqual(openMetrics.viewport);

        await page.keyboard.press("Shift+Tab");
        await expect
          .poll(() =>
            page.evaluate(() => {
              const open = document.querySelector("dialog[open]");
              return Boolean(open && open.contains(document.activeElement));
            }),
          )
          .toBe(true);

        for (let step = 0; step < 12; step += 1) {
          await page.keyboard.press("Tab");
          await expect
            .poll(() =>
              page.evaluate(() => {
                const open = document.querySelector("dialog[open]");
                return Boolean(open && open.contains(document.activeElement));
              }),
            )
            .toBe(true);
        }

        await page.keyboard.press("Escape");
        await expect.poll(() => dialog.count()).toBe(0);
        await focused(row);
        expect(page.url()).not.toContain("attempt=");
        autoErrors(errors);
      } finally {
        await page.close();
      }
    },
    60_000,
  );

  it("opens a deep-linked attempt as a modal sheet and closes on the backdrop", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 1200, height: 844 },
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
    });
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-diagnostic",
      });
      await visible(dialog);
      await visible(
        dialog.getByText(
          "Diagnostic delivery is for review only, not production approval.",
        ),
      );
      expect(page.url()).toContain("attempt=attempt-diagnostic");

      await page.mouse.click(10, 16);
      await expect.poll(() => dialog.count()).toBe(0);
      expect(page.url()).not.toContain("attempt=");
      await focused(page.locator("#admin-view-title"));

      const row = page.getByRole("button", {
        name: /Open attempt attempt-0000/u,
      });
      await row.click();
      await visible(page.getByRole("dialog", { name: "Attempt attempt-0000" }));
      await page.mouse.click(10, 16);
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      await focused(row);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows the open-warning notice for an attention delivery", async () => {
    const diagnostic = ATTEMPTS.find(
      (attempt) => attempt.attemptId === "attempt-diagnostic",
    );
    if (!diagnostic) throw new Error("diagnostic fixture missing");
    const original = diagnostic.deliveryStatus;
    Object.assign(diagnostic, { deliveryStatus: "attention" });
    const { page, errors } = await openPage({
      viewport: { width: 1200, height: 844 },
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
    });
    try {
      await waitForGenerations(page);
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-diagnostic",
      });
      await visible(dialog);
      await visible(
        dialog.getByText(
          "Delivery has open review warnings. The preview is usable, but the listed findings are unresolved.",
        ),
      );
      autoErrors(errors);
    } finally {
      Object.assign(diagnostic, { deliveryStatus: original });
      await page.close();
    }
  });

  it("opens the desktop inspector as a side sheet", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page
        .getByRole("button", { name: /Open attempt attempt-0000/u })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-0000",
      });
      await visible(dialog);
      const sheet = await dialog.boundingBox();
      expect(sheet).not.toBeNull();
      expect(sheet!.x).toBeGreaterThan(500);
      expect(sheet!.width).toBeLessThanOrEqual(1440);
      expect(page.url()).toContain("attempt=attempt-0000");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("hides disabled Operations by default without requesting its API and keeps Legacy history reachable", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const nav = page.getByRole("navigation", { name: "Workspace sections" });
      await expect
        .poll(() => requests.some((r) => r.path === "/me"))
        .toBe(true);
      expect(
        await nav
          .getByRole("link", { name: "Operations", exact: true })
          .count(),
      ).toBe(0);
      await nav.getByRole("link", { name: "Sites", exact: true }).click();
      await waitForGenerations(page);
      expect(requests.some((r) => r.path.startsWith("/operations/"))).toBe(
        false,
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows Operations only after server bootstrap explicitly enables reads", async () => {
    operationsReadCapability = true;
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const nav = page.getByRole("navigation", { name: "Workspace sections" });
      await visible(nav.getByRole("link", { name: "Operations", exact: true }));
      expect(requests.some((r) => r.path.startsWith("/operations/"))).toBe(
        false,
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("falls back a disabled Operations direct URL to Legacy history before any operations API call", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=operations&attemptId=11111111-1111-4111-8111-111111111111",
    });
    try {
      await waitForGenerations(page);
      await expect
        .poll(() => new URL(page.url()).searchParams.get("view"))
        .toBe("generations");
      expect(
        await page
          .getByRole("link", { name: "Operations", exact: true })
          .count(),
      ).toBe(0);
      expect(requests.some((r) => r.path.startsWith("/operations/"))).toBe(
        false,
      );
      expect(await page.locator("body").innerText()).not.toContain(
        "temporarily unavailable",
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("renders six navigation items with a distinct active state and accessible focus", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const nav = page.getByRole("navigation", {
        name: "Workspace sections",
      });
      await expect.poll(() => nav.getByRole("link").count()).toBe(6);
      const active = nav.locator('[aria-current="page"]');
      await expect.poll(() => active.count()).toBe(1);
      await expect.poll(() => active.textContent()).toBe("Sites");

      const tone = await active.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          color: style.color,
          shadow: style.boxShadow,
        };
      });
      expect(tone.background).toBe("rgb(27, 59, 50)");
      expect(tone.shadow).toContain("rgb(217, 240, 107)");
      expect(contrastRatio(tone.color, tone.background)).toBeGreaterThanOrEqual(
        4.5,
      );

      await active.focus();
      const focus = await active.evaluate((element) => ({
        text: element.textContent?.trim() || "",
        outline: getComputedStyle(element).outlineColor,
      }));
      expect(focus.text).toBe("Sites");
      expect(focus.outline).toBe("rgb(217, 240, 107)");
      expect(
        contrastRatio(focus.outline, "rgb(16, 37, 31)"),
      ).toBeGreaterThanOrEqual(3);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("switches between the ledger and gallery and opens a generation preview", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page.getByRole("button", { name: "Gallery" }).click();
      await expect
        .poll(() => page.locator(".admin-gallery-card").count())
        .toBeGreaterThan(0);
      await page.locator(".admin-gallery-card").first().click();
      const dialog = page.getByRole("dialog");
      await visible(dialog);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      await visible(
        dialog.getByText("Generation screenshot.", { exact: false }),
      );
      await visible(dialog.getByRole("button", { name: "Close preview" }));
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      await page.getByRole("button", { name: "Ledger" }).click();
      await expect
        .poll(() => page.locator(".admin-ledger").count())
        .toBeGreaterThan(0);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows the site timeline by default and opens the site", async () => {
    const { page, errors } = await openPage();
    try {
      await expect
        .poll(() => page.locator(".admin-site-group").count())
        .toBeGreaterThan(0);
      await visible(page.locator(".admin-site-name").first());
      const viewSite = page.getByRole("link", { name: "View site" }).first();
      await visible(viewSite);
      expect(await viewSite.getAttribute("href")).toMatch(
        /^https:\/\/business-\d+\.pages\.dev\/$/u,
      );
      expect(await viewSite.getAttribute("target")).toBe("_blank");
      expect(
        await viewSite.evaluate(
          (element) => getComputedStyle(element).textDecorationLine,
        ),
      ).toBe("none");
      const proofFrame = page.locator(".admin-site-proof__frame").first();
      await visible(proofFrame);
      const proofBox = await proofFrame.boundingBox();
      expect(proofBox).not.toBeNull();
      expect(proofBox!.width).toBeGreaterThanOrEqual(200);
      expect(proofBox!.height).toBeGreaterThanOrEqual(120);
      const readyPill = page.locator(".admin-site-status--ready").first();
      if (await readyPill.count()) {
        await visible(readyPill);
        expect(
          await readyPill.evaluate(
            (element) => getComputedStyle(element).color,
          ),
        ).toBe("rgb(18, 88, 97)");
      }
      const proofButton = page.locator(".admin-site-proof").first();
      await proofButton.click();
      await visible(page.locator("#attempt-inspector"));
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      await focused(proofButton);
      const openClient = page
        .getByRole("button", { name: "Open client" })
        .first();
      if (await openClient.count()) {
        await openClient.click();
        await visible(page.locator("#client-inspector-title"));
      }
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the site status in a readable column at 390px", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await expect
        .poll(() => page.locator(".admin-site-group").count())
        .toBeGreaterThan(0);
      const status = page.locator(".admin-site-timeline__status").first();
      await visible(status);
      const box = await status.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(120);
      expect(box!.x).toBeGreaterThan(40);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the client filter when a status chip is selected", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&clientFilter=submission:client-a",
    });
    try {
      await visible(page.locator("#generations-view"));
      await page.getByRole("button", { name: /^Succeeded/u }).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("clientFilter"))
        .toBe("submission:client-a");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("opens the verified attempt site when the client has no stored preview", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0001",
    });
    try {
      await visible(page.locator("#attempt-inspector-title"), 15_000);
      const dialog = page.getByRole("dialog");
      await expect
        .poll(() =>
          dialog.getByRole("link", { name: "Visit site" }).getAttribute("href"),
        )
        .toBe("https://business-1.pages.dev/");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("separates the latest attempt from the last reconciliation", async () => {
    health = fixtureHealth({
      partial: true,
      pendingProjectionCount: 0,
      coverageStart: null,
      lastError: null,
      lastSyncAt: Date.UTC(2026, 9, 21, 17, 29),
      latestAttemptAt: Date.UTC(2026, 9, 30, 16, 20),
    });
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const details = page.locator("details.admin-data-health");
      await visible(details.locator("summary"));
      await details.locator("summary").click();
      await visible(details.getByText(/Latest attempt received 30 Oct 2026/u));
      await visible(details.getByText(/Last reconciled 21 Oct 2026/u));
      expect(await page.getByText(/0 pending projections/u).count()).toBe(0);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("loads the authenticated generation screenshot in the ledger, gallery and sheet", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const ledgerImage = page
        .locator(".admin-ledger .admin-preview img")
        .first();
      await visible(ledgerImage);
      await expect
        .poll(() =>
          ledgerImage.evaluate(
            (image) => (image as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      expect(await ledgerImage.getAttribute("src")).toContain(
        "/api/admin/onboarding-invites/generation-hero?id=issue%3A1000",
      );

      await page.getByRole("button", { name: "Gallery" }).click();
      const galleryImage = page.locator(".admin-gallery-card__image").first();
      await visible(galleryImage);
      await expect
        .poll(() =>
          galleryImage.evaluate(
            (image) => (image as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);

      await page.locator(".admin-gallery-card").first().click();
      const dialog = page.getByRole("dialog");
      await visible(dialog);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      const sheetImage = dialog.locator(".admin-browser__media img");
      await visible(sheetImage);
      await expect
        .poll(() =>
          sheetImage.evaluate(
            (image) => (image as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      expect(await sheetImage.getAttribute("src")).toContain(
        "generation-hero?id=issue%3A1000",
      );
      expect(
        requests.some(
          (entry) =>
            entry.path === "/generation-hero" &&
            entry.params.id === "issue:1000",
        ),
      ).toBe(true);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it.each([
    { width: 1512, height: 960 },
    { width: 390, height: 844 },
  ])(
    "shows only this focused attempt's protected preview at $width",
    async (viewport) => {
      const original = { ...ATTEMPTS[0] };
      Object.assign(ATTEMPTS[0], {
        profile: "creative-only",
        executionStatus: "failed",
        deliveryStatus: "diagnostic",
        runId: "90000",
        runAttempt: 2,
        previewUrl: "https://abc123.launchloom-pipeline-preview.pages.dev/",
      });
      const { page, errors } = await openPage({ viewport });
      try {
        await waitForGenerations(page);
        await page.locator(".admin-row-action").first().click();
        const dialog = page.getByRole("dialog");
        await visible(dialog);
        await expect
          .poll(() =>
            dialog.evaluate(
              (element) =>
                element.getBoundingClientRect().right <= innerWidth + 1,
            ),
          )
          .toBe(true);
        expect(
          await dialog
            .getByRole("link", { name: "Visit site" })
            .getAttribute("href"),
        ).toBe("/admin/preview/abc123.launchloom-pipeline-preview.pages.dev/");
        await dialog
          .getByRole("button", { name: "Site preview", exact: true })
          .click();
        expect(
          await dialog.locator(".admin-browser__media img").getAttribute("src"),
        ).toContain("id=github%3A90000%3A2");
        await expect
          .poll(() =>
            dialog
              .locator(".admin-browser__media img")
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        autoErrors(errors);
      } finally {
        ATTEMPTS[0] = original;
        await page.close();
      }
    },
  );

  it("does not substitute the client site or issue screenshot for an unavailable focused attempt", async () => {
    const original = { ...ATTEMPTS[0] };
    Object.assign(ATTEMPTS[0], {
      profile: "creative-only",
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
      runId: "90000",
      runAttempt: 2,
      previewUrl: null,
    });
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page.locator(".admin-row-action").first().click();
      const dialog = page.getByRole("dialog");
      await visible(dialog);
      expect(
        await dialog.getByRole("link", { name: "Visit site" }).count(),
      ).toBe(0);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      await visible(dialog.getByText("Preview not captured"));
      expect(
        requests.some(
          (entry) =>
            entry.path === "/generation-hero" &&
            entry.params.id === "github:90000:2",
        ),
      ).toBe(false);
      expect(
        requests.some(
          (entry) =>
            entry.path === "/generation-hero" &&
            entry.params.id === "issue:1000",
        ),
      ).toBe(false);
      autoErrors(errors);
    } finally {
      ATTEMPTS[0] = original;
      await page.close();
    }
  });

  it("rejects an arbitrary pages.dev preview on a focused attempt", async () => {
    const original = { ...ATTEMPTS[0] };
    Object.assign(ATTEMPTS[0], {
      profile: "creative-only",
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
      runId: "90000",
      runAttempt: 2,
      previewUrl: "https://evil.pages.dev/",
    });
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page.locator(".admin-row-action").first().click();
      const dialog = page.getByRole("dialog");
      await visible(dialog);
      expect(
        await dialog.getByRole("link", { name: "Visit site" }).count(),
      ).toBe(0);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      await visible(dialog.getByText("Preview not captured"));
      expect(
        requests.some(
          (entry) =>
            entry.path === "/generation-hero" &&
            entry.params.id === "github:90000:2",
        ),
      ).toBe(false);
      autoErrors(errors);
    } finally {
      ATTEMPTS[0] = original;
      await page.close();
    }
  });

  it("does not link a focused preview without diagnostic delivery", async () => {
    const original = { ...ATTEMPTS[0] };
    Object.assign(ATTEMPTS[0], {
      profile: "creative-only",
      executionStatus: "succeeded",
      deliveryStatus: "preview_ready",
      runId: "90000",
      runAttempt: 2,
      previewUrl: "https://abc123.launchloom-pipeline-preview.pages.dev/",
    });
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page.locator(".admin-row-action").first().click();
      const dialog = page.getByRole("dialog");
      await visible(dialog);
      expect(
        await dialog.getByRole("link", { name: "Visit site" }).count(),
      ).toBe(0);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      await visible(dialog.getByText("Preview not captured"));
      expect(
        requests.some(
          (entry) =>
            entry.path === "/generation-hero" &&
            entry.params.id === "github:90000:2",
        ),
      ).toBe(false);
      autoErrors(errors);
    } finally {
      ATTEMPTS[0] = original;
      await page.close();
    }
  });

  it.each([
    {
      label: "desktop",
      width: 1512,
      height: 960,
      file: "/tmp/opencode/related-preview-desktop.png",
    },
    {
      label: "mobile",
      width: 390,
      height: 844,
      file: "/tmp/opencode/related-preview-mobile.png",
    },
  ])(
    "labels a related preview as another attempt's at $label size",
    async ({ width, height, file }) => {
      relatedPreviews.set("attempt-related-preview", {
        attemptId: "attempt-published-earlier",
        issueNumber: 1910,
        runId: "40737253021",
        runAttempt: 1,
        completedAt: Date.UTC(2026, 9, 28, 18, 0, 0),
        deliveryStatus: "preview_ready",
        previewUrl:
          "https://review-initial.launchloom-1910-northline-dental.pages.dev/",
      });
      const { page, errors } = await openPage({
        viewport: { width, height },
        path: "/admin/onboarding-invites?view=generations&attempt=attempt-related-preview",
      });
      try {
        await waitForGenerations(page);
        const dialog = page.getByRole("dialog", {
          name: "Attempt attempt-related-preview",
        });
        await visible(dialog);
        await dialog
          .getByRole("button", { name: "Site preview", exact: true })
          .click();
        await visible(
          dialog.getByRole("heading", {
            name: "Preview from another attempt",
          }),
        );
        const link = dialog.getByRole("link", {
          name: "Open the verified preview for issue 1910 delivered by attempt attempt-published-earlier",
        });
        await visible(link);
        expect(await link.getAttribute("href")).toBe(
          "https://review-initial.launchloom-1910-northline-dental.pages.dev/",
        );
        expect(await link.getAttribute("target")).toBe("_blank");
        expect(await link.getAttribute("rel")).toContain("noreferrer");
        await visible(
          dialog.getByText(/latest successful generation for issue 1910/u),
        );
        await visible(
          dialog.getByText(/verified preview recorded for this issue/u),
        );
        await visible(dialog.getByText(/not this attempt's own preview/u));
        await visible(
          dialog.getByRole("button", { name: "Open related attempt" }),
        );
        expect(
          await dialog.getByRole("link", { name: "Visit site" }).count(),
        ).toBe(0);

        const metrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);
        await page.waitForTimeout(300);
        await dialog.locator("[data-related-preview]").scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await dialog.screenshot({ path: file });
        autoErrors(errors);
      } finally {
        relatedPreviews.clear();
        await page.close();
      }
    },
    60_000,
  );

  it("keeps this attempt's own client preview ahead of any related preview", async () => {
    relatedPreviews.set("attempt-0000", {
      attemptId: "attempt-related-preview",
      issueNumber: 1910,
      runId: "40737253021",
      runAttempt: 1,
      completedAt: Date.UTC(2026, 9, 28, 18, 0, 0),
      deliveryStatus: "published",
      previewUrl:
        "https://review-initial.launchloom-1910-northline-dental.pages.dev/",
    });
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-0000",
    });
    try {
      await waitForGenerations(page);
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-0000",
      });
      await visible(dialog);
      await expect
        .poll(() =>
          dialog.getByRole("link", { name: "Visit site" }).getAttribute("href"),
        )
        .toBe("https://preview-0.pages.dev/");
      expect(
        await dialog
          .getByRole("heading", { name: "Preview from another attempt" })
          .count(),
      ).toBe(0);
      expect(await dialog.locator("[data-related-preview]").count()).toBe(0);
      autoErrors(errors);
    } finally {
      relatedPreviews.clear();
      await page.close();
    }
  });

  it("shows no related preview when none is proven and never an unsafe one", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-related-preview",
    });
    try {
      await waitForGenerations(page);
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-related-preview",
      });
      await visible(dialog);
      expect(await dialog.locator("[data-related-preview]").count()).toBe(0);

      for (const previewUrl of [
        "https://preview.pages.dev/?token=secret",
        "https://abc.launchloom-pipeline-preview.pages.dev/",
        "https://evil.example/",
      ]) {
        relatedPreviews.set("attempt-related-preview", {
          attemptId: "attempt-published-earlier",
          issueNumber: 1910,
          runId: "40737253021",
          runAttempt: 1,
          completedAt: Date.UTC(2026, 9, 28, 18, 0, 0),
          deliveryStatus: "preview_ready",
          previewUrl,
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        const reloaded = page.getByRole("dialog", {
          name: "Attempt attempt-related-preview",
        });
        await visible(reloaded);
        await expect
          .poll(() => reloaded.locator("[data-related-preview]").count())
          .toBe(0);
      }
      autoErrors(errors);
    } finally {
      relatedPreviews.clear();
      await page.close();
    }
  }, 60_000);

  it("opens the related attempt from its clearly labeled control", async () => {
    relatedPreviews.set("attempt-related-preview", {
      attemptId: "attempt-published-earlier",
      issueNumber: 1910,
      runId: "40737253021",
      runAttempt: 1,
      completedAt: Date.UTC(2026, 9, 28, 18, 0, 0),
      deliveryStatus: "preview_ready",
      previewUrl:
        "https://review-initial.launchloom-1910-northline-dental.pages.dev/",
    });
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-related-preview",
    });
    try {
      await waitForGenerations(page);
      const dialog = page.getByRole("dialog", {
        name: "Attempt attempt-related-preview",
      });
      await visible(dialog);
      await dialog
        .getByRole("button", { name: "Site preview", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Open related attempt" })
        .click();
      await visible(
        page.getByRole("dialog", { name: "Attempt attempt-published-earlier" }),
      );
      expect(page.url()).toContain("attempt=attempt-published-earlier");
      expect(await page.locator("[data-related-preview]").count()).toBe(0);
      autoErrors(errors);
    } finally {
      relatedPreviews.clear();
      await page.close();
    }
  });

  it.each([
    { label: "404", mode: "notFound" as HeroMode, status: 404 },
    { label: "401", mode: "unauthorized" as HeroMode, status: 401 },
  ])(
    "shows the preview placeholder when the hero request returns $label",
    async ({ mode, status }) => {
      heroMode = mode;
      const { page, errors } = await openPage();
      try {
        await waitForGenerations(page);
        const placeholder = page
          .locator(".admin-ledger .admin-preview__placeholder")
          .first();
        await visible(placeholder);
        await expect
          .poll(() => placeholder.textContent())
          .toContain("Preview not captured");
        await expect
          .poll(() =>
            page
              .locator(".admin-ledger .admin-preview")
              .first()
              .locator("img")
              .count(),
          )
          .toBe(0);

        await page.locator(".admin-row-action").first().click();
        const dialog = page.getByRole("dialog");
        await visible(dialog);
        await dialog
          .getByRole("button", { name: "Site preview", exact: true })
          .click();
        const largePlaceholder = dialog.locator(
          ".admin-browser__media .admin-preview__placeholder--large",
        );
        await visible(largePlaceholder);
        await expect
          .poll(() => largePlaceholder.textContent())
          .toContain("Preview not captured");
        autoErrors(errors, { allowResourceStatuses: [status] });
      } finally {
        await page.close();
      }
    },
  );

  it("collapses and restores the workspace rail", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect
        .poll(() => page.locator(".admin-shell").getAttribute("class"))
        .toContain("admin-shell--collapsed");
      await visible(page.getByRole("link", { name: "Sites", exact: true }));
      await page.getByRole("button", { name: "Expand sidebar" }).click();
      await expect
        .poll(() => page.locator(".admin-shell").getAttribute("class"))
        .not.toContain("admin-shell--collapsed");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("supports keyboard row selection, inspector focus and focus return", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const row = page.getByRole("button", {
        name: /Open attempt attempt-0000/u,
      });
      await row.focus();
      await page.keyboard.press("Enter");
      const heading = page.locator("#attempt-inspector-title");
      await focused(heading);
      await page.keyboard.press("Escape");
      await expect.poll(() => heading.count()).toBe(0);
      await focused(row);
      expect(page.url()).not.toContain("attempt=");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("recovers from a failed refresh and a successful retry", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const row = page.getByRole("button", {
        name: /Open attempt attempt-0000/u,
      });
      await row.click();
      await visible(
        page.getByRole("heading", { name: "Attempt attempt-0000" }),
      );
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);

      failAttemptListOnce = true;
      const refresh = page.getByRole("button", { name: "Refresh" });
      await refresh.click();
      await visible(
        page.getByText(/The latest refresh failed\. Showing the last loaded/u),
      );
      await focused(refresh);

      await refresh.click();
      await expect
        .poll(() =>
          page
            .getByText(/The latest refresh failed\. Showing the last loaded/u)
            .count(),
        )
        .toBe(0);
      await visible(page.getByText(/Showing \d+ of \d+ attempts/u));
      autoErrors(errors, { allowResource503: true });
    } finally {
      await page.close();
    }
  });

  it("shows the attention summary and filters by the same predicate", async () => {
    health = fixtureHealth({
      partial: true,
      pendingProjectionCount: 2,
      lastError: "Reconciliation delayed.",
    });
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const summary = page.locator("[data-attention-summary]");
      await visible(summary);
      await expect
        .poll(() => summary.getAttribute("data-attention-total"))
        .toBe(String(ATTENTION_ATTEMPTS));
      await visible(summary.getByText(/need attention/iu));
      expect(
        attentionRequests().some(
          (entry) =>
            entry.params.attention === "true" && entry.params.limit === "1",
        ),
      ).toBe(true);

      await summary.getByRole("button", { name: "Review attention" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.attention)
        .toBe("true");
      expect(page.url()).toContain("attention=true");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("never infers active progress for an unknown attempt with a start time", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=generations&attempt=attempt-unknown",
    });
    try {
      const inspector = page.locator("#attempt-inspector");
      await visible(
        inspector.getByRole("heading", { name: "Attempt attempt-unknown" }),
      );
      expect(
        await inspector.getByText("In progress", { exact: true }).count(),
      ).toBe(0);
      await expect
        .poll(() => inspector.locator("[data-attempt-elapsed]").textContent())
        .toBe("Not recorded");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps previous and next cursor state aligned with browser history", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const previous = page.getByRole("button", { name: "Previous page" });
      const next = page.getByRole("button", { name: "Next page" });
      await page.getByLabel("Rows per page").selectOption("100");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.limit)
        .toBe("100");
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);

      await next.click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:100");
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);
      await next.click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:200");

      await page.goBack();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:100");
      await page.goBack();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe(undefined);
      await expect.poll(() => previous.isDisabled()).toBe(true);

      await page.goForward();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:100");
      await expect.poll(() => previous.isDisabled()).toBe(false);
      await page.goForward();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:200");

      await page.goBack();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe("offset:100");
      await previous.click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.cursor)
        .toBe(undefined);
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);
      await expect.poll(() => previous.isDisabled()).toBe(true);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("only associates the expanded row with the visible inspector", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      const first = page.getByRole("button", {
        name: /Open attempt attempt-0000/u,
      });
      const second = page.getByRole("button", {
        name: /Open attempt attempt-0001/u,
      });
      await first.click();
      await visible(
        page.getByRole("heading", { name: "Attempt attempt-0000" }),
      );
      expect(await first.getAttribute("aria-controls")).toBe(
        "attempt-inspector",
      );
      expect(await second.getAttribute("aria-controls")).toBeNull();
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows a loading skeleton before the first dataset arrives", async () => {
    attemptListDelay = 600;
    const { page, errors } = await openPage();
    try {
      await visible(page.getByText("Loading generation attempts..."));
      await waitForGenerations(page);
      await openFilters(page);
      await expect
        .poll(() => page.getByText("Loading generation attempts...").count())
        .toBe(0);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows honest empty and health-error states", async () => {
    failHealth = true;
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      await visible(page.getByText(/Tracking health could not be loaded\./u));
      await page.getByLabel("Search attempts").fill("no-such-record-here");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await visible(page.getByText("No attempts match these filters"));
      autoErrors(errors, { allowResource503: true });
    } finally {
      await page.close();
    }
  });

  it("omits unsafe site links from a client dossier", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=clients&client=submission:client-unsafe",
    });
    try {
      const dossier = page.locator("#client-inspector");
      await visible(
        dossier.getByRole("heading", {
          name: "Client dossier: Unsafe Link Co.",
        }),
      );
      expect(
        await dossier.getByRole("link", { name: "Published site" }).count(),
      ).toBe(0);
      expect(
        await dossier.getByRole("link", { name: "Preview site" }).count(),
      ).toBe(0);
      await visible(
        dossier.getByText(/omitted because it is not a token-free approved/u),
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("renders no console or page errors while moving between all implemented states", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      await openFilters(page);
      await page.getByLabel("Search attempts").fill("Business 12");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect
        .poll(() => lastRequest("/attempts")?.params.search)
        .toBe("Business 12");
      await page.getByRole("link", { name: "Clients", exact: true }).click();
      await waitForClients(page);
      await page.getByLabel("Search clients").fill("Acme");
      await page.getByRole("button", { name: "Search clients" }).click();
      await expect
        .poll(() => lastRequest("/clients")?.params.search)
        .toBe("Acme");
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("scrolls the client table horizontally instead of crushing the row action", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 1024, height: 900 },
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      const wrap = page.locator(".admin-client-table-wrap");
      expect(
        await wrap.evaluate((element) => getComputedStyle(element).overflowX),
      ).toBe("auto");
      expect(
        await wrap.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
      const action = page.locator("[data-row-action]").first();
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(72);
      expect(box!.height).toBeGreaterThanOrEqual(32);
      expect(
        await action.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("scrolls the ledger horizontally and states each finish time once", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 1024, height: 900 },
    });
    try {
      await waitForGenerations(page);
      const wrap = page.locator(".admin-ledger-wrap");
      expect(
        await wrap.evaluate((element) => getComputedStyle(element).overflowX),
      ).toBe("auto");
      expect(
        await wrap.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
      const row = page.locator(".admin-ledger tbody tr").first();
      const finished = await row.locator("td").nth(3).innerText();
      expect(finished.match(/\b\d{2}:\d{2}\b/gu)?.length ?? 0).toBe(1);
      const action = row.getByRole("button", { name: /Open attempt/u });
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(72);
      expect(box!.height).toBeGreaterThanOrEqual(32);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("omits the filler subtitle from every dashboard view", async () => {
    for (const view of ["generations", "clients", "invitations"]) {
      const { page } = await openPage({
        path: `/admin/onboarding-invites?view=${view}`,
      });
      try {
        await visible(page.locator("#admin-view-title"));
        expect(await page.locator(".admin-topbar__description").count()).toBe(
          0,
        );
      } finally {
        await page.close();
      }
    }
  });

  it("keeps a long inviting-admin address inside its column", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 1512, height: 960 },
      path: "/admin/onboarding-invites?view=clients",
    });
    try {
      await waitForClients(page);
      const row = page.locator(".admin-client-table tbody tr").first();
      await row
        .locator("td:nth-child(4) .admin-actor__name")
        .evaluate((element) => {
          element.textContent = "intake-flow-1792764962080@launchloom.test";
        });
      const admin = await row.locator("td:nth-child(4)").boundingBox();
      const action = await row
        .getByRole("cell", { name: /Open client/u })
        .boundingBox();
      expect(admin).not.toBeNull();
      expect(action).not.toBeNull();
      expect(admin!.x + admin!.width).toBeLessThanOrEqual(action!.x + 1);
      expect(
        await row
          .locator("td:nth-child(4)")
          .evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows the site status as a labelled pill that stays inside a mobile card", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await visible(page.locator(".admin-site-group").first());
      const status = page.locator(".admin-site-status").first();
      await visible(status);
      expect((await status.innerText()).trim().length).toBeGreaterThan(0);
      const group = page.locator(".admin-site-group").first();
      const card = await group.boundingBox();
      const viewport = page.viewportSize();
      expect(card).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(card!.x).toBeGreaterThanOrEqual(0);
      expect(card!.x + card!.width).toBeLessThanOrEqual(viewport!.width + 1);
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });
});

// Exercise the shared shell shortcuts against actual route transitions at the
// supported breakpoints. Optional captures are synthetic fixtures, never clients.
it("keeps studio navigation and summary actions usable on desktop and mobile", async () => {
  for (const width of [1512, 768, 390]) {
    const { page, errors } = await openPage({
      viewport: { width, height: 960 },
    });
    try {
      await visible(page.locator(".admin-site-group").first());
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
      await visible(page.getByRole("button", { name: "Review attention" }));
      if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
        await page.screenshot({
          path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-sites-${width}.png`,
        });
      }
      await page
        .getByRole("link", { name: "Create invitation", exact: true })
        .click();
      await visible(
        page.getByRole("heading", { name: "Private invitations", exact: true }),
      );
      expect(page.url()).toContain("view=invitations");
      if (width > 900) {
        await page.getByRole("link", { name: "Open your profile" }).click();
        await visible(
          page.getByRole("heading", {
            name: "Workspace settings",
            exact: true,
          }),
        );
        expect(page.url()).toContain("view=settings");
        await page.getByRole("button", { name: "Collapse sidebar" }).click();
        await visible(page.getByRole("button", { name: "Expand sidebar" }));
        await page.getByRole("link", { name: "Clients", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.getByRole("link", { name: "Clients", exact: true }).click();
        await visible(
          page.getByRole("heading", { name: "Client directory", exact: true }),
        );
        expect(
          await page
            .getByRole("button", { name: "Open navigation" })
            .getAttribute("aria-expanded"),
        ).toBe("false");
      }
      await waitForClients(page);
      if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
        await page.screenshot({
          path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-clients-${width}.png`,
        });
      }
      await page
        .getByRole("button", { name: /Open client submission:client-a/u })
        .click();
      const dossier = page.getByRole("dialog", {
        name: /Client dossier: Acme & Sons/u,
      });
      await visible(dossier);
      await page.waitForTimeout(300);
      if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
        await page.screenshot({
          path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-dossier-${width}.png`,
        });
      }
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      // Invitation/profile endpoints intentionally aren't supplied by this fixture.
      expect(errors.filter((error) => !error.includes("404"))).toEqual([]);
    } finally {
      await page.close();
    }
  }
}, 60_000);

it("omits the activity section when the capability is disabled", async () => {
  activityEnabled = false;
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
  });
  try {
    await waitForGenerations(page);
    const inspector = page.getByRole("dialog", {
      name: "Attempt attempt-diagnostic",
    });
    await visible(inspector);
    // Disabling the feature restores the existing inspector exactly.
    expect(await inspector.locator(".admin-activity").count()).toBe(0);
    await visible(
      inspector.getByRole("heading", { name: "Attempt attempt-diagnostic" }),
    );
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("renders model calls, actions, usage and inspectable evidence in a dedicated thread", async () => {
  activityEnabled = true;
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
  });
  try {
    await waitForGenerations(page);
    const inspector = page.getByRole("dialog", {
      name: "Attempt attempt-diagnostic",
    });
    await visible(inspector);
    expect(await inspector.locator(".admin-activity").count()).toBe(0);
    await visible(inspector.getByText("Run code changes", { exact: true }));
    expect(requests.some((request) => request.path.endsWith("/activity"))).toBe(
      true,
    );
    await inspector
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    expect(await inspector.locator("[data-attempt-metrics]").count()).toBe(0);
    await visible(
      inspector.getByText(/Diagnostic delivery is for review only/u),
    );
    const activity = inspector.locator(".admin-activity");
    await visible(activity);
    const viewTimelineBtn = inspector.getByRole("button", {
      name: /View timeline/u,
    });
    await visible(viewTimelineBtn);
    await viewTimelineBtn.click();
    const timelineDrawer = inspector.locator("#attempt-stage-timeline-drawer");
    await visible(timelineDrawer);
    await visible(timelineDrawer.getByText("Stage timeline"));
    await timelineDrawer
      .getByRole("button", { name: "Close stage timeline" })
      .click();
    await expect.poll(() => timelineDrawer.count()).toBe(0);
    await expect
      .poll(() => activity.locator(".admin-activity__entry").count())
      .toBeGreaterThanOrEqual(4);
    expect(await activity.locator('[data-kind="model"]').count()).toBe(1);
    expect(await activity.locator('[data-kind="action"]').count()).toBe(1);
    const usage = activity.locator(".admin-chat__meta-strip .admin-activity__summary");
    await expect.poll(() => usage.textContent()).toContain("1.2k in");
    await expect.poll(() => usage.textContent()).toContain("$0.1200 actual");
    await expect
      .poll(() =>
        activity.locator(".admin-activity__coverage summary").textContent(),
      )
      .toContain("Coverage: 1 instrumented");
    await expect.poll(() => usage.getAttribute("title"))
      .toContain("Token totals cover completed calls only");

    await activity.getByRole("button", { name: /Model request/u }).click();
    const evidence = activity.locator(
      '[data-kind="model"] .admin-activity__evidence',
    );
    await visible(evidence);
    await expect
      .poll(() => evidence.textContent())
      .toContain(
        "I am building the opening section around the approved service scope.",
      );
    await expect.poll(() => evidence.textContent()).toContain("Reported usage");
    expect(
      await evidence
        .locator(".admin-activity__evidence-block")
        .first()
        .textContent(),
    ).toContain(
      "I am building the opening section around the approved service scope.",
    );
    const thread = activity.locator('[data-kind="model"]');
    await visible(evidence.getByText("340", { exact: true }));
    expect(await thread.getByRole("button", { name: /Model request.*340/u }).count()).toBe(0);
    await activity.getByRole("button", { name: /Model request/u }).click();
    expect(await evidence.count()).toBe(0);
    await visible(
      thread.getByText(
        "I am building the opening section around the approved service scope.",
        { exact: true },
      ),
    );

    await activity
      .getByRole("button", { name: "Actions", exact: true })
      .click();
    await expect
      .poll(() => activity.locator('[data-kind="model"]').count())
      .toBe(0);
    expect(await activity.locator('[data-kind="action"]').count()).toBe(1);
    await activity.getByRole("button", { name: "Issues", exact: true }).click();
    await expect
      .poll(() => activity.locator('[data-kind="error"]').count())
      .toBe(1);
    await activity.getByRole("button", { name: "Model", exact: true }).click();
    await expect
      .poll(() => activity.locator('[data-kind="action"]').count())
      .toBe(0);
    expect(await activity.locator('[data-kind="model"]').count()).toBe(1);
    await inspector
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await visible(inspector.locator("[data-attempt-metrics]"));
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("catches up once from the acknowledged activity cursor after reconnecting", async () => {
  activityEnabled = true;
  const attemptId = "attempt-0005";
  const initial = activityPageFor(attemptId);
  const initialCursor = initial.activity.items.at(-1)!.cursor;
  const { page } = await openPage({
    clock: true,
    path: `/admin/onboarding-invites?view=generations&attempt=${attemptId}`,
  });
  const cursors: (string | null)[] = [];
  const caughtUpCursor = "v1.b.abcdabcd";
  try {
    await page.route(`**/legacy/attempts/${attemptId}/activity*`, async (route) => {
      const after = new URL(route.request().url()).searchParams.get("after");
      cursors.push(after);
      const activity = initial.activity;
      if (!after) {
        await route.fulfill({
          json: { ...initial, activity: { ...activity, nextCursor: initialCursor, hasMore: true } },
        });
        return;
      }
      if (cursors.length === 2) {
        await route.fulfill({ status: 503, json: { error: { message: "Temporarily unavailable" } } });
        return;
      }
      const firstPage = after === initialCursor;
      const sequence = firstPage ? 10 : 11;
      const item = {
        ...activityEvent(sequence, {
          kind: "task_finished",
          payload: { label: firstPage ? "Revision evidence received" : "Revision evidence checked", status: "succeeded" },
        }),
        context: { ...activityEvent(sequence).context, attemptId },
        cursor: firstPage ? "v1.a.abcdabcd" : caughtUpCursor,
        receivedAt: Date.now(),
      };
      await route.fulfill({
        json: {
          ...initial,
          activity: {
            ...activity,
            items: after === caughtUpCursor ? [] : [...activity.items.slice(-1), item],
            hasMore: firstPage,
            nextCursor: item.cursor,
          },
        },
      });
    });
    const drawer = page.locator("#attempt-inspector");
    await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
    await visible(drawer.getByRole("button", { name: "Load earlier activity" }));
    await page.clock.runFor(100);
    expect(cursors).toEqual([null]);

    await page.clock.runFor(2_000);
    await expect.poll(() => cursors.length).toBe(2);
    await page.clock.runFor(2_100);
    await visible(drawer.getByText("Revision evidence checked", { exact: true }));
    expect(cursors).toEqual([null, initialCursor, initialCursor, "v1.a.abcdabcd"]);
    expect(await drawer.getByText("Revision evidence received", { exact: true }).count()).toBe(1);
    await page.clock.runFor(2_100);
    await expect.poll(() => cursors.slice(4)).toEqual([caughtUpCursor]);
  } finally {
    await page.close();
  }
}, 30_000);

it("cancels a pending history read and opens the next attempt at its own cursor", async () => {
  activityEnabled = true;
  const attemptId = "attempt-0005";
  const initial = activityPageFor(attemptId);
  const { page } = await openPage({
    path: `/admin/onboarding-invites?view=generations&attempt=${attemptId}`,
  });
  const isHistory = (url: string) => new URL(url).searchParams.has("before");
  let releaseHistory!: () => void;
  const held = new Promise<void>((resolve) => { releaseHistory = resolve; });
  const history = structuredClone(initial);
  history.activity.items[0]!.context.candidateId = "previous-attempt-only";
  try {
    await page.route(`**/legacy/attempts/${attemptId}/activity*`, async (route) => {
      if (isHistory(route.request().url())) {
        await held;
        await route.fulfill({ json: history }).catch(() => {});
        return;
      }
      await route.fulfill({ json: {
        ...initial,
        activity: { ...initial.activity, hasMore: true, nextCursor: initial.activity.items.at(-1)!.cursor },
      } });
    });
    const drawer = page.locator("#attempt-inspector");
    await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
    const started = page.waitForRequest((request) => isHistory(request.url()));
    const cancelled = page.waitForEvent("requestfailed", {
      predicate: (request) => isHistory(request.url()),
      timeout: 2_000,
    }).catch(() => null);
    await drawer.getByRole("button", { name: "Load earlier activity" }).click();
    await started;
    await drawer.getByRole("button", { name: "Close preview", exact: true }).click();
    expect((await cancelled)?.failure()?.errorText).toBe("net::ERR_ABORTED");
    await waitForGenerations(page);
    await page.getByRole("button", { name: /Open attempt attempt-0001/u }).click();
    const nextRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith("/legacy/attempts/attempt-0001/activity"),
    );
    await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
    expect(new URL((await nextRequest).url()).search).toBe("?limit=100");
    releaseHistory();
    await visible(drawer.getByRole("button", { name: /Model request/u }));
    expect(await drawer.getByText(/previous-attempt-only/u).count()).toBe(0);
  } finally {
    releaseHistory();
    await page.close();
  }
});

it("keeps one pending cursor when a run ends and resumes after visibility returns", async () => {
  activityEnabled = true;
  const attemptId = "attempt-0005";
  const initial = activityPageFor(attemptId);
  const initialCursor = initial.activity.items.at(-1)!.cursor;
  const detail = attemptDetail(ATTEMPTS.find((attempt) => attempt.attemptId === attemptId)!);
  const { page } = await openPage({
    clock: true,
    path: `/admin/onboarding-invites?view=generations&attempt=${attemptId}`,
  });
  const setVisibility = (visibility: "hidden" | "visible") => page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visibility);
  const reads: Route[] = [];
  const latestCursor = "v1.a.abcdabcd";
  try {
    await page.route(`**/legacy/attempts/${attemptId}/activity*`, async (route) => {
      if (new URL(route.request().url()).searchParams.has("after")) {
        reads.push(route);
        return;
      }
      await route.fulfill({ json: {
        ...initial,
        activity: { ...initial.activity, items: initial.activity.items.slice(0, 1), nextCursor: initialCursor },
      } });
    });
    const drawer = page.locator("#attempt-inspector");
    await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
    await visible(drawer.getByText("Waiting for visible output", { exact: true }));
    await page.clock.runFor(2_100);
    await expect.poll(() => reads.length).toBe(1);
    await page.route(`**/workspace/attempts/${attemptId}`, (route) => route.fulfill({
      json: { attempt: { ...detail, executionStatus: "failed", completedAt: Date.now() } },
    }));
    await page.clock.runFor(15_100);
    await visible(drawer.getByText("Unconfirmed", { exact: true }));
    expect(reads.map((route) => new URL(route.request().url()).searchParams.get("after")))
      .toEqual([initialCursor]);

    const item = {
      ...activityEvent(10, { kind: "task_finished", payload: { label: "Final activity recorded", status: "succeeded" } }),
      context: { ...activityEvent(10).context, attemptId },
      cursor: latestCursor,
      receivedAt: Date.now(),
    };
    await reads[0]!.fulfill({ json: {
      ...initial,
      activity: { ...initial.activity, items: [item], nextCursor: latestCursor },
    } });
    await visible(drawer.getByText("Final activity recorded", { exact: true }));
    await page.clock.runFor(2_100);
    expect(reads).toHaveLength(1);
    await page.clock.runFor(13_000);
    await expect.poll(() => reads.length).toBe(2);
    expect(new URL(reads[1]!.request().url()).searchParams.get("after")).toBe(latestCursor);
    await reads[1]!.fulfill({ json: {
      ...initial,
      activity: { ...initial.activity, items: [], nextCursor: latestCursor },
    } });

    await setVisibility("hidden");
    await page.clock.runFor(16_000);
    expect(reads).toHaveLength(2);
    await setVisibility("visible");
    await expect.poll(() => reads.length).toBe(3);
    expect(new URL(reads[2]!.request().url()).searchParams.get("after")).toBe(latestCursor);
  } finally {
    await page.close();
  }
}, 30_000);

it("shows live status without visible output and keeps counters in details", async () => {
  activityEnabled = true;
  const attemptId = "attempt-0005";
  const initial = activityPageFor(attemptId);
  const start = initial.activity.items[0]!;
  const progress = {
    ...start,
    eventId: "88888888-8888-4888-8888-888888888888",
    sequence: 2,
    cursor: "v1.2.abcdabcd",
    kind: "output_delta",
    payload: { callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", visibleChars: 0, reasoningTokens: 883, elapsedMs: 15_000 },
  };
  activityFixture = {
    ...initial,
    activity: { ...initial.activity, items: [start, progress], nextCursor: progress.cursor },
  };
  const { page, errors } = await openPage({
    path: `/admin/onboarding-invites?view=generations&attempt=${attemptId}`,
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
    const row = drawer.locator(".admin-chat__turn");
    await visible(row.getByText("Waiting for visible output · 15s reported", { exact: true }));
    expect(await row.locator(".admin-chat__thinking-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(await row.getByRole("button", { name: /883 reasoning deltas/u }).count()).toBe(0);
    expect(await row.locator(".admin-chat__codeblock--live").count()).toBe(0);
    await row.locator(".admin-chat__thinking-toggle").click();
    await visible(row.getByText("883 reasoning deltas", { exact: true }));
    const withheld = {
      ...progress,
      eventId: "99999999-9999-4999-8999-999999999999",
      sequence: 3,
      cursor: "v1.3.abcdabcd",
      payload: { ...progress.payload, delta: { kind: "withheld", reason: "sensitive" } },
    };
    activityFixture = {
      ...initial,
      activity: { ...initial.activity, items: [withheld], nextCursor: withheld.cursor },
    };
    await visible(row.getByText("[Output withheld: sensitive]", { exact: true }));
    expect(await row.getByText("Waiting for visible output · 15s reported", { exact: true }).count()).toBe(1);
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("streams Agent runs code across incremental polls and replaces it at completion on desktop and mobile", async () => {
  activityEnabled = true;
  const attemptId = "attempt-0005"; // Running fixture
  const path = `/legacy/attempts/${attemptId}/activity`;
  const initial = activityPageFor(attemptId);
  const callId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const event = (sequence: number, overrides: Record<string, unknown> = {}) => {
    const item = activityEvent(sequence, overrides);
    return {
      ...item,
      context: { ...item.context, attemptId },
      cursor: `v1.${sequence.toString(16)}.abcdabcd`,
      receivedAt: Date.now() + sequence,
    };
  };
  const delta = (sequence: number, text: string) => event(sequence, {
    kind: "output_delta",
    payload: {
      callId, visibleChars: sequence * 100, reasoningTokens: 2,
      elapsedMs: sequence * 1000, delta: { kind: "text", text },
    },
  });
  const tasks = Array.from({ length: 22 }, (_, index) => event(index + 1, {
    kind: "task_finished",
    payload: { label: `Stage handoff ${index + 1}`, status: "succeeded", detail: null },
  }));
  const first = delta(24, 'export const headline = "Working";\n');
  const longLine = "x".repeat(500);
  const earlierCode = `// ${longLine}\n${"// Earlier code\n".repeat(22)}`;
  const second = delta(25, earlierCode);
  const third = delta(26, 'export const next = true;\n');
  const fourth = delta(27, "export const last = 1;\n");
  const finish = event(28, { kind: "model_finished", payload: { callId, status: "completed" } });
  const output = event(29, {
    kind: "output",
    payload: {
      callId,
      message: { kind: "text", text: JSON.stringify({ designContract: "Authoritative rendered design" }) },
    },
  });
  const edit = event(30, {
    kind: "action_finished",
    payload: {
      actionId: "candidate:live:edit",
      name: "edit_candidate_files",
      status: "succeeded",
      durationMs: null,
      result: { filesChanged: 1, additions: 1, deletions: 1, patch: "-old\n+new\n" },
    },
  });
  const respond = (items: ReturnType<typeof event>[]) => {
    activityFixture = {
      ...initial,
      activity: { ...initial.activity, items, nextCursor: items.at(-1)!.cursor },
    };
  };

  for (const width of [1512, 390]) {
    requests = [];
    respond([...tasks, event(23), first]);
    const { page, errors } = await openPage({
      viewport: { width, height: 844 },
      path: `/admin/onboarding-invites?view=generations&attempt=${attemptId}`,
    });
    try {
      const drawer = page.locator("#attempt-inspector");
      await drawer.getByRole("button", { name: "Agent runs", exact: true }).click();
      const scroll = drawer.locator(".admin-chat__scroll");
      const live = drawer.locator(".admin-chat__codeblock--live");
      const code = live.locator("pre");
      const jump = drawer.getByRole("button", { name: "Jump to latest" });
      const atBottom = () => scroll.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight <= 28,
      );
      await visible(live.getByText("Streaming", { exact: true }));
      await visible(drawer.getByText("Visible output received · 24s reported", { exact: true }));
      expect(await code.textContent()).toBe('export const headline = "Working";\n');
      await expect.poll(atBottom).toBe(true);

      respond([second]);
      await expect.poll(() => code.textContent(), { timeout: 8_000 }).toContain(longLine);
      expect(await code.textContent()).toBe(`export const headline = "Working";\n${earlierCode}`);
      expect(requests.some(({ path: requestPath, params }) =>
        requestPath.endsWith(path) && params.after === first.cursor,
      )).toBe(true);
      await expect.poll(atBottom).toBe(true);

      const codeAtBottom = () => code.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight <= 28,
      );
      await expect.poll(codeAtBottom).toBe(true);
      await code.evaluate((element) => { element.scrollTop = 0; });
      await visible(jump);
      expect(await atBottom()).toBe(true);
      respond([third]);
      await expect.poll(() => code.textContent(), { timeout: 8_000 }).toContain("export const next");
      expect(await code.evaluate((element) => element.scrollTop)).toBe(0);
      await jump.click();
      await expect.poll(codeAtBottom).toBe(true);
      await expect.poll(() => jump.count()).toBe(0);

      await scroll.evaluate((element) => { element.scrollTop = 0; });
      await visible(jump);
      respond([fourth]);
      await expect.poll(() => code.textContent(), { timeout: 8_000 }).toContain("export const last");
      expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
      await jump.click();
      await expect.poll(atBottom).toBe(true);
      await expect.poll(() => jump.count()).toBe(0);

      const expectNoOverflow = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      };
      await expectNoOverflow();
      if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
        await page.screenshot({ path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-live-agent-${width}.png` });
      }

      const model = drawer.getByRole("button", { name: /Model request/u });
      await model.click();
      await visible(drawer.locator(".admin-activity__evidence"));
      await visible(jump);
      respond([finish, output]);
      await visible(drawer.locator(".admin-activity__evidence .admin-chat__prose")
        .getByText("Authoritative rendered design", { exact: true }));
      expect(await live.count()).toBe(0);
      await model.click();
      await visible(drawer.getByText("Authoritative rendered design", { exact: true }));
      respond([edit]);
      const appliedEdit = drawer.getByRole("button", { name: /Edit candidate files/u });
      await visible(appliedEdit.getByText("1 file · +1 −1", { exact: true }));
      await appliedEdit.click();
      await visible(drawer.getByLabel("Applied candidate diff"));
      await expectNoOverflow();
      if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
        await page.screenshot({ path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-completed-agent-${width}.png` });
      }
      autoErrors(errors);
    } finally {
      await page.close();
    }
  }
}, 50_000);

it("reopens completed agent activity and shows applied and final source changes", async () => {
  activityEnabled = true;
  const attemptId = "attempt-diagnostic";
  const initial = activityPageFor(attemptId);
  const baseSha = "a".repeat(40);
  const headSha = "b".repeat(40);
  const change = (index: number, name: string, result: Record<string, unknown>) =>
    activityEvent(index, {
      cursor: `v1.${index.toString(16)}.abcdabcd`,
      receivedAt: Date.now() + index,
      kind: "action_finished",
      payload: { actionId: name, name, status: "succeeded", durationMs: null, result },
    });
  activityFixture = {
    ...initial,
    activity: {
      ...initial.activity,
      recording: "complete",
      items: [
        ...initial.activity.items,
        change(11, "edit_candidate_files", {
          filesChanged: 1, additions: 3, deletions: 2, patch: "-old\n+new\n",
        }),
        change(12, "run_code_changes", {
          repository: "WrazyAI/client-site", baseSha, headSha,
          filesChanged: 2, additions: 8, deletions: 1,
        }),
      ],
    },
  };
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?view=clients&client=submission:client-a",
  });
  try {
    const activity = page.getByRole("link", {
      name: `View agent activity for ${attemptId}`,
    });
    await visible(activity);
    await activity.click();
    const drawer = page.locator("#attempt-inspector");
    const checkSummary = async () => {
      await visible(drawer.getByText("2 files · +8 −1", { exact: true }));
      expect(await drawer.getByRole("link", { name: "View complete diff on GitHub" })
        .getAttribute("href")).toBe(`https://github.com/WrazyAI/client-site/compare/${baseSha}...${headSha}`);
    };
    await checkSummary();
    const edit = drawer.getByRole("button", { name: /Edit candidate files/u });
    await visible(edit.getByText("1 file · +3 −2", { exact: true }));
    await edit.click();
    await visible(drawer.getByLabel("Applied candidate diff"));
    expect(await drawer.getByLabel("Applied candidate diff").textContent()).toBe("-old\n+new\n");
    await page.reload();
    await checkSummary();
    await drawer.getByRole("button", { name: "Overview", exact: true }).click();
    await checkSummary();
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("shows recorded model output when its start is on an older activity page", async () => {
  activityEnabled = true;
  const initial = activityPageFor("attempt-diagnostic");
  const fullProse = `${"Recorded prose from the model. ".repeat(23)}End of visible output.`;
  activityFixture = {
    ...initial,
    activity: {
      ...initial.activity,
      items: initial.activity.items.slice(1, 4).map((item) =>
        item.kind === "output"
          ? { ...item, payload: { ...item.payload, message: { kind: "text", text: fullProse } } }
          : item,
      ),
    },
  };
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?attempt=attempt-diagnostic",
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    await drawer
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    const row = drawer.getByRole("button", {
      name: /Model activity \(earlier request not loaded\)/u,
    });
    await visible(row);
    await row.click();
    await visible(drawer.getByText(fullProse, { exact: true }));
    await visible(drawer.getByText("Reported usage", { exact: true }));
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("shows an unfinished call from an ended run as unconfirmed, not live", async () => {
  activityEnabled = true;
  const initial = activityPageFor("attempt-diagnostic");
  activityFixture = {
    ...initial,
    activity: {
      ...initial.activity,
      items: initial.activity.items.slice(0, 1),
      recording: "complete",
    },
  };
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?attempt=attempt-diagnostic",
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    await drawer
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    const row = drawer.locator('[data-kind="model"]');
    await visible(row.getByText("Unconfirmed", { exact: true }));
    expect(await row.locator(".admin-activity__status--live").count()).toBe(0);
    await visible(row.locator(".admin-activity__status--warn"));
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("distinguishes a run that never recorded activity", async () => {
  activityEnabled = true;
  activityFixture = {
    activity: {
      ...activityPageFor("attempt-diagnostic").activity,
      items: [],
      recording: "not_recorded",
    },
    readOnly: true,
  };
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
  });
  try {
    await waitForGenerations(page);
    const inspector = page.getByRole("dialog", {
      name: "Attempt attempt-diagnostic",
    });
    await visible(inspector);
    await inspector
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    const activity = inspector.locator(".admin-activity");
    await visible(activity);
    await expect
      .poll(() => activity.textContent())
      .toContain("Detailed activity was not recorded for this run.");
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("keeps the activity inspector inside the viewport at 390px", async () => {
  activityEnabled = true;
  const { page, errors } = await openPage({
    viewport: { width: 390, height: 844 },
    path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
  });
  try {
    await waitForGenerations(page);
    const inspector = page.getByRole("dialog", {
      name: "Attempt attempt-diagnostic",
    });
    await visible(inspector);
    await inspector
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    const activity = inspector.locator(".admin-activity");
    await visible(activity);
    await activity.getByRole("button", { name: /Model request/u }).click();
    await visible(activity.locator(".admin-activity__evidence"));
    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
    const feed = await activity
      .locator(".admin-activity__feed")
      .evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
    expect(feed.scrollWidth).toBeLessThanOrEqual(feed.clientWidth + 1);
    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("renders chat-style Agent runs with collapsible thinking traces, structured JSON output, stage filters, and a locked prompt composer", async () => {
  activityEnabled = true;
  const initial = activityPageFor("attempt-diagnostic");
  const jsonOutput = JSON.stringify({
    stage: "styles",
    designContract:
      "Single stylesheet carrying the editorial architecture system across home and services.",
    routes: ["/", "/services"],
  });
  activityFixture = {
    ...initial,
    activity: {
      ...initial.activity,
      items: initial.activity.items.map((item) =>
        item.kind === "output"
          ? {
              ...item,
              payload: {
                ...item.payload,
                message: { kind: "text", text: jsonOutput },
              },
            }
          : item,
      ),
    },
  };
  const { page, errors } = await openPage({
    path: "/admin/onboarding-invites?view=generations&attempt=attempt-diagnostic",
  });
  try {
    await waitForGenerations(page);
    const inspector = page.getByRole("dialog", {
      name: "Attempt attempt-diagnostic",
    });
    await visible(inspector);
    await inspector
      .getByRole("button", { name: "Agent runs", exact: true })
      .click();
    const activity = inspector.locator(".admin-activity");
    await visible(activity);

    // Structured JSON summary is shown cleanly instead of raw unformatted braces.
    await visible(
      activity
        .locator(".admin-chat__prose")
        .getByText(
          "Single stylesheet carrying the editorial architecture system across home and services.",
          { exact: true },
        ),
    );
    const payloadDetails = activity.locator(".admin-chat__code-disclosure");
    await visible(payloadDetails);
    await payloadDetails.locator("summary").click();
    await visible(activity.locator(".admin-chat__codeblock-pre"));

    // Stage chip filters interactively narrow the feed and reset cleanly.
    const stageBtn = activity.locator(".admin-activity__stage--button").first();
    await visible(stageBtn);
    await stageBtn.click();
    expect(await stageBtn.getAttribute("aria-pressed")).toBe("true");
    await visible(activity.locator(".admin-activity__stage--reset"));
    await activity.locator(".admin-activity__stage--reset").click();
    expect(await stageBtn.getAttribute("aria-pressed")).toBe("false");

    // Thinking trace starts collapsed on completed calls and expands interactively.
    const thinkingBtn = activity
      .locator(".admin-chat__thinking-toggle")
      .first();
    await visible(thinkingBtn);
    expect(await thinkingBtn.getAttribute("aria-expanded")).toBe("false");
    await thinkingBtn.click();
    expect(await thinkingBtn.getAttribute("aria-expanded")).toBe("true");
    await visible(
      activity.getByText(
        /Private chain-of-thought text is withheld by policy/u,
      ),
    );

    // Filters, inline stage tags, and the Collapse/Expand thinking button
    // share one single horizontal toolbar row on desktop.
    const filtersGroup = activity.getByRole("group", {
      name: "Activity filters",
    });
    const thinkingToolbarBtn = activity.locator(".admin-chat__thinking-btn");
    await visible(thinkingToolbarBtn);
    expect(
      await thinkingToolbarBtn.evaluate(
        (element) => getComputedStyle(element).textDecorationLine,
      ),
    ).toBe("none");
    const [filtersBox, stageBox, thinkingBtnBox] = await Promise.all([
      filtersGroup.boundingBox(),
      stageBtn.boundingBox(),
      thinkingToolbarBtn.boundingBox(),
    ]);
    expect(filtersBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(thinkingBtnBox).not.toBeNull();
    const filtersMid = filtersBox!.y + filtersBox!.height / 2;
    const stageMid = stageBox!.y + stageBox!.height / 2;
    const thinkingMid = thinkingBtnBox!.y + thinkingBtnBox!.height / 2;
    expect(Math.abs(filtersMid - stageMid)).toBeLessThanOrEqual(6);
    expect(Math.abs(filtersMid - thinkingMid)).toBeLessThanOrEqual(6);

    // Locked future prompt composer is anchored to the bottom of the drawer,
    // with the "View timeline" trigger directly beneath it.
    const dock = activity.locator(".admin-chat__dock");
    await visible(dock);
    const composer = dock.locator(".admin-chat__composer");
    await visible(composer);
    await visible(composer.getByText("Read-only run trace"));
    const input = composer.locator("textarea");
    expect(await input.isDisabled()).toBe(true);
    const sendBtn = composer.locator(".admin-chat__composer-send");
    expect(await sendBtn.isDisabled()).toBe(true);

    const viewTimeline = dock.getByRole("button", { name: /View timeline/u });
    await visible(viewTimeline);
    const [inspectorBox, dockBox, composerBox, triggerBox] = await Promise.all([
      inspector.boundingBox(),
      dock.boundingBox(),
      composer.boundingBox(),
      viewTimeline.boundingBox(),
    ]);
    expect(inspectorBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(
      Math.abs(
        dockBox!.y + dockBox!.height - (inspectorBox!.y + inspectorBox!.height),
      ),
    ).toBeLessThanOrEqual(2);
    expect(triggerBox!.y).toBeGreaterThanOrEqual(
      composerBox!.y + composerBox!.height - 1,
    );

    // Scrolling up shows the icon-only "Jump to latest" button anchored above
    // the input bar; clicking it returns to the bottom and hides the button.
    const scroller = activity.locator(".admin-chat__scroll");
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const jumpBtn = dock.getByRole("button", { name: "Jump to latest" });
    await visible(jumpBtn);
    expect((await jumpBtn.textContent())?.trim() || "").toBe("");
    const jumpBox = await jumpBtn.boundingBox();
    expect(jumpBox).not.toBeNull();
    expect(jumpBox!.y + jumpBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);

    if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
      await page.setViewportSize({ width: 1512, height: 960 });
      await scroller.evaluate((element) => {
        element.scrollTop = 120;
        element.dispatchEvent(new Event("scroll"));
      });
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-agent-runs-anchored-1512.png`,
      });
    }

    await jumpBtn.click();
    await expect.poll(() => jumpBtn.count()).toBe(0);

    // Opening "View timeline" reveals the compact vertical Stage timeline drawer
    // and Escape dismisses only the timeline drawer without closing the inspector.
    await viewTimeline.click();
    const timelineDrawer = inspector.locator("#attempt-stage-timeline-drawer");
    await visible(timelineDrawer);
    await visible(timelineDrawer.getByText("Stage timeline"));
    const panelBox = await timelineDrawer
      .locator(".admin-timeline-drawer__panel")
      .boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeLessThanOrEqual(380);

    if (process.env.ADMIN_DESIGN_CAPTURE_DIR) {
      await page.waitForTimeout(260);
      await page.screenshot({
        path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-agent-runs-timeline-drawer-1512.png`,
      });
    }

    await page.keyboard.press("Escape");
    await expect.poll(() => timelineDrawer.count()).toBe(0);
    await visible(inspector);
    await focused(viewTimeline);

    autoErrors(errors);
  } finally {
    await page.close();
  }
});

it("explains context-only SEO evidence without presenting missing metrics as zero", async () => {
  seoDetail = JSON.stringify({
    mode: "context-only",
    publishReady: false,
    tasks: 2,
    validatedQueries: 0,
    stageCosts: [
      {
        stage: "local_search_volume",
        city: "Charleston, SC",
        tasks: 1,
        usd: 0,
        status: "complete",
      },
      {
        stage: "search_intent",
        city: "Charleston, SC",
        tasks: 1,
        usd: null,
        status: "failed",
      },
    ],
  });
  const { page } = await openPage({
    path: "/admin/onboarding-invites?attempt=attempt-0000",
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    expect(await drawer.getByText("Charleston, SC").count()).toBe(0);
    await drawer
      .getByRole("button", { name: "SEO research", exact: true })
      .click();
    await visible(drawer.getByText("Context only", { exact: true }));
    await visible(drawer.getByText(/cannot clear the SEO release gate/u));
    const checks = drawer.getByRole("table", { name: "Research checks" });
    await visible(
      checks.getByRole("row", { name: /Local search volume.*\$0\.00/u }),
    );
    await visible(
      checks.getByRole("row", { name: /Search intent.*Not recorded/u }),
    );
    await drawer.getByText("Recorded source", { exact: true }).click();
    await visible(drawer.getByText(/"publishReady":false/u));
  } finally {
    seoDetail = null;
    await page.close();
  }
});

it("labels cited fallback research as approval-ready but not measured", async () => {
  seoDetail = JSON.stringify({
    mode: "fallback",
    researchBasis: "cited-web-fallback",
    publishReady: true,
    tasks: 0,
    validatedQueries: 0,
    fallbackStatus: "complete",
    fallbackQueries: 5,
    fallbackEvidence: 12,
    stageCosts: [],
  });
  const { page } = await openPage({
    path: "/admin/onboarding-invites?attempt=attempt-0000",
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    await drawer
      .getByRole("button", { name: "SEO research", exact: true })
      .click();
    await visible(drawer.getByText("Cited fallback evidence complete"));
    await visible(drawer.getByText(/not measured SEO metrics/u));
    await visible(drawer.getByText(/Fallback status: Complete/u));
    await visible(drawer.getByText(/12 cited observations/u));
  } finally {
    seoDetail = null;
    await page.close();
  }
});

it("opens an uncropped site capture in its own view at 390px", async () => {
  const { page } = await openPage({
    viewport: { width: 390, height: 844 },
    path: "/admin/onboarding-invites?attempt=attempt-0000",
  });
  try {
    const drawer = page.locator("#attempt-inspector");
    expect(await drawer.locator(".admin-browser__media img").count()).toBe(0);
    await drawer
      .getByRole("button", { name: "Site preview", exact: true })
      .click();
    const image = drawer.locator(".admin-browser__media img");
    await visible(image);
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    const proportions = await image.evaluate((node: HTMLImageElement) => ({
      rendered: node.width / node.height,
      natural: node.naturalWidth / node.naturalHeight,
    }));
    expect(proportions.rendered).toBeCloseTo(proportions.natural, 1);
    expect(
      await drawer
        .getByRole("link", { name: "Open full-size capture" })
        .getAttribute("href"),
    ).toContain("/generation-hero?");
    expect(await drawer.getByRole("link", { name: "Visit site" }).count()).toBe(
      1,
    );
    await visible(drawer.getByText(/may predate later revisions/u));
  } finally {
    await page.close();
  }
});

it.each([
  "{broken-json",
  '{"mode":"__proto__"}',
  '{"mode":"context-only","stageCosts":[{"stage":"__proto__","status":"constructor","usd":null}]}',
  '{"mode":"context-only","stageCosts":[null,4,{"stage":"<img src=x onerror=alert(1)>","usd":"0"}]}',
])(
  "preserves malformed or untrusted SEO as evidence without executing it: %s",
  async (source) => {
    seoDetail = source;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const drawer = page.locator("#attempt-inspector");
      await drawer
        .getByRole("button", { name: "SEO research", exact: true })
        .click();
      await drawer.getByText("Recorded source", { exact: true }).click();
      expect(await drawer.locator(".admin-seo-source pre").textContent()).toBe(
        source,
      );
      expect(await drawer.locator(".admin-seo-view img").count()).toBe(0);
      autoErrors(errors);
    } finally {
      seoDetail = null;
      await page.close();
    }
  },
);

it.each([1512, 390])(
  "captures all focused drawer views at %ipx",
  async (width) => {
    activityEnabled = true;
    seoDetail = JSON.stringify({
      mode: "context-only",
      publishReady: false,
      tasks: 9,
      validatedQueries: 0,
      stageCosts: [
        {
          stage: "local_search_volume",
          city: "Charleston, SC",
          tasks: 1,
          usd: 0.09,
          status: "complete",
        },
        {
          stage: "search_intent",
          city: "Charleston, SC",
          tasks: 1,
          usd: 0.01512,
          status: "complete",
        },
      ],
    });
    const { page, errors } = await openPage({
      viewport: { width, height: 960 },
      path: "/admin/onboarding-invites?attempt=attempt-0000",
    });
    try {
      const drawer = page.locator("#attempt-inspector");
      for (const [name, slug] of [
        ["Agent runs", "agent"],
        ["SEO research", "seo"],
        ["Site preview", "preview"],
      ]) {
        await drawer.getByRole("button", { name, exact: true }).click();
        if (slug === "agent") {
          await visible(drawer.locator('[data-kind="model"]'));
          await drawer.getByRole("button", { name: /Model request/u }).click();
        }
        await page.waitForTimeout(350);
        const overflow = await drawer.evaluate((node) => ({
          width: node.clientWidth,
          content: node.scrollWidth,
        }));
        expect(overflow.content).toBeLessThanOrEqual(overflow.width + 1);
        await drawer.screenshot({
          path: `/tmp/opencode/run-inspector-${slug}-${width}.png`,
        });
        if (process.env.ADMIN_DESIGN_CAPTURE_DIR && slug === "agent") {
          await page.screenshot({
            path: `${process.env.ADMIN_DESIGN_CAPTURE_DIR}/admin-sites-agent-runs-${width}.png`,
          });
        }
      }
      await drawer
        .getByRole("button", { name: "Overview", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      autoErrors(errors);
    } finally {
      seoDetail = null;
      await page.close();
    }
  },
);
