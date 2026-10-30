import { useEffect, useState } from "react";
import type { AttemptSummary } from "../lib/admin-contracts";
import { generationHeroUrl } from "./format";

export function GenerationPreview({
  attempt,
  large = false,
  className = "",
}: {
  attempt: Pick<
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
  large?: boolean;
  className?: string;
}) {
  const hero = generationHeroUrl(attempt);
  // The live candidate image can be replaced between polling passes without a
  // new attempt id. Version the URL so the browser fetches the newest capture.
  const src = hero
    ? `${hero}&v=${encodeURIComponent(String(attempt.updatedAt ?? 0))}`
    : null;
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
      onError={() => setFailed(true)}
    />
  );
}
