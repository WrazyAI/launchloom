import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string) =>
  readFileSync(
    new URL(`../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );

describe("GitHub Actions artifact retention", () => {
  it("keeps generated client diagnostics out of public Actions artifacts", () => {
    const workflow = readWorkflow("generate-client.yml");
    const uploads = workflow.match(/uses: actions\/upload-artifact@v4/g) || [];
    expect(uploads).toHaveLength(0);
    expect(workflow).toContain("Preserve failed creative review evidence");
    expect(workflow).toContain(".launchloom/creative-repair");
  });

  it("uploads revision evidence only after failures and expires it quickly", () => {
    for (const name of [
      "process-feedback.yml",
      "process-client-feedback.yml",
    ]) {
      const workflow = readWorkflow(name);
      const uploads =
        workflow.match(/uses: actions\/upload-artifact@v4/g) || [];
      const stepIndex = workflow.indexOf(
        "name: Preserve failed revision evidence",
      );
      const upload = workflow.slice(stepIndex, stepIndex + 900);

      expect(uploads).toHaveLength(1);
      expect(stepIndex).toBeGreaterThan(-1);
      expect(upload).toContain("if: failure()");
      expect(upload).toContain("continue-on-error: true");
      expect(upload).toContain("retention-days: 3");
      expect(upload).toContain("${{ runner.temp }}/revision-screenshots");
      expect(upload).not.toContain(".launchloom/human-revision");
    }
  });

  it("limits the manual model-review packet to a three-day retention window", () => {
    const workflow = readWorkflow("evaluate-models.yml");
    expect(workflow).toContain("retention-days: 3");
    expect(workflow).toContain("continue-on-error: true");
  });
});
