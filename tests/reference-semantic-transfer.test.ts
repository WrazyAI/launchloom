import { describe, expect, it } from "vitest";
import { referenceAnalysisPrompt } from "../scripts/analyze-reference-dna.mjs";

describe("reference semantic transfer", () => {
  it("keeps reference analysis focused on transferable mechanics, not literal subjects", () => {
    const prompt = referenceAnalysisPrompt({
      id: "route-object-stage",
      familyId: "a1-object-stage",
      heroGeometry: "centered isolated object stage",
      referenceDna: {
        familyId: "a1-object-stage",
        referenceName: "A1 object stage",
      },
    });

    expect(prompt).toContain("Transfer formal visual mechanics");
    expect(prompt).toContain("not as required motifs or signatures");
    expect(prompt).toContain("describe the mechanic rather than the literal subject");
    expect(prompt).toContain("A gym may use a plate-loaded barbell");
  });
});
