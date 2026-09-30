import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { promoteCreativeCandidate } from "../scripts/promote-creative-candidate.mjs";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";

const tempRoots: string[] = [];

const validServicePage = `import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service }) {
  return <main data-service-page data-service-slug={service.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-service-hero><h1>{service.name}</h1><p>{service.description}</p></section>
    <section data-service-support><p>{service.support.scope}</p><p>{service.support.preparation}</p><p>{service.support.nextStep}</p></section>
    <section data-service-related><ul>{service.related.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    {service.process.length > 0 && <ol>{service.process.map((step) => <li key={step}>{step}</li>)}</ol>}
    {service.faqs.length > 0 && <section>{service.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;

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
  return <main><nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><section data-hero><div data-hero-copy><h1>{content.hero.heading}</h1><button data-early-conversion>{content.hero.primaryLabel}</button></div><img src={content.hero.image} alt={content.hero.heading} data-hero-media hidden /></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name}</p>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section></main>;
}`,
  );
  await fs.writeFile(path.join(root, "candidate-a/styles.css"), "[data-hero]{min-height:40rem}");
  await fs.writeFile(path.join(root, "candidate-a/motion.js"), "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}; return () => {}; }");
  await writeV2ContentManifest(root);
  return root;
}

async function writeV2ContentManifest(
  root: string,
  directory = "candidate-a",
) {
  await fs.writeFile(
    path.join(root, directory, "content-manifest.json"),
    JSON.stringify({
      version: 2,
      values: {
        brand: { phone: "+12125550186", email: "studio@example.test" },
        hero: {
          heading: "A considered local service",
          primaryLabel: "Request a consultation",
          image: "/images/hero.webp",
        },
        services: [],
        faqs: [],
      },
      tokens: [],
      visualBrief: {
        palette: {},
        tone: "",
        preference: "",
        visualDirection: "",
        artDirection: "",
      },
    }),
  );
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("creative candidate promotion", () => {
  it("keeps the selected manifest untouched for a source-only feedback preview", async () => {
    const root = await makeFixture();
    const selected = path.join(root, "src/generated-experiences/selected");
    await fs.mkdir(selected, { recursive: true });
    await fs.writeFile(
      path.join(selected, "manifest.json"),
      "original selected manifest\n",
    );
    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
      preserveSelectedManifest: true,
    });
    expect(
      await fs.readFile(path.join(selected, "manifest.json"), "utf8"),
    ).toBe("original selected manifest\n");
    expect(
      await fs.readFile(path.join(selected, "Experience.jsx"), "utf8"),
    ).toContain("LeadForm");
  });
  it("omits validator-rejected candidates from a later bakeoff", async () => {
    const root = await makeFixture();

    await expect(
      runCreativeBakeoff({
        siteDir: root,
        candidatesDir: ".",
        reportPath: path.join(root, "excluded-report.json"),
        screenshotsDir: path.join(root, "excluded-screenshots"),
        preview: true,
        excludedCandidateIds: ["candidate-a"],
      }),
    ).rejects.toThrow(
      /No creative candidates remain after exclusions.*candidate-a/iu,
    );
  });

  it("does not allow candidate exclusions during promotion", async () => {
    const root = await makeFixture();

    await expect(
      runCreativeBakeoff({
        siteDir: root,
        candidatesDir: ".",
        promote: true,
        excludedCandidateIds: ["candidate-a"],
      }),
    ).rejects.toThrow(/only supported for non-promoting preview reruns/iu);
  });

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

  it("copies the authored service page and enables the service renderer", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/ServicePage.jsx"),
      validServicePage,
    );

    await promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" });

    const selected = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/ServicePage.jsx"),
      "utf8",
    );
    expect(selected).toContain("data-service-page");
    expect(selected).toContain("/services/${item.slug}/");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.servicePage).toBe(true);
  });

  it("keeps the fallback service page for a candidate that predates it", async () => {
    const root = await makeFixture();

    await promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" });

    const selected = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/ServicePage.jsx"),
      "utf8",
    );
    expect(selected).toContain("export default function ServicePage()");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.servicePage).toBe(false);
  });

  it("rejects an authored service page that bypasses the shared runtime", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/ServicePage.jsx"),
      validServicePage.replace(
        'import { LeadForm } from "@launchloom/runtime";\n',
        "",
      ),
    );

    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/LeadForm/u);
  });

  it("rejects a candidate that bypasses the shared runtime", async () => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(file, source.replace('import { LeadForm } from "@launchloom/runtime";\n', ""));
    await expect(promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" })).rejects.toThrow(/shared (?:LeadForm|LaunchLoom) runtime/iu);
  });

  it("revalidates URL safety at the promotion boundary", async () => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      source.replace(
        "<section data-hero>",
        '<section data-hero><object data="data:text/html,unsafe" />',
      ),
    );

    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/unsafe URL attribute data on <object>/iu);
  });

  it.each([
    ["style element", (source: string) => source.replace("<main>", "<main><style></style>")],
    ["inline style", (source: string) => source.replace("<main>", '<main style="color:red">')],
  ])("rejects a candidate with an Experience.jsx %s", async (_label, edit) => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(file, edit(source));

    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/inline styles; visual rules belong in styles\.css/iu);
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

  it("renders the authored service page with the homepage visual identity", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/ServicePage.jsx"),
      validServicePage,
    );
    await fs.writeFile(
      path.join(root, "candidate-a/styles.css"),
      "body{background:rgb(16,18,20);color:rgb(240,240,240)}h1{font-family:Georgia,serif;font-weight:700}",
    );
    const report = await runCreativeBakeoff({
      siteDir: path.resolve("templates/client-site"),
      candidatesDir: root,
      reportPath: path.join(root, "service-report.json"),
      screenshotsDir: path.join(root, "service-screenshots"),
      preview: true,
      requireDiversity: false,
    });
    const candidate = report.candidates[0];
    expect(candidate.servicePage?.slug).toBe("skin-renewal");
    expect(candidate.servicePage?.failures).toEqual([]);
    expect(candidate.servicePage?.pass).toBe(true);
  }, 120_000);

  it("rejects a version-two candidate before rendering when its content manifest is missing", async () => {
    const root = await makeFixture();
    await fs.rm(path.join(root, "candidate-a/content-manifest.json"));
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

    const report = await runCreativeBakeoff({
      siteDir: path.resolve("templates/client-site"),
      candidatesDir: root,
      reportPath: path.join(root, "missing-brief-report.json"),
      screenshotsDir: path.join(root, "missing-brief-screenshots"),
      preview: true,
    });

    expect(report.candidates[0].valid).toBe(false);
    expect(report.candidates[0].viewports).toHaveLength(0);
    expect(report.candidates[0].failures).toContain(
      "Version-2 creative candidates require a valid content-manifest.json with visualBrief.",
    );
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

    const fidelityEvidence: any[] = [];
    const diversityEvidence: any[] = [];
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
      const viewportImage = await sharp(firstEvidence.candidateScreenshots.desktop).metadata();
      const pageOverview = await sharp(firstEvidence.candidateScreenshots.fullDesktop).metadata();
      expect({ width: viewportImage.width, height: viewportImage.height }).toEqual({ width: 1536, height: 864 });
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
      expect(report.candidates.every((candidate: any) => candidate.eligible)).toBe(
        true,
      );
      expect(report.selectedCandidateId).not.toBeNull();
      expect(report.promotionReady).toBe(true);

      const convergedPreview = await runCreativeBakeoff({
        siteDir: siteRoot,
        candidatesDir: root,
        reportPath: path.join(root, "v2-preview-converged-report.json"),
        screenshotsDir: path.join(root, "v2-preview-converged-screenshots"),
        preview: true,
        deferPromotion: true,
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
      expect(blockedConfig).toEqual(JSON.parse(originalConfig));
    } finally {
      await fs.writeFile(configPath, originalConfig);
      await fs.rm(selectedPath, { recursive: true, force: true });
      await fs.cp(selectedBackup, selectedPath, { recursive: true });
      await fs.rm(selectedBackup, { recursive: true, force: true });
    }
  }, 180_000);

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
        .replace("<main>", '<main data-mobile-recomposition="wrong-layout" data-motion-primitive="wrong-motion">')
        .replace("<nav>", '<nav data-navigation-geometry="wrong-navigation">')
        .replace("<section data-hero>", '<section data-hero data-hero-geometry="wrong-hero"><img src={content.hero.image} alt={content.hero.heading} data-hero-media hidden />')
        .replace('<section id="services">', '<section id="services" data-service-presentation="wrong-services">')
        .replace("<button data-early-conversion>", '<button data-early-conversion data-cta-placement="wrong-cta">'),
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
      expect(report.candidates[0].valid).toBe(false);
      expect(
        report.candidates[0].compositionGeometryByViewport.desktop.pass,
      ).toBe(false);
      expect(
        report.candidates[0].compositionGeometryByViewport.desktop.findings.map(
          (finding: any) => finding.code,
        ),
      ).toContain("media-overlay-image");
      expect(report.candidates[0].referenceFidelity.sourceVisualFindings.length).toBeGreaterThan(0);
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
  }, 90_000);

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
  }, 90_000);
});
