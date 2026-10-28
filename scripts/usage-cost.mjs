/**
 * Resolve one usage record's cost without inventing a price.
 *
 * Preferred order:
 * 1. provider-reported per-call amount: OpenRouter chat usage `usage.cost`, or
 *    the normalized OpenCode Go usage `usage.costUsd`;
 * 2. an explicit per-call `cost` field;
 * 3. the per-call computed `cache.cost` that both authoring lanes write
 *    (`opencodeGoUsageMetrics`/`logOpenRouterCacheUsage`).
 *
 * The original value is returned so decimal lexemes survive; unknown evidence
 * is null. An explicit zero stays a real zero, while a null provider amount
 * falls through to the next priced source instead of being treated as $0.
 */
const COST_FIELDS = [
  (record) => record?.usage?.cost,
  (record) => record?.usage?.costUsd,
  (record) => record?.cost,
  (record) => record?.cache?.cost,
];

export function usageRecordCost(record) {
  for (const field of COST_FIELDS) {
    const value = field(record);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}
