import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { answerFollowUp } from "../src/agent-follow-ups/answer";
import { buildRevisionBrief } from "../src/agent-follow-ups/brief";
import { classifyFollowUp } from "../src/agent-follow-ups/classify";
import { network } from "./network";

const preview = {
  repository: "WrazyAI/example",
  attemptId: "attempt-1",
  project: "example",
  pr: 9,
  sha: "a".repeat(40),
  deploymentId: "4c1e9a2b",
  previewUrl: "https://4c1e9a2b.example.pages.dev",
};

const evidence = {
  attemptId: "attempt-1",
  repository: "WrazyAI/example",
  siteId: "example",
  issueNumber: 9,
  profile: "full-preview",
  renderer: "creative",
  verdict: "passed",
  selectedCandidateId: "candidate-b",
  candidates: [],
  gates: [],
  failures: [],
  routeChecks: [],
  assets: null,
  preview,
  recordedAt: 1_700_000_000_000,
};

const completion = (body: unknown) =>
  HttpResponse.json({
    status: "completed",
    model: "gpt-6-luna",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(body) }] }],
  });

describe("agent follow-up models", () => {
  it("classifies a question on the Go classifier model", async () => {
    network.use(
      http.post(
        "https://opencode.ai/inference/go/v1/responses",
        async ({ request }) => {
          const body = (await request.json()) as { model?: string };
          expect(body.model).toBe("gpt-6-luna");
          return completion({
            intent: "question",
            confidence: "high",
            edits: [],
            reason: "Asks for evidence.",
          });
        },
      ),
    );
    await expect(
      classifyFollowUp({
        apiKey: "test",
        text: "Why did mobile fail?",
        evidence,
      }),
    ).resolves.toMatchObject({ intent: "question" });
  });

  it("rejects prose-only suggestions", async () => {
    network.use(
      http.post("https://opencode.ai/inference/go/v1/responses", () =>
        completion({ answer: "No action needed.", suggestions: [] }),
      ),
    );
    await expect(
      answerFollowUp({
        apiKey: "test",
        text: "Why did mobile fail?",
        intent: "question",
        evidence,
        history: "",
      }),
    ).resolves.toEqual({ answer: "No action needed.", suggestions: [] });
  });

  it("falls back to no card on malformed model JSON", async () => {
    network.use(
      http.post("https://opencode.ai/inference/go/v1/responses", () =>
        HttpResponse.json({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "I think you should fix the hero.",
                },
              ],
            },
          ],
        }),
      ),
    );
    await expect(
      answerFollowUp({
        apiKey: "test",
        text: "Fix the hero",
        intent: "improvement",
        evidence,
        history: "",
      }),
    ).resolves.toEqual({ answer: "", suggestions: [] });
  });

  it("includes cause, edits, checks, evidence and base in the brief", () => {
    const brief = buildRevisionBrief({
      adminText: "The button is hidden.",
      preview,
      suggestion: {
        issue: "The contact action falls below the fold at 390px",
        probableCause: "The hero keeps its desktop height.",
        causeStatus: "probable",
        suggestedFix: "Move the action and reduce the image height.",
        edits: [
          {
            page: "home",
            section: "hero",
            instruction: "Place the secondary action beside the primary action.",
          },
        ],
        checks: ["Render the home page at 390px"],
        evidence: [{ label: "Mobile order check at 390px", source: "route-report" }],
        guardrails: ["Preserve verified facts and client assets."],
      },
    });
    expect(brief).toContain("Probable cause (probable)");
    expect(brief).toContain("Place the secondary action beside the primary action.");
    expect(brief).toContain("Render the home page at 390px");
    expect(brief).toContain("Mobile order check at 390px");
    expect(brief).toContain("Preserve verified facts and client assets.");
    expect(brief).toContain("4c1e9a2b.example.pages.dev");
    expect(brief).not.toContain("chain of thought");
  });
});
