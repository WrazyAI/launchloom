export type FindingSeverityTone = "danger" | "warning" | "caution" | "neutral";

export function findingSeverityPresentation(severity: string): {
  label: string;
  tone: FindingSeverityTone;
  accessibleLabel: string;
} {
  const label = severity.trim().toLowerCase() || "info";
  const tone: FindingSeverityTone = ["critical", "major"].includes(label)
    ? "danger"
    : label === "moderate"
      ? "warning"
      : ["minor", "low"].includes(label)
        ? "caution"
        : "neutral";
  return { label, tone, accessibleLabel: `Severity: ${label}` };
}
