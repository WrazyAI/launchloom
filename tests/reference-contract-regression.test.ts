import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";
import { validateReferenceCandidate } from "../scripts/reference-fidelity.mjs";

const registry = JSON.parse(
  fs.readFileSync("data/inspiration-registry.json", "utf8"),
);
const evidenceRecord = registry.records[0];

const baseDna = buildReferenceDna(
  {
    ...evidenceRecord,
    id: "failed-route-01",
    referenceFamilyId: "a1-collage-composition",
  },
  { requireEvidence: true },
);

const dna = {
  ...baseDna,
  sectionVisualRequirements: [
    "contained layered collage hero",
    "large off-white breathing space",
    "centered feature-introduction heading",
    "five-item annotated capability row with tiny line icons",
    "centered people-use heading",
    "colorful portrait/testimonial card row beginning at the fold",
  ],
  requiredSignatureElements: [
    ...baseDna.requiredSignatureElements,
    {
      id: "lower-edge-product-overlap",
      selector:
        "[data-reference-signature=lower-edge-product-overlap]",
      description:
        "product interface rises from the lower hero edge and is overlapped by multiple collage planes",
    },
  ],
};

const experience = `
<main data-mobile-recomposition="stacked-collage-atlas" data-motion-primitive="layered-pointer-drift">
  <nav data-navigation-geometry="floating-tool-nav"></nav>
  <section data-reference-section="hero" data-hero data-hero-geometry="layered-collage-with-offset-product-stills" data-reference-signature="collage-field">
    <h1>{content.hero.heading}</h1>
    <div data-reference-signature="lower-edge-product-overlap">
      <div data-reference-overlap-layer="background"></div>
      <div data-reference-overlap-layer="product"><img src={content.hero.image} alt={content.hero.heading} /></div>
      <div data-reference-overlap-layer="foreground"></div>
    </div>
    <a href="#contact" data-early-conversion data-cta-placement="inside-first-collage">{content.hero.primaryLabel}</a>
  </section>
  <section id="services" data-reference-section="feature-atlas" data-service-presentation="annotated-feature-objects" data-reference-signature="object-annotations">{content.services}</section>
  <section data-reference-section="image-mosaic"><img src={content.hero.secondaryImage} alt={content.hero.heading} /></section>
  <section data-reference-section="annotation-rail"></section>
  <section data-reference-section="conversion-band" data-reference-signature="conversion-band"></section>
  <section id="contact" data-reference-section="contact"></section>
  <section id="faqs">{content.faqs}</section>
</main>
`;

const styles = `
:root { --ll-creative-ink: #111; }
[data-reference-signature="lower-edge-product-overlap"] { position: relative; }
[data-reference-overlap-layer] { position: absolute; }
@media (max-width: 700px) { main { display: block; } }
`;

const motion = `
export function mountExperienceMotion(runtime) {
  if (runtime?.reducedMotion) return () => {};
  const move = () => {};
  window.addEventListener("pointermove", move);
  return () => window.removeEventListener("pointermove", move);
}
`;

function validate(overrides: Record<string, any> = {}) {
  return validateReferenceCandidate({
    referenceDna: dna,
    experienceSource: experience,
    stylesSource: styles,
    motionSource: motion,
    ...overrides,
  });
}

describe("reference contract regression for failed A1 intake", () => {
  it("requires the exact stable section order", () => {
    const report = validate();
    expect(report.visualPass).toBe(true);
    expect(report.sectionOrder).toEqual([
      "hero",
      "feature-atlas",
      "image-mosaic",
      "annotation-rail",
      "conversion-band",
      "contact",
    ]);

    const wrongOrder = experience
      .replace(
        'data-reference-section="image-mosaic"',
        'data-reference-section="TEMP"',
      )
      .replace(
        'data-reference-section="annotation-rail"',
        'data-reference-section="image-mosaic"',
      )
      .replace(
        'data-reference-section="TEMP"',
        'data-reference-section="annotation-rail"',
      );
    const failed = validate({ experienceSource: wrongOrder });
    expect(failed.visualPass).toBe(false);
    expect(failed.visualFindings).toContainEqual(
      expect.objectContaining({
        code: "section-order",
        expectedSections: dna.sectionSequence,
      }),
    );
  });

  it("does not accept lower-edge-product-overlap from a marker alone", () => {
    const markerOnly = experience.replace(
      /\sdata-reference-overlap-layer="[^"]+"/gu,
      "",
    );
    const report = validate({ experienceSource: markerOnly });
    expect(report.visualPass).toBe(false);
    expect(report.visualFindings).toContainEqual(
      expect.objectContaining({
        code: "signature-structure",
        signatureId: "lower-edge-product-overlap",
      }),
    );
  });

  it("requires rendered overlap geometry even when all marker attributes exist", () => {
    const report = validate({
      renderedDom: experience,
      renderedEvidence: {
        servicePresentationAttachedToServices: true,
        ctaPlacementAttachedToEarlyConversion: true,
        overflow: false,
        signatureGeometry: {
          "lower-edge-product-overlap": {
            layerCount: 3,
            productLayerPresent: true,
            overlapCount: 0,
            productAnchoredToHeroBottom: false,
            signatureInLowerHero: true,
          },
        },
      },
      viewport: { name: "desktop", width: 1536, height: 864 },
    });
    expect(report.visualPass).toBe(false);
    expect(report.visualFindings).toContainEqual(
      expect.objectContaining({
        code: "signature-geometry",
        signatureId: "lower-edge-product-overlap",
        viewport: "desktop",
      }),
    );
  });

  it("accepts the overlap contract only when rendered geometry proves it", () => {
    const report = validate({
      renderedDom: experience,
      renderedEvidence: {
        servicePresentationAttachedToServices: true,
        ctaPlacementAttachedToEarlyConversion: true,
        overflow: false,
        signatureGeometry: {
          "lower-edge-product-overlap": {
            layerCount: 3,
            productLayerPresent: true,
            overlapCount: 2,
            productAnchoredToHeroBottom: true,
            signatureInLowerHero: true,
          },
        },
      },
      viewport: { name: "desktop", width: 1536, height: 864 },
    });
    expect(report.pass).toBe(true);
    expect(report.visualPass).toBe(true);
  });

  it("applies overlap structure and geometry checks to product-still-overlap", () => {
    const neighborhoodDna = {
      ...dna,
      requiredSignatureElements: dna.requiredSignatureElements.map(
        (item: any) =>
          item.id === "lower-edge-product-overlap"
            ? {
                ...item,
                id: "product-still-overlap",
                selector:
                  "[data-reference-signature=product-still-overlap]",
                description:
                  "overlapping product stills with varied crops",
              }
            : item,
      ),
    };
    const neighborhoodExperience = experience.replaceAll(
      "lower-edge-product-overlap",
      "product-still-overlap",
    );
    const markerOnly = neighborhoodExperience.replace(
      /\sdata-reference-overlap-layer="[^"]+"/gu,
      "",
    );
    const sourceFailure = validateReferenceCandidate({
      referenceDna: neighborhoodDna,
      experienceSource: markerOnly,
      stylesSource: styles,
      motionSource: motion,
    });
    expect(sourceFailure.visualFindings).toContainEqual(
      expect.objectContaining({
        code: "signature-structure",
        signatureId: "product-still-overlap",
      }),
    );

    const renderedPass = validateReferenceCandidate({
      referenceDna: neighborhoodDna,
      experienceSource: neighborhoodExperience,
      stylesSource: styles,
      motionSource: motion,
      renderedDom: neighborhoodExperience,
      renderedEvidence: {
        servicePresentationAttachedToServices: true,
        ctaPlacementAttachedToEarlyConversion: true,
        overflow: false,
        signatureGeometry: {
          "product-still-overlap": {
            layerCount: 3,
            productLayerPresent: true,
            overlapCount: 2,
            productAnchoredToHeroBottom: false,
            signatureInLowerHero: false,
          },
        },
      },
      viewport: { name: "desktop", width: 1536, height: 864 },
    });
    expect(renderedPass.visualFindings).not.toContainEqual(
      expect.objectContaining({
        code: "signature-geometry",
        signatureId: "product-still-overlap",
      }),
    );
  });

  it("keeps creative CSS variables isolated", () => {
    const report = validate({
      stylesSource: styles + "\n:root { --ink: #000; }",
    });
    expect(report.pass).toBe(false);
    expect(report.hardFindings).toContainEqual(
      expect.objectContaining({ code: "css-token-collision" }),
    );
  });

  it("requires the sealed hero asset token to flow into rendered output", () => {
    const report = validate({
      experienceSource: experience.replace(
        'src={content.hero.image}',
        'src="/placeholder.webp"',
      ),
    });
    expect(report.pass).toBe(false);
    expect(report.hardFindings).toContainEqual(
      expect.objectContaining({
        code: "unbound-content-token",
        message: expect.stringContaining("content.hero.image"),
      }),
    );
  });
});
