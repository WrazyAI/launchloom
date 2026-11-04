import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GenerationActivityCoverageEntry,
  StoredTraceEvent,
  TraceIdentity,
  TraceText,
  TraceUsage,
} from "../lib/generation-activity";
import type { AdminApi } from "./api";
import {
  activityStages,
  filterActivity,
  formatClock,
  formatCount,
  formatUsage,
  groupActivity,
  heartbeatNotice,
  isOpenEntry,
  recordingLabel,
  type ActivityEntry,
  type ActivityFilter,
} from "./generation-activity-format";
import { formatRelativeTime } from "./format";
import { useGenerationActivity } from "./useGenerationActivity";

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "actions", label: "Actions" },
  { value: "model", label: "Model" },
  { value: "issues", label: "Issues" },
];

const GLYPHS: Record<string, string> = {
  model: "◆",
  action: "▸",
  task: "•",
  error: "!",
  coverage: "◎",
  retry: "↻",
  output: "“",
  finished: "■",
};

function text(value: TraceText | null): string {
  if (!value) return "";
  return value.kind === "text" ? value.text : `Withheld (${value.reason})`;
}

function coverageSummary(entries: GenerationActivityCoverageEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries)
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  const parts = ["instrumented", "limited", "unsupported", "not_applicable"]
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${status.replace(/_/gu, " ")}`);
  return `Coverage: ${parts.join(", ") || "not reported"}`;
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    ["completed", "succeeded", "complete"].includes(status)
      ? "done"
      : ["error", "failed", "incomplete", "transport", "cancelled"].includes(
            status,
          )
        ? "bad"
        : "live";
  return (
    <span className={`admin-activity__status admin-activity__status--${tone}`}>
      {status.replace(/_/gu, " ")}
    </span>
  );
}

function UsageGrid({ usage }: { usage: TraceUsage }) {
  const rows: Array<[string, string]> = [
    ["Input tokens", formatCount(usage.inputTokens)],
    ["Output tokens", formatCount(usage.outputTokens)],
    ["Cached input", formatCount(usage.cachedInputTokens)],
    ["Cache write", formatCount(usage.cacheWriteTokens)],
    ["Reasoning", formatCount(usage.reasoningTokens)],
    [
      "Cost",
      usage.costKind === "unreported"
        ? "Unreported"
        : `${usage.costUsd} ${usage.costKind}`,
    ],
  ];
  return (
    <dl className="admin-activity__facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Evidence({ event }: { event: StoredTraceEvent }) {
  const meta = (
    <dl className="admin-activity__facts">
      <div>
        <dt>Stage</dt>
        <dd>{event.context.stage}</dd>
      </div>
      <div>
        <dt>Actor</dt>
        <dd>
          {event.context.actor.kind} · {event.context.actor.role}
        </dd>
      </div>
      <div>
        <dt>Emitted</dt>
        <dd>
          {formatClock(Date.parse(event.emittedAt))} · received{" "}
          {formatClock(event.receivedAt)}
        </dd>
      </div>
      {event.context.candidateId ? (
        <div>
          <dt>Candidate</dt>
          <dd>{event.context.candidateId}</dd>
        </div>
      ) : null}
    </dl>
  );
  switch (event.kind) {
    case "model_started":
      return (
        <>
          <h4>Model request</h4>
          <dl className="admin-activity__facts">
            <div>
              <dt>Provider</dt>
              <dd>{event.payload.provider}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{event.payload.model}</dd>
            </div>
            <div>
              <dt>Call</dt>
              <dd className="admin-activity__mono">{event.payload.callId}</dd>
            </div>
          </dl>
          <p className="admin-activity__note">
            Waiting for the provider response. The current transport is not
            streaming, so output appears when the response completes.
          </p>
          {meta}
        </>
      );
    case "model_finished":
      return (
        <>
          <h4>Response finished</h4>
          <p>{event.payload.status.replace(/_/gu, " ")}</p>
          {meta}
        </>
      );
    case "output":
      return (
        <>
          <h4>Visible output</h4>
          <pre className="admin-activity__text">
            {text(event.payload.message)}
          </pre>
          <p className="admin-activity__note">
            Emitted model text, not private reasoning. Credentials and unapproved
            links are removed before storage.
          </p>
          {meta}
        </>
      );
    case "usage":
      return (
        <>
          <h4>Reported usage</h4>
          <UsageGrid usage={event.payload.usage} />
          <p className="admin-activity__note">
            Response-level provider totals. Unknown stays unknown; nothing is
            attributed per tool.
          </p>
          {meta}
        </>
      );
    case "action_started":
    case "action_finished": {
      const fields =
        event.kind === "action_started" ? event.payload.input : event.payload.result;
      return (
        <>
          <h4>{event.payload.name.replace(/_/gu, " ")}</h4>
          {event.kind === "action_finished" ? (
            <p>
              {event.payload.status}
              {event.payload.durationMs !== null
                ? ` after ${event.payload.durationMs} ms`
                : ""}
            </p>
          ) : (
            <p>Running. A started action does not prove it succeeded.</p>
          )}
          <dl className="admin-activity__facts">
            {Object.entries(fields).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value === null ? "Not recorded" : String(value)}</dd>
              </div>
            ))}
          </dl>
          {meta}
        </>
      );
    }
    case "error":
      return (
        <>
          <h4>Error</h4>
          <p>
            <strong>{event.payload.code}</strong> · {event.payload.scope}
          </p>
          <pre className="admin-activity__text">
            {text(event.payload.message)}
          </pre>
          {meta}
        </>
      );
    case "coverage":
      return (
        <>
          <h4>Coverage</h4>
          <p>
            <strong>{event.payload.boundary}</strong> ·{" "}
            {event.payload.status.replace(/_/gu, " ")}
          </p>
          {event.payload.detail ? (
            <p className="admin-activity__note">
              {text(event.payload.detail)}
            </p>
          ) : null}
          {meta}
        </>
      );
    case "retry":
      return (
        <>
          <h4>Retry</h4>
          <p>
            {event.payload.scope} attempt {event.payload.attempt} of{" "}
            {event.payload.maxAttempts}
          </p>
          <p className="admin-activity__note">{event.payload.reason}</p>
          {meta}
        </>
      );
    case "task_started":
    case "task_finished":
      return (
        <>
          <h4>{event.payload.label}</h4>
          {event.kind === "task_finished" ? (
            <p>{event.payload.status}</p>
          ) : (
            <p>Started.</p>
          )}
          {event.payload.detail ? (
            <p className="admin-activity__note">
              {text(event.payload.detail)}
            </p>
          ) : null}
          {meta}
        </>
      );
    case "producer_finished":
      return (
        <>
          <h4>Recording finished</h4>
          <p>{event.payload.status}</p>
          {event.payload.detail ? (
            <p className="admin-activity__note">
              {text(event.payload.detail)}
            </p>
          ) : null}
          {meta}
        </>
      );
    default:
      return (
        <>
          <h4>{event.kind.replace(/_/gu, " ")}</h4>
          {meta}
        </>
      );
  }
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: ActivityEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const open = isOpenEntry(entry);
  const subtitle =
    entry.kind === "model"
      ? `${entry.role.replace(/_/gu, " ")} · model call`
      : entry.kind === "action"
        ? `${entry.role.replace(/_/gu, " ")} · pipeline action`
        : `${entry.role.replace(/_/gu, " ")} · ${entry.stage.replace(/_/gu, " ")}`;
  return (
    <li
      className={`admin-activity__entry${
        selected ? " admin-activity__entry--selected" : ""
      }${open ? " admin-activity__entry--open" : ""}`}
      data-kind={entry.kind}
    >
      <button
        type="button"
        className="admin-activity__row"
        aria-pressed={selected}
        onClick={() => onSelect(entry.primary.eventId)}
      >
        <time className="admin-activity__clock" dateTime={new Date(entry.at).toISOString()}>
          {formatClock(entry.at)}
        </time>
        <span className="admin-activity__glyph" aria-hidden="true">
          {GLYPHS[entry.kind] ?? "•"}
        </span>
        <span className="admin-activity__copy">
          <span className="admin-activity__title">{entry.title}</span>
          <span className="admin-activity__sub">{subtitle}</span>
        </span>
        {open ? (
          <span className="admin-activity__status admin-activity__status--live">
            running
          </span>
        ) : (
          <StatusPill status={entry.status} />
        )}
      </button>
    </li>
  );
}

export function GenerationActivity({
  api,
  identity,
  active,
  enabled,
}: {
  api: AdminApi;
  identity: TraceIdentity;
  active: boolean;
  enabled: boolean;
}) {
  const activityIdentity = useMemo(
    () => ({ namespace: identity.namespace, attemptId: identity.attemptId }),
    [identity.namespace, identity.attemptId],
  );
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const follow = useRef(true);
  const feedRef = useRef<HTMLOListElement | null>(null);
  const {
    page,
    events,
    connection,
    error,
    hasOlder,
    loadingOlder,
    loadOlder,
    refresh,
  } = useGenerationActivity({
    api,
    identity: activityIdentity,
    active,
    enabled,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const entries = useMemo(() => groupActivity(events), [events]);
  const visible = useMemo(
    () => filterActivity(entries, filter),
    [entries, filter],
  );
  const stages = useMemo(
    () => activityStages(entries, active),
    [entries, active],
  );
  const recording = page ? recordingLabel(page.recording, active) : null;
  const notice = page ? heartbeatNotice(page, now) : null;
  const usage = page ? formatUsage(page.usage) : null;
  const selected = selectedKey
    ? (entries.find((entry) => entry.key === selectedKey) ?? null)
    : null;

  useEffect(() => {
    if (!follow.current) return;
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }, [visible.length]);

  function select(key: string) {
    setSelectedKey(key);
    follow.current = false;
  }

  if (!enabled) return null;

  function jumpToLatest() {
    follow.current = true;
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  const emptyMessage = !page
    ? "Waiting for activity..."
    : page.recording === "not_recorded"
      ? "Detailed activity was not recorded for this run."
      : page.recording === "expired"
        ? "Detailed activity expired after the retention window."
        : page.recording === "disabled"
          ? "Detailed activity is not enabled."
          : active
            ? "Waiting for the first activity event..."
            : "The run ended without further activity events.";

  return (
    <section
      className="admin-activity"
      aria-labelledby="generation-activity-title"
      data-activity-connection={connection}
    >
      <header className="admin-activity__head">
        <div>
          <h3 id="generation-activity-title">Live activity</h3>
          <p className="admin-activity__meta">
            {page
              ? `Updated ${formatRelativeTime(page.observedAt, now)} · times in UTC`
              : "No activity snapshot yet"}
          </p>
        </div>
        <div className="admin-activity__pills">
          {connection === "disconnected" ? (
            <span className="admin-activity__status admin-activity__status--bad">
              Connection lost
            </span>
          ) : null}
          {recording ? (
            <span
              className={`admin-activity__status admin-activity__status--${
                recording.tone === "live"
                  ? "live"
                  : recording.tone === "warning"
                    ? "warn"
                    : recording.tone === "error"
                      ? "bad"
                      : "muted"
              }`}
            >
              {recording.label}
            </span>
          ) : null}
        </div>
      </header>

      {!enabled ? (
        <p className="admin-activity__empty">
          Detailed activity is not enabled in this environment.
        </p>
      ) : (
        <>
          {usage ? (
            <div className="admin-activity__summary">
              <span>{usage.responses}</span>
              <span>{usage.tokens}</span>
              <span>{usage.cost}</span>
            </div>
          ) : null}

          {notice ? (
            <p className="admin-activity__warning" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <div className="admin-activity__error" role="alert">
              <span>{error}</span>
              <button type="button" className="admin-link-button" onClick={refresh}>
                Retry
              </button>
            </div>
          ) : null}

          {stages.length ? (
            <ol className="admin-activity__stages" aria-label="Activity stages">
              {stages.map((stage) => (
                <li
                  key={stage.stage}
                  className={`admin-activity__stage admin-activity__stage--${stage.state}`}
                >
                  <span>{stage.label}</span>
                  <small>{stage.entries}</small>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="admin-activity__toolbar">
            <div className="admin-activity__filters" role="group" aria-label="Activity filters">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" className="admin-link-button" onClick={jumpToLatest}>
              Jump to latest
            </button>
          </div>

          <div className="admin-activity__layout">
            <ol
              ref={feedRef}
              className="admin-activity__feed"
              aria-label="Generation events"
              onScroll={(event) => {
                const element = event.currentTarget;
                follow.current =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 24;
              }}
            >
              {visible.length ? (
                visible.map((entry) => (
                  <EntryRow
                    key={entry.key}
                    entry={entry}
                    selected={selectedKey === entry.key}
                    onSelect={select}
                  />
                ))
              ) : (
                <li className="admin-activity__empty">{emptyMessage}</li>
              )}
            </ol>
            <aside className="admin-activity__evidence" aria-label="Selected evidence">
              {selected ? (
                <>
                  {selected.evidence.map((event, index) => (
                    <div
                      key={event.eventId}
                      className={
                        index === 0
                          ? "admin-activity__evidence-block"
                          : "admin-activity__evidence-block admin-activity__evidence-block--stack"
                      }
                    >
                      <Evidence event={event} />
                    </div>
                  ))}
                  <p className="admin-activity__note">
                    Only observable actions and emitted output are retained.
                    Private reasoning is never recorded.
                  </p>
                </>
              ) : (
                <p className="admin-activity__empty">
                  Select a model call or action to inspect its evidence.
                </p>
              )}
            </aside>
          </div>

          <footer className="admin-activity__foot">
            <div className="admin-activity__foot-left">
              {hasOlder ? (
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? "Loading earlier activity..." : "Load earlier activity"}
                </button>
              ) : null}
            </div>
            {page && page.coverage.length ? (
              <details className="admin-activity__coverage">
                <summary>{coverageSummary(page.coverage)}</summary>
                <ul>
                  {page.coverage.map((entry) => (
                    <li key={entry.boundary}>
                      <span>{entry.boundary}</span>
                      <span>{entry.status.replace(/_/gu, " ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <span>
              {events.length} events
              {page ? ` · retained ${page.retentionDays} days` : ""}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
