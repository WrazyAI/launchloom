import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, fetchAdmin } from "../src/admin/api";

function respond(response: Response | Promise<Response>) {
  const mock = vi.fn(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin API transport", () => {
  it("returns parsed JSON for a valid success response", async () => {
    respond(json({ items: [{ attemptId: "attempt-1" }] }));
    await expect(
      fetchAdmin<{ items: Array<{ attemptId: string }> }>(
        "/api/admin/onboarding-invites/workspace/attempts",
      ),
    ).resolves.toEqual({ items: [{ attemptId: "attempt-1" }] });
  });

  it("returns undefined only for an explicit no-content response", async () => {
    respond(new Response(null, { status: 204 }));
    await expect(fetchAdmin("/api/admin/test")).resolves.toBeUndefined();

    respond(json({ ignored: true }, 200));
    await expect(
      fetchAdmin("/api/admin/test", { expectNoContent: true }),
    ).resolves.toBeUndefined();
  });

  it("throws a typed error for an empty successful response", async () => {
    respond(new Response("", { status: 200 }));
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("throws a typed error for malformed JSON", async () => {
    respond(
      new Response("{not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("requires a JSON content type for successful responses", async () => {
    respond(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("rejects a null or invalid JSON shape", async () => {
    respond(json(null));
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      code: "invalid_response",
    });

    respond(json({ items: "not-an-array" }));
    await expect(
      fetchAdmin<{ items: unknown[] }>("/api/admin/test", {
        validate: (value): value is { items: unknown[] } =>
          Boolean(
            value &&
              typeof value === "object" &&
              Array.isArray((value as { items?: unknown }).items),
          ),
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("normalizes body-read failures to a typed response error", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("synthetic stream failure"));
      },
    });
    respond(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 200,
      code: "invalid_response",
    });
  });

  it("maps HTTP error envelopes without leaking the raw body", async () => {
    respond(
      json(
        { error: { code: "forbidden", message: "Access denied." } },
        403,
      ),
    );
    const error = await fetchAdmin("/api/admin/test").catch((value) => value);
    expect(error).toBeInstanceOf(ApiRequestError);
    if (!(error instanceof ApiRequestError)) throw new Error("expected ApiRequestError");
    expect(error).toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Access denied.",
    });
    expect(error.message).not.toContain("{");
  });

  it("normalizes network failures and invalid paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("synthetic network failure");
      }),
    );
    await expect(fetchAdmin("/api/admin/test")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 0,
      code: "network_unavailable",
    });

    await expect(fetchAdmin("https://example.test/api/admin")).rejects.toMatchObject(
      { name: "ApiRequestError", code: "invalid_path" },
    );
  });
});
