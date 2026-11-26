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
 * or the tab is hidden; only one forward read can be in flight.
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
  const olderRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    latestCursor.current = null;
    ids.current = new Set();
    eventsRef.current = [];
    setEvents([]);
    setPage(null);
    setHasOlder(false);
    setError(null);
    setConnection(enabled ? "connecting" : "disabled");
    setLoadingOlder(false);
    return () => {
      olderRequest.current?.abort();
      olderRequest.current = null;
    };
  }, [api, identity.namespace, identity.attemptId, enabled]);

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
        : [...fresh, ...eventsRef.current].slice(0, 2_000);
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

    function clearTimer() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    }

    async function load() {
      if (cancelled || controller || document.visibilityState === "hidden") return;
      controller = new AbortController();
      const signal = controller.signal;
      const after = latestCursor.current;
      const pollDelay = active ? ACTIVITY_POLL_MS : ACTIVITY_IDLE_POLL_MS;
      let delay = pollDelay;
      try {
        const next = await api.getGenerationActivity(identity, {
          after,
          limit: 100,
          signal,
        });
        if (cancelled) return;
        merge(next.items, "append");
        latestCursor.current = next.nextCursor ?? latestCursor.current;
        if (after === null) setHasOlder(next.hasMore);
        setPage(next);
        setConnection("live");
        setError(null);
        // On the initial page, hasMore describes older history. Only a
        // forward page that advanced the cursor can request immediate catch-up.
        if (after !== null && next.nextCursor && next.nextCursor !== after &&
            next.hasMore && catchUp < CATCH_UP_PAGES) {
          catchUp += 1;
          delay = 0;
        }
      } catch (cause) {
        if (cancelled || isAbortError(cause)) return;
        setConnection("disconnected");
        setError(requestErrorMessage(cause));
      } finally {
        controller = null;
        if (delay !== 0) catchUp = 0;
        if (!cancelled && document.visibilityState !== "hidden") {
          timer = window.setTimeout(() => {
            timer = undefined;
            void load();
          }, delay);
        }
      }
    }

    function onVisibilityChange() {
      clearTimer();
      void load();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void load();
    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
    if (!enabled || olderRequest.current) return;
    const oldest = eventsRef.current[0];
    if (!oldest) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setLoadingOlder(true);
    api
      .getGenerationActivity(identity, {
        before: oldest.cursor,
        limit: 100,
        signal: controller.signal,
      })
      .then((older) => {
        if (controller.signal.aborted) return;
        merge(older.items, "prepend");
        setHasOlder(older.hasMore);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !isAbortError(cause))
          setError(requestErrorMessage(cause));
      })
      .finally(() => {
        if (olderRequest.current !== controller) return;
        olderRequest.current = null;
        setLoadingOlder(false);
      });
  }, [api, enabled, identity, merge]);

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
