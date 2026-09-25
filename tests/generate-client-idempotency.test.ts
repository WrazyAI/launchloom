import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/generate-client.yml", "utf8");

describe("client generation handoff idempotency", () => {
  it("serializes runs per intake and checks the completion marker before generation", () => {
    expect(workflow).toContain(
      "group: launchloom-intake-${{ github.event.client_payload.issue || inputs.issue || github.run_id }}",
    );
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("intake_handoff_check:");
    expect(workflow).toContain("needs: intake_handoff_check");
    expect(workflow).toContain("launchloom-generation-handoff:complete");
    expect(workflow).toContain("inputs.reuse_authored_candidates");
  });

  it("records completion only after the successful developer email handoff", () => {
    const emailStep = workflow.indexOf("- name: Send developer preview email");
    const markerStep = workflow.indexOf("- name: Mark intake handoff complete");

    expect(emailStep).toBeGreaterThan(-1);
    expect(markerStep).toBeGreaterThan(emailStep);
    expect(workflow.slice(markerStep)).toContain('gh issue comment "$ISSUE"');
  });
});
