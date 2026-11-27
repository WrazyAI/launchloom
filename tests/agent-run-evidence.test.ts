import { describe, expect, it } from "vitest";
import { buildAgentRunEvidence } from "../scripts/build-agent-run-evidence.mjs";

const preview = {
  repository: "WrazyAI/example",
  attemptId: "attempt-0001",
  project: "example",
  pr: 9,
  sha: "a".repeat(40),
  deploymentId: "4c1e9a2b",
  previewUrl: "https://4c1e9a2b.example.pages.dev",
};

describe("agent run evidence", () => {
  it("keeps the recorded outcome and marks missing evidence", () => {
    const evidence = buildAgentRunEvidence({
      report: {
        profile: "full-preview",
        candidateCount: 2,
        selectedCandidateId: "candidate-b",
        stages: {
          creative: { status: "passed" },
          technical: { status: "failed", error: "Contrast failed." },
        },
        previewDelivered: true,
      },
      assets: { requested: 3, placed: 2, skipped: 1, providerFailure: null },
      preview,
    });
    expect(evidence.verdict).toBe("failed");
    expect(evidence.candidates).toEqual([
      { id: "candidate-a", score: null, selected: false },
      { id: "candidate-b", score: null, selected: true },
    ]);
    expect(evidence.gates).toContainEqual({
      name: "technical",
      status: "failed",
      summary: "Contrast failed.",
    });
    expect(evidence.routeChecks).toEqual([]);
    expect(evidence.assets).toEqual({
      requested: 3,
      placed: 2,
      skipped: 1,
      providerFailure: null,
    });
  });

  it("bounds long strings and preserves missing fields as null", () => {
    const evidence = buildAgentRunEvidence({
      report: {
        profile: "full-preview",
        stages: { technical: { status: "failed", error: "x".repeat(900) } },
      },
      preview: null,
    });
    expect(evidence.selectedCandidateId).toBeNull();
    expect(evidence.preview).toBeNull();
    expect(evidence.gates[0]?.summary).toHaveLength(240);
  });

  it("maps creative bakeoff candidates when no pipeline report exists", () => {
    const evidence = buildAgentRunEvidence({
      creativeSummary: {
        selectedCandidateId: "candidate-b",
        candidates: [
          { candidateId: "candidate-a", visualScore: 41 },
          { candidateId: "candidate-b", visualScore: 58 },
        ],
      },
    });
    expect(evidence.verdict).toBe("unknown");
    expect(evidence.candidates).toEqual([
      { id: "candidate-a", score: 41, selected: false },
      { id: "candidate-b", score: 58, selected: true },
    ]);
  });
});
