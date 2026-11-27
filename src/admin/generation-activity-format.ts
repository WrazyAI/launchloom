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

export function activityModelOutput(entry: ActivityEntry) {
  const output = entry.evidence.findLast((event) => event.kind === "output");
  if (output) {
    return { kind: "recorded", text: traceText(output.payload.message) } as const;
  }
  const deltas = entry.evidence
    .filter((event) => event.kind === "output_delta")
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap(({ payload: { delta } }) =>
      delta?.kind === "text"
        ? [delta.text]
        : delta ? [`\n[Output withheld: ${delta.reason}]\n`] : [],
    );
  if (!deltas.length) return null;
  return { kind: "preview", text: deltas.join("") } as const;
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
    (Object.hasOwn(STAGE_LABELS, stage) ? STAGE_LABELS[stage] : null) ??
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
    case "task_finished":
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
export function groupActivity(
  events: StoredTraceEvent[],
  includePartial = false,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  const calls = new Map<string, ActivityEntry>();
  const actions = new Map<string, ActivityEntry>();

  for (const event of events) {
    switch (event.kind) {
      case "model_started":
      case "model_finished":
      case "output":
      case "usage":
      case "output_delta": {
        const { callId } = event.payload;
        const started = event.kind === "model_started";
        let entry = calls.get(callId);
        if (!entry) {
          if (!started && !includePartial) break;
          entry = entryFor(
            event,
            "model",
            started ? "Model request" : "Model activity (earlier request not loaded)",
          );
          entry.key = `model:${callId}`;
          entry.callId = callId;
          calls.set(callId, entry);
          entries.push(entry);
        } else {
          if (started && entry.primary.kind !== "model_started") {
            entry.primary = event;
            entry.at = event.receivedAt;
            entry.stage = event.context.stage;
            entry.actorKind = event.context.actor.kind;
            entry.role = event.context.actor.role;
            entry.title = "Model request";
          }
          entry.evidence.push(event);
        }
        if (event.kind === "model_finished")
          entry.status = event.payload.status;
        break;
      }
      case "action_started": {
        const entry = entryFor(event, "action", titleCase(event.payload.name));
        entry.callId = event.payload.actionId;
        actions.set(event.payload.actionId, entry);
        entries.push(entry);
        break;
      }
      case "action_finished": {
        if (event.payload.name === "run_code_changes") break;
        let entry = actions.get(event.payload.actionId);
        if (!entry && event.payload.name === "edit_candidate_files") {
          entry = entryFor(event, "action", titleCase(event.payload.name));
          entry.callId = event.payload.actionId;
          entries.push(entry);
        } else if (entry) {
          entry.evidence.push(event);
        }
        if (!entry) break;
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
    return entries.filter((entry) => ["model", "output"].includes(entry.kind));
  return entries.filter(
    (entry) =>
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
  if (silence > 60_000)
    return "Activity may be incomplete: no signal for over a minute.";
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

export function modelDurationSeconds(entry: ActivityEntry): number | null {
  if (entry.kind !== "model") return null;
  const started = entry.evidence.find(
    (event) => event.kind === "model_started",
  );
  const finished = entry.evidence.findLast(
    (event) => event.kind === "model_finished",
  );
  if (started && finished) {
    const startMs = Date.parse(started.emittedAt);
    const endMs = Date.parse(finished.emittedAt);
    if (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      endMs >= startMs
    ) {
      return Math.round((endMs - startMs) / 100) / 10;
    }
  }
  const progress = activityProgress(entry);
  if (progress && progress.elapsedMs > 0) {
    return Math.round(progress.elapsedMs / 100) / 10;
  }
  return null;
}

export function modelReasoningCount(entry: ActivityEntry): {
  tokens: number;
  kind: "reported" | "deltas";
} | null {
  if (entry.kind !== "model") return null;
  const usageEvent = entry.evidence.findLast((event) => event.kind === "usage");
  if (
    usageEvent &&
    usageEvent.kind === "usage" &&
    usageEvent.payload.usage.reasoningTokens !== null &&
    usageEvent.payload.usage.reasoningTokens > 0
  ) {
    return {
      tokens: usageEvent.payload.usage.reasoningTokens,
      kind: "reported",
    };
  }
  const progress = activityProgress(entry);
  if (progress && progress.reasoningTokens > 0) {
    return { tokens: progress.reasoningTokens, kind: "deltas" };
  }
  return null;
}

const CHIP_FIELD_PRIORITY = [
  "path",
  "file",
  "route",
  "command",
  "stage",
  "boundary",
  "target",
  "url",
  "profile",
  "renderer",
];

export function actionChipText(entry: ActivityEntry): string | null {
  const started = entry.evidence.find(
    (event) => event.kind === "action_started",
  );
  const finished = entry.evidence.findLast(
    (event) => event.kind === "action_finished",
  );
  if (finished?.payload.name === "edit_candidate_files")
    return codeChangeTotals(finished.payload.result);
  const fields: Record<string, string | number | boolean | null> = {};
  if (started && started.kind === "action_started") {
    Object.assign(fields, started.payload.input);
  }
  if (finished && finished.kind === "action_finished") {
    Object.assign(fields, finished.payload.result);
  }
  for (const key of CHIP_FIELD_PRIORITY) {
    const val = fields[key];
    if (typeof val === "string" && val.trim()) {
      const cleaned = val.trim();
      return cleaned.length > 44 ? `${cleaned.slice(0, 41)}...` : cleaned;
    }
  }
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === "string" && val.trim()) {
      const cleaned = `${key}: ${val.trim()}`;
      return cleaned.length > 44 ? `${cleaned.slice(0, 41)}...` : cleaned;
    }
  }
  if (
    finished &&
    finished.kind === "action_finished" &&
    finished.payload.durationMs !== null
  ) {
    return finished.payload.durationMs >= 1000
      ? `${(finished.payload.durationMs / 1000).toFixed(1)}s`
      : `${finished.payload.durationMs} ms`;
  }
  return null;
}

export function codeChangeTotals(result: Record<string, unknown>): string | null {
  const { filesChanged, additions, deletions } = result;
  if (
    typeof filesChanged !== "number" || !Number.isSafeInteger(filesChanged) || filesChanged < 0 ||
    typeof additions !== "number" || !Number.isSafeInteger(additions) || additions < 0 ||
    typeof deletions !== "number" || !Number.isSafeInteger(deletions) || deletions < 0
  ) return null;
  return `${formatCount(filesChanged)} ${filesChanged === 1 ? "file" : "files"} · +${formatCount(additions)} −${formatCount(deletions)}`;
}

export function runChangeUrl(result: Record<string, unknown>): string | null {
  const { repository, baseSha, headSha } = result;
  const sha = /^[a-f0-9]{40}$/u;
  if (
    typeof repository !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/u.test(repository) ||
    typeof baseSha !== "string" || !sha.test(baseSha) ||
    typeof headSha !== "string" || !sha.test(headSha)
  ) return null;
  return `https://github.com/${repository}/compare/${baseSha}...${headSha}`;
}

export type ParsedModelOutput =
  | { kind: "prose"; text: string }
  | {
      kind: "json";
      stageTag: string | null;
      summary: string | null;
      keys: string[];
      formatted: string;
      raw: string;
      truncated: boolean;
    };

const SUMMARY_KEYS = [
  "designContract",
  "summary",
  "message",
  "rationale",
  "verdict",
  "finding",
  "reason",
  "headline",
  "title",
  "description",
];

/**
 * Lossless JSON pretty-printer that preserves numeric literals (including
 * 64-bit IDs beyond Number.MAX_SAFE_INTEGER) verbatim without JSON.parse/stringify rounding.
 */
export function formatJsonLossless(source: string): string {
  let out = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indent = (level: number) => "  ".repeat(level);

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      continue;
    }

    if (ch === "{" || ch === "[") {
      // Peek ahead for empty container `{}` or `[]`.
      let j = i + 1;
      while (j < source.length && /\s/u.test(source[j]!)) j += 1;
      const closing = ch === "{" ? "}" : "]";
      if (source[j] === closing) {
        out += `${ch}${closing}`;
        i = j;
        continue;
      }
      depth += 1;
      out += `${ch}\n${indent(depth)}`;
      continue;
    }

    if (ch === "}" || ch === "]") {
      depth = Math.max(0, depth - 1);
      out += `\n${indent(depth)}${ch}`;
      continue;
    }

    if (ch === ",") {
      out += `,\n${indent(depth)}`;
      continue;
    }

    if (ch === ":") {
      out += ": ";
      continue;
    }

    out += ch;
  }

  return out;
}

function looksLikeTruncatedJson(trimmed: string): boolean {
  if (/^\{\s*"(?:\\.|[^"\\])*"\s*:/u.test(trimmed)) return true;
  if (
    /^\[\s*(?:\{\s*"|\[|"(?:\\.|[^"\\])*(?:$|"\s*(?:,|$))|(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\s*,)/u.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

function extractTruncatedKeys(trimmed: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let depth = 0;
  let inString = false;
  let escaped = false;
  let expectKey = false;
  let currentKey = "";
  let capturingKey = false;

  for (let i = 0; i < trimmed.length && keys.length < 8; i += 1) {
    const ch = trimmed[i]!;
    if (inString) {
      if (escaped) {
        if (capturingKey) currentKey += ch;
        escaped = false;
      } else if (ch === "\\") {
        if (capturingKey) currentKey += ch;
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        if (capturingKey) {
          capturingKey = false;
          // Only record if followed by optional whitespace and `:`.
          let j = i + 1;
          while (j < trimmed.length && /\s/u.test(trimmed[j]!)) j += 1;
          if (trimmed[j] === ":" && currentKey && !seen.has(currentKey)) {
            seen.add(currentKey);
            keys.push(currentKey);
          }
          currentKey = "";
          expectKey = false;
        }
      } else if (capturingKey) {
        currentKey += ch;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      if (depth === 1 && expectKey) {
        capturingKey = true;
        currentKey = "";
      }
      continue;
    }

    if (ch === "{") {
      depth += 1;
      if (depth === 1) expectKey = true;
    } else if (ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth = Math.max(0, depth - 1);
      if (depth === 1) expectKey = false;
    } else if (ch === "," && depth === 1) {
      expectKey = true;
    }
  }
  return keys;
}

export function parseModelOutputPreview(raw: string): ParsedModelOutput {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "prose", text: "" };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const formatted = formatJsonLossless(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const keys = Object.keys(record);
        const stageTag =
          typeof record.stage === "string" && record.stage.trim()
            ? record.stage.trim()
            : null;
        let summary: string | null = null;
        for (const key of SUMMARY_KEYS) {
          const candidate = record[key];
          if (typeof candidate === "string" && candidate.trim()) {
            summary = candidate.trim();
            break;
          }
        }
        return {
          kind: "json",
          stageTag,
          summary,
          keys,
          formatted,
          raw: trimmed,
          truncated: false,
        };
      }
      return {
        kind: "json",
        stageTag: null,
        summary: Array.isArray(parsed)
          ? `Structured list (${parsed.length} ${parsed.length === 1 ? "item" : "items"})`
          : null,
        keys: [],
        formatted,
        raw: trimmed,
        truncated: false,
      };
    } catch {
      // Truncated or partial JSON (e.g., mid-stream or server-bounded excerpt):
      // recognize truncated objects/arrays even when stage/summary keys are absent.
      if (looksLikeTruncatedJson(trimmed)) {
        const stageMatch = /"stage"\s*:\s*"([^"]+)"/u.exec(trimmed);
        const contractMatch =
          /"(?:designContract|summary|message|rationale|verdict|finding|reason|headline|title|description)"\s*:\s*"((?:\\.|[^"\\]){12,})/u.exec(
            trimmed,
          );
        const extracted = contractMatch
          ? contractMatch[1].replace(/\\n/gu, " ").replace(/\\"/gu, '"').trim()
          : null;
        return {
          kind: "json",
          stageTag: stageMatch?.[1] ?? null,
          summary: extracted,
          keys: trimmed.startsWith("{") ? extractTruncatedKeys(trimmed) : [],
          formatted: trimmed,
          raw: trimmed,
          truncated: true,
        };
      }
    }
  }
  return { kind: "prose", text: raw };
}
