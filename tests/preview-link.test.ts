import { describe, expect, it, vi } from "vitest";
import {
  buildPreviewProxyUrl,
  isAccessProtectedResponse,
  normalizeAdminOrigin,
  resolvePreviewLink,
} from "../scripts/preview-link.mjs";

const previewHost = "63ae786d.launchloom-pipeline-preview.pages.dev";
const previewUrl = `https://${previewHost}/services/?review=token`;
const adminOrigin = "https://api.launchloom.wrazyos.com";

describe("preview link resolution", () => {
  it("builds an authenticated Worker URL that preserves the preview path and query", () => {
    expect(buildPreviewProxyUrl(previewUrl, adminOrigin)).toBe(
      `${adminOrigin}/admin/preview/${previewHost}/services/?review=token`,
    );
  });

  it("rejects a non-https or path-bearing admin origin", () => {
    expect(() => normalizeAdminOrigin("http://api.example.test")).toThrow(
      /public https/u,
    );
    expect(() =>
      normalizeAdminOrigin("https://api.example.test/admin"),
    ).toThrow(/path/u);
  });

  it("wraps a preview that redirects to Cloudflare Access", async () => {
    const send = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: `https://launchloom-maigreeks.cloudflareaccess.com/cdn-cgi/access/login/${previewHost}?kid=secret`,
          },
        }),
    );

    const result = await resolvePreviewLink({
      previewUrl,
      adminOrigin,
      fetch: send,
    });

    expect(result).toEqual({
      url: `${adminOrigin}/admin/preview/${previewHost}/services/?review=token`,
      proxied: true,
    });
    expect(send).toHaveBeenCalledWith(
      previewUrl,
      expect.objectContaining({ method: "HEAD", redirect: "manual" }),
    );
  });

  it("wraps a preview that returns a relative Access login redirect", async () => {
    const send = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/cdn-cgi/access/login?kid=secret" },
        }),
    );

    const result = await resolvePreviewLink({
      previewUrl,
      adminOrigin,
      fetch: send,
    });
    expect(result.proxied).toBe(true);
  });

  it("leaves a public preview direct", async () => {
    const send = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await resolvePreviewLink({
      previewUrl,
      adminOrigin,
      fetch: send,
    });
    expect(result).toEqual({ url: previewUrl, proxied: false });
  });

  it("treats 401 and 403 as protected", async () => {
    for (const status of [401, 403]) {
      const send = vi.fn(async () => new Response("denied", { status }));
      const result = await resolvePreviewLink({
        previewUrl,
        adminOrigin,
        fetch: send,
      });
      expect(result.proxied).toBe(true);
    }
  });

  it("retries with GET when HEAD is not allowed", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await resolvePreviewLink({
      previewUrl,
      adminOrigin,
      fetch: send,
    });

    expect(result.proxied).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps the direct link when the probe fails", async () => {
    const send = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await resolvePreviewLink({
      previewUrl,
      adminOrigin,
      fetch: send,
    });
    expect(result).toEqual({ url: previewUrl, proxied: false });
  });

  it("does not probe a non-pages URL such as a GitHub fallback", async () => {
    const send = vi.fn();
    const result = await resolvePreviewLink({
      previewUrl: "https://github.com/WrazyAI/launchloom/issues/183",
      adminOrigin,
      fetch: send,
    });
    expect(result).toEqual({
      url: "https://github.com/WrazyAI/launchloom/issues/183",
      proxied: false,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the direct link when no admin origin is configured", async () => {
    const send = vi.fn();
    const result = await resolvePreviewLink({ previewUrl, fetch: send });
    expect(result).toEqual({ url: previewUrl, proxied: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("classifies Access responses without exposing the redirect", () => {
    expect(
      isAccessProtectedResponse(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              "https://team.cloudflareaccess.com/cdn-cgi/access/login/x",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isAccessProtectedResponse(
        new Response(null, {
          status: 302,
          headers: { Location: "/about" },
        }),
      ),
    ).toBe(false);
    expect(isAccessProtectedResponse(new Response(null, { status: 200 }))).toBe(
      false,
    );
  });
});
