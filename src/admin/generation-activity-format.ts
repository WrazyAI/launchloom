import type {
  GenerationActivityPage,
  GenerationActivityRecording,
  StoredTraceEvent,
  TraceText,
  TraceUsageSummary,
} from "../lib/generation-activity";

export type ActivityFilter = "all" | "actions" | "model" | "issues";

export type ActivityEntryKind =
  | "model"
  | "action"
  | "task"
  | "error"
  | "coverage"
  | "retry"
  | "output"
  | "finished";

export type ActivityEntry = {
  key: string;
  kind: ActivityEntryKind;
  at: number;
  stage: string;
  actorKind: string;
  role: string;
  title: string;
  status: string | null;
  callId: string | null;
  primary: StoredTraceEvent;
  evidence: StoredTraceEvent[];
};

export type ActivityProgress = {
  visibleChars: number;
  reasoningTokens: number;
  elapsedMs: number;
};

/**
 * Latest streamed estimate for a model call. The completed `output` and `usage`
 * events remain authoritative; this value is only a live hint.
 */
export function activityProgress(
  entry: ActivityEntry,
): ActivityProgress | null {
  for (let index = entry.evidence.length - 1; index >= 0; index -= 1) {
    const event = entry.evidence[index];
    if (event.kind === "output_delta")
      return {
        visibleChars: event.payload.visibleChars,
        reasoningTokens: event.payload.reasoningTokens,
        elapsedMs: event.payload.elapsedMs,
      };
  }
  return null;
}

export type ActivityStage = {
  stage: string;
  label: string;
  entries: number;
  lastAt: number;
  state: "active" | "done" | "idle";
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  site_config: "Site config",
  seo_research: "SEO research",
  inspiration_selection: "References",
  reference_analysis: "Reference analysis",
  client_repo: "Client repository",
  review_branch: "Review branch",
  imagery: "Imagery",
  pack_select: "Pack selection",
  foundation_select: "Foundation selection",
  authoring: "Authoring",
  authored_evidence: "Candidate evidence",
  creative_render: "Creative render",
  foundation_render: "Foundation render",
  pack_render: "Pack render",
  preview_deploy: "Preview deploy",
  diagnostic_preview: "Diagnostic preview",
  preview_ready: "Preview ready",
  handoff: "Handoff",
  workflow: "Workflow",
};

export function activityStageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage] ??
    stage
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function activityRoleLabel(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleCase(value: string): string {
  const text = value.replace(/[._:]+/gu, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Action";
}

function traceText(value: TraceText | null): string {
  if (!value) return "";
  return value.kind === "text" ? value.text : `Withheld (${value.reason})`;
}

function entryFor(
  event: StoredTraceEvent,
  kind: ActivityEntryKind,
  title: string,
): ActivityEntry {
  return {
    key: event.eventId,
    kind,
    at: event.receivedAt,
    stage: event.context.stage,
    actorKind: event.context.actor.kind,
    role: event.context.actor.role,
    title,
    status: null,
    callId: null,
    primary: event,
    evidence: [event],
  };
}

function entryTitle(event: StoredTraceEvent): string {
  switch (event.kind) {
    case "model_started":
      return "Model request";
    case "action_started":
      return titleCase(event.payload.name);
    case "task_started":
      return event.payload.label;
    case "error":
      return traceText(event.payload.message) || "Error";
    case "coverage":
      return `Coverage: ${event.payload.boundary}`;
    case "retry":
      return `Retry ${event.payload.attempt} of ${event.payload.maxAttempts}`;
    case "producer_finished":
      return "Activity recording finished";
    default:
      return titleCase(event.kind);
  }
}

/**
 * Collapse one model call or action into a single feed row. The feed never
 * invents work: an unpaired start remains visibly unfinished.
 */
export function groupActivity(events: StoredTraceEvent[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  const calls = new Map<string, ActivityEntry>();
  const actions = new Map<string, ActivityEntry>();

  for (const event of events) {
    switch (event.kind) {
      case "model_started": {
        const entry = entryFor(event, "model", "Model request");
        entry.callId = event.payload.callId;
        calls.set(event.payload.callId, entry);
        entries.push(entry);
        break;
      }
      case "model_finished":
      case "output": {
        const entry = calls.get(event.payload.callId);
        if (!entry) break;
        entry.evidence.push(event);
        if (event.kind === "model_finished") entry.status = event.payload.status;
        break;
      }
      case "usage": {
        const entry = calls.get(event.payload.callId);
        if (entry) entry.evidence.push(event);
        break;
      }
      case "output_delta": {
        const entry = calls.get(event.payload.callId);
        if (entry) entry.evidence.push(event);
        break;
      }
      case "action_started": {
        const entry = entryFor(
          event,
          "action",
          titleCase(event.payload.name),
        );
        entry.callId = event.payload.actionId;
        actions.set(event.payload.actionId, entry);
        entries.push(entry);
        break;
      }
      case "action_finished": {
        const entry = actions.get(event.payload.actionId);
        if (!entry) break;
        entry.evidence.push(event);
        entry.status = event.payload.status;
        break;
      }
      case "heartbeat":
        break;
      default: {
        const kind: ActivityEntryKind =
          event.kind === "task_started"
            ? "task"
            : event.kind === "task_finished"
              ? "finished"
              : event.kind === "error"
                ? "error"
                : event.kind === "coverage"
                  ? "coverage"
                  : event.kind === "retry"
                    ? "retry"
                    : event.kind === "producer_finished"
                      ? "finished"
                      : "output";
        const entry = entryFor(event, kind, entryTitle(event));
        if (event.kind === "task_finished") entry.status = event.payload.status;
        if (event.kind === "producer_finished")
          entry.status = event.payload.status;
        entries.push(entry);
      }
    }
  }
  // Feed is chronological by first evidence.
  return entries.sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at;
    return left.primary.receivedAt - right.primary.receivedAt;
  });
}

export function isOpenEntry(entry: ActivityEntry): boolean {
  if (entry.kind !== "model" && entry.kind !== "action") return false;
  return entry.status === null;
}

export function filterActivity(
  entries: ActivityEntry[],
  filter: ActivityFilter,
): ActivityEntry[] {
  if (filter === "all") return entries;
  if (filter === "actions")
    return entries.filter((entry) =>
      ["action", "task", "finished"].includes(entry.kind),
    );
  if (filter === "model")
    return entries.filter((entry) =>
      ["model", "output"].includes(entry.kind),
    );
  return entries.filter((entry) =>
    ["error", "retry"].includes(entry.kind) ||
    (entry.kind === "coverage" &&
      ["limited", "unsupported"].includes(
        String(
          entry.primary.kind === "coverage"
            ? entry.primary.payload.status
            : "",
        ),
      )),
  );
}

export function activityStages(
  entries: ActivityEntry[],
  live: boolean,
): ActivityStage[] {
  const stages = new Map<string, ActivityStage>();
  for (const entry of entries) {
    const existing = stages.get(entry.stage);
    if (existing) {
      existing.entries += 1;
      existing.lastAt = Math.max(existing.lastAt, entry.at);
      continue;
    }
    stages.set(entry.stage, {
      stage: entry.stage,
      label: activityStageLabel(entry.stage),
      entries: 1,
      lastAt: entry.at,
      state: "idle",
    });
  }
  const list = [...stages.values()].sort((a, b) => a.lastAt - b.lastAt);
  for (const stage of list) {
    const open = entries.some(
      (entry) => entry.stage === stage.stage && isOpenEntry(entry),
    );
    stage.state = open ? "active" : "done";
  }
  if (list.length && live) {
    const latest = list[list.length - 1];
    if (latest.state !== "active") latest.state = "active";
  }
  return list;
}

export function formatClock(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}`;
}

export function formatCount(value: number | null): string {
  if (value === null) return "Unknown";
  return value.toLocaleString("en-US");
}

export function formatTokens(value: number | null): string {
  if (value === null) return "Unknown";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

/** Exact reported subtotals; unknown and zero stay distinct. */
export function formatUsage(usage: TraceUsageSummary): {
  tokens: string;
  cost: string;
  responses: string;
} {
  const parts = [
    usage.inputTokens !== null ? `${formatTokens(usage.inputTokens)} in` : null,
    usage.outputTokens !== null
      ? `${formatTokens(usage.outputTokens)} out`
      : null,
  ].filter(Boolean);
  const costParts = [];
  if (usage.cost.actual !== null)
    costParts.push(`$${Number(usage.cost.actual).toFixed(4)} actual`);
  if (usage.cost.estimated !== null)
    costParts.push(`$${Number(usage.cost.estimated).toFixed(4)} estimated`);
  if (usage.cost.unreportedCount > 0)
    costParts.push(`${usage.cost.unreportedCount} unreported`);
  return {
    tokens: parts.length ? parts.join(" · ") : "Usage unknown",
    cost: costParts.length ? costParts.join(" · ") : "Cost unknown",
    responses:
      usage.responses === 0
        ? "No responses yet"
        : usage.unknownResponses > 0
          ? `${usage.responses} response${
              usage.responses === 1 ? "" : "s"
            }, ${usage.unknownResponses} without usage`
          : `${usage.responses} response${usage.responses === 1 ? "" : "s"}`,
  };
}

export function recordingLabel(
  recording: GenerationActivityRecording,
  live: boolean,
): { label: string; tone: "live" | "muted" | "warning" | "error" } {
  switch (recording) {
    case "recording":
      return { label: live ? "Recording" : "Not finalized", tone: "live" };
    case "complete":
      return { label: "Recording complete", tone: "muted" };
    case "incomplete":
      return { label: "Recording incomplete", tone: "warning" };
    case "expired":
      return { label: "Expired after retention", tone: "muted" };
    case "not_recorded":
      return { label: "Not recorded", tone: "muted" };
    default:
      return { label: "Not enabled", tone: "muted" };
  }
}

/** Heartbeat warnings are about the producer, never a generation verdict. */
export function heartbeatNotice(
  page: GenerationActivityPage,
  now: number,
): string | null {
  if (page.recording !== "recording") return null;
  if (page.lastHeartbeatAt === null)
    return "Waiting for the first producer signal.";
  // Compare server receipt times so client clock skew cannot shift the warning.
  const reference =
    typeof page.observedAt === "number" && page.observedAt > 0
      ? page.observedAt
      : now;
  const silence = Math.max(0, reference - page.lastHeartbeatAt);
  if (silence > 60_000) return "Activity may be incomplete: no signal for over a minute.";
  if (silence > 30_000) return "No recent activity signal.";
  return null;
}

export function selectedEvent(
  events: StoredTraceEvent[],
  id: string | null,
): StoredTraceEvent | null {
  if (!id) return null;
  return events.find((event) => event.eventId === id) ?? null;
}
