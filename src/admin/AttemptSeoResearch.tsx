import type { AttemptEventRecord } from "../lib/admin-contracts";
import { formatTimestamp } from "./format";
import { activityStageLabel } from "./generation-activity-format";

const CHECKS: Record<string, { label: string; purpose: string }> = {
  local_search_volume: {
    label: "Local search volume",
    purpose: "Estimates how often people search locally.",
  },
  search_intent: {
    label: "Search intent",
    purpose: "Identifies what searchers are trying to do.",
  },
  bulk_keyword_difficulty: {
    label: "Keyword difficulty",
    purpose: "Estimates how competitive terms are in search.",
  },
  serp: {
    label: "Search results",
    purpose: "Shows what already appears for the query.",
  },
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function parse(detail: string | null) {
  if (!detail || detail.length > 100_000) return null;
  try {
    const value = record(JSON.parse(detail));
    if (
      value &&
      (typeof value.mode === "string" ||
        typeof value.publishReady === "boolean" ||
        Array.isArray(value.stageCosts))
    )
      return value;
  } catch {
    // Legacy and truncated evidence stays available as original text.
  }
  return null;
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : "Not recorded";
const label = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? activityStageLabel(value.replace(/-/gu, "_"))
    : "Not recorded";
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const count = (value: unknown) =>
  number(value)?.toLocaleString("en-US") ?? "Not recorded";
const usd = (value: unknown) =>
  number(value)?.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }) ?? "Not recorded";

export function AttemptSeoResearch({
  events,
  loading,
  error,
  hasMore,
  onLoadMore,
}: {
  events: AttemptEventRecord[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const seo = events
    .filter((event) => event.stage === "seo_research")
    .sort((a, b) => b.createdAt - a.createdAt);
  const snapshots = seo.map((event) => ({
    event,
    detail: parse(event.detail),
  }));
  const latest = snapshots.find(({ detail }) => detail);
  const detail = latest?.detail;
  const ready = detail?.publishReady;
  const mode =
    detail?.mode === "context-only" ? "Context only" : label(detail?.mode);
  const checks: Array<Record<string, unknown> & { stage: string }> =
    Array.isArray(detail?.stageCosts)
      ? detail.stageCosts.slice(0, 50).flatMap((item) => {
          const check = record(item);
          return check && typeof check.stage === "string"
            ? [{ ...check, stage: check.stage }]
            : [];
        })
      : [];
  const amount =
    latest?.event.costKind === "unreported"
      ? "Not recorded"
      : usd(latest?.event.costUsd);

  return (
    <section
      className="admin-attempt-view admin-seo-view"
      aria-labelledby="attempt-seo-heading"
    >
      <header className="admin-view-heading">
        <p className="admin-view-kicker">Research evidence</p>
        <h3 id="attempt-seo-heading">SEO research</h3>
        <p>
          See which search checks ran and whether the evidence was sufficient
          for the SEO release gate.
        </p>
      </header>
      {detail ? (
        <>
          <div
            className="admin-seo-verdict"
            data-verdict={
              ready === true ? "ready" : ready === false ? "blocked" : "unknown"
            }
          >
            <span className="admin-view-kicker">Recorded research verdict</span>
            <h4>
              {ready === true
                ? "Measured research complete"
                : ready === false
                  ? "Measured research incomplete"
                  : "Readiness not recorded"}
            </h4>
            <p>
              {ready === true
                ? "This run reported sufficient measured evidence for SEO. Other publication checks still apply."
                : ready === false
                  ? "Use this evidence to review the preview. This research cannot clear the SEO release gate."
                  : "The record does not say whether this research clears the SEO release gate."}
            </p>
            <span className="admin-seo-mode">{mode}</span>
          </div>
          <dl className="admin-seo-metrics">
            <div>
              <dt>Provider tasks</dt>
              <dd>{count(detail.tasks)}</dd>
            </div>
            <div>
              <dt>Validated queries</dt>
              <dd>{count(detail.validatedQueries)}</dd>
            </div>
            <div>
              <dt>
                {latest?.event.costKind === "estimated"
                  ? "Estimated spend"
                  : "Recorded spend"}
              </dt>
              <dd>{amount}</dd>
            </div>
          </dl>
          {latest?.event.status === "recorded-incomplete" ||
          (number(detail.unreportedTasks) ?? 0) > 0 ? (
            <p className="admin-muted">
              Cost reporting was incomplete. Unreported provider tasks:{" "}
              {count(detail.unreportedTasks)}.
            </p>
          ) : null}
          {checks.length ? (
            <div className="admin-seo-checks">
              <table>
                <caption>Research checks</caption>
                <thead>
                  <tr>
                    <th scope="col">Check</th>
                    <th scope="col">Result</th>
                    <th scope="col">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check, index) => {
                    const info = Object.hasOwn(CHECKS, check.stage)
                      ? CHECKS[check.stage]
                      : null;
                    return (
                      <tr key={`${check.stage}:${index}`}>
                        <th scope="row">
                          {info?.label ?? label(check.stage)}
                          {typeof check.city === "string" && check.city ? (
                            <small>{check.city}</small>
                          ) : null}
                          {info ? <small>{info.purpose}</small> : null}
                        </th>
                        <td>
                          {label(check.status)}
                          <small>Tasks: {count(check.tasks)}</small>
                        </td>
                        <td>{usd(check.usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-muted">
              No individual research checks were retained in this record.
            </p>
          )}
          {detail.queryPlannerStatus || detail.fallbackStatus ? (
            <details className="admin-panel-disclosure">
              <summary>Query planning and fallback</summary>
              <dl className="admin-detail-grid admin-seo-extras">
                <div>
                  <dt>Planner status</dt>
                  <dd>{label(detail.queryPlannerStatus)}</dd>
                </div>
                <div>
                  <dt>Planner model</dt>
                  <dd>{text(detail.queryPlannerModel)}</dd>
                </div>
                <div>
                  <dt>Accepted phrases</dt>
                  <dd>{count(detail.queryPlannerAcceptedPhrases)}</dd>
                </div>
                <div>
                  <dt>Fallback search</dt>
                  <dd>{label(detail.fallbackStatus)}</dd>
                </div>
              </dl>
            </details>
          ) : null}
          <p className="admin-muted">
            This record retains counts and check outcomes, not individual
            keywords, rankings, or traffic forecasts.
          </p>
        </>
      ) : (
        <p className="admin-view-empty" role="status">
          {loading
            ? "Loading research evidence…"
            : seo.length
              ? "This run recorded SEO activity, but no structured research summary is available."
              : "No SEO research evidence is recorded in the loaded events."}
        </p>
      )}
      {seo.length ? (
        <details className="admin-panel-disclosure admin-source-disclosure">
          <summary>Recorded source</summary>
          {seo.map((event) => (
            <div key={event.eventKey} className="admin-seo-source">
              <p className="admin-muted">
                {label(event.status)} · {formatTimestamp(event.createdAt)}
              </p>
              {event.detail ? (
                <pre className="admin-detail-code">{event.detail}</pre>
              ) : (
                <p className="admin-muted">No event detail.</p>
              )}
            </div>
          ))}
        </details>
      ) : null}
      {error ? (
        <p role="alert" className="admin-inline-error">
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <button
          className="admin-button admin-button--quiet"
          type="button"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? "Loading events…" : "Load earlier stage events"}
        </button>
      ) : null}
    </section>
  );
}
