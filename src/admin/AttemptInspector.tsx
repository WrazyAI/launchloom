import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  AttemptDetail,
  AttemptEventRecord,
  ClientRecord,
} from "../lib/admin-contracts";
import { ActorLabel } from "./ActorLabel";
import { AdminIcon } from "./AdminIcon";
import { isSiteGeneration } from "./site-groups";
import { GenerationPreview } from "./GenerationPreview";
import { DetailValue } from "./DetailValue";
import {
  DeliveryStatusBadge,
  ExecutionStatusBadge,
  StatusBadge,
} from "./StatusBadge";
import {
  focusedDiagnosticPreviewUrl,
  formatCost,
  formatElapsed,
  formatProfile,
  formatTimestamp,
  previewHref,
  relatedPreviewLink,
  safeEvidenceUrl,
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
  onOpenAttempt: (attemptId: string) => void;
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
      <div className="admin-inspector__summary">
        <DetailValue value={failure.summary || "Cause not recorded."} />
      </div>
      {failure.nextStep ? (
        <div className="admin-failure-next">
          <strong>Next step</strong>
          <DetailValue value={failure.nextStep} />
        </div>
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
            return (
              <li key={event.eventKey} className="admin-timeline__item">
                <div className="admin-timeline__head">
                  <span className="admin-timeline__stage">{event.stage}</span>
                  <StatusBadge label={event.status} />
                  <span className="admin-muted">
                    {formatTimestamp(event.createdAt)}
                  </span>
                </div>
                {event.detail ? <DetailValue value={event.detail} /> : null}
                <dl className="admin-event-facts">
                  {event.provider ? (
                    <div>
                      <dt>Provider</dt>
                      <dd>{event.provider}</dd>
                    </div>
                  ) : null}
                  {event.model ? (
                    <div>
                      <dt>Model</dt>
                      <dd>{event.model}</dd>
                    </div>
                  ) : null}
                  {event.costUsd !== null ? (
                    <div>
                      <dt>
                        {event.costKind === "actual"
                          ? "Actual cost"
                          : event.costKind === "estimated"
                            ? "Estimated cost"
                            : "Unreported cost"}
                      </dt>
                      <dd>${event.costUsd.toFixed(4)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Source</dt>
                    <dd>{event.source}</dd>
                  </div>
                </dl>
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
  onOpenAttempt,
}: AttemptInspectorProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const focused = attempt ? !isSiteGeneration(attempt) : false;
  const attemptSiteUrl = attempt ? safeSiteUrl(attempt.siteUrl) : null;
  const previewUrl =
    focused && attempt
      ? focusedDiagnosticPreviewUrl(attempt)
      : safeSiteUrl(client?.previewUrl) || attemptSiteUrl;
  const productionUrl = focused ? null : safeSiteUrl(client?.productionUrl);
  const siteUrl = previewUrl || productionUrl;
  const siteHref = previewUrl
    ? previewHref(previewUrl) || previewUrl
    : productionUrl;
  // The server only resolves this for full attempts that delivered nothing of
  // their own; the UI repeats that boundary so a focused attempt can never
  // inherit another attempt's preview.
  const relatedPreview =
    attempt && isSiteGeneration(attempt)
      ? relatedPreviewLink(attempt.relatedPreview, siteHref)
      : null;

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

  const latestEvent = [
    ...(attempt?.events || []),
    ...events,
  ].reduce<AttemptEventRecord | null>(
    (latest, event) =>
      !latest || event.createdAt > latest.createdAt ? event : latest,
    null,
  );

  const body = (
    <>
      <div className="admin-sheet__header">
        <div className="admin-sheet__header-copy">
          <div className="admin-sheet__kicker">
            <span>
              {attempt ? formatProfile(attempt.profile) : "Generation"}
            </span>
          </div>
          <h2 id="attempt-inspector-title" ref={headingRef} tabIndex={-1}>
            {attempt ? (
              <>
                {client?.businessName ||
                  client?.contactName ||
                  attempt.clientName ||
                  "Generation detail"}
                <span className="admin-visually-hidden">{` Attempt ${attempt.attemptId}`}</span>
              </>
            ) : (
              "Attempt inspector"
            )}
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

            <dl className="admin-panel-outcomes" data-attempt-outcomes>
              <div>
                <dt>Execution</dt>
                <dd>
                  <ExecutionStatusBadge
                    status={attempt.executionStatus}
                    stale={attempt.stale}
                  />
                </dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  <DeliveryStatusBadge status={attempt.deliveryStatus} />
                </dd>
              </div>
            </dl>

            <dl className="admin-panel-metrics" data-attempt-metrics>
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
              <div>
                <dt>Actual cost</dt>
                <dd>{formatCost(attempt.costs).actual}</dd>
              </div>
              <div>
                <dt>Estimated cost</dt>
                <dd>{formatCost(attempt.costs).estimated}</dd>
              </div>
            </dl>
            {attempt.costs.unreportedCount > 0 ? (
              <p className="admin-cost-coverage">
                {formatCost(attempt.costs).unreported}
              </p>
            ) : null}

            <div className="admin-panel-actions">
              {siteHref ? (
                <a
                  className="admin-button"
                  href={siteHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit site
                </a>
              ) : null}
              <WorkflowLinks attempt={attempt} />
              {attempt.clientId ? (
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={() => onOpenClient(attempt.clientId!)}
                >
                  Open client dossier
                </button>
              ) : null}
            </div>

            <FailureSection attempt={attempt} />

            {attempt.executionStatus === "running" ||
            attempt.executionStatus === "queued" ? (
              <div
                className="admin-live-stage"
                role="status"
                aria-live="polite"
              >
                <span
                  className="admin-status__dot admin-status__dot--running"
                  aria-hidden="true"
                />
                <span>
                  {latestEvent
                    ? `Current stage: ${latestEvent.stage} (${latestEvent.status})`
                    : "Waiting for the first stage event"}
                </span>
              </div>
            ) : null}

            <EventTimeline
              events={events}
              nextCursor={eventsNextCursor}
              eventCount={eventCount}
              loading={eventsLoading}
              error={eventsError}
              onLoadMore={onLoadMoreEvents}
            />

            <details className="admin-panel-disclosure" open>
              <summary id="attempt-preview-title">Site capture</summary>
              <div
                className="admin-sheet__preview"
                aria-labelledby="attempt-preview-title"
              >
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
                    ? "Captured for this attempt."
                    : relatedPreview
                      ? "Issue capture, not this attempt's delivery."
                      : "Issue capture; may predate later revisions."}
                </p>
              </div>
            </details>

            {relatedPreview ? (
              <section
                className="admin-inspector__block"
                aria-labelledby="attempt-related-preview-title"
                data-related-preview
              >
                <h3 id="attempt-related-preview-title">
                  Preview from another attempt
                </h3>
                <p className="admin-inspector__summary">
                  No preview delivery is recorded for this attempt. The latest
                  successful generation for issue {relatedPreview.issueNumber}{" "}
                  was{" "}
                  <span className="admin-mono">{relatedPreview.attemptId}</span>
                  {relatedPreview.runId
                    ? ` (run ${relatedPreview.runId}${
                        relatedPreview.runAttempt
                          ? `, attempt ${relatedPreview.runAttempt}`
                          : ""
                      })`
                    : ""}
                  , completed {formatTimestamp(relatedPreview.completedAt)}. The
                  verified preview recorded for this issue is still available.
                </p>
                <div className="admin-inspector__related-actions">
                  <a
                    className="admin-button admin-button--quiet"
                    href={relatedPreview.href}
                    target="_blank"
                    rel="noreferrer"
                    data-related-preview-link
                    aria-label={`Open the verified preview for issue ${relatedPreview.issueNumber} delivered by attempt ${relatedPreview.attemptId}`}
                  >
                    Visit related preview
                  </a>
                  <button
                    type="button"
                    className="admin-link-button"
                    onClick={() => onOpenAttempt(relatedPreview.attemptId)}
                  >
                    Open related attempt
                  </button>
                </div>
                <p className="admin-muted">
                  This link is not this attempt's own preview.
                </p>
              </section>
            ) : null}

            <details className="admin-panel-disclosure">
              <summary>Record details</summary>
              <section
                className="admin-inspector__block"
                aria-labelledby="attempt-summary-title"
              >
                <h3 id="attempt-summary-title">Attempt summary</h3>
                <dl className="admin-detail-grid">
                  <div>
                    <dt>Attempt reference</dt>
                    <dd className="admin-mono">{attempt.attemptId}</dd>
                  </div>
                  <div>
                    <dt>Client</dt>
                    <dd>
                      <span>
                        {client
                          ? client.businessName ||
                            client.contactName ||
                            client.clientId
                          : attempt.clientName ||
                            attempt.clientId ||
                            "Not recorded"}
                      </span>
                      {client && attempt.clientId ? (
                        <span className="admin-mono admin-block">
                          {client.clientId}
                        </span>
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
                </dl>
              </section>
            </details>
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
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <dialog
      id="attempt-inspector"
      ref={dialogRef}
      className={`admin-sheet admin-detail-panel${open ? " is-open" : ""}`}
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
      {body}
    </dialog>
  );
}
