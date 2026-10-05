import * as qaModule from "../scripts/internal-qa-intake.mjs";
import fs from "node:fs";
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
const reusedCandidate = {
  config: {
    demoNotice: "Fictional pipeline demo",
    business: {
      name: intake.businessName,
      email: options.recipient,
      leadEmail: options.recipient,
    },
  },
  brief: {
    demoNotice: "Fictional pipeline demo",
    submissionId: intake.submissionId,
    businessTruth: {
      name: intake.businessName,
      previewEmail: options.recipient,
      leadEmail: options.recipient,
    },
  },
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
  it("recovers the same frozen fictional QA site without retargeting its saved recipient", () => {
    expect(() =>
      prepareInternalQaIntake(body, {
        ...options,
        reuseCandidates: true,
        reusedCandidate,
      }),
    ).not.toThrow();
  });
  it.each(["recipient", "identity", "submission", "fictional"])(
    "rejects mismatched frozen QA %s before recovery",
    (kind) => {
      const wrong = structuredClone(reusedCandidate);
      if (kind === "recipient")
        wrong.config.business.leadEmail = "other@example.com";
      if (kind === "identity") wrong.config.business.name = "Another business";
      if (kind === "submission") wrong.brief.submissionId = "demo-other";
      if (kind === "fictional") wrong.config.demoNotice = "";
      expect(() =>
        prepareInternalQaIntake(body, {
          ...options,
          reuseCandidates: true,
          reusedCandidate: wrong,
        }),
      ).toThrow();
    },
  );
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


describe("QA experiment preconditions", () => {
  it("requires verified fictional preview-only frozen reuse and never enables itself", () => {
    const guard = (qaModule as any).assertQaRepairExperiment;
    expect(guard).toBeTypeOf("function");
    expect(() => guard(false, {})).not.toThrow();
    expect(() => guard(true, options)).toThrow();
    expect(() => guard(true, { ...options, reuseCandidates: true, reusedCandidate })).not.toThrow();
    expect(() => guard(true, { ...options, enabled: false, reuseCandidates: true, reusedCandidate })).toThrow();
    expect(() => guard(true, { ...options, previewOnly: false, reuseCandidates: true, reusedCandidate })).toThrow();
    expect(() => guard(true, { ...options, reuseCandidates: true, reusedCandidate: { ...reusedCandidate, config: { ...reusedCandidate.config, demoNotice: "" } } })).toThrow();
  });
  it("workflow passes only the explicit QA experiment flag to a one-cycle renderer", () => {
    const source = fs.readFileSync(".github/workflows/generate-client.yml", "utf8");
    expect(source).toContain("qa_repair_experiment:");
    expect(source).toContain("QA_REPAIR_EXPERIMENT:");
    expect(source).toContain('REPAIR_ARGS=(--max-cycles 1 --qa-repair-experiment true)');
  });
});

it("experiment reuses frozen assets without any contextual asset regeneration", () => {
  const source = fs.readFileSync(".github/workflows/generate-client.yml", "utf8");
  expect(source).toContain('if [ "$QA_REPAIR_EXPERIMENT" = "true" ]; then');
  expect(source).toContain('Frozen QA contextual assets retained; provider asset generation skipped.');
  const step = source.slice(source.indexOf('- name: Generate or reuse contextual imagery'), source.indexOf('- name: Author independent experience candidates'));
  expect(step.indexOf('Frozen QA contextual assets retained')).toBeLessThan(step.indexOf('generate-contextual-assets.mjs'));
});

it("stages and restores contextual assets from the same frozen source as candidate validation", () => {
  const source = fs.readFileSync(".github/workflows/generate-client.yml", "utf8");
  const setup = source.slice(source.indexOf('if [ "$REUSE_AUTHORED_CANDIDATES" = "true" ]; then'), source.indexOf('- name: Reserve inspiration routes'));
  expect(setup).toContain('cp "$CANDIDATE_SOURCE/.launchloom/generated-assets.json" "$RUNNER_TEMP/frozen-qa-assets/manifest.json"');
  expect(setup).toContain('cp -R "$CANDIDATE_SOURCE/public/images/generated/." "$RUNNER_TEMP/frozen-qa-assets/images/"');
  const step = source.slice(source.indexOf('- name: Generate or reuse contextual imagery'), source.indexOf('- name: Author independent experience candidates'));
  expect(step).toContain('cp "$RUNNER_TEMP/frozen-qa-assets/manifest.json" .launchloom/generated-assets.json');
  expect(step).toContain('cp -R "$RUNNER_TEMP/frozen-qa-assets/images/." public/images/generated/');
});
