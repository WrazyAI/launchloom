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

vi.setConfig({ testTimeout: 30_000 });

type InviteFixture = {
  inviteId: string;
  clientEmail: string | null;
  submitterEmail: string | null;
  expiresAt: number;
  status: string;
  createdAt: number;
  updatedAt: number;
  submissionId: string | null;
  issueNumber: number | null;
  recoveryRequired: boolean;
  recoveryAttempts: number;
};

type RecordedRequest = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  origin: string;
};

const UNKNOWN_CREATOR = "invite-unknown-creator-0001";
const RECOVERY_INVITE = "invite-recovery-needed-0002";
const EXPIRED_INVITE = "invite-expired-0003";

const BASE_TIME = Date.UTC(2026, 9, 1, 9, 0, 0);

function fixtureInvites(): InviteFixture[] {
  return [
    {
      inviteId: UNKNOWN_CREATOR,
      clientEmail: null,
      submitterEmail: null,
      expiresAt: BASE_TIME + 14 * 24 * 60 * 60 * 1000,
      status: "unused",
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      submissionId: null,
      issueNumber: null,
      recoveryRequired: false,
      recoveryAttempts: 0,
    },
    {
      inviteId: RECOVERY_INVITE,
      clientEmail: "client@example.test",
      submitterEmail: "submitter@example.test",
      expiresAt: BASE_TIME + 14 * 24 * 60 * 60 * 1000,
      status: "consumed",
      createdAt: BASE_TIME - 60_000,
      updatedAt: BASE_TIME - 30_000,
      submissionId: "submission-recovery",
      issueNumber: 12001,
      recoveryRequired: true,
      recoveryAttempts: 3,
    },
    {
      inviteId: EXPIRED_INVITE,
      clientEmail: "expired@example.test",
      submitterEmail: null,
      expiresAt: BASE_TIME - 60_000,
      status: "expired",
      createdAt: BASE_TIME - 120_000,
      updatedAt: BASE_TIME - 60_000,
      submissionId: null,
      issueNumber: null,
      recoveryRequired: false,
      recoveryAttempts: 0,
    },
  ];
}

let browser: Browser;
let server: http.Server;
let origin = "";
let assetsDirectory = "";
let invites: InviteFixture[] = [];
let requests: RecordedRequest[] = [];
let createMode: "success" | "unavailable" = "success";
let createDelay = 0;
let createCount = 0;
let backfilled = 0;

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

async function readBody(
  request: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
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

function assetContentType(file: string) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

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

  if (pathname !== "/api/admin/onboarding-invites") {
    sendText(response, "Not found", 404);
    return;
  }

  const body = request.method === "POST" ? await readBody(request) : null;
  requests.push({
    method: request.method || "GET",
    path: pathname,
    body,
    origin: String(request.headers.origin || ""),
  });

  if (request.method === "GET") {
    sendJson(response, { invites });
    return;
  }

  if (request.method !== "POST") {
    sendText(response, "Method not allowed", 405);
    return;
  }

  const action = String(body?.action || "");

  if (action === "create") {
    createCount += 1;
    if (createDelay)
      await new Promise((resolve) => setTimeout(resolve, createDelay));
    if (createMode === "unavailable") {
      sendJson(
        response,
        {
          error: {
            code: "unavailable",
            message: "Invite management is temporarily unavailable.",
          },
        },
        503,
      );
      return;
    }
    const clientEmail =
      typeof body?.clientEmail === "string" ? body.clientEmail : null;
    const invite: InviteFixture = {
      inviteId: `invite-created-${String(createCount).padStart(4, "0")}`,
      clientEmail,
      submitterEmail: null,
      expiresAt: BASE_TIME + 14 * 24 * 60 * 60 * 1000,
      status: "unused",
      createdAt: BASE_TIME + createCount,
      updatedAt: BASE_TIME + createCount,
      submissionId: null,
      issueNumber: null,
      recoveryRequired: false,
      recoveryAttempts: 0,
    };
    invites = [invite, ...invites];
    sendJson(
      response,
      {
        inviteId: invite.inviteId,
        clientEmail,
        expiresAt: invite.expiresAt,
        url: `https://onboard.example.test/onboard/#invite=secret-token-${createCount}`,
      },
      201,
    );
    return;
  }

  if (action === "revoke") {
    const invite = invites.find((item) => item.inviteId === body?.inviteId);
    if (!invite || invite.status !== "unused") {
      sendJson(
        response,
        { error: "Invitation cannot be revoked." },
        409,
      );
      return;
    }
    invite.status = "revoked";
    invite.updatedAt = BASE_TIME + 5_000;
    sendJson(response, { ok: true });
    return;
  }

  if (action === "backfill") {
    backfilled += 2;
    const missing = invites.find((item) => !item.clientEmail);
    if (missing) missing.submitterEmail = "backfilled@example.test";
    sendJson(response, { ok: true, backfilled: 2, remaining: 1 });
    return;
  }

  if (action === "recover-intake") {
    if (body?.confirmed !== true) {
      sendJson(
        response,
        {
          error:
            "Confirm that you reviewed the original issue and its intake details.",
          code: "recovery_confirmation_required",
        },
        400,
      );
      return;
    }
    sendJson(response, {
      ok: true,
      issue: body.issueNumber,
      duplicate: false,
    });
    return;
  }

  sendJson(response, { error: "Unknown action." }, 400);
}

beforeAll(async () => {
  assetsDirectory = await mkdtemp(
    path.join(tmpdir(), "launchloom-admin-invite-"),
  );
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
  invites = fixtureInvites();
  requests = [];
  createMode = "success";
  createDelay = 0;
  createCount = 0;
  backfilled = 0;
});

type OpenOptions = {
  viewport?: { width: number; height: number };
  path?: string;
  initScript?: string;
};

async function openPage(options: OpenOptions = {}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1512, height: 960 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const errors: string[] = [];
  const messages: string[] = [];
  page.on("console", (message) => {
    messages.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  if (options.initScript) await page.addInitScript(options.initScript);
  await page.goto(
    `${origin}${options.path || "/admin/onboarding-invites?view=invitations"}`,
    { waitUntil: "domcontentloaded" },
  );
  return { page, errors, messages };
}

async function visible(locator: Locator, timeout = 8_000) {
  await locator.waitFor({ state: "visible", timeout });
}

async function waitForInvitations(page: Page) {
  await visible(page.getByText("3 invitations", { exact: true }));
}

function rowFor(page: Page, inviteId: string) {
  return page.locator("tr", {
    has: page.locator(`[title="${inviteId}"]`),
  });
}

function posts(action: string) {
  return requests.filter(
    (entry) => entry.method === "POST" && entry.body?.action === action,
  );
}

function unexpectedErrors(errors: string[], allow503 = false) {
  const unexpected = allow503
    ? errors.filter(
        (error) => !/Failed to load resource: .*503 \(Service Unavailable\)/u.test(error),
      )
    : errors;
  expect(unexpected).toEqual([]);
}

async function storedKeys(page: Page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookies: document.cookie,
  }));
}

describe("real invitation flows against the built admin bundle", () => {
  it("lists real invitations with status, expiry and honest creator attribution", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      expect(await page.locator("#invitations-view tbody tr").count()).toBe(3);

      const unknown = rowFor(page, UNKNOWN_CREATOR);
      await expect(unknown.getByText("Not recorded", { exact: true }).count())
        .resolves.toBeGreaterThan(0);
      await expect(unknown.getByText("Unused", { exact: true }).count())
        .resolves.toBe(1);
      await expect(
        rowFor(page, EXPIRED_INVITE)
          .getByText("Expired", { exact: true })
          .count(),
      ).resolves.toBe(1);
      await expect(
        rowFor(page, RECOVERY_INVITE)
          .getByText("Intake recovery needed", { exact: true })
          .count(),
      ).resolves.toBe(1);
      await expect(
        rowFor(page, RECOVERY_INVITE)
          .getByText("Consumed", { exact: true })
          .count(),
      ).resolves.toBe(1);
      const expiredText = await rowFor(page, EXPIRED_INVITE).innerText();
      expect(expiredText).toContain("01 Oct 2026");
      expect(await page.getByText(/The coordinator returns at most 100/u).count())
        .toBe(1);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("creates one invitation, copies the link once and never persists it", async () => {
    const { page, errors, messages } = await openPage();
    try {
      await waitForInvitations(page);
      await page.getByLabel("Client email (optional)").fill("new@example.test");
      await page.getByRole("button", { name: "Create invitation" }).click();
      const result = page.locator(".admin-invite-result");
      await visible(result);
      await expect(result.getByLabel("New invitation link").inputValue())
        .resolves.toBe(
          "https://onboard.example.test/onboard/#invite=secret-token-1",
        );
      expect(posts("create")).toHaveLength(1);
      expect(posts("create")[0].body).toEqual({
        action: "create",
        clientEmail: "new@example.test",
      });
      expect(posts("create")[0].body).not.toHaveProperty("creator");
      expect(posts("create")[0].body).not.toHaveProperty("actor");
      expect(posts("create")[0].origin).toBe(origin);

      await result.getByRole("button", { name: "Copy link" }).click();
      await visible(page.getByText("Copied to clipboard.", { exact: false }));
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(
          "https://onboard.example.test/onboard/#invite=secret-token-1",
        );

      expect(await storedKeys(page)).toEqual({
        local: [],
        session: [],
        cookies: "",
      });
      expect(page.url()).not.toContain("#invite=");
      expect(page.url()).not.toContain("secret-token");
      expect(
        [...messages, ...errors].some((entry) => entry.includes("secret-token")),
      ).toBe(false);
      expect(
        requests.some((entry) => entry.path.includes("secret-token")),
      ).toBe(false);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("creates an unbound invitation when no client email is provided", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      await page.getByRole("button", { name: "Create invitation" }).click();
      const result = page.locator(".admin-invite-result");
      await visible(result);
      expect(posts("create")).toHaveLength(1);
      expect(posts("create")[0].body).toEqual({ action: "create" });
      await expect(
        result.getByText("Not bound to a client email.", { exact: false }).count(),
      ).resolves.toBe(1);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the one-time result and explains manual copy when the clipboard fails", async () => {
    const { page, errors } = await openPage({
      initScript: `Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("blocked")) }
      });`,
    });
    try {
      await waitForInvitations(page);
      await page.getByRole("button", { name: "Create invitation" }).click();
      const result = page.locator(".admin-invite-result");
      await visible(result);
      await result.getByRole("button", { name: "Copy link" }).click();
      await visible(
        page.getByText(
          "Copy failed. Select the link above and copy it manually.",
          { exact: false },
        ),
      );
      await expect(result.getByLabel("New invitation link").inputValue())
        .resolves.toContain("#invite=secret-token-1");
      expect(posts("create")).toHaveLength(1);
      expect(await storedKeys(page)).toEqual({
        local: [],
        session: [],
        cookies: "",
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("does not silently create a second invitation after an ambiguous failure", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      createMode = "unavailable";
      await page.getByRole("button", { name: "Create invitation" }).click();
      await visible(
        page.getByText(
          "The invitation was not confirmed. The server may still have created one",
          { exact: false },
        ),
      );
      expect(posts("create")).toHaveLength(1);
      const button = page.getByRole("button", {
        name: "Creation unconfirmed",
      });
      await expect(button.isDisabled()).resolves.toBe(true);
      await page.getByRole("button", {
        name: "Check invitation list before retrying",
      }).click();
      await waitForInvitations(page);
      expect(posts("create")).toHaveLength(1);
      expect(posts("create").length).toBe(1);
      unexpectedErrors(errors, true);
    } finally {
      await page.close();
    }
  });

  it("sends one create request for a rapid double click", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      createDelay = 400;
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find(
          (entry) => entry.textContent?.trim() === "Create invitation",
        );
        if (!(button instanceof HTMLButtonElement))
          throw new Error("create button missing");
        button.click();
        button.click();
      });
      await visible(page.locator(".admin-invite-result"));
      expect(posts("create")).toHaveLength(1);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("revokes an unused invitation only after contextual confirmation", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      const row = rowFor(page, UNKNOWN_CREATOR);
      await row.getByRole("button", { name: "Revoke" }).click();
      await visible(row.getByText("Revoke this unused link?", { exact: true }));
      expect(posts("revoke")).toHaveLength(0);
      await row.getByRole("button", { name: "Keep invitation" }).click();
      expect(posts("revoke")).toHaveLength(0);
      await row.getByRole("button", { name: "Revoke" }).click();
      await row.getByRole("button", { name: "Confirm revoke" }).click();
      await visible(
        page.getByText(
          "Invitation revoked. Unused links can no longer be used.",
          { exact: true },
        ),
      );
      expect(posts("revoke")).toHaveLength(1);
      expect(posts("revoke")[0].body).toEqual({
        action: "revoke",
        inviteId: UNKNOWN_CREATOR,
      });
      await expect
        .poll(() =>
          rowFor(page, UNKNOWN_CREATOR).getByText("Revoked", { exact: true }).count(),
        )
        .toBe(1);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("backfills client emails and reports what remains", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      await page.getByRole("button", { name: "Backfill client emails" }).click();
      await visible(page.getByText("Backfill finished.", { exact: false }));
      expect(posts("backfill")).toHaveLength(1);
      expect(posts("backfill")[0].body).toEqual({ action: "backfill" });
      await expect(
        page.getByText("Updated 2 invitations. 1 still missing a client email.", {
          exact: true,
        }).count(),
      ).resolves.toBe(1);
      expect(backfilled).toBe(2);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("requires a reviewed issue number and explicit confirmation for recovery", async () => {
    const { page, errors } = await openPage();
    try {
      await waitForInvitations(page);
      const submit = page.getByRole("button", { name: "Record recovery" });
      await expect(submit.isDisabled()).resolves.toBe(true);
      await page.getByLabel("Invitation requiring recovery").selectOption(
        RECOVERY_INVITE,
      );
      await page.getByLabel("Reviewed issue number").fill("12001");
      await expect(submit.isDisabled()).resolves.toBe(true);
      await page.getByLabel(/I reviewed the original issue/u).check();
      await expect(submit.isEnabled()).resolves.toBe(true);
      await submit.click();
      await visible(
        page.getByText("Recovery recorded for issue #12001.", {
          exact: true,
        }),
      );
      expect(posts("recover-intake")).toHaveLength(1);
      expect(posts("recover-intake")[0].body).toEqual({
        action: "recover-intake",
        inviteId: RECOVERY_INVITE,
        issueNumber: 12001,
        confirmed: true,
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the invitation surfaces keyboard reachable and free of body overflow on mobile", async () => {
    const { page, errors } = await openPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await waitForInvitations(page);
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);
      const tableScroll = await page
        .locator(".admin-table-wrap")
        .evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
      expect(tableScroll.scrollWidth).toBeGreaterThan(tableScroll.clientWidth);

      await page.getByLabel("Client email (optional)").focus();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() => document.activeElement?.textContent?.trim()),
        )
        .toBe("Create invitation");
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });
});
