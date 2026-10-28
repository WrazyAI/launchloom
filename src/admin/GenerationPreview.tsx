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
    | "issueNumber"
    | "clientName"
    | "clientId"
    | "profile"
    | "runId"
    | "runAttempt"
  >;
  large?: boolean;
  className?: string;
}) {
  const src = generationHeroUrl(attempt);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = attempt.clientName || attempt.clientId || "unlinked client";

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
