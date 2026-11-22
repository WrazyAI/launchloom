import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";
import {
  cleanupTempRoots,
  makeFixture,
  makeTemplateCopy,
  writeV2ContentManifest,
} from "./helpers/creative-promotion-fixtures";

afterEach(cleanupTempRoots);

describe("creative candidate promotion (geometry and single preview)", () => {
  it("does not trust hero geometry markers when rendered composition violates topology", async () => {
    const root = await makeFixture();
    const metadataPath = path.join(root, "candidate-a/metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const record = JSON.parse(
      await fs.readFile("data/inspiration-registry.json", "utf8"),
    ).records[0];
    const baseDna = buildReferenceDna(record, { requireEvidence: true });
    baseDna.compositionTopology = {
      hero: "media-overlay",
      mobileHero: "media-overlay",
      mediaRelation: "copy-over-media",
      mobileMediaRelation: "copy-over-media",
      basis: "curated-dna",
    };
    metadata.version = 2;
    metadata.referenceDna = baseDna;
    metadata.referenceEvidence = {
      desktop: baseDna.evidence.desktopScreenshot.path,
      mobile: baseDna.evidence.mobileScreenshot?.path || "",
      complete: true,
    };
    metadata.creativeManifest = {
      ...metadata.creativeManifest,
      version: 2,
      referenceDna: baseDna,
      referenceEvidence: metadata.referenceEvidence,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await writeV2ContentManifest(root);
    const experiencePath = path.join(root, "candidate-a/Experience.jsx");
    const experience = await fs.readFile(experiencePath, "utf8");
    await fs.writeFile(
      experiencePath,
      experience
        .replace(
          "<main>",
          '<main data-mobile-recomposition="wrong-layout" data-motion-primitive="wrong-motion">',
        )
        .replace("<nav>", '<nav data-navigation-geometry="wrong-navigation">')
        .replace(
          "<section data-hero>",
          '<section data-hero data-hero-geometry="wrong-hero"><img src={content.hero.image} alt={content.hero.heading} data-hero-media hidden />',
        )
        .replace(
          '<section id="services">',
          '<section id="services" data-service-presentation="wrong-services">',
        )
        .replace(
          "<button data-early-conversion>",
          '<button data-early-conversion data-cta-placement="wrong-cta">',
        ),
    );
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
    try {
      const report = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "preview-report.json"),
        screenshotsDir: path.join(root, "preview-screenshots"),
        preview: true,
        renderedReferenceEvaluator: async () => ({
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
        }),
      });
      expect(report.candidates[0].valid).toBe(false);
      expect(
        report.candidates[0].compositionGeometryByViewport.desktop.pass,
      ).toBe(false);
      expect(
        report.candidates[0].compositionGeometryByViewport.desktop.findings.map(
          (finding: any) => finding.code,
        ),
      ).toContain("media-overlay-image");
      expect(
        report.candidates[0].referenceFidelity.sourceVisualFindings.length,
      ).toBeGreaterThan(0);
      expect(
        new Set(
          report.candidates[0].referenceFidelity.renderedVisualFindings.map(
            (item: any) => item.viewport,
          ),
        ),
      ).toEqual(new Set(["desktop", "compact", "mobile"]));
      expect(report.candidates[0].eligible).toBe(false);
      expect(report.selectedCandidateId).toBeNull();
      expect(report.fallback).toBe(true);
      expect(report.promotionReady).toBe(false);
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 300_000);

  it("selects one valid version-two candidate for preview without a pairwise comparison", async () => {
    const root = await makeFixture();
    const metadataPath = path.join(root, "candidate-a/metadata.json");
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const record = JSON.parse(
      await fs.readFile("data/inspiration-registry.json", "utf8"),
    ).records[0];
    const baseDna = buildReferenceDna(record, { requireEvidence: true });
    metadata.version = 2;
    metadata.referenceDna = baseDna;
    metadata.referenceEvidence = {
      desktop: baseDna.evidence.desktopScreenshot.path,
      mobile: baseDna.evidence.mobileScreenshot?.path || "",
      complete: true,
    };
    metadata.creativeManifest = {
      ...metadata.creativeManifest,
      version: 2,
      referenceDna: baseDna,
      referenceEvidence: metadata.referenceEvidence,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    await writeV2ContentManifest(root);

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
    try {
      const report = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "preview-report.json"),
        screenshotsDir: path.join(root, "preview-screenshots"),
        preview: true,
        renderedReferenceEvaluator: async () => ({
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
        }),
      });
      expect(report.candidates[0].valid, JSON.stringify(report.candidates[0].failures)).toBe(true);
      expect(report.candidates[0].eligible).toBe(true);
      expect(report.selectedCandidateId).toBe("candidate-a");
      expect(report.fallback).toBe(false);
      expect(report.promotionReady).toBe(false);
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.design.experience.selectionMode).toBe("creative-preview");
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 300_000);
});
