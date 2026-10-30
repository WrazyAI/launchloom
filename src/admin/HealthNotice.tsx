import type { Health } from "../lib/admin-contracts";
import { formatDate, formatTimestamp } from "./format";

/**
 * Explains real tracking gaps without turning unknown historical coverage into a
 * permanent alarm. Reconciliation time and the latest received attempt are
 * deliberately separate facts.
 */
export function HealthNotice({
  health,
  error,
  subject,
}: {
  health: Health | null;
  error: string | null;
  subject: string;
}) {
  if (error)
    return (
      <div className="admin-notice admin-notice--error" role="alert">
        {subject} health could not be loaded. Counts may be incomplete.
      </div>
    );
  if (!health) return null;

  const backlog = health.pendingProjectionCount;
  const acceptance = health.acceptanceAttentionCount ?? 0;
  const realIssue = backlog > 0 || acceptance > 0 || Boolean(health.lastError);
  const coverageUnknown = health.coverageStart === null;
  if (!realIssue && !coverageUnknown) return null;

  const facts = (
    <p className="admin-data-health__facts">
      Latest attempt received {formatTimestamp(health.latestAttemptAt)}. Last
      reconciled {formatTimestamp(health.lastSyncAt)}.
    </p>
  );

  if (!realIssue) {
    return (
      <details className="admin-data-health" data-health-state="coverage">
        <summary>
          {subject}: history before tracking began is not reconciled
        </summary>
        {facts}
      </details>
    );
  }

  return (
    <div
      className="admin-notice admin-notice--attention"
      role="status"
      data-health-state="attention"
    >
      <strong>{subject} may be incomplete</strong>
      {backlog > 0 ? (
        <span>
          {backlog} {backlog === 1 ? "record is" : "records are"} waiting to
          project into the shared ledger.
        </span>
      ) : null}
      {acceptance > 0 ? (
        <span>
          {acceptance} intake{" "}
          {acceptance === 1 ? "acceptance needs" : "acceptances need"} recovery
          review.
        </span>
      ) : null}
      {health.lastError ? <span>{health.lastError}</span> : null}
      {coverageUnknown ? (
        <span>History before tracking began is not reconciled.</span>
      ) : (
        <span>History coverage starts {formatDate(health.coverageStart)}.</span>
      )}
      {facts}
    </div>
  );
}
