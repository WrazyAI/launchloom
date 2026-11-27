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

