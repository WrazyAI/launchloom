import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  evaluateRenderedDiversity,
  evaluateRenderedReferenceFidelity,
} from "../scripts/rendered-reference-fidelity.mjs";

const roots: string[] = [];
const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(async () => {
  process.env.OPENROUTER_API_KEY = originalKey;
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function evidence() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-ref-"));
  roots.push(root);
  const files = {
    referenceDesktop: path.join(root, "reference-desktop.png"),
    referenceMobile: path.join(root, "reference-mobile.png"),
    candidateDesktop: path.join(root, "candidate-desktop.png"),
    candidateCompact: path.join(root, "candidate-compact.png"),
    candidateMobile: path.join(root, "candidate-mobile.png"),
    secondDesktop: path.join(root, "second-desktop.png"),
    secondMobile: path.join(root, "second-mobile.png"),
  };
  await Promise.all(
    Object.values(files).map((file) => fs.writeFile(file, Buffer.from("pixel-evidence"))),
  );
  return files;
}

function dna(files: Awaited<ReturnType<typeof evidence>>) {
  return {
    version: 2,
    familyId: "kokoro-editorial-architecture",
    referenceName: "Kokoro editorial architecture",
    source: "reference-only",
    rights: "reference-only",
    evidence: {
      desktopScreenshot: { path: files.referenceDesktop, available: true },
      mobileScreenshot: { path: files.referenceMobile, available: true },
      annotatedDescription: "Oversized editorial type, image chapters, archive rhythm.",
    },
    heroGeometry: { mode: "typographic-monument" },
    navigationGeometry: { mode: "quiet-corner-links" },
    typography: { display: "editorial-serif" },
    palette: { surfaces: ["near-black"] },
    imageTreatment: { mode: "architectural-tableaux" },
    sectionSequence: ["hero", "image-chapter", "magazine-archive", "closing-scene"],
    servicePresentation: { pattern: "magazine-archive-ledger" },
    ctaPlacement: { early: "after-hero-image" },
    motion: { primitive: "masked-image-reveal" },
    mobileRecomposition: { strategy: "single-column-editorial-chapters" },
    prohibitedPatterns: ["generic-split-hero", "card-wall"],
    requiredSignatureElements: [
      { id: "editorial-monument", selector: "[data-reference-signature=editorial-monument]" },
    ],
    acceptanceChecks: ["preserve oversized type", "preserve archive rhythm"],
    complete: true,
    incompleteReasons: [],
  };
}

function response(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }],
      provider: "test",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const passingScores = {
  heroGeometry: 92,
  typography: 90,
  spatialRhythm: 88,
  imagery: 86,
  servicePresentation: 90,
  navigation: 84,
  ctaPlacement: 86,
  mobileRecomposition: 88,
  interactionEvidence: 76,
};

describe("rendered reference fidelity", () => {
  it("passes only from pixel-level reference scores, not DOM markers", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async () =>
        response({
          verdict: "pass",
          overallScore: 89,
          scores: passingScores,
          findings: [],
          summary: "The candidate preserves the reference mechanics.",
        }),
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(89);
  });

  it("blocks a generic candidate even when it is technically clean", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedReferenceFidelity({
      referenceDna: dna(files),
      candidateScreenshots: {
        desktop: files.candidateDesktop,
        compact: files.candidateCompact,
        mobile: files.candidateMobile,
      },
      fetchImpl: async () =>
        response({
          verdict: "revise",
          overallScore: 68,
          scores: { ...passingScores, heroGeometry: 60, spatialRhythm: 61 },
          findings: [
            {
              severity: "major",
              category: "generic-grammar",
              viewport: "all",
              evidence: "The candidate collapses into a familiar centered hero and card stack.",
              repair: "Restore the reference's image-led chapters and archive rhythm.",
            },
          ],
          summary: "Technically valid but visually generic.",
        }),
    });
    expect(result.pass).toBe(false);
    expect(result.audit.findings[0].category).toBe("generic-grammar");
  });

  it("uses screenshot distance rather than route metadata for diversity", async () => {
    process.env.OPENROUTER_API_KEY = "test";
    const files = await evidence();
    const result = await evaluateRenderedDiversity({
      candidates: [
        { candidateId: "candidate-a", desktop: files.candidateDesktop, mobile: files.candidateMobile },
        { candidateId: "candidate-b", desktop: files.secondDesktop, mobile: files.secondMobile },
      ],
      fetchImpl: async () =>
        response({
          overallDistinctiveness: 64,
          genericFallbackDetected: true,
          pairs: [
            {
              left: "candidate-a",
              right: "candidate-b",
              distance: 58,
              reason: "Both use the same centered opening and stacked card rhythm.",
            },
          ],
          summary: "The candidates are visually too similar.",
        }),
    });
    expect(result.pass).toBe(false);
    expect(result.minimumPairDistance).toBe(58);
  });
});
