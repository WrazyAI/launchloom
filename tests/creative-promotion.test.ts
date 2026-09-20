import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCandidateManifest } from "../scripts/creative-compiler.mjs";
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
  return <main><nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav><section data-hero><h1>{content.hero.heading}</h1><button data-early-conversion>{content.hero.primaryLabel}</button></section>
    <section id="services">{content.services.map((service) => <p key={service.name}>{service.name}</p>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section></main>;
}`,
  );
  await fs.writeFile(path.join(root, "candidate-a/styles.css"), "[data-hero]{min-height:40rem}");
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

  it("selects the valid authored candidate for preview before diversity promotion", async () => {
    const root = await makeFixture();
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
      });
      expect(report.candidates[0].valid).toBe(true);
      expect(report.candidates[0].eligible).toBe(false);
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
  }, 45_000);
});
