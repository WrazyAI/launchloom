import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GenerationActivityPage,
  StoredTraceEvent,
  TraceIdentity,
} from "../lib/generation-activity";
import type { AdminApi } from "./api";
import { isAbortError, requestErrorMessage } from "./format";

export const ACTIVITY_POLL_MS = 2_000;
export const ACTIVITY_IDLE_POLL_MS = 15_000;
export const ACTIVITY_WINDOW = 500;
const CATCH_UP_PAGES = 3;

export type ActivityConnection =
  | "disabled"
  | "connecting"
  | "live"
  | "disconnected";

export type GenerationActivityState = {
  page: GenerationActivityPage | null;
  events: StoredTraceEvent[];
  connection: ActivityConnection;
  error: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  refresh: () => void;
};

/**
 * Incremental authenticated polling for the diagnostic trace.
 *
 * Only the last acknowledged cursor is sent, so reconnects replay missed events
 * without duplicating them. Rapid polling stops when the run is no longer live
 * or the tab is hidden; reads never overlap.
 */
export function useGenerationActivity({
  api,
  identity,
  active,
  enabled,
  refreshToken = 0,
}: {
  api: AdminApi;
  identity: TraceIdentity;
  active: boolean;
  enabled: boolean;
  refreshToken?: number;
}): GenerationActivityState {
  const [page, setPage] = useState<GenerationActivityPage | null>(null);
  const [events, setEvents] = useState<StoredTraceEvent[]>([]);
  const [connection, setConnection] = useState<ActivityConnection>(
    enabled ? "connecting" : "disabled",
  );
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [manualToken, setManualToken] = useState(0);
  const latestCursor = useRef<string | null>(null);
  const ids = useRef(new Set<string>());
  const eventsRef = useRef<StoredTraceEvent[]>([]);

  useEffect(() => {
    latestCursor.current = null;
    ids.current = new Set();
    eventsRef.current = [];
    setEvents([]);
    setPage(null);
    setHasOlder(false);
    setError(null);
    setConnection(enabled ? "connecting" : "disabled");
  }, [identity.namespace, identity.attemptId, enabled]);

  const merge = useCallback((incoming: StoredTraceEvent[], mode: "append" | "prepend") => {
    const fresh = incoming.filter((event) => {
      if (ids.current.has(event.eventId)) return false;
      ids.current.add(event.eventId);
      return true;
    });
    if (!fresh.length) return;
    const next =
      mode === "append"
        ? [...eventsRef.current, ...fresh].slice(-ACTIVITY_WINDOW)
        : [...fresh, ...eventsRef.current];
    eventsRef.current = next;
    // Rebuild the dedupe index when it grows well beyond the visible window.
    if (ids.current.size > 5_000) ids.current = new Set(next.map((event) => event.eventId));
    setEvents(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setConnection("disabled");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let catchUp = 0;

    function schedule(delay: number) {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (document.visibilityState === "hidden") {
          schedule(ACTIVITY_IDLE_POLL_MS);
          return;
        }
        void load();
      }, delay);
    }

    async function load() {
      if (cancelled || controller) return;
      controller = new AbortController();
      const signal = controller.signal;
      const initial = latestCursor.current === null;
      try {
        const next = await api.getGenerationActivity(identity, {
          after: latestCursor.current,
          limit: 100,
          signal,
        });
        if (cancelled) return;
        merge(next.items, "append");
        latestCursor.current = next.nextCursor ?? latestCursor.current;
        if (initial) setHasOlder(next.hasMore);
        setPage(next);
        setConnection("live");
        setError(null);
        if (next.hasMore && catchUp < CATCH_UP_PAGES) {
          catchUp += 1;
          controller = null;
          schedule(0);
          return;
        }
      } catch (cause) {
        if (cancelled || isAbortError(cause)) return;
        setConnection("disconnected");
        setError(requestErrorMessage(cause));
      } finally {
        controller = null;
        if (!cancelled) {
          catchUp = 0;
          schedule(active ? ACTIVITY_POLL_MS : ACTIVITY_IDLE_POLL_MS);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [
    api,
    identity,
    identity.namespace,
    identity.attemptId,
    enabled,
    active,
    refreshToken,
    manualToken,
    merge,
  ]);

  const loadOlder = useCallback(() => {
    if (!enabled || loadingOlder) return;
    const oldest = eventsRef.current[0];
    if (!oldest) return;
    const controller = new AbortController();
    setLoadingOlder(true);
    api
      .getGenerationActivity(identity, {
        before: oldest.cursor,
        limit: 100,
        signal: controller.signal,
      })
      .then((older) => {
        merge(older.items, "prepend");
        setHasOlder(older.hasMore);
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setError(requestErrorMessage(cause));
      })
      .finally(() => setLoadingOlder(false));
  }, [api, enabled, identity, loadingOlder, merge]);

  return {
    page,
    events,
    connection,
    error,
    hasOlder,
    loadingOlder,
    loadOlder,
    refresh: () => setManualToken((value) => value + 1),
  };
}
