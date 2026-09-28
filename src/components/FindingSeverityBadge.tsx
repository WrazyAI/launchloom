import { findingSeverityPresentation } from "../lib/finding-severity";

type Props = { severity: string };

export function FindingSeverityBadge({ severity }: Props) {
  const presentation = findingSeverityPresentation(severity);
  return (
    <span
      className={`finding-severity finding-severity--${presentation.tone}`}
      aria-label={presentation.accessibleLabel}
    >
      {presentation.label}
    </span>
  );
}
