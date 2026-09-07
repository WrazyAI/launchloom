import { describe, expect, it } from "vitest";
import {
  applyOperation,
  deterministicOperations,
  expectedArtifacts,
  ensureLegacySocialProofMarkup,
  planRevision,
  removeEmDashes,
  verifyRevision,
} from "../scripts/revision-engine.mjs";

const config = (): any => ({
  business: { name: "Daley Hope", placeId: "" },
  style: { primaryColor: "#205d51" },
  copy: { heroKicker: "Clear care" },
  differentiators: ["Experienced support", "Personal care plans"],
  services: [{ name: "Home care" }],
});

describe("revision operations", () => {
  it("adds a verified proof fallback instead of fabricating testimonials", () => {
    const draft = config();
    const operations = deterministicOperations(
      "Can you add a testimonials section?",
      draft,
    );
    expect(operations).toEqual([
      expect.objectContaining({
        kind: "set_social_proof",
        source: "verified_differentiators",
      }),
    ]);
    expect(applyOperation(draft, operations[0])).toBe(true);
    expect(draft.socialProof.points).toEqual([
      "Experienced support",
      "Personal care plans",
    ]);
    expect(JSON.stringify(draft)).not.toMatch(/testimonial|"quote"/i);
  });

  it("inserts requested proof after Services on a legacy homepage without replacing its layout", () => {
    const legacy = `---\nimport Header from "../components/Header.astro";\n---\n<main>\n  <section id="services"><h2>Services</h2></section>\n  <section id="about"><h2>About</h2></section>\n</main>`;
    const revised = ensureLegacySocialProofMarkup(legacy);
    expect(revised).toContain(
      'import SocialProof from "../components/SocialProof.astro";',
    );
    expect(revised.indexOf("<SocialProof />")).toBeGreaterThan(
      revised.indexOf('id="services"'),
    );
    expect(revised.indexOf("<SocialProof />")).toBeLessThan(
      revised.indexOf('id="about"'),
    );
    expect(revised).not.toContain("<PageSections");
  });

  it("uses Google reviews only with a retained Place ID", () => {
    const draft = config();
    draft.business.placeId = "ChIJ-example";
    const [operation] = deterministicOperations("Add customer reviews", draft);
    expect(operation).toMatchObject({
      kind: "set_social_proof",
      source: "google_reviews",
    });
  });

  it("turns a color request into a bounded accessible palette revision", () => {
    const draft = config();
    const [operation] = deterministicOperations(
      "I do not like the colors on the site.",
      draft,
    );
    expect(operation).toMatchObject({ kind: "set_color_palette" });
    expect(applyOperation(draft, operation)).toBe(true);
    expect(draft.style).toMatchObject({
      primaryColor: "#28566b",
      surfaceColor: "#f7faf9",
    });
  });

  it("requires the expected rendered artifact before a revision can send", () => {
    const draft = config();
    const [operation] = deterministicOperations("Add testimonials", draft);
    applyOperation(draft, operation);
    const report = {
      operations: [operation],
      expectedArtifacts: expectedArtifacts([operation], draft),
      results: [{ feedbackIndex: 0, status: "fulfilled", unresolved: [] }],
    };
    expect(verifyRevision(draft, report, "<main></main>").ok).toBe(false);
    expect(
      verifyRevision(
        draft,
        report,
        '<section id="social-proof"><h2>Why people choose Daley Hope</h2></section>',
      ),
    ).toEqual({ ok: true, failures: [] });
  });

  it("does not permit an operation to alter protected business facts", () => {
    const draft = config();
    expect(
      applyOperation(draft, {
        kind: "set_business",
        field: "name",
        value: "Changed",
      }),
    ).toBe(false);
    expect(draft.business.name).toBe("Daley Hope");
  });

  it("removes em dashes from rendered configuration content", () => {
    const draft = removeEmDashes({
      copy: { heroKicker: "Clear care — at home" },
      services: ["Support — when needed"],
    });
    expect(JSON.stringify(draft)).not.toContain("—");
    expect(draft.copy.heroKicker).toBe("Clear care - at home");
  });

  it("honors explicit color roles instead of substituting a preset palette", () => {
    const draft = config();
    const operation = deterministicOperations(
      "Use cream for the background and navy as the primary brand color.",
      draft,
    ).find((item) => item.kind === "set_color_palette") as any;
    expect(operation.palette).toMatchObject({
      primaryColor: "#17324d",
      surfaceColor: "#fbf6ed",
    });
    const bright = {
      ...operation,
      palette: {
        primaryColor: "#f5d547",
        surfaceColor: "#ffffff",
        heroColor: "#fff7d1",
        inkColor: "#171a19",
        mutedColor: "#66706d",
        lineColor: "#e5dfc1",
      },
    };
    expect(applyOperation(draft, bright)).toBe(true);
    expect(draft.style.contrastColor).toBe("#000000");
  });

  it("reorders existing sections while preserving their stable IDs", () => {
    const draft = {
      ...config(),
      design: {
        recipe: "general-editorial",
        sections: [
          { id: "opening", type: "hero", variant: "editorial" },
          { id: "services", type: "services", variant: "editorial" },
          { id: "social-proof", type: "social-proof", variant: "editorial" },
          { id: "contact", type: "contact", variant: "consultation" },
        ],
      },
    };
    const operation = deterministicOperations(
      "Move the testimonials section before services.",
      draft,
    ).find((item) => item.kind === "reorder_section");
    expect(operation).toMatchObject({
      sectionType: "social-proof",
      relativeTo: "services",
      position: "before",
    });
    expect(applyOperation(draft, operation)).toBe(true);
    expect(draft.design.sections.map((section: any) => section.id)).toEqual([
      "opening",
      "social-proof",
      "services",
      "contact",
    ]);
  });

  it("does not rewrite existing proof content when feedback only moves it", () => {
    const draft = {
      ...config(),
      socialProof: {
        source: "verified_differentiators",
        heading: "Approved client proof",
        intro: "Approved introduction",
        points: ["Approved point"],
      },
      design: {
        recipe: "general-editorial",
        sections: [
          { id: "opening", type: "hero", variant: "editorial" },
          { id: "services", type: "services", variant: "editorial" },
          {
            id: "proof-from-client",
            type: "social-proof",
            variant: "editorial",
          },
          { id: "contact", type: "contact", variant: "consultation" },
        ],
      },
    };
    const operations = deterministicOperations(
      "Move testimonials before services.",
      draft,
    );
    expect(operations.map((operation) => operation.kind)).toEqual([
      "reorder_section",
    ]);
    operations.forEach((operation) => applyOperation(draft, operation));
    expect(draft.socialProof.heading).toBe("Approved client proof");
    expect(draft.design.sections[1].id).toBe("proof-from-client");
  });

  it("plans deterministic and model-backed parts of mixed feedback", async () => {
    const draft = config();
    const planned = await planRevision(
      ["Change the colors to navy and cream, and rewrite the hero heading."],
      draft,
      async () => [
        {
          feedbackIndex: 0,
          kind: "set_copy",
          field: "heroKicker",
          value: "Care shaped around your routines",
        },
      ],
    );
    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "fulfilled",
      fulfilled: ["color", "content"],
    });
    expect(planned.config.copy.heroKicker).toBe(
      "Care shaped around your routines",
    );
    expect(planned.config.style.primaryColor).toBe("#17324d");
  });

  it("reports partial mixed feedback instead of claiming the batch was addressed", async () => {
    const planned = await planRevision(
      ["Change the colors and rewrite the hero heading."],
      config(),
      async () => [],
    );
    expect(planned.ok).toBe(false);
    expect(planned.results[0]).toMatchObject({
      status: "partial",
      fulfilled: ["color"],
      unresolved: ["content"],
    });
  });

  it("does not opt a legacy site into a new recipe for minor palette feedback", async () => {
    const draft = config();
    const planned = await planRevision(
      ["Please change the colors to teal."],
      draft,
      async () => [],
    );
    expect(planned.ok).toBe(true);
    expect(planned.config.design).toBeUndefined();
    expect(planned.config.business).toEqual(draft.business);
  });

  it("rejects unsupported variants and unverified claims", () => {
    const draft = config();
    expect(
      applyOperation(draft, {
        kind: "set_section_variant",
        sectionType: "hero",
        variant: "anything-goes",
      }),
    ).toBe(false);
    expect(
      applyOperation(draft, {
        kind: "set_copy",
        field: "aboutBody",
        value: "Our award-winning team guarantees service in 30 minutes.",
      }),
    ).toBe(false);
  });

  it("rejects unsolicited model layout and palette operations", async () => {
    const planned = await planRevision(
      ["Rewrite the hero heading."],
      config(),
      async () => [
        {
          feedbackIndex: 0,
          kind: "set_design_treatment",
          density: "spacious",
        },
        {
          feedbackIndex: 0,
          kind: "set_color_palette",
          palette: {
            primaryColor: "#000000",
            surfaceColor: "#ffffff",
            heroColor: "#ffffff",
            inkColor: "#000000",
            mutedColor: "#555555",
            lineColor: "#dddddd",
          },
        },
      ],
    );
    expect(planned.ok).toBe(false);
    expect(planned.config.design).toBeUndefined();
    expect(planned.config.style.primaryColor).toBe("#205d51");
  });
});
