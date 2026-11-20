import { useEffect, useState } from "react";
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
  if (!failure?.category && !failure?.summary && !failure?.nextStep)
    return <p className="flow-muted">No failure details were recorded.</p>;
  return (
    <div className="flow-failure">
      {structuredFailure(event) ? <StageEvidence event={event!} /> : null}
      {failure.summary ? (
        <DetailValue value={failure.summary} />
      ) : (
        <p>Cause not recorded.</p>
      )}
      {failure.nextStep ? (
        <p>
          <strong>Next step</strong> {failure.nextStep}
        </p>
      ) : null}
      {failure.category ? (
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

type RunState =
  { loading: true } | { error: string } | { attempt: AttemptDetail };

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
  /** Already-loaded detail avoids a second request inside the Sites drawer. */
  data?: AttemptDetail;
  heading?: string;
}) {
  const [result, setResult] = useState<RunState>(
    data ? { attempt: data } : { loading: true },
  );
  const [selection, setSelection] = useState(initialStage);
  const [refresh, setRefresh] = useState(0);
  const [older, setOlder] = useState<{
    events: AttemptEventRecord[];
    cursor: string | null;
  }>();
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState("");
  useEffect(() => {
    if (data) return;
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
  }, [api, attemptId, refresh, data]);

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

  const selectedState = selectedStage
    ? stageStatus(
        selectedStage.status,
        active,
        selectedStage.stage,
        attempt?.deliveryStatus ?? "none",
      )
    : null;
  const shownEvent = stageEvents.find((event) => event.detail);

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
          {!data ? (
            <button
              type="button"
              className="admin-link-button"
              onClick={reload}
              disabled={olderLoading}
            >
              Refresh
            </button>
          ) : null}
        </div>
      </header>

      {"loading" in result ? (
        <p role="status" className="flow-muted">
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
          </div>
          {graphStages.length ? (
            <>
              <WorkflowGraph
                stages={graphStages}
                active={active}
                delivery={attempt.deliveryStatus}
                selected={selected}
                onSelect={setSelection}
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
                    onClick={() => setSelection(item.stage)}
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
