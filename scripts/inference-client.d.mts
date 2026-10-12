export type InferenceProtocol = "chat-completions" | "responses" | "messages";
export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type InferenceProfile = {
  provider: string;
  model: string;
  protocol: InferenceProtocol;
  endpoint: string;
  auth: "bearer" | "api-key";
  userAgent?: string;
  sessionHeader?: string;
  apiVersion?: string;
  capabilities: {
    images?: boolean;
    imageDetail?: boolean;
    temperature?: boolean;
    outputFormats: Array<"text" | "json" | "json-schema">;
    maxOutputTokens: number;
    completionTokenField?: "max_tokens" | "max_completion_tokens";
    reasoning?: {
      mode: "effort" | "budget" | "adaptive";
      efforts?: ReasoningEffort[];
    };
  };
};
export type InferencePart =
  | { type: "text"; text: string }
  | { type: "image"; url: string; detail?: "low" | "high" | "auto" };
export type InferenceRequest = {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | InferencePart[];
  }>;
  maxOutputTokens: number;
  temperature?: number;
  reasoning?: { effort?: ReasoningEffort; budgetTokens?: number };
  outputFormat?:
    | { type: "text" | "json" }
    | { type: "json-schema"; name: string; schema: Record<string, unknown> };
  sessionId?: string;
};
export type InferenceResult = {
  provider: string;
  model: string;
  protocol: InferenceProtocol;
  id: string | null;
  status: "completed" | "incomplete" | "refused" | "requires-action" | "error";
  text: string;
  annotations: unknown[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    costUsd: number | null;
    costKind: "unreported" | "provider-reported";
  };
  error: null | { code: string; httpStatus: number | null };
  retryAfterSeconds: number | null;
};
export class InferenceContractError extends Error {}
export function validateInferenceProfile<T extends InferenceProfile>(
  profile: T,
): T;
export function buildInferenceRequest(
  profile: InferenceProfile,
  request: InferenceRequest,
): { url: string; headers: Record<string, string>; body: Record<string, any> };
export function postInferenceJson(options: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  rejectRedirects?: boolean;
}): Promise<Response>;
export function normalizeInferenceResponse(
  profile: InferenceProfile,
  payload: unknown,
  options?: { httpStatus?: number; headers?: Headers; now?: number },
): InferenceResult;
export function requireCompletedInference(result: InferenceResult): string;
export function inferenceCompletion(options: {
  profile: InferenceProfile;
  request: InferenceRequest;
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<InferenceResult>;
