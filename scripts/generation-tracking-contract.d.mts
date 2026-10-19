import type {
  AttemptEventInput,
  AttemptEventSource,
  GenerationProfile,
  ExecutionStatus,
  DeliveryStatus,
  Failure,
} from "../src/lib/admin-contracts";
export type AttemptObservation = {
  repository: string;
  runId: string;
  runAttempt: number;
  requestId: string | null;
  attemptId: string | null;
  profile: GenerationProfile;
  issueNumber: number | null;
  triggeringActor: string | null;
  executionStatus: ExecutionStatus;
  deliveryStatus: DeliveryStatus;
  observedAt: number;
  source: AttemptEventSource;
  createdAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  failure: Failure;
};
export const TRACKING_REPOSITORY: string;
export const GENERATION_PROFILES: string[];
export function strictKeys(value: unknown, keys: string[]): void;
export function safeEvidenceUrl(value: unknown): string | null;
export function redactTrackingText(
  value: unknown,
  limit?: number,
): string | null;
export function buildAttemptObservation(input: unknown): AttemptObservation;
export function buildAttemptEvents(
  events: unknown,
  observation: AttemptObservation,
): AttemptEventInput[];
export function parseGenerationRunName(
  value: unknown,
): {
  issueNumber: number;
  profile: GenerationProfile;
  requestId: string | null;
} | null;
