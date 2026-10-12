import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeCss,
  analyzeHtml,
  mapSections,
} from "../scripts/reference-pack-converter.mjs";
import { loadReferenceTemplate } from "../scripts/reference-template.mjs";

const sampleHtml = `<!doctype html>
<html>
  <head>
    <style>:root { --brand: #2f4b7c; }</style>
  </head>
  <body>
    <header class="hero masthead"><h1>Considered care</h1></header>
    <section id="services" class="service-ledger"><h2>Care</h2></section>
    <section id="faq" class="questions"><h2>Questions</h2></section>
    <section id="contact" class="enquiry"><h2>Contact</h2></section>
    <img src="/one.webp" alt="" />
    <img src="/two.webp" alt="" />
    <form><button>Send</button></form>
  </body>
</html>`;

describe("reference pack converter", () => {
  it("extracts structure, markers, and media from HTML", () => {
    const structure = analyzeHtml(sampleHtml);
    expect(structure.headings.map((heading) => heading.text)).toEqual([
      "Considered care",
      "Care",
      "Questions",
      "Contact",
    ]);
    expect(structure.sections.map((section) => section.marker)).toContain(
      "service-ledger",
    );
    expect(structure.ids).toContain("services");
    expect(structure.media.images).toBe(2);
    expect(structure.interactive.forms).toBe(1);
    expect(structure.colors).toContain("#2f4b7c");
  });

  it("maps observed markers onto pack section targets", () => {
    const mapped = mapSections(analyzeHtml(sampleHtml));
    const targets = mapped.map((entry) => entry.target);
    expect(targets).toContain("services");
    expect(targets).toContain("faq");
    expect(targets).toContain("contact");
  });

  it("extracts layout and motion hints from CSS", () => {
    const styles = analyzeCss([
      "@media (max-width: 760px) { .row { grid-template-columns: 1fr; } }",
      ".row { grid-template-columns: repeat(3, 1fr); transition: transform 200ms ease; }",
      "body { font-family: Georgia, serif; color: #15161a; }",
    ]);
    expect(styles.mediaQueries.some((query) => query.includes("760px"))).toBe(
      true,
    );
    expect(styles.gridTemplates.length).toBeGreaterThan(0);
    expect(styles.transitions.length).toBeGreaterThan(0);
    expect(styles.colors).toContain("#15161a");
    expect(styles.fonts.join(" ")).toContain("Georgia");
  });

  it("keeps committed pilot briefs bound to their extracted templates", () => {
    const root = path.resolve(".");
    const dossierIds = [
      "html5up-dental-dimension",
      "colorlib-caseworth-legal-ledger",
      "spicer-law-firm-results-ledger",
    ];
    for (const dossierId of dossierIds) {
      const dossierPath = `data/reference-library/dossiers/${dossierId}`;
      const briefPath = path.join(root, dossierPath, "pack-brief.json");
      expect(fs.existsSync(briefPath)).toBe(true);
      const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
      const template = loadReferenceTemplate(dossierPath, {
        repositoryRoot: root,
      });
      expect(template).not.toBeNull();
      if (!template)
        throw new Error("expected an extracted reference template");
      expect(brief.dossierId).toBe(dossierId);
      expect(brief.templateDigest).toBe(template.digest);
      expect(brief.sectionMap.length).toBeGreaterThan(0);
      expect(brief.structure.headings.length).toBeGreaterThan(0);
    }
  });
});
