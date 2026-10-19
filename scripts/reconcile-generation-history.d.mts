import type { AttemptObservation } from "./generation-tracking-contract.mjs";
import type { AttemptEventInput } from "../src/lib/admin-contracts";
export type ReconcileCheckpoint = {
  workflow: number;
  page: number;
  from: number;
  partial?: boolean;
};
export type ReconcileReport = {
  complete: boolean;
  nextCheckpoint: string | null;
  coverageStart: number | null;
  readCount: number;
  upsertCount: number;
  warnings: string[];
  errors: string[];
};
export type ReconcileBatch = {
  attempts: Array<{
    observation: AttemptObservation;
    events: AttemptEventInput[];
  }>;
  checkpoint: string | null;
  health: {
    lastSyncAt: number | null;
    coverageStart: number | null;
    partial: boolean;
    lastError: string | null;
  };
};
export function reconcileGenerationHistory(options?: {
  mode?: "incremental" | "backfill";
  from?: number | string;
  dryRun?: boolean;
  pageBudget?: number;
  deadlineMs?: number;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  postImpl?: (batch: ReconcileBatch) => Promise<unknown>;
  checkpoint?: string | ReconcileCheckpoint | null;
  sleepImpl?: (ms: number) => Promise<unknown>;
  now?: () => number;
  token?: string;
}): Promise<ReconcileReport>;
