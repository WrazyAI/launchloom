import {
  InferenceContractError,
  inferenceCompletion,
  normalizeInferenceResponse,
  requireCompletedInference,
} from "./inference-client.mjs";
import { parseModelJson } from "./model-json.mjs";
import {
  openRouterChatCompletion,
  readOpenRouterResponseEnvelope,
} from "./openrouter-client.mjs";

export class GenerationInferenceError extends Error {
  constructor(result) {
    super(`Generation did not complete (${result.status}).`);
    this.name = "GenerationInferenceError";
    // Retain safe quota/cancellation/provenance data for orchestration without
    // source, annotations, raw provider payloads or secret-bearing diagnostics.
    this.result = structuredClone({ ...result, text: "", annotations: [] });
  }
}

/**
 * Explicit generation boundary, not an environment-controlled provider router.
 * Legacy callers retain their raw envelope for existing diagnostics/accounting.
 * Neutral callers receive only the normalized result, never a fabricated
 * OpenRouter envelope or invented usage/cost fields.
 * @param {{openRouter?: Record<string, any>, inference?: Record<string, any>}} options
 */
export async function completeGeneration({ openRouter, inference }) {
  if (Boolean(openRouter) === Boolean(inference))
    throw new InferenceContractError(
      "Choose exactly one generation transport.",
    );
  if (inference) {
    const result = await inferenceCompletion(inference);
    return { result, legacy: null };
  }
  const response = await openRouterChatCompletion(openRouter);
  const envelope = await readOpenRouterResponseEnvelope(response);
  // These capabilities are deliberately text-only and never used for request
  // selection. This profile describes the legacy response protocol, not model
  // capability acceptance or permission to dispatch a new request.
  const responseProfile = {
    provider: "openrouter",
    model: openRouter.body?.model,
    protocol: "chat-completions",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    auth: "bearer",
    capabilities: {
      maxOutputTokens: 1,
      outputFormats: ["text"],
      completionTokenField: "max_tokens",
    },
  };
  const result = normalizeInferenceResponse(responseProfile, envelope.payload, {
    httpStatus: response.status,
    headers: response.headers,
  });
  return { result, legacy: { response, ...envelope } };
}

/** All generation callers must pass the completion gate before JSON parsing. */
export function parseGenerationOutput(completion) {
  if (completion.result.status !== "completed")
    throw new GenerationInferenceError(completion.result);
  return parseModelJson(requireCompletedInference(completion.result));
}
