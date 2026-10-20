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

const PRINCIPAL = {
  id: `access:${"ab".repeat(32)}`,
  email: "admin@example.test",
  displayName: null,
  role: "admin",
  authSource: "cloudflare-access",
} as const;

type RecordedRequest = { method: string; path: string };

let browser: Browser;
let server: http.Server;
let origin = "";
let assetsDirectory = "";
let requests: RecordedRequest[] = [];
let meMode: "success" | "unavailable" | "malformed" = "success";

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

  if (pathname !== "/api/admin/onboarding-invites/workspace/me") {
    sendText(response, "Not found", 404);
    return;
  }

  requests.push({ method: request.method || "GET", path: pathname });
  if (request.method !== "GET") {
    sendText(response, "Method not allowed", 405);
    return;
  }
  if (meMode === "unavailable") {
    sendJson(
      response,
      {
        error: {
          code: "not_enabled",
          message: "Persistent account profiles are not enabled.",
        },
      },
      503,
    );
    return;
  }
  if (meMode === "malformed") {
    sendJson(response, { principal: { id: "forged", email: "forged@x" } });
    return;
  }
  sendJson(response, { principal: PRINCIPAL });
}

beforeAll(async () => {
  assetsDirectory = await mkdtemp(
    path.join(tmpdir(), "launchloom-admin-account-"),
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
  requests = [];
  meMode = "success";
});

async function openPage(options: {
  path: string;
  viewport?: { width: number; height: number };
}) {
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1512, height: 960 },
  });
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
  const unexpected = allow503
    ? errors.filter(
        (error) => !/Failed to load resource: .*503 \(Service Unavailable\)/u.test(error),
      )
    : errors;
  expect(unexpected).toEqual([]);
}

async function bodyOverflow(page: Page) {
  return page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
}

describe("interim Access identity and unavailable account surfaces", () => {
  it("shows the real verified Access identity as a read-only interim profile", async () => {
    const { page, errors } = await openPage({
      path: "/admin/onboarding-invites?view=settings",
    });
    try {
      const email = page.getByLabel("Verified email address (read-only)");
      await visible(email);
      await expect(email.inputValue()).resolves.toBe(PRINCIPAL.email);
      await expect(email.isEditable()).resolves.toBe(false);
      await expect(
        page.getByText("Persistent account profiles are not enabled yet.", {
          exact: true,
        }).count(),
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
      expect(rendered).not.toContain(PRINCIPAL.id);
      const fullHash = PRINCIPAL.id.slice("access:".length);
      expect(rendered).not.toContain(fullHash);
      expect(
        await page.getByText("Stable identity", { exact: true }).count(),
      ).toBe(0);
      const details = page.locator("details", { hasText: "Technical reference" });
      await expect(details.getAttribute("open")).resolves.toBeNull();
      await details.locator("summary").click();
      const reference = details.locator("[data-identity-reference]");
      await visible(reference);
      await expect(reference.textContent()).resolves.toBe("access:abababab");
      expect(requests).toEqual([
        {
          method: "GET",
          path: "/api/admin/onboarding-invites/workspace/me",
        },
      ]);
      expect(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      ).toEqual({ local: [], session: [] });
      expect(await page.getByText("Browser Admin", { exact: false }).count())
        .toBe(0);
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
        page.getByText(
          "The verified Access identity could not be loaded.",
          { exact: true },
        ),
      );
      expect(await page.getByText(PRINCIPAL.email, { exact: false }).count())
        .toBe(0);
      expect(await page.getByText("Name not recorded", { exact: true }).count())
        .toBe(0);
      expect(await page.getByText("Administrator", { exact: true }).count())
        .toBe(0);
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
        page.getByText(
          "The verified Access identity could not be loaded.",
          { exact: true },
        ),
      );
      expect(await page.getByText("forged@x", { exact: false }).count()).toBe(0);
      expect(await page.getByText("Name not recorded", { exact: true }).count())
        .toBe(0);
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
      expect(await page.getByText("No administrator members", { exact: false })
        .count()).toBe(1);
      expect(await page.getByText("No owner controls", { exact: false }).count())
        .toBe(1);
      expect(await page.getByRole("button").count()).toBe(0);
      expect(
        await page.getByText("Invite administrator", { exact: false }).count(),
      ).toBe(0);
      expect(await page.getByText(PRINCIPAL.email, { exact: false }).count())
        .toBe(0);
      expect(requests).toEqual([]);
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

      await page.getByRole("link", { name: "Integrations", exact: true }).click();
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
