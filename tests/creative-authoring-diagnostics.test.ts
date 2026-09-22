import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  failureSummary,
  writeFailedCandidateDrafts,
} from "../scripts/creative-authoring-diagnostics.mjs";

describe("creative authoring diagnostics", () => {
  it("stores failed drafts privately and omits source from the run summary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "launchloom-authoring-"));
    const failure = {
      routeId: "route-02",
      candidateId: "candidate-b",
      stage: "styles-and-motion",
      error: "simulated author failure",
      draft: {
        candidateId: "candidate-b",
        routeId: "route-02",
        stage: "styles-and-motion",
        designContract: "Fashion Archive composition",
        experience: "export default function Experience() { return null; }",
        styles: ".candidate { color: black; }",
        motion: "export function mountExperienceMotion() { return () => {}; }",
      },
    };

    try {
      await writeFailedCandidateDrafts(root, [failure]);
      const source = await readFile(
        path.join(root, "failed-candidates/candidate-b/Experience.jsx"),
        "utf8",
      );
      const details = JSON.parse(
        await readFile(
          path.join(root, "failed-candidates/candidate-b/failure.json"),
          "utf8",
        ),
      );
      const summary = failureSummary(failure);

      expect(source).toContain("Experience()");
      expect(details.failure.error).toBe("simulated author failure");
      expect(details).not.toHaveProperty("experience");
      expect(summary.draftPath).toBe("failed-candidates/candidate-b");
      expect(summary).not.toHaveProperty("draft");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not create directories for untrusted candidate IDs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "launchloom-authoring-"));
    try {
      await writeFailedCandidateDrafts(root, [
        { draft: { candidateId: "../../outside", experience: "unsafe" } },
      ]);
      expect(failureSummary({ draft: { candidateId: "../../outside" } }).draftPath)
        .toBeNull();
      await expect(readFile(path.join(root, "outside/Experience.jsx"), "utf8"))
        .rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
