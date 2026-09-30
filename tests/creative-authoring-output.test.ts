import { describe, expect, it } from "vitest";
import {
  AUTHORING_STAGE_BUDGETS,
  authoringCompletionDiagnostics,
  completionLimitRequestField,
  referenceImplementationChecklist,
} from "../scripts/creative-authoring-output.mjs";

describe("creative authoring output budgets", () => {
  it("uses OpenRouter's current completion limit request field", () => {
    expect(completionLimitRequestField(48000)).toEqual({
      max_completion_tokens: 48000,
    });
    expect(() => completionLimitRequestField(0)).toThrow(
      /positive integer/u,
    );
  });

  it("gives each authoring stage generous output and time headroom", () => {
    expect(AUTHORING_STAGE_BUDGETS).toEqual({
      contract: { maxTokens: 24000, timeoutMs: 300000 },
      experience: { maxTokens: 48000, timeoutMs: 480000 },
      styles: { maxTokens: 40000, timeoutMs: 480000 },
      motion: { maxTokens: 24000, timeoutMs: 300000 },
    });
  });

  it("reports a length-truncated stage without logging response content", () => {
    const diagnostics = authoringCompletionDiagnostics({
      stage: "experience",
      routeId: "route-01",
      maxTokens: AUTHORING_STAGE_BUDGETS.experience.maxTokens,
      payload: {
        choices: [
          { finish_reason: "length", message: { content: null } },
        ],
        usage: {
          completion_tokens: 48000,
          completion_tokens_details: { reasoning_tokens: 47980 },
        },
      },
      content: null,
    });

    expect(diagnostics).toEqual({
      stage: "experience",
      routeId: "route-01",
      finishReason: "length",
      maxTokens: 48000,
      completionTokens: 48000,
      reasoningTokens: 47980,
      contentChars: 0,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("content=");
  });

  it("prints required section anchors and the assigned marker order explicitly", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "image chapter", "magazine archive", "contact"],
    });

    expect(checklist).toContain('id="services"');
    expect(checklist).toContain('id="faqs"');
    expect(checklist).toContain('id="contact"');
    expect(checklist.indexOf('data-reference-section="hero"')).toBeLessThan(
      checklist.indexOf('data-reference-section="image-chapter"'),
    );
    expect(checklist.indexOf('data-reference-section="image-chapter"')).toBeLessThan(
      checklist.indexOf('data-reference-section="magazine-archive"'),
    );
    expect(checklist).toContain("semantically matching section");
  });

  it("states distinct desktop and mobile hero topologies as separate layout contracts", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
      compositionTopology: {
        hero: "media-overlay",
        mobileHero: "type-led-statement",
        mediaRelation: "copy-over-media",
        mobileMediaRelation: "copy-leads-opening",
      },
    });

    expect(checklist).toContain("Desktop hero topology: media-overlay");
    expect(checklist).toContain("Desktop media relation: copy-over-media");
    expect(checklist).toContain("Mobile hero topology: type-led-statement");
    expect(checklist).toContain("Mobile media relation: copy-leads-opening");
    expect(checklist).toContain("do not carry desktop image occupancy into mobile");
  });

  it("gives the author exact Reference DNA marker values consumed by the hard validator", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
      heroGeometry: { mode: "dark-photo-led-home-promise" },
      navigationGeometry: { mode: "thin-utility-strip-over-airy-service-nav" },
      servicePresentation: { pattern: "three-captioned-surface-studies" },
      ctaPlacement: { early: "hero-estimate-anchor" },
      mobileRecomposition: { strategy: "stacked-room-sample-sequence" },
      motion: { primitive: "native-scroll-snap-gallery" },
    });

    expect(checklist).toContain('data-hero-geometry="dark-photo-led-home-promise"');
    expect(checklist).toContain('data-navigation-geometry="thin-utility-strip-over-airy-service-nav"');
    expect(checklist).toContain('data-service-presentation="three-captioned-surface-studies"');
    expect(checklist).toContain('data-cta-placement="hero-estimate-anchor"');
    expect(checklist).toContain('data-mobile-recomposition="stacked-room-sample-sequence"');
    expect(checklist).toContain('data-motion-primitive="native-scroll-snap-gallery"');
    expect(checklist).toContain("machine-readable verification markers, not visual substitutions");
  });

  it("promotes distinctive signature and art-direction mechanics into rendered obligations", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
      requiredSignatureElements: [
        {
          id: "room-service-selector",
          description:
            "a room-reveal service selector backed by a visible finished-room image",
        },
        {
          id: "sample-library",
          description:
            "a paint-sample library with layered finish swatches and labeled choices",
        },
      ],
      imageTreatment: {
        mode: "finished rooms and paint sample-like color strips",
        crop: "wide room reveal followed by contained material studies",
        focalPoint: "keep the finished surface visible beside the service choice",
      },
      servicePresentation: {
        pattern: "vertical service menu that changes the featured room image",
        interaction: "room-reveal tabs with a complete static fallback",
      },
      palette: { contrastIntent: "ivory, charcoal, and warm paint accents" },
      acceptanceChecks: [
        "The room reveal remains visually dominant beside the service choice.",
        "Paint sample treatment is visible before the final contact chapter.",
      ],
    });

    expect(checklist).toContain(
      'data-reference-signature="room-service-selector" must visibly realize',
    );
    expect(checklist).toContain(
      'data-reference-signature="sample-library" must visibly realize',
    );
    expect(checklist).toContain(
      "A data-reference-signature marker alone does not satisfy a signature",
    );
    expect(checklist).toContain(
      "Image treatment: finished rooms and paint sample-like color strips",
    );
    expect(checklist).toContain(
      "Service presentation: vertical service menu that changes the featured room image",
    );
    expect(checklist).toContain(
      "differentiate them through reference-led crop, layering, sequencing",
    );
    expect(checklist).toContain(
      "The room reveal remains visually dominant beside the service choice.",
    );
    expect(checklist).toContain(
      "Treat these as rendered acceptance criteria, not descriptive prose",
    );
  });

  it("keeps required navigation links when a route has no reference DNA", () => {
    const checklist = referenceImplementationChecklist(undefined);

    expect(checklist).toContain("visible native lowercase <nav>");
    expect(checklist).toContain('<a href="#services">Services</a>');
    expect(checklist).toContain('<a href="#faqs">FAQs</a>');
    expect(checklist).toContain('<a href="#contact">Contact</a>');
    expect(checklist).not.toContain("REFERENCE SECTION ORDER");
  });

  it("rejects empty or colliding normalized section marker IDs", () => {
    expect(() =>
      referenceImplementationChecklist({
        sectionSequence: ["hero", "!!!", "contact"],
      }),
    ).toThrow(/unique, non-empty marker IDs/u);
    expect(() =>
      referenceImplementationChecklist({
        sectionSequence: ["hero", "Hero", "contact"],
      }),
    ).toThrow(/unique, non-empty marker IDs/u);
  });
});
