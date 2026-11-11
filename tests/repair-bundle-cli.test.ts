import { describe, expect, it } from "vitest";
import { parseRepairBundleArgs } from "../scripts/build-repair-bundle.mjs";

describe("repair bundle CLI", () => {
  it("maps kebab-case flags to the builder contract", () => {
    const args = parseRepairBundleArgs([
      "--output-dir",
      "out",
      "--attempt-id",
      "attempt-1",
      "--client-repo",
      "WrazyAI/client-fixture",
      "--project-name",
      "client-fixture",
      "--build-sha",
      "a".repeat(40),
      "--candidate-dir",
      "candidate",
      "--screenshots-dir",
      "shots",
    ]);
    expect(args).toMatchObject({
      outputDir: "out",
      attemptId: "attempt-1",
      clientRepo: "WrazyAI/client-fixture",
      projectName: "client-fixture",
      buildSha: "a".repeat(40),
      candidateDir: "candidate",
      screenshotsDir: "shots",
    });
  });
});
