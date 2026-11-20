const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const MAX_QUERY_LENGTH = 300;
const MAX_RESULTS = 10;

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function clipped(value, limit) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit);
}

/**
 * Bounded Brave Search client for cited diagnostic evidence. It never claims
 * keyword volume, difficulty, rankings, or other measured SEO metrics.
 * @param {{apiKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number, retryDelayMs?: number}} [options]
 */
export function createBraveSearchClient({
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  retryDelayMs = 1_200,
} = {}) {
  if (!apiKey) throw new Error("Brave Search API key is required.");
  return {
    provider: "Brave Search API",
    // The free Brave plan throttles at roughly one request per second.
    minIntervalMs: 1_200,
    async search({ query, maxResults = 4 }) {
      const boundedQuery = clipped(query, MAX_QUERY_LENGTH);
      if (!boundedQuery) throw new Error("Brave Search query is required.");
      const count = Math.max(
        1,
        Math.min(MAX_RESULTS, Number(maxResults) || 4),
      );
      const url = new URL(BRAVE_SEARCH_ENDPOINT);
      url.searchParams.set("q", boundedQuery);
      url.searchParams.set("count", String(count));
      url.searchParams.set("safesearch", "strict");
      url.searchParams.set("text_decorations", "false");
      let response;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status !== 429 || attempt === 1) break;
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter)
          ? Math.min(5_000, Math.max(0, retryAfter * 1_000))
          : retryDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (!response.ok)
        throw new Error(`Brave Search API returned HTTP ${response.status}.`);
      const body = await response.json().catch(() => null);
      const results = (Array.isArray(body?.web?.results)
        ? body.web.results
        : []
      )
        .flatMap((item) => {
          const safeUrl = safeHttpsUrl(item?.url);
          if (!safeUrl) return [];
          return [
            {
              url: safeUrl,
              title: clipped(item?.title, 300),
              snippet: clipped(item?.description, 1200),
            },
          ];
        })
        .slice(0, count);
      return {
        results,
        provider: "Brave Search API",
        costUsd: 0,
        costNote:
          "Brave Search API pricing is plan-based; no per-query cost is reported. Fallback spend is recorded as $0 incremental.",
      };
    },
  };
}
