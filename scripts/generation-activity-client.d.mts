import type {
  TraceContext,
  TraceEvent,
  TraceEventKind,
  TracePayloads,
} from "../src/lib/generation-activity";

export type ActivityClock = {
  now(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  randomUUID(): string;
};

export type ActivityDeliveryResult = {
  status: number;
  suppressed?: boolean;
  expired?: boolean;
};

export type ActivityTransport = {
  send(
    events: TraceEvent[],
    options: { signal: AbortSignal; attempt: number },
  ): Promise<ActivityDeliveryResult>;
};

export type ActivitySpool = {
  write(events: readonly unknown[]): Promise<void>;
  clear(): Promise<void>;
};

export type ActivityLimits = typeof import("../src/lib/generation-activity-contract.mjs").TRACE_LIMITS;

export type ActivityProducerStats = {
  queued: number;
  queueBytes: number;
  dropped: number;
  rejected: number;
  suppressed: boolean;
  lastHeartbeatAt: number | null;
  closed: boolean;
};

export type ActivityChildProducer = {
  context(): TraceContext;
  emit<K extends TraceEventKind>(kind: K, payload: TracePayloads[K]): boolean;
  flush(): Promise<void>;
  close(): Promise<void>;
  stats(): ActivityProducerStats;
};

export type ActivityProducer = ActivityChildProducer & {
  withContext(overrides: Partial<TraceContext>): ActivityChildProducer;
};

export function createActivityProducer(options: {
  context: TraceContext;
  privacy: import("../src/lib/generation-activity-contract.mjs").TracePrivacyPolicy;
  transport: ActivityTransport;
  spool?: ActivitySpool;
  clock?: ActivityClock;
  limits: ActivityLimits;
}): ActivityProducer;
