// Network policy, not a provider selector. No credential or environment flag
// can enable OpenRouter, including NODE_ENV=test and VITEST.
export class InferenceUpstreamDisabledError extends Error {
  constructor() {
    super("OpenRouter inference is disabled. Use the OpenCode Go upstream.");
    this.name = "InferenceUpstreamDisabledError";
    this.code = "INFERENCE_UPSTREAM_DISABLED";
  }
}

export function assertInferenceUpstreamAllowed(url) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/\.+$/u, "");
  if (hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai"))
    throw new InferenceUpstreamDisabledError();
}
