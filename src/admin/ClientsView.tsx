import { useEffect, useRef, useState, type MouseEvent } from "react";
import type {
  AttemptSummary,
  ClientFilters,
  ClientRecord,
  Health,
} from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import type { AdminRouteState } from "./route-state";
import { ActorLabel } from "./ActorLabel";
import { AdminIcon } from "./AdminIcon";
import { ClientDossier } from "./ClientDossier";
import {
  dateInputValue,
  formatClientName,
  formatDate,
  formatTimestamp,
  isAbortError,
  parseDateEnd,
  parseDateStart,
  requestErrorMessage,
} from "./format";

const DEFAULT_LIMIT = 50;

type Draft = {
  search: string;
  from: string;
  to: string;
  limit: string;
};

function draftFromState(state: AdminRouteState): Draft {
  return {
    search: state.filters.search || "",
    from: dateInputValue(state.filters.from),
    to: dateInputValue(state.filters.to),
    limit: String(state.filters.limit || DEFAULT_LIMIT),
  };
}

function filtersFromDraft(draft: Draft): ClientFilters {
  const filters: ClientFilters = {};
  const search = draft.search.trim();
  if (search) filters.search = search;
  const from = parseDateStart(draft.from);
  if (from !== undefined) filters.from = from;
  const to = parseDateEnd(draft.to);
  if (to !== undefined) filters.to = to;
  const limit = Number(draft.limit);
  if (Number.isSafeInteger(limit) && limit >= 1 && limit <= 100)
    filters.limit = limit;
  return filters;
}

function advancedFilterCount(filters: ClientFilters) {
  return [
    filters.from !== undefined,
    filters.to !== undefined,
    filters.limit !== undefined && filters.limit !== DEFAULT_LIMIT,
  ].filter(Boolean).length;
}

function clientInitials(record: ClientRecord) {
  return (
    formatClientName(record)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "CL"
  );
}

function emailIsPrimary(record: ClientRecord) {
  return !record.businessName && !record.contactName && Boolean(record.email);
}

function DirectoryHealth({
  health,
  error,
}: {
  health: Health | null;
  error: string | null;
}) {
  if (error)
    return (
      <div className="admin-notice admin-notice--error" role="alert">
        Client directory health could not be loaded. The directory may be
        incomplete.
      </div>
    );
  if (!health) return null;
  const partial = health.partial || health.pendingProjectionCount > 0;
  if (!partial && !health.lastError) return null;
  return (
    <div
      className="admin-notice admin-notice--attention"
      role="status"
      data-health-state={partial ? "partial" : "current"}
    >
      <strong>
        {partial
          ? "Client directory may be incomplete"
          : "Client directory health warning"}
      </strong>
      {partial ? (
        <span>
          {health.pendingProjectionCount} pending projections
          {health.partial ? " and partial coverage" : ""}. Counts only include
          records already accepted into the shared ledger.
        </span>
      ) : null}
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

export function ClientsView({
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
  const limit = filters.limit || DEFAULT_LIMIT;
  const filterSignature = JSON.stringify(filters);

  const [draft, setDraft] = useState<Draft>(() => draftFromState(state));
  const [filtersOpen, setFiltersOpen] = useState(
    () => advancedFilterCount(state.filters) > 0,
  );
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientToken, setClientToken] = useState(0);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [attemptTotal, setAttemptTotal] = useState(0);
  const [attemptsNextCursor, setAttemptsNextCursor] = useState<string | null>(
    null,
  );
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const listRequest = useRef(0);
  const queryKeyRef = useRef("");
  const loadedRef = useRef(false);
  const detailRequest = useRef(0);
  const detailIdRef = useRef<string | null>(null);
  const attemptsRequest = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusOnOpenRef = useRef(Boolean(state.clientId));
  const hadSelectionRef = useRef(Boolean(state.clientId));

  const queryKey = `${filterSignature}|${cursor || ""}|${limit}`;

  useEffect(() => {
    setDraft(draftFromState(state));
    setFiltersOpen(advancedFilterCount(state.filters) > 0);
  }, [filterSignature]);

  useEffect(() => {
    const requestId = ++listRequest.current;
    const controller = new AbortController();
    const changed = queryKeyRef.current !== queryKey;
    queryKeyRef.current = queryKey;
    if (changed) {
      loadedRef.current = false;
      setClients([]);
      setTotal(0);
      setNextCursor(null);
    }
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setHealthError(null);
    api
      .listClients(
        { ...filters, cursor: cursor || undefined, limit },
        { signal: controller.signal },
      )
      .then((page) => {
        if (listRequest.current !== requestId) return;
        loadedRef.current = true;
        setClients(page.items);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        setHealth(page.health);
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
        setHealthError("unavailable");
        setLoading(false);
        setRefreshing(false);
      });
    return () => controller.abort();
  }, [api, filterSignature, cursor, limit, refreshToken]);

  const selectedId = state.clientId;

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedId) {
      detailIdRef.current = null;
      setClient(null);
      setClientLoading(false);
      setClientError(null);
      setAttempts([]);
      setAttemptTotal(0);
      setAttemptsNextCursor(null);
      setAttemptsLoading(false);
      setAttemptsError(null);
      return () => controller.abort();
    }
    const requestId = ++detailRequest.current;
    if (detailIdRef.current !== selectedId) {
      detailIdRef.current = selectedId;
      setClient(null);
      setAttempts([]);
      setAttemptTotal(0);
      setAttemptsNextCursor(null);
      setAttemptsError(null);
    }
    setClientLoading(true);
    setClientError(null);
    api
      .getClient(selectedId, { signal: controller.signal })
      .then((record) => {
        if (
          controller.signal.aborted ||
          detailRequest.current !== requestId ||
          detailIdRef.current !== selectedId
        )
          return;
        setClient(record);
        setClientLoading(false);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          detailRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setClientError(requestErrorMessage(failure));
        setClientLoading(false);
      });
    return () => controller.abort();
  }, [api, selectedId, clientToken]);

  useEffect(() => {
    if (!selectedId) return;
    const requestId = ++attemptsRequest.current;
    const controller = new AbortController();
    setAttemptsLoading(true);
    setAttemptsError(null);
    api
      .listAttempts(
        { clientId: selectedId, limit: 100 },
        { signal: controller.signal },
      )
      .then((page) => {
        if (
          controller.signal.aborted ||
          attemptsRequest.current !== requestId ||
          detailIdRef.current !== selectedId
        )
          return;
        setAttempts(page.items);
        setAttemptTotal(page.total);
        setAttemptsNextCursor(page.nextCursor);
        setAttemptsLoading(false);
      })
      .catch((failure) => {
        if (
          controller.signal.aborted ||
          attemptsRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setAttemptsError(requestErrorMessage(failure));
        setAttemptsLoading(false);
      });
    return () => controller.abort();
  }, [api, selectedId, clientToken]);

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
    if (!client || !selectedId || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [client, selectedId]);

  function applyFilters(event: { preventDefault: () => void }) {
    event.preventDefault();
    const nextFilters = filtersFromDraft(draft);
    setFiltersOpen(advancedFilterCount(nextFilters) > 0);
    onNavigate(
      {
        ...state,
        filters: nextFilters,
        cursor: null,
        clientId: null,
        attemptId: null,
      },
      { cursorTrail: [] },
    );
  }

  function clearFilters() {
    setDraft({
      search: "",
      from: "",
      to: "",
      limit: String(DEFAULT_LIMIT),
    });
    setFiltersOpen(false);
    onNavigate(
      {
        ...state,
        filters: {},
        cursor: null,
        clientId: null,
        attemptId: null,
      },
      { cursorTrail: [] },
    );
  }

  function selectClient(record: ClientRecord, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    focusOnOpenRef.current = true;
    onNavigate({
      ...state,
      clientId: record.clientId,
      attemptId: null,
    });
  }

  function selectClientRow(
    record: ClientRecord,
    event: MouseEvent<HTMLTableRowElement>,
  ) {
    const target = event.target as HTMLElement;
    if (target.closest("a,button") && !target.closest("[data-row-action]"))
      return;
    const trigger =
      target.closest<HTMLButtonElement>("[data-row-action]") ||
      event.currentTarget.querySelector<HTMLButtonElement>("[data-row-action]");
    if (trigger) selectClient(record, trigger);
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

  function loadMoreAttempts() {
    if (!selectedId || !attemptsNextCursor || attemptsLoading) return;
    const requestId = ++attemptsRequest.current;
    const activeId = selectedId;
    setAttemptsLoading(true);
    setAttemptsError(null);
    api
      .listAttempts({
        clientId: activeId,
        cursor: attemptsNextCursor,
        limit: 100,
      })
      .then((page) => {
        if (
          attemptsRequest.current !== requestId ||
          detailIdRef.current !== activeId
        )
          return;
        setAttempts((current) => [...current, ...page.items]);
        setAttemptTotal(page.total);
        setAttemptsNextCursor(page.nextCursor);
        setAttemptsLoading(false);
      })
      .catch((failure) => {
        if (attemptsRequest.current !== requestId || isAbortError(failure))
          return;
        setAttemptsError(requestErrorMessage(failure));
        setAttemptsLoading(false);
      });
  }

  function refresh() {
    setRefreshToken((token) => token + 1);
    if (selectedId) setClientToken((token) => token + 1);
  }

  const activeFilterCount = advancedFilterCount(filters);
  const directoryState = healthError
    ? "Coverage unavailable"
    : health
      ? health.partial || health.pendingProjectionCount > 0
        ? "Partial coverage"
        : "Directory current"
      : "Checking coverage";
  const showing =
    clients.length > 0
      ? `Showing ${clients.length} of ${total} clients`
      : loading
        ? "Loading clients"
        : "No clients to show";

  return (
    <div
      id="clients-view"
      className="admin-view admin-client-view"
      data-route="clients"
    >
      <div
        className="admin-pulse admin-client-pulse"
        aria-label="Client directory summary"
        data-client-coverage={
          healthError
            ? "unavailable"
            : !health
              ? "loading"
              : health.partial || health.pendingProjectionCount > 0
                ? "partial"
                : "current"
        }
      >
        <span>
          <strong>{clients.length}</strong> in view
        </span>
        <span className="admin-pulse__sep" />
        <span>
          <strong>{total}</strong> clients
        </span>
        <span className="admin-pulse__sep" />
        <span>{directoryState}</span>
        <span className="admin-pulse__sep" />
        <span>Accepted intake only</span>
      </div>

      <form
        className="admin-client-toolbar-form"
        onSubmit={applyFilters}
        aria-label="Client filters"
      >
        <div className="admin-client-toolbar">
          <div className="admin-client-toolbar__search">
            <label className="admin-search admin-client-search">
              <AdminIcon name="search" />
              <span className="admin-visually-hidden">Search clients</span>
              <input
                type="search"
                value={draft.search}
                maxLength={160}
                placeholder="Business or email"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
              />
            </label>
            <button
              type="submit"
              className="admin-button admin-client-search__submit"
            >
              Search clients
            </button>
          </div>
          <div className="admin-client-toolbar__actions">
            <button
              type="button"
              className="admin-button admin-button--quiet admin-client-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="client-advanced-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <AdminIcon name="filters" />
              {activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
            </button>
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
        </div>

        {filtersOpen ? (
          <div
            id="client-advanced-filters"
            className="admin-client-filters"
            aria-label="Advanced client filters"
          >
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
        ) : null}
      </form>

      <DirectoryHealth health={health} error={healthError} />

      {error && clients.length > 0 ? (
        <div className="admin-notice admin-notice--error" role="alert">
          The latest refresh failed. Showing the last loaded results. {error}
        </div>
      ) : null}

      {error && clients.length === 0 && !loading ? (
        <div className="admin-error" role="alert">
          <p>{error}</p>
          <button type="button" className="admin-button" onClick={refresh}>
            Retry client list
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-skeleton" role="status">
          <span />
          <span />
          <span />
          <p>Loading client directory...</p>
        </div>
      ) : null}

      {!loading && clients.length === 0 ? (
        <div className="admin-empty" role="status">
          <h3>No clients match these filters</h3>
          <p>
            Pending or unused invitations remain in Invitations. Only accepted
            submissions appear as clients.
          </p>
        </div>
      ) : null}

      {clients.length > 0 ? (
        <div className="admin-client-table-wrap">
          <table className="admin-client-table">
            <caption className="admin-visually-hidden">
              Accepted clients across the shared workspace
            </caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Contact</th>
                <th scope="col">Submitted</th>
                <th scope="col">Inviting admin</th>
                <th scope="col">
                  <span className="admin-visually-hidden">Client dossier</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((record) => (
                <tr
                  key={record.clientId}
                  data-client-id={record.clientId}
                  tabIndex={0}
                  aria-selected={selectedId === record.clientId || undefined}
                  onClick={(event) => selectClientRow(record, event)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    const trigger =
                      event.currentTarget.querySelector<HTMLButtonElement>(
                        "[data-row-action]",
                      );
                    if (trigger) selectClient(record, trigger);
                  }}
                >
                  <td data-label="Client">
                    <div className="admin-client-cell">
                      <span
                        className="admin-client-monogram"
                        aria-hidden="true"
                      >
                        {clientInitials(record)}
                      </span>
                      <span className="admin-client-copy">
                        <span className="admin-client-name">
                          {formatClientName(record)}
                        </span>
                        <span className="admin-client-meta">
                          Issue #{record.issueNumber}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td data-label="Contact">
                    <span className="admin-client-contact-name">
                      {record.contactName ||
                        (emailIsPrimary(record) ? "Email only" : "Not recorded")}
                    </span>
                    {emailIsPrimary(record) ? null : (
                      <span className="admin-client-contact-email">
                        {record.email || "Email not recorded"}
                      </span>
                    )}
                  </td>
                  <td data-label="Submitted">
                    <span className="admin-client-date">
                      {formatDate(record.submittedAt)}
                    </span>
                  </td>
                  <td data-label="Inviting admin">
                    <ActorLabel actor={record.creator} showSource={false} />
                  </td>
                  <td
                    data-label="Client dossier"
                    className="admin-client-action"
                  >
                    <button
                      type="button"
                      className="admin-row-action"
                      data-row-action
                      aria-label={`Open client ${record.clientId} for ${formatClientName(record)}`}
                      aria-haspopup="dialog"
                      aria-expanded={selectedId === record.clientId}
                      aria-controls={
                        selectedId === record.clientId
                          ? "client-inspector"
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        selectClient(record, event.currentTarget);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="admin-pagination admin-client-pagination">
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={previousPage}
          disabled={!cursorTrail.length || loading}
        >
          Previous page
        </button>
        <span className="admin-view__count" data-testid="client-page-summary">
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
        <ClientDossier
          client={client}
          loading={clientLoading}
          error={clientError}
          attempts={attempts}
          attemptsNextCursor={attemptsNextCursor}
          attemptsLoading={attemptsLoading}
          attemptsError={attemptsError}
          attemptTotal={attemptTotal}
          headingRef={headingRef}
          onClose={() => onNavigate({ ...state, clientId: null })}
          onRetry={() => setClientToken((token) => token + 1)}
          onLoadMoreAttempts={loadMoreAttempts}
          onOpenAttempt={(attemptId) =>
            onNavigate(
              {
                view: "generations",
                attemptId,
                clientId: null,
                filters: { clientId: selectedId },
                cursor: null,
              },
              { cursorTrail: [] },
            )
          }
        />
      ) : null}
    </div>
  );
}
