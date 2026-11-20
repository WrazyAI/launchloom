import { useEffect, useRef, useState } from "react";
import { generationStageOrder } from "../../scripts/generation-stage-outcomes.mjs";
import type {
  AttemptDetail,
  AttemptEventRecord,
  ClientWorkflow as WorkflowSnapshot,
  DeliveryStatus,
  Failure,
  WorkflowStage,
} from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import { DetailValue } from "./DetailValue";
import { activityStageLabel } from "./generation-activity-format";
import { DeliveryStatusBadge, ExecutionStatusBadge } from "./StatusBadge";
import {
  formatTimestamp,
  requestErrorMessage,
  safeEvidenceUrl,
} from "./format";

function stageState(status: string, active: boolean) {
  switch (status) {
    case "completed":
    case "succeeded":
    case "passed":
      return { label: "Passed", glyph: "✓", tone: "success" };
    case "failed":
    case "error":
      return { label: "Failed", glyph: "×", tone: "failure" };
    case "started":
    case "running":
      return active
        ? { label: "In progress", glyph: "›", tone: "running" }
        : { label: "Outcome not recorded", glyph: "?", tone: "neutral" };
    case "skipped":
      return { label: "Skipped", glyph: "–", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", glyph: "–", tone: "neutral" };
    case "warning":
    case "recorded-incomplete":
      return { label: "Needs review", glyph: "!", tone: "attention" };
    default:
      return { label: "Recorded", glyph: "·", tone: "neutral" };
  }
}

function withFailure(stages: WorkflowStage[], failure: string | null) {
  if (!failure || ["execution", "delivery", "workflow"].includes(failure))
    return stages;
  const found = stages.some((item) => item.stage === failure);
  return found
    ? stages.map((item) =>
        item.stage === failure && !item.verified
          ? { ...item, status: "failed" }
          : item,
      )
    : [...stages, { stage: failure, status: "failed" }];
}

function stageName(stage: string) {
  if (stage === "preview_ready") return "Preview delivery";
  if (stage === "preview_verification") return "Preview check";
  if (stage === "seo_telemetry") return "SEO reporting";
  return activityStageLabel(stage) || "Unnamed stage";
}

function stageOutcome(item: WorkflowStage, delivery: DeliveryStatus) {
  if (item.stage !== "preview_ready" || item.status !== "completed")
    return item.status;
  if (delivery === "preview_ready" || delivery === "published")
    return "completed";
  return delivery === "attention" || delivery === "diagnostic"
    ? "warning"
    : "unverified";
}

function StageButton({
  item,
  active,
  delivery,
  selected,
  showLabel = selected !== undefined,
  onClick,
}: {
  item: WorkflowStage;
  active: boolean;
  delivery: DeliveryStatus;
  selected?: boolean;
  showLabel?: boolean;
  onClick: (element: HTMLButtonElement) => void;
}) {
  const state = stageState(stageOutcome(item, delivery), active);
  const name = stageName(item.stage);
  return (
    <button
      type="button"
      className="admin-workflow-node"
      data-stage-tone={state.tone}
      aria-label={`${name}: ${state.label}`}
      aria-pressed={selected}
      aria-haspopup={selected === undefined ? "dialog" : undefined}
      title={`${name}: ${state.label}`}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <span className="admin-workflow-node__glyph" aria-hidden="true">
        {state.glyph}
      </span>
      {showLabel ? (
        <span className="admin-workflow-node__copy">
          <span>{name}</span>
          <small>{state.label}</small>
        </span>
      ) : null}
    </button>
  );
}

function orderedStages(stages: WorkflowStage[]) {
  if (!stages.some((item) => item.verified)) return stages;
  return [...stages].sort((a, b) => {
    const position = (stage: string) => {
      if (stage === "seo_research")
        return generationStageOrder.indexOf("seo_telemetry") - 0.5;
      if (stage === "preview_ready")
        return generationStageOrder.indexOf("preview_verification") + 0.5;
      const index = generationStageOrder.indexOf(stage);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return position(a.stage) - position(b.stage);
  });
}

export function ClientWorkflowDirectory({
  workflow,
  onOpen,
}: {
  workflow: WorkflowSnapshot | null | undefined;
  onOpen: (stage: string | null, trigger: HTMLButtonElement) => void;
}) {
  const trackRef = useRef<HTMLOListElement>(null);
  const [scrollState, setScrollState] = useState(0);
  const updateScrollState = (track: HTMLOListElement) => {
    const before = track.scrollLeft > 1;
    const after = track.scrollWidth - track.clientWidth - track.scrollLeft > 1;
    setScrollState(Number(before) | (Number(after) << 1));
  };
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => updateScrollState(track);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    if (track.lastElementChild) observer.observe(track.lastElementChild);
    return () => observer.disconnect();
  }, [workflow]);

  function moveStages(direction: -1 | 1) {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.8 });
  }

  if (!workflow)
    return (
      <span className="admin-muted">
        {workflow === null ? "No run recorded" : "Workflow unavailable"}
      </span>
    );
  const { executionStatus, deliveryStatus, stale } = workflow;
  const stages = orderedStages(
    withFailure(
      workflow.stages,
      executionStatus === "failed" ? workflow.failureStage : null,
    ),
  );
  const active = !stale && executionStatus === "running";
  const failure =
    stages.find(
      (item) =>
        item.stage === workflow.failureStage && item.status === "failed",
    ) ?? stages.find((item) => item.status === "failed");
  const latest =
    failure ??
    stages.findLast((item) => item.status !== "skipped") ??
    stages.at(-1);
  const compact = stages.filter((item) => item.status !== "skipped").slice(-4);
  if (failure && !compact.includes(failure)) compact.splice(0, 1, failure);
  const status = (
    <button
      type="button"
      className="admin-workflow-status"
      aria-haspopup="dialog"
      onClick={(event) => onOpen(null, event.currentTarget)}
    >
      <ExecutionStatusBadge status={executionStatus} stale={stale} />
    </button>
  );
  return (
    <>
      <div className="admin-workflow-graph" data-workflow-graph>
        <div className="admin-workflow-graph__head">
          <span>Latest workflow</span>
          {status}
          {failure ? (
            <button
              type="button"
              className="admin-link-button"
              onClick={(event) => onOpen(failure.stage, event.currentTarget)}
            >
              Inspect failed stage: {stageName(failure.stage)}
            </button>
          ) : null}
          {scrollState ? (
            <div className="admin-workflow-graph__controls">
              <button
                type="button"
                className="admin-workflow-scroll"
                aria-label="Previous stages"
                aria-disabled={!(scrollState & 1)}
                onClick={() => scrollState & 1 && moveStages(-1)}
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                type="button"
                className="admin-workflow-scroll"
                aria-label="Next stages"
                aria-disabled={!(scrollState & 2)}
                onClick={() => scrollState & 2 && moveStages(1)}
              >
                <span aria-hidden="true">→</span>
                <span>More stages</span>
              </button>
            </div>
          ) : null}
        </div>
        {stages.length ? (
          <ol
            ref={trackRef}
            onScroll={(event) => updateScrollState(event.currentTarget)}
            className="admin-workflow-graph__nodes"
            role="list"
            aria-label="Workflow stage graph"
          >
            {stages.map((item, index) => (
              <li key={item.stage}>
                {index ? (
                  <span
                    className="admin-workflow-graph__edge"
                    data-workflow-edge
                    aria-hidden="true"
                  />
                ) : null}
                <StageButton
                  item={item}
                  active={active}
                  delivery={deliveryStatus}
                  showLabel
                  onClick={(trigger) => onOpen(item.stage, trigger)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <span className="admin-muted">No stage outcomes recorded</span>
        )}
      </div>
      <div className="admin-workflow-strip" data-workflow-compact>
        {status}
        {compact.length ? (
          <ol
            className="admin-workflow-track"
            aria-label="Recent workflow stages"
          >
            {compact.map((item) => (
              <li key={item.stage}>
                <StageButton
                  item={item}
                  active={active}
                  delivery={deliveryStatus}
                  onClick={(trigger) => onOpen(item.stage, trigger)}
                />
              </li>
            ))}
          </ol>
        ) : null}
        {latest ? (
          <span className="admin-workflow-caption">
            {stageName(latest.stage)}{" "}
            {stageState(
              stageOutcome(latest, deliveryStatus),
              active,
            ).label.toLowerCase()}
          </span>
        ) : null}
      </div>
    </>
  );
}

type RunState =
  { loading: true } | { error: string } | { attempt: AttemptDetail };

function FailureEvidence({ failure }: { failure: Failure | undefined }) {
  return (
    <div>
      {failure?.category ? (
        <p>
          Failure category: <code>{failure.category}</code>
        </p>
      ) : null}
      {failure?.summary ? (
        <DetailValue value={failure.summary} />
      ) : (
        <p>Cause not recorded.</p>
      )}
      {failure?.nextStep ? (
        <p>
          <strong>Next step:</strong> {failure.nextStep}
        </p>
      ) : null}
    </div>
  );
}

function StageEvidence({ event }: { event: AttemptEventRecord }) {
  if (!event.detail) return null;
  if (
    event.source === "github-reconcile" &&
    event.eventKey === `github-step:${event.stage}`
  ) {
    try {
      const evidence = JSON.parse(event.detail);
      if (
        typeof evidence?.errorCode === "string" &&
        /^LL_STAGE_[A-Z_]+_(FAILED|TIMED_OUT)$/u.test(evidence.errorCode) &&
        typeof evidence.diagnosticExcerpt === "string"
      ) {
        return (
          <div className="admin-workflow-diagnostic">
            <p>
              Error code: <code>{evidence.errorCode}</code>
            </p>
            <pre className="admin-detail-code">
              {evidence.diagnosticExcerpt}
            </pre>
          </div>
        );
      }
    } catch {
      // Keep older retained evidence readable.
    }
  }
  return <DetailValue value={event.detail} />;
}

export function ClientWorkflowRun({
  api,
  attemptId,
  initialStage,
}: {
  api: AdminApi;
  attemptId: string;
  initialStage: string | null;
}) {
  const [result, setResult] = useState<RunState>({ loading: true });
  const [selection, setSelection] = useState(initialStage);
  const [refresh, setRefresh] = useState(0);
  const [older, setOlder] = useState<{
    events: AttemptEventRecord[];
    cursor: string | null;
  }>();
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api
      .getAttempt(attemptId, { signal: controller.signal })
      .then((attempt) => {
        if (!controller.signal.aborted) setResult({ attempt });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ error: requestErrorMessage(error) });
      });
    return () => controller.abort();
  }, [api, attemptId, refresh]);

  function reload() {
    setResult({ loading: true });
    setOlder(undefined);
    setOlderError("");
    setRefresh((value) => value + 1);
  }

  const attempt = "attempt" in result ? result.attempt : null;
  const events = [
    ...new Map(
      [
        ...(attempt?.events ?? []),
        ...(older?.events ?? []),
        ...(attempt?.workflowEvents ?? []),
      ].map((event) => [event.eventKey, event]),
    ).values(),
  ]
    .filter(
      (event) =>
        !["execution", "delivery"].includes(event.stage) &&
        !/(^|:)cost:/u.test(event.eventKey),
    )
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.observedAt - b.observedAt ||
        a.eventKey.localeCompare(b.eventKey),
    );
  const cursor = older ? older.cursor : attempt?.eventsNextCursor;
  const failure = attempt?.failure;
  const failureStage =
    attempt?.executionStatus === "failed" ? (failure?.stage ?? null) : null;
  const recorded = new Map<string, WorkflowStage>();
  for (const event of events) {
    const verified =
      event.source === "github-reconcile" &&
      event.eventKey === `github-step:${event.stage}`;
    if (verified || !recorded.get(event.stage)?.verified)
      recorded.set(event.stage, {
        stage: event.stage,
        status: event.status,
        ...(verified ? { verified: true } : {}),
      });
  }
  const stages = orderedStages(
    withFailure([...recorded.values()], failureStage),
  );
  const attributed = stages.find(
    (item) => item.stage === failureStage && item.status === "failed",
  )?.stage;
  const selected =
    selection ??
    attributed ??
    stages.find((item) => item.status === "failed")?.stage ??
    stages.at(-1)?.stage;
  const stageEvents = events.filter((event) => event.stage === selected);
  const showRunFailure = attempt?.executionStatus === "failed" && !attributed;
  const active = attempt?.executionStatus === "running" && !attempt.stale;
  const github =
    attempt?.repository === "WrazyAI/launchloom" && attempt.runId
      ? safeEvidenceUrl(
          `https://github.com/WrazyAI/launchloom/actions/runs/${attempt.runId}${attempt.runAttempt ? `/attempts/${attempt.runAttempt}` : ""}`,
        )
      : null;

  async function loadEarlier() {
    if (!cursor || olderLoading) return;
    setOlderLoading(true);
    setOlderError("");
    try {
      const page = await api.getAttemptEvents(attemptId, cursor, 50);
      setOlder({
        events: [...(older?.events ?? []), ...page.items],
        cursor: page.nextCursor,
      });
    } catch (error) {
      setOlderError(requestErrorMessage(error));
    } finally {
      setOlderLoading(false);
    }
  }

  return (
    <section
      className="admin-sheet__section admin-client-workflow"
      aria-labelledby="client-workflow-title"
    >
      <div className="admin-inspector__block-head">
        <h3 id="client-workflow-title">Workflow run</h3>
        {attempt ? (
          <button
            className="admin-link-button"
            type="button"
            onClick={reload}
            disabled={olderLoading}
          >
            Refresh run
          </button>
        ) : null}
      </div>
      {"loading" in result ? (
        <p role="status" className="admin-muted">
          Loading workflow run…
        </p>
      ) : null}
      {"error" in result ? (
        <div role="alert" className="admin-inline-error">
          <p>{result.error}</p>
          <button type="button" className="admin-link-button" onClick={reload}>
            Retry workflow run
          </button>
        </div>
      ) : null}
      {attempt ? (
        <>
          <div className="admin-workflow-outcomes">
            <span>
              Run{" "}
              <ExecutionStatusBadge
                status={attempt.executionStatus}
                stale={attempt.stale}
              />
            </span>
            <span>
              Delivery <DeliveryStatusBadge status={attempt.deliveryStatus} />
            </span>
          </div>
          {stages.length ? (
            <ol
              className="admin-workflow-track admin-workflow-track--detail"
              aria-label="Recorded workflow stages"
            >
              {stages.map((item) => (
                <li key={item.stage}>
                  <StageButton
                    item={item}
                    active={active}
                    delivery={attempt.deliveryStatus}
                    selected={selected === item.stage}
                    onClick={() => setSelection(item.stage)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="admin-muted">
              No stage events were recorded for this run.
            </p>
          )}
          {showRunFailure ? (
            <div className="admin-workflow-evidence">
              <h4>Run failure</h4>
              <FailureEvidence failure={failure} />
            </div>
          ) : null}
          {selected ? (
            <div className="admin-workflow-evidence">
              <h4>{stageName(selected)}</h4>
              {selected === attributed ? (
                <FailureEvidence failure={failure} />
              ) : null}
              {selected === "preview_ready" &&
              !["preview_ready", "published"].includes(
                attempt.deliveryStatus,
              ) ? (
                <p className="admin-muted">
                  This run did not record a verified preview delivery.
                </p>
              ) : null}
              {stageEvents.length ? (
                <ul className="admin-workflow-log">
                  {stageEvents.map((event) => (
                    <li key={event.eventKey}>
                      <span className="admin-muted">
                        {formatTimestamp(event.createdAt)} ·{" "}
                        {
                          stageState(
                            stageOutcome(event, attempt.deliveryStatus),
                            active,
                          ).label
                        }
                      </span>
                      {event.detail &&
                      stageOutcome(event, attempt.deliveryStatus) ===
                        event.status ? (
                        <StageEvidence event={event} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">
                  No stage log found in the loaded events.
                </p>
              )}
            </div>
          ) : null}
          {olderError ? (
            <p role="alert" className="admin-inline-error">
              {olderError}
            </p>
          ) : null}
          {cursor ? (
            <button
              type="button"
              className="admin-link-button"
              onClick={loadEarlier}
              disabled={olderLoading}
            >
              {olderLoading
                ? "Loading earlier events…"
                : "Load earlier stage events"}
            </button>
          ) : null}
          {github ? (
            <footer className="admin-workflow-footer">
              <a href={github} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </footer>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
