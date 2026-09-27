import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { missingCanaryCandidateDiagnostic } from "../scripts/creative-canary-diagnostics.mjs";

describe("model-authored creative canary command", () => {
  it("passes the authored output directory exactly once", () => {
    const source = readFileSync("scripts/run-creative-canary.mjs", "utf8");
    const argumentBlock = source.match(
      /await execFileAsync\(\s*process\.execPath,\s*\[([\s\S]*?)\],\s*\{/u,
    )?.[1];

    expect(argumentBlock).toMatch(/"--out",\s*authoredRoot/u);
    expect(argumentBlock?.match(/"--out"/gu)).toHaveLength(1);
    expect(argumentBlock).toMatch(/"--canary-kokoro-acceptance",\s*"true"/u);
  });

  it("limits the authoring archive exception to the Kokoro acceptance dossier", () => {
    const source = readFileSync("scripts/author-production-experiences.mjs", "utf8");

    expect(source).toMatch(/args\["canary-kokoro-acceptance"\]\s*===\s*"true"/u);
    expect(source).toMatch(/\["kokoro-spatial-editorial"\]/u);
    expect(source).toContain("allowArchiveReferenceIds: canaryArchiveReferenceIds");
  });

  it("reports the selected route's authoring failure when the candidate is absent", () => {
    const message = missingCanaryCandidateDiagnostic(
      {
        id: "route-01",
        label: "Kokoro-style architecture",
        referenceFamilyId: "kokoro-spatial-editorial",
      },
      {
        failures: [
          {
            routeId: "route-01",
            candidateId: "candidate-a",
            error: "Reference fidelity failed: service presentation did not match Reference DNA.",
          },
        ],
      },
    );

    expect(message).toContain("Kokoro-style architecture");
    expect(message).toContain("candidate-a");
    expect(message).toContain(
      "service presentation did not match Reference DNA",
    );
  });

  it("does not attribute an unrelated route failure to the selected reference", () => {
    const message = missingCanaryCandidateDiagnostic(
      {
        id: "route-01",
        label: "Kokoro-style architecture",
        referenceFamilyId: "kokoro-spatial-editorial",
      },
      {
        failures: [
          {
            routeId: "route-02",
            candidateId: "candidate-b",
            error: "Unrelated route failed.",
          },
        ],
      },
    );

    expect(message).toContain("Kokoro-style architecture");
    expect(message).not.toContain("Unrelated route failed");
    expect(message).toContain("No route-specific authoring failure was recorded");
  });
});
