import { execFileSync } from "node:child_process";
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
  it("uses a generic review-email hint instead of exposing the invited developer address", () => {
    const reviewPanel = readFileSync("src/components/ReviewPanel.tsx", "utf8");
    const feedbackParts = readFileSync(
      "src/components/FeedbackParts.tsx",
      "utf8",
    );
    expect(reviewPanel).toContain(
      'const reviewEmailPlaceholder = "your-email@domain.com";',
    );
    expect(
      (reviewPanel.match(/placeholder=\{reviewEmailPlaceholder\}/g) || [])
        .length,
    ).toBe(1);
    expect(reviewPanel).not.toContain("placeholder={invitedEmail}");
    expect(feedbackParts).toContain(
      'placeholder="The email that received this review link"',
    );
    expect(feedbackParts).not.toContain("placeholder={invitedEmail}");
  });

  it("allows a rendered candidate to be previewed diagnostically when only visual quality missed", () => {
    const result = candidateDiagnosticSafety(candidate("candidate-a", 64));
    expect(result).toEqual({ safe: true, reasons: [] });
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
  it("masks every generated signed review token before derived links can reach workflow logs", () => {
    const workflows = [
      ".github/workflows/generate-client.yml",
      ".github/workflows/repair-creative-candidate.yml",
      ".github/workflows/send-developer-review.yml",
      ".github/workflows/process-feedback.yml",
      ".github/workflows/process-client-feedback.yml",
      ".github/workflows/publish-site.yml",
    ];
    for (const workflowPath of workflows) {
      const source = readFileSync(workflowPath, "utf8");
      const generatedTokens = [...source.matchAll(
        /TOKEN=\$\(node[\s\S]*?create-review-link\.mjs[\s\S]*?--token-only true\)/gu,
      )];
      expect(generatedTokens.length, workflowPath).toBeGreaterThan(0);
      for (const match of generatedTokens) {
        const followingShell = source.slice(match.index! + match[0].length).trimStart();
        expect(followingShell, workflowPath).toMatch(/^echo "::add-mask::\$TOKEN"/u);
      }
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
    const generatedToken = initialWorkflow.indexOf("TOKEN=$(node");
    const maskGeneratedToken = initialWorkflow.indexOf(
      'echo "::add-mask::$TOKEN"',
      generatedToken,
    );
    const exposeGeneratedToken = initialWorkflow.indexOf("REVIEW_LINK=", generatedToken);
    expect(generatedToken).toBeGreaterThan(-1);
    expect(maskGeneratedToken).toBeGreaterThan(generatedToken);
    expect(maskGeneratedToken).toBeLessThan(exposeGeneratedToken);
    expect(initialWorkflow).toContain(
      'echo "send_anyway_url=$DIAGNOSTIC_PREVIEW_URL?review=$TOKEN"',
    );
    expect(initialWorkflow).toContain('--send-anyway-url "$SEND_ANYWAY_URL"');
    expect(repairWorkflow).toContain(
      '--creative-repair-session "$OVERRIDE_SESSION_ID"',
    );
    expect(repairWorkflow).toContain('--send-anyway-url "$SEND_ANYWAY_URL"');
    expect(repairWorkflow).toContain("Atomically claim the one allowed repair");
    expect(repairWorkflow).toContain("steps.claim.outputs.run == 'true'");
    expect(repairWorkflow).toContain("--max-cycles 1");
    expect(repairWorkflow).toContain("--feedback-file");
    expect(repairWorkflow).toContain("--session");
    expect(repairWorkflow).toContain('npm ci --prefix "$CLIENT_DIR"');
    expect(
      repairWorkflow.indexOf("Install rendered client dependencies"),
    ).toBeLessThan(
      repairWorkflow.indexOf(
        "Run exactly one rendered repair against captured findings",
      ),
    );
    expect(repairWorkflow).toContain("round-02/creative-bakeoff.json");
    expect(repairWorkflow).toContain(".promotionReady == true");
    expect(repairWorkflow).toContain(
      "steps.verified_preview.outcome == 'failure'",
    );
    expect(repairWorkflow).toContain("creative-diagnostic");
    expect(repairWorkflow).toContain("verify-creative-diagnostic.mjs");
    expect(repairWorkflow).toContain(
      "CLIENT_EMAIL: ${{ github.event.client_payload.clientEmail }}",
    );
    expect(repairWorkflow).toContain(
      "FEEDBACK_ISSUE: ${{ github.event.client_payload.feedbackIssue }}",
    );
    expect(repairWorkflow).not.toContain(
      "x.business.email || x.business.leadEmail",
    );
    expect(repairWorkflow).not.toContain(
      'gh issue list --repo "$CLIENT_REPO" --state open --label launchloom-client-feedback',
    );
    expect(repairWorkflow).toContain("exit 1");
    expect(repairWorkflow).not.toContain("seo-research.mjs");
    expect(repairWorkflow).not.toContain("generate-contextual-assets.mjs");
    expect(repairWorkflow).not.toContain("author:experiences");
    expect(repairWorkflow).not.toContain("--max-cycles 2");
  });

  it("records developer gate overrides and makes client delivery idempotent", () => {
    const publishWorkflow = readFileSync(
      ".github/workflows/publish-site.yml",
      "utf8",
    );
    const worker = readFileSync("worker/src/index.ts", "utf8");
    expect(worker).toContain('disposition: "override-publish"');
    expect(publishWorkflow).toContain("DEVELOPER_OVERRIDE:");
    expect(publishWorkflow).toContain("launchloom-human-gate-override:");
    expect(publishWorkflow).toContain(
      'EMAIL_ARGS+=(--idempotency-key "published-$EMAIL_KEY")',
    );
  });

  it("validates override metadata and records the override before production deployment", () => {
    const publishWorkflow = readFileSync(
      ".github/workflows/publish-site.yml",
      "utf8",
    );
    const validateOverride = publishWorkflow.indexOf(
      "validate-creative-release-override.mjs",
    );
    const auditMarker = publishWorkflow.indexOf(
      "launchloom-human-gate-override:",
    );
    const deployment = publishWorkflow.indexOf(
      "npx wrangler pages deploy dist",
    );

    expect(validateOverride).toBeGreaterThan(-1);
    expect(validateOverride).toBeLessThan(deployment);
    expect(auditMarker).toBeGreaterThan(-1);
    expect(auditMarker).toBeLessThan(deployment);
  });

  it("accepts exact override identity fields and rejects malformed release metadata", () => {
    const args = [
      "scripts/validate-creative-release-override.mjs",
      "--pr",
      "7",
      "--approved-sha",
      "a".repeat(40),
      "--session",
      "b".repeat(32),
      "--reviewed-sha",
      "c".repeat(40),
      "--candidate",
      "candidate-a",
    ];

    expect(() => execFileSync(process.execPath, args)).not.toThrow();
    expect(() =>
      execFileSync(
        process.execPath,
        [...args.slice(0, -1), "candidate-$(touch-pwned)"],
        { stdio: "ignore" },
      ),
    ).toThrow();
    expect(() =>
      execFileSync(
        process.execPath,
        [...args.slice(0, 8), "not-a-commit-sha", ...args.slice(9)],
        { stdio: "ignore" },
      ),
    ).toThrow();
  });
});
