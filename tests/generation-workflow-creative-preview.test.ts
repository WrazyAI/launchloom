import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("creative preview workflow", () => {
  it("uses the selection validator and deploys warned previews", async () => {
    const workflow = await fs.readFile(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(workflow).toContain("validate-creative-preview-selection.mjs");
    expect(workflow).toContain("--bakeoff .launchloom/creative-bakeoff.json");
    expect(workflow).toContain(
      "--gate .launchloom/creative-repair/final/visual-gate.json",
    );
    expect(workflow).not.toContain(
      'selectionMode == "creative-preview" or .design.experience.selectionMode == "creative-bakeoff"',
    );
    expect(workflow).not.toContain(
      'jq -e --arg candidate "$CANDIDATE_ID" \'.selectedCandidateId == $candidate and .fallback == false\'',
    );
    expect(workflow).toContain("generation_delivery=");
    expect(workflow).toContain("generation_warnings=");
    expect((workflow.match(/generation_delivery=/gu) || []).length).toBe(1);
    expect((workflow.match(/generation_warnings=/gu) || []).length).toBe(1);
    expect(workflow).toContain(".launchloom/delivery-warnings.json");
    expect(workflow).toContain("--detail-code preview_with_warnings");
    expect(workflow).toContain(
      'if [ "${{ steps.deploy.outputs.creative_decision }}" = "warned" ]; then STATUS=attention; fi',
    );
    expect(workflow).toContain('data-creative-host="true"');
    expect(workflow).toContain("data-foundation-dossier");
    expect(workflow).toContain("data-experience-pack");
  });
});
