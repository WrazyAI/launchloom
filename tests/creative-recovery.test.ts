import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  candidateDiagnosticSafety,
  chooseRecoveryCandidate,
} from "../scripts/creative-recovery.mjs";

function viewport(name: string) {
  const dimensions = {
    desktop: { width: 1536, height: 864 },
    compact: { width: 1366, height: 768 },
    mobile: { width: 390, height: 844 },
  }[name] || { width: 390, height: 844 };
  return {
    name,
    ...dimensions,
    h1Count: 1,
    hasHero: true,
    hasEarlyConversion: true,
    hasServices: true,
    hasFaqs: true,
    hasContact: true,
    missingFragments: 0,
    missingNavTargets: 0,
    hasLeadForm: true,
    missingAlt: 0,
    unnamedControls: 0,
    heroBottom: dimensions.height - 20,
    viewportHeight: dimensions.height,
    overflow: false,
    brokenImages: 0,
    emDashes: 0,
    browserErrors: [],
    creativeRenderer: "creative-candidate",
  };
}

function candidate(candidateId: string, score: number) {
  return {
    candidateId,
    directory: candidateId,
    score,
    viewports: [viewport("desktop"), viewport("compact"), viewport("mobile")],
    failures: ["rendered-reference: the composition diverges from its assigned reference"],
  };
}

describe("creative recovery diagnostics", () => {
  it("allows a rendered candidate to be previewed diagnostically when only visual quality missed", () => {
    const result = candidateDiagnosticSafety(candidate("candidate-a", 64));
    expect(result).toEqual({ safe: true, reasons: [] });
  });

  it.each([
    ["desktop overflow", (item: any) => (item.viewports[0].overflow = true)],
    ["missing mobile capture", (item: any) => (item.viewports = item.viewports.slice(0, 2))],
    ["unlabeled control", (item: any) => (item.viewports[2].unnamedControls = 1)],
    ["broken image", (item: any) => (item.viewports[0].brokenImages = 1)],
    ["missing navigation", (item: any) => (item.viewports[1].missingNavTargets = 1)],
    ["desktop hero does not fit", (item: any) => (item.viewports[0].heroBottom = 900)],
  ])("withholds a diagnostic candidate for %s", (_name, damage) => {
    const item = candidate("candidate-a", 64);
    damage(item);
    const result = candidateDiagnosticSafety(item);
    expect(result.safe).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("prioritizes reference fidelity over a generic aggregate score", () => {
    const highAggregate: any = candidate("candidate-b", 96);
    highAggregate.renderedReferenceFidelity = { score: 61 };
    const faithful: any = candidate("candidate-c", 84);
    faithful.renderedReferenceFidelity = { score: 88 };
    const explicit: any = candidate("candidate-a", 80);
    explicit.renderedReferenceFidelity = { score: 82 };
    explicit.explicitReferenceMatch = true;

    expect(
      chooseRecoveryCandidate([highAggregate, faithful, explicit])?.candidateId,
    ).toBe("candidate-a");

    explicit.explicitReferenceMatch = false;
    expect(
      chooseRecoveryCandidate([highAggregate, faithful, explicit])?.candidateId,
    ).toBe("candidate-c");
  });
});

describe("developer-triggered creative repair workflow", () => {
  it("provides one signed, head-bound repair without rerunning research or image generation", () => {
    const initialWorkflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const repairWorkflow = readFileSync(
      ".github/workflows/repair-creative-candidate.yml",
      "utf8",
    );
    expect(initialWorkflow).toContain("--creative-repair-session");
    expect(initialWorkflow).toContain("/api/internal/creative-repairs");
    expect(initialWorkflow).toContain("diagnosticPreviewEligible");
    expect(repairWorkflow).toContain("Atomically claim the one allowed repair");
    expect(repairWorkflow).toContain("steps.claim.outputs.run == 'true'");
    expect(repairWorkflow).toContain("--max-cycles 1");
    expect(repairWorkflow).toContain("--feedback-file");
    expect(repairWorkflow).toContain("--session");
    expect(repairWorkflow).toContain('npm ci --prefix "$CLIENT_DIR"');
    expect(repairWorkflow.indexOf("Install rendered client dependencies")).toBeLessThan(
      repairWorkflow.indexOf("Run exactly one rendered repair against captured findings"),
    );
    expect(repairWorkflow).toContain("round-02/creative-bakeoff.json");
    expect(repairWorkflow).toContain(".promotionReady == true");
    expect(repairWorkflow).toContain("steps.verified_preview.outcome == 'failure'");
    expect(repairWorkflow).toContain("creative-diagnostic");
    expect(repairWorkflow).toContain("verify-creative-diagnostic.mjs");
    expect(repairWorkflow).not.toContain("seo-research.mjs");
    expect(repairWorkflow).not.toContain("generate-contextual-assets.mjs");
    expect(repairWorkflow).not.toContain("author:experiences");
    expect(repairWorkflow).not.toContain("--max-cycles 2");
  });
});
