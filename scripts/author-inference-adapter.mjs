import { AUTHORING_STAGE_BUDGETS } from "./creative-authoring-output.mjs";
import {
  InferenceContractError,
  validateInferenceProfile,
} from "./inference-client.mjs";
import {
  completeGeneration,
  parseGenerationOutput,
} from "./generation-inference.mjs";

/**
 * Plug into authorExperienceCandidates({ generate }) without changing its source,
 * scoped repair, reference or promotion validators. Prompt preparation remains
 * owned by the caller; this adapter never substitutes a generic design prompt.
 * Explicit trusted configuration only, with no key/model/environment lookup.
 * @param {{profile: Record<string, any>, apiKey: string, prepareRequest: (stage: any) => any, fetchImpl?: typeof fetch, signal?: AbortSignal}} options
 */
export function createInferenceAuthorAdapter({
  profile,
  apiKey,
  prepareRequest,
  fetchImpl = fetch,
  signal,
}) {
  const target = structuredClone(validateInferenceProfile(profile));
  if (typeof prepareRequest !== "function")
    throw new InferenceContractError(
      "An author prompt preparation function is required.",
    );
  if (!target.capabilities.outputFormats.includes("json-schema"))
    throw new InferenceContractError(
      "Author inference requires structured schema output.",
    );
  return async (stageRequest) => {
    const budget = Object.hasOwn(AUTHORING_STAGE_BUDGETS, stageRequest.stage)
      ? AUTHORING_STAGE_BUDGETS[stageRequest.stage]
      : null;
    if (!budget) throw new InferenceContractError("Unknown authoring stage.");
    const request = await prepareRequest(stageRequest);
    if (request?.maxOutputTokens !== budget.maxTokens)
      throw new InferenceContractError(
        "Author output allowance must match the existing stage budget.",
      );
    if (request.outputFormat?.type !== "json-schema")
      throw new InferenceContractError(
        "Author inference requires structured schema output.",
      );
    const deadline = AbortSignal.timeout(budget.timeoutMs);
    const completion = await completeGeneration({
      inference: {
        profile: target,
        request,
        apiKey,
        fetchImpl,
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      },
    });
    return parseGenerationOutput(completion);
  };
}
