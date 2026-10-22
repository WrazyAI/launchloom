import { useEffect, useRef, useState, type RefObject } from "react";
import type { AttemptSummary, ClientRecord } from "../lib/admin-contracts";
import { ActorLabel } from "./ActorLabel";
import { AdminIcon } from "./AdminIcon";
import { DeliveryStatusBadge, ExecutionStatusBadge } from "./StatusBadge";
import { formatClientName, formatTimestamp, safeSiteUrl } from "./format";

export type ClientDossierProps = {
  client: ClientRecord | null;
  loading: boolean;
  error: string | null;
  attempts: AttemptSummary[];
  attemptsNextCursor: string | null;
  attemptsLoading: boolean;
  attemptsError: string | null;
  attemptTotal: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onRetry: () => void;
  onLoadMoreAttempts: () => void;
  onOpenAttempt: (attemptId: string) => void;
};

function SiteLinks({ client }: { client: ClientRecord }) {
  const production = safeSiteUrl(client.productionUrl);
  const preview = safeSiteUrl(client.previewUrl);
  const hasUnsafe = Boolean(
    (client.productionUrl && !production) || (client.previewUrl && !preview),
  );
  return (
    <section
      className="admin-sheet__section"
      aria-labelledby="client-sites-title"
    >
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
      <p className="admin-sheet__notes">
        Site links stay independent of individual attempt outcomes. A later
        failed attempt does not demote an earlier published site.
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
      className="admin-sheet__section"
      aria-labelledby="client-attempts-title"
      data-client-attempts
    >
      <div className="admin-inspector__block-head">
        <h3 id="client-attempts-title">Attempt history</h3>
        <span className="admin-muted">
          {total} {total === 1 ? "attempt" : "attempts"}
        </span>
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

function ClientDetails({ client }: { client: ClientRecord }) {
  return (
    <>
      <section
        className="admin-sheet__section"
        aria-labelledby="client-identity-title"
      >
        <h3 id="client-identity-title">Client identity</h3>
        <dl className="admin-sheet__details">
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
        </dl>
      </section>

      <section
        className="admin-sheet__section"
        aria-labelledby="client-record-title"
      >
        <h3 id="client-record-title">Record details</h3>
        <dl className="admin-sheet__details">
          <div>
            <dt>Submitted</dt>
            <dd data-client-submitted>{formatTimestamp(client.submittedAt)}</dd>
          </div>
          <div>
            <dt>Inviting admin</dt>
            <dd>
              <ActorLabel actor={client.creator} />
            </dd>
          </div>
          <div>
            <dt>Issue</dt>
            <dd>{client.issueNumber}</dd>
          </div>
          <div>
            <dt>Client record</dt>
            <dd className="admin-mono">{client.clientId}</dd>
          </div>
          <div>
            <dt>Invitation</dt>
            <dd className="admin-mono">{client.inviteId || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Submission</dt>
            <dd className="admin-mono">
              {client.submissionId || "Not recorded"}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export function ClientDossier({
  client,
  loading,
  error,
  attempts,
  attemptsNextCursor,
  attemptsLoading,
  attemptsError,
  attemptTotal,
  headingRef,
  onClose,
  onRetry,
  onLoadMoreAttempts,
  onOpenAttempt,
}: ClientDossierProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);

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

  return (
    <dialog
      id="client-inspector"
      ref={dialogRef}
      className={`admin-sheet admin-client-sheet${open ? " is-open" : ""}`}
      data-inspector-surface="dialog"
      aria-modal="true"
      aria-labelledby="client-inspector-title"
      aria-busy={loading || attemptsLoading}
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
      <div className="admin-sheet__header">
        <div className="admin-sheet__header-copy">
          <div className="admin-sheet__kicker">Client dossier</div>
          <h2 id="client-inspector-title" ref={headingRef} tabIndex={-1}>
            {client ? (
              <>
                <span className="admin-visually-hidden">Client dossier: </span>
                {formatClientName(client)}
              </>
            ) : (
              "Client dossier"
            )}
          </h2>
          {client ? (
            <p className="admin-client-sheet__subhead">
              {[client.contactName, client.email].filter(Boolean).join(" · ") ||
                "Contact details not recorded"}
            </p>
          ) : null}
        </div>
        <button
          className="admin-icon-button"
          type="button"
          aria-label="Close client dossier"
          onClick={onClose}
        >
          <AdminIcon name="close" />
        </button>
      </div>

      <div className="admin-sheet__body">
        {loading ? (
          <p className="admin-muted" role="status">
            Loading client detail...
          </p>
        ) : null}

        {error ? (
          <div className="admin-error" role="alert">
            <p>{error}</p>
            <button type="button" className="admin-button" onClick={onRetry}>
              Retry client detail
            </button>
          </div>
        ) : null}

        {client ? (
          <>
            <ClientDetails client={client} />
            <SiteLinks client={client} />
            <ClientAttempts
              attempts={attempts}
              loading={attemptsLoading}
              error={attemptsError}
              nextCursor={attemptsNextCursor}
              total={attemptTotal}
              onOpenAttempt={onOpenAttempt}
              onLoadMore={onLoadMoreAttempts}
              onRetry={onRetry}
            />
          </>
        ) : null}
      </div>
    </dialog>
  );
}
