export type PreviewDelivery = {
  repository: string;
  attemptId: string;
  project: string;
  pr: number;
  sha: string;
  deploymentId: string;
  previewUrl: string;
};

export type PreviewDeliveryPayload = PreviewDelivery;

export type AgentCandidate = {
  id: string;
  score: number | null;
  selected: boolean;
};

export type AgentGate = {
  name: string;
  status: string;
  summary: string | null;
};

export type AgentFailure = {
  stage: string;
  code: string | null;
  summary: string | null;
};

export type AgentRouteCheck = {
  route: string;
  viewport: string;
  status: string;
  issues: string[];
};

export type AgentAssetSummary = {
  requested: number;
  placed: number;
  skipped: number;
  providerFailure: string | null;
};

export type AgentRunEvidence = {
  attemptId: string;
  repository: string;
  siteId: string | null;
  issueNumber: number | null;
  profile: string;
  renderer: string | null;
  verdict: string;
  selectedCandidateId: string | null;
  candidates: AgentCandidate[];
  gates: AgentGate[];
  failures: AgentFailure[];
  routeChecks: AgentRouteCheck[];
  assets: AgentAssetSummary | null;
  preview: PreviewDelivery | null;
  recordedAt: number;
};

export type AgentIntent = "question" | "improvement" | "mixed" | "unsupported";

export type SuggestionEdit = {
  page: string;
  section: string;
  instruction: string;
};

export type SuggestionEvidence = {
  label: string;
  source: string;
};

export type AgentSuggestionStatus =
  | "suggested"
  | "started"
  | "delivered"
  | "needs_review"
  | "failed";

export type AgentSuggestion = {
  id: string;
  messageId: string;
  issue: string;
  probableCause: string;
  causeStatus: "confirmed" | "probable" | "not_recorded";
  suggestedFix: string;
  edits: SuggestionEdit[];
  checks: string[];
  evidence: SuggestionEvidence[];
  guardrails: string[];
  brief: string;
  baseDeploymentId: string | null;
  baseSha: string | null;
  status: AgentSuggestionStatus;
  requestId: string | null;
  failure?: string | null;
};

export type AgentMessage = {
  id: string;
  role: "admin" | "agent";
  text: string;
  intent: AgentIntent | null;
  attemptId: string;
  createdAt: number;
  suggestions: AgentSuggestion[];
};

export type AgentThreadPage = {
  repository: string;
  messages: AgentMessage[];
  nextCursor: string | null;
  latestPreview: PreviewDelivery | null;
  latestEvidence: AgentRunEvidence | null;
  activeRequestId: string | null;
  writable: boolean;
};

export type AgentSuggestionInput = Omit<
  AgentSuggestion,
  "id" | "messageId" | "status" | "requestId" | "baseDeploymentId" | "baseSha"
> & {
  baseDeploymentId?: string | null;
  baseSha?: string | null;
};

export type AgentExchangeInput = {
  repo: string;
  attemptId: string;
  adminText: string;
  agentText: string;
  intent: AgentIntent;
  suggestions: AgentSuggestionInput[];
};

export type AgentFollowUpSubmission = {
  requestId: string;
  text: string;
  mode: "auto" | "question" | "improvement";
  baseDeploymentId?: string;
};

export type AgentFollowUpResponse = {
  ok: true;
  thread?: AgentThreadPage;
  fallback?: "choose_mode";
};
