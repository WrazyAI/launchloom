import { describe, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:test";
import { http, HttpResponse } from "msw";
import worker, { type Env } from "../src/index";
import { AdminAuthError } from "../src/admin/auth";
import { network } from "./network";
import {
  handlePreviewProxy,
  mintPreviewToken,
  parsePreviewProxyTarget,
  previewProxyPath,
  rewritePreviewCss,
  rewritePreviewHtml,
  rewritePreviewLocation,
  verifyPreviewToken,
  type PreviewProxyAuthorize,
} from "../src/preview-proxy";

const previewHost = "63ae786d.launchloom-pipeline-preview.pages.dev";
const adminOrigin = "https://api.launchloom.wrazyos.com";
const previewSecret = "preview-proxy-test-secret";
const proxyEnv = {
  ADMIN_PUBLIC_ORIGIN: adminOrigin,
  REVIEW_SIGNING_SECRET: previewSecret,
  CLOUDFLARE_ACCESS_CLIENT_ID: "access-client-id",
  CLOUDFLARE_ACCESS_CLIENT_SECRET: "access-client-secret",
} as unknown as Env;

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

function authorized(): PreviewProxyAuthorize {
  return async () => ({ setCookies: [] });
}

describe("preview proxy links", () => {
  it("builds a same-origin proxy path that preserves the target path and query", () => {
    expect(
      previewProxyPath(
        new URL(`https://${previewHost}/services/?review=token&next=%2Fhome`),
      ),
    ).toBe(`/admin/preview/${previewHost}/services/?review=token&next=%2Fhome`);
  });

  it("parses only HTTPS pages.dev preview hosts", async () => {
    expect(
      parsePreviewProxyTarget(
        new URL(
          `https://api.launchloom.wrazyos.com/admin/preview/${previewHost}/about`,
        ),
      ),
    ).toEqual({ host: previewHost, path: "/about" });

    const token = await mintPreviewToken(previewHost, previewSecret);
    expect(
      parsePreviewProxyTarget(
        new URL(
          `https://api.launchloom.wrazyos.com/admin/preview/${token}/${previewHost}/about`,
        ),
      ),
    ).toEqual({ host: previewHost, path: "/about", token });

    expect(
      parsePreviewProxyTarget(
        new URL(
          "https://api.launchloom.wrazyos.com/admin/preview/evil.example/about",
        ),
      ),
    ).toBeNull();
    expect(
      parsePreviewProxyTarget(
        new URL(
          "https://api.launchloom.wrazyos.com/admin/preview/evil.pages.dev/about",
        ),
      ),
    ).toBeNull();
    expect(
      parsePreviewProxyTarget(
        new URL(
          "https://api.launchloom.wrazyos.com/admin/preview/evil.pages.dev.evil.example/about",
        ),
      ),
    ).toBeNull();
    expect(
      parsePreviewProxyTarget(
        new URL(
          "https://api.launchloom.wrazyos.com/admin/preview/pages.dev/about",
        ),
      ),
    ).toBeNull();
    expect(
      parsePreviewProxyTarget(
        new URL(
          "https://api.launchloom.wrazyos.com/admin/preview/63ae786d.launchloom-pipeline-preview.pages.dev%2Fevil/about",
        ),
      ),
    ).toBeNull();
  });
});

describe("preview HTML rewriting", () => {
  it("keeps same-site navigation and assets inside the authenticated proxy", () => {
    const html = [
      '<base href="https://example.test/">',
      `<a href="/about">About</a>`,
      `<a href="https://${previewHost}/services/?x=1#top">Services</a>`,
      `<img src="/images/hero.webp" srcset="/images/hero-1.webp 1x, /images/hero-2.webp 2x">`,
      '<script src="/_astro/app.js"></script>',
      '<form action="/contact"><button formaction="/contact/send">Send</button></form>',
      '<div style="background:url(/images/texture.png)"></div>',
      '<style>.hero{background:url("/images/hero.webp")} @import "/site.css";</style>',
      '<a href="https://example.com/external">External</a>',
      '<a href="#section">Anchor</a>',
      '<a href="mailto:hello@example.com">Email</a>',
      '<img src="data:image/png;base64,AAAA">',
      '<meta http-equiv="refresh" content="0;url=/next">',
    ].join("");

    const output = rewritePreviewHtml(html, previewHost);

    expect(output).toContain(
      `<base href="/admin/preview/${previewHost}/">`,
    );
    expect(output).toContain(`href="/admin/preview/${previewHost}/about"`);
    expect(output).toContain(
      `href="/admin/preview/${previewHost}/services/?x=1#top"`,
    );
    expect(output).toContain(
      `src="/admin/preview/${previewHost}/images/hero.webp"`,
    );
    expect(output).toContain(
      `srcset="/admin/preview/${previewHost}/images/hero-1.webp 1x, /admin/preview/${previewHost}/images/hero-2.webp 2x"`,
    );
    expect(output).toContain(
      `src="/admin/preview/${previewHost}/_astro/app.js"`,
    );
    expect(output).toContain(`action="/admin/preview/${previewHost}/contact"`);
    expect(output).toContain(
      `formaction="/admin/preview/${previewHost}/contact/send"`,
    );
    expect(output).toContain(
      `url(/admin/preview/${previewHost}/images/texture.png)`,
    );
    expect(output).toContain(
      `url("/admin/preview/${previewHost}/images/hero.webp")`,
    );
    expect(output).toContain(
      `@import "/admin/preview/${previewHost}/site.css"`,
    );
    expect(output).toContain('href="https://example.com/external"');
    expect(output).toContain('href="#section"');
    expect(output).toContain('href="mailto:hello@example.com"');
    expect(output).toContain('src="data:image/png;base64,AAAA"');
    expect(output).toContain(
      `content="0;url=/admin/preview/${previewHost}/next"`,
    );
  });

  it("does not double-prefix an already proxied URL", () => {
    const output = rewritePreviewHtml(
      `<a href="/admin/preview/${previewHost}/about">About</a>`,
      previewHost,
    );
    expect(output).toContain(`href="/admin/preview/${previewHost}/about"`);
    expect(output).not.toContain(
      `/admin/preview/${previewHost}/admin/preview/`,
    );
  });
});

describe("preview CSS and redirect rewriting", () => {
  it("rewrites root-relative CSS references only", () => {
    const css = [
      ".a{background:url(/images/a.png)}",
      ".b{background:url('../images/b.png')}",
      '@import "/site.css";',
      ".c{background:url(https://example.com/c.png)}",
    ].join("");

    const output = rewritePreviewCss(css, previewHost);
    expect(output).toContain(`url(/admin/preview/${previewHost}/images/a.png)`);
    expect(output).toContain("url('../images/b.png')");
    expect(output).toContain(
      `@import "/admin/preview/${previewHost}/site.css"`,
    );
    expect(output).toContain("url(https://example.com/c.png)");
  });

  it("rewrites same-host redirects and leaves external redirects alone", () => {
    expect(rewritePreviewLocation("/about", previewHost)).toBe(
      `/admin/preview/${previewHost}/about`,
    );
    expect(
      rewritePreviewLocation(`https://${previewHost}/about`, previewHost),
    ).toBe(`/admin/preview/${previewHost}/about`);
    expect(
      rewritePreviewLocation("https://example.com/about", previewHost),
    ).toBe("https://example.com/about");
  });
});

describe("preview tokens", () => {
  it("mints and verifies a host-bound token", async () => {
    const token = await mintPreviewToken(previewHost, previewSecret);
    expect(await verifyPreviewToken(token, previewHost, previewSecret)).toBe(
      true,
    );
    expect(
      await verifyPreviewToken(
        token,
        "other.launchloom-pipeline-preview.pages.dev",
        previewSecret,
      ),
    ).toBe(false);
    expect(await verifyPreviewToken(token, previewHost, "wrong-secret")).toBe(
      false,
    );
  });

  it("rejects an expired token", async () => {
    const token = await mintPreviewToken(
      previewHost,
      previewSecret,
      Date.now() - 2 * 60 * 60 * 1000,
    );
    expect(await verifyPreviewToken(token, previewHost, previewSecret)).toBe(
      false,
    );
  });

  it("accepts a valid token without a session", async () => {
    const token = await mintPreviewToken(previewHost, previewSecret);
    const authorize = vi.fn(async () => ({ setCookies: [] }));
    const fetchUpstream = vi.fn(
      async () =>
        new Response('<a href="/about">About</a>', {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    );

    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${token}/${previewHost}/`),
      proxyEnv,
      {} as ExecutionContext,
      { authorize, fetch: fetchUpstream as unknown as typeof fetch },
    );

    expect(response.status).toBe(200);
    expect(authorize).not.toHaveBeenCalled();
    expect(await response.text()).toContain(
      `/admin/preview/${token}/${previewHost}/about`,
    );
  });

  it("falls back to session auth for an expired token", async () => {
    const token = await mintPreviewToken(
      previewHost,
      previewSecret,
      Date.now() - 2 * 60 * 60 * 1000,
    );
    const authorize = vi.fn(async () => {
      throw new AdminAuthError("signed_out");
    });
    const fetchUpstream = vi.fn();

    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${token}/${previewHost}/`),
      proxyEnv,
      {} as ExecutionContext,
      { authorize, fetch: fetchUpstream as unknown as typeof fetch },
    );

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});

describe("preview proxy request handling", () => {
  it("sends a signed-out visitor to the Neon login with a safe return path", async () => {
    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/services/?x=1`),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: async () => {
          throw new AdminAuthError("signed_out");
        },
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      `/admin/login?returnTo=${encodeURIComponent(
        `/admin/preview/${previewHost}/services/?x=1`,
      )}`,
    );
  });

  it("does not fetch an upstream or reveal a path for a non-pages host", async () => {
    const fetchUpstream = vi.fn();
    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/evil.example/about`),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: authorized(),
        fetch: fetchUpstream as unknown as typeof fetch,
      },
    );

    expect(response.status).toBe(404);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("fetches with the Access service token and never forwards browser cookies", async () => {
    const fetchUpstream = vi.fn(async (_url: string, init: RequestInit) => {
      return new Response(`<a href="/about">About</a>`, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": "CF_Authorization=leak",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    });

    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/`, {
        headers: { Cookie: "__Secure-neon-auth.session=admin-session" },
      }),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: authorized(),
        fetch: fetchUpstream as unknown as typeof fetch,
      },
    );

    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    const [target, init] = fetchUpstream.mock.calls[0];
    expect(target).toBe(`https://${previewHost}/`);
    const headers = new Headers(init.headers);
    expect(headers.get("CF-Access-Client-Id")).toBe("access-client-id");
    expect(headers.get("CF-Access-Client-Secret")).toBe("access-client-secret");
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
    expect(await response.text()).toMatch(
      new RegExp(
        `href="/admin/preview/[A-Za-z0-9._-]+/${previewHost}/about"`,
        "u",
      ),
    );
  });

  it("fails closed when the upstream still redirects to Cloudflare Access", async () => {
    const fetchUpstream = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `https://launchloom-maigreeks.cloudflareaccess.com/cdn-cgi/access/login/${previewHost}?kid=secret`,
        },
      });
    });

    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/`),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: authorized(),
        fetch: fetchUpstream as unknown as typeof fetch,
      },
    );

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("could not authenticate");
    expect(body).not.toContain("cloudflareaccess.com");
    expect(body).not.toContain("kid=secret");
  });

  it("rejects methods other than GET and HEAD", async () => {
    const fetchUpstream = vi.fn();
    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/`, {
        method: "POST",
      }),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: authorized(),
        fetch: fetchUpstream as unknown as typeof fetch,
      },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it("passes binary assets through without rewriting them", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const fetchUpstream = vi.fn(async () => {
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const response = await handlePreviewProxy(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/images/a.png`),
      proxyEnv,
      {} as ExecutionContext,
      {
        authorize: authorized(),
        fetch: fetchUpstream as unknown as typeof fetch,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});

describe("preview proxy route wiring", () => {
  it("returns an authorization denial, not a 404, for an unauthenticated request", async () => {
    const response = await worker.fetch(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/`),
      workerEnv as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Access denied");
  });

  it("serves a proxied preview for an authorized admin", async () => {
    network.use(
      http.get(`https://${previewHost}/`, () =>
        HttpResponse.html('<a href="/about">About</a>', {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const response = await worker.fetch(
      new Request(`${adminOrigin}/admin/preview/${previewHost}/`),
      workerEnv as unknown as Env,
      accessContext("admin@example.test"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(
      new RegExp(
        `href="/admin/preview/[A-Za-z0-9._-]+/${previewHost}/about"`,
        "u",
      ),
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox",
    );
  });
});
