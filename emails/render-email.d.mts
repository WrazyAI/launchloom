export type LifecycleEmailInput = {
  audience: "developer" | "client" | "delivery-failure";
  kind?: string;
  clientName: string;
  previewUrl: string;
  reviewUrl?: string;
  clientFeedback?: string;
  revisionOutcome?: string;
  queuedFeedback?: string;
  queuedStage?: "developer" | "client";
};

export type LeadEmailInput = {
  name: string;
  phone: string;
  email: string;
  message: string;
  project: string;
  pageUrl?: string;
  qualification?: ReadonlyArray<readonly [string, string]>;
};

export function cleanEmailText(value: unknown, limit?: number): string;
export function cleanEmailLine(value: unknown, limit?: number): string;
export function escapeEmailHtml(value: unknown): string;
export function renderLifecycleEmail(input: LifecycleEmailInput): {
  subject: string;
  html: string;
  text: string;
};
export function renderLeadEmail(input: LeadEmailInput): {
  subject: string;
  html: string;
  text: string;
};
