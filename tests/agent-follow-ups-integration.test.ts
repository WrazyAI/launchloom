import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildRevisionBrief } from "../worker/src/agent-follow-ups/brief";

describe("agent follow-up integration boundary", () => {
  it("sends a complete brief and no client delivery", async () => {
    const brief = buildRevisionBrief({
      adminText: "The mobile button is hidden.",
      preview: {
        repository: "WrazyAI/site-a",
        attemptId: "attempt-a",
        project: "site-a",
        pr: 9,
        sha: "a".repeat(40),
        deploymentId: "4c1e9a2b",
        previewUrl: "https://4c1e9a2b.site-a.pages.dev",
      },
      suggestion: {
        issue: "The contact action falls below the fold",
        probableCause: "The hero keeps its desktop height.",
        causeStatus: "probable",
        suggestedFix: "Move the action and reduce the image height.",
        edits: [
          {
            page: "home",
            section: "hero",
            instruction: "Move the action above the fold.",
          },
        ],
        checks: ["Render at 390px"],
        evidence: [{ label: "Mobile check", source: "route-report" }],
        guardrails: ["Preserve verified facts."],
      },
    });
    expect(brief).toContain("Issue");
    expect(brief).toContain("Probable cause (probable)");
    expect(brief).toContain("Suggested solution");
    expect(brief).toContain("Move the action above the fold.");
    expect(brief).toContain("https://4c1e9a2b.site-a.pages.dev");
    expect(brief).toContain("Do not publish, send client email, or create a review link.");
  });

  it("keeps email and publication out of the agent workflow", async () => {
    const workflow = await readFile(
      ".github/workflows/process-agent-follow-up.yml",
      "utf8",
    );
    expect(workflow).not.toContain("send-preview-email");
    expect(workflow).not.toContain("create-review-link");
    expect(workflow).not.toContain("/api/internal/publications");
  });
});
