import type { TraceContext, TraceIdentity } from "../src/lib/generation-activity";
import type {
  ActivityChildProducer,
  ActivityProducer,
  ActivityTransport,
} from "./generation-activity-client.mjs";

export type ActivitySemantic = {
  stage?: string;
  substep?: string | null;
  taskId?: string | null;
  parentTaskId?: string | null;
  candidateId?: string | null;
  repairPass?: number | null;
  actor?: TraceContext["actor"];
  sensitiveValues?: readonly string[];
};

export type ActivityDependencies = {
  fetchImpl?: typeof fetch;
  clock?: import("./generation-activity-client.mjs").ActivityClock;
  spoolDir?: string | null;
  transport?: ActivityTransport;
  fsImpl?: {
    mkdir(path: string, options: { recursive: boolean; mode: number }): Promise<unknown>;
    writeFile(path: string, data: string, options: { mode: number }): Promise<unknown>;
    rm(path: string, options: { force: boolean }): Promise<unknown>;
  };
};

export function collectSensitiveValues(
  env?: Record<string, string | undefined>,
): string[];
export function activityIdentity(
  env?: Record<string, string | undefined>,
): (TraceIdentity & { producerId: string }) | null;
export function createActivityTransport(options: {
  env?: Record<string, string | undefined>;
  identity: TraceIdentity;
  fetchImpl?: typeof fetch;
}): ActivityTransport;
export function createFileSpool(options: {
  dir: string;
  fsImpl?: ActivityDependencies["fsImpl"];
  now?: () => number;
  randomUUID?: () => string;
}): import("./generation-activity-client.mjs").ActivitySpool;
export function noopActivityProducer(): ActivityChildProducer & {
  context(): null;
  stats(): import("./generation-activity-client.mjs").ActivityProducerStats & { disabled: true };
};
export function activityFromEnv(
  env?: Record<string, string | undefined>,
  semantic?: ActivitySemantic,
  dependencies?: ActivityDependencies,
): ActivityProducer;
