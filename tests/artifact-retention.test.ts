import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string) =>
  readFileSync(
    new URL(`../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );

describe("GitHub Actions artifact retention", () => {
  it("keeps only one short-lived, failure-only generation bundle", () => {
    const workflow = readWorkflow("generate-client.yml");
    const uploads = workflow.match(/uses: actions\/upload-artifact@v4/g) || [];
    const diagnosticsIndex = workflow.indexOf(
      "name: Preserve compact generation failure diagnostics",
    );
    const diagnostics = workflow.slice(diagnosticsIndex);

    expect(uploads).toHaveLength(1);
    expect(diagnosticsIndex).toBeGreaterThan(-1);
    expect(diagnostics).toContain("if: failure()");
    expect(diagnostics).toContain("continue-on-error: true");
    expect(diagnostics).toContain("retention-days: 3");
    expect(diagnostics).toContain("/tmp/seo-research.json");
    expect(diagnostics).toContain("/tmp/inspiration-pack.json");
    expect(diagnostics).toContain("/tmp/reasoning-preflight.json");
    expect(diagnostics).toContain("/tmp/generated-experiences");
    expect(diagnostics).not.toContain("public/images/generated");
    expect(diagnostics).not.toContain("initial-screenshots");
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
