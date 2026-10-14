import type { InferenceProfile } from "./inference-client.mjs";

export declare const OPENCODE_GO_RESPONSES_ENDPOINT: string;
export declare const OPENCODE_GO_SESSION_HEADER: string;
export declare const OPENCODE_GO_USER_AGENT: string;
export declare const AUTHOR_RESPONSES_SCHEMA_NAME: string;
export declare const AUTHOR_CACHE_BOUNDARY_TEXT: string;
export declare function opencodeGoWireModel(logicalModel: string): string;
export declare function opencodeGoResponsesProfile(options?: {
  logicalModel?: string;
  maxOutputTokens?: number;
}): InferenceProfile;
export declare function opencodeGoCashCostUsd(
  usage: Record<string, any> | null | undefined,
): number | null;
export declare function opencodeGoUsageMetrics(
  usage: Record<string, any> | null | undefined,
  options?: { label?: string; logger?: ((...args: any[]) => void) | null },
): Record<string, any>;
export declare function responsesImagePart(
  chatImagePart: any,
  detail?: string,
): { type: "image"; url: string; detail: string };
export declare function buildAuthorResponsesRequest(
  input: Record<string, any>,
): Record<string, any>;
export declare function buildSiteCopyResponsesRequest(
  input: Record<string, any>,
): Record<string, any>;
