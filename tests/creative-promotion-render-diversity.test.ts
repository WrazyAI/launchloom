import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";
import {
  cleanupTempRoots,
  makeFixture,
  makeTemplateCopy,
  writeV2ContentManifest,
} from "./helpers/creative-promotion-fixtures";

afterEach(cleanupTempRoots);

describe("creative candidate promotion (rendered diversity)", () => {
  it("uses rendered diversity as the sole v2 production diversity authority", async () => {
    const root = await makeFixture();
    const record = JSON.parse(
      await fs.readFile("data/inspiration-registry.json", "utf8"),
    ).records[0];
    const baseDna = buildReferenceDna(record, { requireEvidence: true });

    const firstMetadataPath = path.join(root, "candidate-a/metadata.json");
    const firstMetadata = JSON.parse(
      await fs.readFile(firstMetadataPath, "utf8"),
    );
    firstMetadata.version = 2;
    firstMetadata.referenceDna = baseDna;
    firstMetadata.referenceEvidence = {
      desktop: baseDna.evidence.desktopScreenshot.path,
      mobile: baseDna.evidence.mobileScreenshot?.path || "",
      complete: true,
    };
    firstMetadata.creativeManifest = {
      ...firstMetadata.creativeManifest,
      version: 2,
      referenceDna: baseDna,
      referenceEvidence: firstMetadata.referenceEvidence,
    };
    await fs.writeFile(firstMetadataPath, JSON.stringify(firstMetadata));
    await writeV2ContentManifest(root);

    await fs.cp(
      path.join(root, "candidate-a"),
      path.join(root, "candidate-b"),
      { recursive: true },
    );
    const secondMetadataPath = path.join(root, "candidate-b/metadata.json");
    const secondMetadata = JSON.parse(
      await fs.readFile(secondMetadataPath, "utf8"),
    );
    secondMetadata.candidateId = "candidate-b";
    secondMetadata.creativeManifest = {
      ...secondMetadata.creativeManifest,
      candidateId: "candidate-b",
    };
    await fs.writeFile(secondMetadataPath, JSON.stringify(secondMetadata));

    const siteRoot = await makeTemplateCopy();
    const configPath = path.join(siteRoot, "src/site.config.json");
    const selectedPath = path.join(
      siteRoot,
      "src/generated-experiences/selected",
    );
    const selectedBackup = await fs.mkdtemp(
      path.join(os.tmpdir(), "launchloom-selected-"),
    );
    const originalConfig = await fs.readFile(configPath, "utf8");
    await fs.cp(selectedPath, selectedBackup, { recursive: true });

    const fidelityEvidence: any[] = [];
    const diversityEvidence: any[] = [];
    const contrastEvidence: any[] = [];
    const contrastEvaluator = async (input: any) => {
      contrastEvidence.push(input);
      return {
        pass: true,
        repairs: [],
        before: { findings: [] },
        after: { findings: [] },
      };
    };
    const renderedReferenceEvaluator = async (input: any) => {
      fidelityEvidence.push(input);
      return {
        version: 1,
        model: "test/model",
        score: 100,
        pass: true,
        audit: {
          scores: {
            heroGeometry: 100,
            typography: 100,
            spatialRhythm: 100,
            imagery: 100,
            servicePresentation: 100,
            navigation: 100,
            ctaPlacement: 100,
            mobileRecomposition: 100,
            interactionEvidence: 100,
          },
          findings: [],
        },
      };
    };

    try {
      const report = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-diversity-report.json"),
        screenshotsDir: path.join(root, "v2-diversity-screenshots"),
        contrastEvaluator,
        renderedReferenceEvaluator,
        renderedDiversityEvaluator: async (input: any) => {
          diversityEvidence.push(input);
          return {
            version: 1,
            model: "test/model",
            score: 92,
            pass: true,
            minimumPairDistance: 90,
            audit: {
              pairs: [
                {
                  left: "candidate-a",
                  right: "candidate-b",
                  distance: 90,
                  pass: true,
                  reason: "Rendered compositions are materially different.",
                },
              ],
              genericFallbackDetected: false,
              summary: "Rendered candidates are visually distinct.",
            },
          };
        },
      });

      expect(report.diversity.pass).toBe(false);
      const firstEvidence = fidelityEvidence[0];
      // A static viewport cannot establish that authored interactions work.
      expect(firstEvidence.interactionEvidence?.observations).toHaveLength(3);
      expect(firstEvidence.interactionEvidence?.candidateId).toBe("candidate-a");
      expect(firstEvidence.interactionEvidence?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
      const viewportImage = await sharp(
        firstEvidence.candidateScreenshots.desktop,
      ).metadata();
      const pageOverview = await sharp(
        firstEvidence.candidateScreenshots.fullDesktop,
      ).metadata();
      expect({
        width: viewportImage.width,
        height: viewportImage.height,
      }).toEqual({ width: 1536, height: 864 });
      expect(pageOverview.width).toBe(1536);
      expect(pageOverview.height).toBeGreaterThanOrEqual(864);
      expect(firstEvidence.renderedGeometry.desktop.viewportHeight).toBe(864);
      expect(diversityEvidence).toHaveLength(1);
      expect(diversityEvidence[0].candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            desktop: expect.stringMatching(/desktop-viewport\.png$/u),
            mobile: expect.stringMatching(/mobile-viewport\.png$/u),
          }),
        ]),
      );
      expect(report.visualDiversity.pass).toBe(true);
      expect(
        report.candidates.every((candidate: any) => candidate.eligible),
        JSON.stringify(report.candidates.map((candidate: any) => ({
          candidateId: candidate.candidateId,
          failures: candidate.failures,
          interaction: candidate.interactionEvidence,
        }))),
      ).toBe(true);
      expect(report.selectedCandidateId).not.toBeNull();
      expect(report.promotionReady).toBe(true);
      expect(contrastEvidence).toHaveLength(2);

      const convergedPreview = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-preview-converged-report.json"),
        screenshotsDir: path.join(root, "v2-preview-converged-screenshots"),
        preview: true,
        deferPromotion: true,
        contrastEvaluator,
        renderedReferenceEvaluator,
        renderedDiversityEvaluator: async () => ({
          version: 1,
          model: "test/model",
          score: 40,
          pass: false,
          minimumPairDistance: 40,
          audit: {
            pairs: [
              {
                left: "candidate-a",
                right: "candidate-b",
                distance: 40,
                pass: false,
                reason: "Both render the same centered split hero.",
              },
            ],
            genericFallbackDetected: false,
            summary: "Rendered heroes converged.",
          },
        }),
      });
      expect(convergedPreview.selectedCandidateId).toBeNull();
      expect(convergedPreview.fallback).toBe(true);
      expect(convergedPreview.previewDiversity).toMatchObject({
        pass: false,
        strategy: "converged-blocked",
        convergenceDetected: true,
      });
      expect(
        convergedPreview.candidates.every(
          (candidate: any) =>
            candidate.renderedHeroDistinctiveness?.allPairsPass === false,
        ),
      ).toBe(true);

      const blocked = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-diversity-blocked-report.json"),
        screenshotsDir: path.join(root, "v2-diversity-blocked-screenshots"),
        promote: true,
        requireDiversity: false,
        contrastEvaluator,
        renderedReferenceEvaluator,
        renderedDiversityEvaluator: async () => ({
          version: 1,
          model: "test/model",
          score: 40,
          pass: false,
          minimumPairDistance: 40,
          audit: {
            pairs: [
              {
                left: "candidate-a",
                right: "candidate-b",
                distance: 40,
                reason: "Rendered compositions are too similar.",
              },
            ],
            genericFallbackDetected: true,
            summary: "Rendered diversity failed.",
          },
        }),
      });
      expect(blocked.selectedCandidateId).not.toBeNull();
      expect(blocked.promotionReady).toBe(false);
      const blockedConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(blockedConfig).toEqual(JSON.parse(originalConfig));

      const singleEligible = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-preview-single-eligible-report.json"),
        screenshotsDir: path.join(
          root,
          "v2-preview-single-eligible-screenshots",
        ),
        preview: true,
        deferPromotion: true,
        contrastEvaluator,
        renderedReferenceEvaluator: async (input: any) => {
          if (
            String(input.candidateScreenshots.desktop).includes("candidate-b")
          )
            return {
              version: 1,
              model: "test/model",
              score: 54,
              pass: false,
              audit: {
                scores: {
                  heroGeometry: 54,
                  typography: 54,
                  spatialRhythm: 54,
                  imagery: 54,
                  servicePresentation: 54,
                  navigation: 54,
                  ctaPlacement: 54,
                  mobileRecomposition: 54,
                  interactionEvidence: 54,
                  paletteAdherence: 54,
                  artDirection: 54,
                },
                findings: [
                  {
                    severity: "major",
                    category: "spatial-rhythm",
                    viewport: "desktop",
                    evidence:
                      "The opening rhythm does not match the reference.",
                    repair: "Restore the reference opening rhythm.",
                  },
                ],
              },
            };
          return {
            version: 1,
            model: "test/model",
            score: 100,
            pass: true,
            audit: {
              scores: {
                heroGeometry: 100,
                typography: 100,
                spatialRhythm: 100,
                imagery: 100,
                servicePresentation: 100,
                navigation: 100,
                ctaPlacement: 100,
                mobileRecomposition: 100,
                interactionEvidence: 100,
                paletteAdherence: 100,
                artDirection: 100,
              },
              findings: [],
            },
          };
        },
        renderedDiversityEvaluator: async () => ({
          version: 1,
          model: "test/model",
          score: 40,
          pass: false,
          minimumPairDistance: 40,
          audit: {
            pairs: [
              {
                left: "candidate-a",
                right: "candidate-b",
                distance: 40,
                pass: false,
                reason: "Rendered compositions are too similar.",
              },
            ],
            genericFallbackDetected: false,
            summary: "Rendered heroes converged.",
          },
        }),
      });
      expect(singleEligible.selectedCandidateId).toBe("candidate-a");
      expect(singleEligible.fallback).toBe(false);
      expect(singleEligible.previewDiversity).toMatchObject({
        pass: true,
        strategy: "single-eligible",
        eligibleCandidateIds: ["candidate-a"],
      });
      expect(contrastEvidence).toHaveLength(8);
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 180_000);
});
