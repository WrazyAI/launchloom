import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
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
import { ActorLabel } from "./ActorLabel";
import { AttemptInspector } from "./AttemptInspector";
import { DeliveryStatusBadge, ExecutionStatusBadge } from "./StatusBadge";
import {
  dateInputValue,
  formatDate,
  formatProfile,
  formatTimestamp,
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

function HealthNotice({
  health,
  error,
}: {
  health: Health | null;
  error: string | null;
}) {
  if (error)
    return (
      <div className="admin-notice admin-notice--error" role="alert">
        Tracking health could not be loaded. Counts may be incomplete.
      </div>
    );
  if (!health) return null;
  const partial = health.partial || health.pendingProjectionCount > 0;
  return (
    <div
      className={`admin-notice${partial ? " admin-notice--attention" : ""}`}
      role="status"
      data-health-state={partial ? "partial" : "current"}
    >
      <strong>
        {partial
          ? "Tracking history may be incomplete"
          : "Tracking health"}
      </strong>
      {partial ? (
        <span>
          {health.pendingProjectionCount} pending projections
          {health.partial ? " and partial coverage" : ""}.
        </span>
      ) : (
        <span>No tracking backlog is reported.</span>
      )}
      {health.lastError ? <span>{health.lastError}</span> : null}
      {health.coverageStart !== null ? (
        <span>Coverage starts {formatDate(health.coverageStart)}.</span>
      ) : (
        <span>Historical coverage start is not recorded.</span>
      )}
      <span>Last synchronized {formatTimestamp(health.lastSyncAt)}.</span>
    </div>
  );
}

export function GenerationsView({
  api,
  state,
  onNavigate,
}: {
  api: AdminApi;
  state: AdminRouteState;
  onNavigate: (next: AdminRouteState) => void;
}) {
  const filters = state.filters;
  const cursor = state.cursor;
  const limit = filters.limit || DEFAULT_LIMIT;
  const filterSignature = JSON.stringify(filters);

  const [draft, setDraft] = useState<Draft>(() => draftFromState(state));
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [cursorTrail, setCursorTrail] = useState<string[]>([]);

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
  const healthRequest = useRef(0);
  const detailRequest = useRef(0);
  const detailIdRef = useRef<string | null>(null);
  const clientRequest = useRef(0);
  const eventsRequest = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusOnOpenRef = useRef(false);
  const hadSelectionRef = useRef(Boolean(state.attemptId));

  const queryKey = `${filterSignature}|${cursor || ""}|${limit}`;

  useEffect(() => {
    setDraft(draftFromState(state));
  }, [filterSignature]);

  useEffect(() => {
    setCursorTrail([]);
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
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    api
      .listAttempts(
        { ...filters, cursor: cursor || undefined, limit },
        { signal: controller.signal },
      )
      .then((page) => {
        if (listRequest.current !== requestId) return;
        loadedRef.current = true;
        setAttempts(page.items);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
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
      });
    return () => controller.abort();
  }, [api, filterSignature, cursor, limit, refreshToken]);

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

  const selectedId = state.attemptId;

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedId) {
      detailIdRef.current = null;
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
    setDetailLoading(true);
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

  function navigate(next: AdminRouteState) {
    onNavigate(next);
  }

  function applyFilters(event: { preventDefault: () => void }) {
    event.preventDefault();
    setCursorTrail([]);
    navigate({
      ...state,
      filters: filtersFromDraft(draft),
      cursor: null,
      attemptId: null,
      clientId: null,
    });
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
    setCursorTrail([]);
    navigate({
      ...state,
      filters: {},
      cursor: null,
      attemptId: null,
      clientId: null,
    });
  }

  function selectAttempt(
    attempt: AttemptSummary,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    triggerRef.current = event.currentTarget;
    focusOnOpenRef.current = true;
    navigate({ ...state, attemptId: attempt.attemptId, clientId: null });
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorTrail((trail) => [...trail, cursor || ""]);
    navigate({ ...state, cursor: nextCursor });
  }

  function previousPage() {
    if (!cursorTrail.length) return;
    const trail = [...cursorTrail];
    const previous = trail.pop() || null;
    setCursorTrail(trail);
    navigate({ ...state, cursor: previous });
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
    setRefreshToken((token) => token + 1);
    if (selectedId) setDetailToken((token) => token + 1);
  }

  const showing =
    attempts.length > 0
      ? `Showing ${attempts.length} of ${total} attempts`
      : loading
        ? "Loading attempts"
        : "No attempts to show";

  return (
    <div id="generations-view" className="admin-view" data-route="generations">
      <div className="admin-view__toolbar">
        <p className="admin-view__count" data-testid="attempt-page-summary">
          {showing}
        </p>
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={refresh}
          disabled={loading}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {filters.clientId ? (
        <div className="admin-notice">
          <strong>Client filter</strong>
          <span className="admin-mono">{filters.clientId}</span>
          <button
            type="button"
            className="admin-link-button"
            onClick={() =>
              navigate({
                ...state,
                filters: { ...filters, clientId: undefined },
                cursor: null,
                attemptId: null,
              })
            }
          >
            Clear client filter
          </button>
        </div>
      ) : null}

      <HealthNotice health={health} error={healthError} />

      <form className="admin-filters" onSubmit={applyFilters} aria-label="Generation filters">
        <label className="admin-field admin-field--wide">
          <span>Search attempts</span>
          <input
            type="search"
            value={draft.search}
            maxLength={160}
            placeholder="Client, attempt, run or issue"
            onChange={(event) =>
              setDraft((current) => ({ ...current, search: event.target.value }))
            }
          />
        </label>
        <label className="admin-field">
          <span>Execution status</span>
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({ ...current, status: event.target.value }))
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
              setDraft((current) => ({ ...current, profile: event.target.value }))
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
              setDraft((current) => ({ ...current, creator: event.target.value }))
            }
          />
        </label>
        <label className="admin-field">
          <span>From date</span>
          <input
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label className="admin-field">
          <span>To date</span>
          <input
            type="date"
            value={draft.to}
            onChange={(event) =>
              setDraft((current) => ({ ...current, to: event.target.value }))
            }
          />
        </label>
        <label className="admin-field admin-field--small">
          <span>Rows per page</span>
          <select
            value={draft.limit}
            onChange={(event) =>
              setDraft((current) => ({ ...current, limit: event.target.value }))
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
      </form>

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

      <div className="admin-view-layout">
        <div className="admin-view__ledger">
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
                Clear or broaden the filters. Pending intake work may also not
                have a generation attempt yet.
              </p>
            </div>
          ) : null}

          {attempts.length > 0 ? (
            <div
              className="admin-table-wrap"
              role="region"
              aria-label="Generation attempts"
              tabIndex={0}
            >
              <table className="admin-table">
                <caption className="admin-visually-hidden">
                  Generation attempts across all clients
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Client and attempt</th>
                    <th scope="col">Execution</th>
                    <th scope="col">Delivery</th>
                    <th scope="col">Initiator</th>
                    <th scope="col">Link creator</th>
                    <th scope="col">Profile</th>
                    <th scope="col">Started</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr
                      key={attempt.attemptId}
                      data-attempt-id={attempt.attemptId}
                    >
                      <td>
                        <button
                          type="button"
                          className="admin-row-button"
                          aria-label={`Open attempt ${attempt.attemptId} for ${
                            attempt.clientId || "an unlinked client"
                          }`}
                          aria-expanded={selectedId === attempt.attemptId}
                          aria-controls={
                            selectedId ? "attempt-inspector" : undefined
                          }
                          onClick={(event) => selectAttempt(attempt, event)}
                        >
                          <span className="admin-row-primary">
                            {attempt.clientId || "No client linked"}
                          </span>
                          <span className="admin-row-secondary admin-mono">
                            {attempt.attemptId}
                          </span>
                        </button>
                      </td>
                      <td>
                        <ExecutionStatusBadge
                          status={attempt.executionStatus}
                          stale={attempt.stale}
                        />
                      </td>
                      <td>
                        <DeliveryStatusBadge status={attempt.deliveryStatus} />
                      </td>
                      <td>
                        <ActorLabel actor={attempt.initiator} showSource={false} />
                      </td>
                      <td>
                        <ActorLabel
                          actor={attempt.invitationCreator}
                          showSource={false}
                        />
                      </td>
                      <td>{formatProfile(attempt.profile)}</td>
                      <td>{formatTimestamp(attempt.startedAt)}</td>
                      <td>{formatTimestamp(attempt.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <button
              type="button"
              className="admin-button admin-button--quiet"
              onClick={nextPage}
              disabled={!nextCursor || loading}
            >
              Next page
            </button>
          </div>
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
              navigate({
                view: "clients",
                clientId,
                attemptId: null,
                filters: {},
                cursor: null,
              })
            }
          />
        ) : null}
      </div>
    </div>
  );
}
