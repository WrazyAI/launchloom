import { describe, expect, it } from "vitest";
import {
  assertCreativeRevisionScope,
  createCreativeRepairScopeDeclaration,
  resolveCreativeRevisionScope,
} from "../scripts/creative-revision-scope.mjs";
import { applyCreativeRepairEdits } from "../scripts/creative-repair-loop.mjs";

const experience = `export default function Experience({ content }) {
  return <main>
    <section data-reference-section="hero"><h1>{content.hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a></section>
    <section data-reference-section="services"><h2>Services</h2></section>
    <section data-reference-section="faqs"><h2>FAQs</h2></section>
    <section data-reference-section="contact"><h2>Contact</h2></section>
  </main>;
}`;

const files = {
  experience,
  styles: '[data-reference-section="hero"] h1 { font-size: 4rem; }',
  motion: "",
};

function heroScope(feedback = "Improve the hero layout.") {
  return resolveCreativeRevisionScope({
    source: experience,
    feedbackItems: [{ feedbackIndex: 0, feedback }],
  });
}

function motionScope() {
  return heroScope("Make the hero animation more subtle.");
}

const baselineMotion = `export function mountExperienceMotion(runtime) {
  const hero = document.querySelector('[data-reference-section="hero"]');
  if (runtime?.reducedMotion) return () => {};
  gsap.to(hero, { opacity: 0.9, duration: 1 });
  return () => { gsap.killTweensOf(hero); };
}`;

const safeReducedMotion = `export function mountExperienceMotion(runtime) {
  const hero = document.querySelector('[data-reference-section="hero"]');
  const reduce = Boolean(runtime?.reducedMotion) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return () => {};
  gsap.to(hero, { opacity: 0.9, duration: 1 });
  return () => { gsap.killTweensOf(hero); };
}`;

describe("authored creative repair scope", () => {
  it("declares only creative feedback items for a creative renderer", () => {
    const result = createCreativeRepairScopeDeclaration({
      creativeRenderer: true,
      feedback: ["Make the hero more readable.", "Fix a phone typo."],
      results: [
        {
          feedbackIndex: 0,
          feedback: "Make the hero more readable.",
          status: "creative",
          intents: ["layout"],
        },
        {
          feedbackIndex: 1,
          feedback: "Fix a phone typo.",
          status: "fulfilled",
          intents: ["copy"],
        },
      ],
    });

    expect(result.required).toBe(true);
    expect(result.declaration?.feedbackItems).toEqual([
      { feedbackIndex: 0, feedback: "Make the hero more readable." },
    ]);
    expect(
      createCreativeRepairScopeDeclaration({
        creativeRenderer: false,
        feedback: ["Make the hero more readable."],
        results: [
          {
            status: "creative",
            feedbackIndex: 0,
            feedback: "Make the hero more readable.",
          },
        ],
      }),
    ).toMatchObject({ required: false, declaration: null });
  });

  it("resolves one uniquely named section and rejects broad unscoped requests", () => {
    expect(heroScope().sectionIds).toEqual(["hero"]);
    expect(
      resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [
          { feedbackIndex: 0, feedback: "Improve the entire website." },
        ],
      }).sectionIds,
    ).toEqual(["hero", "services", "faqs", "contact"]);
    expect(() => heroScope("Make it better.")).toThrow(
      /ambiguous|section target|manual attention/iu,
    );
  });

  it("does not classify a hero LeadForm as the contact section", () => {
    const sourceWithHeroForm = experience.replace(
      '<section data-reference-section="hero"><h1>{content.hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a></section>',
      '<section data-reference-section="hero"><h1>{content.hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a><LeadForm /></section>',
    );
    for (const feedback of [
      "Improve the form layout.",
      "Improve the consultation layout.",
    ]) {
      expect(
        resolveCreativeRevisionScope({
          source: sourceWithHeroForm,
          feedbackItems: [{ feedbackIndex: 0, feedback }],
        }).sectionIds,
      ).toEqual(["contact"]);
    }
  });

  it("allows changes within the named section while preserving other sections", () => {
    const updated = {
      ...files,
      styles:
        '[data-reference-section="hero"] h1 { font-size: clamp(3rem, 8vw, 6rem); }',
    };

    expect(
      assertCreativeRevisionScope(files, updated, heroScope()),
    ).toMatchObject({
      sectionIds: ["hero"],
      allowMotion: false,
    });
  });

  it("allows an unrelated scoped repair when the approved baseline already has unsafe patterns", () => {
    const experienceWithExistingFindings = experience.replace(
      "</section>",
      '<button onClick={() => window.alert("existing")}>Existing control</button><a href="tel:555-0100">Call</a></section>',
    );
    const before = { ...files, experience: experienceWithExistingFindings };
    const after = {
      ...before,
      styles:
        '[data-reference-section="hero"] h1 { font-size: clamp(3rem, 8vw, 6rem); }',
    };

    expect(assertCreativeRevisionScope(before, after, heroScope())).toMatchObject(
      { sectionIds: ["hero"] },
    );
  });

  it("rejects a changed expression behind a pre-existing unsafe JSX handler", () => {
    const beforeExperience = experience.replace(
      "</section>",
      '<button onClick={() => window.alert("baseline")}>Existing control</button></section>',
    );
    const afterExperience = beforeExperience.replace(
      'window.alert("baseline")',
      'window.location.assign("/escape")',
    );

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        { ...files, experience: afterExperience },
        heroScope(),
      ),
    ).toThrow(/introduced JSX event handlers or page-wide behavior/iu);
  });

  it("rejects an added occurrence of an existing unsafe JSX behavior", () => {
    const beforeExperience = experience.replace(
      "</section>",
      '<button onClick={() => "existing"}>Existing control</button></section>',
    );
    const afterExperience = beforeExperience.replace(
      "</section>",
      '<button onClick={() => "added"}>Added control</button></section>',
    );

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        { ...files, experience: afterExperience },
        heroScope(),
      ),
    ).toThrow(/event handlers|executable JSX prop/iu);
  });

  it("rejects an added occurrence of an existing unsealed contact destination", () => {
    const beforeExperience = experience.replace(
      "</section>",
      '<a href="tel:555-0100">Existing phone</a></section>',
    );
    const afterExperience = beforeExperience.replace(
      "</section>",
      '<a href="tel:555-0100">Added phone</a></section>',
    );

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        { ...files, experience: afterExperience },
        heroScope(),
      ),
    ).toThrow(/introduced a contact destination.*sealed business content/iu);
  });

  it("rejects changing the value of an existing unsealed contact destination", () => {
    const beforeExperience = experience.replace(
      "</section>",
      '<a href="tel:555-0100">Existing phone</a></section>',
    );
    const afterExperience = beforeExperience.replace(
      "tel:555-0100",
      "tel:555-0111",
    );

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        { ...files, experience: afterExperience },
        heroScope(),
      ),
    ).toThrow(/introduced a contact destination.*sealed business content/iu);
  });

  it("requires an actual reduced-motion guard before starting scoped animation", () => {
    const before = { ...files, motion: baselineMotion };
    const missingPreference = safeReducedMotion
      .replace(
        ' || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches',
        "",
      )
      .replace(
        "  if (reduce) return () => {};",
        "  if (runtime?.reducedMotion) return () => {};",
      );
    const preferenceNotGuarded = safeReducedMotion.replace(
      "  if (reduce) return () => {};",
      "  if (runtime?.reducedMotion) return () => {};",
    );
    const deadPreferenceCheck = safeReducedMotion.replace(
      'Boolean(runtime?.reducedMotion) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches',
      'Boolean(runtime?.reducedMotion) && false || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && false',
    );

    expect(() =>
      assertCreativeRevisionScope(
        before,
        { ...before, motion: missingPreference },
        motionScope(),
      ),
    ).toThrow(/reduced-motion guard/iu);
    expect(() =>
      assertCreativeRevisionScope(
        before,
        { ...before, motion: preferenceNotGuarded },
        motionScope(),
      ),
    ).toThrow(/reduced-motion guard/iu);
    expect(() =>
      assertCreativeRevisionScope(
        before,
        { ...before, motion: deadPreferenceCheck },
        motionScope(),
      ),
    ).toThrow(/reduced-motion guard/iu);
  });

  it("requires teardown of every scoped GSAP animation on unmount", () => {
    const before = { ...files, motion: baselineMotion };
    const missingTeardown = safeReducedMotion.replace(
      "return () => { gsap.killTweensOf(hero); };",
      "return () => {};",
    );

    expect(() =>
      assertCreativeRevisionScope(
        before,
        { ...before, motion: missingTeardown },
        motionScope(),
      ),
    ).toThrow(/cleanup.*cancel|teardown/iu);
    expect(
      assertCreativeRevisionScope(
        before,
        { ...before, motion: safeReducedMotion },
        motionScope(),
      ),
    ).toMatchObject({ allowMotion: true, sectionIds: ["hero"] });
  });

  it("allows a static motion hook and scoped CSS transition without requiring GSAP", () => {
    const before = {
      ...files,
      motion: `export function mountExperienceMotion() { return () => {}; }`,
      styles: '[data-reference-section="hero"] h1 { opacity: 1; }',
    };
    const after = {
      ...before,
      styles:
        '[data-reference-section="hero"] h1 { opacity: 1; transition: opacity 180ms ease-out; }',
    };

    expect(() =>
      assertCreativeRevisionScope(before, after, heroScope()),
    ).not.toThrow();
  });

  it("rejects swapping a section's sealed token while keeping the required token elsewhere", () => {
    const beforeExperience = `export default function Experience({ content }) {
  return <main>
    <section data-reference-section="hero"><h1>{content.hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a></section>
    <section data-reference-section="services"><h2>{content.hero.heading}</h2></section>
    <section data-reference-section="faqs"><h2>FAQs</h2></section>
    <section data-reference-section="contact"><h2>Contact</h2></section>
  </main>;
}`;
    const before = { ...files, experience: beforeExperience };
    const after = {
      ...before,
      experience: beforeExperience.replace(
        "{content.hero.heading}",
        "{content.copy.heroHeading}",
      ),
    };

    expect(() =>
      assertCreativeRevisionScope(before, after, heroScope()),
    ).toThrow(/sealed content bindings changed inside a declared section/iu);
  });

  it("resolves destructured content aliases when checking sealed bindings", () => {
    const beforeExperience = `export default function Experience({ content }) {
  const { hero } = content;
  return <main>
    <section data-reference-section="hero"><h1>{content.hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a></section>
    <section data-reference-section="services"><h2>{hero.heading}</h2></section>
    <section data-reference-section="faqs"><h2>FAQs</h2></section>
    <section data-reference-section="contact"><h2>Contact</h2></section>
  </main>;
}`;
    const after = {
      ...files,
      experience: beforeExperience.replace(
        "{content.hero.heading}",
        "{hero.heading}",
      ),
    };

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        after,
        heroScope(),
      ),
    ).not.toThrow();
  });

  it("rejects changing a destructured sealed token to another field", () => {
    const beforeExperience = `export default function Experience({ content }) {
  const { hero } = content;
  return <main>
    <section data-reference-section="hero"><h1>{hero.heading}</h1><a href="#contact">{content.hero.primaryLabel}</a></section>
    <section data-reference-section="services"><h2>{content.hero.heading}</h2></section>
    <section data-reference-section="faqs"><h2>FAQs</h2></section>
    <section data-reference-section="contact"><h2>Contact</h2></section>
  </main>;
}`;
    const after = {
      ...files,
      experience: beforeExperience.replace("{hero.heading}", "{hero.body}"),
    };

    expect(() =>
      assertCreativeRevisionScope(
        { ...files, experience: beforeExperience },
        after,
        heroScope(),
      ),
    ).toThrow(/sealed content bindings changed inside a declared section/iu);
  });

  it("rejects a literal patch that targets content outside the declared section", () => {
    const patched = applyCreativeRepairEdits(files, [
      {
        file: "experience",
        find: "<h2>Services</h2>",
        replace: "<h2>Different</h2>",
      },
    ]);

    expect(() =>
      assertCreativeRevisionScope(files, patched, heroScope()),
    ).toThrow(/JSX changed outside declared section scope/iu);
  });

  it("rejects edits to unrelated section markup or global CSS", () => {
    expect(() =>
      assertCreativeRevisionScope(
        files,
        {
          ...files,
          experience: experience.replace(
            "<h2>Services</h2>",
            "<h2>New services</h2>",
          ),
        },
        heroScope(),
      ),
    ).toThrow(/JSX changed outside declared section scope/iu);
    expect(() =>
      assertCreativeRevisionScope(
        files,
        { ...files, styles: `${files.styles}\nbody { overflow: hidden; }` },
        heroScope(),
      ),
    ).toThrow(/global or unrelated CSS changed/iu);
  });

  it("does not let a nested global at-rule escape through scoped CSS", () => {
    const before = {
      ...files,
      styles: '[data-reference-section="hero"] h1 { color: #111; }',
    };
    const after = {
      ...before,
      styles: `${before.styles}\n[data-reference-section="hero"] { @media (max-width: 700px) { @keyframes escape { from { opacity: 0; } to { opacity: 1; } } } }`,
    };

    expect(() =>
      assertCreativeRevisionScope(before, after, heroScope()),
    ).toThrow(/global or unrelated CSS changed/iu);
  });
});
