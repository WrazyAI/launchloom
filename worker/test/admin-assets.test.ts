import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import { serveAdminAsset } from "../src/admin/asset-handler";

const origin = "https://api.launchloom.wrazyos.com";
const testEnv = env as unknown as Env;

function accessContext(
  email: string,
  aud = "launchloom-local-onboarding-admin",
) {
  return {
    access: {
      aud,
      getIdentity: async () => ({ email }),
    },
  } as unknown as ExecutionContext;
}

function assertPrivateShellHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  const csp = response.headers.get("Content-Security-Policy") || "";
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("font-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
}

function assertDataFree(html: string) {
  expect(html).not.toContain("client@example.test");
  expect(html).not.toContain("owner@example.test");
  expect(html).not.toContain("Fern & Forge");
  expect(html).not.toContain("test-onboarding-invite-secret");
  expect(html).not.toContain("localStorage");
  expect(html).not.toContain("sessionStorage");
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/iu);
  expect(html).not.toMatch(/\son[a-z]+\s*=/iu);
}

describe("same-origin admin shell assets", () => {
  it("keeps ADMIN_STATIC distinct from the R2 ASSETS bucket", () => {
    expect(typeof testEnv.ADMIN_STATIC.fetch).toBe("function");
    expect(typeof (testEnv.ASSETS as unknown as R2Bucket).get).toBe("function");
    expect(testEnv.ADMIN_STATIC).not.toBe(testEnv.ASSETS);
  });

  it("serves only allowlisted data-free assets with stale-safe caching", async () => {
    const javascript = await SELF.fetch(`${origin}/admin-assets/app.js`);
    expect(javascript.status).toBe(200);
    expect(javascript.headers.get("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(javascript.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(javascript.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin",
    );
    const scriptValidator =
      javascript.headers.get("ETag") ||
      javascript.headers.get("Last-Modified");
    expect(scriptValidator).toBeTruthy();
    const script = await javascript.text();
    expect(script).toContain("Operations workspace");
    expect(script).not.toContain("client@example.test");
    expect(script).not.toContain("localStorage");

    const css = await SELF.fetch(`${origin}/admin-assets/app.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(
      css.headers.get("ETag") || css.headers.get("Last-Modified"),
    ).toBeTruthy();
    const styles = await css.text();
    expect(styles).toContain("@font-face");
    expect(styles).not.toMatch(/url\(\s*['"]?https?:/iu);
    const fontUrls = [
      ...styles.matchAll(/url\("\.\/(fonts\/[^"]+\.woff2)"\)/gu),
    ].map((match) => match[1]);
    expect(fontUrls).toHaveLength(2);
    expect(
      fontUrls.some((file) =>
        /^fonts\/manrope-latin-[A-Za-z0-9]+\.woff2$/u.test(file),
      ),
    ).toBe(true);
    expect(
      fontUrls.some((file) =>
        /^fonts\/source-sans-3-latin-[A-Za-z0-9]+\.woff2$/u.test(file),
      ),
    ).toBe(true);

    for (const file of fontUrls) {
      const response = await SELF.fetch(`${origin}/admin-assets/${file}`);
      expect(response.status, file).toBe(200);
      expect(response.headers.get("Content-Type"), file).toBe("font/woff2");
      expect(response.headers.get("Cache-Control"), file).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(response.headers.get("X-Content-Type-Options"), file).toBe(
        "nosniff",
      );
    }

    const license = await SELF.fetch(
      `${origin}/admin-assets/fonts/LICENSE-Manrope.txt`,
    );
    expect(license.status).toBe(200);
    expect(license.headers.get("Content-Type")).toContain("text/plain");
    expect(license.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );

    const conditionalHeaders: Record<string, string> = javascript.headers.get("ETag")
      ? { "If-None-Match": javascript.headers.get("ETag")! }
      : { "If-Modified-Since": javascript.headers.get("Last-Modified")! };
    const revalidated = await SELF.fetch(`${origin}/admin-assets/app.js`, {
      headers: conditionalHeaders,
    });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    expect(revalidated.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  it("returns 404 for HTML, maps, indexes and unknown static paths", async () => {
    for (const path of [
      "/admin-assets",
      "/admin-assets/",
      "/admin-assets/index.html",
      "/admin-assets/app.js.map",
      "/admin-assets/app.css/",
      "/admin-assets/does-not-exist.js",
      "/admin-assets/fonts/does-not-exist.woff2",
      "/admin-assets/fonts/LICENSE-unknown.txt",
    ]) {
      const response = await SELF.fetch(`${origin}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("Cache-Control"), path).toBe("no-store");
      expect(response.headers.get("Content-Type"), path).toContain("text/plain");
      const body = await response.text();
      expect(body).not.toContain("Operations workspace");
      expect(body).not.toContain("/admin-assets/app.js");
    }

    for (const path of [
      "/admin-assets/%2e%2e/worker/src/index.ts",
      "/admin-assets/..%2fworker%2fsrc%2findex.ts",
      "/admin-assets/%2e%2e%2fworker%2fsrc%2findex.ts",
    ]) {
      const response = await SELF.fetch(`${origin}${path}`);
      expect(response.status, path).toBe(404);
      const body = await response.text();
      expect(body, path).not.toContain("Operations workspace");
      expect(body, path).not.toContain("/admin-assets/app.js");
    }

    const post = await SELF.fetch(`${origin}/admin-assets/app.js`, {
      method: "POST",
    });
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("never returns an HTML body from a misconfigured asset binding", async () => {
    const htmlBinding = {
      ADMIN_STATIC: {
        fetch: async () =>
          new Response("<!doctype html><title>private</title>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      },
    } as unknown as Env;
    const html = await serveAdminAsset(
      new Request(`${origin}/admin-assets/app.js`),
      htmlBinding,
    );
    expect(html.status).toBe(404);

    const missingBinding = {
      ADMIN_STATIC: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    } as unknown as Env;
    const missing = await serveAdminAsset(
      new Request(`${origin}/admin-assets/app.js`),
      missingBinding,
    );
    expect(missing.status).toBe(404);

    const noBinding = {} as unknown as Env;
    const unavailable = await serveAdminAsset(
      new Request(`${origin}/admin-assets/app.js`),
      noBinding,
    );
    expect(unavailable.status).toBe(404);
  });

  it("denies anonymous workspace HTML without leaking a private shell", async () => {
    const anonymous = await SELF.fetch(`${origin}/admin/onboarding-invites`);
    expect(anonymous.status).toBe(403);
    expect(anonymous.headers.get("Cache-Control")).toBe("no-store");
    expect(await anonymous.text()).toBe("Access denied.");

    const wrongAudience = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test", "wrong-audience"),
    );
    expect(wrongAudience.status).toBe(403);

    const wrongEmail = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites`),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(wrongEmail.status).toBe(403);
  });

  it("redirects to the relative login shell in neon mode", async () => {
    const redirected = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites?view=clients`),
      { ...testEnv, ADMIN_AUTH_MODE: "neon" },
      {} as ExecutionContext,
    );
    expect(redirected.status).toBe(303);
    expect(redirected.headers.get("Cache-Control")).toBe("no-store");
    const location = redirected.headers.get("Location") || "";
    expect(location).toBe(
      "/admin/login?returnTo=%2Fadmin%2Fonboarding-invites%3Fview%3Dclients",
    );
    expect((await redirected.text()).length).toBe(0);
  });

  it("renders a strict, data-free workspace shell for an allowed admin", async () => {
    const page = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites`),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(page.status).toBe(200);
    assertPrivateShellHeaders(page);
    expect(page.headers.get("Content-Type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("Operations workspace");
    expect(html).toContain('src="/admin-assets/app.js"');
    expect(html).toContain('href="/admin-assets/app.css"');
    expect(html).toContain('data-admin-view="workspace"');
    assertDataFree(html);

    const head = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites`, { method: "HEAD" }),
      testEnv,
      accessContext("admin@example.test"),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("serves only the data-free login shell in neon mode", async () => {
    const login = await worker.fetch(
      new Request(`${origin}/admin/login`),
      { ...testEnv, ADMIN_AUTH_MODE: "neon" },
      {} as ExecutionContext,
    );
    expect(login.status).toBe(200);
    assertPrivateShellHeaders(login);
    const html = await login.text();
    expect(html).toContain("LaunchLoom admin");
    expect(html).toContain('src="/admin-assets/app.js"');
    expect(html).toContain('data-admin-view="login"');
    assertDataFree(html);

    const closed = await worker.fetch(
      new Request(`${origin}/admin/login`),
      testEnv,
      {} as ExecutionContext,
    );
    expect(closed.status).toBe(404);
  });

  it("returns 404 instead of a private shell for direct admin fallbacks", async () => {
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/index.html",
      "/admin/onboarding-invites.html",
      "/admin/onboarding-invites/",
      "/admin/login.html",
      "/admin/settings",
    ]) {
      const response = await SELF.fetch(`${origin}${path}`);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("Cache-Control"), path).toBe("no-store");
      const body = await response.text();
      expect(body, path).toBe("Not found");
      expect(body).not.toContain("Operations workspace");
    }
  });

  it("never gives /api/admin paths a static SPA fallback", async () => {
    const anonymousList = await SELF.fetch(
      `${origin}/api/admin/onboarding-invites`,
    );
    expect(anonymousList.status).toBe(403);
    expect(anonymousList.headers.get("Content-Type")).toContain(
      "application/json",
    );

    const anonymousGenerations = await SELF.fetch(
      `${origin}/api/admin/generations`,
    );
    expect(anonymousGenerations.status).toBe(403);
    expect(anonymousGenerations.headers.get("Content-Type")).toContain(
      "application/json",
    );

    const unknown = await SELF.fetch(`${origin}/api/admin/does-not-exist`);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("Content-Type")).toContain("text/plain");
    const body = await unknown.text();
    expect(body).toBe("Not found");
    expect(body).not.toContain("admin-assets");
    expect(body).not.toContain("Operations workspace");

    const workspaceApi = await SELF.fetch(
      `${origin}/api/admin/onboarding-invites/workspace/does-not-exist`,
    );
    expect(workspaceApi.status).toBe(401);
    expect(workspaceApi.headers.get("Content-Type")).toContain(
      "application/json",
    );
    expect(workspaceApi.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves the existing Access-protected invitation route and API", async () => {
    const context = accessContext("admin@example.test");
    const page = await worker.fetch(
      new Request(`${origin}/admin/onboarding-invites`),
      testEnv,
      context,
    );
    expect(page.status).toBe(200);

    const api = await worker.fetch(
      new Request(`${origin}/api/admin/onboarding-invites`, {
        headers: { Origin: origin },
      }),
      testEnv,
      context,
    );
    expect(api.status).toBe(200);
    expect(api.headers.get("Cache-Control")).toBe("no-store");
    const payload = (await api.json()) as { invites?: unknown[] };
    expect(Array.isArray(payload.invites)).toBe(true);

    const deniedApi = await worker.fetch(
      new Request(`${origin}/api/admin/onboarding-invites`, {
        headers: { Origin: origin },
      }),
      testEnv,
      accessContext("other@example.test"),
    );
    expect(deniedApi.status).toBe(403);
  });
});
