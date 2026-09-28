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

function workflowStep(source: string, name: string) {
  const start = source.indexOf(`- name: ${name}`);
  if (start < 0) return "";
  const next = source.indexOf("\n      - name:", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const privateWorkspaceSteps = new Map([
  [
    ".github/workflows/generate-client.yml",
    "Prepare private generation workspace",
  ],
  [
    ".github/workflows/repair-creative-candidate.yml",
    "Prepare private repair workspace",
  ],
  [
    ".github/workflows/process-feedback.yml",
    "Prepare private revision workspace",
  ],
  [
    ".github/workflows/process-client-feedback.yml",
    "Prepare private revision workspace",
  ],
  [
    ".github/workflows/publish-site.yml",
    "Prepare private production workspace",
  ],
]);

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

  it("sets the private workspace from runner environment at step scope", () => {
    for (const [workflowPath, stepName] of privateWorkspaceSteps) {
      const source = readFileSync(workflowPath, "utf8");
      const preparation = workflowStep(source, stepName);
      expect(jobLevelEnvironment(source), workflowPath).not.toContain(
        "LAUNCHLOOM_PRIVATE_DIR:",
      );
      expect(preparation, workflowPath).toContain(
        'LAUNCHLOOM_PRIVATE_DIR="$RUNNER_TEMP/launchloom-private-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
      );
      expect(preparation, workflowPath).toContain(
        'echo "LAUNCHLOOM_PRIVATE_DIR=$LAUNCHLOOM_PRIVATE_DIR" >> "$GITHUB_ENV"',
      );
      expect(preparation, workflowPath).toContain(
        'test "$(stat -c \'%a\' "$LAUNCHLOOM_PRIVATE_DIR")" = 700',
      );
    }
  });

  it("keeps revision failure notices pointed at the private client clone", () => {
    for (const workflowPath of [
      ".github/workflows/process-feedback.yml",
      ".github/workflows/process-client-feedback.yml",
    ]) {
      const source = readFileSync(workflowPath, "utf8");
      expect(source, workflowPath).toContain(
        'process.env.LAUNCHLOOM_PRIVATE_DIR + "/client/src/site.config.json"',
      );
      expect(source, workflowPath).not.toContain(
        'process.env.RUNNER_TEMP + "/client/src/site.config.json"',
      );
    }
  });

  it("provides required tokens and installed Chromium to revision steps", () => {
    const clientFeedback = readFileSync(
      ".github/workflows/process-client-feedback.yml",
      "utf8",
    );
    expect(
      workflowStep(clientFeedback, "Apply pending client feedback"),
    ).toContain("GITHUB_ORG_TOKEN: ${{ secrets.LAUNCHLOOM_GITHUB_ORG_TOKEN }}");
    expect(
      workflowStep(
        clientFeedback,
        "Refine authored creative candidate from client feedback",
      ),
    ).toContain(
      "PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/playwright-browsers",
    );

    const developerFeedback = readFileSync(
      ".github/workflows/process-feedback.yml",
      "utf8",
    );
    expect(
      workflowStep(
        developerFeedback,
        "Refine authored creative candidate from developer feedback",
      ),
    ).toContain(
      "PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/playwright-browsers",
    );
  });

  it("fetches approved client commits from the client repository", () => {
    const publish = readFileSync(".github/workflows/publish-site.yml", "utf8");
    expect(
      workflowStep(publish, "Build and verify approved client site"),
    ).toContain(
      '(cd "$CLIENT_DIR" && bash "$GITHUB_WORKSPACE/scripts/git-with-token.sh" fetch origin "$APPROVED_SHA")',
    );
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
