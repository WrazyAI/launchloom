import { describe, expect, it } from "vitest";
import { resolveSerpResultDomains } from "../scripts/seo-research.mjs";

describe("SERP redirect domains", () => {
  it("resolves search-engine redirects to the publisher host", async () => {
    const serps = [
      {
        query: "Drain cleaning Austin",
        results: [
          { url: "https://google.com/goto?url=abc", domain: "google.com" },
          { url: "https://example.com/services", domain: "example.com" },
        ],
      },
    ];
    const called: string[] = [];
    const result = await resolveSerpResultDomains(
      serps,
      async (input: any) => {
        called.push(String(input));
        return {
          url: "https://radiantplumbing.com/service-area/austin/",
          status: 403,
          body: { cancel: async () => {} },
        };
      },
    );
    expect(result).toEqual({ resolved: 1, unresolved: 0 });
    expect(serps[0].results[0].domain).toBe("radiantplumbing.com");
    expect(serps[0].results[1].domain).toBe("example.com");
    expect(called).toEqual(["https://google.com/goto?url=abc"]);
  });

  it("keeps redirect domains when resolution fails", async () => {
    const serps = [
      {
        query: "Drain cleaning Austin",
        results: [
          { url: "https://google.com/goto?url=x", domain: "google.com" },
        ],
      },
    ];
    const result = await resolveSerpResultDomains(serps, async () => {
      throw new Error("blocked");
    });
    expect(result).toEqual({ resolved: 0, unresolved: 1 });
    expect(serps[0].results[0].domain).toBe("google.com");
  });
});
