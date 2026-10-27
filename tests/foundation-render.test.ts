import { describe, expect, it } from "vitest";
import {
  FOUNDATION_EMPTY_IMAGE,
  FOUNDATION_LEAD_FORM_MARKER,
  renderFoundation,
} from "../templates/client-site/src/lib/foundation-render.mjs";

const manifest = {
  license: {
    name: "CC BY 4.0",
    url: "https://www.spicerdesigns.com",
    credit: "Template adapted from Spicer Designs",
  },
  slots: [
    {
      id: "page.title",
      kind: "text",
      contentPath: "brand.name",
      required: true,
    },
    {
      id: "navigation.brand",
      kind: "text",
      contentPath: "brand.name",
      required: true,
    },
    {
      id: "hero.heading",
      kind: "text",
      contentPath: "hero.heading",
      required: true,
    },
    { id: "hero.body", kind: "text", contentPath: "hero.body", required: true },
    {
      id: "hero.primaryLabel",
      kind: "text",
      contentPath: "hero.primaryLabel",
      required: true,
    },
    {
      id: "hero.image",
      kind: "image",
      contentPath: "hero.image",
      required: true,
    },
    {
      id: "services.heading",
      kind: "text",
      contentPath: "copy.servicesHeading",
      required: true,
    },
    {
      id: "services.body",
      kind: "text",
      contentPath: "copy.servicesIntro",
      required: true,
    },
    {
      id: "services.items",
      kind: "each",
      contentPath: "services",
      itemPath: "service",
      required: true,
    },
    {
      id: "services.item.name",
      kind: "text",
      contentPath: "service.name",
      required: true,
    },
    {
      id: "services.item.description",
      kind: "text",
      contentPath: "service.description",
      required: true,
    },
    {
      id: "faq.heading",
      kind: "text",
      contentPath: "copy.faqHeading",
      required: true,
    },
    {
      id: "faq.items",
      kind: "each",
      contentPath: "faqs",
      itemPath: "faq",
      required: true,
    },
    {
      id: "faq.item.question",
      kind: "text",
      contentPath: "faq.question",
      required: true,
    },
    {
      id: "faq.item.answer",
      kind: "text",
      contentPath: "faq.answer",
      required: true,
    },
    { id: "seasons.heading", kind: "text", required: false },
    { id: "seasons.body", kind: "text", required: false },
    { id: "plans.heading", kind: "text", required: false },
    { id: "plans.body", kind: "text", required: false },
    { id: "estimate.heading", kind: "text", required: false },
    { id: "estimate.body", kind: "text", required: false },
    {
      id: "coverage.heading",
      kind: "text",
      contentPath: "coverageHeading",
      required: true,
    },
    {
      id: "coverage.body",
      kind: "text",
      contentPath: "coverageIntro",
      required: true,
    },
    {
      id: "coverage.items",
      kind: "each",
      contentPath: "locations",
      itemPath: "location",
      required: true,
    },
    {
      id: "coverage.item.name",
      kind: "text",
      contentPath: "location.name",
      required: true,
    },
    {
      id: "proof.heading",
      kind: "text",
      required: false,
    },
    {
      id: "proof.items",
      kind: "each",
      contentPath: "proof",
      itemPath: "proof",
      required: false,
    },
    {
      id: "proof.item.quote",
      kind: "text",
      contentPath: "proof.quote",
      required: true,
    },
    {
      id: "proof.item.attribution",
      kind: "text",
      contentPath: "proof.attribution",
      required: false,
    },
    {
      id: "contact.kicker",
      kind: "text",
      required: false,
    },
    {
      id: "contact.heading",
      kind: "text",
      contentPath: "copy.contactHeading",
      required: true,
    },
    {
      id: "contact.body",
      kind: "text",
      required: false,
    },
    {
      id: "contact.phone",
      kind: "text",
      contentPath: "brand.phone",
      required: false,
    },
    {
      id: "contact.phoneHref",
      kind: "href",
      contentPath: "brand.phoneHref",
      required: false,
    },
    {
      id: "contact.email",
      kind: "text",
      contentPath: "brand.email",
      required: false,
    },
    {
      id: "contact.emailHref",
      kind: "href",
      contentPath: "brand.emailHref",
      required: false,
    },
    {
      id: "contact.form",
      kind: "html",
      contentPath: "contact.form",
      required: true,
    },
    {
      id: "footer.brand",
      kind: "text",
      contentPath: "brand.name",
      required: true,
    },
    {
      id: "footer.credit",
      kind: "text",
      contentPath: "license.credit",
      required: true,
    },
  ],
};

function html() {
  return `<!doctype html><html><head><title>{{page.title}}</title></head><body>
<nav><a href="/">{{navigation.brand}}</a></nav>
<header><h1>{{hero.heading}}</h1><p>{{hero.body}}</p><img src="{{hero.image}}"><a href="#contact">{{hero.primaryLabel}}</a></header>
<section id="services"><h2>{{services.heading}}</h2><p>{{services.body}}</p>
<!--foundation:each:services.items--><article><h3>{{services.item.name}}</h3><p>{{services.item.description}}</p></article><!--/foundation:each:services.items--></section>
<section id="seasons"><h2>{{seasons.heading}}</h2><p>{{seasons.body}}</p></section>
<section id="plans"><h2>{{plans.heading}}</h2><p>{{plans.body}}</p></section>
<section id="estimate"><h2>{{estimate.heading}}</h2><p>{{estimate.body}}</p></section>
<section id="coverage"><h2>{{coverage.heading}}</h2><p>{{coverage.body}}</p>
<!--foundation:each:coverage.items--><span>{{coverage.item.name}}</span><!--/foundation:each:coverage.items--></section>
<section id="proof"><h2>{{proof.heading}}</h2>
<!--foundation:each:proof.items--><blockquote>{{proof.item.quote}}</blockquote><figcaption>{{proof.item.attribution}}</figcaption><!--/foundation:each:proof.items--></section>
<section id="faq"><h2>{{faq.heading}}</h2>
<!--foundation:each:faq.items--><details><summary>{{faq.item.question}}</summary><p>{{faq.item.answer}}</p></details><!--/foundation:each:faq.items--></section>
<section id="contact"><p>{{contact.kicker}}</p><h2>{{contact.heading}}</h2><p>{{contact.body}}</p><div><a href="{{contact.phoneHref}}">{{contact.phone}}</a><a href="{{contact.emailHref}}">{{contact.email}}</a></div><div>{{contact.form}}</div></section>
<footer><span>{{footer.brand}}</span><span>{{footer.credit}}</span></footer>
</body></html>`;
}

function content() {
  return {
    brand: {
      name: "Harbor & Pine Landscape Co.",
      phone: "(555) 010-0100",
      email: "hello@harborpine.example",
      address: "",
      serviceAreas: ["Millbrook", "Oakwood"],
    },
    hero: {
      kicker: "Landscape design and care",
      heading: "Gardens that look designed, not mowed.",
      body: "One crew, one point of contact, from the first drawing to the first season of care.",
      primaryLabel: "Request an estimate",
      image: "/images/hero.jpg",
      secondaryImage: "/images/secondary.jpg",
      tertiaryImage: "",
    },
    services: [
      {
        name: "Garden design",
        description: "Measured planting plans for the property.",
        slug: "garden-design",
      },
      {
        name: "Garden maintenance",
        description: "Seasonal care for beds, hedges, and lawns.",
        slug: "garden-maintenance",
      },
    ],
    proof: [
      "One crew from plan to planting.",
      "Clear scope before work starts.",
    ],
    process: ["Walk the property", "Agree the scope", "Schedule the work"],
    faqs: [
      {
        question: "Do you design and maintain?",
        answer: "Yes, the same team can handle both.",
      },
      {
        question: "How is coverage confirmed?",
        answer: "Share the property address so the team can confirm.",
      },
    ],
    locations: [
      { name: "Millbrook", slug: "millbrook", description: "", localNote: "" },
      { name: "Oakwood", slug: "oakwood", description: "", localNote: "" },
    ],
    copy: {
      servicesHeading: "Work led by the property.",
      servicesIntro: "Start with the site, then choose the service.",
      faqHeading: "Questions before the first visit.",
      contactHeading: "Request an estimate",
    },
    coverageHeading: "Service in nearby communities.",
    coverageIntro: "Share the address so the team can confirm service.",
    businessDescription: "Landscape design and care for local properties.",
  };
}

describe("foundation renderer", () => {
  it("binds sealed content, repeats lists, and leaves one lead-form marker", () => {
    const result = renderFoundation({
      html: html(),
      manifest,
      content: content(),
    });
    expect(result.html).toContain("Gardens that look designed, not mowed.");
    expect(result.html).toContain("Harbor &amp; Pine Landscape Co.");
    expect(result.html).toContain("Garden design");
    expect(result.html).toContain("Garden maintenance");
    expect(result.html).toContain("Do you design and maintain?");
    expect(result.html).toContain("Millbrook");
    expect(result.html).toContain("One crew from plan to planting.");
    expect(result.html).toContain("Template adapted from Spicer Designs");
    expect(result.html).toContain("Start with the property");
    expect(result.html).toContain(
      "Share the property address and the work you are considering.",
    );
    expect(result.html).toContain("tel:5550100100");
    expect(result.html).toContain("mailto:hello@harborpine.example");
    expect(result.html).toContain("(555) 010-0100");
    expect(result.html).toContain(FOUNDATION_LEAD_FORM_MARKER);
    expect(result.html).toContain("Plan the work around the season.");
    expect(result.html).toContain("A clear scope before the first visit.");
    expect(result.html).toContain("Request an estimate for the property.");
    expect(result.html).not.toContain("{{");
    expect(result.html).not.toContain("Project A");
    expect(result.diagnostics).toEqual([]);
  });

  it("uses the neutral image fallback when a required image is absent", () => {
    const source = content();
    source.hero.image = "";
    const result = renderFoundation({
      html: html(),
      manifest,
      content: source,
    });
    expect(result.html).toContain(FOUNDATION_EMPTY_IMAGE);
  });

  it("reports a missing required slot and removes the empty repeat block", () => {
    const source = content();
    source.copy.servicesHeading = "";
    source.services = [];
    const result = renderFoundation({
      html: html(),
      manifest,
      content: source,
    });
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "missing-required-slot",
    );
    expect(result.html).not.toContain("<article>");
  });

  it("escapes authored content instead of injecting it as markup", () => {
    const source = content();
    source.hero.heading = "<script>alert(1)</script>";
    const result = renderFoundation({
      html: html(),
      manifest,
      content: source,
    });
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>alert(1)</script>");
  });
});
