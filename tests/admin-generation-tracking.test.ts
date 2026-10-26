import { describe, expect, it } from "vitest";
import * as contract from "../scripts/generation-tracking-contract.mjs";
import {
  buildAttemptTrackingPayload,
  buildGenerationTrackingPayload,
} from "../scripts/record-generation-event.mjs";
import { buildPipelineAttemptTracking } from "../scripts/run-pipeline-test.mjs";
import fs from "node:fs/promises";
import YAML from "yaml";

const input = {
  repository: "WrazyAI/launchloom",
  runId: "9001",
  runAttempt: 2,
  profile: "creative-only",
  triggeringActor: "qa-operator",
  executionStatus: "failed",
  deliveryStatus: "diagnostic",
  observedAt: 1000,
};
describe("trusted attempt producer", () => {
  it("redacts prefixed quoted credential keys and entire escaped JSON values in object and serialized details", () => {
    const detail = {
      OPENROUTER_API_KEY: "synthetic-sensitive-value",
      CLOUDFLARE_ACCESS_CLIENT_SECRET:
        'synthetic-before"synthetic-after\\synthetic-tail',
      nested: { AWS_SESSION_TOKEN: "synthetic-nested-value" },
      complete: true,
    };
    const serialized = JSON.stringify(detail);
    const observation = contract.buildAttemptObservation(input);
    for (const value of [detail, serialized]) {
      const [event] = contract.buildAttemptEvents(
        [
          {
            eventKey: "cost:json-redaction",
            stage: "author",
            status: "recorded",
            detail: value,
          },
        ],
        observation,
      );
      expect(event.detail).not.toMatch(
        /synthetic-(?:sensitive|before|after|tail|nested)/,
      );
      expect(JSON.parse(event.detail!)).toMatchObject({ complete: true });
    }
    const clean = contract.redactTrackingText(serialized)!;
    expect(clean).not.toMatch(
      /synthetic-(?:sensitive|before|after|tail|nested)/,
    );
    expect(JSON.parse(clean)).toMatchObject({ complete: true });
  });
  it("rejects reserved outcome keys disguised as unrelated stage events", () => {
    const observation = contract.buildAttemptObservation(input);
    for (const eventKey of ["execution", "delivery"])
      expect(() =>
        contract.buildAttemptEvents(
          [{ eventKey, stage: "author", status: "recorded", observedAt: 2000 }],
          observation,
        ),
      ).toThrow();
  });
  it("records failed focused reports with diagnostic delivery without private report text", () => {
    const payload = buildPipelineAttemptTracking(
      {
        profile: "seo-only",
        verdict: "failed",
        previewDelivered: true,
        startedAt: "2026-10-01T00:00:00Z",
        finishedAt: "2026-10-01T00:01:00Z",
        stages: {
          research: {
            status: "failed",
            error: "private intake text token=secret",
          },
        },
        costs: null,
      },
      {
        GITHUB_RUN_ID: "9001",
        GITHUB_RUN_ATTEMPT: "2",
        GITHUB_REPOSITORY: "WrazyAI/launchloom",
        GITHUB_TRIGGERING_ACTOR: "qa-operator",
      },
      5,
    );
    expect(payload.observation).toMatchObject({
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
      runAttempt: 2,
    });
    expect(JSON.stringify(payload)).not.toContain("private intake");
  });
  it("keeps reconciliation manual/default-dry and uses trusted default-branch code", async () => {
    const yaml = await fs.readFile(
      ".github/workflows/reconcile-generation-history.yml",
      "utf8",
    );
    expect(yaml).toContain("workflow_dispatch:");
    expect(yaml).not.toMatch(/^  (schedule|workflow_run):/mu);
    expect(yaml).toContain("default: true");
    expect(yaml).toContain(
      "!inputs.dry_run && secrets.GENERATION_TRACKING_SECRET",
    );
    expect(yaml).toContain("github.event.repository.default_branch");
    expect(yaml).toContain("actions: read");
    expect(yaml).toContain("contents: read");
    expect(yaml).not.toContain("head_sha");
    for (const name of ["generate-client", "test-generation"]) {
      const source = await fs.readFile(`.github/workflows/${name}.yml`, "utf8");
      expect(source).toContain("run-name:");
      expect(source).toContain("LLGEN issue=");
      expect(source).toContain("GENERATION_TRACKING_SECRET");
    }
    for (const name of [
      "generate-client",
      "test-generation",
      "publish-site",
      "process-client-feedback",
      "process-feedback",
      "reconcile-generation-history",
    ]) {
      const doc = YAML.parseDocument(
        await fs.readFile(`.github/workflows/${name}.yml`, "utf8"),
        { uniqueKeys: true },
      );
      expect(doc.errors).toEqual([]);
      expect(doc.toJS()).toMatchObject({
        on: expect.any(Object),
        jobs: expect.any(Object),
      });
    }
  });
  it("keeps failed execution independent of diagnostic delivery and explicit null associations", () => {
    expect(contract.buildAttemptObservation(input)).toMatchObject({
      ...input,
      requestId: null,
      issueNumber: null,
      attemptId: null,
      source: "callback",
      failure: { summary: null },
    });
  });
  it("rejects roles, invalid identity, unknown profiles and malformed versions", () => {
    for (const change of [
      { role: "admin" },
      { runId: "../1" },
      { runAttempt: 0 },
      { profile: "access-only" },
      { observedAt: NaN },
      { repository: "other/repo" },
      { triggeringActor: "a@b.test" },
    ])
      expect(() =>
        contract.buildAttemptObservation({ ...input, ...change }),
      ).toThrow();
  });
  it("redacts credentials and all signed/private links before wire persistence", () => {
    const value = contract.buildAttemptObservation({
      ...input,
      failure: {
        summary:
          "Bearer abc-secret token=xyz https://private.test/review?token=signing-secret ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        evidenceUrl:
          "https://github.com/WrazyAI/launchloom/actions/runs/9001?token=secret",
      },
    });
    const wire = JSON.stringify(value);
    for (const secret of [
      "abc-secret",
      "xyz",
      "signing-secret",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "?token=",
    ])
      expect(wire).not.toContain(secret);
    expect(value.failure.evidenceUrl).toBeNull();
    expect(
      contract.redactTrackingText(
        '{"api_key":"json-secret", "token": "json-token"}',
      ),
    ).not.toMatch(/json-secret|json-token/);
    expect(
      contract.redactTrackingText(
        "GENERATION_TRACKING_SECRET=hidden-secret OPENROUTER_API_KEY=hidden-key",
      ),
    ).not.toMatch(/hidden-secret|hidden-key/);
  });
  it("records explicit stage transitions and failure context", () => {
    const stagePayload = buildAttemptTrackingPayload({
      "run-id": "9001",
      "run-attempt": "2",
      profile: "full",
      "execution-status": "running",
      "delivery-status": "none",
      "observed-at": "2000",
      "triggering-actor": "qa-operator",
      "request-id": "request-123",
      "attempt-id": "3f2061c4-691a-4d47-ab4d-b90483ea8d9a",
      issue: "184",
      stage: "authoring",
      "stage-status": "started",
      "stage-detail": "Authoring independent candidates.",
    });
    expect(stagePayload?.events).toContainEqual(
      expect.objectContaining({
        eventKey: "stage:authoring:started:2000",
        stage: "authoring",
        status: "started",
        detail: "Authoring independent candidates.",
      }),
    );
    const failurePayload = buildAttemptTrackingPayload({
      "run-id": "9001",
      "run-attempt": "2",
      profile: "full",
      "execution-status": "failed",
      "delivery-status": "none",
      "observed-at": "3000",
      "triggering-actor": "qa-operator",
      issue: "184",
      failure: "Generation workflow stopped before a preview was ready.",
      "failure-stage": "authoring",
      "failure-category": "creative_authoring",
      "failure-next-step": "Inspect the rejected candidate source.",
    });
    expect(failurePayload?.observation.failure).toMatchObject({
      summary: "Generation workflow stopped before a preview was ready.",
      stage: "authoring",
      category: "creative_authoring",
      nextStep: "Inspect the rejected candidate source.",
    });
  });

  it("wires explicit stage events and failure context into the production workflow", async () => {
    const workflow = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(workflow).toContain("scripts/record-generation-stage.mjs");
    for (const stage of [
      "intake",
      "seo_research",
      "inspiration_selection",
      "reference_analysis",
      "client_repo",
      "review_branch",
      "imagery",
      "authoring",
      "authored_evidence",
      "creative_render",
      "diagnostic_preview",
      "preview_deploy",
      "preview_ready",
    ])
      expect(workflow).toContain(`--stage ${stage}`);
    expect(workflow).toContain("--failure-stage");
    expect(workflow).toContain("--failure-category");
    expect(workflow).toContain("--stage-status failed");
  });

  it("uses explicit attempt flags without changing legacy action/status semantics", () => {
    const args = {
      "run-id": "9001",
      "run-attempt": "2",
      profile: "creative-only",
      "execution-status": "failed",
      "delivery-status": "diagnostic",
      "observed-at": "1000",
      "triggering-actor": "qa-operator",
      issue: "5",
      action: "complete",
      status: "attention",
    };
    expect(buildAttemptTrackingPayload(args)?.observation).toMatchObject({
      runId: "9001",
      runAttempt: 2,
      executionStatus: "failed",
      deliveryStatus: "diagnostic",
    });
    expect(buildGenerationTrackingPayload(args).generation).toMatchObject({
      status: "attention",
    });
    expect(
      buildAttemptTrackingPayload({
        issue: "5",
        action: "complete",
        status: "failed",
      }),
    ).toBeNull();
  });
});
