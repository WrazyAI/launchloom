import { describe, expect, it, vi } from "vitest";
import {
  requestSystemOne,
  TypeSafeSystemOneError,
} from "../scripts/typesafe-system-one.mjs";

const questions = {
  complexity: {
    type: "score",
    instructions: "Assess implementation complexity.",
    criteria: ["Low", "Moderate", "High", "Extreme"],
  },
};

describe("TypeSafe System One transport", () => {
  it("sends one pinned System One request with the expected server-side headers", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) =>
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            complexity: {
              type: "score",
              score: 1,
              confidence: 0.9,
              legend: { "0": "Low", "1": "Moderate", "2": "High", "3": "Extreme" },
              probabilities: { "0": 0.1, "1": 0.8, "2": 0.08, "3": 0.02 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
        { status: 200 },
      ),
    );

    const result = await requestSystemOne({
      apiKey: "typesafe-test-key",
      model: "jev-1.13.0",
      state: { routeCount: 3 },
      questions,
      fetchImpl: fetchImpl as any,
    });

    expect(result.model).toBe("jev-1.13.0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer typesafe-test-key",
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "LaunchLoom reasoning preflight",
    });
    expect(JSON.parse(String(options.body))).toEqual({
      model: "jev-1.13.0",
      state: { routeCount: 3 },
      questions,
    });
  });

  it("rejects missing credentials and moving aliases before network access", async () => {
    const fetchImpl = vi.fn();

    await expect(
      requestSystemOne({
        apiKey: "",
        model: "jev-1.13.0",
        state: {},
        questions,
        fetchImpl: fetchImpl as any,
      }),
    ).rejects.toMatchObject({
      name: "TypeSafeSystemOneError",
      code: "missing-api-key",
    });

    await expect(
      requestSystemOne({
        apiKey: "typesafe-test-key",
        model: "jev-latest",
        state: {},
        questions,
        fetchImpl: fetchImpl as any,
      }),
    ).rejects.toMatchObject({
      name: "TypeSafeSystemOneError",
      code: "unpinned-model",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry provider HTTP failures and retains bounded safe diagnostics", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("<html>provider\n unavailable</html>", { status: 503 }),
    );

    let error: any;
    try {
      await requestSystemOne({
        apiKey: "typesafe-test-key",
        model: "jev-1.13.0",
        state: {},
        questions,
        fetchImpl: fetchImpl as any,
      });
    } catch (caught) {
      error = caught;
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(TypeSafeSystemOneError);
    expect(error).toMatchObject({
      status: 503,
      code: "http-error",
    });
    expect(error.body).toContain("provider unavailable");
    expect(error.body.length).toBeLessThanOrEqual(1500);
  });

  it("fails closed on malformed or invalid successful response envelopes", async () => {
    await expect(
      requestSystemOne({
        apiKey: "typesafe-test-key",
        model: "jev-1.13.0",
        state: {},
        questions,
        fetchImpl: (async () =>
          new Response("{not-json", { status: 200 })) as any,
      }),
    ).rejects.toMatchObject({
      code: "malformed-json",
      status: 200,
    });

    await expect(
      requestSystemOne({
        apiKey: "typesafe-test-key",
        model: "jev-1.13.0",
        state: {},
        questions,
        fetchImpl: (async () =>
          new Response(JSON.stringify({ model: "jev-1.13.0" }), {
            status: 200,
          })) as any,
      }),
    ).rejects.toMatchObject({
      code: "invalid-envelope",
      status: 200,
    });
  });
});
