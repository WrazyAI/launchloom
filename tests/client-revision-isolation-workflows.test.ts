import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPaths = [
  ".github/workflows/generate-client.yml",
  ".github/workflows/repair-creative-candidate.yml",
  ".github/workflows/process-feedback.yml",
  ".github/workflows/process-client-feedback.yml",
  ".github/workflows/publish-site.yml",
];

function jobLevelEnvironment(source: string) {
  const jobsStart = source.indexOf("jobs:");
  const stepsStart = source.indexOf("    steps:", jobsStart);
  const jobSection = source.slice(
    jobsStart,
    stepsStart < 0 ? undefined : stepsStart,
  );
  const match = jobSection.match(/^    env:\n((?:      [^\n]*\n)+)/mu);
  return match?.[1] || "";
}

describe("client build and revision workflow isolation", () => {
  it("keeps workflow credentials step-scoped rather than job-scoped", () => {
    for (const workflowPath of workflowPaths) {
      const source = readFileSync(workflowPath, "utf8");
      expect(jobLevelEnvironment(source), workflowPath).not.toMatch(
        /secrets\./u,
      );
      expect(source, workflowPath).toContain("persist-credentials: false");
      expect(source, workflowPath).toContain(
        'chmod 700 "$LAUNCHLOOM_PRIVATE_DIR"',
      );
      expect(source, workflowPath).toContain("LAUNCHLOOM_PRIVATE_DIR");
    }
  });

  it("routes every client npm build and browser verifier through the isolation runner", () => {
    for (const workflowPath of workflowPaths) {
      const source = readFileSync(workflowPath, "utf8");
      const lines = source.split("\n");
      for (const line of lines) {
        if (
          /npm run build|verify-rendered-revision\.mjs|verify-creative-diagnostic\.mjs/u.test(
            line,
          )
        )
          expect(line, `${workflowPath}: ${line.trim()}`).toContain(
            "run-isolated-client-command.mjs",
          );
      }
      expect(source, workflowPath).not.toMatch(
        /npm ci --prefix ["']?\$CLIENT_DIR/u,
      );
      expect(source, workflowPath).toContain(
        "LAUNCHLOOM_CLIENT_PROCESS_ISOLATION: required",
      );
      expect(source, workflowPath).toContain("prepare-client-build-copy.mjs");
      expect(source, workflowPath).not.toMatch(
        /\/tmp\/(?:intake|site\.config|generated-experiences)/u,
      );
    }
  });

  it("does not persist GitHub credentials in client remotes", () => {
    for (const workflowPath of workflowPaths) {
      const source = readFileSync(workflowPath, "utf8");
      expect(source, workflowPath).not.toMatch(
        /https:\/\/x-access-token:[^\s"']+@github\.com/u,
      );
      expect(source, workflowPath).not.toMatch(
        /git remote set-url[^\n]*x-access-token/u,
      );
    }
  });
});
