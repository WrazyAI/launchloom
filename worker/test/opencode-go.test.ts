import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { opencodeGoCompletion } from "../src/opencode-go";
import { network } from "./network";

describe("Worker Go transport", () => {
  it("requires redirect refusal on outgoing Go requests", async () => {
    let redirectMode = "";
    network.use(
      http.post(
        "https://opencode.ai/inference/go/v1/responses",
        ({ request }) => {
          redirectMode = request.redirect;
          return HttpResponse.json({
            status: "completed",
            output: [{ content: [{ type: "output_text", text: "Hello" }] }],
          });
        },
      ),
    );
    const completion = await opencodeGoCompletion({
      apiKey: "synthetic-key",
      system: "Answer briefly.",
      user: "Hello",
      maxOutputTokens: 100,
    });
    expect(completion.text).toBe("Hello");
    expect(redirectMode).toBe("manual");
  });

  it("rejects a redirect response without contacting its destination", async () => {
    let redirectedRequests = 0;
    network.use(
      http.post(
        "https://opencode.ai/inference/go/v1/responses",
        () =>
          new HttpResponse(null, {
            status: 307,
            headers: {
              Location: "https://openrouter.ai/api/v1/chat/completions",
            },
          }),
      ),
      http.all("https://openrouter.ai/api/v1/chat/completions", () => {
        redirectedRequests += 1;
        return HttpResponse.json({});
      }),
    );
    await expect(
      opencodeGoCompletion({
        apiKey: "synthetic-key",
        system: "Answer briefly.",
        user: "Hello",
        maxOutputTokens: 100,
      }),
    ).rejects.toThrow("OpenCode Go returned 307");
    expect(redirectedRequests).toBe(0);
  });
});
