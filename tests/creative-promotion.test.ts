import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { promoteCreativeCandidate } from "../scripts/promote-creative-candidate.mjs";
import { runCreativeBakeoff } from "../scripts/run-creative-bakeoff.mjs";
import {
  cleanupTempRoots,
  makeFixture,
  makeTemplateCopy,
  validLocationPage,
  validServicePage,
  validServicesIndexPage,
} from "./helpers/creative-promotion-fixtures";

afterEach(cleanupTempRoots);

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
    expect(config.design.experience.routeId).toBe("route-01");
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

  it("copies the authored service page and enables the service renderer", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/ServicePage.jsx"),
      "```jsx\n" + validServicePage + "\n```",
    );

    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });

    const selected = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/ServicePage.jsx"),
      "utf8",
    );
    expect(selected).toContain("data-service-page");
    expect(selected).not.toContain("```");
    expect(selected).toContain("/services/${item.slug}/");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.servicePage).toBe(true);
  });

  it("keeps the fallback service page for a candidate that predates it", async () => {
    const root = await makeFixture();

    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });

    const selected = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/ServicePage.jsx"),
      "utf8",
    );
    expect(selected).toContain("export default function ServicePage(_props)");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.servicePage).toBe(false);
  });

  it("copies authored location and services-index pages and enables their renderers", async () => {
    const root = await makeFixture();
    await fs.writeFile(
      path.join(root, "candidate-a/LocationPage.jsx"),
      validLocationPage,
    );
    await fs.writeFile(
      path.join(root, "candidate-a/ServicesIndexPage.jsx"),
      validServicesIndexPage,
    );

    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });

    const selectedLocation = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/LocationPage.jsx"),
      "utf8",
    );
    const selectedIndex = await fs.readFile(
      path.join(
        root,
        "src/generated-experiences/selected/ServicesIndexPage.jsx",
      ),
      "utf8",
    );
    expect(selectedLocation).toContain("data-location-page");
    expect(selectedIndex).toContain("data-services-index");
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.locationPage).toBe(true);
    expect(config.design.experience.servicesIndex).toBe(true);
  });

  it("keeps the fallback location and services-index pages when absent", async () => {
    const root = await makeFixture();

    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: "candidate-a",
    });

    const selectedLocation = await fs.readFile(
      path.join(root, "src/generated-experiences/selected/LocationPage.jsx"),
      "utf8",
    );
    const selectedIndex = await fs.readFile(
      path.join(
        root,
        "src/generated-experiences/selected/ServicesIndexPage.jsx",
      ),
      "utf8",
    );
    expect(selectedLocation).toContain(
      "export default function LocationPage(_props)",
    );
    expect(selectedIndex).toContain(
      "export default function ServicesIndexPage(_props)",
    );
    const config = JSON.parse(
      await fs.readFile(path.join(root, "src/site.config.json"), "utf8"),
    );
    expect(config.design.experience.locationPage).toBe(false);
    expect(config.design.experience.servicesIndex).toBe(false);
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
    await fs.writeFile(
      file,
      source.replace('import { LeadForm } from "@launchloom/runtime";\n', ""),
    );
    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/shared (?:LeadForm|LaunchLoom) runtime/iu);
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
    [
      "style element",
      (source: string) => source.replace("<main>", "<main><style></style>"),
    ],
    [
      "inline style",
      (source: string) => source.replace("<main>", '<main style="color:red">'),
    ],
  ])("rejects a candidate with an Experience.jsx %s", async (_label, edit) => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(file, edit(source));

    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/inline styles; visual rules belong in styles\.css/iu);
  });

  it.each([
    [
      "style element",
      (source: string) => source.replace("<main>", "<main><style></style>"),
    ],
    [
      "inline style",
      (source: string) => source.replace("<main>", '<main style="color:red">'),
    ],
  ])("rejects a candidate with an Experience.jsx %s", async (_label, edit) => {
    const root = await makeFixture();
    const file = path.join(root, "candidate-a/Experience.jsx");
    const source = await fs.readFile(file, "utf8");
    await fs.writeFile(file, edit(source));

    await expect(
      promoteCreativeCandidate({ siteDir: root, candidateDir: "candidate-a" }),
    ).rejects.toThrow(/inline styles; visual rules belong in styles\.css/iu);
  });

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
      siteDir: await makeTemplateCopy(),
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
});
