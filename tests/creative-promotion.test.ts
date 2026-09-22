import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { promoteCreativeCandidate } from "../scripts/promote-creative-candidate.mjs";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";

const tempRoots: string[] = [];

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-creative-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, "candidate-a"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  const route = {
    id: "route-01",
    label: "Editorial monument",
    familyId: "editorial-monument",
    navigation: "quiet-corner",
    heroGeometry: "typographic-monument",
    servicePresentation: "magazine-ledger",
    sectionRhythm: "slow-chapters",
    typographyCategory: "monumental-serif",
    imageStrategy: "editorial-tableaux",
    motionOpportunity: "masked-image-reveal",
  };
  const manifest = buildCandidateManifest({
    candidate: { candidateId: "candidate-a" },
    route,
    model: "test/model",
    contentManifestDigest: "content-digest",
    assets: ["content.hero.image"],
  });
  await fs.writeFile(path.join(root, "src/site.config.json"), JSON.stringify({ design: { recipe: "general-editorial", sections: [] } }));
  await fs.writeFile(path.join(root, "candidate-a/metadata.json"), JSON.stringify({ ...manifest, creativeManifest: manifest }));
  await fs.writeFile(
    path.join(root, "candidate-a/Experience.jsx"),
    `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal"><nav data-navigation-geometry="quiet-corner-links"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><img src={content.hero.image} alt={content.hero.heading} style={{ display: "none" }} /><h1>{content.hero.heading}</h1><button data-early-conversion data-cta-placement="after-hero-image">{content.hero.primaryLabel}</button></section>
    <section data-reference-section="image-chapter"></section>
    <section data-reference-section="editorial-intro"></section>
    <section data-reference-section="image-mosaic"></section>
    <section id="services" data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive">{content.services.map((service) => <p key={service.name}>{service.name}</p>)}</section>
    <section data-reference-section="closing-scene" data-reference-signature="closing-scene"><p>{content.hero.body}</p></section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary></details>)}</section>
    <section id="contact" data-reference-section="contact"><LeadForm content={content} runtime={runtime} /></section></main>;
}`,
  );
  await fs.writeFile(path.join(root, "candidate-a/styles.css"), "[data-hero]{min-height:40rem}[data-reference-signature]{display:block;min-height:5rem}");
  await fs.writeFile(path.join(root, "candidate-a/motion.js"), "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}; return () => {}; }");
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("creative candidate promotion", () => {
  it("copies a validated candidate and switches the site renderer", async () => {
    const root = await makeFixture();
    const result = await promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" });
    expect(result.candidateId).toBe("candidate-a");
    expect(await fs.readFile(path.join(root, "src/generated-experiences/selected/Experience.jsx"), "utf8")).toContain("LeadForm");
    const config = JSON.parse(await fs.readFile(path.join(root, "src/site.config.json"), "utf8"));
    expect(config.design.experience.renderer).toBe("creative-candidate");
    expect(config.design.experience.familyId).toBe("editorial-monument");
  });

  it("normalizes service slug fragments to real SEO routes before promotion", async () => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      source.replace(
        "{content.services.map((service) => <p key={service.name}>{service.name}</p>)}",
        "{content.services.map((service) => <a href={`#${service.slug}`} key={service.name}>{service.name}</a>)}",
      ),
    );

    await promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" });

    const selected = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/Experience.jsx"),
      "utf8",
    );
    expect(selected).toContain("/services/${service.slug}/");
    expect(selected).not.toContain("href={`#${service.slug}`}");
  });

  it("rejects a candidate that bypasses the shared runtime", async () => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(file, source.replace('import { LeadForm } from "@launchloom/runtime";\n', ""));
    await expect(promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" })).rejects.toThrow(/shared LeadForm runtime/iu);
  });

  it("renders a candidate in the real Astro shell before reporting diversity fallback", async () => {
    const root = await makeFixture();
    const report = await runCreativeBakeoff({
      siteDir: path.resolve("templates/client-site"),
      candidatesDir: root,
      reportPath: path.join(root, "report.json"),
      screenshotsDir: path.join(root, "screenshots"),
    });
    expect(report.candidates[0].valid).toBe(true);
    expect(report.candidates[0].eligible).toBe(false);
    expect(report.fallback).toBe(true);
    expect(report.selectedCandidateId).toBeNull();
  }, 45_000);

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

    const siteRoot = path.resolve("templates/client-site");
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

    const renderedReferenceEvaluator = async () => ({
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
    });

    try {
      const report = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-diversity-report.json"),
        screenshotsDir: path.join(root, "v2-diversity-screenshots"),
        renderedReferenceEvaluator,
        renderedDiversityEvaluator: async () => ({
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
                reason: "Rendered compositions are materially different.",
              },
            ],
            genericFallbackDetected: false,
            summary: "Rendered candidates are visually distinct.",
          },
        }),
      });

      expect(report.diversity.pass).toBe(false);
      expect(report.visualDiversity.pass).toBe(true);
      expect(report.candidates.every((candidate: any) => candidate.eligible)).toBe(
        true,
      );
      expect(report.selectedCandidateId).not.toBeNull();
      expect(report.promotionReady).toBe(true);

      const blocked = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-diversity-blocked-report.json"),
        screenshotsDir: path.join(root, "v2-diversity-blocked-screenshots"),
        promote: true,
        requireDiversity: false,
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
      const blockedConfig = JSON.parse(
        await fs.readFile(configPath, "utf8"),
      );
      expect(blockedConfig.design?.experience?.renderer).not.toBe(
        "creative-candidate",
      );
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 60_000);

  it("blocks a version-two preview when rendered reference markers remain wrong", async () => {
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
    const experiencePath = path.join(root, "candidate-a/Experience.jsx");
    const experience = await fs.readFile(experiencePath, "utf8");
    await fs.writeFile(
      experiencePath,
      experience
        .replace("single-column-editorial-chapters", "wrong-layout")
        .replace("masked-image-reveal", "wrong-motion")
        .replace("quiet-corner-links", "wrong-navigation")
        .replace("typographic-monument", "wrong-hero")
        .replace("magazine-archive-ledger", "wrong-services")
        .replace("after-hero-image", "wrong-cta"),
    );
    const siteRoot = path.resolve("templates/client-site");
    const configPath = path.join(siteRoot, "src/site.config.json");
    const selectedPath = path.join(siteRoot, "src/generated-experiences/selected");
    const selectedBackup = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-selected-"));
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
      expect(report.candidates[0].valid).toBe(true);
      expect(report.candidates[0].referenceFidelity.sourceVisualFindings.length).toBeGreaterThan(0);
      expect(
        new Set(
          report.candidates[0].referenceFidelity.renderedVisualFindings.map(
            (item: any) => item.viewport,
          ),
        ),
      ).toEqual(new Set(["desktop", "compact", "mobile"]));
      expect(report.candidates[0].eligible).toBe(false);
      expect(report.candidates[0].referenceFidelity.renderedContractPass).toBe(false);
      expect(report.selectedCandidateId).toBeNull();
      expect(report.fallback).toBe(true);
      expect(report.promotionReady).toBe(false);
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.design?.experience?.selectionMode).not.toBe("creative-preview");
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 45_000);
});
