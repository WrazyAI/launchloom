import { useEffect, useState } from "react";
import type { AttemptSummary } from "../lib/admin-contracts";
import { generationHeroUrl } from "./format";

type CaptureAttempt = Pick<
  AttemptSummary,
  | "attemptId"
  | "issueNumber"
  | "clientName"
  | "clientId"
  | "profile"
  | "runId"
  | "runAttempt"
  | "executionStatus"
  | "deliveryStatus"
  | "previewUrl"
  | "updatedAt"
>;

export function generationCaptureSrc(attempt: CaptureAttempt): string | null {
  const hero = generationHeroUrl(attempt);
  // A live candidate can be replaced between polling passes.
  return hero
    ? `${hero}&v=${encodeURIComponent(String(attempt.updatedAt ?? 0))}`
    : null;
}

export function GenerationPreview({
  attempt,
  large = false,
  className = "",
  onCaptureLoad,
}: {
  attempt: CaptureAttempt;
  large?: boolean;
  className?: string;
  onCaptureLoad?: (src: string | null) => void;
}) {
  const src = generationCaptureSrc(attempt);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const client = attempt.clientName || attempt.clientId || "unlinked client";
  const label = `attempt ${attempt.attemptId}, ${client}`;

  if (!src || failed) {
    return (
      <span
        className={`admin-preview__placeholder${large ? " admin-preview__placeholder--large" : ""} ${className}`.trim()}
        role="img"
        aria-label={`Preview not captured for ${label}`}
      >
        Preview not captured
      </span>
    );
  }

  return (
    <img
      className={className || undefined}
      src={src}
      alt={`Generation screenshot for ${label}`}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => onCaptureLoad?.(src)}
      onError={() => {
        setFailed(true);
        onCaptureLoad?.(null);
      }}
    />
  );
}
