import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  AttemptDetail,
  AttemptEventRecord,
  ClientRecord,
} from "../lib/admin-contracts";
import { ActorLabel } from "./ActorLabel";
import { AdminIcon } from "./AdminIcon";
import { GenerationPreview } from "./GenerationPreview";
import {
  DeliveryStatusBadge,
  ExecutionStatusBadge,
  StatusBadge,
} from "./StatusBadge";
import {
  formatCost,
  formatElapsed,
  formatProfile,
  formatTimestamp,
  previewHref,
  safeEvidenceUrl,
  safeFocusedPreviewUrl,
  safeSiteUrl,
} from "./format";

export type AttemptInspectorProps = {
  attempt: AttemptDetail | null;
  client: ClientRecord | null;
  loading: boolean;
  error: string | null;
  events: AttemptEventRecord[];
  eventsNextCursor: string | null;
  eventCount: number;
  eventsLoading: boolean;
  eventsError: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onRetry: () => void;
  onLoadMoreEvents: () => void;
  onOpenClient: (clientId: string) => void;
};

function WorkflowLinks({ attempt }: { attempt: AttemptDetail }) {
  const runUrl =
    attempt.repository === "WrazyAI/launchloom" && attempt.runId
      ? safeEvidenceUrl(
          `https://github.com/${attempt.repository}/actions/runs/${attempt.runId}${
            attempt.runAttempt ? `/attempts/${attempt.runAttempt}` : ""
          }`,
        )
      : null;
  const issueUrl = attempt.issueNumber
    ? safeEvidenceUrl(
        `https://github.com/WrazyAI/launchloom/issues/${attempt.issueNumber}`,
      )
    : null;
  return (
    <div className="admin-inspector__links">
      {runUrl ? (
        <a href={runUrl} target="_blank" rel="noreferrer">
          Open workflow run
        </a>
      ) : null}
      {issueUrl ? (
        <a href={issueUrl} target="_blank" rel="noreferrer">
          Open issue
        </a>
      ) : null}
      {!runUrl && !issueUrl ? (
        <span className="admin-muted">No safe external evidence link.</span>
      ) : null}
    </div>
  );
}

function FailureSection({ attempt }: { attempt: AttemptDetail }) {
  const failure = attempt.failure;
  const evidenceUrl = safeEvidenceUrl(failure.evidenceUrl);
  const hasRecordedFailure = Boolean(
    failure.category ||
    failure.stage ||
    failure.summary ||
    failure.evidenceUrl ||
    failure.nextStep,
  );
  if (
    !hasRecordedFailure &&
    attempt.executionStatus !== "failed" &&
    attempt.executionStatus !== "unknown"
  )
    return null;
  return (
    <section
      className="admin-inspector__block"
      aria-labelledby="attempt-failure-title"
    >
      <h3 id="attempt-failure-title">Failure evidence</h3>
      <dl className="admin-detail-grid">
        <div>
          <dt>Category</dt>
          <dd>{failure.category || "Not recorded"}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{failure.stage || "Not recorded"}</dd>
        </div>
      </dl>
      <p className="admin-inspector__summary">
        {failure.summary || "Cause not recorded."}
      </p>
      {failure.nextStep ? (
        <p>
          <strong>Next step:</strong> {failure.nextStep}
        </p>
      ) : (
        <p className="admin-muted">No next step recorded.</p>
      )}
      {evidenceUrl ? (
        <a href={evidenceUrl} target="_blank" rel="noreferrer">
          Open run evidence
        </a>
      ) : failure.evidenceUrl ? (
        <p className="admin-muted">
          An evidence link was omitted because it is not an approved token-free
          HTTPS route.
        </p>
      ) : null}
    </section>
  );
}

function EventTimeline({
  events,
  nextCursor,
  eventCount,
  loading,
  error,
  onLoadMore,
}: {
  events: AttemptEventRecord[];
  nextCursor: string | null;
  eventCount: number;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
}) {
  return (
    <section
      className="admin-inspector__block"
      aria-labelledby="attempt-events-title"
    >
      <div className="admin-inspector__block-head">
        <h3 id="attempt-events-title">Stage timeline</h3>
        <span className="admin-muted">{eventCount} events</span>
      </div>
      {events.length ? (
        <ol className="admin-timeline">
          {events.map((event) => {
            const cost =
              event.costUsd === null
                ? null
                : `${event.costKind}: $${event.costUsd.toFixed(4)}`;
            return (
              <li key={event.eventKey} className="admin-timeline__item">
                <div className="admin-timeline__head">
                  <span className="admin-timeline__stage">{event.stage}</span>
                  <StatusBadge label={event.status} />
                  <span className="admin-muted">
                    {formatTimestamp(event.createdAt)}
                  </span>
                </div>
                {event.detail ? (
                  <p className="admin-timeline__detail">{event.detail}</p>
                ) : null}
                <p className="admin-timeline__meta">
                  {[event.provider, event.model, cost, event.source]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="admin-muted">No stage events recorded.</p>
      )}
      {error ? (
        <p className="admin-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? "Loading events..." : "Load more events"}
        </button>
      ) : null}
    </section>
  );
}

export function AttemptInspector({
  attempt,
  client,
  loading,
  error,
  events,
  eventsNextCursor,
  eventCount,
  eventsLoading,
  eventsError,
  headingRef,
  onClose,
  onRetry,
  onLoadMoreEvents,
  onOpenClient,
}: AttemptInspectorProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const focused = attempt && attempt.profile !== "full";
  const previewUrl = focused
    ? safeFocusedPreviewUrl(attempt.previewUrl)
    : safeSiteUrl(client?.previewUrl);
  const productionUrl = focused ? null : safeSiteUrl(client?.productionUrl);
  const siteUrl = previewUrl || productionUrl;
  const siteHref = previewUrl
    ? previewHref(previewUrl) || previewUrl
    : productionUrl;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => setOpen(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  const body = (
    <>
      <div className="admin-sheet__header">
        <div className="admin-sheet__header-copy">
          <div className="admin-sheet__kicker">
            <span>
              {attempt ? `${attempt.profile} generation` : "Generation detail"}
            </span>
            {attempt ? (
              <span>· attempt {attempt.attemptId.slice(0, 12)}</span>
            ) : null}
          </div>
          <h2 id="attempt-inspector-title" ref={headingRef} tabIndex={-1}>
            {attempt ? `Attempt ${attempt.attemptId}` : "Attempt inspector"}
          </h2>
        </div>
        <button
          className="admin-icon-button"
          type="button"
          aria-label="Close preview"
          onClick={onClose}
        >
          <AdminIcon name="close" />
        </button>
      </div>

      <div className="admin-sheet__body">
        {loading ? (
          <p className="admin-muted" role="status">
            Loading attempt detail...
          </p>
        ) : null}

        {error ? (
          <div className="admin-error" role="alert">
            <p>{error}</p>
            <button type="button" className="admin-button" onClick={onRetry}>
              Retry attempt detail
            </button>
          </div>
        ) : null}

        {attempt ? (
          <>
            {attempt.stale ? (
              <p className="admin-notice admin-notice--attention" role="status">
                This attempt is marked stale. Its recorded outcome may be
                incomplete.
              </p>
            ) : null}

            {attempt.deliveryStatus === "diagnostic" ? (
              <p className="admin-notice admin-notice--attention">
                Diagnostic delivery is for review only, not production approval.
              </p>
            ) : null}

            <div className="admin-status-stack admin-status-stack--large">
              <ExecutionStatusBadge
                status={attempt.executionStatus}
                stale={attempt.stale}
              />
              <DeliveryStatusBadge status={attempt.deliveryStatus} />
            </div>

            <section
              className="admin-sheet__preview"
              aria-labelledby="attempt-preview-title"
            >
              <div className="admin-sheet__preview-toolbar">
                <span className="admin-sheet__label" id="attempt-preview-title">
                  Site preview
                </span>
                {siteHref ? (
                  <a
                    className="admin-button admin-button--quiet"
                    href={siteHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit site
                  </a>
                ) : null}
              </div>
              <div className="admin-browser">
                <div className="admin-browser__bar">
                  <span className="admin-browser__dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="admin-browser__url">
                    {siteUrl
                      ? new URL(siteUrl).hostname
                      : "Preview unavailable"}
                  </span>
                </div>
                <div className="admin-browser__media">
                  <GenerationPreview attempt={attempt} large />
                </div>
              </div>
              <p className="admin-sheet__notes">
                <strong>Generation screenshot.</strong>{" "}
                {focused
                  ? "A capture for this attempt, when available."
                  : "This is the captured site for this generation issue. It may predate later revisions; use Visit site for the current preview."}
              </p>
            </section>

            <section
              className="admin-inspector__block"
              aria-labelledby="attempt-summary-title"
            >
              <h3 id="attempt-summary-title">Attempt summary</h3>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Client</dt>
                  <dd>
                    <span>
                      {client
                        ? client.businessName ||
                          client.contactName ||
                          client.clientId
                        : attempt.clientId || "Not recorded"}
                    </span>
                    {client && attempt.clientId ? (
                      <span className="admin-mono admin-block">
                        {client.clientId}
                      </span>
                    ) : null}
                    {attempt.clientId ? (
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={() => onOpenClient(attempt.clientId!)}
                      >
                        Open client dossier
                      </button>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Profile</dt>
                  <dd>{formatProfile(attempt.profile)}</dd>
                </div>
                <div>
                  <dt>Issue</dt>
                  <dd>{attempt.issueNumber ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Request</dt>
                  <dd className="admin-mono">
                    {attempt.requestId || "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Repository</dt>
                  <dd className="admin-mono">
                    {attempt.repository || "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Workflow run</dt>
                  <dd>
                    {attempt.runId
                      ? `${attempt.runId}${
                          attempt.runAttempt
                            ? ` / attempt ${attempt.runAttempt}`
                            : ""
                        }`
                      : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(attempt.createdAt)}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTimestamp(attempt.startedAt)}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{formatTimestamp(attempt.completedAt)}</dd>
                </div>
                <div>
                  <dt>Elapsed</dt>
                  <dd data-attempt-elapsed>
                    {formatElapsed(
                      attempt.startedAt,
                      attempt.completedAt,
                      attempt.stale ||
                        [
                          "succeeded",
                          "failed",
                          "cancelled",
                          "skipped",
                          "unknown",
                        ].includes(attempt.executionStatus),
                    )}
                  </dd>
                </div>
              </dl>
              <WorkflowLinks attempt={attempt} />
            </section>

            <FailureSection attempt={attempt} />

            <section
              className="admin-inspector__block"
              aria-labelledby="attempt-costs-title"
            >
              <h3 id="attempt-costs-title">Costs</h3>
              <dl className="admin-cost-grid">
                <div>
                  <dt>Actual cost</dt>
                  <dd>{formatCost(attempt.costs).actual}</dd>
                </div>
                <div>
                  <dt>Estimated cost</dt>
                  <dd>{formatCost(attempt.costs).estimated}</dd>
                </div>
                <div>
                  <dt>Unreported cost</dt>
                  <dd>{formatCost(attempt.costs).unreported}</dd>
                </div>
              </dl>
            </section>

            <section
              className="admin-inspector__block"
              aria-labelledby="attempt-actors-title"
            >
              <h3 id="attempt-actors-title">Attribution</h3>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Initiator</dt>
                  <dd>
                    <ActorLabel actor={attempt.initiator} />
                  </dd>
                </div>
                <div>
                  <dt>Invitation creator</dt>
                  <dd>
                    <ActorLabel actor={attempt.invitationCreator} />
                  </dd>
                </div>
              </dl>
            </section>

            <EventTimeline
              events={events}
              nextCursor={eventsNextCursor}
              eventCount={eventCount}
              loading={eventsLoading}
              error={eventsError}
              onLoadMore={onLoadMoreEvents}
            />
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <dialog
      id="attempt-inspector"
      ref={dialogRef}
      className={`admin-sheet${open ? " is-open" : ""}`}
      data-inspector-surface="dialog"
      aria-modal="true"
      aria-labelledby="attempt-inspector-title"
      aria-busy={loading || eventsLoading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!dialog.contains(active)) {
          event.preventDefault();
          first.focus();
          return;
        }
        const index = active ? focusable.indexOf(active) : -1;
        if (index === -1) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && index === 0) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="admin-inspector__sheet">
        <span className="admin-inspector__grabber" aria-hidden="true" />
        {body}
      </div>
    </dialog>
  );
}
