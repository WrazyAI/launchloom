import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { promoteCreativeCandidate } from "../scripts/promote-creative-candidate.mjs";
import {
  fullPageCaptureErrors,
  prepareFullPageCapture,
  runCreativeBakeoff,
} from "../scripts/run-creative-bakeoff.mjs";

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
  await fs.writeFile(
    path.join(root, "src/site.config.json"),
    JSON.stringify({ design: { recipe: "general-editorial", sections: [] } }),
  );
  await fs.writeFile(
    path.join(root, "candidate-a/metadata.json"),
    JSON.stringify({ ...manifest, creativeManifest: manifest }),
  );
  await fs.writeFile(
    path.join(root, "candidate-a/Experience.jsx"),
    `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main><nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><section data-hero><img src={content.hero.image} alt={content.hero.heading} style={{ display: "none" }} /><h1>{content.hero.heading}</h1><button data-early-conversion>{content.hero.primaryLabel}</button></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name}</p>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section></main>;
}`,
  );
  await fs.writeFile(
    path.join(root, "candidate-a/styles.css"),
    "[data-hero]{min-height:40rem}",
  );
  await fs.writeFile(
    path.join(root, "candidate-a/motion.js"),
    "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}; return () => {}; }",
  );
  return root;
}

async function makeClientSiteFixture(root: string) {
  const source = path.resolve("templates/client-site");
  const siteDir = path.join(root, "client-site");
  await fs.cp(source, siteDir, {
    recursive: true,
    filter: (entry) =>
      !entry
        .split(path.sep)
        .some((segment) =>
          ["node_modules", ".astro", "dist"].includes(segment),
        ),
  });
  return siteDir;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("creative candidate promotion", () => {
  it("records browser errors that first occur during full-page capture", () => {
    expect(
      fullPageCaptureErrors(
        ["before capture", "reveal hook failed"],
        1,
        "mobile",
      ),
    ).toEqual([
      "mobile: browser error during full-page capture: reveal hook failed",
    ]);
  });

  it("scrolls through reveal content before taking a full-page overview", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 800 },
      });
      await page.setContent(`<!doctype html><html><head><style>
        html, body { margin: 0; }
        main { height: 2400px; }
        #revealed { position: absolute; top: 1500px; opacity: 0; }
        #revealed.visible { opacity: 1; }
      </style></head><body><main></main><p id="revealed">A scroll-revealed image chapter</p>
      <script>
        let scheduled = false;
        window.addEventListener("scroll", () => {
          if (window.scrollY < 900 || scheduled) return;
          scheduled = true;
          setTimeout(() => document.querySelector("#revealed").classList.add("visible"), 100);
        });
      </script></body></html>`);

      await prepareFullPageCapture(page, { viewportHeight: 800 });

      expect(await page.locator("#revealed").getAttribute("class")).toMatch(
        /visible/u,
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await browser.close();
    }
  }, 15_000);

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
    const result = await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });
    expect(result.candidateId).toBe("candidate-a");
    expect(
      await fs.readFile(
        path.join(root, "src/generated-experiences/selected/Experience.jsx"),
        "utf8",
      ),
    ).toContain("LeadForm");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
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

    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });

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
    await fs.writeFile(
      file,
      source.replace('import { LeadForm } from "@launchloom/runtime";\n', ""),
    );
    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/shared LeadForm runtime/iu);
  });

  it("renders a candidate in the real Astro shell before reporting diversity fallback", async () => {
    const root = await makeFixture();
    const siteDir = await makeClientSiteFixture(root);
    const report = await runCreativeBakeoff({
      siteDir,
      candidatesDir: root,
      reportPath: path.join(root, "report.json"),
      screenshotsDir: path.join(root, "screenshots"),
    });
    expect(report.candidates[0].valid).toBe(true);
    expect(report.candidates[0].eligible).toBe(false);
    expect(report.fallback).toBe(true);
    expect(report.selectedCandidateId).toBeNull();
  }, 240_000);

  it("persists isolated client command diagnostics in the candidate report", async () => {
    const root = await makeFixture();
    const siteDir = await makeClientSiteFixture(root);
    const failure = new Error(
      'Client command "npm" failed: sudo exited with 1',
    );
    Object.defineProperty(failure, "clientProcessDiagnostic", {
      value: {
        command: "npm",
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "Astro error: missing export from the candidate component.",
      },
      enumerable: false,
    });

    const report = await runCreativeBakeoff({
      siteDir,
      candidatesDir: root,
      reportPath: path.join(root, "failed-render-report.json"),
      screenshotsDir: path.join(root, "failed-render-screenshots"),
      preview: true,
      runClientProcessImpl: async () => {
        throw failure;
      },
    });

    expect(report.candidates[0].commandDiagnostics).toEqual([
      {
        stage: "client-build",
        command: "npm",
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "Astro error: missing export from the candidate component.",
      },
    ]);
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "failed-render-report.json"), "utf8"),
      ).candidates[0].commandDiagnostics[0].stderr,
    ).toContain("missing export");
  }, 45_000);

  it("uses rendered diversity as the sole v2 production diversity authority", async () => {
    const root = await makeFixture();
    const experiencePath = path.join(root, "candidate-a/Experience.jsx");
    const experience = await fs.readFile(experiencePath, "utf8");
    await fs.writeFile(
      experiencePath,
      experience.replace(
        'style={{ display: "none" }}',
        'style={{ display: "block", width: "50vw", height: "100px", marginLeft: "auto", marginRight: "auto" }}',
      ),
    );
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

    const siteRoot = await makeClientSiteFixture(root);
    const configPath = path.join(siteRoot, "src/site.config.json");
    const originalConfig = await fs.readFile(configPath, "utf8");

    const fidelityEvidence: any[] = [];
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
      const firstEvidence = fidelityEvidence[0];
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
      expect(
        firstEvidence.renderedGeometry.desktop.openingImage.widthRatio,
      ).toBeCloseTo(0.5, 2);
      expect(
        firstEvidence.renderedGeometry.desktop.openingImage.centerOffsetRatio,
      ).toBeCloseTo(0, 2);
      expect(
        firstEvidence.renderedGeometry.desktop.headline.widthRatio,
      ).toBeGreaterThan(0);
      expect(
        firstEvidence.renderedGeometry.mobile.openingImage.widthRatio,
      ).toBeCloseTo(0.5, 2);
      expect(report.visualDiversity.pass).toBe(true);
      expect(
        report.candidates.every((candidate: any) => candidate.eligible),
      ).toBe(true);
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
      const blockedConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(blockedConfig).toEqual(JSON.parse(originalConfig));
    } finally {
      await fs.writeFile(configPath, originalConfig);
    }
  }, 300_000);

  it("selects a version-two candidate for preview before diversity promotion", async () => {
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
        .replace(
          "<main>",
          '<main data-mobile-recomposition="wrong-layout" data-motion-primitive="wrong-motion">',
        )
        .replace("<nav>", '<nav data-navigation-geometry="wrong-navigation">')
        .replace(
          "<section data-hero>",
          '<section data-hero data-hero-geometry="wrong-hero"><img src={content.hero.image} alt={content.hero.heading} style={{ display: "none" }} />',
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
    const siteRoot = await makeClientSiteFixture(root);
    const configPath = path.join(siteRoot, "src/site.config.json");
    const originalConfig = await fs.readFile(configPath, "utf8");
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
      expect(report.candidates[0].eligible).toBe(true);
      expect(report.selectedCandidateId).toBe("candidate-a");
      expect(report.fallback).toBe(false);
      expect(report.promotionReady).toBe(false);
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.design.experience.selectionMode).toBe("creative-preview");
    } finally {
      await fs.writeFile(configPath, originalConfig);
    }
  }, 45_000);
});
