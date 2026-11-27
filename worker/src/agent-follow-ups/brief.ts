import type {
  AgentSuggestion,
  PreviewDelivery,
} from "../../../src/lib/agent-follow-ups";

export type BriefSuggestion = Pick<
  AgentSuggestion,
  | "issue"
  | "probableCause"
  | "causeStatus"
  | "suggestedFix"
  | "edits"
  | "checks"
  | "evidence"
  | "guardrails"
>;

export function buildRevisionBrief({
  suggestion,
  adminText,
  preview,
}: {
  suggestion: BriefSuggestion;
  adminText: string;
  preview: PreviewDelivery | null;
}): string {
  const base = preview
    ? `${preview.previewUrl} at ${preview.sha}`
    : "No pinned preview. Do not edit until a verified base is available.";
  return [
    "You are applying one admin-requested revision to an approved LaunchLoom preview.",
    "",
    `Admin request: ${adminText}`,
    "",
    "Issue",
    suggestion.issue,
    "",
    `Probable cause (${suggestion.causeStatus.replace(/_/gu, " ")})`,
    suggestion.probableCause,
    "",
    "Suggested solution",
    suggestion.suggestedFix,
    "",
    "Edits",
    ...suggestion.edits.map(
      (edit, index) =>
        `${index + 1}. ${edit.page} / ${edit.section}: ${edit.instruction}`,
    ),
    "",
    "Checks",
    ...suggestion.checks.map((check) => `- ${check}`),
    "",
    "Evidence used",
    ...suggestion.evidence.map((item) => `- ${item.label} (${item.source})`),
    "",
    "Guardrails",
    ...suggestion.guardrails.map((guardrail) => `- ${guardrail}`),
    "- Preserve verified facts, page order and client assets.",
    "- If any edit fails verification, do not replace the current preview.",
    "- Do not publish, send client email, or create a review link.",
    "",
    "Starting point",
    base,
    "Stop before editing if the base moved or is no longer available.",
  ].join("\n");
}
