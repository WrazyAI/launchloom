import type {
  InferenceProfile,
  InferenceRequest,
  InferenceResult,
} from "./inference-client.mjs";
import type { TraceContext } from "../src/lib/generation-activity";
import type { ActivityProducer } from "./generation-activity-client.mjs";

type ActivityOptions = {
  producer: ActivityProducer;
  context?: Partial<TraceContext>;
  callId?: string;
};

type LegacyOptions = {
  apiKey?: string;
  title?: string;
  body: Record<string, any>;
  signal?: AbortSignal;
  sessionId?: string;
  responseCache?: boolean;
  responseCacheTtlSeconds?: number;
  fetchImpl?: typeof fetch;
};
type NeutralOptions = {
  profile: InferenceProfile;
  request: InferenceRequest;
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};
type LegacyCompletion = {
  result: InferenceResult;
  legacy: {
    response: Response;
    payload: Record<string, any>;
    rawBody: string;
    parseError: Error | null;
  };
};
type NeutralCompletion = { result: InferenceResult; legacy: null };
export class GenerationInferenceError extends Error {
  constructor(result: InferenceResult);
  result: InferenceResult;
}
export function completeGeneration(options: {
  openRouter: LegacyOptions;
  inference?: never;
  activity?: ActivityOptions | null;
}): Promise<LegacyCompletion>;
export function completeGeneration(options: {
  inference: NeutralOptions;
  openRouter?: never;
  activity?: ActivityOptions | null;
}): Promise<NeutralCompletion>;
export function parseGenerationOutput(
  completion: LegacyCompletion | NeutralCompletion,
): unknown;
