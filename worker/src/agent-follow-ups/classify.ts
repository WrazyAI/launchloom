import type { AgentRunEvidence, AgentIntent } from "../../../src/lib/agent-follow-ups";
import { opencodeGoCompletion } from "../opencode-go";

export type Classification = {
  intent: AgentIntent;
  confidence: "high" | "medium" | "low";
  edits: Array<{ page: string; section: string; instruction: string }>;
  reason: string;
};

const CLASSIFIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence", "edits", "reason"],
  properties: {
    intent: {
      type: "string",
      enum: ["question", "improvement", "mixed", "unsupported"],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    edits: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "section", "instruction"],
        properties: {
          page: { type: "string", maxLength: 80 },
          section: { type: "string", maxLength: 80 },
          instruction: { type: "string", maxLength: 300 },
        },
      },
    },
    reason: { type: "string", maxLength: 300 },
  },
};

function summary(evidence: AgentRunEvidence | null): string {
  if (!evidence) return "No structured run evidence was recorded.";
  return JSON.stringify({
    attemptId: evidence.attemptId,
    profile: evidence.profile,
    verdict: evidence.verdict,
    selectedCandidateId: evidence.selectedCandidateId,
    candidates: evidence.candidates,
    gates: evidence.gates,
    failures: evidence.failures,
    assets: evidence.assets,
    preview: evidence.preview
      ? { deploymentId: evidence.preview.deploymentId, sha: evidence.preview.sha }
      : null,
  });
}

export async function classifyFollowUp({
  apiKey,
  text,
  evidence,
  signal,
}: {
  apiKey: string;
  text: string;
  evidence: AgentRunEvidence | null;
  signal?: AbortSignal;
}): Promise<Classification> {
  const result = await opencodeGoCompletion({
    apiKey,
    model: "gpt-6-luna",
    system:
      "Classify one admin follow-up about a generated website. Return JSON only. A question asks for evidence or explanation. An improvement asks for a site change. Mixed does both. Unsupported is unrelated or cannot be expressed as page edits. Edits must name a page and a section and describe a bounded change. Never invent evidence.",
    user: `RUN SUMMARY\n${summary(evidence)}\n\nADMIN MESSAGE\n${text}`,
    outputFormat: {
      type: "json-schema",
      name: "agent_follow_up_classification",
      schema: CLASSIFIER_SCHEMA,
    },
    maxOutputTokens: 1_200,
    sessionId: "launchloom-agent-follow-up-classifier",
    signal,
  });
  const parsed = JSON.parse(result.text) as Partial<Classification>;
  if (
    !["question", "improvement", "mixed", "unsupported"].includes(
      String(parsed.intent),
    ) ||
    !["high", "medium", "low"].includes(String(parsed.confidence)) ||
    !Array.isArray(parsed.edits)
  )
    throw new Error("Invalid follow-up classification.");
  return {
    intent: parsed.intent as AgentIntent,
    confidence: parsed.confidence as Classification["confidence"],
    edits: parsed.edits
      .filter((edit) => edit && typeof edit === "object")
      .slice(0, 12)
      .map((edit) => ({
        page: String(edit.page || "").slice(0, 80),
        section: String(edit.section || "").slice(0, 80),
        instruction: String(edit.instruction || "").slice(0, 300),
      })),
    reason: String(parsed.reason || "").slice(0, 300),
  };
}
