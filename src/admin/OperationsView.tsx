import { useEffect, useState } from "react";
import type {
  OperationDetail,
  OperationEvent,
  OperationRecord,
} from "../lib/admin-contracts";
import { ApiRequestError, type AdminApi } from "./api";
import type { AdminRouteState } from "./route-state";
import { AdminIcon } from "./AdminIcon";
import { formatTimestamp, isAbortError, requestErrorMessage } from "./format";
import {
  costKindLabel,
  eventListLabel,
  operationCostLabel,
  operationNeedsAttention,
  operationStatusLabel,
  operationSummary,
  popCursorTrail,
  pushCursorTrail,
  telemetryLabel,
} from "./operations-format";

const PAGE_SIZE = 50;

function CostList({ record }: { record: OperationRecord }) {
  if (!record.costs.length)
    return <span className="admin-operations-muted">No cost evidence</span>;
  return (
    <ul className="admin-operations-costs">
      {record.costs.map((cost) => (
        <li key={cost.currency ?? "unknown"}>
          <strong>{cost.currency ?? "Currency not recorded"}</strong>
          <span>
            {costKindLabel(record.costKind)}:{" "}
            {record.costKind === "actual"
              ? (cost.actual ?? "Not reported")
              : record.costKind === "estimated"
                ? (cost.estimated ?? "Not reported")
                : "Not reported"}
          </span>
          <span>
            {cost.unreportedCount} unreported · {cost.incompleteCount}{" "}
            incomplete · {cost.unknownCoverageCount} unknown coverage
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventList({ events }: { events: OperationEvent[] }) {
  if (!events.length)
    return (
      <p className="admin-operations-muted">
        No stage events have been recorded for this operation.
      </p>
    );
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-operations-events">
        <caption className="admin-visually-hidden">
          Recorded stage events for this operation
        </caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Transition</th>
            <th scope="col">Observed</th>
            <th scope="col">Cost</th>
            <th scope="col">Build</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.eventId}>
              <td data-label="Stage">
                <span className="admin-operations-code">{event.stage}</span>
                {event.detailCode ? (
                  <span className="admin-operations-subtle">
                    {event.detailCode}
                  </span>
                ) : null}
              </td>
              <td data-label="Transition">{event.transition}</td>
              <td data-label="Observed">{formatTimestamp(event.occurredAt)}</td>
              <td data-label="Cost">
                {event.costKind === "unreported" || event.amount === null
                  ? "Unreported"
                  : `${event.currency ?? ""} ${event.amount}`.trim()}
              </td>
              <td data-label="Build">
                {event.buildSha ? (
                  <span className="admin-operations-code">
                    {event.buildSha.slice(0, 12)}
                  </span>
                ) : (
                  <span className="admin-operations-muted">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationDetailPanel({
  detail,
  loading,
  error,
  onClose,
  onRetry,
}: {
  detail: OperationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <section
        className="admin-panel admin-operations-detail"
        aria-live="polite"
        aria-busy="true"
      >
        <p>Loading operation detail…</p>
      </section>
    );
  if (error)
    return (
      <section
        className="admin-panel admin-operations-detail"
        role="alert"
        data-operation-detail-error
      >
        <p>{error}</p>
        <div className="admin-operations-actions">
          <button
            type="button"
            className="admin-button admin-button--quiet"
            onClick={onRetry}
          >
            Retry detail
          </button>
          <button
            type="button"
            className="admin-button admin-button--quiet"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </section>
    );
  if (!detail) return null;
  const status = operationStatusLabel(detail.status);
  return (
    <section
      className="admin-panel admin-operations-detail"
      aria-labelledby="operations-detail-title"
      data-operation-attempt={detail.attemptId}
    >
      <div className="admin-panel__head admin-operations-detail__head">
        <div>
          <p className="admin-eyebrow">Stable attempt ID</p>
          <h2 id="operations-detail-title" tabIndex={-1}>
            <span className="admin-operations-code">{detail.attemptId}</span>
          </h2>
          <p className="admin-operations-muted">
            {detail.profile} · attempt {detail.attemptNumber}
          </p>
        </div>
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={onClose}
        >
          Close detail
        </button>
      </div>

      <div className="admin-operations-detail__grid">
        <div>
          <h3>Status</h3>
          <p
            className={`admin-operation-status admin-operation-status--${status.tone}`}
          >
            {status.label}
          </p>
          <dl className="admin-operations-facts">
            <div>
              <dt>Client</dt>
              <dd>{detail.clientName ?? "Not linked"}</dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd>
                {detail.siteUrl ? (
                  <a href={detail.siteUrl} target="_blank" rel="noreferrer">
                    View site
                  </a>
                ) : (
                  "No verified site"
                )}
              </dd>
            </div>
            <div>
              <dt>Dispatch</dt>
              <dd>{detail.dispatchState}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {detail.deliveryStatus === "preview_ready"
                  ? "Verified preview"
                  : "Not verified"}
              </dd>
            </div>
            <div>
              <dt>Last observation</dt>
              <dd>{formatTimestamp(detail.lastObservedAt)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatTimestamp(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatTimestamp(detail.startedAt)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{formatTimestamp(detail.finishedAt)}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h3>Cost and telemetry</h3>
          <p>{operationCostLabel(detail)}</p>
          <p>{telemetryLabel(detail.telemetryIncomplete)}</p>
          <CostList record={detail} />
        </div>
        <div>
          <h3>Recovery evidence</h3>
          <dl className="admin-operations-facts">
            <div>
              <dt>Recovery reason</dt>
              <dd>
                {detail.recoveryReason ? (
                  <span className="admin-operations-code">
                    {detail.recoveryReason}
                  </span>
                ) : (
                  "No recovery reason recorded"
                )}
              </dd>
            </div>
            <div>
              <dt>Outbox</dt>
              <dd>
                {detail.outbox.state} · {detail.outbox.retryCount} retries
              </dd>
            </div>
            <div>
              <dt>Last outbox error</dt>
              <dd>{detail.outbox.lastErrorCode ?? "No error code recorded"}</dd>
            </div>
            <div>
              <dt>Operator action</dt>
              <dd>
                {detail.operatorAction ? (
                  <>
                    <span className="admin-operations-code">
                      {detail.operatorAction.decision}
                    </span>
                    <span className="admin-operations-subtle">
                      {detail.operatorAction.actorId} ·{" "}
                      {formatTimestamp(detail.operatorAction.recordedAt)}
                    </span>
                  </>
                ) : (
                  "No audited operator action"
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h3>Workflow correlation</h3>
          <dl className="admin-operations-facts">
            <div>
              <dt>Repository</dt>
              <dd>{detail.workflow.repository ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Run ID</dt>
              <dd>{detail.workflow.runId ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Run attempt</dt>
              <dd>{detail.workflow.runAttempt ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Operation ID</dt>
              <dd className="admin-operations-code">{detail.operationId}</dd>
            </div>
            <div>
              <dt>Request ID</dt>
              <dd className="admin-operations-code">{detail.requestId}</dd>
            </div>
            <div>
              <dt>Intake ID</dt>
              <dd className="admin-operations-code">{detail.intakeId}</dd>
            </div>
          </dl>
        </div>
      </div>

      <h3>Stage events</h3>
      <p className="admin-operations-muted" data-event-coverage>
        {eventListLabel(detail.events.length, detail.eventCount)}
      </p>
      <EventList events={detail.events} />
    </section>
  );
}

export function OperationsView({
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
  const cursor = state.cursor;
  const [records, setRecords] = useState<OperationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [detail, setDetail] = useState<OperationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailToken, setDetailToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUnavailable(false);
    api
      .listOperations(
        { limit: PAGE_SIZE, cursor },
        { signal: controller.signal },
      )
      .then((page) => {
        setRecords(page.items);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (isAbortError(cause)) return;
        setRecords([]);
        setTotal(0);
        setNextCursor(null);
        if (
          cause instanceof ApiRequestError &&
          (cause.code === "not_enabled" || cause.code === "unavailable")
        ) {
          setUnavailable(true);
          return;
        }
        setError(requestErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, cursor, refreshToken]);

  useEffect(() => {
    if (!state.attemptId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    api
      .getOperation(state.attemptId, { signal: controller.signal })
      .then(setDetail)
      .catch((cause: unknown) => {
        if (isAbortError(cause)) return;
        setDetail(null);
        setDetailError(requestErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [api, state.attemptId, detailToken]);

  function openOperation(record: OperationRecord) {
    onNavigate({ ...state, attemptId: record.attemptId }, { cursorTrail });
  }

  function closeDetail() {
    onNavigate({ ...state, attemptId: null }, { cursorTrail });
  }

  function nextPage() {
    if (!nextCursor) return;
    onNavigate(
      { ...state, cursor: nextCursor, attemptId: null },
      { cursorTrail: pushCursorTrail(cursorTrail, cursor) },
    );
  }

  function previousPage() {
    const previous = popCursorTrail(cursorTrail);
    onNavigate(
      { ...state, cursor: previous.cursor, attemptId: null },
      { cursorTrail: previous.trail },
    );
  }

  function openLegacyHistory() {
    onNavigate(
      {
        ...state,
        view: "generations",
        attemptId: null,
        cursor: null,
        filters: {},
      },
      { cursorTrail: [] },
    );
  }

  const summary = operationSummary(records);
  const showing = records.length
    ? `Showing ${records.length} of ${total} operations`
    : loading
      ? "Loading operations"
      : "No operations to show";

  return (
    <div
      id="operations-view"
      className="admin-view"
      data-route="operations"
      data-record-source="operations"
    >
      <div className="admin-notice" role="status" data-record-source-label>
        <strong>Current operations</strong>
        <span>
          New intake and generation records from Postgres. Delivery is only
          marked verified when the recorded preview handoff is present.
        </span>
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={openLegacyHistory}
        >
          Open sites
        </button>
      </div>

      <div className="admin-pulse" aria-label="Operations summary">
        <span>
          <strong>{summary.attention}</strong> need attention
        </span>
        <span className="admin-pulse__sep" />
        <span>
          <strong>{summary.previewReady}</strong> verified previews
        </span>
        <span className="admin-pulse__sep" />
        <span>
          <strong>{summary.waiting}</strong> waiting to start
        </span>
        <span className="admin-pulse__sep" />
        <span>
          <strong>{summary.incompleteTelemetry}</strong> incomplete telemetry
        </span>
        <span className="admin-pulse__sep" />
        <span>Page counts only</span>
      </div>

      {unavailable ? (
        <div className="admin-notice admin-notice--attention" role="status">
          <strong>Current operations are not enabled here</strong>
          <span>
            The Postgres operations store is not configured for this
            environment. Existing records remain available under Sites.
          </span>
          <button
            type="button"
            className="admin-button admin-button--quiet"
            onClick={openLegacyHistory}
          >
            Open sites
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="admin-notice admin-notice--error" role="alert">
          <strong>Operations could not be loaded</strong>
          <span>{error}</span>
          <button
            type="button"
            className="admin-button admin-button--quiet"
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!unavailable && !error ? (
        <>
          <div className="admin-operations-toolbar">
            <span className="admin-view__count">{showing}</span>
            <button
              type="button"
              className="admin-button admin-button--quiet"
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="admin-table-wrap admin-operations-table-wrap">
            <table className="admin-table admin-operations-table">
              <caption className="admin-visually-hidden">
                Current Postgres-backed generation operations
              </caption>
              <thead>
                <tr>
                  <th scope="col">Operation</th>
                  <th scope="col">Site</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dispatch</th>
                  <th scope="col">Last observed</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Telemetry</th>
                  <th scope="col">
                    <span className="admin-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const status = operationStatusLabel(record.status);
                  return (
                    <tr
                      key={record.attemptId}
                      data-operation-status={record.status}
                      aria-current={
                        state.attemptId === record.attemptId
                          ? "true"
                          : undefined
                      }
                    >
                      <td data-label="Operation">
                        <span className="admin-operations-primary">
                          {record.profile}
                        </span>
                        <span className="admin-operations-code">
                          {record.attemptId}
                        </span>
                        <span className="admin-operations-subtle">
                          Attempt {record.attemptNumber} ·{" "}
                          {formatTimestamp(record.createdAt)}
                        </span>
                      </td>
                      <td data-label="Site">
                        <span className="admin-operations-primary">
                          {record.clientName || "Not linked"}
                        </span>
                        {record.siteUrl ? (
                          <a
                            className="admin-site-open"
                            href={record.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View site
                          </a>
                        ) : (
                          <span className="admin-operations-muted">
                            No verified site
                          </span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`admin-operation-status admin-operation-status--${status.tone}`}
                        >
                          {status.label}
                        </span>
                        {operationNeedsAttention(record) &&
                        record.attentionReason ? (
                          <span className="admin-operations-subtle">
                            {record.attentionReason}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Dispatch">
                        {record.dispatchState.replaceAll("_", " ")}
                        <span className="admin-operations-subtle">
                          {record.deliveryStatus === "preview_ready"
                            ? "Preview verified"
                            : "No verified preview"}
                        </span>
                      </td>
                      <td data-label="Last observed">
                        {formatTimestamp(record.lastObservedAt)}
                      </td>
                      <td data-label="Cost">{operationCostLabel(record)}</td>
                      <td data-label="Telemetry">
                        <span
                          className={
                            record.telemetryIncomplete
                              ? "admin-operations-attention"
                              : ""
                          }
                        >
                          {telemetryLabel(record.telemetryIncomplete)}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="admin-row-action"
                          aria-label={`Open operation ${record.attemptId}`}
                          onClick={() => openOperation(record)}
                        >
                          Open
                          <AdminIcon name="panel" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!records.length && !loading ? (
            <div className="admin-notice" role="status">
              <strong>No current operations</strong>
              <span>
                Postgres has no recorded attempts yet. Site history remains
                separate and read-only.
              </span>
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
            <span className="admin-view__count">
              {nextCursor ? "More operations available" : "End of operations"}
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
        </>
      ) : null}

      {state.attemptId ? (
        <OperationDetailPanel
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
          onRetry={() => setDetailToken((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}
