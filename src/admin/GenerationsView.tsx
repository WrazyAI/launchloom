import { useEffect, useRef, useState } from "react";
import type {
  AttemptDetail,
  AttemptEventRecord,
  AttemptFilters,
  AttemptSummary,
  ClientRecord,
  ExecutionStatus,
  GenerationProfile,
  Health,
} from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import type { AdminRouteState } from "./route-state";
import { AttemptInspector } from "./AttemptInspector";
import { AttemptGallery, AttemptLedger, SiteTimeline } from "./AttemptLedger";
import { AdminIcon } from "./AdminIcon";
import { HealthNotice } from "./HealthNotice";
import { groupBySite, isSiteGeneration } from "./site-groups";
import {
  dateInputValue,
  formatRelativeTime,
  isAbortError,
  parseDateEnd,
  parseDateStart,
  requestErrorMessage,
} from "./format";

const DEFAULT_LIMIT = 50;
const EXECUTION_OPTIONS: Array<{ value: ExecutionStatus; label: string }> = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "skipped", label: "Skipped" },
  { value: "unknown", label: "Unknown" },
];
const PROFILE_OPTIONS: Array<{ value: GenerationProfile; label: string }> = [
  { value: "full", label: "Full generation" },
  { value: "full-preview", label: "Full preview" },
  { value: "creative-only", label: "Creative only" },
  { value: "seo-only", label: "SEO only" },
];

type Draft = {
  search: string;
  status: string;
  profile: string;
  initiator: string;
  creator: string;
  from: string;
  to: string;
  limit: string;
};

function draftFromState(state: AdminRouteState): Draft {
  const filters = state.filters;
  return {
    search: filters.search || "",
    status: filters.executionStatus || "",
    profile: filters.profile || "",
    initiator: filters.initiatorId || "",
    creator: filters.creatorId || "",
    from: dateInputValue(filters.from),
    to: dateInputValue(filters.to),
    limit: String(filters.limit || DEFAULT_LIMIT),
  };
}

function filtersFromDraft(draft: Draft): AttemptFilters {
  const filters: AttemptFilters = {};
  const search = draft.search.trim();
  if (search) filters.search = search;
  if (draft.status) filters.executionStatus = draft.status as ExecutionStatus;
  if (draft.profile) filters.profile = draft.profile as GenerationProfile;
  const initiator = draft.initiator.trim();
  if (initiator) filters.initiatorId = initiator;
  const creator = draft.creator.trim();
  if (creator) filters.creatorId = creator;
  const from = parseDateStart(draft.from);
  if (from !== undefined) filters.from = from;
  const to = parseDateEnd(draft.to);
  if (to !== undefined) filters.to = to;
  const limit = Number(draft.limit);
  if (Number.isSafeInteger(limit) && limit >= 1 && limit <= 100)
    filters.limit = limit;
  return filters;
}

export function GenerationsView({
  api,
  state,
  cursorTrail,
  onNavigate,
}: {
  api: AdminApi;
  state: AdminRouteState;
  cursorTrail: string[];
  onNavigate: (
    next: AdminRouteState,
    options?: { cursorTrail?: string[] },
  ) => void;
}) {
  const filters = state.filters;
  const cursor = state.cursor;
  const [viewMode, setViewMode] = useState<"sites" | "ledger" | "gallery">(
    "sites",
  );
  const limit = filters.limit || DEFAULT_LIMIT;
  const requestLimit = viewMode === "gallery" ? Math.min(limit, 24) : limit;
  const filterSignature = JSON.stringify(filters);
  const siteOnly = viewMode === "sites";

  const [draft, setDraft] = useState<Draft>(() => draftFromState(state));
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    all: number;
    succeeded: number;
    running: number;
    attention: number;
  } | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [detailClient, setDetailClient] = useState<ClientRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailToken, setDetailToken] = useState(0);
  const [events, setEvents] = useState<AttemptEventRecord[]>([]);
  const [eventsNextCursor, setEventsNextCursor] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const listRequest = useRef(0);
  const queryKeyRef = useRef("");
  const loadedRef = useRef(false);
  const silentRefreshRef = useRef(false);
  const healthRequest = useRef(0);
  const attentionRequest = useRef(0);
  const detailRequest = useRef(0);
  const detailIdRef = useRef<string | null>(null);
  const silentDetailRef = useRef(false);
  const clientRequest = useRef(0);
  const eventsRequest = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusOnOpenRef = useRef(false);
  const hadSelectionRef = useRef(Boolean(state.attemptId));

  const queryKey = `${filterSignature}|${cursor || ""}|${requestLimit}|${siteOnly}`;

  useEffect(() => {
    setDraft(draftFromState(state));
  }, [filterSignature]);

  useEffect(() => {
    const requestId = ++listRequest.current;
    const controller = new AbortController();
    const changed = queryKeyRef.current !== queryKey;
    queryKeyRef.current = queryKey;
    if (changed) {
      loadedRef.current = false;
      setAttempts([]);
      setTotal(0);
      setNextCursor(null);
    }
    if (loadedRef.current) {
      if (!silentRefreshRef.current) setRefreshing(true);
    } else setLoading(true);
    setError(null);
    api
      .listAttempts(
        {
          ...filters,
          siteOnly,
          cursor: cursor || undefined,
          limit: requestLimit,
        },
        { signal: controller.signal },
      )
      .then((page) => {
        if (listRequest.current !== requestId) return;
        loadedRef.current = true;
        setAttempts(page.items);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        setUpdatedAt(Date.now());
        setLoading(false);
        setRefreshing(false);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          listRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setError(requestErrorMessage(failure));
        setLoading(false);
        setRefreshing(false);
      })
      .finally(() => {
        silentRefreshRef.current = false;
      });
    return () => controller.abort();
  }, [api, filterSignature, cursor, requestLimit, refreshToken, siteOnly]);

  useEffect(() => {
    const requestId = ++healthRequest.current;
    const controller = new AbortController();
    setHealthError(null);
    api
      .getHealth({ signal: controller.signal })
      .then((next) => {
        if (healthRequest.current !== requestId) return;
        setHealth(next);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          healthRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setHealthError(requestErrorMessage(failure));
      });
    return () => controller.abort();
  }, [api, refreshToken]);

  useEffect(() => {
    const requestId = ++attentionRequest.current;
    const controller = new AbortController();
    setCountsError(null);
    const scope = {
      search: filters.search,
      profile: filters.profile,
      initiatorId: filters.initiatorId,
      creatorId: filters.creatorId,
      clientId: filters.clientId,
      siteOnly,
      from: filters.from,
      to: filters.to,
      limit: 1,
    };
    Promise.all([
      api.listAttempts({ ...scope }, { signal: controller.signal }),
      api.listAttempts(
        { ...scope, executionStatus: "succeeded" },
        { signal: controller.signal },
      ),
      api.listAttempts(
        { ...scope, executionStatus: "running" },
        { signal: controller.signal },
      ),
      api.listAttempts(
        { ...scope, attention: true },
        { signal: controller.signal },
      ),
    ])
      .then(([all, succeeded, running, attention]) => {
        if (attentionRequest.current !== requestId) return;
        setCounts({
          all: all.total,
          succeeded: succeeded.total,
          running: running.total,
          attention: attention.total,
        });
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          attentionRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setCounts(null);
        setCountsError(requestErrorMessage(failure));
      });
    return () => controller.abort();
  }, [
    api,
    refreshToken,
    filters.search,
    filters.profile,
    filters.initiatorId,
    filters.creatorId,
    filters.clientId,
    filters.from,
    filters.to,
    siteOnly,
  ]);

  const selectedId = state.attemptId;

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedId) {
      detailIdRef.current = null;
      silentDetailRef.current = false;
      setDetail(null);
      setDetailClient(null);
      setDetailLoading(false);
      setDetailError(null);
      setEvents([]);
      setEventsNextCursor(null);
      setEventCount(0);
      setEventsLoading(false);
      setEventsError(null);
      return () => controller.abort();
    }
    const requestId = ++detailRequest.current;
    if (detailIdRef.current !== selectedId) {
      detailIdRef.current = selectedId;
      eventsRequest.current += 1;
      setDetail(null);
      setDetailClient(null);
      setEvents([]);
      setEventsNextCursor(null);
      setEventCount(0);
      setEventsLoading(false);
      setEventsError(null);
    }
    if (!silentDetailRef.current) setDetailLoading(true);
    setDetailError(null);
    api
      .getAttempt(selectedId, { signal: controller.signal })
      .then((result) => {
        if (
          controller.signal.aborted ||
          detailRequest.current !== requestId ||
          detailIdRef.current !== selectedId
        )
          return;
        setDetail(result);
        setEvents(result.events);
        setEventsNextCursor(result.eventsNextCursor);
        setEventCount(result.eventCount);
        setDetailLoading(false);
        setEventsLoading(false);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          detailRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setDetailError(requestErrorMessage(failure));
        setDetailLoading(false);
      })
      .finally(() => {
        silentDetailRef.current = false;
      });
    return () => controller.abort();
  }, [api, selectedId, detailToken]);

  useEffect(() => {
    const clientId = detail?.clientId;
    if (!clientId) {
      setDetailClient(null);
      return;
    }
    const requestId = ++clientRequest.current;
    const controller = new AbortController();
    api
      .getClient(clientId, { signal: controller.signal })
      .then((client) => {
        if (
          controller.signal.aborted ||
          clientRequest.current !== requestId ||
          detailIdRef.current !== selectedId
        )
          return;
        setDetailClient(client);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          clientRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setDetailClient(null);
      });
    return () => controller.abort();
  }, [api, detail?.clientId, selectedId]);

  useEffect(() => {
    if (selectedId) {
      hadSelectionRef.current = true;
      return;
    }
    if (!hadSelectionRef.current) return;
    hadSelectionRef.current = false;
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      else document.getElementById("admin-view-title")?.focus();
    });
  }, [selectedId]);

  useEffect(() => {
    if (!detail || !selectedId || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [detail, selectedId]);

  const hasActiveRun = attempts.some(
    (attempt) =>
      attempt.executionStatus === "queued" ||
      attempt.executionStatus === "running",
  );

  useEffect(() => {
    // Poll faster while a run is active, but keep a slower baseline poll so a
    // newly dispatched intake appears without a manual refresh.
    const interval = hasActiveRun ? 15_000 : 30_000;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      silentRefreshRef.current = true;
      silentDetailRef.current = Boolean(selectedId);
      setRefreshToken((value) => value + 1);
      if (selectedId) setDetailToken((value) => value + 1);
    }, interval);
    return () => window.clearInterval(timer);
  }, [hasActiveRun, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function navigate(next: AdminRouteState) {
    onNavigate(next);
  }

  function applyFilters(event: { preventDefault: () => void }) {
    event.preventDefault();
    const next = filtersFromDraft(draft);
    if (filters.clientId) next.clientId = filters.clientId;
    onNavigate(
      {
        ...state,
        filters: next,
        cursor: null,
        attemptId: null,
        clientId: null,
      },
      { cursorTrail: [] },
    );
  }

  function clearFilters() {
    setDraft({
      search: "",
      status: "",
      profile: "",
      initiator: "",
      creator: "",
      from: "",
      to: "",
      limit: String(DEFAULT_LIMIT),
    });
    onNavigate(
      {
        ...state,
        filters: {},
        cursor: null,
        attemptId: null,
        clientId: null,
      },
      { cursorTrail: [] },
    );
  }

  function applyStatusFilter(status?: ExecutionStatus) {
    const next = {
      ...filters,
      executionStatus: status,
      attention: undefined,
    };
    setDraft((current) => ({ ...current, status: status || "" }));
    onNavigate(
      {
        ...state,
        filters: next,
        cursor: null,
        attemptId: null,
        clientId: null,
      },
      { cursorTrail: [] },
    );
  }

  function applyAttentionFilter() {
    const next = {
      ...filters,
      executionStatus: undefined,
      attention: true,
    };
    setDraft((current) => ({ ...current, status: "" }));
    onNavigate(
      {
        ...state,
        filters: next,
        cursor: null,
        attemptId: null,
        clientId: null,
      },
      { cursorTrail: [] },
    );
  }

  function selectAttempt(attempt: AttemptSummary, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    focusOnOpenRef.current = true;
    navigate({ ...state, attemptId: attempt.attemptId, clientId: null });
  }

  function nextPage() {
    if (!nextCursor) return;
    onNavigate(
      { ...state, cursor: nextCursor },
      { cursorTrail: [...cursorTrail, cursor || ""] },
    );
  }

  function previousPage() {
    if (!cursorTrail.length) return;
    const previous = cursorTrail[cursorTrail.length - 1] || null;
    onNavigate(
      { ...state, cursor: previous },
      { cursorTrail: cursorTrail.slice(0, -1) },
    );
  }

  function loadMoreEvents() {
    if (!selectedId || !eventsNextCursor || eventsLoading) return;
    const requestId = ++eventsRequest.current;
    const attemptId = selectedId;
    setEventsLoading(true);
    setEventsError(null);
    api
      .getAttemptEvents(attemptId, eventsNextCursor, 50)
      .then((page) => {
        if (
          eventsRequest.current !== requestId ||
          detailIdRef.current !== attemptId
        )
          return;
        setEvents((current) => [...current, ...page.items]);
        setEventsNextCursor(page.nextCursor);
        setEventCount(page.total);
        setEventsLoading(false);
      })
      .catch((failure) => {
        if (eventsRequest.current !== requestId || isAbortError(failure))
          return;
        setEventsError(requestErrorMessage(failure));
        setEventsLoading(false);
      });
  }

  function refresh() {
    silentRefreshRef.current = false;
    silentDetailRef.current = false;
    setRefreshToken((token) => token + 1);
    if (selectedId) setDetailToken((token) => token + 1);
  }

  const siteAttempts = attempts.filter(isSiteGeneration);
  const siteCount = groupBySite(siteAttempts).length;
  const attemptWord = attempts.length === 1 ? "attempt" : "attempts";
  const showing =
    viewMode === "sites"
      ? `${siteCount} ${siteCount === 1 ? "site" : "sites"} · ${siteAttempts.length} full ${
          siteAttempts.length === 1 ? "generation" : "generations"
        }`
      : attempts.length > 0
        ? `Showing ${attempts.length} of ${total} attempts`
        : loading
          ? "Loading attempts"
          : "No attempts to show";
  const attentionCount = counts?.attention ?? null;
  const allActive = !filters.executionStatus && !filters.attention;
  const succeededActive = filters.executionStatus === "succeeded";
  const runningActive = filters.executionStatus === "running";
  const attentionActive = Boolean(filters.attention);
  const countLabel = (value: number | undefined) =>
    value === undefined ? "–" : value.toLocaleString("en-GB");
  const clientFilterName =
    attempts.find((attempt) => attempt.clientId === filters.clientId)
      ?.clientName ?? null;

  return (
    <div
      id="generations-view"
      className="admin-view"
      data-route="generations"
      data-record-source="legacy"
    >
      <div
        className="admin-pulse"
        aria-label="Workspace summary"
        data-attention-summary
        data-attention-total={
          attentionCount === null ? "loading" : String(attentionCount)
        }
      >
        <span>
          <strong>{viewMode === "sites" ? siteCount : attempts.length}</strong>{" "}
          {viewMode === "sites"
            ? siteCount === 1
              ? "site"
              : "sites"
            : attemptWord}{" "}
          in view
        </span>
        <span className="admin-pulse__sep" />
        <span>
          <strong>{attentionCount === null ? "–" : attentionCount}</strong>{" "}
          {attentionCount === 1 ? "attempt needs" : "attempts need"} attention
        </span>
        <span className="admin-pulse__sep" />
        <button type="button" onClick={applyAttentionFilter} disabled={loading}>
          Review attention
        </button>
        <span className="admin-pulse__sep" />
        <span
          title={
            updatedAt ? new Date(updatedAt).toLocaleString() : "Not loaded yet"
          }
        >
          Updated {formatRelativeTime(updatedAt, now)}
        </span>
        {hasActiveRun ? (
          <>
            <span className="admin-pulse__sep" />
            <span>Auto-refreshing active runs</span>
          </>
        ) : null}
      </div>

      <form onSubmit={applyFilters} aria-label="Generation filters">
        <div className="admin-generation-toolbar">
          <div className="admin-generation-toolbar__left">
            <label className="admin-search">
              <AdminIcon name="search" />
              <span className="admin-visually-hidden">Search attempts</span>
              <input
                type="search"
                value={draft.search}
                maxLength={160}
                placeholder="Search clients or attempts"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
              />
            </label>
            <div
              className="admin-status-chips"
              role="group"
              aria-label="Filter by status"
            >
              <button
                className="admin-chip"
                type="button"
                aria-pressed={allActive}
                onClick={() => applyStatusFilter()}
              >
                All <small>{countLabel(counts?.all)}</small>
              </button>
              <button
                className="admin-chip"
                type="button"
                aria-pressed={succeededActive}
                onClick={() => applyStatusFilter("succeeded")}
              >
                Succeeded <small>{countLabel(counts?.succeeded)}</small>
              </button>
              <button
                className="admin-chip"
                type="button"
                aria-pressed={runningActive}
                onClick={() => applyStatusFilter("running")}
              >
                Running <small>{countLabel(counts?.running)}</small>
              </button>
              <button
                className="admin-chip"
                type="button"
                aria-pressed={attentionActive}
                onClick={applyAttentionFilter}
              >
                Needs attention <small>{countLabel(counts?.attention)}</small>
              </button>
            </div>
          </div>
          <div className="admin-generation-toolbar__right">
            <button
              type="button"
              className="admin-button admin-button--quiet"
              onClick={refresh}
              disabled={loading}
              aria-busy={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <div
              className="admin-view-switch"
              role="group"
              aria-label="Generation view"
            >
              <button
                type="button"
                aria-pressed={viewMode === "sites"}
                onClick={() => setViewMode("sites")}
              >
                <AdminIcon name="clients" />
                Sites
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "ledger"}
                onClick={() => setViewMode("ledger")}
              >
                <AdminIcon name="generations" />
                Ledger
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "gallery"}
                onClick={() => setViewMode("gallery")}
              >
                <AdminIcon name="clients" />
                Gallery
              </button>
            </div>
          </div>
        </div>

        <details className="admin-filter-disclosure">
          <summary>More filters</summary>
          <div className="admin-filters">
            <label className="admin-field">
              <span>Execution status</span>
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">All statuses</option>
                {EXECUTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Generation profile</span>
              <select
                value={draft.profile}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    profile: event.target.value,
                  }))
                }
              >
                <option value="">All profiles</option>
                {PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Initiator ID</span>
              <input
                type="text"
                value={draft.initiator}
                maxLength={160}
                placeholder="admin:stable-id"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    initiator: event.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field">
              <span>Link creator ID</span>
              <input
                type="text"
                value={draft.creator}
                maxLength={160}
                placeholder="admin:stable-id"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    creator: event.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field">
              <span>From date</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field">
              <span>To date</span>
              <input
                type="date"
                value={draft.to}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field admin-field--small">
              <span>Rows per page</span>
              <select
                value={draft.limit}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    limit: event.target.value,
                  }))
                }
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
            <div className="admin-filter-actions">
              <button type="submit" className="admin-button">
                Apply filters
              </button>
              <button
                type="button"
                className="admin-button admin-button--quiet"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          </div>
        </details>
      </form>

      {filters.clientId ? (
        <div className="admin-notice">
          <strong>Client filter</strong>
          <span>{clientFilterName ?? "Linked client"}</span>
          <button
            type="button"
            className="admin-link-button"
            onClick={() =>
              onNavigate(
                {
                  ...state,
                  filters: { ...filters, clientId: undefined },
                  cursor: null,
                  attemptId: null,
                },
                { cursorTrail: [] },
              )
            }
          >
            Clear client filter
          </button>
        </div>
      ) : null}

      <HealthNotice health={health} error={healthError} subject="Tracking" />
      {countsError ? (
        <div className="admin-notice admin-notice--attention" role="status">
          Attention counts could not be loaded. No estimate is shown.
        </div>
      ) : null}

      {error && attempts.length > 0 ? (
        <div className="admin-notice admin-notice--error" role="alert">
          The latest refresh failed. Showing the last loaded results. {error}
        </div>
      ) : null}

      {error && attempts.length === 0 && !loading ? (
        <div className="admin-error" role="alert">
          <p>{error}</p>
          <button type="button" className="admin-button" onClick={refresh}>
            Retry generation list
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-skeleton" role="status">
          <span />
          <span />
          <span />
          <p>Loading generation attempts...</p>
        </div>
      ) : null}

      {!loading && attempts.length === 0 ? (
        <div className="admin-empty" role="status">
          <h3>No attempts match these filters</h3>
          <p>
            Clear or broaden the filters. Pending intake work may not have a
            generation attempt yet.
          </p>
        </div>
      ) : null}

      {!loading &&
      viewMode === "sites" &&
      attempts.length > 0 &&
      siteAttempts.length === 0 ? (
        <div className="admin-empty" role="status">
          <h3>No full site generations match these filters</h3>
          <p>
            Creative analysis runs are available in the Ledger view. Sites only
            shows full and full-preview generations.
          </p>
          <button
            type="button"
            className="admin-button admin-button--quiet"
            onClick={() => setViewMode("ledger")}
          >
            Open Ledger
          </button>
        </div>
      ) : null}

      {attempts.length > 0 ? (
        viewMode === "sites" ? (
          siteAttempts.length > 0 ? (
            <SiteTimeline
              attempts={siteAttempts}
              selectedId={selectedId}
              onSelect={selectAttempt}
              onOpenClient={(clientId) =>
                onNavigate(
                  {
                    view: "clients",
                    clientId,
                    attemptId: null,
                    filters: {},
                    cursor: null,
                  },
                  { cursorTrail: [] },
                )
              }
            />
          ) : null
        ) : viewMode === "ledger" ? (
          <AttemptLedger
            attempts={attempts}
            selectedId={selectedId}
            onSelect={selectAttempt}
          />
        ) : (
          <AttemptGallery
            attempts={attempts}
            selectedId={selectedId}
            onSelect={selectAttempt}
          />
        )
      ) : null}

      <div className="admin-pagination">
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={previousPage}
          disabled={!cursorTrail.length || loading}
        >
          Previous page
        </button>
        <span className="admin-view__count" data-testid="attempt-page-summary">
          {showing}
        </span>
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={nextPage}
          disabled={!nextCursor || loading}
        >
          Next page
        </button>
      </div>

      {selectedId ? (
        <AttemptInspector
          attempt={detail}
          client={detailClient}
          loading={detailLoading}
          error={detailError}
          events={events}
          eventsNextCursor={eventsNextCursor}
          eventCount={eventCount}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          headingRef={headingRef}
          onClose={() => navigate({ ...state, attemptId: null })}
          onRetry={() => setDetailToken((token) => token + 1)}
          onLoadMoreEvents={loadMoreEvents}
          onOpenClient={(clientId) =>
            onNavigate(
              {
                view: "clients",
                clientId,
                attemptId: null,
                filters: {},
                cursor: null,
              },
              { cursorTrail: [] },
            )
          }
          onOpenAttempt={(attemptId) =>
            navigate({ ...state, attemptId, clientId: null })
          }
        />
      ) : null}
    </div>
  );
}
