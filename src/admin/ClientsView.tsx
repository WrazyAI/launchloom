import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type {
  AttemptSummary,
  ClientFilters,
  ClientRecord,
  Health,
} from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import type { AdminRouteState } from "./route-state";
import { ActorLabel } from "./ActorLabel";
import { DeliveryStatusBadge, ExecutionStatusBadge } from "./StatusBadge";
import {
  dateInputValue,
  formatClientName,
  formatDate,
  formatTimestamp,
  isAbortError,
  parseDateEnd,
  parseDateStart,
  requestErrorMessage,
  safeSiteUrl,
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
  return (
    <div
      className={`admin-notice${partial ? " admin-notice--attention" : ""}`}
      role="status"
      data-health-state={partial ? "partial" : "current"}
    >
      <strong>
        {partial
          ? "Client directory may be incomplete"
          : "Client directory health"}
      </strong>
      {partial ? (
        <span>
          {health.pendingProjectionCount} pending projections
          {health.partial ? " and partial coverage" : ""}. Counts only include
          records already accepted into the shared ledger.
        </span>
      ) : (
        <span>No directory backlog is reported.</span>
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

function SiteLinks({ client }: { client: ClientRecord }) {
  const production = safeSiteUrl(client.productionUrl);
  const preview = safeSiteUrl(client.previewUrl);
  const hasUnsafe = Boolean(
    (client.productionUrl && !production) || (client.previewUrl && !preview),
  );
  return (
    <section className="admin-inspector__block" aria-labelledby="client-sites-title">
      <h3 id="client-sites-title">Site links</h3>
      <div className="admin-inspector__links">
        {production ? (
          <a href={production} target="_blank" rel="noreferrer">
            Published site
          </a>
        ) : null}
        {preview ? (
          <a href={preview} target="_blank" rel="noreferrer">
            Preview site
          </a>
        ) : null}
        {!production && !preview ? (
          <span className="admin-muted">No site links recorded.</span>
        ) : null}
        {hasUnsafe ? (
          <span className="admin-muted">
            A recorded site link was omitted because it is not a token-free
            approved HTTPS route.
          </span>
        ) : null}
      </div>
      <p className="admin-muted">
        Site links are shown independently of individual attempt outcomes. A
        later failed attempt does not demote an earlier published site.
      </p>
    </section>
  );
}

function ClientAttempts({
  attempts,
  loading,
  error,
  nextCursor,
  total,
  onOpenAttempt,
  onLoadMore,
  onRetry,
}: {
  attempts: AttemptSummary[];
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  total: number;
  onOpenAttempt: (attemptId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const hasDiagnostic = attempts.some(
    (attempt) => attempt.deliveryStatus === "diagnostic",
  );
  return (
    <section
      className="admin-inspector__block"
      aria-labelledby="client-attempts-title"
      data-client-attempts
    >
      <div className="admin-inspector__block-head">
        <h3 id="client-attempts-title">Attempt history</h3>
        <span className="admin-muted">{total} attempts</span>
      </div>
      {hasDiagnostic ? (
        <p className="admin-notice admin-notice--attention">
          Diagnostic delivery is for review only, not production approval.
        </p>
      ) : null}
      {loading && attempts.length === 0 ? (
        <p className="admin-muted" role="status">
          Loading attempt history...
        </p>
      ) : null}
      {error ? (
        <div className="admin-inline-error" role="alert">
          <p>{error}</p>
          <button type="button" className="admin-link-button" onClick={onRetry}>
            Retry attempt history
          </button>
        </div>
      ) : null}
      {!loading && !error && attempts.length === 0 ? (
        <p className="admin-muted">
          No generation attempts are recorded for this client.
        </p>
      ) : null}
      {attempts.length ? (
        <ul className="admin-attempt-list">
          {attempts.map((attempt) => (
            <li key={attempt.attemptId} data-attempt-id={attempt.attemptId}>
              <div className="admin-attempt-list__status">
                <ExecutionStatusBadge
                  status={attempt.executionStatus}
                  stale={attempt.stale}
                />
                <DeliveryStatusBadge status={attempt.deliveryStatus} />
              </div>
              <div>
                <p className="admin-mono">{attempt.attemptId}</p>
                <p className="admin-muted">
                  {formatTimestamp(attempt.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className="admin-link-button"
                aria-label={`Open attempt ${attempt.attemptId} from client history`}
                onClick={() => onOpenAttempt(attempt.attemptId)}
              >
                Open attempt
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? "Loading attempts..." : "Load more attempts"}
        </button>
      ) : null}
    </section>
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
  const focusOnOpenRef = useRef(false);
  const hadSelectionRef = useRef(Boolean(state.clientId));

  const queryKey = `${filterSignature}|${cursor || ""}|${limit}`;

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
    onNavigate(
      {
        ...state,
        filters: filtersFromDraft(draft),
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

  function selectClient(
    record: ClientRecord,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    triggerRef.current = event.currentTarget;
    focusOnOpenRef.current = true;
    onNavigate({
      ...state,
      clientId: record.clientId,
      attemptId: null,
    });
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
      .listAttempts({ clientId: activeId, cursor: attemptsNextCursor, limit: 100 })
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
        if (
          attemptsRequest.current !== requestId ||
          isAbortError(failure)
        )
          return;
        setAttemptsError(requestErrorMessage(failure));
        setAttemptsLoading(false);
      });
  }

  function refresh() {
    setRefreshToken((token) => token + 1);
    if (selectedId) setClientToken((token) => token + 1);
  }

  const showing =
    clients.length > 0
      ? `Showing ${clients.length} of ${total} clients`
      : loading
        ? "Loading clients"
        : "No clients to show";

  return (
    <div id="clients-view" className="admin-view" data-route="clients">
      <div className="admin-view__toolbar">
        <p className="admin-view__count" data-testid="client-page-summary">
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

      <DirectoryHealth health={health} error={healthError} />

      <form className="admin-filters" onSubmit={applyFilters} aria-label="Client filters">
        <label className="admin-field admin-field--wide">
          <span>Search clients</span>
          <input
            type="search"
            value={draft.search}
            maxLength={160}
            placeholder="Business, contact, email or invitation"
            onChange={(event) =>
              setDraft((current) => ({ ...current, search: event.target.value }))
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

      <div className="admin-view-layout">
        <div className="admin-view__ledger">
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
                Pending or unused invitations remain in Invitations. Only
                accepted submissions appear as clients.
              </p>
            </div>
          ) : null}

          {clients.length > 0 ? (
            <div
              className="admin-table-wrap"
              role="region"
              aria-label="Client directory"
              tabIndex={0}
            >
              <table className="admin-table admin-table--clients">
                <caption className="admin-visually-hidden">
                  Accepted clients across the shared workspace
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Invitation</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Inviting admin</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((record) => (
                    <tr key={record.clientId} data-client-id={record.clientId}>
                      <td>
                        <button
                          type="button"
                          className="admin-row-button"
                          aria-label={`Open client ${record.clientId} for ${
                            record.businessName || "an unnamed business"
                          }`}
                          aria-expanded={selectedId === record.clientId}
                          aria-controls={
                            selectedId === record.clientId
                              ? "client-inspector"
                              : undefined
                          }
                          onClick={(event) => selectClient(record, event)}
                        >
                          <span className="admin-row-primary">
                            {formatClientName(record)}
                          </span>
                          <span className="admin-row-secondary admin-mono">
                            {record.clientId}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span>{record.contactName || "Not recorded"}</span>
                        <span className="admin-block admin-muted">
                          {record.email || "Email not recorded"}
                        </span>
                      </td>
                      <td className="admin-mono">{record.inviteId || "Not recorded"}</td>
                      <td>{formatTimestamp(record.submittedAt)}</td>
                      <td>
                        <ActorLabel actor={record.creator} showSource={false} />
                      </td>
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
          <section
            id="client-inspector"
            className="admin-inspector"
            aria-labelledby="client-inspector-title"
            aria-busy={clientLoading || attemptsLoading}
            onKeyDown={(event) => {
              const target = event.target;
              if (
                event.key === "Escape" &&
                !(target instanceof HTMLInputElement) &&
                !(target instanceof HTMLTextAreaElement) &&
                !(target instanceof HTMLSelectElement)
              ) {
                event.preventDefault();
                onNavigate({ ...state, clientId: null });
              }
            }}
          >
            <div className="admin-inspector__top">
              <div>
                <p className="admin-eyebrow">Client dossier</p>
                <h2 id="client-inspector-title" ref={headingRef} tabIndex={-1}>
                  {client
                    ? `Client dossier: ${formatClientName(client)}`
                    : "Client dossier"}
                </h2>
              </div>
              <button
                type="button"
                className="admin-button admin-button--quiet"
                onClick={() => onNavigate({ ...state, clientId: null })}
              >
                Close client dossier
              </button>
            </div>

            {clientLoading ? (
              <p className="admin-muted" role="status">
                Loading client detail...
              </p>
            ) : null}

            {clientError ? (
              <div className="admin-error" role="alert">
                <p>{clientError}</p>
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setClientToken((token) => token + 1)}
                >
                  Retry client detail
                </button>
              </div>
            ) : null}

            {client ? (
              <>
                <section
                  className="admin-inspector__block"
                  aria-labelledby="client-identity-title"
                >
                  <h3 id="client-identity-title">Client identity</h3>
                  <dl className="admin-detail-grid">
                    <div>
                      <dt>Business name</dt>
                      <dd>{client.businessName || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Contact name</dt>
                      <dd>{client.contactName || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{client.email || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{client.phone || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Client record</dt>
                      <dd className="admin-mono">{client.clientId}</dd>
                    </div>
                    <div>
                      <dt>Invitation</dt>
                      <dd className="admin-mono">
                        {client.inviteId || "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Submission</dt>
                      <dd className="admin-mono">
                        {client.submissionId || "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Issue</dt>
                      <dd>{client.issueNumber}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd data-client-submitted>
                        {formatTimestamp(client.submittedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Inviting admin</dt>
                      <dd>
                        <ActorLabel actor={client.creator} />
                      </dd>
                    </div>
                  </dl>
                </section>

                <SiteLinks client={client} />

                <ClientAttempts
                  attempts={attempts}
                  loading={attemptsLoading}
                  error={attemptsError}
                  nextCursor={attemptsNextCursor}
                  total={attemptTotal}
                  onOpenAttempt={(attemptId) =>
                    onNavigate(
                      {
                        view: "generations",
                        attemptId,
                        clientId: null,
                        filters: { clientId: client.clientId },
                        cursor: null,
                      },
                      { cursorTrail: [] },
                    )
                  }
                  onLoadMore={loadMoreAttempts}
                  onRetry={() => setClientToken((token) => token + 1)}
                />
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
