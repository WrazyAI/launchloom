import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyOperation,
  deterministicOperations,
  expectedArtifacts,
  ensureLegacySocialProofMarkup,
  modelOperations,
  planRevision,
  removeEmDashes,
  verifyRevision,
} from "../scripts/revision-engine.mjs";
import { applyBoundedClientFeedback } from "../scripts/client-feedback-ops.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("requires bounded client copy, fact, and asset changes in rendered output", () => {
    const draft = config();
    const assetUrl = "https://assets.launchloom.wrazyos.com/client-replacements/logo-001.png";
    const photoUrl = "https://assets.launchloom.wrazyos.com/client-replacements/photo-one-001.jpg";
    draft.copy.heroHeading = "A clear path";
    const planned = applyBoundedClientFeedback(draft, [
      '[Text/factual correction] Replace text "Clear care" with "Care that listens"',
      '[Text/factual correction] Replace text "A clear path" with "Clear service choices"',
      "[Contact details] Phone: 555-0110",
      `[Logo] Replacement asset: ${assetUrl}\nUse this logo in the header.`,
      `[Business photos] Replacement asset: ${photoUrl}\nUse this as the main service photo.`,
    ]);
    expect(planned.ok).toBe(true);
    const report = {
      results: planned.results,
      expectedArtifacts: expectedArtifacts(planned.operations, planned.config),
    };

    expect(verifyRevision(draft, report, "", "").failures).toEqual(expect.arrayContaining([
      "Missing rendered text at copy.heroKicker: Care that listens",
      "Missing rendered text at copy.heroHeading: Clear service choices",
      "Missing rendered text at business.phone: 555-0110",
      `Missing rendered replacement asset at header: ${assetUrl}`,
      `Missing rendered replacement asset at hero: ${photoUrl}`,
    ]));
    const homepage = `<header><img src=\"${assetUrl}\"></header><section class=\"hero\"><span class=\"kicker\">Care that listens</span><h1>Clear service choices</h1><img src=\"${photoUrl}\"></section><a>555-0110</a>`;
    expect(verifyRevision(draft, report, homepage, homepage, { "/": homepage }).ok).toBe(true);

    const wrongHeadingPlacement = `<section class=\"hero\"><h1>Previous heading</h1></section><footer><h1>Clear service choices</h1></footer>`;
    expect(verifyRevision(draft, report, wrongHeadingPlacement, wrongHeadingPlacement, { "/": wrongHeadingPlacement }).failures)
      .toContain("Missing rendered text at copy.heroHeading: Clear service choices");

    const wrongLogoPlacement = `<footer><img src=\"${assetUrl}\"></footer>`;
    expect(verifyRevision(draft, report, wrongLogoPlacement, wrongLogoPlacement, { "/": wrongLogoPlacement }).failures)
      .toContain(`Missing rendered replacement asset at header: ${assetUrl}`);

    const wrongPhotoPlacement = `<header><img src=\"${assetUrl}\"></header><section class=\"about\"><img src=\"${photoUrl}\"></section>`;
    expect(verifyRevision(draft, report, wrongPhotoPlacement, wrongPhotoPlacement, { "/": wrongPhotoPlacement }).failures)
      .toContain(`Missing rendered replacement asset at hero: ${photoUrl}`);
  });

  it("checks client copy on its target route and handles escaped markup characters", () => {
    const draft = config();
    draft.services = [{ name: "Drain cleaning", slug: "drain-cleaning" }];
    const operations = [
      { kind: "replace_copy_fragment", path: "services[0].description", to: "Drain care for <older homes>" },
    ];
    const report = {
      results: [{ feedbackIndex: 0, status: "fulfilled" }],
      expectedArtifacts: expectedArtifacts(operations, draft),
    };
    const indexHtml = "<main><h1>Local plumbing</h1></main>";
    const serviceHtml = "<main><section class=\"inner-hero\"><p>Drain care for &lt;older homes&gt;</p></section></main>";

    expect(verifyRevision(
      draft,
      report,
      indexHtml,
      `${indexHtml}\n${serviceHtml}`,
      { "/": indexHtml, "/services/drain-cleaning/": serviceHtml },
    ).ok).toBe(true);
    expect(verifyRevision(draft, report, serviceHtml, serviceHtml, { "/": serviceHtml }).failures)
      .toContain("Missing rendered text at services[0].description: Drain care for <older homes>");
  });

  it("loads route-specific HTML from the production dist for revision verification", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "launchloom-revision-route-"));
    try {
      const dist = path.join(directory, "dist");
      const servicePath = path.join(dist, "services", "drain-cleaning", "index.html");
      const indexPath = path.join(dist, "index.html");
      await fs.mkdir(path.dirname(servicePath), { recursive: true });
      await fs.writeFile(indexPath, "<main><h1>Harbor Plumbing</h1></main>");
      await fs.writeFile(servicePath, "<main><p>Drain care for &lt;older homes&gt;</p></main>");
      const draft = config();
      draft.services = [{ name: "Drain cleaning", slug: "drain-cleaning" }];
      draft.revisionReport = {
        results: [{ feedbackIndex: 0, status: "fulfilled" }],
        expectedArtifacts: expectedArtifacts([
          { kind: "replace_copy_fragment", path: "services[0].description", to: "Drain care for <older homes>" },
        ], draft),
      };
      const configPath = path.join(directory, "site.config.json");
      await fs.writeFile(configPath, JSON.stringify(draft));
      const scriptPath = fileURLToPath(new URL("../scripts/verify-revision.mjs", import.meta.url));
      const verify = () => spawnSync(process.execPath, [scriptPath, "--config", configPath, "--dist", dist], { encoding: "utf8" });

      expect(verify().status).toBe(0);
      await fs.writeFile(servicePath, "<main><p>Other service copy</p></main>");
      await fs.writeFile(indexPath, "<main><p>Drain care for &lt;older homes&gt;</p></main>");
      expect(verify().status).toBe(1);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
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

  it("supports explicit conversion feature changes without inventing an offer", () => {
    const draft = {
      ...config(),
      business: {
        ...config().business,
        name: "Daley Hope",
        primaryCta: "Request a conversation",
        offer: "A complimentary first conversation",
      },
      conversion: {
        qualification: [
          { name: "need", label: "What do you need?", options: ["Help"] },
        ],
        faqs: [
          {
            question: "How do we begin?",
            answer: "Start with a conversation.",
          },
        ],
      },
    };
    const operations = deterministicOperations(
      "Add quick answers and enable the exit popup.",
      draft,
    );
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "set_conversion_feature",
          feature: "quickAnswers",
          enabled: true,
        }),
        expect.objectContaining({
          kind: "set_conversion_feature",
          feature: "exitOffer",
          enabled: true,
        }),
      ]),
    );
    const exitOperation = operations.find(
      (item: any) => item.feature === "exitOffer",
    );
    expect(applyOperation(draft, exitOperation)).toBe(true);
    expect(draft.conversion.exitOffer.heading).toBe(
      "A complimentary first conversation",
    );
    const report = {
      results: [{ feedbackIndex: 0, status: "fulfilled", unresolved: [] }],
      expectedArtifacts: expectedArtifacts(
        operations.filter((item: any) => item.feature === "exitOffer"),
        draft,
      ),
    };
    expect(
      verifyRevision(
        draft,
        report,
        '<dialog data-conversion-feature="exit-offer"></dialog>',
      ).ok,
    ).toBe(true);

    const withoutOffer = {
      ...config(),
      business: { ...config().business, primaryCta: "Contact us" },
      conversion: { faqs: [], qualification: [] },
    };
    expect(
      applyOperation(withoutOffer, {
        kind: "set_conversion_feature",
        feature: "exitOffer",
        enabled: true,
      }),
    ).toBe(false);
  });

  it("supports an AI FAQ chat request without treating its category label as copy feedback", async () => {
    const draft = {
      ...config(),
      business: {
        ...config().business,
        name: "Mike Seeders Plumbing Inc",
        primaryCta: "Book a consultation",
      },
      conversion: {
        faqs: [
          {
            question: "What areas do you serve?",
            answer: "We serve Tallahassee and the Big Bend region.",
          },
        ],
      },
    };

    const planned = await planRevision(
      ["[Wording, Services] Can we also have an AI FAQ chat?"],
      draft,
      async () => [],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      intents: ["conversion-feature"],
      status: "fulfilled",
      operationKinds: ["set_conversion_feature"],
    });
    expect(planned.config.conversion.aiChat).toMatchObject({
      enabled: true,
      label: "Got questions?",
    });
  });

  it("fulfills a conversion package request without misclassifying it as a page-layout change", async () => {
    const draft = {
      ...config(),
      business: {
        ...config().business,
        primaryCta: "Request a conversation",
        offer: "A complimentary first conversation",
      },
      conversion: {
        qualification: [
          { name: "need", label: "What do you need?", options: ["Help"] },
        ],
        faqs: [
          {
            question: "How do we begin?",
            answer: "Start with a conversation.",
          },
        ],
      },
    };
    const planned = await planRevision(
      ["Add quick answers and enable the exit popup."],
      draft,
      async () => [],
    );
    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "fulfilled",
      intents: ["conversion-feature"],
    });
    expect(planned.operations.map((item) => item.kind)).toEqual([
      "set_conversion_feature",
      "set_conversion_feature",
    ]);
  });

  it("accepts a creative-deferred result only after rendered human verification", () => {
    const draft = config();
    const report: any = {
      creativeSourceRepairRequired: true,
      results: [
        {
          feedbackIndex: 0,
          status: "creative",
          unresolved: [],
        },
      ],
      expectedArtifacts: [],
    };

    expect(verifyRevision(draft, report, "<main></main>").ok).toBe(false);

    report.creativeSourceRepairVerified = {
      pass: true,
      candidateId: "candidate-a",
    };
    expect(verifyRevision(draft, report, "<main></main>")).toEqual({
      ok: true,
      failures: [],
    });
  });

  it("rejects creative verification from a different selected candidate", () => {
    const draft = config();
    draft.design = {
      experience: { candidateId: "candidate-b" },
    };
    const report: any = {
      creativeSourceRepairRequired: true,
      creativeSourceRepairVerified: {
        pass: true,
        candidateId: "candidate-a",
      },
      results: [
        {
          feedbackIndex: 0,
          status: "creative",
          unresolved: [],
        },
      ],
      expectedArtifacts: [],
    };

    expect(verifyRevision(draft, report, "<main></main>").ok).toBe(false);

    report.creativeSourceRepairVerified.candidateId = "candidate-b";
    expect(verifyRevision(draft, report, "<main></main>")).toEqual({
      ok: true,
      failures: [],
    });
  });

  it("blocks fulfilled structured feedback when creative source verification was also required", () => {
    const draft = config();
    const report: any = {
      creativeSourceRepairRequired: true,
      results: [
        {
          feedbackIndex: 0,
          status: "fulfilled",
          unresolved: [],
        },
      ],
      expectedArtifacts: [],
    };

    expect(verifyRevision(draft, report, "<main></main>").failures).toContain(
      "Creative source repair was required but did not pass rendered human verification.",
    );

    report.creativeSourceRepairVerified = {
      pass: true,
      candidateId: "candidate-a",
    };
    expect(verifyRevision(draft, report, "<main></main>")).toEqual({
      ok: true,
      failures: [],
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
          kind: "set_section_enabled",
          sectionType: "social-proof",
          enabled: false,
        },
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

  it("lets an explicit broad layout request use bounded recipe operations", async () => {
    const planned = await planRevision(
      ["Substantially improve the page layout and visual hierarchy."],
      config(),
      async () => [
        {
          feedbackIndex: 0,
          kind: "set_section_enabled",
          sectionType: "social-proof",
          enabled: false,
        },
        {
          feedbackIndex: 0,
          kind: "set_section_variant",
          sectionType: "hero",
          variant: "centered",
        },
        {
          feedbackIndex: 0,
          kind: "reorder_section",
          sectionType: "process",
          relativeTo: "services",
          position: "after",
        },
        {
          feedbackIndex: 0,
          kind: "set_design_treatment",
          density: "spacious",
          typography: "editorial",
        },
      ],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "fulfilled",
      fulfilled: ["layout"],
    });
    expect(planned.config.design.treatment).toEqual({
      density: "spacious",
      typography: "editorial",
    });
    expect(
      planned.config.design.sections.find(
        (section: any) => section.type === "hero",
      ).variant,
    ).toBe("centered");
    expect(
      planned.config.design.sections.some(
        (section: any) => section.type === "social-proof",
      ),
    ).toBe(true);
  });

  it("does not count unchanged structural operations as applied work", () => {
    const draft = {
      ...config(),
      design: {
        recipe: "general-editorial",
        sections: [
          { id: "opening", type: "hero", variant: "editorial" },
          { id: "services", type: "services", variant: "editorial" },
          { id: "process", type: "process", variant: "guided" },
          { id: "contact", type: "contact", variant: "consultation" },
        ],
      },
    };
    expect(
      applyOperation(draft, {
        kind: "set_section_variant",
        sectionType: "hero",
        variant: "editorial",
      }),
    ).toBe(false);
    expect(
      applyOperation(draft, {
        kind: "set_section_enabled",
        sectionType: "process",
        enabled: true,
      }),
    ).toBe(false);
    expect(
      applyOperation(draft, {
        kind: "reorder_section",
        sectionType: "process",
        relativeTo: "services",
        position: "after",
      }),
    ).toBe(false);
  });

  it("interprets requested brand and background colors without requiring the word palette", () => {
    const operations = deterministicOperations(
      "Use navy for the brand and cream for the background.",
      config(),
    );
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "set_color_palette",
      palette: {
        primaryColor: "#17324d",
        surfaceColor: "#fbf6ed",
      },
    });
  });

  it("defers visual feedback on a creative candidate to authored source repair", async () => {
    const draft = {
      ...config(),
      design: {
        experience: {
          renderer: "creative-candidate",
          candidateId: "candidate-a",
        },
      },
    };
    const planned = await planRevision(
      ["Make the hero feel more cinematic, premium, and asymmetrical."],
      draft,
      async () => [],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "creative",
      intents: ["layout"],
      deferred: ["layout"],
      unresolved: [],
    });
    expect(planned.operations).toEqual([]);
  });

  it("routes explicit creative feature changes to authored source refinement", async () => {
    const draft = {
      ...config(),
      design: {
        experience: {
          renderer: "creative-candidate",
          candidateId: "candidate-a",
        },
      },
    };
    const planned = await planRevision(
      ["Replace the hero image treatment and add a project carousel."],
      draft,
      async () => [],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "creative",
      intents: ["layout"],
      deferred: ["layout"],
      unresolved: [],
    });
  });

  it("keeps copy-only creative feedback on the structured content lane", async () => {
    const draft = {
      ...config(),
      design: {
        experience: {
          renderer: "creative-candidate",
          candidateId: "candidate-a",
        },
      },
    };
    const planned = await planRevision(
      ["Rewrite the hero heading so it is shorter."],
      draft,
      async () => [
        {
          feedbackIndex: 0,
          kind: "set_copy",
          field: "heroHeading",
          value: "Clear support at home",
        },
      ],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "fulfilled",
      intents: ["content"],
      deferred: [],
      unresolved: [],
    });
    expect(planned.config.copy.heroHeading).toBe("Clear support at home");
  });

  it("does not pretend the same unsupported visual request is fulfilled on a legacy renderer", async () => {
    const planned = await planRevision(
      ["Make the hero feel more cinematic, premium, and asymmetrical."],
      config(),
      async () => [],
    );

    expect(planned.ok).toBe(false);
    expect(planned.results[0]).toMatchObject({
      status: "manual",
      unresolved: ["unknown"],
    });
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

  it("safely shortens a bloated hero even when the model returns no operation", async () => {
    const draft = config();
    draft.business.tagline =
      "Family-owned Tallahassee plumbers, dependably done right for over 25 years.";
    draft.business.description =
      "Mike Seeders Plumbing Inc serves homes and businesses across Tallahassee and the Big Bend. We handle repairs, replacements, and installation work. Call us to discuss the problem and arrange the next step.";

    const planned = await planRevision(
      ["The hero section is too bloated; can we shorten it?"],
      draft,
      async () => [],
    );

    expect(planned.ok).toBe(true);
    expect(planned.results[0]).toMatchObject({
      status: "fulfilled",
      fulfilled: ["content"],
      operationKinds: ["set_copy", "set_copy"],
    });
    expect(planned.config.copy.heroHeading).toBe(
      "Family-owned Tallahassee plumbers",
    );
    expect(planned.config.copy.heroBody).toBe(
      "Mike Seeders Plumbing Inc serves homes and businesses across Tallahassee and the Big Bend.",
    );
    expect(planned.config.copy.heroBody.length).toBeLessThan(
      draft.business.description.length,
    );
  });

  it("retries an empty model plan once at higher reasoning effort", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: '{"plans":[]}' } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content:
                  '{"plans":[{"feedbackIndex":0,"operations":[{"kind":"set_copy","field":"heroBody","value":"Local plumbing help across Tallahassee."}]}]}',
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const operations = await modelOperations(
      ["Please rewrite the hero body."],
      config(),
      "test-model",
    );

    expect(operations).toEqual([
      expect.objectContaining({
        feedbackIndex: 0,
        kind: "set_copy",
        field: "heroBody",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reasoning_effort).toBe(
      "high",
    );
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
        kind: "set_section_variant",
        sectionType: "hero",
        variant: "trades-split",
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
