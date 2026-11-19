import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const inspiration = {
  request: { industry: "home-care" },
  referenceLibrary: {
    status: "selected",
    recordIds: ["dossier-one", "dossier-two"],
  },
};
const bakeoff = {
  selectedCandidateId: "candidate-a",
  candidates: [
    {
      candidateId: "candidate-a",
      referenceDossierId: "dossier-two",
      fingerprint: "creative-fp",
    },
  ],
};

function runReceipt(
  html: string,
  requested: string,
  effective: string,
  state: string,
  reason = "",
  liveHtml = html,
  protectedDiagnostic = false,
) {
  const dir = fs.mkdtempSync(join(tmpdir(), "design-receipt-"));
  try {
    fs.mkdirSync(join(dir, ".launchloom"));
    fs.mkdirSync(join(dir, "dist"));
    fs.writeFileSync(join(dir, "dist/index.html"), html);
    fs.writeFileSync(
      join(dir, "live.sha256"),
      createHash("sha256").update(liveHtml).digest("hex"),
    );
    fs.writeFileSync(
      join(dir, ".launchloom/inspiration-pack.json"),
      JSON.stringify(inspiration),
    );
    fs.writeFileSync(
      join(dir, ".launchloom/creative-bakeoff.json"),
      JSON.stringify(bakeoff),
    );
    if (protectedDiagnostic) {
      const recoveryDir = join(dir, ".launchloom/creative-repair/round-02");
      fs.mkdirSync(recoveryDir, { recursive: true });
      fs.writeFileSync(
        join(dir, ".launchloom/creative-recovery.json"),
        JSON.stringify({
          round: "round-02",
          candidateId: "candidate-a",
          diagnosticPreviewEligible: true,
        }),
      );
      fs.writeFileSync(
        join(recoveryDir, "creative-bakeoff.json"),
        JSON.stringify({ ...bakeoff, selectedCandidateId: null }),
      );
    }
    return spawnSync(
      process.execPath,
      [
        "scripts/preview-design-receipt.mjs",
        dir,
        requested,
        effective,
        state,
        reason,
        protectedDiagnostic ? "protected-build" : join(dir, "live.sha256"),
      ],
      { encoding: "utf8" },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("preview design receipt", () => {
  it("records a protected recovery pick without claiming it was a reviewable delivery", () => {
    const html =
      '<main data-creative-host="true" data-creative-candidate="candidate-a" data-creative-diagnostic="true"></main>';
    const result = runReceipt(
      html,
      "creative",
      "creative",
      "diagnostic",
      "",
      html,
      true,
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      evidence: "protected-build",
      preview: "diagnostic",
      usedDossierId: "dossier-two",
    });
  });

  it("does not issue a receipt for a stale deployment with the same renderer", () => {
    const homepage =
      '<div data-experience-pack="bold-utility" data-layout-fingerprint="bold-utility|portrait"></div>';
    const result = runReceipt(
      homepage,
      "pack",
      "pack",
      "reviewable",
      "",
      homepage + "<p>stale</p>",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Preview did not serve the uploaded homepage",
    );
  });

  it("does not credit proposed creative dossiers to a rendered fallback pack", () => {
    const layout =
      "bold-utility|portrait|utility-pill|guided-portrait|embedded-qualifier|service-grid|quiet-ledger|conversation-handoff|humanist-calm|human-context|conversational|restrained|css|0|guided-stack|hero/conversion/services/about/trust/social-proof/faq/location-map/contact";
    const result = runReceipt(
      `<div data-experience-pack="bold-utility" data-layout-fingerprint="${layout}"></div>`,
      "creative",
      "pack",
      "reviewable",
      "creative-authoring-or-render-failure",
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      requestedRenderer: "creative",
      renderedRenderer: "pack",
      preview: "reviewable",
      businessKind: "home-care",
      usedDossierId: null,
      candidateId: null,
      packId: "bold-utility",
      layoutFingerprint: layout,
      fallbackReason: "creative-authoring-or-render-failure",
      proposedDossierIds: ["dossier-one", "dossier-two"],
    });
  });

  it("binds only the rendered candidate's dossier and marks diagnostic evidence separately", () => {
    const result = runReceipt(
      '<main data-creative-host="true" data-creative-candidate="candidate-a"></main>',
      "creative",
      "creative",
      "diagnostic",
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      renderedRenderer: "creative",
      preview: "diagnostic",
      candidateId: "candidate-a",
      usedDossierId: "dossier-two",
      layoutFingerprint: "creative-fp",
    });
  });

  it("refuses a stale build without the requested candidate marker", () => {
    const result = runReceipt(
      '<main data-creative-host="true" data-creative-candidate="candidate-b"></main>',
      "creative",
      "creative",
      "reviewable",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Rendered creative candidate does not match",
    );
    expect(result.stdout).toBe("");
  });

  it("does not interpret marker-shaped text inside a title attribute as a renderer", () => {
    const result = runReceipt(
      `<div title=' data-experience-pack="bold-utility" data-layout-fingerprint="fake-fp"'></div>`,
      "pack",
      "pack",
      "reviewable",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });
});
