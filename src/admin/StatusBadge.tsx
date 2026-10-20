import type {
  DeliveryStatus,
  ExecutionStatus,
} from "../lib/admin-contracts";
import { describeAttempt } from "./format";

export type StatusTone =
  | "neutral"
  | "running"
  | "success"
  | "failure"
  | "attention"
  | "delivery";

const EXECUTION_TONES: Record<ExecutionStatus, StatusTone> = {
  queued: "neutral",
  running: "running",
  succeeded: "success",
  failed: "failure",
  cancelled: "neutral",
  skipped: "neutral",
  unknown: "attention",
};

const DELIVERY_TONES: Record<DeliveryStatus, StatusTone> = {
  none: "neutral",
  diagnostic: "attention",
  attention: "failure",
  preview_ready: "running",
  published: "delivery",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <span className={`admin-badge admin-badge--${tone}`} data-tone={tone}>
      {label}
    </span>
  );
}

export function ExecutionStatusBadge({
  status,
  stale = false,
}: {
  status: ExecutionStatus;
  stale?: boolean;
}) {
  const { executionLabel } = describeAttempt({
    executionStatus: status,
    deliveryStatus: "none",
  });
  return (
    <StatusBadge
      label={stale ? `${executionLabel} (stale)` : executionLabel}
      tone={EXECUTION_TONES[status] || "attention"}
    />
  );
}

export function DeliveryStatusBadge({
  status,
}: {
  status: DeliveryStatus;
}) {
  const { deliveryLabel } = describeAttempt({
    executionStatus: "unknown",
    deliveryStatus: status,
  });
  return (
    <StatusBadge
      label={deliveryLabel}
      tone={DELIVERY_TONES[status] || "neutral"}
    />
  );
}

export function StatusStack({
  executionStatus,
  deliveryStatus,
  stale = false,
}: {
  executionStatus: ExecutionStatus;
  deliveryStatus: DeliveryStatus;
  stale?: boolean;
}) {
  return (
    <span className="admin-status-stack">
      <ExecutionStatusBadge status={executionStatus} stale={stale} />
      <DeliveryStatusBadge status={deliveryStatus} />
    </span>
  );
}
