import { describe, expect, it, vi } from "vitest";
import {
  logOpenRouterCacheUsage,
  openRouterCacheMetrics,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCacheRequestFields,
  promptCachedMessageContent,
  promptCachedText,
  supportsExplicitOpenAiPromptCaching,
} from "../scripts/openrouter-client.mjs";

describe("OpenRouter cache-aware client", () => {
  it("creates deterministic non-PII session and prompt-cache identifiers", () => {
    const first = openRouterSessionId("creative-author", {
      name: "Maison Orphee",
      phone: "(212) 555-0186",
    });
    const second = openRouterSessionId("creative-author", {
      phone: "(212) 555-0186",
      name: "Maison Orphee",
    });
    const different = openRouterSessionId("visual-gate", {
      name: "Maison Orphee",
      phone: "(212) 555-0186",
    });
    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).not.toContain("Maison");
    expect(first.length).toBeLessThanOrEqual(256);

    const key = openRouterPromptCacheKey("creative-author", {
      name: "Maison Orphee",
    });
    expect(key).toMatch(/^ll:creative-author:[a-f0-9]{40}$/u);
  });

  it("enables explicit prompt caching only for OpenAI GPT-5.6 and newer", () => {
    expect(supportsExplicitOpenAiPromptCaching("openai/gpt-5.6-luna")).toBe(
      true,
    );
    expect(supportsExplicitOpenAiPromptCaching("openai/gpt-5.7")).toBe(true);
    expect(supportsExplicitOpenAiPromptCaching("openai/gpt-5.5")).toBe(false);
    expect(supportsExplicitOpenAiPromptCaching("z-ai/glm-5.3-flash")).toBe(
      false,
    );

    expect(
      promptCachedText("openai/gpt-5.6-luna", "stable instructions"),
    ).toEqual({
      type: "text",
      text: "stable instructions",
      prompt_cache_breakpoint: { mode: "explicit" },
    });
    expect(
      promptCachedText("z-ai/glm-5.3-flash", "stable instructions"),
    ).toEqual({
      type: "text",
      text: "stable instructions",
    });

    expect(
      promptCachedMessageContent(
        "openai/gpt-5.6-luna",
        "stable instructions",
      ),
    ).toEqual([
      {
        type: "text",
        text: "stable instructions",
        prompt_cache_breakpoint: { mode: "explicit" },
      },
    ]);
    expect(
      promptCachedMessageContent(
        "z-ai/glm-5.3-flash",
        "stable instructions",
      ),
    ).toBe("stable instructions");

    expect(
      promptCacheRequestFields(
        "openai/gpt-5.6-luna",
        "ll:creative-author:test",
      ),
    ).toEqual({
      prompt_cache_key: "ll:creative-author:test",
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
    });
    expect(
      promptCacheRequestFields("z-ai/glm-5.3-flash", "ignored"),
    ).toEqual({});
  });

  it("adds sticky session routing and opt-in response-cache headers", async () => {
    const fetchImpl = vi.fn(async (_url, options) => ({
      ok: true,
      status: 200,
      options,
    }));
    const response: any = await openRouterChatCompletion({
      apiKey: "test-key",
      title: "LaunchLoom Test",
      body: {
        model: "openai/gpt-5.6-luna",
        messages: [{ role: "user", content: "hello" }],
      },
      sessionId: "launchloom:test:abc",
      responseCache: true,
      responseCacheTtlSeconds: 1200,
      fetchImpl: fetchImpl as any,
    });

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers["X-OpenRouter-Cache"]).toBe("true");
    expect(options.headers["X-OpenRouter-Cache-TTL"]).toBe("1200");
    expect(options.headers["X-OpenRouter-Title"]).toBe("LaunchLoom Test");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "openai/gpt-5.6-luna",
      session_id: "launchloom:test:abc",
    });
  });

  it("normalizes cache metrics and logging", () => {
    const usage = {
      prompt_tokens: 10_000,
      prompt_tokens_details: {
        cached_tokens: 7_500,
        cache_write_tokens: 1_000,
      },
    };
    expect(openRouterCacheMetrics(usage)).toEqual({
      promptTokens: 10_000,
      cachedTokens: 7_500,
      cacheWriteTokens: 1_000,
      cacheHitRate: 0.75,
      cacheHitPercent: 75,
    });
    const logger = vi.fn();
    expect(logOpenRouterCacheUsage("creative author", usage, logger)).toEqual(
      openRouterCacheMetrics(usage),
    );
    expect(logger.mock.calls[0][0]).toContain("hit_percent=75");
  });
});
