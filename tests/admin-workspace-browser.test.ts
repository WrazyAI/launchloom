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
} from "playwright";
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";
import type { AttemptSummary, Health } from "../src/lib/admin-contracts";
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
const adminPrincipal = {
  id: "admin:browser",
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

function sendJson(
  response: http.ServerResponse,
  body: unknown,
  status = 200,
) {
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
  return requests.filter((entry) => entry.path === pathname).at(-1);
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

async function serve(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url || "/", origin);
  const pathname = url.pathname;

  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
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
      const content = await readFile(path.join(assetsDirectory, "admin-assets", relative));
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
    sendJson(response, adminPrincipal);
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
      sendJson(response, { error: { code: "not_found", message: "Not found." } }, 404);
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
      sendJson(response, { error: { code: "not_found", message: "Not found." } }, 404);
      return;
    }
    sendJson(
      response,
      attemptMatch[2] ? eventPage(attempt, params) : { attempt: attemptDetail(attempt) },
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
  assetsDirectory = await mkdtemp(path.join(tmpdir(), "launchloom-admin-browser-"));
  await buildAdminWorkspace({ outDir: assetsDirectory, production: true });
  server = http.createServer((request, response) => {
    void serve(request, response);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(assetsDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  requests = [];
  health = fixtureHealth();
  delays = new Map();
  failAttemptListOnce = false;
  failHealth = false;
  attemptListDelay = 0;
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
  await visible(
    page.getByText(new RegExp(`${ATTEMPTS.length} attempts`, "u")),
  );
}

async function waitForClients(page: Page) {
  await visible(page.getByText(new RegExp(`${CLIENTS.length} clients`, "u")));
}

async function focused(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => element === document.activeElement),
    )
    .toBe(true);
}

function autoErrors(
  errors: string[],
  options: { allowResource503?: boolean } = {},
) {
  const unexpected = options.allowResource503
    ? errors.filter(
        (error) =>
          !/Failed to load resource: .*503 \(Service Unavailable\)/u.test(
            error,
          ),
      )
    : errors;
  expect(unexpected).toEqual([]);
}

describe("real admin workspace browser behavior", () => {
  it("renders server counts, applies every filter and sends them to the server", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
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
      await page.getByLabel("Rows per page").selectOption("100");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect.poll(() => lastRequest("/attempts")?.params.limit).toBe("100");
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);

      await page.getByRole("button", { name: "Next page" }).click();
      await expect.poll(() => lastRequest("/attempts")?.params.cursor).toBe(
        "offset:100",
      );
      await expect
        .poll(() => page.locator("#generations-view tbody tr").count(), {
          timeout: 10_000,
        })
        .toBe(100);

      await page.getByRole("button", { name: "Next page" }).click();
      await expect.poll(() => lastRequest("/attempts")?.params.cursor).toBe(
        "offset:200",
      );
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

  it("restores filters through browser back and forward", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const search = page.getByLabel("Search attempts");
      await search.fill("Zoë");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect.poll(() => lastRequest("/attempts")?.params.search).toBe(
        "Zoë",
      );
      expect(page.url()).toContain("search=Zo%C3%AB");

      await page.goBack();
      await expect.poll(() => lastRequest("/attempts")?.params.search).toBe(
        undefined,
      );
      await expect.poll(() => search.inputValue()).toBe("");

      await page.goForward();
      await expect.poll(() => lastRequest("/attempts")?.params.search).toBe(
        "Zoë",
      );
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
      await visible(inspector.getByText("Zoë & Sons, Gardeners"));
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
      expect(await inspector.locator("img").count()).toBe(0);
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
        await visible(
          page.getByRole("heading", { name: "Attempt attempt-diagnostic" }),
        );
        const metrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);

        const table = await page.locator(".admin-table-wrap").first().evaluate(
          (element) => ({
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }),
        );
        expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);

        await page.getByRole("link", { name: "Clients", exact: true }).click();
        await waitForClients(page);
        await page
          .getByRole("button", { name: /Open client submission:client-a/u })
          .click();
        await visible(
          page.getByRole("heading", { name: "Client dossier: Acme & Sons" }),
        );
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

  it("supports keyboard row selection, inspector focus and focus return", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
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

  it("preserves selection and focus through a failed refresh and a successful retry", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForGenerations(page);
      const row = page.getByRole("button", {
        name: /Open attempt attempt-0000/u,
      });
      await row.click();
      const heading = page.getByRole("heading", {
        name: "Attempt attempt-0000",
      });
      await visible(heading);
      failAttemptListOnce = true;
      const refresh = page.getByRole("button", { name: "Refresh" });
      await refresh.click();
      await visible(
        page.getByText(/The latest refresh failed\. Showing the last loaded/u),
      );
      await visible(heading);
      expect(await row.getAttribute("aria-expanded")).toBe("true");
      await focused(refresh);

      await refresh.click();
      await expect
        .poll(() =>
          page
            .getByText(/The latest refresh failed\. Showing the last loaded/u)
            .count(),
        )
        .toBe(0);
      await visible(heading);
      autoErrors(errors, { allowResource503: true });
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
      await visible(
        page.getByText(/Tracking health could not be loaded\./u),
      );
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
      await page.getByLabel("Search attempts").fill("Business 12");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect.poll(() => lastRequest("/attempts")?.params.search).toBe(
        "Business 12",
      );
      await page.getByRole("link", { name: "Clients", exact: true }).click();
      await waitForClients(page);
      await page.getByLabel("Search clients").fill("Acme");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect.poll(() => lastRequest("/clients")?.params.search).toBe(
        "Acme",
      );
      autoErrors(errors);
    } finally {
      await page.close();
    }
  });
});
