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
import { buildAdminWorkspace } from "../scripts/build-admin-workspace.mjs";

vi.setConfig({ testTimeout: 30_000 });

const ACCESS_PRINCIPAL = {
  id: `access:${"ab".repeat(32)}`,
  email: "admin@example.test",
  displayName: null,
  role: "admin",
  authSource: "cloudflare-access",
} as const;

type Member = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin";
  authSource: "neon";
  active: boolean;
  createdAt: number;
  updatedAt: number;
  initials: string;
  avatarKey: string | null;
};

const OWNER: Member = {
  id: "subject-owner",
  email: "dev-owner@launchloom.test",
  displayName: "Dev Owner",
  role: "owner" as const,
  authSource: "neon" as const,
  active: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  initials: "DO",
  avatarKey: null,
};

const ADMIN: Member = {
  id: "subject-admin",
  email: "admin@launchloom.test",
  displayName: "Amara Admin",
  role: "admin" as const,
  authSource: "neon" as const,
  active: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  initials: "AA",
  avatarKey: null,
};

const ENROLLMENT_TOKEN = "e".repeat(43);
const RETURN_TO = "/admin/onboarding-invites?view=settings";

type RecordedRequest = {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
};

let browser: Browser;
let server: http.Server;
let origin = "";
let assetsDirectory = "";
let requests: RecordedRequest[] = [];
let neonMode = false;
let signedIn = false;
let nonmemberSession = false;
let currentRole: "owner" | "admin" = "owner";
let members: Member[] = [];
let meMode: "success" | "unavailable" | "malformed" | "signed_out" = "success";
let signInMode: "success" | "invalid" | "unavailable" | "unverified" =
  "success";
let signInMessage = "Invalid email or password.";
let acceptMode: "success" | "mismatch" | "unavailable" | "used" | "unverified" =
  "success";
let createMode: "success" | "unavailable" = "success";
let changeMode: "success" | "last_owner" = "success";
let profileMode: "success" | "invalid" = "success";
let passwordMode: "success" | "invalid" | "unavailable" = "success";

function sendJson(response: http.ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
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

function shell(mode: "workspace" | "login") {
  const fallback =
    mode === "login"
      ? `<main class="admin-fallback"><h1>LaunchLoom admin</h1><p>Sign in with your approved admin account.</p></main>`
      : `<main class="admin-fallback"><h1>Operations workspace</h1><p>Loading the workspace shell...</p></main>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LaunchLoom operations</title>
<link rel="stylesheet" href="/admin-assets/app.css">
</head>
<body class="admin-page" data-admin-view="${mode}">
<div id="admin-root">${fallback}</div>
<script type="module" src="/admin-assets/app.js"></script>
</body>
</html>`;
}

function assetContentType(file: string) {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function currentMember(): Member {
  return currentRole === "owner" ? OWNER : ADMIN;
}

async function readBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
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
    sendText(response, shell("workspace"), 200, "text/html; charset=utf-8");
    return;
  }
  if (pathname === "/admin/login") {
    sendText(response, shell("login"), 200, "text/html; charset=utf-8");
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

  if (!pathname.startsWith("/api/admin/onboarding-invites/")) {
    sendText(response, "Not found", 404);
    return;
  }

  const body = await readBody(request);
  requests.push({ method: request.method || "GET", path: pathname, body });

  if (pathname.startsWith("/api/admin/onboarding-invites/auth/")) {
    const route = pathname.slice("/api/admin/onboarding-invites/auth/".length);
    if (request.method !== "POST" && route !== "verify-email") {
      sendText(response, "Method not allowed", 405);
      return;
    }
    if (route === "sign-in/email") {
      if (signInMode === "invalid") {
        sendJson(response, errorBody("auth_failed", signInMessage), 401);
        return;
      }
      if (signInMode === "unavailable") {
        sendJson(
          response,
          errorBody(
            "dependency_unavailable",
            "Sign-in is temporarily unavailable.",
          ),
          503,
        );
        return;
      }
      signedIn = true;
      sendJson(response, {
        ok: true,
        user: {
          id: currentMember().id,
          email: currentMember().email,
          emailVerified: signInMode !== "unverified",
          name: currentMember().displayName,
        },
        session: { expiresAt: Date.now() + 3_600_000 },
      });
      return;
    }
    if (route === "sign-out") {
      signedIn = false;
      sendJson(response, { ok: true, user: null, session: null });
      return;
    }
    if (route === "request-password-reset" || route === "forget-password") {
      sendJson(response, { ok: true, user: null, session: null });
      return;
    }
    if (route === "reset-password") {
      sendJson(response, { ok: true });
      return;
    }
    if (route === "change-password") {
      if (!signedIn) {
        sendJson(response, errorBody("signed_out", "Sign in required."), 401);
        return;
      }
      if (passwordMode === "invalid") {
        sendJson(response, errorBody("auth_failed", "Invalid password."), 401);
        return;
      }
      if (passwordMode === "unavailable") {
        sendJson(
          response,
          errorBody(
            "dependency_unavailable",
            "Password change is temporarily unavailable.",
          ),
          503,
        );
        return;
      }
      sendJson(response, { ok: true, user: null, session: null });
      return;
    }
    if (route === "verify-email") {
      sendJson(response, { ok: true, user: null, session: null });
      return;
    }
    sendJson(response, errorBody("not_found", "Not found."), 404);
    return;
  }

  if (pathname.endsWith("/workspace/attempts")) {
    sendJson(response, { items: [], nextCursor: null, total: 0 });
    return;
  }

  if (pathname.endsWith("/workspace/health")) {
    sendJson(response, {
      lastSyncAt: null,
      coverageStart: null,
      partial: false,
      lastError: null,
      pendingProjectionCount: 0,
    });
    return;
  }

  if (pathname.endsWith("/workspace/me")) {
    if (!neonMode) {
      if (meMode === "unavailable") {
        sendJson(
          response,
          errorBody(
            "not_enabled",
            "Persistent account profiles are not enabled.",
          ),
          503,
        );
        return;
      }
      if (meMode === "malformed") {
        sendJson(response, { principal: { id: "forged", email: "forged@x" } });
        return;
      }
      if (request.method !== "GET") {
        sendText(response, "Method not allowed", 405);
        return;
      }
      sendJson(response, { principal: ACCESS_PRINCIPAL });
      return;
    }
    if (meMode === "signed_out" || !signedIn) {
      sendJson(response, errorBody("signed_out", "Sign in required."), 401);
      return;
    }
    if (nonmemberSession) {
      sendJson(response, errorBody("forbidden", "Access denied."), 403);
      return;
    }
    if (meMode === "unavailable") {
      sendJson(
        response,
        errorBody(
          "dependency_unavailable",
          "Account profile is temporarily unavailable.",
        ),
        503,
      );
      return;
    }
    if (request.method === "PATCH") {
      if (profileMode === "invalid") {
        sendJson(
          response,
          errorBody("invalid", "Display name must be 1 to 100 characters."),
          400,
        );
        return;
      }
      const displayName =
        typeof body?.displayName === "string"
          ? body.displayName.trim()
          : currentMember().displayName;
      const avatarKey =
        typeof body?.avatarKey === "string" && body.avatarKey.trim()
          ? body.avatarKey.trim()
          : null;
      members = members.map((member) =>
        member.id === currentMember().id
          ? {
              ...member,
              displayName,
              avatarKey,
              initials: displayName.slice(0, 2).toUpperCase(),
            }
          : member,
      );
      sendJson(response, {
        principal: members.find((m) => m.id === currentMember().id),
      });
      return;
    }
    sendJson(response, { principal: currentMember() });
    return;
  }

  if (pathname.endsWith("/workspace/team")) {
    if (!neonMode || meMode === "signed_out" || !signedIn) {
      sendJson(response, errorBody("signed_out", "Sign in required."), 401);
      return;
    }
    sendJson(response, { members: members.filter((member) => member.active) });
    return;
  }

  if (pathname.endsWith("/workspace/team/enrollments")) {
    if (request.method !== "POST") {
      sendText(response, "Method not allowed", 405);
      return;
    }
    if (createMode === "unavailable") {
      sendJson(
        response,
        errorBody(
          "dependency_unavailable",
          "Enrollment is temporarily unavailable.",
        ),
        503,
      );
      return;
    }
    sendJson(
      response,
      {
        enrollment: {
          id: "enrollment-1",
          url: `/admin/login#enroll=${ENROLLMENT_TOKEN}`,
          expiresAt: Date.now() + 72 * 60 * 60 * 1000,
        },
      },
      201,
    );
    return;
  }

  const change = /\/workspace\/team\/([^/]+)$/u.exec(pathname);
  if (change && request.method === "PATCH") {
    if (changeMode === "last_owner") {
      sendJson(
        response,
        errorBody("last_owner", "At least one active owner is required."),
        409,
      );
      return;
    }
    const target = decodeURIComponent(change[1]);
    members = members.map((member) => {
      if (member.id !== target) return member;
      if (body?.active === false) return { ...member, active: false };
      if (body?.role === "owner" || body?.role === "admin")
        return { ...member, role: body.role };
      return member;
    });
    const updated = members.find((member) => member.id === target);
    sendJson(response, { member: updated });
    return;
  }

  if (pathname.endsWith("/workspace/enrollments/accept")) {
    if (!signedIn) {
      sendJson(response, errorBody("signed_out", "Sign in required."), 401);
      return;
    }
    if (acceptMode === "mismatch") {
      sendJson(
        response,
        errorBody(
          "email_mismatch",
          "This invitation belongs to a different verified email.",
        ),
        403,
      );
      return;
    }
    if (acceptMode === "used") {
      sendJson(
        response,
        errorBody("enrollment_used", "This invitation has already been used."),
        409,
      );
      return;
    }
    if (acceptMode === "unverified") {
      sendJson(
        response,
        errorBody("email_unverified", "Verify your email before continuing."),
        403,
      );
      return;
    }
    if (acceptMode === "unavailable") {
      sendJson(
        response,
        errorBody(
          "dependency_unavailable",
          "Enrollment acceptance is temporarily unavailable.",
        ),
        503,
      );
      return;
    }
    signedIn = true;
    nonmemberSession = false;
    sendJson(response, {
      principal: {
        id: "subject-invitee",
        email: "invitee@launchloom.test",
        displayName: "Invited Admin",
        role: "admin",
        authSource: "neon",
      },
    });
    return;
  }

  sendText(response, "Not found", 404);
}

beforeAll(async () => {
  assetsDirectory = await mkdtemp(
    path.join(tmpdir(), "launchloom-admin-account-"),
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
  requests = [];
  neonMode = false;
  signedIn = false;
  nonmemberSession = false;
  currentRole = "owner";
  members = [{ ...OWNER }, { ...ADMIN }];
  meMode = "success";
  signInMode = "success";
  signInMessage = "Invalid email or password.";
  acceptMode = "success";
  createMode = "success";
  changeMode = "success";
  profileMode = "success";
  passwordMode = "success";
});

async function openPage(options: {
  path: string;
  viewport?: { width: number; height: number };
  permissions?: boolean;
}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1512, height: 960 },
  });
  if (options.permissions)
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const errors: string[] = [];
  const pageRequests: string[] = [];
  const context = page.context();
  context.on("request", (request) => {
    pageRequests.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}${options.path}`, {
    waitUntil: "domcontentloaded",
  });
  return { page, errors, pageRequests };
}

async function visible(locator: Locator, timeout = 8_000) {
  await locator.waitFor({ state: "visible", timeout });
}

function unexpectedErrors(errors: string[], allow503 = false) {
  const unexpected = errors.filter((error) => {
    const resource = /Failed to load resource: .*status of (\d{3})/u.exec(
      error,
    );
    if (!resource) return true;
    const status = Number(resource[1]);
    if (status === 400 || status === 401 || status === 403 || status === 409)
      return false;
    if (status === 503) return !allow503;
    return true;
  });
  expect(unexpected).toEqual([]);
}

async function bodyOverflow(page: Page) {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
}

function bodyFor(method: string, suffix: string) {
  return requests.find(
    (request) => request.method === method && request.path.endsWith(suffix),
  )?.body;
}

function lastBodyFor(method: string, suffix: string) {
  return requests
    .filter(
      (request) => request.method === method && request.path.endsWith(suffix),
    )
    .at(-1)?.body;
}

function countRequests(suffix: string) {
  return requests.filter((request) => request.path.endsWith(suffix)).length;
}

describe("interim Access identity and unavailable account surfaces", () => {
  it("shows the real verified Access identity as a read-only interim profile", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      const email = page.getByLabel("Verified email address (read-only)");
      await visible(email);
      await expect(email.inputValue()).resolves.toBe(ACCESS_PRINCIPAL.email);
      await expect(email.isEditable()).resolves.toBe(false);
      await expect(
        page
          .getByText("Persistent account profiles are not enabled yet.", {
            exact: true,
          })
          .count(),
      ).resolves.toBe(1);
      await expect(
        page.getByText("Name not recorded", { exact: true }).count(),
      ).resolves.toBe(1);
      await expect(
        page.getByText("Administrator", { exact: true }).count(),
      ).resolves.toBe(1);
      await expect(
        page.getByText("Cloudflare Access", { exact: true }).count(),
      ).resolves.toBe(1);
      const rendered = await page.content();
      expect(rendered).not.toContain(ACCESS_PRINCIPAL.id);
      const fullHash = ACCESS_PRINCIPAL.id.slice("access:".length);
      expect(rendered).not.toContain(fullHash);
      expect(
        await page.getByText("Stable identity", { exact: true }).count(),
      ).toBe(0);
      const details = page.locator("details", {
        hasText: "Technical reference",
      });
      await expect(details.getAttribute("open")).resolves.toBeNull();
      await details.locator("summary").click();
      const reference = details.locator("[data-identity-reference]");
      await visible(reference);
      await expect(reference.textContent()).resolves.toBe("access:abababab");
      expect(requests).toEqual([
        {
          method: "GET",
          path: "/api/admin/onboarding-invites/workspace/me",
          body: null,
        },
      ]);
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] });
      expect(
        await page.getByText("Browser Admin", { exact: false }).count(),
      ).toBe(0);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows an honest unavailable state and never invents a profile", async () => {
    meMode = "unavailable";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      await visible(
        page.getByText("The verified account could not be loaded.", {
          exact: true,
        }),
      );
      expect(
        await page.getByText(ACCESS_PRINCIPAL.email, { exact: false }).count(),
      ).toBe(0);
      expect(
        await page.getByText("Name not recorded", { exact: true }).count(),
      ).toBe(0);
      expect(
        await page.getByText("Administrator", { exact: true }).count(),
      ).toBe(0);
      expect(await page.locator("#profile-email").count()).toBe(0);
      meMode = "success";
      await page.getByRole("button", { name: "Retry identity" }).click();
      await visible(page.getByLabel("Verified email address (read-only)"));
      unexpectedErrors(errors, true);
    } finally {
      await page.close();
    }
  });

  it("rejects a malformed identity response instead of rendering it", async () => {
    meMode = "malformed";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      await visible(
        page.getByText("The verified account could not be loaded.", {
          exact: true,
        }),
      );
      expect(await page.getByText("forged@x", { exact: false }).count()).toBe(
        0,
      );
      expect(
        await page.getByText("Name not recorded", { exact: true }).count(),
      ).toBe(0);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps team and account management explicitly unavailable", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(
        page.getByText("Administrator accounts are not configured yet", {
          exact: true,
        }),
      );
      expect(
        await page
          .getByText("No administrator members", { exact: false })
          .count(),
      ).toBe(1);
      expect(
        await page.getByText("No owner controls", { exact: false }).count(),
      ).toBe(1);
      expect(await page.getByRole("button").count()).toBe(0);
      expect(
        await page.getByText("Invite administrator", { exact: false }).count(),
      ).toBe(0);
      expect(
        await page.getByText(ACCESS_PRINCIPAL.email, { exact: false }).count(),
      ).toBe(0);
      expect(requests.map((request) => request.path)).toEqual([
        "/api/admin/onboarding-invites/workspace/me",
      ]);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the future GHL connection visibly inactive with zero third-party requests", async () => {
    const { page, errors, pageRequests } = await openPage({
      path: "/admin/onboarding-invites?view=integrations",
    });
    try {
      await visible(page.getByText("Not connected", { exact: true }));
      await expect(
        page.getByText("Not connected", { exact: true }).count(),
      ).resolves.toBe(1);
      await expect(
        page.getByText("Planned", { exact: true }).count(),
      ).resolves.toBe(1);
      const button = page.getByRole("button", {
        name: "Connection coming later",
      });
      await expect(button.isDisabled()).resolves.toBe(true);

      const external = pageRequests.filter((url) => {
        try {
          return new URL(url).origin !== origin;
        } catch {
          return true;
        }
      });
      expect(external).toEqual([]);
      expect(
        pageRequests.filter((url) =>
          /gohighlevel|leadconnector|ghl\./iu.test(url),
        ),
      ).toEqual([]);
      expect(requests).toEqual([]);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("stays keyboard usable and free of body overflow on mobile account surfaces", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
      viewport: { width: 390, height: 844 },
    });
    try {
      await visible(page.getByLabel("Verified email address (read-only)"));
      const metrics = await bodyOverflow(page);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);
      const settingsLink = await page
        .getByRole("link", { name: "Settings", exact: true })
        .boundingBox();
      expect(settingsLink).not.toBeNull();
      expect(settingsLink!.x).toBeGreaterThanOrEqual(0);
      expect(settingsLink!.x + settingsLink!.width).toBeLessThanOrEqual(390);

      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() => document.activeElement?.textContent?.trim()),
        )
        .toBe("Skip to main content");
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() => document.activeElement?.textContent?.trim()),
        )
        .toBe("Generations");

      await page.getByRole("link", { name: "Team", exact: true }).click();
      await visible(
        page.getByText("Administrator accounts are not configured yet", {
          exact: true,
        }),
      );
      const teamMetrics = await bodyOverflow(page);
      expect(teamMetrics.documentWidth).toBeLessThanOrEqual(
        teamMetrics.viewport,
      );

      await page
        .getByRole("link", { name: "Integrations", exact: true })
        .click();
      await visible(page.getByText("Not connected", { exact: true }));
      await page.setViewportSize({ width: 320, height: 720 });
      const compact = await bodyOverflow(page);
      expect(compact.documentWidth).toBeLessThanOrEqual(compact.viewport);
      expect(compact.bodyWidth).toBeLessThanOrEqual(compact.viewport);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });
});

describe("Neon account flows", () => {
  it("signs in with a real password contract and returns to the requested view", async () => {
    neonMode = true;
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}`,
    });
    try {
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      await page.getByLabel("Email address").fill(OWNER.email);
      await page.getByLabel("Password").fill("correct horse battery");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      await visible(page.getByLabel("Verified email address (read-only)"));
      await expect(
        page.getByLabel("Verified email address (read-only)").inputValue(),
      ).resolves.toBe(OWNER.email);
      expect(bodyFor("POST", "/auth/sign-in/email")).toEqual({
        email: OWNER.email,
        password: "correct horse battery",
      });
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows safe sign-in errors without navigating offsite", async () => {
    neonMode = true;
    signInMode = "invalid";
    signInMessage = "Continue at https://evil.test/steal";
    const { page, errors } = await openPage({ path: "/admin/login" });
    try {
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      await page.getByLabel("Email address").fill("wrong@example.test");
      await page.getByLabel("Password").fill("wrong-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await visible(
        page.getByText("The email or password did not match", {
          exact: false,
        }),
      );
      expect(
        await page
          .getByText("Continue at https://evil.test/steal", { exact: true })
          .count(),
      ).toBe(0);
      expect(new URL(page.url()).pathname).toBe("/admin/login");
      expect(await page.locator('a[href*="evil.test"]').count()).toBe(0);
      expect(await page.getByLabel("Email address").inputValue()).toBe(
        "wrong@example.test",
      );
      expect(countRequests("/auth/sign-in/email")).toBe(1);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("does not follow a malicious returnTo after sign-in", async () => {
    neonMode = true;
    for (const returnTo of [
      "https://evil.test/steal",
      "//evil.test/path",
      "/%5Cevil.test",
    ]) {
      signedIn = false;
      const { page, errors } = await openPage({
        path: `/admin/login?returnTo=${encodeURIComponent(returnTo)}`,
      });
      try {
        await page.getByLabel("Email address").fill(OWNER.email);
        await page.getByLabel("Password").fill("correct horse battery");
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page.waitForURL(
          (url) => url.pathname === "/admin/onboarding-invites",
        );
        const target = new URL(page.url());
        expect(target.origin).toBe(origin);
        expect(target.pathname).toBe("/admin/onboarding-invites");
        await visible(
          page.getByRole("heading", { name: "Generation history" }),
        );
        unexpectedErrors(errors);
      } finally {
        await page.close();
      }
    }
  }, 60_000);

  it("asks an unverified account to verify before continuing", async () => {
    neonMode = true;
    signInMode = "unverified";
    const { page, errors } = await openPage({ path: "/admin/login" });
    try {
      await page.getByLabel("Email address").fill(OWNER.email);
      await page.getByLabel("Password").fill("correct horse battery");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await visible(
        page.getByText("Verify your email before signing in.", {
          exact: false,
        }),
      );
      expect(new URL(page.url()).pathname).toBe("/admin/login");
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("requests a password reset without revealing whether the account exists", async () => {
    neonMode = true;
    const { page, errors } = await openPage({ path: "/admin/login" });
    try {
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      await page.getByRole("button", { name: "Forgot your password?" }).click();
      await page.getByLabel("Email address").fill(OWNER.email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await visible(
        page.getByText("If that email has an account", { exact: false }),
      );
      expect(bodyFor("POST", "/auth/request-password-reset")).toEqual({
        email: OWNER.email,
        redirectTo: "/admin/login",
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("redeems an emailed reset token once and scrubs it from the browser", async () => {
    neonMode = true;
    const resetToken = "r".repeat(43);
    const { page, errors } = await openPage({
      path: `/admin/login?token=${resetToken}`,
    });
    try {
      await visible(page.getByLabel("New password", { exact: true }));
      expect(page.url()).not.toContain(resetToken);
      expect(countRequests("/workspace/me")).toBe(0);
      await page
        .getByLabel("New password", { exact: true })
        .fill("brand new password value");
      await page
        .getByLabel("Confirm new password")
        .fill("brand new password value");
      await page.getByRole("button", { name: "Save new password" }).click();
      await visible(page.getByText("Password reset.", { exact: false }));
      expect(bodyFor("POST", "/auth/reset-password")).toEqual({
        token: resetToken,
        newPassword: "brand new password value",
      });
      expect(page.url()).not.toContain(resetToken);
      const state = await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        content: document.documentElement.innerHTML,
      }));
      expect(state.local).toEqual([]);
      expect(state.session).toEqual([]);
      expect(state.content).not.toContain(resetToken);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("accepts a fragment enrollment once, scrubs it and stores nothing", async () => {
    neonMode = true;
    const { page, errors, pageRequests } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
    });
    try {
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      expect(page.url()).not.toContain(ENROLLMENT_TOKEN);
      expect(page.url()).not.toContain("enrollment=");
      expect(pageRequests.some((url) => url.includes(ENROLLMENT_TOKEN))).toBe(
        false,
      );
      await page.getByLabel("Email address").fill(OWNER.email);
      await page.getByLabel("Password").fill("correct horse battery");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      await visible(page.getByLabel("Verified email address (read-only)"));
      expect(bodyFor("POST", "/workspace/enrollments/accept")).toEqual({
        token: ENROLLMENT_TOKEN,
      });
      expect(
        requests.every((request) => !request.path.includes(ENROLLMENT_TOKEN)),
      ).toBe(true);
      const state = await page.evaluate(() => ({
        href: window.location.href,
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        history: JSON.stringify(window.history.state || {}),
        content: document.documentElement.innerHTML,
      }));
      expect(state.href).not.toContain(ENROLLMENT_TOKEN);
      expect(state.local).toEqual([]);
      expect(state.session).toEqual([]);
      expect(state.history).not.toContain(ENROLLMENT_TOKEN);
      expect(state.content).not.toContain(ENROLLMENT_TOKEN);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("still accepts a legacy query enrollment and scrubs it", async () => {
    neonMode = true;
    const { page, errors } = await openPage({
      path: `/admin/login?enrollment=${ENROLLMENT_TOKEN}&returnTo=${encodeURIComponent(RETURN_TO)}`,
    });
    try {
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      expect(page.url()).not.toContain(ENROLLMENT_TOKEN);
      await page.getByLabel("Email address").fill(OWNER.email);
      await page.getByLabel("Password").fill("correct horse battery");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      expect(bodyFor("POST", "/workspace/enrollments/accept")).toEqual({
        token: ENROLLMENT_TOKEN,
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("accepts directly for a verified nonmember session", async () => {
    neonMode = true;
    signedIn = true;
    nonmemberSession = true;
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
    });
    try {
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      await visible(page.getByLabel("Verified email address (read-only)"));
      expect(countRequests("/auth/sign-in/email")).toBe(0);
      const acceptIndex = requests.findIndex((request) =>
        request.path.endsWith("/workspace/enrollments/accept"),
      );
      const meIndex = requests.findIndex((request) =>
        request.path.endsWith("/workspace/me"),
      );
      expect(acceptIndex).toBeGreaterThanOrEqual(0);
      expect(meIndex).toBeGreaterThan(acceptIndex);
      expect(bodyFor("POST", "/workspace/enrollments/accept")).toEqual({
        token: ENROLLMENT_TOKEN,
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("offers an unverified email retry without gating on workspace membership", async () => {
    neonMode = true;
    signedIn = true;
    nonmemberSession = true;
    acceptMode = "unverified";
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
    });
    try {
      await visible(page.getByText("Email not verified", { exact: true }));
      expect(countRequests("/workspace/me")).toBe(0);
      expect(countRequests("/workspace/enrollments/accept")).toBe(1);
      acceptMode = "success";
      await page
        .getByRole("button", { name: "Check verification again" })
        .click();
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      expect(countRequests("/workspace/enrollments/accept")).toBe(2);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("accepts directly when a workspace session already exists", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
    });
    try {
      await page.waitForURL(
        (url) => url.pathname === "/admin/onboarding-invites",
      );
      await visible(page.getByLabel("Verified email address (read-only)"));
      expect(countRequests("/auth/sign-in/email")).toBe(0);
      expect(bodyFor("POST", "/workspace/enrollments/accept")).toEqual({
        token: ENROLLMENT_TOKEN,
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("does not retry an ambiguous enrollment claim", async () => {
    neonMode = true;
    signedIn = true;
    acceptMode = "unavailable";
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
      viewport: { width: 390, height: 844 },
    });
    try {
      await visible(
        page.getByText("Invitation not confirmed", { exact: true }),
      );
      expect(countRequests("/workspace/enrollments/accept")).toBe(1);
      expect(
        await page.getByRole("button", { name: /retry|try again/iu }).count(),
      ).toBe(0);
      await page.waitForTimeout(300);
      expect(countRequests("/workspace/enrollments/accept")).toBe(1);
      expect(page.url()).not.toContain(ENROLLMENT_TOKEN);
      const metrics = await bodyOverflow(page);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
      unexpectedErrors(errors, true);
    } finally {
      await page.close();
    }
  });

  it("explains an invitation email mismatch and offers a different account", async () => {
    neonMode = true;
    signedIn = true;
    acceptMode = "mismatch";
    const { page, errors } = await openPage({
      path: `/admin/login?returnTo=${encodeURIComponent(RETURN_TO)}#enroll=${ENROLLMENT_TOKEN}`,
    });
    try {
      await visible(page.getByText("Different email address", { exact: true }));
      await visible(
        page.getByText("belongs to a different verified email", {
          exact: false,
        }),
      );
      await visible(
        page.getByRole("button", { name: "Try a different account" }),
      );
      expect(countRequests("/workspace/enrollments/accept")).toBe(1);
      expect(page.url()).not.toContain(ENROLLMENT_TOKEN);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("lets an owner create, copy and dismiss a one-time enrollment link", async () => {
    neonMode = true;
    signedIn = true;
    const expectedLink = `${origin}/admin/login#enroll=${ENROLLMENT_TOKEN}`;
    const { page, errors, pageRequests } = await openPage({
      path: "/admin/onboarding-invites?view=team",
      permissions: true,
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      await page
        .getByLabel("Invitation email")
        .fill("new-admin@launchloom.test");
      await page
        .getByRole("button", { name: "Create enrollment link" })
        .click();
      const link = page.getByLabel("One-time enrollment link");
      await visible(link);
      await expect(link.inputValue()).resolves.toBe(expectedLink);
      expect(bodyFor("POST", "/team/enrollments")).toEqual({
        email: "new-admin@launchloom.test",
      });
      await page
        .getByRole("button", { name: "Copy link", exact: true })
        .click();
      await visible(page.getByText("Copied to clipboard", { exact: false }));
      await expect(
        page.evaluate(() => navigator.clipboard.readText()),
      ).resolves.toBe(expectedLink);
      expect(pageRequests.some((url) => url.includes(ENROLLMENT_TOKEN))).toBe(
        false,
      );
      expect(
        requests.every((request) => !request.path.includes(ENROLLMENT_TOKEN)),
      ).toBe(true);
      await page.getByRole("button", { name: "Create another link" }).click();
      await expect(
        page.getByLabel("One-time enrollment link").count(),
      ).resolves.toBe(0);
      await expect(
        page
          .getByRole("button", { name: "Create enrollment link" })
          .isEnabled(),
      ).resolves.toBe(true);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps the one-time link when clipboard copy fails and requires manual acknowledgement", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      await page
        .getByLabel("Invitation email")
        .fill("new-admin@launchloom.test");
      await page
        .getByRole("button", { name: "Create enrollment link" })
        .click();
      const link = page.getByLabel("One-time enrollment link");
      await visible(link);
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: () => Promise.reject(new Error("clipboard denied")),
          },
        });
      });
      await page
        .getByRole("button", { name: "Copy link", exact: true })
        .click();
      await visible(page.getByText("Copy failed.", { exact: false }));
      await expect(link.isVisible()).resolves.toBe(true);
      await page.getByRole("button", { name: "I copied this link" }).click();
      await visible(page.getByText("Marked as copied.", { exact: false }));
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("blocks another enrollment attempt after an ambiguous create", async () => {
    neonMode = true;
    signedIn = true;
    createMode = "unavailable";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      await page
        .getByLabel("Invitation email")
        .fill("new-admin@launchloom.test");
      await page
        .getByRole("button", { name: "Create enrollment link" })
        .click();
      await visible(
        page.getByText("Enrollment not confirmed", { exact: true }),
      );
      expect(countRequests("/team/enrollments")).toBe(1);
      await expect(
        page
          .getByRole("button", { name: "Create enrollment link" })
          .isDisabled(),
      ).resolves.toBe(true);
      await page
        .getByRole("button", { name: "I understand, allow another attempt" })
        .click();
      await expect(
        page
          .getByRole("button", { name: "Create enrollment link" })
          .isEnabled(),
      ).resolves.toBe(true);
      expect(countRequests("/team/enrollments")).toBe(1);
      unexpectedErrors(errors, true);
    } finally {
      await page.close();
    }
  });

  it("lets an owner change roles and deactivate a non-last owner", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      await page.getByLabel("Role for Amara Admin").selectOption("owner");
      await visible(
        page.getByText("Change Amara Admin to Owner?", { exact: true }),
      );
      await page.getByRole("button", { name: "Confirm change" }).click();
      await visible(
        page.getByText("Amara Admin is now owner.", { exact: true }),
      );
      expect(bodyFor("PATCH", "/team/subject-admin")).toEqual({
        role: "owner",
      });

      await page
        .getByRole("button", { name: "Deactivate Amara Admin" })
        .click();
      await visible(
        page.getByText(
          "Deactivate Amara Admin? They lose workspace access immediately.",
          {
            exact: true,
          },
        ),
      );
      await page.getByRole("button", { name: "Confirm change" }).click();
      await visible(
        page.getByText("Amara Admin was deactivated", { exact: false }),
      );
      await expect(
        page.getByText("Amara Admin", { exact: true }).count(),
      ).resolves.toBe(0);
      expect(lastBodyFor("PATCH", "/team/subject-admin")).toEqual({
        active: false,
      });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("shows the server last-owner protection instead of pretending success", async () => {
    neonMode = true;
    signedIn = true;
    changeMode = "last_owner";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      await page.getByRole("button", { name: "Deactivate Dev Owner" }).click();
      await page.getByRole("button", { name: "Confirm change" }).click();
      await visible(
        page.getByText("At least one active owner is required.", {
          exact: true,
        }),
      );
      await visible(page.getByRole("button", { name: "Confirm change" }));
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("keeps team controls read-only for an admin", async () => {
    neonMode = true;
    signedIn = true;
    currentRole = "admin";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
    });
    try {
      await visible(
        page.getByText("Only an owner can change membership", { exact: false }),
      );
      await expect(
        page.getByText("2 active members", { exact: true }).count(),
      ).resolves.toBe(1);
      await expect(page.getByLabel("Invitation email").count()).resolves.toBe(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Create enrollment link" }).count(),
      ).resolves.toBe(0);
      await expect(
        page.getByRole("button", { name: /^Deactivate/ }).count(),
      ).resolves.toBe(0);
      await expect(
        page.locator('select[id^="member-role-"]').count(),
      ).resolves.toBe(0);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("saves the real display name and shows server errors", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      const name = page.getByLabel("Display name");
      await visible(name);
      await expect(name.inputValue()).resolves.toBe(OWNER.displayName);
      await expect(
        page.getByLabel("Verified email address (read-only)").inputValue(),
      ).resolves.toBe(OWNER.email);
      await expect(
        page.getByText("Neon account", { exact: true }).count(),
      ).resolves.toBe(1);
      await expect(
        page.getByText("Owner", { exact: true }).count(),
      ).resolves.toBe(1);
      await name.fill("Avery Owner");
      await page.getByLabel("Avatar key (optional)").fill("sage-circle");
      await page.getByRole("button", { name: "Save profile" }).click();
      await visible(page.getByText("Profile saved.", { exact: false }));
      expect(bodyFor("PATCH", "/workspace/me")).toEqual({
        displayName: "Avery Owner",
        avatarKey: "sage-circle",
      });

      profileMode = "invalid";
      await name.fill("Bad");
      await page.getByRole("button", { name: "Save profile" }).click();
      await visible(
        page.getByText("Display name must be 1 to 100 characters.", {
          exact: true,
        }),
      );
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("changes the signed-in account password without retaining it in the page", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      await visible(page.getByLabel("Current password"));
      await page.getByLabel("Current password").fill("old password value");
      await page
        .getByLabel("New password", { exact: true })
        .fill("new password value");
      await page.getByLabel("Confirm new password").fill("new password value");
      await page.getByRole("button", { name: "Change password" }).click();
      await visible(page.getByText("Password changed.", { exact: false }));
      expect(bodyFor("POST", "/auth/change-password")).toEqual({
        currentPassword: "old password value",
        newPassword: "new password value",
        revokeOtherSessions: true,
      });
      await expect(
        page.getByLabel("Current password").inputValue(),
      ).resolves.toBe("");
      await expect(
        page.getByLabel("New password", { exact: true }).inputValue(),
      ).resolves.toBe("");
      await expect(
        page.getByLabel("Confirm new password").inputValue(),
      ).resolves.toBe("");
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] });

      passwordMode = "invalid";
      await page.getByLabel("Current password").fill("wrong current value");
      await page
        .getByLabel("New password", { exact: true })
        .fill("another password value");
      await page
        .getByLabel("Confirm new password")
        .fill("another password value");
      await page.getByRole("button", { name: "Change password" }).click();
      await visible(page.getByText("The current password did not match."));
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("signs out through the provider proxy and returns to the login view", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL((url) => url.pathname === "/admin/login");
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      expect(countRequests("/auth/sign-out")).toBe(1);
      expect(signedIn).toBe(false);
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] });
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });

  it("routes an expired protected session to the login view", async () => {
    neonMode = true;
    signedIn = false;
    meMode = "signed_out";
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      await page.waitForURL((url) => url.pathname === "/admin/login");
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      const target = new URL(page.url());
      expect(target.searchParams.get("returnTo")).toBe(
        "/admin/onboarding-invites?view=settings",
      );
      unexpectedErrors(errors, true);
    } finally {
      await page.close();
    }
  });

  it("stays usable and free of overflow for Neon team, profile and login at mobile widths", async () => {
    neonMode = true;
    signedIn = true;
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=team",
      viewport: { width: 390, height: 844 },
    });
    try {
      await visible(page.getByText("2 active members", { exact: true }));
      const metrics = await bodyOverflow(page);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport);
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await visible(page.getByLabel("Display name"));
      await page.setViewportSize({ width: 320, height: 720 });
      const compact = await bodyOverflow(page);
      expect(compact.documentWidth).toBeLessThanOrEqual(compact.viewport);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const nav = document.querySelector(".admin-nav");
              const current = nav?.querySelector<HTMLElement>(
                '[aria-current="page"]',
              );
              if (!nav || !current) return false;
              const navBox = nav.getBoundingClientRect();
              const activeBox = current.getBoundingClientRect();
              return (
                activeBox.left >= navBox.left - 1 &&
                activeBox.right <= navBox.right + 1
              );
            }),
          { timeout: 3_000 },
        )
        .toBe(true);
      signedIn = false;
      await page.goto(`${origin}/admin/login`, {
        waitUntil: "domcontentloaded",
      });
      await visible(
        page.getByRole("heading", { name: "Sign in to operations" }),
      );
      const login = await bodyOverflow(page);
      expect(login.documentWidth).toBeLessThanOrEqual(login.viewport);
      unexpectedErrors(errors);
    } finally {
      await page.close();
    }
  });
});
