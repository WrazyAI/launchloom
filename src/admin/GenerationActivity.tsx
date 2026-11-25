import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GenerationActivityCoverageEntry,
  StoredTraceEvent,
  TraceIdentity,
  TraceText,
  TraceUsage,
} from "../lib/generation-activity";
import type { AdminApi } from "./api";
import {
  actionChipText,
  activityModelOutput,
  activityProgress,
  activityRoleLabel,
  activityStageLabel,
  activityStages,
  filterActivity,
  formatClock,
  formatCount,
  formatUsage,
  groupActivity,
  heartbeatNotice,
  isOpenEntry,
  modelDurationSeconds,
  modelReasoningCount,
  parseModelOutputPreview,
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

function SparkleIcon({ active = false }: { active?: boolean }) {
  return (
    <svg
      className="admin-chat__sparkle"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      data-active={active ? "true" : undefined}
      aria-hidden="true"
    >
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="admin-chat__chevron"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-open={open ? "true" : undefined}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ToolKindIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  return (
    <svg
      className="admin-chat__tool-ico"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "action" ? (
        <path d="M4 17l6-5-6-5M12 19h8" />
      ) : kind === "error" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5M12 16h.01" />
        </>
      ) : kind === "retry" ? (
        <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
      ) : kind === "finished" ? (
        <path d="M20 6L9 17l-5-5" />
      ) : kind === "coverage" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </>
      )}
    </svg>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = ["completed", "succeeded", "complete"].includes(status)
    ? "done"
    : ["error", "failed", "incomplete", "transport", "cancelled"].includes(
          status,
        )
      ? "bad"
      : status === "Unconfirmed"
        ? "warn"
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

function Evidence({
  event,
  formatOutput = false,
}: {
  event: StoredTraceEvent;
  formatOutput?: boolean;
}) {
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
            Live progress is an estimate while the provider streams. The
            completed output and reported usage remain authoritative.
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
    case "output_delta":
      return (
        <>
          <h4>Streamed progress</h4>
          <dl className="admin-activity__facts">
            <div>
              <dt>Estimated output</dt>
              <dd>
                ~{Math.ceil(event.payload.visibleChars / 4)} tokens (
                {event.payload.visibleChars} characters)
              </dd>
            </div>
            <div>
              <dt>Reasoning deltas</dt>
              <dd>{event.payload.reasoningTokens}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{(event.payload.elapsedMs / 1000).toFixed(1)} s</dd>
            </div>
          </dl>
          <p className="admin-activity__note">
            Estimated while streaming. The completed output and reported usage
            are authoritative.
          </p>
          {meta}
        </>
      );
    case "output":
      return (
        <>
          <h4>Visible output</h4>
          {formatOutput ? (
            <ChatModelOutput rawText={text(event.payload.message)} />
          ) : (
            <pre className="admin-activity__text">{text(event.payload.message)}</pre>
          )}
          <p className="admin-activity__note">
            Emitted model text, not private reasoning. Credentials and
            unapproved links are removed before storage.
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
        event.kind === "action_started"
          ? event.payload.input
          : event.payload.result;
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
            <p className="admin-activity__note">{text(event.payload.detail)}</p>
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
            <p className="admin-activity__note">{text(event.payload.detail)}</p>
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
            <p className="admin-activity__note">{text(event.payload.detail)}</p>
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

function ModelThinkingTrace({
  entry,
  open,
  active,
  expanded,
  onToggle,
}: {
  entry: ActivityEntry;
  open: boolean;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isLive = open && active;
  const started = entry.evidence.find(
    (event) => event.kind === "model_started",
  );
  const finished = entry.evidence.findLast(
    (event) => event.kind === "model_finished",
  );
  const usageEvent = entry.evidence.findLast((event) => event.kind === "usage");
  const progress = activityProgress(entry);
  const duration = modelDurationSeconds(entry);
  const reasoning = modelReasoningCount(entry);

  let label = "Reasoning & execution trace";
  if (isLive) {
    label = progress?.reasoningTokens
      ? `Thinking (${formatCount(progress.reasoningTokens)} reasoning deltas)`
      : "Thinking";
  } else if (duration !== null && reasoning) {
    label = `Thought for ${duration}s (${formatCount(reasoning.tokens)} reasoning ${reasoning.kind === "reported" ? "tokens" : "deltas"})`;
  } else if (duration !== null) {
    label = `Thought for ${duration}s`;
  } else if (reasoning) {
    label = `Thought (${formatCount(reasoning.tokens)} reasoning ${reasoning.kind === "reported" ? "tokens" : "deltas"})`;
  }

  const steps: Array<{ label: string; meta?: string; spinning?: boolean }> = [];
  if (started && started.kind === "model_started") {
    steps.push({
      label: `Dispatched to ${started.payload.provider}`,
      meta: started.payload.model,
    });
  } else {
    steps.push({
      label: "Earlier request event not loaded on this page",
      meta: activityStageLabel(entry.stage),
    });
  }
  if (progress) {
    steps.push({
      label: isLive
        ? `Streaming ~${formatCount(Math.ceil(progress.visibleChars / 4))} estimated tokens`
        : `Streamed ~${formatCount(Math.ceil(progress.visibleChars / 4))} estimated tokens`,
      meta: `${progress.reasoningTokens} reasoning deltas`,
      spinning: isLive,
    });
  } else if (isLive) {
    steps.push({
      label: "Waiting for streamed output deltas",
      spinning: true,
    });
  }
  if (usageEvent && usageEvent.kind === "usage") {
    const u = usageEvent.payload.usage;
    steps.push({
      label: "Provider reported usage",
      meta: `${formatCount(u.inputTokens)} in / ${formatCount(u.outputTokens)} out${u.cachedInputTokens ? ` (${formatCount(u.cachedInputTokens)} cached)` : ""}`,
    });
  }
  if (finished && finished.kind === "model_finished") {
    steps.push({
      label: `Response ${finished.payload.status.replace(/_/gu, " ")}`,
      meta: formatClock(Date.parse(finished.emittedAt)),
    });
  }

  return (
    <div className="admin-chat__thinking">
      <button
        type="button"
        className="admin-chat__thinking-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <SparkleIcon active={isLive} />
        <span
          className={
            isLive
              ? "admin-chat__thinking-label admin-chat__thinking-label--shimmer"
              : "admin-chat__thinking-label"
          }
        >
          {label}
        </span>
        <ChevronIcon open={expanded} />
      </button>
      <div
        className={`admin-chat__collapse${expanded ? " is-open" : ""}`}
        aria-hidden={!expanded}
      >
        <div>
          <div className="admin-chat__thinking-body">
            {steps.map((step, index) => (
              <div className="admin-chat__thinking-step" key={index}>
                {step.spinning ? (
                  <span className="admin-chat__spinner" aria-hidden="true" />
                ) : (
                  <svg
                    className="admin-chat__check"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                <span className="admin-chat__thinking-text">{step.label}</span>
                {step.meta ? (
                  <span className="admin-chat__thinking-meta">{step.meta}</span>
                ) : null}
              </div>
            ))}
            <p className="admin-chat__thinking-note">
              Private chain-of-thought text is withheld by policy. Recorded
              request timing, reasoning counts, and stream progress are shown.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatModelOutput({ rawText }: { rawText: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const parsed = useMemo(() => parseModelOutputPreview(rawText), [rawText]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  if (!rawText) return null;

  if (parsed.kind === "prose") {
    return (
      <p className="admin-activity__excerpt admin-chat__prose">
        {parsed.text.length > 520
          ? `${parsed.text.slice(0, 520)}…`
          : parsed.text}
      </p>
    );
  }

  const rawPayload = parsed.raw;

  function copyPayload() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(rawPayload)
      .then(() => {
        setCopied(true);
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => {
          setCopied(false);
          copyTimer.current = null;
        }, 1500);
      })
      .catch(() => {});
  }

  return (
    <div className="admin-chat__structured">
      {parsed.stageTag || parsed.summary ? (
        <div className="admin-chat__structured-head">
          {parsed.stageTag ? (
            <span className="admin-chat__stage-chip">{parsed.stageTag}</span>
          ) : null}
          {parsed.summary ? (
            <p className="admin-activity__excerpt admin-chat__prose">
              {parsed.summary.length > 420
                ? `${parsed.summary.slice(0, 420)}…`
                : parsed.summary}
            </p>
          ) : null}
        </div>
      ) : null}
      <details className="admin-chat__code-disclosure">
        <summary>
          <span>
            {parsed.truncated
              ? "View recorded output payload (truncated)"
              : "View recorded output payload"}
          </span>
          {parsed.keys.length ? (
            <span className="admin-chat__code-keys">
              {parsed.keys.slice(0, 4).join(", ")}
              {parsed.keys.length > 4 ? ` +${parsed.keys.length - 4}` : ""}
            </span>
          ) : null}
        </summary>
        <div className="admin-chat__codeblock">
          <div className="admin-chat__codeblock-bar">
            <span className="admin-activity__mono">recorded-output.json</span>
            <button
              type="button"
              className="admin-chat__copy-btn"
              onClick={copyPayload}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="admin-chat__codeblock-pre">{parsed.formatted}</pre>
        </div>
      </details>
    </div>
  );
}

function atScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 28;
}

function hasPausedPreview(scroller: HTMLElement) {
  return scroller.querySelector("pre[data-preview-paused]") !== null;
}

function LiveModelOutput({
  text,
  streaming,
  follow,
  onScroll,
}: {
  text: string;
  streaming: boolean;
  follow: { current: boolean };
  onScroll: () => void;
}) {
  const previewRef = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (preview && streaming && follow.current && !preview.hasAttribute("data-preview-paused")) {
      preview.scrollTop = preview.scrollHeight;
    }
  }, [text, streaming, follow]);

  return (
    <div className="admin-chat__codeblock admin-chat__codeblock--live">
      <div className="admin-chat__codeblock-bar">
        <span className="admin-activity__mono">Visible output</span>
        <span className={streaming ? "admin-activity__status--live" : undefined}>
          {streaming ? "Streaming" : "Partial output"}
        </span>
      </div>
      <pre
        ref={previewRef}
        className="admin-chat__codeblock-pre"
        tabIndex={0}
        aria-label="Visible model output"
        onScroll={({ currentTarget }) => {
          currentTarget.toggleAttribute("data-preview-paused", !atScrollBottom(currentTarget));
          onScroll();
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function ThreadedEntry({
  entry,
  selected,
  thinkingOpen,
  onSelect,
  onToggleThinking,
  active,
  follow,
  onPreviewScroll,
}: {
  entry: ActivityEntry;
  selected: boolean;
  thinkingOpen: boolean;
  onSelect: (id: string) => void;
  onToggleThinking: (key: string) => void;
  active: boolean;
  follow: { current: boolean };
  onPreviewScroll: () => void;
}) {
  const open = isOpenEntry(entry);
  const progress = entry.kind === "model" ? activityProgress(entry) : null;
  const usage = entry.evidence.findLast((event) => event.kind === "usage");
  const output = entry.kind === "model" ? activityModelOutput(entry) : null;
  const latestProgress = entry.evidence.findLast(
    (event) => event.kind === "output_delta",
  );
  const visibleEvidence =
    entry.kind === "model"
      ? entry.evidence.filter(
          (event) =>
            event.kind === "output" ||
            event.kind === "usage" ||
            (event === latestProgress && !usage),
        )
      : entry.evidence;
  const modelName =
    entry.primary.kind === "model_started" ? entry.primary.payload.model : null;
  const { candidateId, repairPass } = entry.primary.context;
  const chip = entry.kind === "model" ? null : actionChipText(entry);

  const statusBadge =
    open && active ? (
      <span className="admin-activity__status admin-activity__status--live">
        running
      </span>
    ) : (
      <StatusPill status={open ? "Unconfirmed" : entry.status} />
    );

  // Model turns render as full thread-native chat messages with collapsible thinking traces.
  if (entry.kind === "model") {
    return (
      <li
        className={`admin-activity__entry admin-chat__turn${
          selected ? " admin-activity__entry--selected" : ""
        }${open ? " admin-activity__entry--open" : ""}`}
        data-kind={entry.kind}
      >
        <div className="admin-chat__turn-head">
          <button
            type="button"
            className="admin-activity__row admin-chat__turn-trigger"
            aria-expanded={selected}
            onClick={() => onSelect(entry.key)}
          >
            <span className="admin-chat__avatar" aria-hidden="true">
              L
            </span>
            <span className="admin-activity__copy">
              <span className="admin-chat__turn-topline">
                <span className="admin-activity__title">{entry.title}</span>
                <span className="admin-chat__role-pill">
                  {activityRoleLabel(entry.role)}
                </span>
                {modelName ? (
                  <span className="admin-chat__model-pill">{modelName}</span>
                ) : null}
              </span>
              <span className="admin-activity__sub">
                {activityStageLabel(entry.stage)}
                {candidateId ? ` · ${candidateId}` : ""}
                {repairPass === null ? "" : ` · Round ${repairPass}`}
              </span>
              {usage ? (
                <span className="admin-activity__tokens">
                  {formatCount(usage.payload.usage.inputTokens)} in ·{" "}
                  {formatCount(usage.payload.usage.outputTokens)} out · reported
                </span>
              ) : progress && open && active ? (
                <span className="admin-activity__sub">
                  ~{Math.ceil(progress.visibleChars / 4)} output tokens
                  estimated while streaming · {progress.reasoningTokens}{" "}
                  reasoning deltas
                </span>
              ) : null}
            </span>
            <span className="admin-chat__turn-right">
              <time
                className="admin-activity__clock"
                dateTime={new Date(entry.at).toISOString()}
              >
                {formatClock(entry.at)}
              </time>
              {statusBadge}
            </span>
          </button>
        </div>

        <div className="admin-chat__turn-body">
          <ModelThinkingTrace
            entry={entry}
            open={open}
            active={active}
            expanded={thinkingOpen}
            onToggle={() => onToggleThinking(entry.key)}
          />

          {output?.kind === "preview" ? (
            <LiveModelOutput
              text={output.text}
              streaming={open && active}
              follow={follow}
              onScroll={onPreviewScroll}
            />
          ) : output?.kind === "recorded" && !selected ? (
            <ChatModelOutput rawText={output.text} />
          ) : null}

          {selected ? (
            <div
              className="admin-activity__evidence"
              aria-label="Recorded evidence"
            >
              {visibleEvidence.map((event) => (
                <div
                  className="admin-activity__evidence-block"
                  key={event.eventId}
                >
                  <Evidence event={event} formatOutput />
                </div>
              ))}
              {entry.evidence.some(
                (event) =>
                  event.kind === "model_started" ||
                  event.kind === "model_finished",
              ) ? (
                <details className="admin-activity__request-details">
                  <summary>Request and completion details</summary>
                  {entry.evidence
                    .filter(
                      (event) =>
                        event.kind === "model_started" ||
                        event.kind === "model_finished",
                    )
                    .map((event) => (
                      <div
                        className="admin-activity__evidence-block"
                        key={event.eventId}
                      >
                        <Evidence event={event} />
                      </div>
                    ))}
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  // Non-model pipeline actions, tasks, errors, retries render as compact interactive Tool Chip rows.
  return (
    <li
      className={`admin-activity__entry admin-chat__tool-entry${
        selected ? " admin-activity__entry--selected" : ""
      }${open ? " admin-activity__entry--open" : ""}`}
      data-kind={entry.kind}
    >
      <button
        type="button"
        className="admin-activity__row admin-chat__tool-row"
        aria-expanded={selected}
        onClick={() => onSelect(entry.key)}
      >
        <span className="admin-chat__tool-icon-wrap" aria-hidden="true">
          <ToolKindIcon kind={entry.kind} />
          <ChevronIcon open={selected} />
        </span>
        <span className="admin-activity__copy admin-chat__tool-copy">
          <span className="admin-activity__title">{entry.title}</span>
          {chip ? (
            <span className="admin-chat__chip">{chip}</span>
          ) : (
            <span className="admin-activity__sub">
              {activityRoleLabel(entry.role)}
            </span>
          )}
        </span>
        <span className="admin-chat__tool-right">
          <time
            className="admin-activity__clock"
            dateTime={new Date(entry.at).toISOString()}
          >
            {formatClock(entry.at)}
          </time>
          {statusBadge}
        </span>
      </button>

      {selected ? (
        <div
          className="admin-activity__evidence admin-chat__tool-evidence"
          aria-label="Recorded evidence"
        >
          {visibleEvidence.map((event) => (
            <div className="admin-activity__evidence-block" key={event.eventId}>
              <Evidence event={event} />
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
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
  const progress = entry.kind === "model" ? activityProgress(entry) : null;
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
        <time
          className="admin-activity__clock"
          dateTime={new Date(entry.at).toISOString()}
        >
          {formatClock(entry.at)}
        </time>
        <span className="admin-activity__glyph" aria-hidden="true">
          {GLYPHS[entry.kind] ?? "•"}
        </span>
        <span className="admin-activity__copy">
          <span className="admin-activity__title">{entry.title}</span>
          <span className="admin-activity__sub">{subtitle}</span>
          {progress ? (
            <span className="admin-activity__sub">
              ~{Math.ceil(progress.visibleChars / 4)} output tokens estimated
              while streaming · {progress.reasoningTokens} reasoning deltas
            </span>
          ) : null}
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

function LockedAgentComposer() {
  const [nudged, setNudged] = useState(false);
  const [notice, setNotice] = useState(false);
  const nudgeTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
    };
  }, []);

  function notifyLocked() {
    setNudged(true);
    setNotice(true);
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    nudgeTimer.current = window.setTimeout(() => {
      setNudged(false);
      nudgeTimer.current = null;
    }, 260);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(false);
      noticeTimer.current = null;
    }, 2400);
  }

  return (
    <div
      className={`admin-chat__composer${nudged ? " is-nudged" : ""}`}
      aria-label="Follow-up agent prompt (read-only)"
      aria-disabled="true"
      onClick={notifyLocked}
    >
      <div className="admin-chat__composer-lock">
        <span className="admin-chat__composer-lock-title">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Read-only run trace
        </span>
        <span
          className="admin-chat__composer-lock-hint"
          role="status"
          aria-live="polite"
        >
          {notice
            ? "Follow-up messaging is disabled on recorded runs for now."
            : "Interactive agent messaging coming soon"}
        </span>
      </div>
      <div className="admin-chat__composer-surface">
        <textarea
          rows={1}
          disabled
          aria-label="Send a follow-up instruction to the agent (disabled for recorded runs)"
          placeholder="Ask the agent to revise a section, inspect a gate finding, or branch this preview..."
          className="admin-chat__composer-input"
        />
        <div className="admin-chat__composer-bar">
          <div className="admin-chat__composer-tools">
            <button
              type="button"
              disabled
              aria-label="Attach context (disabled)"
              className="admin-chat__composer-icon"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <span className="admin-chat__composer-pill">@ Context</span>
            <span className="admin-chat__composer-pill">/ Commands</span>
          </div>
          <div className="admin-chat__composer-actions">
            <span className="admin-chat__composer-model">
              Run agent
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
            <button
              type="button"
              disabled
              aria-label="Send message (disabled)"
              className="admin-chat__composer-send"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GenerationActivity({
  api,
  identity,
  active,
  enabled,
  threaded = false,
  topBanner,
  dockFooter,
}: {
  api: AdminApi;
  identity: TraceIdentity;
  active: boolean;
  enabled: boolean;
  threaded?: boolean;
  topBanner?: ReactNode;
  dockFooter?: ReactNode;
}) {
  const activityIdentity = useMemo(
    () => ({ namespace: identity.namespace, attemptId: identity.attemptId }),
    [identity.namespace, identity.attemptId],
  );
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [thinkingState, setThinkingState] = useState<Record<string, boolean>>(
    {},
  );
  const [now, setNow] = useState(() => Date.now());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const follow = useRef(true);
  const feedRef = useRef<HTMLOListElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const entries = useMemo(
    () => groupActivity(events, threaded),
    [events, threaded],
  );
  const stages = useMemo(
    () => activityStages(entries, active),
    [entries, active],
  );
  const activeStageFilter =
    stageFilter && stages.some((stage) => stage.stage === stageFilter)
      ? stageFilter
      : null;
  const visible = useMemo(() => {
    const byType = filterActivity(entries, filter);
    if (!threaded || !activeStageFilter) return byType;
    return byType.filter((entry) => entry.stage === activeStageFilter);
  }, [entries, filter, threaded, activeStageFilter]);
  const recording = page ? recordingLabel(page.recording, active) : null;
  const notice = page ? heartbeatNotice(page, now) : null;
  const usage = page ? formatUsage(page.usage) : null;
  const selected = selectedKey
    ? (entries.find((entry) => entry.key === selectedKey) ?? null)
    : null;

  const modelEntries = useMemo(
    () => visible.filter((entry) => entry.kind === "model"),
    [visible],
  );

  function isThinkingExpanded(entry: ActivityEntry): boolean {
    if (Object.hasOwn(thinkingState, entry.key))
      return Boolean(thinkingState[entry.key]);
    return isOpenEntry(entry) && active;
  }

  const allThinkingOpen =
    modelEntries.length > 0 &&
    modelEntries.every((entry) => isThinkingExpanded(entry));

  function toggleAllThinking() {
    const nextOpen = !allThinkingOpen;
    setThinkingState((current) => {
      const next = { ...current };
      for (const entry of modelEntries) next[entry.key] = nextOpen;
      return next;
    });
  }

  function toggleThinking(key: string) {
    const entry = entries.find((item) => item.key === key);
    const currentlyOpen = entry ? isThinkingExpanded(entry) : false;
    setThinkingState((current) => ({ ...current, [key]: !currentlyOpen }));
  }

  useEffect(() => {
    if (threaded || !follow.current) return;
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }, [threaded, visible.length]);

  function syncPreviewScroll() {
    const scroller = scrollRef.current;
    if (scroller) {
      setShowJumpToLatest(!atScrollBottom(scroller) || hasPausedPreview(scroller));
    }
  }

  function syncThreadScroll() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    follow.current = atScrollBottom(scroller);
    syncPreviewScroll();
  }

  useLayoutEffect(() => {
    if (!threaded) return;
    const scroller = scrollRef.current;
    if (scroller && follow.current && !hasPausedPreview(scroller)) {
      scroller.scrollTop = scroller.scrollHeight;
    }
    syncPreviewScroll();
  }, [threaded, events, visible.length]);

  useEffect(() => {
    if (!threaded) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => {
      const previewPaused = hasPausedPreview(scroller);
      if (follow.current && !previewPaused) scroller.scrollTop = scroller.scrollHeight;
      setShowJumpToLatest(!atScrollBottom(scroller) || previewPaused);
    };
    const frame = window.requestAnimationFrame(update);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (feedRef.current) observer.observe(feedRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [threaded, visible.length]);

  function select(key: string) {
    setSelectedKey((current) => (threaded && current === key ? null : key));
    follow.current = false;
  }

  if (!enabled) return null;

  function jumpToLatest() {
    follow.current = true;
    if (threaded) {
      const scroller = scrollRef.current;
      if (scroller) {
        for (const preview of scroller.querySelectorAll<HTMLPreElement>(
          ".admin-chat__codeblock--live pre",
        )) {
          preview.removeAttribute("data-preview-paused");
          preview.scrollTop = preview.scrollHeight;
        }
        // A new poll can change the target while a smooth scroll is in flight.
        scroller.scrollTop = scroller.scrollHeight;
      }
      setShowJumpToLatest(false);
      return;
    }
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

  const threadMainContent = (
    <>
      {topBanner}
      {threaded ? (
        <header className="admin-chat__meta-strip">
          <h3 id="generation-activity-title" className="admin-visually-hidden">
            Agent runs
          </h3>
          <div className="admin-chat__meta-left">
            {usage ? (
              <div
                className="admin-activity__summary"
                title="Token totals cover completed calls only, not live token growth. Streaming rows are labeled as estimates."
              >
                <span>{usage.responses}</span>
                <span>{usage.tokens}</span>
                <span>{usage.cost}</span>
              </div>
            ) : null}
            <span className="admin-activity__meta">
              {page
                ? `Updated ${formatRelativeTime(page.observedAt, now)} · UTC`
                : "No activity snapshot yet"}
            </span>
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
      ) : (
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
      )}

      {!enabled ? (
        <p className="admin-activity__empty">
          Detailed activity is not enabled in this environment.
        </p>
      ) : (
        <>
          {usage && !threaded ? (
            <>
              <div className="admin-activity__summary">
                <span>{usage.responses}</span>
                <span>{usage.tokens}</span>
                <span>{usage.cost}</span>
              </div>
              <p className="admin-activity__note">
                Token totals cover completed calls only, not live token growth.
                Streaming rows are labeled as estimates.
              </p>
            </>
          ) : null}

          {notice ? (
            <p className="admin-activity__warning" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <div className="admin-activity__error" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="admin-link-button"
                onClick={refresh}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!threaded && stages.length ? (
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

          <div
            className={
              threaded
                ? "admin-activity__toolbar admin-activity__toolbar--unified"
                : "admin-activity__toolbar"
            }
          >
            <div
              className="admin-activity__filters"
              role="group"
              aria-label="Activity filters"
            >
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
            {threaded && stages.length ? (
              <ol
                className="admin-activity__stages admin-activity__stages--inline"
                aria-label="Activity stages"
              >
                {activeStageFilter ? (
                  <li>
                    <button
                      type="button"
                      className="admin-activity__stage admin-activity__stage--reset"
                      onClick={() => setStageFilter(null)}
                    >
                      All stages
                    </button>
                  </li>
                ) : null}
                {stages.map((stage) => (
                  <li key={stage.stage}>
                    <button
                      type="button"
                      aria-pressed={activeStageFilter === stage.stage}
                      className={`admin-activity__stage admin-activity__stage--${stage.state} admin-activity__stage--button`}
                      onClick={() =>
                        setStageFilter((current) =>
                          current === stage.stage ? null : stage.stage,
                        )
                      }
                    >
                      <span>{stage.label}</span>
                      <small>{stage.entries}</small>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            {threaded ? (
              modelEntries.length > 0 ? (
                <button
                  type="button"
                  className="admin-chat__thinking-btn"
                  aria-pressed={allThinkingOpen}
                  onClick={toggleAllThinking}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {allThinkingOpen ? (
                      <path d="M4.5 6.5 8 3.5l3.5 3M4.5 12.5 8 9.5l3.5 3" />
                    ) : (
                      <path d="M4.5 3.5 8 6.5l3.5-3M4.5 9.5 8 12.5l3.5-3" />
                    )}
                  </svg>
                  <span>
                    {allThinkingOpen ? "Collapse thinking" : "Expand thinking"}
                  </span>
                </button>
              ) : null
            ) : (
              <div className="admin-activity__toolbar-actions">
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={jumpToLatest}
                >
                  Jump to latest
                </button>
              </div>
            )}
          </div>

          <div className="admin-activity__layout">
            <ol
              ref={feedRef}
              className="admin-activity__feed"
              aria-label="Generation events"
              onScroll={(event) => {
                const element = event.currentTarget;
                follow.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  24;
              }}
            >
              {visible.length ? (
                visible.map((entry, index) => (
                  <Fragment key={entry.key}>
                    {threaded && visible[index - 1]?.stage !== entry.stage ? (
                      <li className="admin-activity__chapter">
                        <div className="admin-chat__stage-bubble">
                          <span className="admin-chat__stage-bubble-title">
                            {activityStageLabel(entry.stage)}
                          </span>
                          <span className="admin-chat__stage-bubble-meta">
                            Stage handoff · {formatClock(entry.at)} UTC
                          </span>
                        </div>
                      </li>
                    ) : null}
                    {threaded ? (
                      <ThreadedEntry
                        entry={entry}
                        selected={selectedKey === entry.key}
                        thinkingOpen={isThinkingExpanded(entry)}
                        onSelect={select}
                        onToggleThinking={toggleThinking}
                        active={active}
                        follow={follow}
                        onPreviewScroll={syncPreviewScroll}
                      />
                    ) : (
                      <EntryRow
                        entry={entry}
                        selected={selectedKey === entry.key}
                        onSelect={select}
                      />
                    )}
                  </Fragment>
                ))
              ) : (
                <li className="admin-activity__empty">
                  {threaded && entries.length
                    ? "No recorded work matches this filter."
                    : emptyMessage}
                </li>
              )}
            </ol>
            {!threaded ? (
              <aside
                className="admin-activity__evidence"
                aria-label="Selected evidence"
              >
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
            ) : null}
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
                  {loadingOlder
                    ? "Loading earlier activity..."
                    : "Load earlier activity"}
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
    </>
  );

  return (
    <section
      className={`admin-activity${threaded ? " admin-activity--thread" : ""}`}
      aria-labelledby="generation-activity-title"
      data-activity-connection={connection}
    >
      {threaded ? (
        <>
          <div
            ref={scrollRef}
            className="admin-chat__scroll"
            onScroll={syncThreadScroll}
          >
            {threadMainContent}
          </div>
          <div className="admin-chat__dock">
            {showJumpToLatest && visible.length > 0 ? (
              <button
                type="button"
                className="admin-chat__jump-btn"
                aria-label="Jump to latest"
                title="Jump to latest"
                onClick={jumpToLatest}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
              </button>
            ) : null}
            <LockedAgentComposer />
            <div className="admin-chat__dock-bar">
              <p className="admin-chat__dock-note">
                Only recorded actions and visible output are shown. Private
                reasoning is not recorded.
              </p>
              {dockFooter}
            </div>
          </div>
        </>
      ) : (
        threadMainContent
      )}
    </section>
  );
}
