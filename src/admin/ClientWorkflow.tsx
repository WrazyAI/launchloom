import { useEffect, useRef, useState } from "react";
import type {
  AttemptDetail,
  AttemptEventRecord,
  ClientWorkflow as WorkflowSnapshot,
  Failure,
  WorkflowStage,
} from "../lib/admin-contracts";
import type { AdminApi } from "./api";
import { DetailValue } from "./DetailValue";
import { DeliveryStatusBadge, ExecutionStatusBadge } from "./StatusBadge";
import { mergeWorkflowEvents, useWorkflowRun } from "./useWorkflowRun";
import {
  WorkflowGraph,
  WorkflowLegend,
  orderedStages,
  stageLabel,
  stageStatus,
  withFailure,
  workflowState,
} from "./WorkflowGraph";
import {
  formatElapsed,
  formatProfile,
  formatTimestamp,
  requestErrorMessage,
  safeEvidenceUrl,
} from "./format";

/**
 * One plain-language line in the directory. The full graph lives in the
 * drawer, not in the admin's working table.
 */
export function ClientWorkflowDirectory({
  workflow,
}: {
  workflow: WorkflowSnapshot | null | undefined;
}) {
  const state = workflowState(workflow);
  return (
    <span className="client-run-summary" data-tone={state.tone}>
      <span className="client-run-summary__dot" aria-hidden="true" />
      <span className="client-run-summary__copy">
        <span>{state.headline}</span>
        <small>{state.detail}</small>
      </span>
      <span className="client-run-summary__chevron" aria-hidden="true">
        →
      </span>
    </span>
  );
}

function FailureDetails({
  failure,
  event,
}: {
  failure: Failure | undefined;
  event?: AttemptEventRecord;
}) {
  const diagnostic = structuredFailure(event);
  const eventDetail = event?.detail?.trim() ?? "";
  if (
    !failure?.category &&
    !failure?.summary &&
    !failure?.nextStep &&
    !failure?.code &&
    !failure?.detail &&
    !eventDetail
  )
    return <p className="flow-muted">No failure details were recorded.</p>;
  const detail = failure?.detail?.trim() ?? "";
  const summary = failure?.summary?.trim() ?? "";
  return (
    <div className="flow-failure">
      {diagnostic ? <StageEvidence event={event!} /> : null}
      {eventDetail &&
      !diagnostic &&
      eventDetail !== summary &&
      eventDetail !== detail ? (
        <StageEvidence event={event!} />
      ) : null}
      {failure?.code && failure.code !== diagnostic?.errorCode ? (
        <p className="flow-failure__code">
          <span>Code</span> <code>{failure.code}</code>
        </p>
      ) : null}
      {detail && detail !== summary ? (
        <pre className="flow-failure__detail">{detail}</pre>
      ) : null}
      {failure?.summary ? (
        <DetailValue value={failure.summary} />
      ) : !detail && !eventDetail ? (
        <p>Cause not recorded.</p>
      ) : null}
      {failure?.nextStep ? (
        <p>
          <strong>Next step</strong> {failure.nextStep}
        </p>
      ) : null}
      {failure?.category ? (
        <p className="flow-muted">
          Category <code>{failure.category}</code>
        </p>
      ) : null}
    </div>
  );
}

type StructuredFailure = {
  errorCode: string;
  diagnosticExcerpt: string;
};

function structuredFailure(
  event: AttemptEventRecord | undefined,
): StructuredFailure | null {
  if (
    !event?.detail ||
    event.source !== "github-reconcile" ||
    event.eventKey !== `github-step:${event.stage}`
  )
    return null;
  try {
    const evidence = JSON.parse(event.detail);
    if (
      typeof evidence?.errorCode === "string" &&
      /^LL_STAGE_[A-Z_]+_(FAILED|TIMED_OUT)$/u.test(evidence.errorCode) &&
      typeof evidence.diagnosticExcerpt === "string"
    )
      return evidence as StructuredFailure;
  } catch {
    // Older retained evidence renders below as plain text.
  }
  return null;
}

function StageEvidence({ event }: { event: AttemptEventRecord }) {
  if (!event.detail) return null;
  if (
    event.source === "github-reconcile" &&
    event.eventKey === `github-step:${event.stage}`
  ) {
    try {
      const evidence = structuredFailure(event);
      if (evidence) {
        return (
          <div className="flow-diagnostic">
            <p>
              <span>Error code</span>
              <code>{evidence.errorCode}</code>
            </p>
            <pre className="admin-detail-code">
              {evidence.diagnosticExcerpt}
            </pre>
          </div>
        );
      }
    } catch {
      // Older retained evidence still renders as text below.
    }
  }
  return <DetailValue value={event.detail} />;
}

function runHeadline(
  attempt: AttemptDetail,
  stages: WorkflowStage[],
  active: boolean,
) {
  const failed = stages.find((item) => item.status === "failed");
  if (failed)
    return failed.stage === "workflow"
      ? "Run failed"
      : `${stageLabel(failed.stage)} failed`;
  if (active) {
    const running = stages.findLast((item) => item.status === "started");
    return running
      ? `${stageLabel(running.stage)} is running`
      : "Run is starting";
  }
  if (attempt.executionStatus === "cancelled") return "Run was cancelled";
  if (attempt.executionStatus === "failed") return "Run failed";
  if (attempt.executionStatus === "unknown") return "Outcome unknown";
  if (attempt.executionStatus === "succeeded")
    return stages.some((item) => item.status === "skipped")
      ? "Completed with skipped stages"
      : "All recorded stages passed";
  return "Run is queued";
}

export function WorkflowRunPanel({
  api,
  attemptId,
  initialStage,
  data,
  heading = "Workflow",
}: {
  api: AdminApi;
  attemptId: string;
  initialStage: string | null;
  /** Already-loaded detail seeds the panel before its first live refresh. */
  data?: AttemptDetail;
  heading?: string;
}) {
  const {
    attempt,
    events: liveEvents,
    error,
    refreshing,
    checkedAt,
    refresh,
  } = useWorkflowRun(api, attemptId, data);
  const [selection, setSelection] = useState(initialStage);
  const [following, setFollowing] = useState(true);
  const [older, setOlder] = useState<{
    events: AttemptEventRecord[];
    cursor: string | null;
  }>();
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState("");
  const olderRequest = useRef<AbortController | null>(null);
  const previousHead = useRef<AttemptDetail | null>(null);
  useEffect(() => {
    return () => olderRequest.current?.abort();
  }, [attemptId]);

  useEffect(() => {
    const previous = previousHead.current;
    previousHead.current = attempt;
    if (!previous || !attempt?.eventsNextCursor || !attempt.events.length)
      return;
    const keys = new Set(previous.events.map((event) => event.eventKey));
    if (!attempt.events.some((event) => keys.has(event.eventKey))) {
      // A burst or hidden tab can move the whole head past unseen events.
      // Re-open traversal from that gap without discarding inspected history.
      setOlder((current) => ({
        events: current?.events ?? [],
        cursor: attempt.eventsNextCursor,
      }));
    }
  }, [attempt]);

  const events = mergeWorkflowEvents(older?.events ?? [], liveEvents);
  const cursor = older ? older.cursor : attempt?.eventsNextCursor;
  const failureStage =
    attempt?.executionStatus === "failed"
      ? (attempt.failure.stage ?? null)
      : null;
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
  const allStages = orderedStages(
    withFailure([...recorded.values()], failureStage),
  );
  const graphStages = allStages.filter((item) => item.status !== "skipped");
  const skipped = allStages.filter((item) => item.status === "skipped");
  const active = attempt?.executionStatus === "running" && !attempt.stale;
  const attributed = allStages.find(
    (item) => item.stage === failureStage && item.status === "failed",
  )?.stage;
  const firstFailure =
    attributed ?? graphStages.find((item) => item.status === "failed")?.stage;
  const selected =
    selection ?? firstFailure ?? graphStages.at(-1)?.stage ?? null;
  const selectedStage = allStages.find((item) => item.stage === selected);
  const stageEvents = events.filter((event) => event.stage === selected);
  const passed = allStages.filter((item) => item.status === "completed").length;
  const github =
    attempt?.repository === "WrazyAI/launchloom" && attempt.runId
      ? safeEvidenceUrl(
          `https://github.com/WrazyAI/launchloom/actions/runs/${attempt.runId}${
            attempt.runAttempt ? `/attempts/${attempt.runAttempt}` : ""
          }`,
        )
      : null;

  async function loadEarlier() {
    if (!cursor || olderRequest.current) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setOlderLoading(true);
    setOlderError("");
    try {
      const page = await api.getAttemptEvents(
        attemptId,
        cursor,
        50,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setOlder((current) => ({
        events: mergeWorkflowEvents(current?.events ?? [], page.items),
        // A new head may have exposed a gap while this older page was loading.
        cursor:
          current && current.cursor !== cursor
            ? current.cursor
            : page.nextCursor,
      }));
    } catch (error) {
      if (!controller.signal.aborted) setOlderError(requestErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setOlderLoading(false);
      if (olderRequest.current === controller) olderRequest.current = null;
    }
  }

  const selectedState = selectedStage
    ? stageStatus(
        selectedStage.status,
        active,
        selectedStage.stage,
        attempt?.deliveryStatus ?? "none",
      )
    : null;
  const matchingEvidence = stageEvents.filter(
    (event) =>
      event.detail &&
      stageStatus(
        event.status,
        active,
        event.stage,
        attempt?.deliveryStatus ?? "none",
      ).tone === selectedState?.tone,
  );
  const shownEvent =
    matchingEvidence.findLast((event) => structuredFailure(event)) ??
    matchingEvidence.at(-1);

  return (
    <section className="workflow-panel" aria-label={heading} data-workflow-view>
      <header className="workflow-panel__head">
        <div>
          <span className="workflow-panel__eyebrow">{heading}</span>
          <h3 id="workflow-panel-title">
            {attempt ? runHeadline(attempt, allStages, active) : "Workflow run"}
          </h3>
          <p className="workflow-panel__meta">
            {attempt ? (
              <>
                <span>{formatProfile(attempt.profile)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {formatTimestamp(attempt.startedAt ?? attempt.createdAt)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {formatElapsed(
                    attempt.startedAt,
                    attempt.completedAt,
                    !active,
                  )}
                </span>
              </>
            ) : (
              "Loading run evidence"
            )}
          </p>
        </div>
        <div className="workflow-panel__status">
          {attempt ? (
            <>
              <ExecutionStatusBadge
                status={attempt.executionStatus}
                stale={attempt.stale}
              />
              <DeliveryStatusBadge status={attempt.deliveryStatus} />
            </>
          ) : null}
          <button
            type="button"
            className="admin-link-button"
            aria-label="Refresh workflow"
            onClick={refresh}
            disabled={refreshing}
          >
            Refresh
          </button>
        </div>
      </header>

      {!attempt && !error ? (
        <p role="status" className="flow-muted">
          Loading workflow run…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="admin-inline-error">
          {attempt ? (
            <p>
              Live updates interrupted. Showing the last received evidence and
              retrying automatically.
            </p>
          ) : null}
          <p>{error}</p>
          <button
            type="button"
            className="admin-link-button"
            onClick={refresh}
            disabled={refreshing}
          >
            Retry workflow run
          </button>
        </div>
      ) : null}

      {attempt ? (
        <>
          <div className="workflow-scorecard" aria-label="Run progress">
            <span>
              <strong>{passed}</strong> of <strong>{allStages.length}</strong>{" "}
              recorded stages passed
            </span>
            {skipped.length ? (
              <span>
                <strong>{skipped.length}</strong> skipped
              </span>
            ) : null}
            <span
              className="workflow-scorecard__live"
              title={
                checkedAt
                  ? `Last checked ${formatTimestamp(checkedAt)}`
                  : undefined
              }
            >
              <span
                className="workflow-scorecard__dot"
                data-live={!error}
                aria-hidden="true"
              />
              {error
                ? "Reconnecting"
                : active || attempt.executionStatus === "queued"
                  ? "Live updates"
                  : "Updates enabled"}
            </span>
          </div>
          {graphStages.length ? (
            <>
              <WorkflowGraph
                stages={graphStages}
                active={active}
                delivery={attempt.deliveryStatus}
                selected={selected}
                onSelect={setSelection}
                following={following}
                onFollowingChange={setFollowing}
                label="Workflow stage graph"
              />
              <WorkflowLegend />
            </>
          ) : (
            <p className="flow-muted">
              No stage outcomes were recorded for this run.
            </p>
          )}

          {selectedStage && selectedState ? (
            <article
              className="flow-focus"
              data-tone={selectedState.tone}
              aria-labelledby="flow-focus-title"
            >
              <header className="flow-focus__head">
                <span className="flow-focus__dot" aria-hidden="true" />
                <div>
                  <h4 id="flow-focus-title">
                    {stageLabel(selectedStage.stage)}
                  </h4>
                  <p>
                    {selectedState.label}
                    {shownEvent
                      ? ` · ${formatTimestamp(shownEvent.createdAt)}`
                      : ""}
                  </p>
                </div>
              </header>
              {shownEvent?.detail &&
              selected !== attributed &&
              stageStatus(
                shownEvent.status,
                active,
                shownEvent.stage,
                attempt.deliveryStatus,
              ).label === selectedState.label ? (
                <StageEvidence event={shownEvent} />
              ) : null}
              {selected === attributed ? (
                <FailureDetails failure={attempt.failure} event={shownEvent} />
              ) : null}
              {selected === "preview_ready" &&
              !["preview_ready", "published"].includes(
                attempt.deliveryStatus,
              ) ? (
                <p className="flow-muted">
                  This run did not record a verified preview delivery.
                </p>
              ) : null}
              {!shownEvent?.detail &&
              !(selected === attributed) &&
              selected !== "preview_ready" ? (
                <p className="flow-muted">
                  No additional detail was recorded for this stage.
                </p>
              ) : null}
            </article>
          ) : null}

          {skipped.length ? (
            <details className="flow-skipped">
              <summary>
                {skipped.length} skipped{" "}
                {skipped.length === 1 ? "stage" : "stages"}
              </summary>
              <div>
                {skipped.map((item) => (
                  <button
                    key={item.stage}
                    type="button"
                    className="admin-link-button"
                    onClick={() => {
                      setFollowing(false);
                      setSelection(item.stage);
                    }}
                  >
                    {stageLabel(item.stage)}
                  </button>
                ))}
              </div>
            </details>
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

          <footer className="flow-footer">
            {github ? (
              <a href={github} target="_blank" rel="noreferrer">
                View run on GitHub
              </a>
            ) : null}
          </footer>
        </>
      ) : null}
    </section>
  );
}
