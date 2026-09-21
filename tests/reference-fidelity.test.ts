import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { validateReferenceCandidate } from "../scripts/reference-fidelity.mjs";

const record = JSON.parse(fs.readFileSync("data/inspiration-registry.json", "utf8")).records[0];
const dna = buildReferenceDna(record, { requireEvidence: true });
const validExperience = `<main data-mobile-recomposition="single-column-editorial-chapters" data-motion-primitive="masked-image-reveal"><nav data-navigation-geometry="quiet-corner-links"></nav><section data-reference-section="hero" data-hero data-hero-geometry="typographic-monument" data-reference-signature="editorial-monument"><h1>{content.hero.heading}</h1><img src={content.hero.image} /></section><section data-reference-section="image-chapter"></section><section data-reference-section="editorial-intro"></section><section data-reference-section="image-mosaic"></section><section id="services" data-reference-section="magazine-archive" data-service-presentation="magazine-archive-ledger" data-reference-signature="magazine-archive">{content.services}</section><section data-reference-section="closing-scene" data-reference-signature="closing-scene"></section><section id="faqs">{content.faqs}</section><section id="contact"><a data-early-conversion data-cta-placement="after-hero-image"></a></section></main>`;
const validStyles = `:root { --ll-creative-ink: #fff; } @media (max-width: 700px) { main { display:block; } }`;
const validMotion = `export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }`;

describe("reference fidelity validator", () => {
  it("requires signatures, geometry, tokens, and mobile evidence", () => {
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: validExperience, stylesSource: validStyles, motionSource: validMotion });
    expect(report.pass).toBe(true);
    expect(report.score).toBe(100);
  });

  it("blocks a generic pattern and token collision", () => {
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: `${validExperience} <div data-layout="generic-split-hero" />`, stylesSource: `:root { --ink: #fff; }`, motionSource: validMotion });
    expect(report.pass).toBe(false);
    expect(report.findings.map((item: any) => item.code)).toEqual(expect.arrayContaining(["prohibited-pattern", "css-token-collision"]));
  });

  it("ignores prohibited words outside relevant attribute values", () => {
    const report = validateReferenceCandidate({
      referenceDna: { ...dna, prohibitedPatterns: [...dna.prohibitedPatterns, "cards", "grid"] },
      experienceSource: `${validExperience}<p>Browse cards in a grid.</p><div className="gridiron" data-description="cards" />`,
      stylesSource: `${validStyles} .cards { display: grid; } /* generic-split-hero */`,
      motionSource: `${validMotion}\n// cards in a grid`,
    });
    expect(report.pass).toBe(true);
  });

  it.each(["data-reference-pattern", "data-layout", "data-grammar", "className", "class"])("detects prohibited patterns in %s values", (attribute) => {
    const report = validateReferenceCandidate({
      referenceDna: { ...dna, prohibitedPatterns: [...dna.prohibitedPatterns, "cards"] },
      experienceSource: `${validExperience}<div ${attribute} = "feature cards" />`,
      stylesSource: validStyles,
      motionSource: validMotion,
    });
    expect(report.findings).toContainEqual(expect.objectContaining({ code: "prohibited-pattern" }));
  });

  it("accepts human-readable marker values that normalize to the contract slugs", () => {
    const humanReadable = validExperience
      .replace("single-column-editorial-chapters", "single column editorial chapters")
      .replace("masked-image-reveal", "masked image reveal")
      .replace("quiet-corner-links", "quiet corner links")
      .replace("typographic-monument", "typographic monument")
      .replace("magazine-archive-ledger", "magazine archive ledger")
      .replace("after-hero-image", "after hero image");
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: humanReadable, stylesSource: validStyles, motionSource: validMotion });
    expect(report.pass).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("accepts destructured sealed collection bindings", () => {
    const destructured = validExperience
      .replace("<main ", "const { services, faqs } = content; return <main ")
      .replace("{content.services}", "{services}")
      .replace("{content.faqs}", "{faqs}");
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: destructured, stylesSource: validStyles, motionSource: validMotion });
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unbound-content-token" }),
    ]));
  });

  it("rejects marker values that only contain the expected slug", () => {
    const mismatched = validExperience.replace(
      'data-hero-geometry="typographic-monument"',
      'data-hero-geometry="not-typographic-monument"',
    );
    const report = validateReferenceCandidate({ referenceDna: dna, experienceSource: mismatched, stylesSource: validStyles, motionSource: validMotion });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "hero-geometry-mismatch" }),
    ]));
  });
});
