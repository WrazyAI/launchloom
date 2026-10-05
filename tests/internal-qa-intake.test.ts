import { describe, expect, it } from "vitest";
import { prepareInternalQaIntake } from "../scripts/internal-qa-intake.mjs";

const intake = {
  submissionId: "demo-client-readiness",
  confirmAccuracy: "Synthetic demo brief",
  additionalNotes: "Fictional demo only",
  businessName: "Fictional Studio",
  email: "studio@example.test",
  leadEmail: "studio@example.test",
  services: ["Initial consultation"],
  assets: { logo: "owned-logo" },
};
const body = `Private QA intake\n\n\`\`\`json\n${JSON.stringify(intake)}\n\`\`\`\n`;
const options = {
  enabled: true,
  previewOnly: true,
  reuseCandidates: false,
  recipient: "owner@example.com",
};

describe("internal QA intake routing", () => {
  it("leaves normal intake bytes unchanged", () => {
    expect(prepareInternalQaIntake(body, { enabled: false })).toBe(body);
  });
  it("routes only the two email fields in an explicitly fictional fresh preview", () => {
    const result = prepareInternalQaIntake(body, options);
    const match = result.match(/```json\s*([\s\S]*?)```/u)!;
    expect(JSON.parse(match[1]!)).toEqual({
      ...intake,
      email: options.recipient,
      leadEmail: options.recipient,
    });
    expect(result.startsWith("Private QA intake\n\n")).toBe(true);
  });
  it.each([
    { previewOnly: false },
    { reuseCandidates: true },
    { recipient: "" },
    { recipient: "a@example.com\nBcc: other@example.com" },
    { recipient: "one@example.com,two@example.com" },
  ])("rejects an unsafe override before any intake write: %j", (change) => {
    expect(() =>
      prepareInternalQaIntake(body, { ...options, ...change }),
    ).toThrow();
  });
  it("rejects real clients even when the operator requests a QA override", () => {
    const real = body.replace("demo-client-readiness", "real-client");
    expect(() => prepareInternalQaIntake(real, options)).toThrow(/fictional/i);
  });
  it("rejects missing declaration or malformed intake instead of guessing", () => {
    expect(() =>
      prepareInternalQaIntake(
        body.replace("Fictional demo only", "normal"),
        options,
      ),
    ).toThrow();
    expect(() => prepareInternalQaIntake("plain text", options)).toThrow();
  });
});
