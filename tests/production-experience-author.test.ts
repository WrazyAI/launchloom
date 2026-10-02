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
  validateLocationPage,
  validateServicePage,
  validateServicesIndexPage,
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
    <section id="contact"><LeadForm content={content} runtime={runtime} /><a href={"tel:" + content.brand.phone}>{content.brand.phone}</a></section></main>
  </div>;
}`,
    };
  }
  if (request.stage === "service") {
    return {
      content: `import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service }) {
  return <main data-service-page data-service-slug={service.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-service-hero><h1>{service.name}</h1><p>{service.description}</p><a href="#contact">{content.hero.primaryLabel}</a></section>
    <section data-service-support><h2>{service.name}</h2><p>{service.support.scope}</p><p>{service.support.preparation}</p><p>{service.support.nextStep}</p></section>
    <section data-service-related><ul>{service.related.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    {service.process.length > 0 && <ol>{service.process.map((step) => <li key={step}>{step}</li>)}</ol>}
    {service.faqs.length > 0 && <section>{service.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`,
    };
  }
  if (request.stage === "service-index") {
    return {
      content: `import { LeadForm } from "@launchloom/runtime";
export default function ServicesIndexPage({ content, runtime }) {
  return <main data-services-index>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-services-index-hero><h1>{content.copy.servicesHeading || content.hero.heading}</h1><p>{content.copy.servicesIntro}</p></section>
    <section data-services-index-list><ul>{content.services.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`,
    };
  }
  if (request.stage === "location") {
    return {
      content: `import { LeadForm } from "@launchloom/runtime";
export default function LocationPage({ content, runtime, location }) {
  return <main data-location-page data-location-slug={location.slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-location-hero><h1>{location.name}</h1><p>{location.description}</p></section>
    <section data-location-coverage><p>{location.localNote}</p></section>
    <section data-location-related><ul>{location.services.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}{location.otherAreas.map((area) => <li key={area.slug}><a href={\`/locations/\${area.slug}/\`}>{area.name}</a></li>)}</ul></section>
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
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
  it("rejects unsealed or non-navigation URL attributes", () => {
    const route = { id: "route-url-safety" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const base = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const unsafeSources = [
      base.replace(
        "<section data-hero>",
        '<section data-hero><svg><image href="/images/unsealed.svg" /></svg>',
      ),
      base.replace(
        "<section data-hero>",
        '<section data-hero><object data="data:text/html,hello" />',
      ),
      base.replace(
        '<a href={"tel:" + content.brand.phone}>',
        "<a href={content.brand.phone}>",
      ),
      base.replace(
        "<section data-hero>",
        '<section data-hero><img src="/images/unsealed.webp" alt="Unsealed" />',
      ),
    ];

    for (const experience of unsafeSources)
      expect(() =>
        validateProductionCandidateFiles({
          files: { experience, styles, motion },
          route,
          content: {
            hero: { image: "/images/hero.webp" },
            brand: { phone: "+12125550186" },
          },
        }),
      ).toThrow(
        /unsafe URL attribute|image source must use a sealed image content token/iu,
      );
  });

  it("allows local navigation, sealed image tokens, and prefixed contact tokens", () => {
    const route = { id: "route-safe-url" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    ).replace(
      "<section data-hero>",
      '<section data-hero><img src={content.hero.image} alt="A reviewed image" /><a href="/services/repair/">Service details</a>',
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
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
        },
      }),
    ).not.toThrow();

    const serviceDetail = experience.replace(
      "<article key={service.name}>",
      "<article key={service.name}><a href={`/services/${service.slug}/`}>{service.name}</a>",
    );
    expect(serviceDetail).not.toBe(experience);
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: serviceDetail, styles, motion },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
          services: [{ slug: "repair", name: "Repair" }],
        },
      }),
    ).not.toThrow();

    const aliasedServiceDetail = serviceDetail
      .replace(
        "{content.services.map((service) =>",
        "{(() => { const serviceItems = content.services; return serviceItems.map((service) =>",
      )
      .replace("</article>)}</section>", "</article>); })()}</section>");
    expect(aliasedServiceDetail).toContain("serviceItems.map((service) =>");
    expect(aliasedServiceDetail).not.toContain(
      "content.services.map((service) =>",
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: aliasedServiceDetail, styles, motion },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
          services: [{ slug: "repair", name: "Repair" }],
        },
      }),
    ).not.toThrow();

    const unsealedServiceDetail = aliasedServiceDetail.replace(
      "const serviceItems = content.services",
      'const boundServices = content.services; const serviceItems = [{ slug: "outside-content" }]',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: unsealedServiceDetail, styles, motion },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
          services: [{ slug: "repair", name: "Repair" }],
        },
      }),
    ).toThrow(/unsafe URL attribute/iu);

    const shadowedServiceDetail = serviceDetail.replace(
      "export default function Experience",
      `const serviceItems = content.services;
function UntrustedLinks() {
  const serviceItems = [{ slug: "outside-content" }];
  return serviceItems.map((service) => <a href={\`/services/\${service.slug}/\`}>{service.slug}</a>);
}
export default function Experience`,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: shadowedServiceDetail, styles, motion },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
          services: [{ slug: "repair", name: "Repair" }],
        },
      }),
    ).toThrow(/unsafe URL attribute/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles: `${styles}\n.hero { background-image: url('/images/unsealed.webp'); }`,
          motion,
        },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
        },
      }),
    ).toThrow(/CSS must use sealed image content tokens/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience: experience.replace(
            '<a href="/services/repair/">',
            "<a href={`tel:${content.brand.phone}`}>",
          ),
          styles,
          motion,
        },
        route,
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
        },
      }),
    ).not.toThrow();
  });

  it("allows only a const phone href normalized from the sealed phone token", () => {
    const route = { id: "route-normalized-phone" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const base = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const experience = base
      .replace(
        "export default function Experience({ content, runtime }) {",
        'export default function Experience({ content, runtime }) {\n  const phoneHref = `tel:${content.brand.phone.replace(/[^\\d+]/g, "")}`;',
      )
      .replace(
        '<a href={"tel:" + content.brand.phone}>',
        "<a href={phoneHref}>",
      );

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience, styles, motion },
        route,
        content: { brand: { phone: "+1 (212) 555-0186" } },
      }),
    ).not.toThrow();

    const unsafe = experience.replace(
      '`tel:${content.brand.phone.replace(/[^\\d+]/g, "")}`',
      '"https://example.test/"',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: unsafe, styles, motion },
        route,
        content: { brand: { phone: "+1 (212) 555-0186" } },
      }),
    ).toThrow(/forbidden remote URL|unsafe URL attribute/iu);

    const unsafeTransform = experience.replace(
      String.raw`replace(/[^\d+]/g, "")`,
      'replace(/./g, "x")',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: unsafeTransform, styles, motion },
        route,
        content: { brand: { phone: "+1 (212) 555-0186" } },
      }),
    ).toThrow(/unsafe URL attribute/iu);

    const mutableAlias = experience.replace("const phoneHref", "let phoneHref");
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: mutableAlias, styles, motion },
        route,
        content: { brand: { phone: "+1 (212) 555-0186" } },
      }),
    ).toThrow(/unsafe URL attribute/iu);
  });

  it("accepts an empty optional image only when its sealed token guards rendering", () => {
    const route = { id: "route-optional-image" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const base = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const motion = String(
      safeStage({ ...request, stage: "motion" }).content || "",
    );
    const guarded = base.replace(
      "<section data-hero>",
      '<section data-hero>{content.hero.secondaryImage && <img src={content.hero.secondaryImage} alt="" />}',
    );
    const content = {
      hero: {
        image: "/images/hero.webp",
        secondaryImage: "",
        tertiaryImage: "",
      },
      brand: { phone: "+12125550186" },
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: guarded, styles, motion },
        route,
        content,
      }),
    ).not.toThrow();

    const unguarded = guarded.replace(
      '{content.hero.secondaryImage && <img src={content.hero.secondaryImage} alt="" />}',
      '<img src={content.hero.secondaryImage} alt="" />',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: unguarded, styles, motion },
        route,
        content,
      }),
    ).toThrow(/optional image token.*conditionally render/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: guarded, styles, motion },
        route,
        content: {
          ...content,
          hero: {
            ...content.hero,
            secondaryImage: "https://example.test/remote.webp",
          },
        },
      }),
    ).toThrow(/safe local or LaunchLoom-hosted image asset/iu);
  });

  it("allows an absent optional logo only behind that same sealed logo guard", () => {
    const route = { id: "route-optional-logo" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const base = String(safeStage({ ...request, stage: "experience" }).content || "");
    const styles = String(safeStage({ ...request, stage: "styles" }).content || "");
    const motion = String(safeStage({ ...request, stage: "motion" }).content || "");
    const guard = '{content.brand.logo && <img src={content.brand.logo} alt="" />}';
    const guarded = base.replace("<section data-hero>", `<section data-hero>${guard}`);
    const content = { hero: { image: "/images/hero.webp" }, brand: { logo: "", phone: "+12125550186" } };
    const validate = (experience: string, logo = "") => validateProductionCandidateFiles({
      files: { experience, styles, motion }, route, content: { ...content, brand: { ...content.brand, logo } },
    });
    expect(() => validate(guarded)).not.toThrow();
    expect(() => validate(guarded, "/images/client-logo.svg")).not.toThrow();
    expect(() => validate(guarded, "https://unapproved.test/logo.webp")).toThrow(/safe local or LaunchLoom-hosted/iu);
    const unguarded = guarded.replace(guard, '<img src={content.brand.logo} alt="" />');
    expect(() => validate(unguarded)).toThrow(/conditionally render/iu);
    const unrelatedGuard = guarded.replace('content.brand.logo &&', 'content.hero.image &&');
    expect(() => validate(unrelatedGuard)).toThrow(/conditionally render/iu);
  });

  it("retries an empty optional image with the exact safe rendering rule", async () => {
    const requests: AuthorStageRequest[] = [];
    let retryRequest: AuthorStageRequest | undefined;
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        requests.push(request);
        const base = safeStage(request);
        if (request.route.id !== "route-02" || request.stage !== "experience")
          return base;
        if (request.validationError) {
          retryRequest = request;
          return base;
        }
        return {
          content: String(base.content).replace(
            "<section data-hero>",
            '<section data-hero><img src={content.hero.secondaryImage} alt="" />',
          ),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(retryRequest?.validationError).toMatch(
      /optional image token content\.hero\.secondaryImage.*conditionally render/iu,
    );
    expect(
      result.candidates.find(
        (candidate) => candidate.metadata.routeId === "route-02",
      )?.metadata.complianceRepaired,
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes("The sealed hero image tokens may be empty"),
      ),
    ).toBe(true);
    expect(
      requests.every((request) =>
        request.rules.includes(
          "Phone and email links must use their sealed tokens",
        ),
      ),
    ).toBe(true);
    expect(requests[0]?.rules).toContain(String.raw`replace(/[^\d+]/g, "")`);
  });

  it("retries unsafe candidate links with the deterministic validation finding", async () => {
    let repairRequest: AuthorStageRequest | undefined;
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        const base = safeStage(request);
        if (request.route.id !== "route-01" || request.stage !== "experience")
          return base;
        if (request.validationError) {
          repairRequest = request;
          return base;
        }
        return {
          content: String(base.content)
            .replace(
              "{content.services.map((service) =>",
              "{(() => { const serviceItems = [{ slug: 'unsealed' }]; return serviceItems.map((service) =>",
            )
            .replace(
              "<article key={service.name}>",
              "<article key={service.name}><a href={`/services/${service.slug}/`}>{service.name}</a>",
            )
            .replace("</article>)}</section>", "</article>); })()}</section>"),
        };
      },
    });

    expect(result.candidates).toHaveLength(3);
    expect(repairRequest?.validationError).toMatch(/unsafe URL attribute/iu);
    const repairedCandidate = result.candidates.find(
      (candidate) => candidate.metadata.routeId === "route-01",
    );
    expect(repairedCandidate?.metadata.complianceRepaired).toBe(true);
    expect(repairedCandidate?.files["Experience.jsx"]).not.toContain(
      "unsealed",
    );
  });

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

  it("rejects silent hero-image reuse across distinct image roles", () => {
    const route = { id: "route-image-role-reuse" };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    ).replace(
      "<section data-hero>",
      '<section data-hero><img src={content.hero.image} alt="Primary" /><img src={content.hero.image} alt="Repeated one" /><img src={content.hero.image} alt="Repeated two" />',
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
        content: {
          hero: {
            image: "/images/hero.webp",
            secondaryImage: "",
            tertiaryImage: "",
          },
        },
      }),
    ).toThrow(/reuses the primary hero image across distinct image roles/iu);
  });

  it("requires a dedicated stateful interaction when the client brief asks for one", () => {
    const route = { id: "route-purposeful-interaction" };
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
    const visualBrief = {
      artDirection:
        "Use one purposeful interactive care guide to help visitors choose a next step.",
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: { experience, styles, motion },
        route,
        visualBrief,
      }),
    ).toThrow(/must implement the purposeful interaction requested/iu);

    const guided = experience.replace(
      '<section id="services">',
      '<section id="services" data-purposeful-interaction><details><summary>{content.services[0].name}</summary><p>{content.services[0].description}</p></details>',
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: { experience: guided, styles, motion },
        route,
        visualBrief,
      }),
    ).not.toThrow();
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
        content: {
          hero: { image: "/images/hero.webp" },
          brand: { phone: "+12125550186" },
        },
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

  it("allows the single shared LeadForm in a reference-mandated utility-panel hero", () => {
    const route = {
      id: "route-utility-form",
      compositionTopology: {
        hero: "utility-panel",
        mobileHero: "utility-panel",
      },
    };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    )
      .replace(
        "<section data-hero>",
        '<section data-hero><aside className="estimate-panel"><LeadForm content={content} runtime={runtime} /></aside>',
      )
      .replace(
        '<section id="contact"><LeadForm content={content} runtime={runtime} />',
        '<section id="contact">',
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
    ).not.toThrow();
  });

  it("keeps the single shared LeadForm in contact when the reference has no utility-panel hero", () => {
    const route = { id: "route-contact-form" };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    )
      .replace(
        "<section data-hero>",
        '<section data-hero><aside className="estimate-panel"><LeadForm content={content} runtime={runtime} /></aside>',
      )
      .replace(
        '<section id="contact"><LeadForm content={content} runtime={runtime} />',
        '<section id="contact">',
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
      /must render the shared LeadForm inside the contact section for this reference/iu,
    );
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
    ])
      expect(() =>
        validateProductionCandidateFiles({
          files: { experience, styles, motion },
          route,
        }),
      ).toThrow(
        'Candidate route-hidden-navigation navigation must expose literal <a href="#services"> inside a visible native <nav>.',
      );

    for (const experience of [
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
        "Candidate route-hidden-navigation contains forbidden inline styles; visual rules belong in styles.css.",
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

  it("keeps shared creative form helper text on the candidate contrast palette", async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const styles = readFileSync(
        "templates/client-site/src/styles/creative-runtime.css",
        "utf8",
      );
      await page.setContent(
        `<style>${styles}</style><body style="--ink:#14201d"><div data-creative-host="true" style="--ll-creative-ink:#ffffff;--ll-creative-muted:#cccccc;background:#14201d"><form class="launchloom-lead-form"><label>Name<input></label><small>Prepare for your visit</small></form></div></body>`,
      );
      expect(
        await page
          .locator("label")
          .evaluate((el) => getComputedStyle(el).color),
      ).toBe("rgb(255, 255, 255)");
      expect(
        await page
          .locator("small")
          .evaluate((el) => getComputedStyle(el).color),
      ).toBe("rgb(204, 204, 204)");
      expect(
        await page
          .locator("[data-creative-host]")
          .evaluate((el) => getComputedStyle(el).overflowX),
      ).toBe("clip");
    } finally {
      await browser.close();
    }
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

  it("namespaces candidate variables when comments precede their declarations", () => {
    const css = namespaceCreativeCss(`
      :root {
        /* Palette chosen for this reference family. */
        --primary: #14221d;
        --accent: var(--primary);
        /* --comment-only: #fff; */
      }
      .hero { color: var(--primary); background: var(--host-token); }
    `);

    expect(css).toContain("--ll-creative-primary: #14221d");
    expect(css).toContain("--ll-creative-accent: var(--ll-creative-primary)");
    expect(css).toContain("color: var(--ll-creative-primary)");
    expect(css).toContain("background: var(--host-token)");
    expect(css).toContain("--comment-only: #fff;");
    expect(css).not.toContain("--primary:");
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
        "ServicePage.jsx",
        "ServicesIndexPage.jsx",
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

    expect(requests).toHaveLength(18);
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

    expect(requests).toHaveLength(18);
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
    expect(
      requests.every(
        (request) =>
          request.rules.includes("EARLY CONVERSION INVARIANT") &&
          request.rules.includes("native anchor to #contact") &&
          request.rules.includes("data-early-conversion") &&
          request.rules.includes("REFERENCE PROVENANCE BOUNDARY") &&
          !request.rules.includes("anchor or button"),
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

  it.each([
    ["style elements", "<style></style>"],
    ["inline style props", ""],
  ])("keeps Experience.jsx free of %s", async (kind, prefix) => {
    await expect(
      authorExperienceCandidates({
        site,
        inspirationPack,
        generate: async (request) => {
          const value = safeStage(request);
          if (request.stage !== "experience") return value;
          if (kind === "style elements")
            return {
              content: String(value.content).replace(
                "    <main>",
                `    ${prefix}\n    <main>`,
              ),
            };
          return {
            content: String(value.content).replace(
              "<div data-model-experience=",
              '<div style="color:red" data-model-experience=',
            ),
          };
        },
      }),
    ).rejects.toThrow(/inline styles; visual rules belong in styles\.css/iu);
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
    const routeError = new Error("simulated route failure");
    routeError.stack = [
      "Error: simulated route failure",
      `    at validateProductionCandidateFiles (${process.cwd()}/scripts/production-experience-author.mjs:1430:9)`,
    ].join("\n");
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        if (request.route.id === "route-02" && request.stage === "experience")
          throw routeError;
        return safeStage(request);
      },
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.failures).toEqual([
      {
        routeId: "route-02",
        candidateId: "candidate-b",
        error: "simulated route failure",
        stack:
          "at validateProductionCandidateFiles (<workspace>/scripts/production-experience-author.mjs:1430:9)",
      },
    ]);
  });

  it("retains bounded per-route failures without credentials or image bytes when every author fails", async () => {
    const error: any = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async () => {
        throw new Error(`Provider/source failure sk-or-v1-${"d".repeat(64)} data:image/webp;base64,${"A".repeat(16000)} ${"x".repeat(8000)}`);
      },
    }).catch((failure) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error.failures).toHaveLength(3);
    expect(error.failures.map((failure: any) => failure.candidateId)).toEqual(["candidate-a", "candidate-b", "candidate-c"]);
    for (const failure of error.failures) {
      expect(failure.error.length).toBeLessThanOrEqual(2000);
      expect(failure.error).not.toContain("sk-or-v1-");
      expect(failure.error).not.toContain("data:image");
    }
    expect(error.message.length).toBeLessThanOrEqual(4000);
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

  it("bounds motion DOM mutation to presentation-safe candidate state", () => {
    const route = { id: "route-motion-mutation" };
    const request = { route, contentTokens: [], contentShape: {}, rules: "" };
    const experience = String(
      safeStage({ ...request, stage: "experience" }).content || "",
    );
    const styles = String(
      safeStage({ ...request, stage: "styles" }).content || "",
    );
    const baseMotion =
      'export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; const node = document.querySelector(".hero"); /* MUTATION */ return () => {}; }';

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion: baseMotion.replace(
            "/* MUTATION */",
            'node.textContent = "rewritten";',
          ),
        },
        route,
      }),
    ).toThrow(/must not rewrite visitor-facing content/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion: baseMotion.replace(
            "/* MUTATION */",
            'if (node.textContent === "ready") node.classList.add("ready");',
          ),
        },
        route,
      }),
    ).not.toThrow();

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion: baseMotion.replace(
            "/* MUTATION */",
            'node.textContent += "rewritten";',
          ),
        },
        route,
      }),
    ).toThrow(/must not rewrite visitor-facing content/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion: baseMotion.replace(
            "/* MUTATION */",
            'node.style.setProperty("--accent", "1");',
          ),
        },
        route,
      }),
    ).toThrow(/--ll-creative/iu);

    expect(() =>
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion: baseMotion.replace(
            "/* MUTATION */",
            'node.style.setProperty("--ll-creative-progress", "1");',
          ),
        },
        route,
      }),
    ).not.toThrow();
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
      site: {
        ...site,
        assets: { ...site.assets, photoOne: site.assets.hero },
      },
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

  it("stabilizes reference-driven Experience repairs before authoring styles and motion", () => {
    const source = readFileSync(
      new URL("../scripts/production-experience-author.mjs", import.meta.url),
      "utf8",
    );
    const repairIndex = source.indexOf(
      "Reference fidelity repair cycle ${referenceRepairCycles}/2",
    );
    const stylesIndex = source.indexOf(
      "const [stylesOutput, motionOutput] = await Promise.all",
    );
    const finalBundleCheckIndex = source.indexOf("const finalFidelity");

    expect(repairIndex).toBeGreaterThan(-1);
    expect(stylesIndex).toBeGreaterThan(repairIndex);
    expect(finalBundleCheckIndex).toBeGreaterThan(stylesIndex);
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

  it("persists a sanitized prompt-evidence manifest for authored and failed runs", () => {
    const source = readFileSync(
      new URL("../scripts/author-production-experiences.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('path.join(staging, "prompt-evidence.json")');
    expect(source).toContain('path.join(outputPath, "prompt-evidence.json")');
    expect(source).toContain("systemPromptDigest");
    expect(source).toContain("routePromptDigest");
    expect(source).toContain("stagePromptDigest");
    expect(source).toContain("referenceDossierDigest");
    expect(source).toContain("evidenceManifest");
    expect(source).toContain(
      "compositionTopology: request.route.compositionTopology",
    );
    expect(source).toContain("data-hero-copy");
    expect(source).toContain("data-hero-media");
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

  it("authors a service detail page per candidate and hands it to the styles stage", async () => {
    const requests: AuthorStageRequest[] = [];
    const result = await authorExperienceCandidates({
      site,
      inspirationPack,
      generate: async (request) => {
        requests.push(request);
        return safeStage(request);
      },
    });

    for (const candidate of result.candidates) {
      expect(candidate.files["ServicePage.jsx"]).toContain("data-service-page");
      expect(candidate.metadata.servicePageAuthored).toBe(true);
      expect(candidate.files["ServicesIndexPage.jsx"]).toContain(
        "data-services-index",
      );
      expect(candidate.metadata.servicesIndexAuthored).toBe(true);
      expect(candidate.files["LocationPage.jsx"]).toBeUndefined();
      expect(candidate.metadata.locationPageAuthored).toBe(false);
    }
    const serviceRequests = requests.filter(
      (request) => request.stage === "service",
    );
    expect(serviceRequests).toHaveLength(3);
    for (const request of serviceRequests)
      expect(request.experienceSource).toContain("Experience");
    const servicesIndexRequests = requests.filter(
      (request) => request.stage === "service-index",
    );
    expect(servicesIndexRequests).toHaveLength(3);
    for (const request of servicesIndexRequests) {
      expect(request.experienceSource).toContain("Experience");
      expect(request.servicePageSource).toContain("data-service-page");
    }
    const stylesRequests = requests.filter(
      (request) => request.stage === "styles",
    );
    expect(stylesRequests).toHaveLength(3);
    for (const request of stylesRequests) {
      expect(request.servicePageSource).toContain("data-service-page");
      expect(request.servicesIndexSource).toContain("data-services-index");
    }
  });

  it("authors location pages only when the intake lists home-service areas", async () => {
    const requests: AuthorStageRequest[] = [];
    const locationSite = {
      ...site,
      industry: "home-services",
      businessKind: "plumbing",
      locations: [
        {
          name: "East Austin",
          slug: "east-austin",
          description: "Serving East Austin homes.",
          localNote: "Same-week scheduling depends on the current route.",
        },
        {
          name: "Cedar Park",
          slug: "cedar-park",
          description: "Serving Cedar Park homes.",
        },
      ],
    };
    const result = await authorExperienceCandidates({
      site: locationSite,
      inspirationPack,
      generate: async (request) => {
        requests.push(request);
        return safeStage(request);
      },
    });

    for (const candidate of result.candidates) {
      expect(candidate.files["LocationPage.jsx"]).toContain(
        "data-location-page",
      );
      expect(candidate.metadata.locationPageAuthored).toBe(true);
    }
    const locationRequests = requests.filter(
      (request) => request.stage === "location",
    );
    expect(locationRequests).toHaveLength(3);
    for (const request of locationRequests)
      expect(request.servicePageSource).toContain("data-service-page");
    const stylesRequests = requests.filter(
      (request) => request.stage === "styles",
    );
    expect(stylesRequests).toHaveLength(3);
    for (const request of stylesRequests) {
      expect(request.locationPageSource).toContain("data-location-page");
      expect(request.servicesIndexSource).toContain("data-services-index");
    }
  });

  it("validates the authored service page contract", () => {
    const route = { id: "route-service" };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const valid = String(
      safeStage({ ...request, stage: "service" }).content || "",
    );
    expect(() => validateServicePage(valid, route, {})).not.toThrow();

    const missingRuntime = valid.replace(
      'import { LeadForm } from "@launchloom/runtime";\n',
      "",
    );
    expect(() => validateServicePage(missingRuntime, route, {})).toThrow(
      /LeadForm/u,
    );

    const missingMarker = valid.replace(
      "data-service-support",
      "data-service-decisions",
    );
    expect(() => validateServicePage(missingMarker, route, {})).toThrow(
      /data-service-support/u,
    );

    const missingRelated = valid.replace(/service\.related/gu, "service.items");
    expect(() => validateServicePage(missingRelated, route, {})).toThrow(
      /service\.related/u,
    );

    const remoteImage = valid.replace(
      "</main>",
      '<img src="https://example.com/service.png" alt="Service context" /></main>',
    );
    expect(() => validateServicePage(remoteImage, route, {})).toThrow(
      /remote URL/u,
    );

    const missingContact = valid.replace('id="contact"', 'id="reach-us"');
    expect(() => validateServicePage(missingContact, route, {})).toThrow(
      /contact/u,
    );

    const destructured = `import { LeadForm } from "@launchloom/runtime";
export default function ServicePage({ content, runtime, service: { name, slug, description, support, related, process, faqs } }) {
  return <main data-service-page data-service-slug={slug}>
    <nav aria-label="Main navigation"><a href="/">{content.brand.name}</a><a href="#contact">{content.hero.primaryLabel}</a></nav>
    <section data-service-hero><h1>{name}</h1><p>{description}</p></section>
    <section data-service-support><p>{support.scope}</p><p>{support.preparation}</p><p>{support.nextStep}</p></section>
    <section data-service-related><ul>{related.map((item) => <li key={item.slug}><a href={\`/services/\${item.slug}/\`}>{item.name}</a></li>)}</ul></section>
    {process.length > 0 && <ol>{process.map((step) => <li key={step}>{step}</li>)}</ol>}
    {faqs.length > 0 && <section>{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
    <section id="contact"><LeadForm content={content} runtime={runtime} /></section>
  </main>;
}`;
    expect(() => validateServicePage(destructured, route, {})).not.toThrow();
  });

  it("validates the authored location and services-index page contracts", () => {
    const route = { id: "route-inner-pages" };
    const request = {
      route,
      contentTokens: [],
      contentShape: {},
      rules: "",
    };
    const locationPage = String(
      safeStage({ ...request, stage: "location" }).content || "",
    );
    expect(() => validateLocationPage(locationPage, route, {})).not.toThrow();
    expect(() =>
      validateLocationPage(
        locationPage.replace("data-location-coverage", "data-location-notes"),
        route,
        {},
      ),
    ).toThrow(/data-location-coverage/u);
    expect(() =>
      validateLocationPage(
        locationPage.replace(/location\.localNote/gu, "location.summary"),
        route,
        {},
      ),
    ).toThrow(/location\.localNote/u);
    expect(() =>
      validateLocationPage(
        locationPage.replace('id="contact"', 'id="reach-us"'),
        route,
        {},
      ),
    ).toThrow(/contact/u);

    const servicesIndexPage = String(
      safeStage({ ...request, stage: "service-index" }).content || "",
    );
    expect(() =>
      validateServicesIndexPage(servicesIndexPage, route, {}),
    ).not.toThrow();
    expect(() =>
      validateServicesIndexPage(
        servicesIndexPage.replace(
          "data-services-index-list",
          "data-services-list",
        ),
        route,
        {},
      ),
    ).toThrow(/data-services-index-list/u);
    expect(() =>
      validateServicesIndexPage(
        servicesIndexPage.replace(
          /content\.copy\.servicesIntro/gu,
          "content.copy.servicesBody",
        ),
        route,
        {},
      ),
    ).toThrow(/content\.copy\.servicesIntro/u);
    expect(() =>
      validateServicesIndexPage(
        servicesIndexPage.replace(
          "</main>",
          '<img src="https://example.com/index.png" alt="Services" /></main>',
        ),
        route,
        {},
      ),
    ).toThrow(/remote URL/u);
  });
});

it("supplies safe local color pairings before creative authorship", () => {
  const manifest = buildCreativeContentManifest({
    ...site,
    style: {
      primaryColor: "#e8d590",
      surfaceColor: "#ffffff",
      inkColor: "#f8f6f0",
    },
  });
  expect(manifest.visualBrief.palette).toHaveProperty("surfaces.nav");
  expect(manifest.visualBrief.palette.inkColor).not.toBe("#f8f6f0");
});
it("preserves canonical semantic color properties while isolating arbitrary authored tokens", () => {
  const css = namespaceCreativeCss(
    '[data-ll-surface="nav"]{--ll-text:#14201d;--ink:white;color:var(--ll-text);background:var(--ink)}',
  );
  expect(css).toContain("color:var(--ll-text)");
  expect(css).toContain("--ll-text:#14201d");
  expect(css).toContain("--ll-creative-ink:white");
});
