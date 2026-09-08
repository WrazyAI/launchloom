import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateSiteConfigWithModel,
  parseModelJson,
} from "../scripts/generate-site-config.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("model JSON response parsing", () => {
  const expected = { preset: "home-services", business: { name: "Mike" } };

  it.each([
    ["plain JSON", JSON.stringify(expected)],
    [
      "JSON code fence",
      `\`\`\`json\n${JSON.stringify(expected, null, 2)}\n\`\`\``,
    ],
    [
      "surrounding provider prose",
      `Here is the requested configuration.\n\`\`\`json\n${JSON.stringify(expected)}\n\`\`\`\nDone.`,
    ],
    [
      "text content parts",
      [
        { type: "text", text: "```json\n" },
        { type: "text", text: JSON.stringify(expected) },
        { type: "text", text: "\n```" },
      ],
    ],
  ])("accepts %s", (_label, content) => {
    expect(parseModelJson(content)).toEqual(expected);
  });

  it.each([
    ["empty content", ""],
    ["truncated JSON", '```json\n{"preset":"home-services"\n```'],
    ["JSON array", '[{"preset":"home-services"}]'],
    ["prose only", "I could not create the configuration."],
  ])("rejects %s", (_label, content) => {
    expect(() => parseModelJson(content)).toThrow(/valid JSON object/i);
  });

  it("generates a site when OpenRouter fences both generation responses", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``,
              },
            },
          ],
        }),
      ),
    );

    await expect(
      generateSiteConfigWithModel(
        {
          businessName: "Mike Seeders Plumbing Inc",
          services: "Plumbing repair",
          industry: "home-services",
          preset: "home-services",
        },
        "test-model",
      ),
    ).resolves.toMatchObject({
      business: { name: "Mike Seeders Plumbing Inc" },
      preset: "home-services",
    });
  });
});
