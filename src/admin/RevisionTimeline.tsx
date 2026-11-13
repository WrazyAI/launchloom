import { useEffect, useState } from "react";
import type { RevisionSummary } from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import { formatTimestamp } from "./format";

/**
 * Read-only view of developer and client feedback revisions for one client
 * repository. The coordinator owns the status; this panel never writes.
 */
export function RevisionTimeline({
  api,
  repository,
}: {
  api: AdminApi;
  repository: string | null;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRevisions(null);
    setError(null);
    if (!repository) return;
    const controller = new AbortController();
    api
      .listRevisions(repository, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setRevisions(items);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Revision timeline unavailable.",
          );
      });
    return () => controller.abort();
  }, [api, repository]);

  if (!repository) return null;
  return (
    <section
      className="admin-panel"
      aria-labelledby="revision-timeline-title"
      data-revision-timeline
    >
      <div className="admin-panel__head">
        <div>
          <p className="admin-eyebrow">Review loop</p>
          <h3 id="revision-timeline-title">Feedback and revisions</h3>
        </div>
      </div>
      {error ? (
        <p className="admin-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {revisions === null ? (
        <p className="admin-muted">Loading revision history…</p>
      ) : revisions.length === 0 ? (
        <p className="admin-muted">
          No developer or client feedback revisions yet.
        </p>
      ) : (
        <ol className="admin-revision-list">
          {revisions.map((revision) => (
            <li
              key={revision.requestId}
              data-revision-stage={revision.stage}
              data-revision-status={revision.status}
            >
              <div className="admin-revision-list__head">
                <strong>
                  {revision.stage === "developer"
                    ? "Developer feedback"
                    : "Client feedback"}
                </strong>
                <span className="admin-activity__status">
                  {revision.status.replace(/_/gu, " ")}
                </span>
                <time dateTime={new Date(revision.createdAt).toISOString()}>
                  {formatTimestamp(revision.createdAt)}
                </time>
              </div>
              <p>{revision.feedback}</p>
              <p className="admin-muted">
                {revision.reviewedPage || "Page not recorded"}
                {revision.pr ? ` · PR #${revision.pr}` : ""}
                {revision.completedAt
                  ? ` · completed ${formatTimestamp(revision.completedAt)}`
                  : ""}
              </p>
              {revision.failure ? (
                <p className="admin-inline-error">{revision.failure}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
