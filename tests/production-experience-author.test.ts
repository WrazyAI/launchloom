import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  authorExperienceCandidates,
  buildCreativeContentManifest,
  namespaceCreativeCss,
  omitDuplicateRouteDesignTemplates,
  restoreImageAltsFromOriginal,
  restoreRequiredExperienceMarkers,
  restoreRequiredSectionIdsOnSemanticSections,
  validateProductionCandidateFiles,
  type AuthorStageRequest,
} from "../scripts/production-experience-author.mjs";
import { buildReferenceDna } from "../scripts/reference-dna.mjs";

const site = {
  business: {
    name: "Maison Orphee",
    phone: "(212) 555-0186",
    email: "hello@example.com",
    address: "Upper East Side, New York, NY",
  },
  hero: {
    kicker: "Fine jewelry by appointment",
    heading: "Designed in private, worn forever",
    body: "A private consultation before any commission begins.",
    primaryLabel: "Request a private appointment",
  },
  services: [
    {
      name: "Bespoke commissions",
      description: "Designed around your stones.",
    },
    {
      name: "Heirloom redesign",
      description: "Preserve stones you already own.",
    },
  ],
  conversion: {
    faqs: [
      { question: "What happens first?", answer: "A private consultation." },
    ],
  },
  assets: { logo: "/assets/logo.svg", hero: "/assets/hero.webp" },
};

const inspirationPack = {
  version: 1,
  selectionKey: "sealed-selection",
  routes: [
    {
      id: "route-01",
      label: "Nocturnal Salon",
      navigation: "discreet-overlay-navigation",
      heroGeometry: "full-bleed-image-with-inset-manifesto",
      servicePresentation: "sensory-chapter-sequence",
      sectionRhythm: "dark-light-crescendo",
      typographyCategory: "cinematic-display-serif",
      imageStrategy: "low-light-material-macro",
      motionOpportunity: "scrubbed-light-shift",
      signature: "salon-signature",
      evidence: [{ name: "Nocturnal Salon", source: "Owned", rights: "owned" }],
    },
    {
      id: "route-02",
      label: "Fashion Archive",
      navigation: "micro-menu-with-cart-counterpoint",
      heroGeometry: "editorial-face-and-type-collision",
      servicePresentation: "archive-collection-rail",
      sectionRhythm: "campaign-spread-sequence",
      typographyCategory: "fashion-grotesk-and-display-mix",
      imageStrategy: "hard-cropped-fashion-portrait",
      motionOpportunity: "horizontal-collection-scrub",
      signature: "archive-signature",
      evidence: [
        { name: "Fashion Archive", source: "Lapa", rights: "reference-only" },
      ],
    },
    {
      id: "route-03",
      label: "Spatial Editorial Monument",
      navigation: "whispered-corner-navigation",
      heroGeometry: "typographic-monument-with-central-portrait",
      servicePresentation: "magazine-ledger",
      sectionRhythm: "slow-cinematic-chapters",
      typographyCategory: "monumental-serif-with-script-accent",
      imageStrategy: "warm-architectural-tableaux",
      motionOpportunity: "masked-image-reveal",
      signature: "monument-signature",
      evidence: [
        { name: "Spatial Monument", source: "Lapa", rights: "reference-only" },
      ],
    },
  ],
};

function safeStage(request: AuthorStageRequest) {
  if (request.stage === "contract") {
    return {
      designContract: `A complete ${request.route.label} composition using ${request.route.heroGeometry}.`,
      designRationale: `The route owns ${request.route.navigation}.`,
    };
  }
  if (request.stage === "experience") {
    return {
      content: `import React from "react";
import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <div data-model-experience="${request.route.id}">
    <nav aria-label="Main navigation"><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <main><section data-hero><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><button data-early-conversion>{content.hero.primaryLabel}</button></section>
    <section id="services">{content.services.map((service) => <article key={service.name}><h2>{service.name}</h2><p>{service.description}</p></article>)}</section>
    <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /><a href={content.brand.phone}>{content.brand.phone}</a></section></main>
  </div>;
}`,
    };
  }
  if (request.stage === "styles") {
    return {
      content: `[data-model-experience="${request.route.id}"] { color: var(--ink); background: var(--paper); }`,
    };
  }
  return {
    content: `export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }`,
  };
}

describe("production experience author", () => {
  it("keeps the client visual brief alongside sealed content", () => {
    const manifest = buildCreativeContentManifest({
      ...site,
      style: {
        primaryColor: "#245a4c",
        surfaceColor: "#f5f0e4",
        inkColor: "#17362f",
        tone: "warm",
        preference: "warm-friendly",
        visualDirection: "layered room image windows",
        artDirection:
          "Light chalk-and-ivory canvas with cypress-green typography.",
      },
    });

    expect(manifest.version).toBe(2);
    expect(manifest.visualBrief).toMatchObject({
      palette: {
        primaryColor: "#245a4c",
        surfaceColor: "#f5f0e4",
        inkColor: "#17362f",
      },
      tone: "warm",
      preference: "warm-friendly",
      visualDirection: "layered room image windows",
      artDirection:
        "Light chalk-and-ivory canvas with cypress-green typography.",
    });
    expect(manifest.values).not.toHaveProperty("style");
  });
  it("accepts decorative empty alts but rejects missing or nullish alt values", () => {
    const route = { id: "route-decorative-alt" };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const decorativeImage = experience.replace(
      "<section data-hero>",
      '<section data-hero><img src={content.hero.image} alt="" aria-hidden="true" />',
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: decorativeImage, styles, motion },
        route,
      }),
    ).not.toThrow();

    const missingAlt = decorativeImage.replace(' alt=""', "");
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: missingAlt, styles, motion },
        route,
      }),
    ).toThrow(/must have a usable alt attribute/iu);

    const invalidAltSources = [
      decorativeImage.replace('alt=""', "alt={}"),
      decorativeImage.replace('alt=""', "alt={null}"),
      decorativeImage.replace('alt=""', "alt={undefined}"),
    ];
    for (const invalidExperience of invalidAltSources)
      expect(() =>
        validateProductionCandidateFiles({
          files: { experience: invalidExperience, styles, motion },
          route,
        }),
      ).toThrow(/must have a usable alt attribute/iu);
  });

  it("requires FAQ navigation anchors inside nav even when an unrelated FAQ link remains", () => {
    const route = { id: "route-02" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    )
      .replace('href="#faqs"', "onClick={() => {}}")
      .replace("<main>", '<main><a href="#faqs">An unrelated FAQ link</a>');
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience, styles, motion },
        route,
      }),
    ).toThrow(
      'Candidate route-02 navigation must expose literal <a href="#faqs"> inside a visible native <nav>.',
    );
  });

  it("rejects navigation hrefs that a later JSX spread can override", () => {
    const route = { id: "route-overridden-navigation-href" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const original = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const overridesToWrongTarget = original.replace(
      '<a href="#faqs">FAQs</a>',
      '<a href="#faqs" {...{ href: "#contact" }}>FAQs</a>',
    );
    const unknownOverride = original.replace(
      '<a href="#faqs">FAQs</a>',
      '<a href="#faqs" {...linkProps}>FAQs</a>',
    );
    const harmlessStaticSpread = original.replace(
      '<a href="#faqs">FAQs</a>',
      '<a href="#faqs" {...{ className: "nav-link" }}>FAQs</a>',
    );

    for (const experience of [overridesToWrongTarget, unknownOverride])
      expect(() =>
        validateProductionCandidateFiles({
          files: { experience, styles, motion },
          route,
        }),
      ).toThrow(
        'Candidate route-overridden-navigation-href navigation must expose literal <a href="#faqs"> inside a visible native <nav>.',
      );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: harmlessStaticSpread, styles, motion },
        route,
      }),
    ).not.toThrow();
  });

  it("does not count anchors inside statically unreachable JSX branches", () => {
    const route = { id: "route-unreachable-navigation" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    ).replace(
      '<a href="#faqs">FAQs</a>',
      '{false && <a href="#faqs">FAQs</a>}',
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience, styles, motion },
        route,
      }),
    ).toThrow(
      'Candidate route-unreachable-navigation navigation must expose literal <a href="#faqs"> inside a visible native <nav>.',
    );
  });

  it("requires native lowercase nav and anchor elements for navigation", () => {
    const route = { id: "route-native-navigation" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const original = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const nonNativeNavigation = original
      .replace(
        '<nav aria-label="Main navigation">',
        '<Nav aria-label="Main navigation">',
      )
      .replace("</nav>", "</Nav>");
    const componentAnchor = original.replace(
      '<a href="#faqs">FAQs</a>',
      '<A href="#faqs">FAQs</A>',
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: nonNativeNavigation, styles, motion },
        route,
      }),
    ).toThrow(
      'Candidate route-native-navigation navigation must expose literal <a href="#services"> inside a visible native <nav>.',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: componentAnchor, styles, motion },
        route,
      }),
    ).toThrow(
      'Candidate route-native-navigation navigation must expose literal <a href="#faqs"> inside a visible native <nav>.',
    );
  });

  it("rejects hidden navigation containers but allows an explicit false value", () => {
    const route = { id: "route-hidden-navigation" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const original = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const hiddenNavigation = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav hidden aria-label="Main navigation">',
    );
    const hiddenParent = original
      .replace(
        '<nav aria-label="Main navigation">',
        '<div hidden><nav aria-label="Main navigation">',
      )
      .replace("</nav>", "</nav></div>");
    const hiddenChild = original
      .replace(
        '<nav aria-label="Main navigation">',
        '<nav aria-label="Main navigation"><div hidden>',
      )
      .replace("</nav>", "</div></nav>");
    const hiddenAnchor = original.replace(
      '<a href="#services">Services</a>',
      '<a {...{ hidden: true }} href="#services">Services</a>',
    );
    const spreadOverridesFalse = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav hidden={false} {...{ hidden: true }} aria-label="Main navigation">',
    );
    const dynamicSpreadAfterFalse = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav hidden={false} {...navProps} aria-label="Main navigation">',
    );
    const displayNoneNavigation = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav hidden={false} style={{ display: "none" }} aria-label="Main navigation">',
    );
    const displayNoneAnchor = original.replace(
      '<a href="#services">Services</a>',
      '<a style={{ display: "none" }} href="#services">Services</a>',
    );
    const displayNoneSpread = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav {...{ style: { display: "none" } }} aria-label="Main navigation">',
    );
    const dynamicDisplayProperty = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav style={{ [displayProperty]: "none" }} aria-label="Main navigation">',
    );
    const dynamicStyleProperty = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav {...{ [styleProperty]: { display: "none" } }} aria-label="Main navigation">',
    );
    const explicitlyVisibleNavigation = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav hidden={false} aria-label="Main navigation">',
    );
    const safeStaticSpread = original.replace(
      '<nav aria-label="Main navigation">',
      '<nav {...{ id: "main-navigation" }} aria-label="Main navigation">',
    );

    for (const experience of [
      hiddenNavigation,
      hiddenParent,
      hiddenChild,
      hiddenAnchor,
      spreadOverridesFalse,
      dynamicSpreadAfterFalse,
      displayNoneNavigation,
      displayNoneAnchor,
      displayNoneSpread,
      dynamicDisplayProperty,
      dynamicStyleProperty,
    ])
      expect(() =>
        validateProductionCandidateFiles({
          files: { experience, styles, motion },
          route,
        }),
      ).toThrow(
        'Candidate route-hidden-navigation navigation must expose literal <a href="#services"> inside a visible native <nav>.',
      );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: explicitlyVisibleNavigation, styles, motion },
        route,
      }),
    ).not.toThrow();
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: safeStaticSpread, styles, motion },
        route,
      }),
    ).not.toThrow();
  });

  it("requires sealed content when a content-bound runtime helper is used", () => {
    const route = { id: "route-runtime-helper-content" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const imported = experience.replace(
      'import { LeadForm } from "@launchloom/runtime";',
      'import { FAQList as FAQs, LeadForm } from "@launchloom/runtime";',
    );
    const missingContent = imported.replace(
      '<section id="faqs">',
      '<section id="faqs"><FAQs />',
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: missingContent, styles, motion },
        route,
      }),
    ).toThrow(/FAQs.*must receive sealed content.*content=\{content\}/iu);

    const boundContent = missingContent.replace(
      "<FAQs />",
      "<FAQs content={content} />",
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: boundContent, styles, motion },
        route,
      }),
    ).not.toThrow();
  });

  it("counts the trusted FAQList helper as a sealed FAQ binding", () => {
    const route = { id: "route-runtime-faq-binding" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    )
      .replace(
        'import { LeadForm } from "@launchloom/runtime";',
        'import { FAQList, LeadForm } from "@launchloom/runtime";',
      )
      .replace(
        /<section id="faqs">\{content\.faqs\.map\(\(faq\) => <details key=\{faq\.question\}><summary>\{faq\.question\}<\/summary><p>\{faq\.answer\}<\/p><\/details>\)\}<\/section>/u,
        '<section id="faqs"><FAQList content={content} /></section>',
      );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );

    expect(experience).not.toContain("content.faqs");
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience, styles, motion },
        route,
      }),
    ).not.toThrow();

    const misplacedFaqList = experience.replace(
      '<section id="faqs"><FAQList content={content} /></section>',
      '<section id="faqs"></section><FAQList content={content} />',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: misplacedFaqList, styles, motion },
        route,
      }),
    ).toThrow(/missing required sealed binding content\.faqs/iu);
  });

  it("restores required anchors only on uniquely identifiable semantic sections", () => {
    const source = `<main>
      <section data-hero><h1>{content.hero.heading}</h1></section>
      <section data-early-conversion><a>{content.hero.primaryLabel}</a></section>
      <section className='service-atlas' data-service-presentation='object-led'>{content.services}</section>
      <section className='faq-section'><details>{content.faqs}</details></section>
      <section className='contact-band'><LeadForm content={content} /></section>
    </main>`;

    const restored = restoreRequiredSectionIdsOnSemanticSections(source, {
      id: "route-01",
    });

    expect(restored).toContain(
      "data-service-presentation='object-led' id=\"services\"",
    );
    expect(restored).toContain("className='faq-section' id=\"faqs\"");
    expect(restored).toContain("className='contact-band' id=\"contact\"");
    expect(() =>
      restoreRequiredSectionIdsOnSemanticSections(
        source.replace(
          "</section>\n      <section className='faq-section'>",
          "</section>\n      <section className='service-index' data-service-presentation='second'>{content.services}</section>\n      <section className='faq-section'>",
        ),
        { id: "route-ambiguous" },
      ),
    ).toThrow(/found 2 matching semantic sections/iu);
  });

  it("restores required hero markers only on unique semantic targets", () => {
    const original = `<section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>`;
    const repaired = original
      .replace(" data-hero", "")
      .replace(" data-early-conversion", "");

    const restored = restoreRequiredExperienceMarkers(repaired, original, {
      id: "route-01",
    });

    expect(restored).toContain('data-reference-section="hero" data-hero');
    expect(restored).toContain('href="#contact" data-early-conversion');

    const misplaced = repaired.replace(
      "</section>",
      "</section><section data-hero></section>",
    );
    const relocated = restoreRequiredExperienceMarkers(misplaced, original, {
      id: "route-01",
    });
    expect(relocated).toContain('data-reference-section="hero" data-hero');
    expect(relocated).not.toContain("<section data-hero></section>");

    const ambiguous = repaired.replace(
      "</a>",
      '</a><a href="#contact">{content.hero.primaryLabel}</a>',
    );
    expect(() =>
      restoreRequiredExperienceMarkers(ambiguous, original, { id: "route-01" }),
    ).toThrow(/found 2 semantic targets/iu);
  });

  it("deduplicates hero markers only when a unique semantic hero remains", () => {
    const original = `<section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>`;
    const duplicated = `${original}<section data-hero><h2>Decorative section</h2></section>`;

    const restored = restoreRequiredExperienceMarkers(duplicated, original, {
      id: "route-03",
    });

    expect(restored.match(/\bdata-hero\b/gu)).toHaveLength(1);
    expect(restored).toContain(
      '<section data-reference-section="hero" data-hero>',
    );
  });

  it("keeps refusing duplicate hero markers when the semantic target is ambiguous", () => {
    const original = `<section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1></section>`;
    const duplicated = `${original}<section data-hero><h1>{content.hero.heading}</h1></section>`;

    expect(() =>
      restoreRequiredExperienceMarkers(duplicated, original, {
        id: "route-03",
      }),
    ).toThrow(/found 2 semantic targets/iu);
  });

  it("does not treat JSX text or comments as sealed hero content bindings", () => {
    const original = `<section data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>`;
    const deceptive = `<section>{/* <h1>{content.hero.heading}</h1> */}<h1>content.hero.heading</h1><a href="#contact">{/* {content.hero.primaryLabel} */}content.hero.primaryLabel</a></section>`;

    expect(() =>
      restoreRequiredExperienceMarkers(deceptive, original, { id: "route-01" }),
    ).toThrow(/found 0 semantic targets/iu);
  });

  it("places the hero marker on the innermost section containing the hero binding", () => {
    const original = `<section data-hero><div><section><h1>{content.hero.heading}</h1></section><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></div></section>`;
    const repaired = original
      .replace(" data-hero", "")
      .replace(" data-early-conversion", "");
    const restored = restoreRequiredExperienceMarkers(repaired, original, {
      id: "route-01",
    });

    expect(restored).toMatch(
      /<section><div><section data-hero><h1>\{content\.hero\.heading\}<\/h1><\/section>/u,
    );
    expect(restored).not.toMatch(/<section data-hero><div>/u);
  });

  it("restores the hero marker by its retained reference identity when the heading is aliased", () => {
    const original = `const heroHeading = content.hero.heading;
      <><section data-reference-section="architectural-opening" data-reference-signature="architectural-wordmark-scene" data-hero-geometry="full-bleed-architectural-texture-with-oversized-wordmark" data-hero>
        <h1>{content.brand.name}</h1><h2>{heroHeading}</h2>
        <a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a>
      </section><section data-reference-section="vertical-index"><h2>{content.copy.servicesHeading}</h2></section></>`;
    const repaired = original.replace(/\sdata-hero(?=[\s>])/u, "");

    const restored = restoreRequiredExperienceMarkers(repaired, original, {
      id: "route-architecture",
    });

    expect(restored).toContain(
      'data-reference-section="architectural-opening" data-reference-signature="architectural-wordmark-scene" data-hero-geometry="full-bleed-architectural-texture-with-oversized-wordmark" data-hero',
    );
    expect(restored).not.toContain(
      'data-reference-section="vertical-index" data-hero',
    );
  });

  it("uses reviewed CTA placement ahead of a matching nav class", () => {
    const original = `<section data-reference-section="hero" data-cta-placement="hero-action-row" data-hero><h1>{content.hero.heading}</h1><a className="hero-action" href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>`;
    const repaired = `<header><a className="hero-action" href="#contact">{content.hero.primaryLabel}</a></header><section data-reference-section="hero" data-cta-placement="hero-action-row"><h1>{content.hero.heading}</h1><a className="changed-action" href="#contact">{content.hero.primaryLabel}</a></section>`;

    const restored = restoreRequiredExperienceMarkers(repaired, original, {
      id: "route-02",
    });

    expect(restored).toContain(
      '<a className="hero-action" href="#contact">{content.hero.primaryLabel}</a>',
    );
    expect(restored).toContain(
      '<a className="changed-action" href="#contact" data-early-conversion>{content.hero.primaryLabel}</a>',
    );
  });

  it("restores only reviewed image alt text from the same original src binding", () => {
    const original = `<div><img src={content.hero.image} alt="A close view of a flowering plant" /></div>`;
    const repaired = `<div><img src={content.hero.image} alt="" /><img src={content.hero.secondaryImage} alt="" /></div>`;

    const restored = restoreImageAltsFromOriginal(repaired, original);

    expect(restored).toContain(
      'src={content.hero.image} alt="A close view of a flowering plant"',
    );
    expect(restored).toContain('src={content.hero.secondaryImage} alt=""');
    expect(restored).toMatch(/alt="A close view of a flowering plant"\s*\/>/u);
    const diagnostics = ts.transpileModule(restored, {
      fileName: "Experience.jsx",
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
      reportDiagnostics: true,
    }).diagnostics;
    expect(
      diagnostics?.filter(
        (item) => item.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  it("does not infer alt text through an unresolved asset fallback", () => {
    const original =
      '<img src={content.hero.image} alt="Reviewed image description" />';
    const repaired =
      '<img src={unresolvedAsset || content.hero.image} alt="" />';

    const restored = restoreImageAltsFromOriginal(repaired, original, {
      hero: { image: "/images/hero.webp" },
    });

    expect(restored).toContain(
      'src={unresolvedAsset || content.hero.image} alt=""',
    );
  });

  it("reuses reviewed alt text for repeated, reformatted uses of the same sealed image", () => {
    const original = `<div><img src={content.hero.image} alt="Still-life image in the studio" /></div>`;
    const repaired = `<div>
      <img src={ content.hero.image } alt="" />
      <img src={content.hero.image} alt="" />
      <img src={content.hero.secondaryImage} alt="" />
    </div>`;

    const restored = restoreImageAltsFromOriginal(repaired, original);

    expect(
      restored.match(/alt="Still-life image in the studio"/gu),
    ).toHaveLength(2);
    expect(restored).toContain('src={content.hero.secondaryImage} alt=""');

    const ambiguousOriginal = `<img src={content.hero.image} alt="Front crop" /><img src={content.hero.image} alt="Back crop" />`;
    const ambiguous = restoreImageAltsFromOriginal(
      `<img src={content.hero.image} alt="" /><img src={content.hero.image} alt="" /><img src={content.hero.image} alt="" />`,
      ambiguousOriginal,
    );
    expect(ambiguous.match(/alt="Front crop"/gu)).toHaveLength(1);
    expect(ambiguous.match(/alt="Back crop"/gu)).toHaveLength(1);
    expect(ambiguous.match(/alt=""/gu)).toHaveLength(1);
  });

  it("does not conflate meaningful template-literal whitespace in image paths", () => {
    const original =
      '<img src={`${content.hero.image}front.jpg`} alt="Front image" />';
    const repaired = [
      '<img src={`${content.hero.image} front.jpg`} alt="" />',
      '<img src={ `${ content.hero.image }front.jpg` } alt="" />',
    ].join("");

    const restored = restoreImageAltsFromOriginal(repaired, original);

    expect(restored.match(/alt="Front image"/gu)).toHaveLength(1);
    expect(restored).toContain(
      'src={`${content.hero.image} front.jpg`} alt=""',
    );
    expect(restored).toContain(
      'src={ `${ content.hero.image }front.jpg` } alt="Front image"',
    );
  });

  it("keeps shared creative form helper text on the candidate contrast palette", () => {
    const styles = readFileSync(
      "templates/client-site/src/styles/creative-runtime.css",
      "utf8",
    );

    expect(styles).toContain(
      '[data-creative-host="true"] .launchloom-lead-form {',
    );
    expect(styles).toContain("color: var(--ll-creative-ink, currentColor);");
    expect(styles).toContain(
      '[data-creative-host="true"] .launchloom-lead-form small {\n  color: var(--ll-creative-muted, currentColor);',
    );
    expect(styles).toContain('[data-creative-host="true"] {\n  width: 100%;');
    expect(styles).toMatch(
      /\[data-creative-host="true"\]\s*\{[^}]*overflow-x:\s*clip;/u,
    );
  });

  it("fails closed when a repair route carries present-but-incomplete Reference DNA", () => {
    const referenceDna = buildReferenceDna({
      id: "route-incomplete",
      referenceFamilyId: "kokoro-editorial-architecture",
      source: "Owned",
      rights: "owned",
    });
    expect(referenceDna.complete).toBe(false);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience: "export default function Experience(){ return null; }",
          styles: ".candidate { display: block; }",
          motion: "export function mountExperienceMotion(){ return () => {}; }",
        },
        route: {
          id: "route-incomplete",
          referenceDna,
        },
        content: {},
      }),
    ).toThrow(/Reference DNA .* is incomplete/iu);
  });

  it("namespaces candidate-owned CSS variables without hiding host tokens", () => {
    const css = namespaceCreativeCss(
      ":root { --ink: #f5f1e9; --accent: var(--ink); } .hero { color: var(--ink); background: var(--brand); }",
    );

    expect(css).toContain("--ll-creative-ink: #f5f1e9");
    expect(css).toContain("--ll-creative-accent: var(--ll-creative-ink)");
    expect(css).toContain("color: var(--ll-creative-ink)");
    expect(css).toContain("background: var(--brand)");
    expect(css).not.toContain("--ink:");
  });

  it("authors three sealed and structurally independent candidate bundles", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => safeStage(request),
      model: "test/model",
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.directory)).toEqual([
      "candidate-a",
      "candidate-b",
      "candidate-c",
    ]);
    expect(
      new Set(
        result.candidates.map((candidate) => candidate.metadata.signature),
      ).size,
    ).toBe(3);
    expect(result.contentManifest.values).not.toHaveProperty("contact");
    expect(result.contentManifest.tokens.map(({ token }) => token)).toContain(
      "content.hero.image",
    );
    for (const candidate of result.candidates) {
      expect(Object.keys(candidate.files).sort()).toEqual([
        "Experience.jsx",
        "content-manifest.json",
        "contract.json",
        "metadata.json",
        "motion.js",
        "styles.css",
      ]);
      expect(candidate.files["Experience.jsx"]).toContain(
        "content.hero.heading",
      );
      expect(candidate.files["Experience.jsx"]).not.toContain(
        site.business.phone,
      );
      expect(candidate.metadata.contentManifestDigest).toBe(
        result.contentManifest.digest,
      );
      expect(candidate.metadata.runtimeInstrumentation).toEqual({
        rootAttribute: "data-model-experience",
        rootValue: candidate.metadata.routeId,
      });
    }
  });

  it("preserves the selected dossier and its design prompt through every authoring stage", async () => {
    const dossierForRoute = (index: number) => ({
      id: `permission-cleared-editorial-reference-${index}`,
      referenceName: `Editorial service index ${index}`,
      familyId: `editorial-service-index-${index}`,
      path: `data/reference-library/dossiers/editorial-service-index-${index}`,
      digest: String(index).repeat(64),
      source: {
        name: "Permission-cleared reference",
        url: `https://example.test/reference-${index}`,
        rights: "permission-cleared",
        rightsEvidence:
          "Requester-attested permission covers screenshot retention and model reference use.",
        rightsEvidencePath: "rights/clearance.md",
        assetEvidencePaths: ["rights/clearance.md"],
      },
      tags: { business: ["jewelry"], style: [`editorial-${index}`] },
      designPrompt: `# Reference implementation brief\n\nReference ${index}: ${"Preserve this route's own composition, image role, and service presentation mechanics without copying its identity. ".repeat(16)}`,
    });
    const dossiers = new Map(
      inspirationPack.routes.map((route, index) => [
        route.id,
        dossierForRoute(index),
      ]),
    );
    const requests: AuthorStageRequest[] = [];
    const result = await authorExperienceCandidates({
      site,
      inspirationPack: {
        ...inspirationPack,
        routes: inspirationPack.routes.map((route) => ({
          ...route,
          referenceDossier: dossiers.get(route.id),
        })),
      },
      generate: async (request) => {
        requests.push(request);
        return safeStage(request);
      },
      model: "test/model",
    });

    expect(requests).toHaveLength(12);
    for (const request of requests)
      expect(request.route.referenceDossier).toEqual(
        dossiers.get(request.route.id),
      );
    for (const candidate of result.candidates) {
      const metadata = JSON.parse(candidate.files["metadata.json"]);
      const contract = JSON.parse(candidate.files["contract.json"]);
      const expectedDossier = dossiers.get(metadata.routeId);
      expect(metadata.creativeManifest.referenceDossier).toEqual(
        expectedDossier,
      );
      expect(contract.creativeManifest.referenceDossier).toEqual(
        expectedDossier,
      );
    }
  });

  it("omits equal cloned route design templates without dropping explicit null", () => {
    const routeDesignTemplate = {
      opening: { layout: "graphic-field", imageRole: "architecture" },
      sequence: ["opening", "project-index", "contact"],
    };
    const clone = () => JSON.parse(JSON.stringify(routeDesignTemplate));
    const referenceDna = {
      evidence: { designTemplate: clone(), captureDimensions: { width: 1440 } },
    };
    const evidence = [
      { name: "matching evidence", designTemplate: clone() },
      { name: "distinct evidence", designTemplate: { opening: "different" } },
    ];

    const result = omitDuplicateRouteDesignTemplates(
      routeDesignTemplate,
      referenceDna,
      evidence,
    );

    expect(result.referenceDna?.evidence).not.toHaveProperty("designTemplate");
    expect(result.referenceDna?.evidence?.captureDimensions).toEqual({
      width: 1440,
    });
    expect(result.evidence[0]).not.toHaveProperty("designTemplate");
    expect(result.evidence[1].designTemplate).toEqual({
      opening: "different",
    });
    expect(referenceDna.evidence.designTemplate).toEqual(clone());

    const explicitNull = omitDuplicateRouteDesignTemplates(
      undefined,
      { evidence: { designTemplate: null } },
      [{ designTemplate: null }],
    );
    expect(explicitNull.referenceDna?.evidence?.designTemplate).toBeNull();
    expect(explicitNull.evidence[0].designTemplate).toBeNull();
  });

  it("keeps contract-repair context bounded when a model omits required fields", async () => {
    const repairRequests: AuthorStageRequest[] = [];
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        if (request.route.id === "route-01" && request.stage === "contract") {
          if (!request.validationError)
            return {
              stage: "contract",
              designContract: "",
              designRationale: "",
              content: "unexpected contract payload ".repeat(500),
            };
          repairRequests.push(request);
        }
        return safeStage(request);
      },
      model: "openai/gpt-6-luna",
    });

    expect(result.candidates).toHaveLength(3);
    expect(repairRequests).toHaveLength(1);
    expect(repairRequests[0].validationError).toContain(
      "contract.designContract",
    );
    expect(repairRequests[0].previousSource).toBeTruthy();
    expect(repairRequests[0].previousSource!.length).toBeLessThanOrEqual(1800);
    expect(repairRequests[0].previousSource).toContain("content=");
    expect(repairRequests[0].previousSource).not.toContain(
      "unexpected contract payload",
    );
  });

  it("limits concurrent model stages to protect the provider in-flight budget", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          return safeStage(request);
        } finally {
          active -= 1;
        }
      },
      model: "test/model",
    });

    expect(result.candidates).toHaveLength(3);
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  it("passes a sealed token manifest and a distinct route brief to every generation stage", async () => {
    const requests: AuthorStageRequest[] = [];
    await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        requests.push(request);
        return safeStage(request);
      },
    });

    expect(requests).toHaveLength(12);
    expect(
      new Set(requests.map((request) => request.route.signature)).size,
    ).toBe(3);
    expect(
      requests.every((request) =>
        request.contentTokens.includes("content.hero.heading"),
      ),
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes("Do not hardcode business facts"),
      ),
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes(
          "Every content-bound @launchloom/runtime helper must receive the sealed object exactly as content={content}",
        ),
      ),
    ).toBe(true);
  });

  it("rejects unsafe imports and network-capable authored code", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage === "experience") {
            return { content: `import axios from "axios";\n${value.content}` };
          }
          return value;
        },
      }),
    ).rejects.toThrow(/unapproved import axios/i);
  });

  it("accepts sealed content aliases created by ordinary React destructuring", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { hero } = content;",
            )
            .replace("content.hero.heading", "hero.heading"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("accepts optional chaining and aliased nested content bindings", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace("content.hero.heading", "content.hero?.heading")
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { hero: heroContent } = content;",
            )
            .replace("content.hero.body", "heroContent.body"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("accepts the sealed copy heading alias", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content, runtime }) {\n  const { copy } = content;",
            )
            .replace("content.hero.heading", "copy.heroHeading"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("keeps successful sibling candidates when one route fails", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        if (request.route.id === "route-02" && request.stage === "experience")
          throw new Error("simulated route failure");
        return safeStage(request);
      },
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.failures).toEqual([
      {
        routeId: "route-02",
        candidateId: "candidate-b",
        error: "simulated route failure",
      },
    ]);
  });

  it("accepts sealed content destructured in the component parameter", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: String(value.content)
            .replace(
              "export default function Experience({ content, runtime }) {",
              "export default function Experience({ content: { hero, services, faqs, brand }, runtime }) {",
            )
            .replaceAll("content.hero.", "hero.")
            .replaceAll("content.services", "services")
            .replaceAll("content.faqs", "faqs")
            .replaceAll("content.brand.", "brand."),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("allows JavaScript comments but rejects actual remote URLs", async () => {
    const accepted = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        return {
          content: `// Preserve route-specific composition.\n${value.content}`,
        };
      },
    });
    expect(accepted.candidates).toHaveLength(3);

    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage !== "experience") return value;
          return {
            content: `${value.content}\nconst remote = "https://example.com";`,
          };
        },
      }),
    ).rejects.toThrow(/forbidden remote URL/i);
  });

  it("keeps motion mounting in the deterministic host", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage !== "experience") return value;
          return { content: `import "./motion.js";\n${value.content}` };
        },
      }),
    ).rejects.toThrow(/unapproved import \.\/motion\.js/i);
  });

  it("repairs one JSX compliance failure without changing the route", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content).replace(
            "<p>{content.hero.body}</p>",
            "<p>Award winning campaign</p>",
          ),
        };
      },
    });

    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("retries one malformed structured stage response", async () => {
    const attempts = new Map<string, number>();
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const key = `${request.route.id}:${request.stage}`;
        const attempt = (attempts.get(key) || 0) + 1;
        attempts.set(key, attempt);
        if (request.stage === "contract" && attempt === 1)
          throw new Error("OpenRouter did not return a valid JSON object.");
        return safeStage(request);
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("normalizes em dashes out of authored source before persistence", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage === "styles")
          return {
            content: `${value.content}\n/* route - authored — safely */`,
          };
        return value;
      },
    });

    expect(
      result.candidates.every(
        (item) => !item.files["styles.css"].includes("—"),
      ),
    ).toBe(true);
  });

  it("repairs motion that omits its reduced-motion path", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content:
            "export function mountExperienceMotion() { document.body.animate([{ opacity: 0 }, { opacity: 1 }]); return () => {}; }",
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs motion that hides required sections until scroll", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content: `export function mountExperienceMotion() {
            const sections = document.querySelectorAll("section");
            gsap.set(sections, { opacity: 0, y: 24 });
            return () => {};
          }
          // prefers-reduced-motion`,
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs motion responses that accidentally contain JSX", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "motion" || request.validationError) return value;
        return {
          content: `import React from "react";\n${value.content}\n<svg />`,
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every(
        (item) =>
          !item.files["motion.js"].includes("<svg") &&
          item.metadata.complianceRepaired,
      ),
    ).toBe(true);
  });

  it("repairs malformed CSS wrappers while retaining decorative empty alts", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage === "styles" && !request.validationError)
          return {
            content: `<!doctype html>\n<html><body></body></html>\n${value.content}\n}\n\"\n}`,
          };
        if (request.stage === "experience" && !request.validationError)
          return {
            content: `${value.content}\n<img src={content.hero.image} alt="" />`,
          };
        return value;
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
    expect(
      result.candidates.every((item) =>
        item.files["Experience.jsx"].includes(
          '<img src={content.hero.image} alt="" />',
        ),
      ),
    ).toBe(true);
  });

  it("repairs missing LeadForm content and anchor navigation bindings", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content)
            .replace(
              "<LeadForm content={content} runtime={runtime} />",
              "<LeadForm runtime={runtime} />",
            )
            .replaceAll('href="#services"', "onClick={() => {}}")
            .replaceAll('href="#faqs"', "onClick={() => {}}")
            .replaceAll('href="#contact"', "onClick={() => {}}"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("repairs helpers with unbound sealed content and wrong runtime imports", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience" || request.validationError)
          return value;
        return {
          content: String(value.content)
            .replace(
              'import { LeadForm } from "@launchloom/runtime";',
              'import LeadForm from "@launchloom/runtime";',
            )
            .replace(
              "export default function Experience",
              "function Header() { return <span>{content.brand.name}</span>; }\nexport default function Experience",
            ),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.every((item) => item.metadata.complianceRepaired),
    ).toBe(true);
  });

  it("uses one final bounded experience repair after a failed repair", async () => {
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const value = safeStage(request);
        if (request.stage !== "experience") return value;
        if (!request.validationError)
          return {
            content: String(value.content).replace(
              "<LeadForm content={content} runtime={runtime} />",
              "<LeadForm runtime={runtime} />",
            ),
          };
        if (request.validationError.includes("first repair still failed"))
          return value;
        return {
          content: String(value.content).replace(
            "<LeadForm content={content} runtime={runtime} />",
            "<LeadForm runtime={runtime} />",
          ),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
  });

  it("rejects authored bundles that bypass sealed business content", async () => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage === "experience") {
            return {
              content: String(value.content).replace(
                "<p>{content.hero.body}</p>",
                "<p>Award winning jeweler</p>",
              ),
            };
          }
          return value;
        },
      }),
    ).rejects.toThrow(/unsupported claim literal/i);
  });

  it("persists generation inputs and authored candidates without success-run artifact duplication", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/generate-client.yml", import.meta.url),
      "utf8",
    );
    const inspirationIndex = workflow.indexOf(
      "node scripts/compile-inspiration-pack.mjs",
    );
    const authorIndex = workflow.indexOf(
      "name: Author independent experience candidates",
    );
    const repositoryIndex = workflow.indexOf(
      "name: Create private repository and Cloudflare Pages project",
    );
    expect(inspirationIndex).toBeGreaterThan(-1);
    expect(authorIndex).toBeGreaterThan(inspirationIndex);
    expect(repositoryIndex).toBeGreaterThan(inspirationIndex);
    expect(authorIndex).toBeGreaterThan(repositoryIndex);
    expect(
      workflow.indexOf("name: Generate or reuse contextual imagery"),
    ).toBeGreaterThan(repositoryIndex);
    expect(
      workflow.indexOf("name: Generate or reuse contextual imagery"),
    ).toBeLessThan(authorIndex);
    expect(workflow).toContain(
      "cp /tmp/seo-research.json .launchloom/seo-research.json",
    );
    expect(workflow).toContain(
      "cp /tmp/inspiration-pack.json .launchloom/inspiration-pack.json",
    );
    expect(workflow).toContain(
      "cp -R /tmp/generated-experiences .launchloom/generated-experiences",
    );
    expect(workflow).toContain(
      "name: Prepare private creative-recovery report",
    );
    expect(workflow).toContain(
      "name: Register one-time repair session and create signed review link",
    );
    expect(workflow).not.toContain("uses: actions/upload-artifact@v4");
    expect(workflow).not.toContain("name: Preserve SEO research evidence");
    expect(workflow).not.toContain("name: Preserve inspiration evidence");
    expect(workflow).not.toContain(
      "name: Preserve reasoning preflight evidence",
    );
    expect(workflow).not.toContain("name: Preserve generated asset evidence");
    expect(workflow).not.toContain(
      "name: Preserve authored experience evidence",
    );
    expect(workflow).not.toContain("name: Upload rendered initial evidence");
    expect(workflow).not.toContain("name: Upload experience bakeoff evidence");
    expect(workflow).not.toContain("name: Upload creative bakeoff evidence");
    expect(workflow).toContain(
      "SESSION_ARGS=(--session /tmp/reasoning-preflight.json)",
    );
    expect(workflow).toContain("--failure-mode throw");
    expect(workflow).not.toContain("--failure-mode record");
    expect(
      workflow.match(
        /PUBLIC_REVIEW_MODE=true node "\$GITHUB_WORKSPACE\/scripts\/verify-rendered-revision\.mjs"/g,
      ),
    ).toHaveLength(1);
  });

  it("emits route-specific content manifests with independently reproducible digests", async () => {
    const routeSite = {
      ...site,
      creativeAssets: {
        "route-01": {
          hero: "/images/generated/route-01-hero.webp",
          secondary: "/images/generated/route-01-secondary.webp",
          tertiary: "/images/generated/route-01-tertiary.webp",
        },
        "route-02": {
          hero: "/images/generated/route-02-hero.webp",
          secondary: "/images/generated/route-02-secondary.webp",
          tertiary: "/images/generated/route-02-tertiary.webp",
        },
        "route-03": {
          hero: "/images/generated/route-03-hero.webp",
          secondary: "/images/generated/route-03-secondary.webp",
          tertiary: "/images/generated/route-03-tertiary.webp",
        },
      },
    };
    const seen = new Map<string, string>();
    const result = await authorExperienceCandidates({
      site: routeSite,
      inspirationPack,
      generate: async (request) => {
        seen.set(request.route.id, request.contentShape.hero.image);
        return safeStage(request);
      },
    });

    expect(seen.get("route-01")).toBe("/images/generated/route-01-hero.webp");
    expect(seen.get("route-02")).toBe("/images/generated/route-02-hero.webp");
    expect(seen.get("route-03")).toBe("/images/generated/route-03-hero.webp");

    // The digest covers the manifest without its digest field, sorting object
    // keys recursively while retaining array order.
    function sortKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            )
            .map(([key, item]) => [key, sortKeys(item)]),
        );
      return value;
    }
    function recomputeDigest(manifest: Record<string, unknown>) {
      const { digest: _digest, ...payload } = manifest;
      return createHash("sha256")
        .update(JSON.stringify(sortKeys(payload)))
        .digest("hex");
    }

    expect(result.candidates).toHaveLength(3);
    expect(result.contentManifest.values.hero).toMatchObject({
      image: "",
      secondaryImage: "",
      tertiaryImage: "",
    });
    expect(recomputeDigest(result.contentManifest)).toBe(
      result.contentManifest.digest,
    );
    const digests = new Set<string>();
    for (const candidate of result.candidates) {
      const metadata = JSON.parse(candidate.files["metadata.json"]);
      expect(metadata.contentManifestPath).toBe("content-manifest.json");
      expect(candidate.metadata.contentManifestPath).toBe(
        metadata.contentManifestPath,
      );
      const manifest = JSON.parse(candidate.files["content-manifest.json"]);
      const assets =
        routeSite.creativeAssets[
          metadata.routeId as keyof typeof routeSite.creativeAssets
        ];
      expect(manifest.values).toEqual({
        ...result.contentManifest.values,
        hero: {
          ...result.contentManifest.values.hero,
          image: assets.hero,
          secondaryImage: assets.secondary,
          tertiaryImage: assets.tertiary,
        },
      });
      expect(manifest.tokens).toEqual(result.contentManifest.tokens);
      const recomputed = recomputeDigest(manifest);
      expect(manifest.digest).toBe(recomputed);
      expect(metadata.contentManifestDigest).toBe(recomputed);
      expect(candidate.metadata.contentManifestDigest).toBe(recomputed);
      expect(metadata.creativeManifest.contentManifestDigest).toBe(recomputed);
      expect(
        JSON.parse(candidate.files["contract.json"]).creativeManifest
          .contentManifestDigest,
      ).toBe(recomputed);
      expect(recomputed).not.toBe(result.contentManifest.digest);
      digests.add(recomputed);
    }
    expect(digests.size).toBe(3);
  });
});
