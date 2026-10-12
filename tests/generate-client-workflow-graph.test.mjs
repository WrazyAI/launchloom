import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/generate-client.yml", "utf8");
const restore = readFileSync("scripts/restore-generation-stage.sh", "utf8");
const blocks = workflow.split(/^jobs:\s*$/m)[1]?.split(/(?=^  [a-z][a-z_0-9]+:\s*$)/m) ?? [];
const jobs = new Map(
  blocks
    .map((part) => part.match(/^  ([a-z][a-z_0-9]+):\s*\n([\s\S]*)/m))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

describe("client intake workflow graph", () => {
  const ordered = [
    "prepare",
    "image_assets",
    "creative_authoring",
    "rendered_quality",
    "private_preview",
    "developer_handoff",
  ];

  it("exposes real gated work, not visual-only placeholder jobs", () => {
    for (const job of ordered) {
      expect(jobs.has(job), job).toBe(true);
      expect(jobs.get(job), job).toMatch(/- name: /);
      expect(jobs.get(job), job).toContain("runs-on: depot-ubuntu-24.04");
      expect(jobs.get(job), job).toContain("Summarize stage");
    }
  });

  it.each([
    ["image_assets", "prepare"],
    ["creative_authoring", "image_assets"],
    ["rendered_quality", "creative_authoring"],
    ["private_preview", "rendered_quality"],
    ["developer_handoff", "private_preview"],
  ])("requires the preceding stage: %s ← %s", (job, predecessor) => {
    expect(jobs.get(job)).toMatch(new RegExp(`needs: \\[.*\\b${predecessor}\\b.*\\]`));
  });

  it("keeps canary routing and handoff idempotency independent of full generation", () => {
    expect(jobs.get("focused_test")).toContain("test-generation.yml");
    expect(jobs.get("private_preview_access_smoke")).toContain("access-only");
    expect(jobs.get("prepare")).toContain("intake_handoff_check");
    expect(jobs.get("developer_handoff")).toContain("launchloom-generation-handoff:complete");
  });

  it("continues creative recovery on authoring failure and fails closed", () => {
    const quality = jobs.get("rendered_quality");
    expect(quality).toContain("needs.creative_authoring.result == 'failure'");
    expect(quality).toContain("Prepare private creative-recovery report");
    expect(quality).toContain("Build and deploy noindex diagnostic preview");
    expect(quality).toContain("Fail job if AI creative gate was blocked");
    expect(jobs.get("private_preview")).toContain("needs.rendered_quality.result == 'success'");
  });

  it("never places confidential artifacts in a public Actions artifact", () => {
    expect(workflow).not.toContain("actions/upload-artifact");
    expect(restore).toContain("--branch review/initial");
    expect(restore).toContain('EXPECTED_SHA');
    expect(restore).toContain('ACTUAL_SHA');
    for (const job of ["image_assets", "creative_authoring", "rendered_quality", "private_preview", "developer_handoff"]) {
      expect(jobs.get(job), job).toContain('EXPECTED_SHA:');
      expect(jobs.get(job), job).toContain('"$EXPECTED_SHA"');
    }
    expect(restore).toContain(".launchloom/generated-experiences");
    expect(jobs.get("prepare")).toContain("for artifact in reasoning-preflight.json");
    expect(jobs.get("rendered_quality")).toContain("find .launchloom/creative-repair -type f -name '*.json' -print0");
    expect(jobs.get("developer_handoff")).toContain("needs.private_preview.outputs.sha");
  });

  it("has a single terminal failure reporter for every real stage", () => {
    const failures = jobs.get("report_failure");
    expect(failures).toContain("always()");
    for (const job of ordered) {
      expect(failures).toContain(`needs.${job}.result == 'failure'`);
    }
    expect((workflow.match(/- name: Notify developer when generation stops/g) ?? []).length).toBe(1);
  });

  it("has a syntactically valid private stage restore helper", () => {
    const check = spawnSync("bash", ["-n", "scripts/restore-generation-stage.sh"], { encoding: "utf8" });
    expect(check.status, check.stderr).toBe(0);
  });
});
