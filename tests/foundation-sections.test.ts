import { describe, expect, it } from "vitest";
import { detectFoundationSections } from "../scripts/foundation-sections.mjs";

const license = {
  name: "CC BY 4.0",
  url: "https://www.spicerdesigns.com",
  credit: "Template adapted from Spicer Designs",
};

function fixtureHtml() {
  return `<!doctype html>
<html>
  <body>
    <nav><a href="#work">Work</a><a href="#faq">FAQ</a></nav>
    <header>
      <p>Design, build, maintain</p>
      <h1>Yards that look designed</h1>
      <p>One crew, one point of contact.</p>
      <a href="#estimate">Request an estimate</a>
      <img src="hero.webp" alt="Garden">
    </header>
    <section id="work">
      <h2>Nine projects, start to season one</h2>
      <p>Our own work, drawn from measured plans.</p>
      <article><h3>Ridgeline courtyard</h3><p>Courtyard scope</p></article>
      <article><h3>Millbrook terrace</h3><p>Terrace scope</p></article>
    </section>
    <section id="faq">
      <h2>Asked before every first visit</h2>
      <details><summary>Do you design?</summary><p>Yes, design and build.</p></details>
      <details><summary>How far do you travel?</summary><p>Local routes only.</p></details>
    </section>
    <footer>© Stonefield Landscape. Demo content.</footer>
  </body>
</html>`;
}

describe("foundation section and slot detection", () => {
  it("detects sections, repeated items, and sealed content slots", () => {
    const result = detectFoundationSections({
      html: fixtureHtml(),
      dossierId: "sample-reference",
      license,
    });
    expect(result.sections.map((section) => section.role)).toEqual(
      expect.arrayContaining([
        "navigation",
        "hero",
        "portfolio",
        "faq",
        "contact",
        "footer",
      ]),
    );
    expect(result.sections.map((section) => section.order)).toEqual(
      result.sections.map((_, index) => index + 1),
    );
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hero.heading",
          contentPath: "hero.heading",
          kind: "text",
        }),
        expect.objectContaining({
          id: "hero.body",
          contentPath: "hero.body",
          kind: "text",
        }),
        expect.objectContaining({
          id: "hero.primaryLabel",
          contentPath: "hero.primaryLabel",
          kind: "text",
        }),
        expect.objectContaining({
          id: "hero.image",
          contentPath: "hero.image",
          kind: "image",
        }),
        expect.objectContaining({
          id: "services.heading",
          contentPath: "copy.servicesHeading",
          kind: "text",
        }),
        expect.objectContaining({
          id: "services.items",
          contentPath: "services",
          kind: "each",
          itemPath: "service",
        }),
        expect.objectContaining({
          id: "services.item.name",
          contentPath: "service.name",
          kind: "text",
        }),
        expect.objectContaining({
          id: "services.item.description",
          contentPath: "service.description",
          kind: "text",
        }),
        expect.objectContaining({
          id: "faq.heading",
          contentPath: "copy.faqHeading",
          kind: "text",
        }),
        expect.objectContaining({
          id: "faq.items",
          contentPath: "faqs",
          kind: "each",
          itemPath: "faq",
        }),
        expect.objectContaining({
          id: "faq.item.question",
          contentPath: "faq.question",
          kind: "text",
        }),
        expect.objectContaining({
          id: "faq.item.answer",
          contentPath: "faq.answer",
          kind: "text",
        }),
        expect.objectContaining({
          id: "contact.form",
          kind: "html",
          required: true,
        }),
      ]),
    );
    expect(result.html).toContain("{{hero.heading}}");
    expect(result.html).toContain("{{services.item.name}}");
    expect(result.html).toContain("<!--foundation:each:services.items-->");
    expect(result.html).toContain("<!--/foundation:each:services.items-->");
    expect(result.html).not.toContain("Ridgeline courtyard");
    expect(result.html).not.toContain("Millbrook terrace");
    expect(result.html).not.toContain("Stonefield Landscape");
    expect(result.html).toContain('id="contact"');
    expect(result.html).toContain('id="services"');
    expect(result.html).toContain('id="faqs"');
    expect(result.blockers).toEqual([]);
    expect(result.compatibility).toBe("renderable");
  });

  it("marks unsupported section content as needs-adaptation", () => {
    const html = `<!doctype html><html><body>
      <header><h1>Promise</h1><p>Body</p></header>
      <section id="season-wheel"><h2>Four seasons</h2><button>Spring</button></section>
      <footer>Demo</footer>
    </body></html>`;
    const result = detectFoundationSections({
      html,
      dossierId: "sample-reference",
      license,
    });
    expect(result.compatibility).toBe("needs-adaptation");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unmapped-section-content" }),
      ]),
    );
  });

  it("fails closed when there is no hero heading or no services section", () => {
    const noHero = detectFoundationSections({
      html: "<!doctype html><html><body><section id='work'><h2>Work</h2></section></body></html>",
      dossierId: "sample-reference",
      license,
    });
    expect(noHero.compatibility).toBe("needs-adaptation");
    expect(noHero.blockers.map((blocker) => blocker.code)).toContain(
      "missing-hero",
    );

    const noServices = detectFoundationSections({
      html: "<!doctype html><html><body><header><h1>Promise</h1></header></body></html>",
      dossierId: "sample-reference",
      license,
    });
    expect(noServices.compatibility).toBe("needs-adaptation");
    expect(noServices.blockers.map((blocker) => blocker.code)).toContain(
      "missing-services",
    );
  });
});
