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

  it("prefers a safe diagnostic candidate over a higher-scoring candidate with viewport overflow", () => {
    const unsafeCandidate = candidate("candidate-a", 92);
    unsafeCandidate.viewports[1].heroBottom = 800;
    const safeCandidate = candidate("candidate-c", 68);

    expect(candidateDiagnosticSafety(unsafeCandidate).safe).toBe(false);
    expect(candidateDiagnosticSafety(safeCandidate).safe).toBe(true);
    expect(
      chooseRecoveryCandidate([unsafeCandidate, safeCandidate])?.candidateId,
    ).toBe("candidate-c");
  });
});

describe("developer-triggered creative repair workflow", () => {
  it("keeps isolated client build roots traversable and npm installs bound to them", () => {
    const clientBuildWorkflows = [
      ".github/workflows/generate-client.yml",
      ".github/workflows/repair-creative-candidate.yml",
      ".github/workflows/publish-site.yml",
      ".github/workflows/process-feedback.yml",
      ".github/workflows/process-client-feedback.yml",
    ];

    for (const workflowPath of clientBuildWorkflows) {
      const source = readFileSync(workflowPath, "utf8");
      expect(source, workflowPath).toContain('mktemp -d "/tmp/launchloom-');
      expect(source, workflowPath).toContain(
        '-- npm ci --package-lock=true --prefix "$BUILD_DIR"',
      );
    }
  });

  it("preserves isolated diagnostic build errors before issuing the repair link", () => {
    const workflow = readFileSync(
      ".github/workflows/generate-client.yml",
      "utf8",
    );
    const diagnosticStart = workflow.indexOf(
      "- name: Build and deploy noindex diagnostic preview",
    );
    const diagnosticEnd = workflow.indexOf(
      "\n      - name:",
      diagnosticStart + 1,
    );
    const diagnosticStep = workflow.slice(diagnosticStart, diagnosticEnd);
    const preserveIndex = workflow.indexOf(
      "- name: Preserve private diagnostic preview build failure",
    );
    const repairLinkIndex = workflow.indexOf(
      "- name: Register one-time repair session and create signed review link",
    );

    expect(diagnosticStep.match(/--diagnostic-output /gu)).toHaveLength(3);
    expect(diagnosticStep).toContain(
      'VERIFY_ROOT=$(mktemp -d "/tmp/launchloom-diagnostic-verifier-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.XXXXXX")',
    );
    expect(diagnosticStep).toContain(
      'node "$VERIFY_ROOT/scripts/verify-creative-diagnostic.mjs"',
    );
    expect(diagnosticStep).toContain(
      'cp -R "$GITHUB_WORKSPACE/node_modules/playwright" "$GITHUB_WORKSPACE/node_modules/playwright-core" "$VERIFY_ROOT/node_modules/"',
    );
    expect(diagnosticStep).not.toContain(
      'node "$GITHUB_WORKSPACE/scripts/verify-creative-diagnostic.mjs"',
    );
    expect(preserveIndex).toBeGreaterThan(diagnosticStart);
    expect(preserveIndex).toBeLessThan(repairLinkIndex);
    expect(workflow).toContain("steps.diagnostic_preview.outcome == 'failure'");
    expect(workflow).toContain(
      'BUILD_ROOT=$(mktemp -d "/tmp/launchloom-diagnostic-build-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.XXXXXX")',
    );
    expect(workflow).toContain(
      'npm ci --package-lock=true --prefix "$BUILD_DIR"',
    );
    expect(workflow).toContain(
      'cp "$REPORT" "$CLIENT_DIR/.launchloom/creative-repair/diagnostic-preview-client-command.json"',
    );
    expect(workflow).toContain(
      "jq -r '.command.stderr // \"No stderr was captured.\"'",
    );
  });

  it("masks every generated review credential before exporting or sharing it", () => {
    const flows = [
      {
        workflow: ".github/workflows/generate-client.yml",
        step: "Register one-time repair session and create signed review link",
        linkVariable: "REVIEW_LINK",
        useMarker: 'echo "link=$REVIEW_LINK" >> "$GITHUB_OUTPUT"',
      },
      {
        workflow: ".github/workflows/generate-client.yml",
        step: "Create secure review link",
        linkVariable: "REVIEW_LINK",
        useMarker: 'echo "link=$REVIEW_LINK" >> "$GITHUB_OUTPUT"',
      },
      {
        workflow: ".github/workflows/repair-creative-candidate.yml",
        step: "Return the final result to the developer",
        linkVariable: "REVIEW_URL",
        useMarker: 'gh pr comment "$CLIENT_PR"',
      },
      {
        workflow: ".github/workflows/process-feedback.yml",
        step: "Post and email revised review link",
        linkVariable: "LINK",
        useMarker: 'gh pr comment "$CLIENT_PR"',
      },
      {
        workflow: ".github/workflows/publish-site.yml",
        step: "Deploy approved site and send delivery link",
        linkVariable: "REVIEW_URL",
        useMarker: "EMAIL_ARGS=",
      },
      {
        workflow: ".github/workflows/send-developer-review.yml",
        step: "Mint and send the exact developer review link",
        linkVariable: "LINK",
        useMarker: 'gh pr comment "$CLIENT_PR"',
      },
      {
        workflow: ".github/workflows/process-client-feedback.yml",
        step: "Send the revised preview to the developer",
        linkVariable: "LINK",
        useMarker: 'gh pr comment "${{ steps.revision.outputs.pr }}"',
      },
    ];

    for (const flow of flows) {
      const workflow = readFileSync(flow.workflow, "utf8");
      const stepStart = workflow.indexOf(`- name: ${flow.step}`);
      const stepEnd = workflow.indexOf("\n      - name:", stepStart + 1);
      const step = workflow.slice(stepStart, stepEnd < 0 ? undefined : stepEnd);
      const tokenMintIndex = step.indexOf("create-review-link.mjs");
      const tokenMaskIndex = step.indexOf('echo "::add-mask::$TOKEN"');
      const linkAssignmentIndex = step.indexOf(`${flow.linkVariable}=`);
      const linkMaskIndex = step.indexOf(
        `echo "::add-mask::$${flow.linkVariable}"`,
      );
      const useIndex = step.indexOf(flow.useMarker);

      expect(stepStart, flow.workflow).toBeGreaterThan(-1);
      expect(tokenMintIndex, flow.workflow).toBeGreaterThanOrEqual(0);
      expect(tokenMaskIndex, flow.workflow).toBeGreaterThan(tokenMintIndex);
      expect(linkAssignmentIndex, flow.workflow).toBeGreaterThan(
        tokenMaskIndex,
      );
      expect(linkMaskIndex, flow.workflow).toBeGreaterThan(linkAssignmentIndex);
      expect(useIndex, flow.workflow).toBeGreaterThan(linkMaskIndex);
    }
  });

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
      'node "$GITHUB_WORKSPACE/scripts/run-isolated-client-command.mjs" --cwd "$BUILD_DIR" --writable "$BUILD_ROOT" -- npm ci --package-lock=true --prefix "$BUILD_DIR"',
    );
    expect(repairWorkflow).toContain(
      'BUILD_ROOT=$(mktemp -d "/tmp/launchloom-repair-build-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.XXXXXX")',
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
