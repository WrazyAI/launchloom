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
    failures: [
      "rendered-reference: the composition diverges from its assigned reference",
    ],
  };
}

describe("creative recovery diagnostics", () => {
  it("allows a rendered candidate to be previewed diagnostically when only visual quality missed", () => {
    const result = candidateDiagnosticSafety(candidate("candidate-a", 64));
    expect(result).toEqual({ safe: true, reasons: [] });
  });

  it("allows explicit below-fold reference geometry when the opening image crosses the fold", () => {
    const item: any = candidate("candidate-kokoro", 84);
    item.manifest = {
      referenceDna: {
        heroGeometry: {
          viewport:
            "The portrait image starts near 0.79 and continues below the fold.",
        },
      },
    };
    item.viewports[0].heroBottom = 1501;
    item.viewports[0].openingImage = { bottomRatio: 1.74 };
    item.viewports[1].heroBottom = 1321;
    item.viewports[1].openingImage = { bottomRatio: 1.72 };

    expect(candidateDiagnosticSafety(item)).toEqual({
      safe: true,
      reasons: [],
    });
  });

  it.each([
    ["desktop overflow", (item: any) => (item.viewports[0].overflow = true)],
    [
      "missing mobile capture",
      (item: any) => (item.viewports = item.viewports.slice(0, 2)),
    ],
    [
      "unlabeled control",
      (item: any) => (item.viewports[2].unnamedControls = 1),
    ],
    ["broken image", (item: any) => (item.viewports[0].brokenImages = 1)],
    [
      "missing navigation",
      (item: any) => (item.viewports[1].missingNavTargets = 1),
    ],
    [
      "desktop hero does not fit",
      (item: any) => (item.viewports[0].heroBottom = 900),
    ],
  ])("withholds a diagnostic candidate for %s", (_name, damage) => {
    const item = candidate("candidate-a", 64);
    damage(item);
    const result = candidateDiagnosticSafety(item);
    expect(result.safe).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("selects the highest rendered score with a stable candidate-ID tie break", () => {
    expect(
      chooseRecoveryCandidate([
        candidate("candidate-b", 81),
        candidate("candidate-c", 93),
        candidate("candidate-a", 93),
      ])?.candidateId,
    ).toBe("candidate-a");
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
    const repairIndex = repairWorkflow.indexOf(
      "Run exactly one rendered repair against captured findings",
    );
    const buildCopyIndex = repairWorkflow.indexOf(
      'node "$GITHUB_WORKSPACE/scripts/prepare-client-build-copy.mjs" --source "$CLIENT_DIR" --target "$BUILD_DIR"',
    );
    const isolatedInstallIndex = repairWorkflow.indexOf(
      'node "$GITHUB_WORKSPACE/scripts/run-isolated-client-command.mjs" --cwd "$BUILD_DIR" --writable "$BUILD_ROOT" -- npm ci',
    );
    expect(repairWorkflow).toContain(
      'BUILD_ROOT=$(mktemp -d "$RUNNER_TEMP/launchloom-repair-build.XXXXXX")',
    );
    expect(repairWorkflow).toContain('BUILD_DIR="$BUILD_ROOT/site"');
    expect(buildCopyIndex).toBeGreaterThan(repairIndex);
    expect(isolatedInstallIndex).toBeGreaterThan(buildCopyIndex);
    expect(repairWorkflow).not.toContain('npm ci --prefix "$CLIENT_DIR"');
    expect(repairWorkflow).toContain("round-02/creative-bakeoff.json");
    expect(repairWorkflow).toContain(".promotionReady == true");
    expect(repairWorkflow).toContain(
      "steps.verified_preview.outcome == 'failure'",
    );
    expect(repairWorkflow).toContain("creative-diagnostic");
    expect(repairWorkflow).toContain("verify-creative-diagnostic.mjs");
    expect(repairWorkflow).not.toContain("seo-research.mjs");
    expect(repairWorkflow).not.toContain("generate-contextual-assets.mjs");
    expect(repairWorkflow).not.toContain("author:experiences");
    expect(repairWorkflow).not.toContain("--max-cycles 2");
  });

  it("requires reused candidate packs to satisfy the current reference contract", () => {
    const workflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const reuseStart = workflow.indexOf(
      'if [ "$REUSE_AUTHORED_CANDIDATES" = "true" ]; then',
    );
    const freshBranch = workflow.indexOf("          else\n", reuseStart);
    const reusedBranch = workflow.slice(reuseStart, freshBranch);

    expect(reuseStart).toBeGreaterThan(-1);
    expect(freshBranch).toBeGreaterThan(reuseStart);
    expect(reusedBranch).toContain('jq -e "$REFERENCE_PACK_VALIDATION"');
    expect(reusedBranch).toContain(
      "Regenerate this intake before reusing its candidates",
    );
    expect(workflow).toContain(
      "Reference DNA or permission-cleared dossier evidence is incomplete",
    );
  });
});
