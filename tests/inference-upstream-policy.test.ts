import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import {
  postInferenceJson,
  inferenceCompletion,
} from "../scripts/inference-client.mjs";
import { openRouterChatCompletion } from "../scripts/openrouter-client.mjs";
import { completeGeneration } from "../scripts/generation-inference.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("inference network policy", () => {
  it("enforces the policy in a plain Node process without Vitest mocks", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { openRouterChatCompletion } from "./scripts/openrouter-client.mjs";
      import { postInferenceJson } from "./scripts/inference-client.mjs";
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; return Response.json({}); };
      const results = [];
      for (const mode of ["production", "test"]) {
        process.env.NODE_ENV = mode;
        process.env.VITEST = "true";
        process.env.CREATIVE_EXPERIENCE_PROVIDER = "openrouter";
        process.env.SITE_COPY_PROVIDER = "openrouter";
        for (const invoke of [
          () => openRouterChatCompletion({ apiKey: "synthetic-key", body: { model: "fixture" } }),
          () => postInferenceJson({ url: "https://api.openrouter.ai/v1/responses", headers: {}, body: {} }),
        ]) {
          try { await invoke(); results.push("not-blocked"); }
          catch (error) { results.push(error.code); }
        }
      }
      console.log(JSON.stringify({ calls, results }));
    `,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      calls: 0,
      results: Array(4).fill("INFERENCE_UPSTREAM_DISABLED"),
    });
  });
  it.each([
    "https://openrouter.ai/api/v1/chat/completions",
    "https://OPENROUTER.AI/api/v1/chat/completions",
    "https://openrouter.ai./api/v1/responses",
    "https://api.openrouter.ai/api/v1/responses",
    "http://openrouter.ai/api/v1/chat/completions",
  ])(
    "blocks %s before dispatch even with an injected transport",
    async (url) => {
      const fetchImpl = vi.fn(async () => Response.json({}));
      await expect(async () =>
        postInferenceJson({
          url,
          headers: { Authorization: "Bearer synthetic-secret" },
          body: { model: "fixture-model" },
          fetchImpl,
        }),
      ).rejects.toMatchObject({ code: "INFERENCE_UPSTREAM_DISABLED" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(["production", "test"])(
    "blocks the legacy client with NODE_ENV=%s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      vi.stubEnv("VITEST", "true");
      vi.stubEnv("CREATIVE_EXPERIENCE_PROVIDER", "openrouter");
      vi.stubEnv("SITE_COPY_PROVIDER", "openrouter");
      const fetchImpl = vi.fn(async () => Response.json({}));
      await expect(
        openRouterChatCompletion({
          apiKey: "synthetic-key",
          body: { model: "fixture-model", messages: [] },
          fetchImpl,
        }),
      ).rejects.toMatchObject({ code: "INFERENCE_UPSTREAM_DISABLED" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("blocks legacy generation without falling back to another provider", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    await expect(
      completeGeneration({
        openRouter: {
          apiKey: "synthetic-key",
          body: { model: "fixture-model" },
          fetchImpl,
        },
      }),
    ).rejects.toMatchObject({ code: "INFERENCE_UPSTREAM_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an OpenRouter endpoint disguised as a neutral provider", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    const result = await inferenceCompletion({
      apiKey: "synthetic-key",
      profile: {
        provider: "fixture-provider",
        model: "fixture-model",
        protocol: "chat-completions",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        auth: "bearer",
        capabilities: {
          maxOutputTokens: 100,
          outputFormats: ["text"],
          completionTokenField: "max_tokens",
        },
      },
      request: {
        messages: [{ role: "user", content: "Hello" }],
        maxOutputTokens: 20,
      },
      fetchImpl,
    });
    expect(result).toMatchObject({
      status: "error",
      text: "",
      error: { code: "provider-disabled" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps Go requests working but never permits redirect following", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: "completed" }));
    const response = await postInferenceJson({
      url: "https://opencode.ai/inference/go/v1/responses",
      headers: { Authorization: "Bearer synthetic-key" },
      body: { model: "deepseek-v4.1-flash" },
      rejectRedirects: false,
      fetchImpl,
    });
    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://opencode.ai/inference/go/v1/responses",
      expect.objectContaining({ redirect: "error" }),
    );
  });
});
