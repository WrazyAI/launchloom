export type LifecycleEmailInput = {
  audience: "developer" | "client" | "delivery-failure" | "manual-attention";
  kind?: string;
  clientName: string;
  previewUrl: string;
  reviewUrl?: string;
  sendAnywayUrl?: string;
  diagnosticPrUrl?: string;
  diagnosticRunUrl?: string;
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
  consent?: string;
  submittedAt?: string;
  businessPhone?: string;
};

export type LeadConfirmationEmailInput = {
  name: string;
  phone: string;
  email: string;
  message: string;
  project: string;
  pageUrl?: string;
  qualification?: ReadonlyArray<readonly [string, string]>;
  businessPhone?: string;
};

export type IntakeReceivedEmailInput = {
  businessName: string;
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
export function renderLeadConfirmationEmail(input: LeadConfirmationEmailInput): {
  subject: string;
  html: string;
  text: string;
};
export function renderIntakeReceivedEmail(input: IntakeReceivedEmailInput): {
  subject: string;
  html: string;
  text: string;
};
