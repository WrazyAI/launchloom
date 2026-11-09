import type {
  TraceEventKind,
  TracePayloads,
} from "../src/lib/generation-activity";
import type { ActivityChildProducer } from "./generation-activity-client.mjs";

export function traceDecimal(value: unknown): string | null;
export function toTraceUsage(usage: unknown): TracePayloads["usage"]["usage"];
export function observeModelCall<T>(options: {
  producer: Pick<ActivityChildProducer, "emit"> | null | undefined;
  provider: string;
  model: string;
  callId?: string;
  invoke(onProgress?: (progress: {
    visibleChars: number;
    reasoningDeltas: number;
    elapsedMs: number;
  }) => void): Promise<T>;
  normalize?(value: T): {
    status?: unknown;
    text?: unknown;
    usage?: unknown;
    error?: { code?: unknown };
  };
}): Promise<T>;
