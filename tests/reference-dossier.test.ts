import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promptImageDimensions, promptImagePart } from "../scripts/prompt-evidence.mjs";
import {
  loadReferenceDossier,
  referenceDossierPromptBlock,
} from "../scripts/reference-dossier.mjs";

const temporaryRoots: string[] = [];

function png(width: number, height: number) {
  const value = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(value);
  value.write("IHDR", 12, "ascii");
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
}

function createDossier(overrides: Record<string, unknown> = {}) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "launchloom-dossier-"));
  temporaryRoots.push(repositoryRoot);
  const directory = path.join(repositoryRoot, "dossiers", "sample-reference");
  fs.mkdirSync(path.join(directory, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(directory, "screenshots", "desktop.png"), png(1440, 3200));
  fs.writeFileSync(path.join(directory, "screenshots", "mobile.png"), png(390, 3600));
  fs.writeFileSync(
    path.join(directory, "design-prompt.md"),
    `# Reference implementation brief\n\n## Visual hierarchy\n\nA focused opening with a distinct typographic scale, clear conversion action, considered image crop, and generous negative space. Keep the promise concise and make the primary action visible without scrolling.\n\n## Page sequence\n\nOpening, evidence-led service presentation, concise questions, and an unmistakable contact close. Each chapter should have a separate visual rhythm and avoid repeating the same card grammar.\n\n## Responsive translation\n\nAt mobile width, preserve the opening hierarchy, make the imagery intentional rather than merely stacked, keep all navigation and calls to action touch-safe, and remove any effect that causes horizontal overflow.\n\n## Signature elements\n\nUse the reference's unique image composition and direct service index as visible signatures.\n\n## Prohibited patterns\n\nDo not turn the page into a generic split hero, rounded-card wall, repeated accordion, or late-only contact funnel.\n`,
  );
  const referenceDna = {
    annotatedDescription: "The reference opens with an oversized centered promise, one compact action, and a quiet image composition. The following chapters alternate a highly scannable service index with proof and a direct contact close.",
    heroGeometry: { mode: "centered-poster", alignment: "centered", viewport: "opening fits one screen" },
    navigationGeometry: { mode: "quiet-inline", placement: "top edge", mobile: "compact menu" },
    typography: { display: "editorial serif", body: "neutral sans", scale: "large and restrained" },
    palette: { surfaces: ["warm white"], ink: "deep green", accents: ["copper"], contrastIntent: "clear contrast" },
    imageTreatment: { mode: "documentary scene", crop: "subject-safe", focalPoint: "subject" },
    sectionSequence: ["hero", "services", "faq", "contact"],
    servicePresentation: { pattern: "ruled service index", interaction: "row focus" },
    ctaPlacement: { primary: "in hero", secondary: "contact close", early: "inside opening" },
    motion: { primitive: "image reveal", library: "native css", reducedMotion: "show static image" },
    mobileRecomposition: { strategy: "stacked editorial chapters", rules: ["preserve image hierarchy", "avoid horizontal overflow"] },
    prohibitedPatterns: ["generic-split-hero", "generic-card-wall", "repeated-accordion"],
    requiredSignatureElements: [{ id: "service-index", selector: "[data-reference-signature=service-index]", description: "open service index" }],
    acceptanceChecks: ["opening promise and action are visible", "services are easy to scan", "mobile retains the image treatment"],
  };
  const manifest = {
    schemaVersion: 1,
    id: "sample-reference",
    productionEligible: false,
    referenceName: "Sample original service study",
    familyId: "sample-editorial-service",
    source: {
      name: "LaunchLoom owned prototype",
      url: "https://example.test/original-study",
      rights: "owned",
      rightsEvidence: "Created and captured by LaunchLoom for internal design research.",
    },
    businessKinds: ["local-service"],
    evidence: {
      desktop: {
        path: "screenshots/desktop.png",
        capture: "full-page",
        viewport: { width: 1440, height: 1000 },
      },
      mobile: {
        path: "screenshots/mobile.png",
        capture: "full-page",
        viewport: { width: 390, height: 844 },
      },
    },
    referenceDna,
    review: { status: "reviewed", reviewer: "LaunchLoom design QA" },
    ...overrides,
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { repositoryRoot, dossierPath: "dossiers/sample-reference", directory, manifest };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("reference dossiers", () => {
  it("loads a complete rights-cleared dossier with full-page desktop and mobile evidence", () => {
    const fixture = createDossier();
    const dossier = loadReferenceDossier(fixture.dossierPath, {
      repositoryRoot: fixture.repositoryRoot,
    });

    expect(dossier.id).toBe("sample-reference");
    expect(dossier.productionEligible).toBe(false);
    expect(dossier.referenceDna.evidence.desktopScreenshot).toMatchObject({
      available: true,
      required: true,
      fullPage: true,
      width: 1440,
      height: 3200,
    });
    expect(dossier.referenceDna.evidence.mobileScreenshot).toMatchObject({
      available: true,
      required: true,
      fullPage: true,
      width: 390,
      height: 3600,
    });
    expect(dossier.designPrompt).toContain("## Signature elements");
    expect(dossier.digest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails closed when either required viewport capture is missing or not full-page", () => {
    const missingMobile = createDossier({
      evidence: {
        desktop: { path: "screenshots/desktop.png", capture: "full-page", viewport: { width: 1440, height: 1000 } },
      },
    });
    expect(() => loadReferenceDossier(missingMobile.dossierPath, { repositoryRoot: missingMobile.repositoryRoot })).toThrow(/mobile full-page/iu);

    const viewportOnly = createDossier({
      evidence: {
        desktop: { path: "screenshots/desktop.png", capture: "viewport", viewport: { width: 1440, height: 1000 } },
        mobile: { path: "screenshots/mobile.png", capture: "full-page", viewport: { width: 390, height: 844 } },
      },
    });
    expect(() => loadReferenceDossier(viewportOnly.dossierPath, { repositoryRoot: viewportOnly.repositoryRoot })).toThrow(/desktop capture must be full-page/iu);
  });

  it("rejects references without owned, licensed, or explicit permission-cleared rights", () => {
    const fixture = createDossier({
      source: {
        name: "A1 Gallery",
        url: "https://www.a1.gallery/website/example",
        rights: "reference-only",
        rightsEvidence: "Gallery listing inspected for visual research only.",
      },
    });
    expect(() => loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot })).toThrow(/not cleared for persistent storage/iu);
  });

  it("requires a local clearance record for licensed or permission-cleared dossiers", () => {
    const fixture = createDossier({
      source: {
        name: "Licensed design evidence",
        url: "https://example.test/license",
        rights: "permission-cleared",
        rightsEvidence: "Written permission received to retain this exact paired reference capture.",
      },
    });
    expect(() => loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot })).toThrow(/local rights evidence path/iu);
  });

  it("rejects screenshot paths that escape the dossier folder", () => {
    const fixture = createDossier({
      evidence: {
        desktop: { path: "../../outside.png", capture: "full-page", viewport: { width: 1440, height: 1000 } },
        mobile: { path: "screenshots/mobile.png", capture: "full-page", viewport: { width: 390, height: 844 } },
      },
    });
    expect(() => loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot })).toThrow(/must stay inside its dossier/iu);
  });

  it("rejects screenshot symlinks and fingerprints screenshot bytes", () => {
    const fixture = createDossier();
    const desktop = path.join(fixture.directory, "screenshots", "desktop.png");
    const external = path.join(fixture.repositoryRoot, "outside.png");
    fs.writeFileSync(external, png(1440, 3200));
    fs.unlinkSync(desktop);
    fs.symlinkSync(external, desktop);
    expect(() => loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot })).toThrow(/screenshot is missing/iu);

    fs.unlinkSync(desktop);
    fs.copyFileSync(external, desktop);
    const first = loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot });
    fs.writeFileSync(desktop, png(1440, 3201));
    const second = loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot });
    expect(second.digest).not.toBe(first.digest);
  });

  it("requires design-prompt.md to be a regular file within its dossier", () => {
    const fixture = createDossier();
    const promptPath = path.join(fixture.directory, "design-prompt.md");
    fs.unlinkSync(promptPath);
    fs.mkdirSync(promptPath);

    expect(() =>
      loadReferenceDossier(fixture.dossierPath, {
        repositoryRoot: fixture.repositoryRoot,
      }),
    ).toThrow(/design-prompt\.md must be a regular file/iu);
  });

  it("builds a bounded authoring context that keeps dossier mechanics authoritative", () => {
    const fixture = createDossier();
    const dossier = loadReferenceDossier(fixture.dossierPath, { repositoryRoot: fixture.repositoryRoot });
    const context = referenceDossierPromptBlock(dossier);
    expect(context).toContain("Do not average it with other references");
    expect(context).toContain("## Signature elements");
    expect(context).toContain("do not copy brand identity");
    expect(() => referenceDossierPromptBlock(dossier, { maximumCharacters: 12 })).toThrow(/character budget/iu);
  });

  it("can load and bound the real full-page desktop and mobile captures for model context", async () => {
    const dossier = loadReferenceDossier(
      "data/reference-library/dossiers/direct-ethos-greek-bistro",
      { repositoryRoot: path.resolve(".") },
    );
    const desktopPath = dossier.referenceDna.evidence.desktopScreenshot.absolutePath;
    const mobilePath = dossier.referenceDna.evidence.mobileScreenshot.absolutePath;
    const [desktopDimensions, mobileDimensions] = await Promise.all([
      promptImageDimensions(desktopPath),
      promptImageDimensions(mobilePath),
    ]);
    expect(desktopDimensions.width).toBe(1440);
    expect(mobileDimensions.width).toBe(390);

    for (const filePath of [desktopPath, mobilePath]) {
      const part = await promptImagePart(filePath);
      const dataUrl = part.image_url.url;
      const imageBytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/u);
      expect(imageBytes.length).toBeLessThanOrEqual(900_000);
    }
  });

});
