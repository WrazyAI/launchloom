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
  preview_verification: "Preview check",
  preview_ready: "Preview delivery",
  review_link: "Review link",
};

const DEPENDENCIES: Record<string, string[]> = {
  setup: ["profile_policy"],
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
      headline: `${stageLabel(failure.stage)} failed`,
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
  band: number;
  key: string;
};

const NODE_H = 68;
const PAD = 12;
const BAND_GAP = 20;

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
      if (visibleSet.has(dependency)) found.push(dependency);
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
  const vertical = width < 520;
  const columns = vertical
    ? 1
    : Math.max(2, Math.min(5, Math.floor((width - PAD * 2 + 16) / 132)));
  const nodeWidth = vertical
    ? Math.min(width - PAD * 2, 320)
    : Math.min(
        150,
        Math.max(
          118,
          Math.floor((width - PAD * 2 - (columns - 1) * 26) / columns),
        ),
      );
  const laneGap = 14;
  const byBand = new Map<number, Map<number, Placed[]>>();
  const placed: Placed[] = [];
  for (const stage of stages) {
    const d = visibleSet.has(stage.stage) ? depthOf(stage.stage) : 0;
    const band = Math.floor(d / columns);
    const column = d % columns;
    const lanes = byBand.get(band) ?? new Map<number, Placed[]>();
    byBand.set(band, lanes);
    const item: Placed = {
      stage,
      depth: d,
      band,
      key: stage.stage,
      x: 0,
      y: 0,
    };
    lanes.set(column, [...(lanes.get(column) ?? []), item]);
    placed.push(item);
  }
  const bandHeights = new Map<number, number>();
  for (const [band, columnsMap] of byBand) {
    const lanes = Math.max(1, ...[...columnsMap.values()].map((n) => n.length));
    bandHeights.set(band, lanes * (NODE_H + laneGap));
  }
  const bandTop = new Map<number, number>();
  let top = PAD;
  for (const band of [...bandHeights.keys()].sort((a, b) => a - b)) {
    bandTop.set(band, top);
    top += bandHeights.get(band)! + BAND_GAP;
  }
  const colGap =
    columns > 1
      ? Math.max(22, (width - PAD * 2 - columns * nodeWidth) / (columns - 1))
      : 0;
  for (const item of placed) {
    const column = item.depth % columns;
    const lanes = byBand.get(item.band)?.get(column) ?? [item];
    const lane = lanes.indexOf(item);
    item.x = vertical
      ? (width - nodeWidth) / 2
      : PAD + column * (nodeWidth + colGap);
    item.y = (bandTop.get(item.band) ?? PAD) + lane * (NODE_H + laneGap);
  }
  return {
    placed,
    nodeWidth,
    height: Math.max(120, top - BAND_GAP + PAD),
    bands: bandTop.size,
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
    const hit = byStage.get(candidate);
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
  label?: string;
};

export function WorkflowGraph({
  stages,
  active,
  delivery,
  selected,
  onSelect,
  label = "Workflow graph",
}: WorkflowGraphProps) {
  const markerId = `flow-arrow-${useId().replace(/[^a-zA-Z0-9-]/gu, "")}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setWidth(Math.max(280, host.clientWidth - 20));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const chart = layout(stages, width);
  const byStage = new Map(chart.placed.map((item) => [item.stage.stage, item]));
  const edges = chart.placed.flatMap((item) => {
    const parents = new Map<string, Placed>();
    for (const dependency of DEPENDENCIES[item.stage.stage] ?? []) {
      const direct = byStage.get(dependency);
      const ancestors = direct
        ? [direct]
        : nearestVisibleAncestors(dependency, byStage);
      for (const parent of ancestors)
        if (parent.key !== item.key) parents.set(parent.key, parent);
    }
    const vertical = width < 520;
    return [...parents.values()].map((parent) => {
      if (vertical) {
        const x1 = parent.x + chart.nodeWidth / 2;
        const y1 = parent.y + NODE_H;
        const x2 = item.x + chart.nodeWidth / 2;
        const y2 = item.y;
        const curve = Math.max(14, Math.min(28, (y2 - y1) / 2));
        return {
          key: `${parent.key}->${item.key}`,
          path: `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`,
          wraps: false,
        };
      }
      const x1 = parent.x + chart.nodeWidth;
      const y1 = parent.y + NODE_H / 2;
      const x2 = item.x;
      const y2 = item.y + NODE_H / 2;
      const wraps = x2 <= x1;
      const curve = wraps
        ? Math.max(36, chart.nodeWidth * 0.5)
        : Math.max(24, Math.min(60, (x2 - x1) / 2));
      return {
        key: `${parent.key}->${item.key}`,
        path: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
        wraps,
      };
    });
  });
  return (
    <div className="flow-shell" ref={hostRef} data-flow-canvas>
      <svg
        className="flow-edges"
        data-orientation={width < 520 ? "vertical" : "horizontal"}
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
            className={`flow-edge${edge.wraps ? " flow-edge--wrap" : ""}`}
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
                onClick={() => onSelect(item.stage.stage)}
              >
                <span className="flow-node__glyph" aria-hidden="true">
                  {state.glyph}
                </span>
                <span className="flow-node__copy">
                  <span>{stageLabel(item.stage.stage)}</span>
                  <small>{state.label}</small>
                </span>
                <span className="flow-port flow-port--in" aria-hidden="true" />
                <span className="flow-port flow-port--out" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
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
