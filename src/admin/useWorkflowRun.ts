import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptDetail, AttemptEventRecord } from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import { isAbortError, requestErrorMessage } from "./format";

const LIVE_POLL_MS = 2_000;
const IDLE_POLL_MS = 15_000;
const SOURCE_PRIORITY = {
  "legacy-import": 0,
  callback: 1,
  "github-reconcile": 2,
};

/** Keep observed stage evidence when the newest API page advances. */
export function mergeWorkflowEvents(...pages: AttemptEventRecord[][]) {
  const events = new Map<string, AttemptEventRecord>();
  for (const event of pages.flat()) {
    if (
      ["execution", "delivery"].includes(event.stage) ||
      /(^|:)cost:/u.test(event.eventKey)
    )
      continue;
    const previous = events.get(event.eventKey);
    if (
      !previous ||
      event.observedAt > previous.observedAt ||
      (event.observedAt === previous.observedAt &&
        SOURCE_PRIORITY[event.source] >= SOURCE_PRIORITY[previous.source])
    )
      events.set(event.eventKey, event);
  }
  return [...events.values()].sort(
    (a, b) =>
      a.createdAt - b.createdAt ||
      a.observedAt - b.observedAt ||
      a.eventKey.localeCompare(b.eventKey),
  );
}

/** The parent provides a seed; one sequential reader owns subsequent snapshots. */
export function useWorkflowRun(
  api: AdminApi,
  attemptId: string,
  seed?: AttemptDetail,
) {
  const initial = useRef(seed?.attemptId === attemptId ? seed : undefined);
  const [attempt, setAttempt] = useState<AttemptDetail | null>(
    initial.current ?? null,
  );
  const [events, setEvents] = useState(() =>
    mergeWorkflowEvents(
      initial.current?.events ?? [],
      initial.current?.workflowEvents ?? [],
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let latest = initial.current;

    function schedule() {
      if (disposed || document.visibilityState === "hidden") return;
      const active =
        latest?.executionStatus === "queued" ||
        latest?.executionStatus === "running";
      timer = window.setTimeout(
        () => void load(),
        active ? LIVE_POLL_MS : IDLE_POLL_MS,
      );
    }

    async function load() {
      if (disposed || controller || document.visibilityState === "hidden")
        return;
      window.clearTimeout(timer);
      controller = new AbortController();
      setRefreshing(true);
      try {
        const next = await api.getAttempt(attemptId, {
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        latest = next;
        setAttempt(next);
        setEvents((seen) =>
          mergeWorkflowEvents(seen, next.events, next.workflowEvents ?? []),
        );
        setCheckedAt(Date.now());
        setError(null);
      } catch (cause) {
        if (!disposed && !isAbortError(cause))
          setError(requestErrorMessage(cause));
      } finally {
        controller = null;
        if (!disposed) {
          setRefreshing(false);
          schedule();
        }
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer);
      if (document.visibilityState !== "hidden") void load();
    }

    refreshRef.current = () => void load();
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (initial.current) schedule();
    else void load();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [api, attemptId]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { attempt, events, error, refreshing, checkedAt, refresh };
}
