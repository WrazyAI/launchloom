import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { creativeLaneEffort } from "../scripts/creative-lane-inference.mjs";

describe("reference analyzer effort budget", () => {
  it("lets the analyzer lane override the shared max effort", () => {
    const effort = creativeLaneEffort(
      {
        CREATIVE_EXPERIENCE_PROVIDER: "opencode-go",
        CREATIVE_EXPERIENCE_REASONING_EFFORT: "max",
        CREATIVE_REFERENCE_ANALYZER_EFFORT: "medium",
      },
      {
        lane: "CREATIVE_REFERENCE_ANALYZER_EFFORT",
        openrouterDefault: "medium",
      },
    );
    expect(effort).toBe("medium");
  });

  it("keeps the shared creative effort when no analyzer override exists", () => {
    const effort = creativeLaneEffort(
      {
        CREATIVE_EXPERIENCE_PROVIDER: "opencode-go",
        CREATIVE_EXPERIENCE_REASONING_EFFORT: "max",
      },
      { lane: "CREATIVE_REFERENCE_ANALYZER_EFFORT" },
    );
    expect(effort).toBe("max");
  });

  it("sets a medium analyzer default in the production workflow", () => {
    const source = fs.readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    expect(source).toContain(
      "CREATIVE_REFERENCE_ANALYZER_EFFORT: ${{ vars.CREATIVE_REFERENCE_ANALYZER_EFFORT || 'medium' }}",
    );
  });
});
