import {
  buildTraceEvent,
  traceTextBytes,
} from "../src/lib/generation-activity-contract.mjs";

const CONTROL_KINDS = new Set([
  "coverage",
  "heartbeat",
  "producer_finished",
  "error",
  "task_finished",
  "model_finished",
]);

function defaultClock() {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    randomUUID: () => crypto.randomUUID(),
  };
}

function unref(handle) {
  if (handle && typeof handle.unref === "function") handle.unref();
  return handle;
}

function emptySpool() {
  return {
    async write() {},
    async clear() {},
  };
}

/**
 * Bounded, best-effort diagnostic producer.
 *
 * It never blocks or changes the wrapped generation: validation failures drop
 * the event, delivery failures are bounded, and authentication/validation
 * rejections are not retried or routed through a weaker channel. Events are
 * scrubbed synchronously before they reach the queue or the spool.
 */
export function createActivityProducer({
  context,
  privacy,
  transport,
  spool = emptySpool(),
  clock = defaultClock(),
  limits,
}) {
  const base = { ...context };
  // Mutable copy so callers can add exact private values discovered later
  // (for example intake contact fields) without rebuilding the producer.
  const effectivePrivacy = {
    allowedFields: privacy.allowedFields,
    sensitiveValues: [...privacy.sensitiveValues],
    allowSourceText: privacy.allowSourceText,
  };
  let sequence = 0;
  let queue = [];
  let queueBytes = 0;
  let inflight = null;
  let closed = false;
  let finishing = false;
  let timer = null;
  let heartbeat = null;
  let heartbeatAt = null;
  let dropped = 0;
  let rejected = 0;
  let deliveryFailed = false;
  let suppressed = false;

  function schedule() {
    if (closed || timer) return;
    // Periodic timers must never keep a finished Node process alive. The
    // process-scoped beforeExit hook flushes the final queue.
    timer = unref(
      clock.setTimeout(() => {
        timer = null;
        void flush();
      }, limits.flushIntervalMs),
    );
  }

  function removeIds(ids) {
    const set = new Set(ids);
    const removed = queue.filter((event) => set.has(event.eventId));
    if (!removed.length) return;
    for (const event of removed) queueBytes -= event.byteSize;
    queue = queue.filter((event) => !set.has(event.eventId));
  }

  function enqueue(event) {
    const size = traceTextBytes(JSON.stringify(event));
    const control = CONTROL_KINDS.has(event.kind);
    if (suppressed && !control) {
      dropped += 1;
      return false;
    }
    if (queueBytes + size > limits.maxQueueBytes) {
      if (!control) {
        dropped += 1;
        return false;
      }
      // Keep terminal evidence: evict the oldest verbose events first.
      for (const candidate of [...queue]) {
        if (queueBytes + size <= limits.maxQueueBytes) break;
        if (CONTROL_KINDS.has(candidate.kind)) continue;
        removeIds([candidate.eventId]);
        dropped += 1;
      }
      if (queueBytes + size > limits.maxQueueBytes) {
        dropped += 1;
        return false;
      }
    }
    queue.push({ ...event, byteSize: size });
    queueBytes += size;
    if (queue.length >= limits.flushEvents) {
      void flush();
    } else {
      schedule();
    }
    return true;
  }

  function emit(kind, payload, overrides = {}) {
    if (closed && !finishing) return false;
    sequence += 1;
    let event;
    try {
      event = buildTraceEvent(
        {
          schemaVersion: 1,
          eventId: clock.randomUUID(),
          context: { ...base, ...overrides.context },
          sequence,
          emittedAt: new Date(clock.now()).toISOString(),
          kind,
          payload,
        },
        effectivePrivacy,
      );
    } catch {
      // Diagnostic evidence must never break generation, and an invalid event
      // is never sent unvalidated.
      dropped += 1;
      return false;
    }
    return enqueue(event);
  }

  async function sendBatch(events) {
    const wire = events.map(({ byteSize: _byteSize, ...event }) => event);
    for (let attempt = 1; attempt <= limits.maxDeliveryAttempts; attempt += 1) {
      const controller = new AbortController();
      const deadline = clock.setTimeout(
        () => controller.abort(),
        limits.sendTimeoutMs,
      );
      try {
        const result = await transport.send(wire, {
          signal: controller.signal,
          attempt,
        });
        clock.clearTimeout(deadline);
        const status = Number(result?.status ?? 0);
        if (status >= 200 && status < 300) {
          if (result?.suppressed === true || result?.expired === true)
            suppressed = true;
          return { ok: true, permanent: false };
        }
        if ([400, 401, 403, 404].includes(status)) {
          // A rejection is never retried and never falls back to a weaker
          // channel. Drop the batch but keep counting it honestly.
          rejected += events.length;
          return { ok: true, permanent: true };
        }
      } catch (error) {
        clock.clearTimeout(deadline);
        if (attempt === 1) {
          const code = String(error?.code || error?.name || "unknown")
            .replace(/[^a-z0-9_-]/giu, "")
            .slice(0, 40);
          console.warn(`generation_activity_delivery=transport-error code=${code}`);
        }
      }
      if (attempt < limits.maxDeliveryAttempts) {
        await new Promise((resolve) =>
          clock.setTimeout(resolve, attempt === 1 ? 250 : 500),
        );
      }
    }
    return { ok: false, permanent: false };
  }

  async function runFlush() {
    while (queue.length) {
      const batch = queue.slice(0, limits.flushEvents);
      const ids = batch.map((event) => event.eventId);
      try {
        await spool.write(batch);
      } catch {
        // A broken spool must not stop delivery or the generation.
      }
      const result = await sendBatch(batch);
      if (!result.ok) {
        deliveryFailed = true;
        return;
      }
      removeIds(ids);
      try {
        await spool.clear();
      } catch {
        // Best effort only.
      }
    }
  }

  function flush() {
    if (inflight) return inflight;
    inflight = runFlush().finally(() => {
      inflight = null;
      if (queue.length && !closed) schedule();
    });
    return inflight;
  }

  function startHeartbeat() {
    heartbeat = unref(
      clock.setTimeout(function beat() {
        if (closed) return;
        if (emit("heartbeat", { intervalMs: limits.heartbeatMs }))
          heartbeatAt = clock.now();
        heartbeat = unref(clock.setTimeout(beat, limits.heartbeatMs));
      }, limits.heartbeatMs),
    );
  }

  function emitGaps() {
    if (dropped > 0 || rejected > 0) {
      emit("coverage", {
        boundary: "trace.producer",
        status: "limited",
        detail: {
          kind: "text",
          text: `${dropped} event(s) dropped locally; ${rejected} rejected by ingest.`,
        },
      });
    }
  }

  const api = {
    context: () => ({ ...base }),
    /** Child context sharing this queue, sequence and delivery bound. */
    withContext(overrides) {
      return {
        context: () => ({ ...base, ...overrides }),
        emit: (kind, payload) => emit(kind, payload, { context: overrides }),
        addSensitiveValues: (values) => api.addSensitiveValues(values),
        flush,
        close: async () => {},
        stats: () => api.stats(),
      };
    },
    addSensitiveValues(values) {
      let changed = false;
      for (const value of values || []) {
        if (typeof value !== "string" || value.length < 8) continue;
        if (effectivePrivacy.sensitiveValues.includes(value)) continue;
        effectivePrivacy.sensitiveValues.push(value);
        changed = true;
      }
      if (changed) {
        effectivePrivacy.sensitiveValues = [
          ...new Set(effectivePrivacy.sensitiveValues),
        ]
          .sort((left, right) => right.length - left.length)
          .slice(0, 200);
      }
    },
    emit,
    flush,
    async close() {
      if (closed && !finishing) return;
      closed = true;
      finishing = true;
      if (timer) clock.clearTimeout(timer);
      if (heartbeat) clock.clearTimeout(heartbeat);
      timer = null;
      heartbeat = null;
      emitGaps();
      // Deliver what is already queued before judging completeness. Any
      // unacknowledged evidence keeps the terminal status honest.
      let deadline = null;
      const ceiling = () =>
        new Promise((resolve) => {
          deadline = clock.setTimeout(resolve, limits.closeTimeoutMs);
        });
      await Promise.race([flush(), ceiling()]);
      if (deadline) clock.clearTimeout(deadline);
      const incomplete =
        dropped > 0 ||
        rejected > 0 ||
        suppressed ||
        deliveryFailed ||
        queue.length > 0;
      emit("producer_finished", {
        status: incomplete ? "incomplete" : "complete",
        detail: null,
      });
      await Promise.race([flush(), ceiling()]);
      if (deadline) clock.clearTimeout(deadline);
      finishing = false;
    },
    stats() {
      return {
        queued: queue.length,
        queueBytes,
        dropped,
        rejected,
        suppressed,
        lastHeartbeatAt: heartbeatAt,
        closed,
      };
    },
  };

  startHeartbeat();
  return api;
}
