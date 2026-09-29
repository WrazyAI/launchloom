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
        results: [{ status: "creative", feedbackIndex: 0, feedback: "Make the hero more readable." }],
      }),
    ).toMatchObject({ required: false, declaration: null });
  });

  it("resolves one uniquely named section and rejects broad unscoped requests", () => {
    expect(heroScope().sectionIds).toEqual(["hero"]);
    expect(
      resolveCreativeRevisionScope({
        source: experience,
        feedbackItems: [{ feedbackIndex: 0, feedback: "Improve the entire website." }],
      }).sectionIds,
    ).toEqual(["hero", "services", "faqs", "contact"]);
    expect(() => heroScope("Make it better.")).toThrow(
      /ambiguous|section target|manual attention/iu,
    );
  });

  it("allows changes within the named section while preserving other sections", () => {
    const updated = {
      ...files,
      styles: '[data-reference-section="hero"] h1 { font-size: clamp(3rem, 8vw, 6rem); }',
    };

    expect(assertCreativeRevisionScope(files, updated, heroScope())).toMatchObject({
      sectionIds: ["hero"],
      allowMotion: false,
    });
  });

  it("rejects a literal patch that targets content outside the declared section", () => {
    const patched = applyCreativeRepairEdits(files, [
      { file: "experience", find: "<h2>Services</h2>", replace: "<h2>Different</h2>" },
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
          experience: experience.replace("<h2>Services</h2>", "<h2>New services</h2>"),
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

    expect(() => assertCreativeRevisionScope(before, after, heroScope())).toThrow(
      /global or unrelated CSS changed/iu,
    );
  });
});
