import { OPENROUTER_CHAT_COMPLETIONS_URL } from "./openrouter-client.mjs";
/** Counts completion fetches before network, including failed calls and retries. */
export function createQaRepairCallBudget({ fetchImpl = fetch } = {}) {
  let total = 0;
  const candidates = new Map();
  return {
    forCandidate(candidateId) {
      if (!/^candidate-[abc]$/.test(candidateId)) throw new Error("Unknown QA candidate.");
      return async (url, options) => {
        if (url !== OPENROUTER_CHAT_COMPLETIONS_URL || options?.method !== "POST")
          throw new Error("QA repair fetch must target the completion endpoint.");
        const used = candidates.get(candidateId) || 0;
        if (used >= 1 || total >= 2) {
          const error = new Error("QA repair provider-call budget exhausted.");
          error.code = "QA_REPAIR_CALL_BUDGET_EXHAUSTED"; throw error;
        }
        candidates.set(candidateId, used + 1); total++;
        return fetchImpl(url, options);
      };
    },
    snapshot() { return { total, limit: 2, candidates: Object.fromEntries(candidates) }; },
  };
}
