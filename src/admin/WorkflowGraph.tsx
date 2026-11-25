import { useId, useLayoutEffect, useRef, useState } from "react";
import type {
  ClientWorkflow,
  DeliveryStatus,
  WorkflowStage,
} from "../lib/admin-contracts";
import { activityStageLabel } from "./generation-activity-format";

export type VisualStageStatus = {
  label: string;
  glyph: string;
  tone: "success" | "failure" | "attention" | "running" | "neutral";
};

const LABELS: Record<string, string> = {
  profile_policy: "Run policy",
  renderer_policy: "Renderer",
  intake_handoff_check: "Handoff check",
  setup: "Environment",
  seo_research: "SEO research",
  seo_telemetry: "SEO reporting",
  inspiration_selection: "References",
  client_repo: "Client workspace",
  review_branch: "Review branch",
  pack_select: "Pack choice",
  foundation_select: "Foundation choice",
  authored_evidence: "Evidence",
  creative_render: "Creative render",
  diagnostic_preview: "Diagnostic preview",
  preview_deploy: "Preview deploy",
  workflow: "Run failure",
  preview_verification: "Preview check",
  preview_ready: "Preview delivery",
  review_link: "Review link",
};

const DEPENDENCIES: Record<string, string[]> = {
  profile_policy: [],
  renderer_policy: ["profile_policy"],
  seo_research: ["intake"],
  workflow: ["handoff"],
  setup: ["renderer_policy", "intake_handoff_check"],
  intake_handoff_check: ["profile_policy"],
  intake: ["setup"],
  seo_telemetry: ["intake"],
  inspiration_selection: ["seo_telemetry"],
  reference_analysis: ["inspiration_selection"],
  client_repo: ["reference_analysis", "seo_telemetry"],
  review_branch: ["client_repo"],
  imagery: ["review_branch"],
  pack_select: ["imagery"],
  foundation_select: ["imagery"],
  authoring: ["imagery"],
  authored_evidence: ["authoring"],
  creative_render: ["authored_evidence"],
  diagnostic_preview: ["creative_render"],
  preview_deploy: ["pack_select", "foundation_select", "creative_render"],
  preview_verification: ["preview_deploy"],
  preview_ready: ["preview_verification"],
  review_link: ["preview_verification"],
  handoff: ["review_link", "preview_ready"],
};

const ALIASES: Record<string, string> = {
  seo_telemetry: "seo_research",
  seo_research: "seo_telemetry",
};

const ORDER = [
  "profile_policy",
  "renderer_policy",
  "intake_handoff_check",
  "setup",
  "intake",
  "seo_telemetry",
  "inspiration_selection",
  "reference_analysis",
  "client_repo",
  "review_branch",
  "imagery",
  "pack_select",
  "foundation_select",
  "authoring",
  "authored_evidence",
  "creative_render",
  "diagnostic_preview",
  "preview_deploy",
  "preview_verification",
  "preview_ready",
  "review_link",
  "handoff",
];

export function stageLabel(stage: string) {
  return LABELS[stage] ?? activityStageLabel(stage) ?? "Stage";
}

export function stageStatus(
  status: string,
  active: boolean,
  stage?: string,
  delivery?: DeliveryStatus,
): VisualStageStatus {
  if (stage === "preview_ready" && status === "completed") {
    if (delivery === "preview_ready" || delivery === "published")
      status = "completed";
    else if (delivery === "attention" || delivery === "diagnostic")
      status = "warning";
  }
  switch (status) {
    case "completed":
    case "succeeded":
    case "passed":
      return { label: "Passed", glyph: "✓", tone: "success" };
    case "failed":
    case "error":
      return { label: "Failed", glyph: "✕", tone: "failure" };
    case "started":
    case "running":
      return active
        ? { label: "Running", glyph: "›", tone: "running" }
        : { label: "Unconfirmed", glyph: "?", tone: "neutral" };
    case "skipped":
      return { label: "Skipped", glyph: "–", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", glyph: "–", tone: "neutral" };
    case "warning":
    case "recorded-incomplete":
      return { label: "Review", glyph: "!", tone: "attention" };
    default:
      return { label: "Recorded", glyph: "·", tone: "neutral" };
  }
}

export function withFailure(
  stages: WorkflowStage[],
  failure: string | null,
): WorkflowStage[] {
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

/** Verified stages keep their recorded lifecycle order; legacy telemetry keeps arrival order. */
export function orderedStages(stages: WorkflowStage[]) {
  if (!stages.some((item) => item.verified)) return stages;
  return [...stages].sort((a, b) => {
    const position = (stage: string) => {
      if (stage === "seo_research") return ORDER.indexOf("seo_telemetry") - 0.5;
      if (stage === "preview_ready")
        return ORDER.indexOf("preview_verification") + 0.5;
      const index = ORDER.indexOf(stage);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return position(a.stage) - position(b.stage);
  });
}

export function workflowStages(workflow: ClientWorkflow) {
  return orderedStages(
    withFailure(
      workflow.stages,
      workflow.executionStatus === "failed" ? workflow.failureStage : null,
    ),
  );
}

export function workflowState(workflow: ClientWorkflow | null | undefined) {
  if (!workflow)
    return {
      tone: "neutral" as const,
      headline: workflow === null ? "No workflow yet" : "Workflow unavailable",
      detail:
        workflow === null
          ? "Open to review this intake."
          : "Run history could not be loaded.",
    };
  const stages = workflowStages(workflow);
  const failure = stages.find((item) => item.status === "failed");
  const passed = stages.filter((item) => item.status === "completed").length;
  if (failure)
    return {
      tone: "failure" as const,
      headline:
        failure.stage === "workflow"
          ? "Run failed"
          : `${stageLabel(failure.stage)} failed`,
      detail: `${passed} of ${stages.length} stages passed`,
    };
  if (
    workflow.executionStatus === "running" ||
    workflow.executionStatus === "queued"
  ) {
    const current = stages.findLast((item) => item.status === "started");
    return {
      tone: "running" as const,
      headline: current
        ? `${stageLabel(current.stage)} running`
        : "Run starting",
      detail: `${passed} of ${stages.length} stages passed`,
    };
  }
  if (workflow.executionStatus === "cancelled")
    return {
      tone: "neutral" as const,
      headline: "Run cancelled",
      detail: `${passed} of ${stages.length} stages passed`,
    };
  if (workflow.executionStatus === "unknown")
    return {
      tone: "attention" as const,
      headline: "Outcome unknown",
      detail: `${passed} of ${stages.length} stages recorded`,
    };
  return {
    tone: "success" as const,
    headline: stages.some((item) => item.status === "skipped")
      ? "Passed, with skipped stages"
      : "All recorded stages passed",
    detail: `${passed} of ${stages.length} passed`,
  };
}

type Placed = {
  stage: WorkflowStage;
  x: number;
  y: number;
  depth: number;
  row: number;
  key: string;
};

const NODE_H = 72;
const PAD = 28;
const ROW_GAP = 36;

function layout(stages: WorkflowStage[], width: number) {
  const visibleSet = new Set(stages.map((item) => item.stage));
  const ancestorsOf = (
    stage: string,
    visiting = new Set<string>(),
  ): string[] => {
    if (visiting.has(stage)) return [];
    visiting.add(stage);
    const found: string[] = [];
    for (const dependency of DEPENDENCIES[stage] ?? []) {
      const alias = ALIASES[dependency];
      if (visibleSet.has(dependency)) found.push(dependency);
      else if (alias && visibleSet.has(alias)) found.push(alias);
      else found.push(...ancestorsOf(dependency, visiting));
    }
    return found;
  };
  const depths = new Map<string, number>();
  const depthOf = (stage: string, visiting = new Set<string>()): number => {
    if (depths.has(stage)) return depths.get(stage)!;
    if (visiting.has(stage)) return 0;
    visiting.add(stage);
    const parents = ancestorsOf(stage);
    const depth = parents.length
      ? Math.max(...parents.map((p) => depthOf(p, new Set(visiting)))) + 1
      : 0;
    depths.set(stage, depth);
    return depth;
  };
  const columnGap = 20;
  const available = Math.max(0, width - PAD * 2);
  const columns = Math.max(
    1,
    Math.min(3, Math.floor((available + columnGap) / 204)),
  );
  const byDepth = new Map<number, Placed[]>();
  const placed: Placed[] = [];
  let previousDepth = -1;
  for (const stage of stages) {
    const d = Object.hasOwn(DEPENDENCIES, stage.stage)
      ? depthOf(stage.stage)
      : previousDepth + 1;
    previousDepth = d;
    depths.set(stage.stage, d);
    const item: Placed = {
      stage,
      depth: d,
      row: 0,
      key: stage.stage,
      x: 0,
      y: 0,
    };
    byDepth.set(d, [...(byDepth.get(d) ?? []), item]);
    placed.push(item);
  }
  const widestRow = Math.min(
    columns,
    Math.max(1, ...[...byDepth.values()].map((row) => row.length)),
  );
  const nodeWidth = Math.min(
    300,
    (available - (widestRow - 1) * columnGap) / widestRow,
  );
  let row = 0;
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const siblings = byDepth.get(depth)!;
    // Finish every sibling row before advancing to the next pipeline depth.
    for (let start = 0; start < siblings.length; start += columns) {
      const items = siblings.slice(start, start + columns);
      const rowWidth =
        items.length * nodeWidth + (items.length - 1) * columnGap;
      items.forEach((item, index) => {
        item.row = row;
        item.x = (width - rowWidth) / 2 + index * (nodeWidth + columnGap);
        item.y = PAD + row * (NODE_H + ROW_GAP);
      });
      row += 1;
    }
  }
  return {
    placed,
    nodeWidth,
    height: Math.max(120, PAD * 2 + row * (NODE_H + ROW_GAP) - ROW_GAP),
  };
}

function nearestVisibleAncestors(
  stage: string,
  byStage: Map<string, Placed>,
  visited = new Set<string>(),
): Placed[] {
  if (visited.has(stage)) return [];
  visited.add(stage);
  const found: Placed[] = [];
  for (const candidate of DEPENDENCIES[stage] ?? []) {
    const hit = byStage.get(candidate) ?? byStage.get(ALIASES[candidate]);
    if (hit) found.push(hit);
    else found.push(...nearestVisibleAncestors(candidate, byStage, visited));
  }
  return found;
}

export type WorkflowGraphProps = {
  stages: WorkflowStage[];
  active: boolean;
  delivery: DeliveryStatus;
  selected: string | null;
  onSelect: (stage: string) => void;
  following?: boolean;
  onFollowingChange?: (following: boolean) => void;
  label?: string;
};

export function WorkflowGraph({
  stages,
  active,
  delivery,
  selected,
  onSelect,
  following = true,
  onFollowingChange,
  label = "Workflow graph",
}: WorkflowGraphProps) {
  const markerId = `flow-arrow-${useId().replace(/[^a-zA-Z0-9-]/gu, "")}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const followedViewport = useRef({ width: 0, height: 0 });
  const [width, setWidth] = useState(560);
  const [viewportHeight, setViewportHeight] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      setWidth(Math.max(0, host.clientWidth - 20));
      setViewportHeight(host.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const chart = layout(stages, width);
  const progress = stages
    .map((stage) => `${stage.stage}:${stage.status}`)
    .join("|");
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host && following)
      host.scrollTop = host.scrollHeight - host.clientHeight;
    if (host)
      followedViewport.current = {
        width: host.clientWidth,
        height: host.clientHeight,
      };
  }, [following, chart.height, width, viewportHeight, progress]);
  const byStage = new Map(chart.placed.map((item) => [item.stage.stage, item]));
  const edges = chart.placed.flatMap((item, index) => {
    const parents = new Map<string, Placed>();
    for (const dependency of DEPENDENCIES[item.stage.stage] ?? []) {
      const direct =
        byStage.get(dependency) ?? byStage.get(ALIASES[dependency]);
      const ancestors = direct
        ? [direct]
        : nearestVisibleAncestors(dependency, byStage);
      for (const parent of ancestors)
        if (parent.key !== item.key) parents.set(parent.key, parent);
    }
    if (!Object.hasOwn(DEPENDENCIES, item.stage.stage)) {
      const previous = chart.placed[index - 1];
      if (previous) parents.set(previous.key, previous);
    }
    return [...parents.values()].map((parent) => {
      const x1 = parent.x + chart.nodeWidth / 2;
      const y1 = parent.y + NODE_H;
      const x2 = item.x + chart.nodeWidth / 2;
      const y2 = item.y;
      // Long connections use the side gutter, never the intervening cards.
      const lane = x1 + x2 < width ? 10 : width - 10;
      const path =
        item.row - parent.row > 1
          ? `M ${x1} ${y1} C ${x1} ${y1 + 18}, ${lane} ${y1 + 18}, ${lane} ${y1 + 26} L ${lane} ${y2 - 26} C ${lane} ${y2 - 18}, ${x2} ${y2 - 18}, ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1} ${y1 + ROW_GAP / 2}, ${x2} ${y2 - ROW_GAP / 2}, ${x2} ${y2}`;
      return {
        key: `${parent.key}->${item.key}`,
        path,
      };
    });
  });
  return (
    <div className="flow-frame">
      <div className="flow-toolbar">
        <span aria-live="polite">
          {following ? "Auto-scroll on" : "Paused for inspection"}
        </span>
        <button
          type="button"
          className="flow-follow"
          aria-pressed={following}
          onClick={() => onFollowingChange?.(!following)}
        >
          <span aria-hidden="true">↓</span> Follow latest
        </button>
      </div>
      <div
        className="flow-shell"
        ref={hostRef}
        data-flow-canvas
        data-orientation="vertical"
        role="region"
        aria-label={`${label} scroll area`}
        tabIndex={0}
        onScroll={(event) => {
          const host = event.currentTarget;
          if (
            following &&
            host.clientWidth === followedViewport.current.width &&
            host.clientHeight === followedViewport.current.height &&
            host.scrollHeight - host.clientHeight - host.scrollTop > 24
          )
            onFollowingChange?.(false);
        }}
      >
        <div className="flow-content" style={{ width, height: chart.height }}>
          <svg
            className="flow-edges"
            data-orientation="vertical"
            width={width}
            height={chart.height}
            viewBox={`0 0 ${width} ${chart.height}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" className="flow-arrowhead" />
              </marker>
            </defs>
            {edges.map((edge) => (
              <path
                key={edge.key}
                d={edge.path}
                className="flow-edge"
                markerEnd={`url(#${markerId})`}
              />
            ))}
          </svg>
          <ol
            className="flow-nodes"
            style={{ height: chart.height, width }}
            aria-label={label}
          >
            {chart.placed.map((item) => {
              const state = stageStatus(
                item.stage.status,
                active,
                item.stage.stage,
                delivery,
              );
              return (
                <li
                  key={item.key}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: chart.nodeWidth,
                    height: NODE_H,
                  }}
                >
                  <button
                    type="button"
                    className="flow-node"
                    data-tone={state.tone}
                    data-stage={item.stage.stage}
                    aria-pressed={selected === item.stage.stage}
                    aria-label={`${stageLabel(item.stage.stage)}: ${state.label}`}
                    onClick={() => {
                      onFollowingChange?.(false);
                      onSelect(item.stage.stage);
                    }}
                  >
                    <span className="flow-node__glyph" aria-hidden="true">
                      {state.glyph}
                    </span>
                    <span className="flow-node__copy">
                      <span>{stageLabel(item.stage.stage)}</span>
                      <small>{state.label}</small>
                    </span>
                    <span
                      className="flow-port flow-port--in"
                      aria-hidden="true"
                    />
                    <span
                      className="flow-port flow-port--out"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

export function WorkflowLegend() {
  return (
    <ul className="flow-legend" aria-label="Stage status key">
      {[
        ["success", "Passed"],
        ["failure", "Failed"],
        ["running", "Running"],
        ["neutral", "Skipped or unknown"],
      ].map(([tone, text]) => (
        <li key={tone}>
          <span
            className="flow-legend__dot"
            data-tone={tone}
            aria-hidden="true"
          />
          {text}
        </li>
      ))}
    </ul>
  );
}
