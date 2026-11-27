import type {
  AgentIntent,
  AgentRunEvidence,
  SuggestionEdit,
} from "../../../src/lib/agent-follow-ups";
import { opencodeGoCompletion } from "../opencode-go";

export type RawSuggestion = {
  issue: string;
  probableCause: string;
  causeStatus: "confirmed" | "probable" | "not_recorded";
  suggestedFix: string;
  edits: SuggestionEdit[];
  checks: string[];
  evidence: Array<{ label: string; source: string }>;
  guardrails: string[];
};

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "issue",
    "probableCause",
    "causeStatus",
    "suggestedFix",
    "edits",
    "checks",
    "evidence",
    "guardrails",
  ],
  properties: {
    issue: { type: "string", maxLength: 180 },
    probableCause: { type: "string", maxLength: 500 },
    causeStatus: {
      type: "string",
      enum: ["confirmed", "probable", "not_recorded"],
    },
    suggestedFix: { type: "string", maxLength: 500 },
    edits: {
      type: "array",
      minItems: 1,
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
    checks: {
      type: "array",
      maxItems: 10,
      items: { type: "string", maxLength: 240 },
    },
    evidence: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "source"],
        properties: {
          label: { type: "string", maxLength: 180 },
          source: { type: "string", maxLength: 120 },
        },
      },
    },
    guardrails: {
      type: "array",
      maxItems: 10,
      items: { type: "string", maxLength: 240 },
    },
  },
};

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "suggestions"],
  properties: {
    answer: { type: "string", maxLength: 2_400 },
    suggestions: {
      type: "array",
      maxItems: 3,
      items: SUGGESTION_SCHEMA,
    },
  },
};

function summary(evidence: AgentRunEvidence | null): string {
  if (!evidence) return "No structured run evidence was recorded.";
  return JSON.stringify(evidence);
}

function normalizeSuggestion(value: unknown): RawSuggestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const issue = String(body.issue || "").trim().slice(0, 180);
  const suggestedFix = String(body.suggestedFix || "").trim().slice(0, 500);
  const edits = Array.isArray(body.edits)
    ? body.edits
        .filter((edit) => edit && typeof edit === "object")
        .slice(0, 12)
        .map((edit) => {
          const row = edit as Record<string, unknown>;
          return {
            page: String(row.page || "").trim().slice(0, 80),
            section: String(row.section || "").trim().slice(0, 80),
            instruction: String(row.instruction || "").trim().slice(0, 300),
          };
        })
        .filter((edit) => edit.page && edit.section && edit.instruction)
    : [];
  if (!issue || !suggestedFix || !edits.length) return null;
  const causeStatus = ["confirmed", "probable", "not_recorded"].includes(
    String(body.causeStatus),
  )
    ? (body.causeStatus as RawSuggestion["causeStatus"])
    : "probable";
  const strings = (value: unknown, limit: number) =>
    Array.isArray(value)
      ? value
          .slice(0, limit)
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];
  const evidence = Array.isArray(body.evidence)
    ? body.evidence
        .filter((item) => item && typeof item === "object")
        .slice(0, 10)
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            label: String(row.label || "").trim().slice(0, 180),
            source: String(row.source || "").trim().slice(0, 120),
          };
        })
        .filter((item) => item.label && item.source)
    : [];
  return {
    issue,
    probableCause: String(body.probableCause || "")
      .trim()
      .slice(0, 500),
    causeStatus,
    suggestedFix,
    edits,
    checks: strings(body.checks, 10),
    evidence,
    guardrails: strings(body.guardrails, 10),
  };
}

export async function answerFollowUp({
  apiKey,
  text,
  intent,
  evidence,
  history,
  signal,
}: {
  apiKey: string;
  text: string;
  intent: AgentIntent;
  evidence: AgentRunEvidence | null;
  history: string;
  signal?: AbortSignal;
}): Promise<{ answer: string; suggestions: RawSuggestion[] }> {
  const result = await opencodeGoCompletion({
    apiKey,
    model: "deepseek-v4.1-flash",
    system:
      "You answer an admin about a generated website. Use only the supplied run evidence and thread. If a reason was not recorded, say so. You may propose up to three bounded fixes. Each fix needs a real issue, a probable cause with causeStatus, a suggested fix, edits naming page and section, checks, evidence references, and guardrails. Do not propose a fix when the request is only a question. Never invent facts, prices, reviews, credentials, or outcomes. Never publish or email. Answer in plain language with no em dashes.",
    user: `RUN EVIDENCE\n${summary(evidence)}\n\nTHREAD\n${history}\n\nADMIN MESSAGE\n${text}\n\nINTENT\n${intent}`,
    outputFormat: {
      type: "json-schema",
      name: "agent_follow_up_answer",
      schema: ANSWER_SCHEMA,
    },
    maxOutputTokens: 3_000,
    sessionId: "launchloom-agent-follow-up-answer",
    signal,
  });
  let parsed: { answer?: unknown; suggestions?: unknown };
  try {
    parsed = JSON.parse(result.text) as typeof parsed;
  } catch {
    return { answer: "", suggestions: [] };
  }
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .slice(0, 3)
        .map(normalizeSuggestion)
        .filter((item): item is RawSuggestion => item !== null)
    : [];
  return {
    answer: typeof parsed.answer === "string" ? parsed.answer.slice(0, 2_400) : "",
    suggestions,
  };
}
