import type {
  OperationCostKind,
  OperationRecord,
  OperationStatus,
} from "../lib/admin-contracts";

export type OperationStatusTone =
  "waiting" | "running" | "attention" | "failed" | "cancelled" | "ready";

const STATUS_LABELS: Record<
  OperationStatus,
  { label: string; tone: OperationStatusTone }
> = {
  waiting_to_start: { label: "Waiting to start", tone: "waiting" },
  running: { label: "Running", tone: "running" },
  attention: { label: "Needs attention", tone: "attention" },
  failed: { label: "Failed", tone: "failed" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
  preview_ready: { label: "Verified preview", tone: "ready" },
};

export function operationStatusLabel(status: OperationStatus) {
  return STATUS_LABELS[status] ?? { label: "Unknown", tone: "attention" };
}

export function operationNeedsAttention(record: OperationRecord) {
  return record.status === "attention" || record.status === "failed";
}

function money(value: string | null) {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

/**
 * Reports the recorded cost class without turning a missing or incomplete
 * amount into a fabricated zero. Multiple currencies stay distinct.
 */
export function operationCostLabel(
  record: Pick<OperationRecord, "costKind" | "costs">,
) {
  const kind = record.costKind;
  if (kind === "unreported") return "Unreported";
  const amounts = record.costs
    .map((cost) => {
      const amount = money(kind === "actual" ? cost.actual : cost.estimated);
      if (amount === null) return null;
      const currency = cost.currency ?? "";
      return `${currency} ${amount}`.trim();
    })
    .filter((value): value is string => Boolean(value));
  if (!amounts.length) return kind === "actual" ? "Actual" : "Estimated";
  const incomplete = record.costs.some(
    (cost) =>
      cost.unreportedCount > 0 ||
      cost.incompleteCount > 0 ||
      cost.unknownCoverageCount > 0,
  );
  const label = kind === "actual" ? "Actual" : "Estimated";
  return `${label} ${amounts.join(", ")}${incomplete ? " (incomplete)" : ""}`;
}

export function telemetryLabel(incomplete: boolean) {
  return incomplete ? "Telemetry incomplete" : "Telemetry complete";
}

/** Detail events are capped by the server; never imply a partial list is complete. */
export function eventListLabel(shown: number, total: number) {
  const rendered = Number.isSafeInteger(shown) && shown > 0 ? shown : 0;
  const recorded = Number.isSafeInteger(total) && total > 0 ? total : 0;
  return `Showing ${rendered} of ${recorded} events`;
}

export function operationSummary(records: OperationRecord[]) {
  return {
    attention: records.filter(operationNeedsAttention).length,
    previewReady: records.filter((record) => record.status === "preview_ready")
      .length,
    waiting: records.filter((record) => record.status === "waiting_to_start")
      .length,
    incompleteTelemetry: records.filter((record) => record.telemetryIncomplete)
      .length,
  };
}

export function operationSourceLabel(source: "operations" | "legacy") {
  return source === "operations" ? "Current operations" : "Sites (read-only)";
}

const MAX_CURSOR_TRAIL = 50;

export function pushCursorTrail(trail: string[], cursor: string | null) {
  if (!cursor) return trail;
  return [...trail, cursor].slice(-MAX_CURSOR_TRAIL);
}

export function popCursorTrail(trail: string[]) {
  if (!trail.length) return { cursor: null, trail: [] as string[] };
  return {
    cursor: trail[trail.length - 1] ?? null,
    trail: trail.slice(0, -1),
  };
}

export function costKindLabel(kind: OperationCostKind) {
  return kind === "actual"
    ? "Actual"
    : kind === "estimated"
      ? "Estimated"
      : "Unreported";
}
