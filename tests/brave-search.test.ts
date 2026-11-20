import { describe, expect, it, vi } from "vitest";
import { createBraveSearchClient } from "../scripts/brave-search.mjs";

describe("Brave Search fallback client", () => {
  it("requests bounded web results with the subscription token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        web: {
          results: [
            {
              title: "Companion care in Asheville",
              url: "https://example.test/companion-care",
              description: "A local provider explains companion care.",
            },
            {
              title: "Unsafe result",
              url: "http://example.test/unsafe",
              description: "Not HTTPS.",
            },
          ],
        },
      }),
    );
    const client = createBraveSearchClient({
      apiKey: "brave-test-key",
      fetchImpl,
    });
    const result = await client.search({
      query: "companion care Asheville NC",
      maxResults: 3,
    });

    const [request, init] = fetchImpl.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(request)).toContain(
      "https://api.search.brave.com/res/v1/web/search",
    );
    expect(String(request)).toContain("q=companion+care+Asheville+NC");
    expect(String(request)).toContain("count=3");
    expect((init.headers as Record<string, string>)["X-Subscription-Token"]).toBe(
      "brave-test-key",
    );
    expect(result).toMatchObject({
      provider: "Brave Search API",
      costUsd: 0,
      results: [
        {
          url: "https://example.test/companion-care",
          title: "Companion care in Asheville",
          snippet: "A local provider explains companion care.",
        },
      ],
    });
  });

  it("rejects a provider error instead of returning uncited text", async () => {
    const client = createBraveSearchClient({
      apiKey: "brave-test-key",
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
    });
    await expect(client.search({ query: "companion care" })).rejects.toThrow(
      "Brave Search API returned HTTP 429",
    );
  });
});
