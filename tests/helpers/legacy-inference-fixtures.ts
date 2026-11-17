import { vi } from "vitest";

// Retain offline serialization/normalization coverage for historical payloads.
// Only suites that already replace fetch import this helper. This is a Vitest
// module mock, never a production environment switch or an enabled upstream.
// inference-upstream-policy.test.ts deliberately does NOT import this helper.
vi.mock(
  "../../scripts/inference-upstream-policy.mjs",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../scripts/inference-upstream-policy.mjs")
    >()),
    assertInferenceUpstreamAllowed: () => {},
  }),
);
