import { describe, expect, it } from "vitest";
import {
  AUTHORING_STAGE_BUDGETS,
  CLIENT_PALETTE_ROLE_CONTRACT,
  HERO_MEDIA_FOCUS_CONTRACT,
  authoringCompletionDiagnostics,
  appendReferencePersonnelCue,
  adaptReferencePersonnelCuesForClient,
  completionLimitRequestField,
  referenceImplementationChecklist,
  referencePersonnelCueTranslation,
} from "../scripts/creative-authoring-output.mjs";

describe("creative authoring output budgets", () => {
  it("translates source-personnel mechanics when client personnel are unverified", () => {
    const instruction = referencePersonnelCueTranslation({
      route: {
        label: "Morris-Jenkins home-services reference",
        signature: "technician campaign poster and person-led reassurance",
        referenceDna: {
          requiredSignatureElements: [
            {
              id: "technician-campaign-poster",
              description: "A uniformed technician portrait anchors the hero.",
            },
          ],
        },
      },
      contentShape: { claimEvidence: { staff: [], teamMembers: [], team: [] } },
    });

    expect(instruction).toContain("REFERENCE PERSONNEL-CUE TRANSLATION");
    expect(instruction).toContain("Preserve the poster composition");
    expect(instruction).toMatch(/replace the source-person role/iu);
    expect(instruction).toContain("non-human, object-led visual");
    expect(instruction).toContain("verified client content only");
  });

  it("places the personnel translation after the stage-specific reference instructions", () => {
    const prompt = appendReferencePersonnelCue(
      "Reference and screenshots are supplied above.\nEXPERIENCE STAGE final requirements.",
      {
        route: {
          signature: "technician campaign poster",
          referenceDna: {
            requiredSignatureElements: [
              {
                id: "technician-campaign-poster",
                description: "Portrait-led hero",
              },
            ],
          },
        },
        contentShape: {
          claimEvidence: { staff: [], teamMembers: [], team: [] },
        },
      },
    );

    expect(prompt.indexOf("EXPERIENCE STAGE final requirements.")).toBeLessThan(
      prompt.indexOf("REFERENCE PERSONNEL-CUE TRANSLATION"),
    );
    expect(prompt.trimEnd()).toMatch(/Use verified client content only/u);
  });

  it("does not apply the source-person translation without personnel cues or when staff are verified", () => {
    const route = { label: "Roofing reference", signature: "roof-form atlas" };
    expect(referencePersonnelCueTranslation({ route, contentShape: {} })).toBe(
      "",
    );
    expect(
      referencePersonnelCueTranslation({
        route: {
          ...route,
          signature: "technician campaign poster and person-led reassurance",
        },
        contentShape: {
          claimEvidence: {
            staff: [{ name: "Verified person", role: "Technician" }],
          },
        },
      }),
    ).toBe("");
  });

  it("rewrites person-dependent model context while preserving stable signature IDs", () => {
    const route = {
      label: "Morris-Jenkins home services homepage",
      signature:
        "uniformed technician beside promise|technician campaign hero|people-led explanation",
      referenceDna: {
        requiredSignatureElements: [
          {
            id: "technician-campaign-poster",
            description: "technician campaign poster with a uniformed technician",
          },
        ],
        sectionSequence: ["technician-campaign-hero", "person-led-reassurance"],
        imageTreatment: {
          mode: "friendly uniformed technician photography",
          focalPoint: "technician and promise together",
        },
      },
      referenceDossier: {
        id: "morris-jenkins-home-services",
        referenceName: "Morris-Jenkins",
        designPrompt:
          "A uniformed technician beside a promise, technician campaign poster, and people-led explanation.",
      },
    };

    const adapted = adaptReferencePersonnelCuesForClient(route, {
      claimEvidence: { staff: [], teamMembers: [], team: [] },
    });

    expect(adapted).not.toBe(route);
    expect(JSON.stringify(adapted)).not.toMatch(
      /uniformed technician|technician campaign hero|people-led explanation|person-led reassurance|friendly uniformed technician photography/iu,
    );
    expect(adapted.referenceDna.requiredSignatureElements[0].id).toBe(
      "technician-campaign-poster",
    );
    expect(adapted.referenceDna.requiredSignatureElements[0].description).toContain(
      "object-led campaign poster",
    );
    expect(route.referenceDossier.designPrompt).toContain("uniformed technician");
  });

  it("preserves machine-readable Reference DNA markers while adapting prose", () => {
    const route = {
      signature: "technician campaign poster and person-led process",
      referenceDna: {
        sectionSequence: ["technician-campaign-hero", "person-led-reassurance"],
        heroGeometry: { mode: "technician-led-statement" },
        servicePresentation: { pattern: "technician-service-rail" },
        motion: { primitive: "technician-portrait-reveal" },
      },
    };

    const adapted = adaptReferencePersonnelCuesForClient(route, {
      claimEvidence: { staff: [], teamMembers: [], team: [] },
    });

    expect(adapted.referenceDna.sectionSequence).toEqual(
      route.referenceDna.sectionSequence,
    );
    expect(adapted.referenceDna.heroGeometry.mode).toBe(
      route.referenceDna.heroGeometry.mode,
    );
    expect(adapted.referenceDna.servicePresentation.pattern).toBe(
      route.referenceDna.servicePresentation.pattern,
    );
    expect(adapted.referenceDna.motion.primitive).toBe(
      route.referenceDna.motion.primitive,
    );
    expect(adapted.signature).not.toBe(route.signature);
  });

  it("uses OpenRouter's current completion limit request field", () => {
    expect(completionLimitRequestField(48000)).toEqual({
      max_completion_tokens: 48000,
    });
    expect(() => completionLimitRequestField(0)).toThrow(/positive integer/u);
  });

  it("gives each authoring stage generous output and time headroom", () => {
    expect(AUTHORING_STAGE_BUDGETS).toEqual({
      contract: { maxTokens: 24000, timeoutMs: 300000 },
      experience: { maxTokens: 48000, timeoutMs: 480000 },
      service: { maxTokens: 32000, timeoutMs: 360000 },
      location: { maxTokens: 32000, timeoutMs: 360000 },
      "service-index": { maxTokens: 24000, timeoutMs: 300000 },
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
        choices: [{ finish_reason: "length", message: { content: null } }],
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
    expect(
      checklist.indexOf('data-reference-section="image-chapter"'),
    ).toBeLessThan(
      checklist.indexOf('data-reference-section="magazine-archive"'),
    );
    expect(checklist).toContain("semantically matching section");
  });

  it("requires one meaningful H1 inside the main landmark", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
    });

    expect(checklist).toContain(
      "Render exactly one meaningful H1 inside the page's single <main> landmark",
    );
  });

  it("requires action hover states to keep matched foreground and surface roles", () => {
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain(
      "Never pair --ll-text as an action fill with --ll-on-action text",
    );
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain(
      "use native list markers or an explicit aria-hidden child marker instead",
    );
  });

  it("keeps hero focus indicators on an opaque surface when media remains behind them", () => {
    expect(HERO_MEDIA_FOCUS_CONTRACT).toContain(
      "provable opaque local surface covering the entire control and focus ring",
    );
    expect(HERO_MEDIA_FOCUS_CONTRACT).toContain(
      "Do not set the hero copy/action surface to transparent or translucent at mobile while media remains behind it.",
    );
    expect(CLIENT_PALETTE_ROLE_CONTRACT).toContain(
      "HERO MEDIA FOCUS CONTRACT",
    );
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
    expect(checklist).toContain(
      "do not carry desktop image occupancy into mobile",
    );
    expect(checklist).not.toContain("IMAGE-INDEPENDENT REFERENCE GUARDRAIL");
  });

  it("keeps type-led desktop repairs from drifting into split-media", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
      compositionTopology: {
        hero: "type-led-statement",
        mobileHero: "media-overlay",
        mediaRelation: "copy-leads-opening",
        mobileMediaRelation: "copy-over-media",
      },
    });

    expect(checklist).toContain(
      "A substantial adjacent image panel is split-media and is not allowed",
    );
    expect(checklist).toContain(
      "do not satisfy an imagery finding by changing the assigned desktop hero topology",
    );
    expect(checklist).toContain(
      "do not mirror that mobile image treatment into a desktop side-by-side media field",
    );
    expect(checklist).toContain("IMAGE-INDEPENDENT REFERENCE GUARDRAIL");
    expect(checklist).toContain(
      "Do not place sealed photo tokens as decorative chapter filler",
    );
  });

  it("scopes the image-independent guardrail to DNA that functions without photography", () => {
    const checklist = referenceImplementationChecklist({
      sectionSequence: ["hero", "services", "faqs", "contact"],
      compositionTopology: {
        hero: "split-media",
        mediaRelation: "copy-beside-media",
      },
      imageTreatment: {
        mode: "finished rooms and paint sample-like color strips",
      },
    });

    expect(checklist).not.toContain("IMAGE-INDEPENDENT REFERENCE GUARDRAIL");
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

    expect(checklist).toContain(
      'data-hero-geometry="dark-photo-led-home-promise"',
    );
    expect(checklist).toContain(
      'data-navigation-geometry="thin-utility-strip-over-airy-service-nav"',
    );
    expect(checklist).toContain(
      'data-service-presentation="three-captioned-surface-studies"',
    );
    expect(checklist).toContain('data-cta-placement="hero-estimate-anchor"');
    expect(checklist).toContain(
      'data-mobile-recomposition="stacked-room-sample-sequence"',
    );
    expect(checklist).toContain(
      'data-motion-primitive="native-scroll-snap-gallery"',
    );
    expect(checklist).toContain(
      "machine-readable verification markers, not visual substitutions",
    );
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
        focalPoint:
          "keep the finished surface visible beside the service choice",
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
