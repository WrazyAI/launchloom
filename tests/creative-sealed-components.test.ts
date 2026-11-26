import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import * as runtime from "../templates/client-site/src/lib/creative-runtime";
import { validateProductionCandidateFiles } from "../scripts/production-experience-author.mjs";

const content: runtime.CreativeContent = {
  brand: { name: "Fixture", phone: "", email: "", address: "", serviceAreas: [] },
  hero: { kicker: "", heading: "A heading", body: "Distinct body", primaryLabel: "Contact", image: "/images/sash.webp" },
  services: [{ name: "Sash repair", description: "Discuss the sash.", slug: "sash-repair" }],
  proof: [],
  process: [],
  faqs: [{ question: "How does it work?", answer: "We start with an assessment." }],
  locations: [],
  locationMap: { available: false, address: "", hours: "", directionsHref: "", embedHref: "" },
  copy: {},
  businessDescription: "",
  showLocationMap: false,
  hasSocialProof: false,
  socialProof: null,
};

describe("sealed creative runtime components", () => {
  it("renders destinations and image URLs from the approved content without authored URLs", () => {
    expect(typeof runtime.ServiceLink).toBe("function");
    expect(typeof runtime.CreativeImage).toBe("function");
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(runtime.ServiceLink, { content, index: 0, className: "service" }, "See service"),
      createElement(runtime.CreativeImage, { content, slot: "hero", alt: "Timber sash", className: "art" }),
    ));
    expect(html).toContain('<a href="/services/sash-repair/" class="service">See service</a>');
    expect(html).toContain('<img src="/images/sash.webp" alt="Timber sash" class="art"');
  });

  it("omits missing media or invalid service indices", () => {
    expect(renderToStaticMarkup(createElement(Fragment, null,
      createElement(runtime.ServiceLink, { content, index: 99 }),
      createElement(runtime.CreativeImage, { content, slot: "secondary", alt: "" }),
    ))).toBe("");
  });

  it("keeps approved media when alt is not a string", () => {
    const html = renderToStaticMarkup(createElement(runtime.CreativeImage, {
      content,
      slot: "hero",
      alt: 0 as unknown as string,
    }));
    expect(html).toContain('<img src="/images/sash.webp" alt=""');
  });

  it("does not render nonapproved configured media or malformed configured slugs", () => {
    const unapproved = {
      ...content,
      hero: { ...content.hero, image: "https://fixture.invalid/photo.webp" },
      services: [{ ...content.services[0], slug: "not/a/service-slug" }],
    };
    expect(renderToStaticMarkup(createElement(Fragment, null,
      createElement(runtime.ServiceLink, { content: unapproved, index: 0 }),
      createElement(runtime.CreativeImage, { content: unapproved, slot: "hero", alt: "Illustration" }),
    ))).toBe("");
  });

  it("rejects overriding the trusted component contracts in authored source", () => {
    const experience = `import { CreativeImage, ServiceLink, LeadForm } from "@launchloom/runtime";
export default function Experience({ content, runtime }) {
  return <main><nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
  <section data-hero><h1>{content.hero.heading}</h1><p>{content.hero.body}</p><button data-early-conversion>{content.hero.primaryLabel}</button><CreativeImage content={content} slot="hero" alt="Illustrated window" /></section>
  <section id="services">{content.services.map((service, index) => <article key={service.name}><h2>{service.name}</h2><p>{service.description}</p><ServiceLink content={content} index={index} /></article>)}</section>
  <section id="faqs">{content.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
  <section id="contact"><LeadForm content={content} runtime={runtime} /><a href={"tel:" + content.brand.phone}>{content.brand.phone}</a></section></main>;
}`;
    const validate = (source: string) => validateProductionCandidateFiles({
      files: { experience: source, styles: "main { color: #111; }", motion: 'export function mountExperienceMotion() { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; }' },
      route: { id: "fixture" },
      content,
    });
    expect(() => validate(experience.replace('slot="hero"', 'slot="unknown"'))).toThrow(/CreativeImage.*slot/u);
    expect(() => validate(experience.replace('alt="Illustrated window"', 'alt="Illustrated window" {...props}'))).toThrow(/CreativeImage.*spread/u);
    expect(() => validate(experience.replace("index={index}", "index={index} target=\"_blank\""))).toThrow(/ServiceLink.*target/u);
    expect(() => validate(experience.replace("index={index}", "index={missingIndex}"))).toThrow(/ServiceLink.*index/u);
    expect(() => validate(experience.replace("index={index}", "index={-1}"))).toThrow(/ServiceLink.*index/u);
    expect(() => validate(experience.replace("index={index}", "index={1.5}"))).toThrow(/ServiceLink.*index/u);
    expect(() => validate(experience.replace("index={index}", "index={\"0\"}"))).toThrow(/ServiceLink.*index/u);
    expect(() => validate(experience.replace("index={index}", "index={0}"))).toThrow(/ServiceLink.*index/u);
    expect(() => validate(experience
      .replace('import { CreativeImage, ServiceLink, LeadForm }', 'import Helpers from "@launchloom/runtime";\nimport { ServiceLink, LeadForm }')
      .replace('<CreativeImage content={content}', '<Helpers.CreativeImage content={other}')))
      .toThrow(/Helpers\.CreativeImage.*sealed content/u);
    expect(() => validate(experience.replace('<ServiceLink content={content}', '<ServiceLink content={{ ...content }}')))
      .toThrow(/ServiceLink.*sealed content/u);
    expect(() => validate(experience.replace('<CreativeImage content={content} slot="hero" alt="Illustrated window" />',
      '<img src={hero.image} alt="Illustrated window" />'))).toThrow(/sealed image content token/u);
    expect(() => validate(experience.replace('<ServiceLink content={content} index={index} />',
      '<a href={`/services/${other.slug}/`}>{service.name}</a>'))).toThrow(/unsafe URL attribute href/u);
    expect(() => validate(experience.replace('<CreativeImage content={content} slot="hero" alt="Illustrated window" />', '<CreativeImage content={content} slot="hero" alt={null} />'))).toThrow(/CreativeImage.*alt/u);
    expect(() => validate(experience.replace('alt="Illustrated window"', "alt={0}"))).toThrow(/CreativeImage.*alt/u);
    expect(() => validate(experience.replace('alt="Illustrated window"', "alt={content.hero.heading}"))).not.toThrow();
    expect(() => validate(experience.replace('<CreativeImage content={content} slot="hero" alt="Illustrated window" />', '<CreativeImage content={content} slot="hero" alt="" /><CreativeImage content={content} slot="hero" alt="" /><img src={content.hero.image} alt="" />'))).toThrow(/reuses the primary hero image/u);
    expect(() => validate(experience)).not.toThrow();
    const withHelper = `function ServiceArt({ content }) { return <CreativeImage content={content} slot="hero" alt="Illustrated window" />; }\n${experience.replace(
      '<CreativeImage content={content} slot="hero" alt="Illustrated window" />',
      "<ServiceArt content={content} />",
    )}`;
    expect(() => validate(withHelper)).not.toThrow();
    expect(() => validate(withHelper.replace(
      "<ServiceArt content={content} />",
      "<ServiceArt content={{ ...content }} />",
    ))).toThrow(/sealed content/u);
    expect(() => validate(withHelper.replace(
      "<ServiceArt content={content} />",
      "<ServiceArt content={content} {...{ content: { ...content } }} />",
    ))).toThrow(/sealed content/u);
    expect(() => validate(withHelper.replace(
      "<ServiceArt content={content} />",
      "<ServiceArt content={content} content={{ ...content }} />",
    ))).toThrow(/sealed content/u);
    expect(() => validate(withHelper
      .replace("function ServiceArt({ content })", "function ServiceArt({ other: content })")
      .replace("<ServiceArt content={content} />", "<ServiceArt other={content} />")))
      .toThrow(/sealed content/u);
    const recursive = `function ServiceArt({ content }) { return <div><ServiceArt content={content} /><CreativeImage content={content} slot="hero" alt="Illustrated window" /></div>; }\n${experience.replace(
      '<CreativeImage content={content} slot="hero" alt="Illustrated window" />',
      "<ServiceArt content={content} />",
    )}`;
    expect(() => validate(recursive)).toThrow(/sealed content/u);
    const servicesSection = '{content.services.map((service, index) => <article key={service.name}><h2>{service.name}</h2><p>{service.description}</p><ServiceLink content={content} index={index} /></article>)}';
    const helperServices = `function ServiceMenu({ content }) { return <section id="services">${servicesSection}</section>; }\n${experience.replace(
      `<section id="services">${servicesSection}</section>`,
      "<ServiceMenu content={content} />",
    )}`;
    expect(() => validate(helperServices)).not.toThrow();
    const duplicatedServices = experience.replace(
      '<section id="faqs">',
      '<section data-service-presentation="duplicate"><h2>{content.copy.servicesHeading}</h2>{content.services.map((service) => <article key={service.slug}><h3>{service.name}</h3><p>{service.description}</p></article>)}</section><section id="faqs">',
    );
    expect(() => validate(duplicatedServices)).toThrow(/full service set.*exactly one section/u);
    const namesOnlyIndex = experience.replace(
      '<section id="services">',
      '<section aria-label="Service index">{content.services.map((service, index) => <ServiceLink key={service.slug} content={content} index={index}>{service.name}</ServiceLink>)}</section><section id="services">',
    );
    expect(() => validate(namesOnlyIndex)).not.toThrow();
    const aliasedServices = experience
      .replace(
        "export default function Experience({ content, runtime }) {",
        "export default function Experience({ content, runtime }) {\n  const services = content.services;",
      )
      .replace(/content\.services\.map/gu, "services.map")
      .replace(
        '<section id="faqs">',
        '<section><h2>More services</h2>{services.map((service) => <p key={service.name}>{service.description}</p>)}</section><section id="faqs">',
      );
    expect(() => validate(aliasedServices)).toThrow(/full service set.*exactly one section/u);
    const individualServiceCopy = experience.replace(
      '<section id="faqs">',
      '<section><h2>More services</h2>{firstService.decisionSupport.scope}{secondService.decisionSupport.preparation}</section><section id="faqs">',
    );
    expect(() => validate(individualServiceCopy)).toThrow(/full service set.*exactly one section/u);

    // Idiomatic derived collections, findIndex/indexOf lookups, and helper index forwarding are safe.
    const derivedServicesMap = experience.replace(
      "content.services.map(",
      "(content.services || []).slice(0, 3).map(",
    );
    expect(() => validate(derivedServicesMap)).not.toThrow();

    const findIndexLookup = experience.replace(
      "index={index}",
      "index={content.services.findIndex((item) => item.slug === service.slug)}",
    );
    expect(() => validate(findIndexLookup)).not.toThrow();

    const helperIndexForward = `function ServiceCard({ content, service, index }) { return <article><h2>{service.name}</h2><p>{service.description}</p><ServiceLink content={content} index={index} /></article>; }\n${experience.replace(
      `<section id="services">${servicesSection}</section>`,
      '<section id="services">{content.services.map((service, index) => <ServiceCard key={service.name} content={content} service={service} index={index} />)}</section>',
    )}`;
    expect(() => validate(helperIndexForward)).not.toThrow();
  });
});
