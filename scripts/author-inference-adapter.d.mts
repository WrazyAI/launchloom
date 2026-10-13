import type {
  InferenceProfile,
  InferenceRequest,
} from "./inference-client.mjs";
export function createInferenceAuthorAdapter(options: {
  profile: InferenceProfile;
  apiKey: string;
  prepareRequest: (stage: any) => InferenceRequest | Promise<InferenceRequest>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): (stage: any) => Promise<any>;
