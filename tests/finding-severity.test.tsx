import { describe, expect, it } from "vitest";
import { findingSeverityPresentation } from "../src/lib/finding-severity";

describe("developer finding severity labels", () => {
  it.each([
    ["major", "danger"],
    ["critical", "danger"],
    ["moderate", "warning"],
    ["minor", "caution"],
    ["low", "caution"],
    ["info", "neutral"],
  ])("shows the %s severity with its semantic tone", (severity, tone) => {
    expect(findingSeverityPresentation(severity)).toEqual({
      label: severity,
      tone,
      accessibleLabel: `Severity: ${severity}`,
    });
  });
});
