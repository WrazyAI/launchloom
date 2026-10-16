/**
 * Timing instrumentation for the creative generation pipeline.
 *
 * The creative stage is dominated by long serialized model calls, browser
 * capture, and build work, but the pipeline-test report only records per-stage
 * totals. This module records per-phase entries (category, name, wall-clock
 * duration, outcome) so a completed run can be explained from measured
 * timings and compared against a matched baseline run.
 *
 * Entries are plain JSON so they can be persisted next to the other QA
 * evidence and read back by scripts/report-creative-timings.mjs. Instrumentation
 * is additive: it never changes pipeline decisions.
 */

function toWholeMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

/**
 * Create a recorder that collects timing entries for one pipeline scope
 * (a bakeoff invocation, a repair round, or a whole creative run).
 */
export function createTimingRecorder() {
  /** @type {Array<Record<string, any>>} */
  const entries = [];
  let sequence = 0;

  const record = ({
    category,
    name,
    startedAt = Date.now(),
    durationMs,
    status = "ok",
    details = null,
  }) => {
    entries.push({
      index: sequence,
      category: String(category || "general"),
      name: String(name || ""),
      startedAt: toWholeMs(startedAt),
      durationMs: toWholeMs(durationMs),
      status: status === "error" ? "error" : "ok",
      ...(details ? { details } : {}),
    });
    sequence += 1;
  };

  return {
    record,
    /**
     * Await `fn` and record its wall-clock duration. The error is recorded and
     * rethrown so instrumentation cannot swallow failures.
     */
    async time(category, name, fn, options = {}) {
      const startedAt = Date.now();
      try {
        const value = await fn();
        record({
          category,
          name,
          startedAt,
          durationMs: Date.now() - startedAt,
          details:
            typeof options.details === "function"
              ? options.details(value)
              : options.details,
        });
        return value;
      } catch (error) {
        record({
          category,
          name,
          startedAt,
          durationMs: Date.now() - startedAt,
          status: "error",
          details: {
            ...(typeof options.details === "function"
              ? {}
              : options.details || {}),
            error: String(error?.message || error).slice(0, 300),
          },
        });
        throw error;
      }
    },
    entries() {
      return entries.map((entry) => ({ ...entry }));
    },
    /**
     * Aggregate entries per category: call count and total/maximum wall time.
     * @returns {Record<string, {count: number, errorCount: number, totalMs: number, maxMs: number}>}
     */
    summary() {
      const byCategory = {};
      for (const entry of entries) {
        const bucket = (byCategory[entry.category] ||= {
          count: 0,
          errorCount: 0,
          totalMs: 0,
          maxMs: 0,
        });
        bucket.count += 1;
        if (entry.status === "error") bucket.errorCount += 1;
        bucket.totalMs += entry.durationMs;
        bucket.maxMs = Math.max(bucket.maxMs, entry.durationMs);
      }
      return byCategory;
    },
  };
}

/**
 * Reduce timing entries to per-category aggregates for compact reporting.
 * @param {Array<Record<string, any>>} entries
 * @returns {Record<string, {count: number, errorCount: number, totalMs: number, maxMs: number, names: Record<string, number>}>}
 */
export function summarizeTimingEntries(entries) {
  const byCategory = {};
  for (const entry of entries || []) {
    const bucket = (byCategory[entry.category] ||= {
      count: 0,
      errorCount: 0,
      totalMs: 0,
      maxMs: 0,
      names: {},
    });
    bucket.count += 1;
    if (entry?.status === "error") bucket.errorCount += 1;
    const duration = toWholeMs(entry?.durationMs);
    bucket.totalMs += duration;
    bucket.maxMs = Math.max(bucket.maxMs, duration);
    const name = String(entry?.name || "");
    bucket.names[name] = (bucket.names[name] || 0) + duration;
  }
  return byCategory;
}

/**
 * Emit one structured stdout line so a CI log can be scanned without parsing
 * the full evidence bundle. The JSON payload is prefixed for easy grepping.
 */
export function logTimingSummary(scope, summary) {
  try {
    console.log(
      JSON.stringify({
        launchloomTiming: String(scope || "creative"),
        summary,
      }),
    );
  } catch {
    // Logging must never break a run.
  }
}
