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
import { chromium, type Browser, type Locator, type Page } from "playwright";
import sharp from "sharp";
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";
import type {
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
const CLIENTS = syntheticClients();
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
let attemptListDelay = 0;
let relatedPreviews = new Map<string, RelatedIssuePreview>();
type HeroMode = "ok" | "notFound" | "unauthorized";
let heroMode: HeroMode = "ok";
let heroPng: Buffer;
let operationsReadCapability = false;

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
      (!clientId || attempt.clientId === clientId) &&
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
    sendJson(response, { principal: adminPrincipal, capabilities: { operationsRead: operationsReadCapability } });
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
    sendJson(
      response,
      attemptMatch[2]
        ? eventPage(attempt, params)
        : {
            attempt: {
              ...attemptDetail(attempt),
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
  requests = [];
  health = fixtureHealth();
  delays = new Map();
  failAttemptListOnce = false;
  failHealth = false;
  attemptListDelay = 0;
  heroMode = "ok";
  relatedPreviews = new Map();
});

type OpenOptions = {
  viewport?: { width: number; height: number };
  path?: string;
};

async function openPage(options: OpenOptions = {}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1512, height: 960 },
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
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
  await visible(page.getByText(new RegExp(`${ATTEMPTS.length} attempts`, "u")));
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
      await page.waitForTimeout(300);
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
      await visible(page.getByText(/3 pending projections/u));
      await visible(page.getByText(/GitHub reconciliation is delayed\./u));
      await visible(page.getByText(/Coverage starts 01 Sep 2026/u));
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

        const table = await page
          .locator(".admin-table-wrap")
          .first()
          .evaluate((element) => ({
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }));
        expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth + 1);

        await page.keyboard.press("Escape");
        await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
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
        await visible(dialog.getByText("Attempt summary"));
        await visible(dialog.getByText("Stage timeline"));

        await page.waitForTimeout(300);
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
          .locator(".admin-inspector__sheet")
          .boundingBox();
        expect(innerSheet).not.toBeNull();
        expect(Math.abs(innerSheet!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(innerSheet!.height - 844)).toBeLessThanOrEqual(1);
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
      viewport: { width: 390, height: 844 },
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
      await expect.poll(() => requests.some(r => r.path === "/me")).toBe(true);
      expect(await nav.getByRole("link", { name: "Operations", exact: true }).count()).toBe(0);
      await nav.getByRole("link", { name: "Legacy history", exact: true }).click();
      await waitForGenerations(page);
      expect(requests.some(r => r.path.startsWith("/operations/"))).toBe(false);
      autoErrors(errors);
    } finally { await page.close(); }
  });

  it("shows Operations only after server bootstrap explicitly enables reads", async () => {
    operationsReadCapability = true;
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const nav = page.getByRole("navigation", { name: "Workspace sections" });
      await visible(nav.getByRole("link", { name: "Operations", exact: true }));
      expect(requests.some(r => r.path.startsWith("/operations/"))).toBe(false);
      autoErrors(errors);
    } finally { await page.close(); }
  });

  it("falls back a disabled Operations direct URL to Legacy history before any operations API call", async () => {
    const { page, errors } = await openPage({ path: "/admin/onboarding-invites?view=operations&attemptId=11111111-1111-4111-8111-111111111111" });
    try {
      await waitForGenerations(page);
      await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("generations");
      expect(await page.getByRole("link", { name: "Operations", exact: true }).count()).toBe(0);
      expect(requests.some(r => r.path.startsWith("/operations/"))).toBe(false);
      expect(await page.locator("body").innerText()).not.toContain("temporarily unavailable");
      autoErrors(errors);
    } finally { await page.close(); }
  });

  it("renders six quiet navigation items and reserves lime for focus", async () => {
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
      await expect.poll(() => active.textContent()).toBe("Legacy history");

      const tone = await active.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopColor,
        };
      });
      expect(tone.background).not.toBe("rgb(217, 240, 107)");
      expect(relativeLuminance(tone.background)).toBeGreaterThan(0.5);
      expect(contrastRatio(tone.color, tone.background)).toBeGreaterThanOrEqual(
        4.5,
      );

      await active.focus();
      const focus = await active.evaluate((element) => ({
        text: element.textContent?.trim() || "",
        outline: getComputedStyle(element).outlineColor,
      }));
      expect(focus.text).toBe("Legacy history");
      expect(focus.outline).toBe("rgb(217, 240, 107)");
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
        expect(
          await page
            .locator(".admin-ledger .admin-preview")
            .first()
            .locator("img")
            .count(),
        ).toBe(0);

        await page.locator(".admin-row-action").first().click();
        const dialog = page.getByRole("dialog");
        await visible(dialog);
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
      await visible(
        page.getByRole("link", { name: "Legacy history", exact: true }),
      );
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
});
