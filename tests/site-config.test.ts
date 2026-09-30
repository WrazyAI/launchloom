import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildInspirationPack } from "../scripts/inspiration-registry.mjs";
import {
  argumentValue,
  evaluateDraft,
  generateSiteConfigWithModel,
  normalise,
  prepareGenerationIntake,
} from "../scripts/generate-site-config.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function repairOutcomeCandidate(heroHeading: string) {
  return {
    preset: "home-services",
    business: {
      name: "Riverview Mobile Auto Care",
      tagline: "The shop comes to your driveway",
      description:
        "Appointment-based mobile vehicle care in Portland. Each visit starts with a documented inspection before recommendations.",
    },
    services: [
      {
        name: "Mobile vehicle diagnostics",
        description:
          "We scan warning lights and explain what the findings can and cannot tell you.",
      },
      {
        name: "Brake inspection and repair",
        description:
          "We check brake wear and share a written estimate before any agreed work.",
      },
    ],
    differentiators: [
      "A documented inspection precedes recommendations.",
      "An itemized estimate is shared before work begins.",
    ],
    copy: {
      heroKicker: "Mobile auto care in Portland, OR",
      heroHeading,
      heroBody:
        "Book mobile auto care for your vehicle and review inspection notes before any work is considered.",
      servicesHeading: "Vehicle care, explained",
      servicesIntro:
        "Choose a confirmed service and review what it includes before booking.",
      aboutHeading: "Clear steps before any work",
      aboutBody:
        "Appointment-based mobile service brings vehicle inspections to Portland drivers.",
      contactHeading: "Request a service appointment",
      formIntro:
        "Share your vehicle and preferred appointment details so the team can confirm the next step.",
    },
    conversion: {
      process: [
        "Share the vehicle details and concern.",
        "The team confirms whether the service and location are a fit.",
        "Review findings and the estimate before approving work.",
      ],
      faqs: [
        {
          question: "What happens during the first appointment?",
          answer:
            "The visit begins with a documented inspection and a discussion of the next step before work is considered.",
        },
        {
          question: "When do I approve repairs?",
          answer:
            "An itemized estimate is presented before work begins so you can review the scope and decide.",
        },
      ],
    },
  };
}

function stubCopyModelResponses(
  candidates: ReturnType<typeof repairOutcomeCandidate>[],
) {
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  const remaining = [...candidates];
  const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => {
    const content = remaining.shift();
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("site configuration", () => {
  it("marks only explicitly synthetic demo intakes with the fixed public notice", () => {
    const demo = normalise({}, {
      submissionId: "demo-coastal-20260923",
      confirmAccuracy: "synthetic demo brief; not a real client attestation",
      additionalNotes: "FICTIONAL DEMO ONLY. Never publish this as a real client site.",
      businessName: "Coastal Brush Painting Co.",
      industry: "painting",
      services: "Interior painting\nCabinet refinishing",
      serviceAreas: "Charleston, South Carolina",
    });

    expect(demo.demoNotice).toBe("Fictional pipeline demo");

    const client = normalise({}, {
      submissionId: "submission-real-painting-2026",
      confirmAccuracy: "yes",
      additionalNotes: "We use demo rooms to show our color process.",
      businessName: "Harbor Paint Studio",
      industry: "painting",
      services: "Interior painting",
      serviceAreas: "Charleston, South Carolina",
    });

    expect(client).not.toHaveProperty("demoNotice");
  });

  it("resolves explicit automotive repair facts while leaving vehicle sales unsupported", () => {
    const repair = normalise({}, {
      businessName: "Precision Auto Care",
      industry: "automotive",
      services: "Digital vehicle inspections\nBrake service\nRoutine automotive maintenance",
    });
    expect(repair.industry).toBe("home-services");
    expect(repair.businessKind).toBe("auto-repair");

    const dealership = normalise({}, {
      businessName: "Metro Auto Center",
      industry: "automotive",
      services: "New vehicle sales\nUsed vehicle sales",
    });
    expect(dealership.industry).toBe("other");
    expect(dealership.businessKind).toBe("automotive");
  });

  it("keeps an explicit HVAC niche ahead of incidental care wording in intake notes", () => {
    const config = normalise(
      {},
      {
        businessName: "Copperline Climate Workshop",
        industry: "hvac",
        services: "AC repair\nFurnace repair\nHeat pump installation",
        differentiators: "Appointment-led diagnosis before recommendations",
        brandNotes: "Careful protection of occupied homes.",
      },
    );

    expect(config.industry).toBe("home-services");
    expect(config.businessKind).toBe("hvac");
    expect(config.preset).toBe("home-services");
  });

  it.each([
    ["home-services", "home-services", "home-services"],
    ["dental", "wellness", "dental"],
    ["home-care", "wellness", "home-care"],
    ["fitness", "wellness", "fitness"],
    ["restaurant", "hospitality", "restaurant"],
    ["hospitality", "hospitality", "hospitality"],
    ["architecture", "professional-services", "architecture"],
    ["legal-services", "professional-services", "legal-services"],
    ["beauty", "wellness", "beauty"],
    ["accounting", "professional-services", "accounting"],
    ["auto-repair", "home-services", "auto-repair"],
    ["garage-door", "home-services", "garage-door"],
    ["hvac", "home-services", "hvac"],
    ["roofing", "home-services", "roofing"],
    ["painting", "home-services", "painting"],
    ["real-estate", "real-estate", "real-estate"],
    ["veterinary", "wellness", "veterinary"],
  ])(
    "maps the %s intake niche to the %s site recipe and %s reference niche",
    (selectedIndustry, expectedIndustry, expectedBusinessKind) => {
      const config = normalise(
        {},
        {
          businessName: "Example Local Business",
          industry: selectedIndustry,
          services: "Confirmed service",
        },
      );

      expect(config.industry).toBe(expectedIndustry);
      expect(config.businessKind).toBe(expectedBusinessKind);
    },
  );

  it("infers an HVAC reference niche from broad home-services intake facts", () => {
    const config = normalise(
      {},
      {
        businessName: "Copperline Climate Workshop",
        industry: "home-services",
        services: "AC repair\nFurnace repair\nHeat pump installation",
        differentiators: "Appointment-led diagnosis before recommendations",
        brandNotes: "Careful protection of occupied homes.",
      },
    );

    expect(config.industry).toBe("home-services");
    expect(config.businessKind).toBe("hvac");
  });

  it("routes painting services from broad home-services intake to painting references", () => {
    const config = normalise(
      {},
      {
        businessName: "Coastal Brush Painting Co.",
        industry: "home-services",
        services: "Interior painting\nCabinet refinishing\nExterior painting and trim",
      },
    );
    const registry = JSON.parse(
      readFileSync(
        new URL("../data/inspiration-registry.json", import.meta.url),
        "utf8",
      ),
    );
    const pack = buildInspirationPack(
      { seed: "coastal-brush-painting-regression", industry: config.businessKind, styleTerms: [] },
      registry,
      { repositoryRoot: process.cwd(), requireDossiers: true },
    );

    expect(config.industry).toBe("home-services");
    expect(config.businessKind).toBe("painting");
    expect(pack.request.industry).toBe("painting");
    expect(pack.routes).toHaveLength(3);
    expect(
      pack.routes.every((route: any) => route.referenceDossier.tags.business.includes("painting")),
    ).toBe(true);
  });

  it("selects only HVAC reference dossiers after generating an HVAC config", () => {
    const config = normalise(
      {},
      {
        businessName: "Copperline Climate Workshop",
        industry: "hvac",
        services: "AC repair\nFurnace repair\nHeat pump installation",
        differentiators: "Appointment-led diagnosis before recommendations",
        brandNotes: "Careful protection of occupied homes.",
      },
    );
    const registry = JSON.parse(
      readFileSync(
        new URL("../data/inspiration-registry.json", import.meta.url),
        "utf8",
      ),
    );
    const pack = buildInspirationPack(
      { seed: "hvac-niche-regression", industry: config.businessKind, styleTerms: [] },
      registry,
      { repositoryRoot: process.cwd(), requireDossiers: true },
    );

    expect(pack.request.industry).toBe("hvac");
    expect(pack.routes).toHaveLength(3);
    expect(
      pack.routes.every((route: any) => route.referenceDossier.tags.business.includes("hvac")),
    ).toBe(true);
  });

  it("uses only client-confirmed services in home-service enquiry options", () => {
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      industry: "home-services",
      services: "Drain cleaning\nWater heater repair",
      serviceAreas: "Tacoma, WA",
    });

    expect(config.conversion.qualification[0].options).toEqual([
      "Drain cleaning",
      "Water heater repair",
      "Not sure yet",
    ]);
    expect(config.conversion.qualification[0].options).not.toContain("Installation");
    expect(config.conversion.qualification[0].options).not.toContain("Maintenance");
  });

  it("keeps all five confirmed hospitality services available in enquiry options", () => {
    const services = ["Sourdough", "Viennoiserie", "Bespoke cakes", "Catering", "Breakfast gatherings"];
    const config = normalise({}, {
      businessName: "Lumière Artisan Bakery & Café",
      industry: "hospitality",
      services: services.join("\n"),
    });

    expect(config.conversion.qualification[0].options).toEqual([
      ...services,
      "Not sure yet",
    ]);
  });

  it("preserves commas inside a confirmed service array entry", () => {
    const config = normalise({}, {
      businessName: "North Sound Heating",
      industry: "home-services",
      services: ["Heating, ventilation and AC"],
    });

    expect(config.services.map((service: { name: string }) => service.name)).toContain(
      "Heating, ventilation and AC",
    );
    expect(config.services).toHaveLength(1);
  });

  it("drops malformed blog records and bounds fields for valid article routes", () => {
    const validArticle = {
      slug: "preparing-for-a-first-call",
      title: "Preparing for a first call",
      description: "What to have ready before asking for help.",
      publishedAt: "2026-09-25",
      body: "Write down the issue and when it began.",
    };
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      industry: "home-services",
      services: "Drain cleaning",
      blogArticles: [
        validArticle,
        { slug: "missing-body", title: "Missing body" },
        { title: "Missing slug", body: "Some content." },
        { slug: "../bad-route", title: "Bad route", body: "Some content." },
        { ...validArticle, title: "Duplicate route" },
        { slug: "long-copy", title: `A ${"title ".repeat(40)}`, body: "Useful copy — without an em dash." },
      ],
    });

    expect(config.blogArticles).toHaveLength(2);
    expect(config.blogArticles[0]).toEqual(validArticle);
    expect(config.blogArticles[1].title).toHaveLength(180);
    expect(config.blogArticles[1].body).toContain("Useful copy - without an em dash.");
    expect(config.blogArticles.map((article: { slug: string }) => article.slug)).not.toContain("undefined");
  });

  it("limits generated service pages to the first five confirmed entries", () => {
    const services = ["Drain cleaning", "Water heater repair", "Pipe repair", "Sewer inspection", "Fixture repair", "Septic pumping"];
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      industry: "home-services",
      services,
    });

    expect(config.services.map((service: { name: string }) => service.name)).toEqual(services.slice(0, 5));
  });

  it("does not classify pet care as human wellness imagery", () => {
    const config = normalise({
      copy: {
        aboutBody:
          "Busy salons mean barking,陌生 hands, and long waits for many dogs.",
      },
    }, {
      preset: "home-services",
      industry: "pet-services",
      businessName: "Moss and Mane Mobile Grooming",
      services: "Mobile dog grooming\nBath and coat care\nPaw care",
      differentiators: "One dog at a time with an individual care plan.",
      serviceAreas: "Portland, Oregon",
    });

    expect(config.industry).toBe("other");
    expect(config.images.hero).toBeUndefined();
    expect(config.images.secondary).toBeUndefined();
    expect(config.conversion.qualification[0].options).toEqual([
      "Mobile dog grooming",
      "Bath and coat care",
      "Paw care",
      "Not sure yet",
    ]);
    expect(config.conversion.qualification[0].options).not.toContain(
      "A new project",
    );
    expect(config.copy.aboutBody).not.toMatch(/\p{Script=Han}/u);
    expect(config.copy.aboutBody).toContain("goal, constraints, and questions");
  });

  it("keeps generic pet-care intake out of the veterinary reference niche", () => {
    const config = normalise({}, {
      businessName: "Moss and Mane Pet Care",
      industry: "pet-care",
      services: "Dog grooming\nCat boarding\nPet sitting",
      serviceAreas: "Portland, Oregon",
    });

    expect(config.industry).toBe("other");
    expect(config.businessKind).toBe("pet-care");
  });

  it.each(["design-studio", "auto-dealership", "event-venue"])(
    "preserves unsupported business kind %s so reference selection can fail with the correct gap",
    (industry) => {
      const config = normalise({}, {
        businessName: "Independent Studio",
        industry,
        services: "Consultation and project planning",
      });

      expect(config.industry).toBe("other");
      expect(config.businessKind).toBe(industry);
    },
  );

  it("does not classify a barber as a pet business because of grooming language", () => {
    const config = normalise({}, {
      businessName: "Northline Barber Studio",
      industry: "other",
      services: "Haircuts\nBeard grooming",
      differentiators: "Appointment-led barber services.",
    });

    expect(config.industry).toBe("wellness");
    expect(config.businessKind).toBe("beauty");
  });

  it("does not classify a hot-dog cafe as a pet business", () => {
    const config = normalise({}, {
      businessName: "Northline Hot Dog Cafe",
      industry: "other",
      services: "Hot dogs\nLunch service",
    });

    expect(config.industry).toBe("hospitality");
    expect(config.businessKind).toBe("restaurant");
  });

  it("preserves a non-Latin script when the client supplied that script", () => {
    const config = normalise(
      { copy: { aboutBody: "安心して相談できるサービスです。" } },
      {
        businessName: "さくらケア",
        services: "訪問サポート",
        differentiators: "日本語で相談できます。",
        industry: "professional-services",
      },
    );

    expect(config.copy.aboutBody).toContain("安心して相談できるサービスです。");
  });

  it("rejects Latin-only model copy for a Japanese-language brief", () => {
    const config = normalise(
      { copy: { aboutBody: "Friendly support for every household." } },
      {
        businessName: "さくらケア",
        services: "訪問サポート",
        differentiators: "日本語で相談できます。",
        industry: "professional-services",
      },
    );

    expect(config.copy.aboutBody).not.toContain("Friendly support");
    expect(config.copy.aboutBody).toMatch(/[\p{Script=Han}\p{Script=Hiragana}]/u);
  });

  it("rejects an unapproved writing system for an English-language brief", () => {
    const config = normalise(
      { copy: { aboutBody: "Φροντίδα for every household." } },
      {
        businessName: "Harbor Support",
        services: "Home support",
        differentiators: "Clear conversations before service begins.",
        industry: "professional-services",
      },
    );

    expect(config.copy.aboutBody).not.toMatch(/\p{Script=Greek}/u);
    expect(config.copy.aboutBody).toContain("goal, constraints, and questions");
  });

  it("does not mistake carpet cleaning for a pet business", () => {
    const config = normalise({}, {
      preset: "home-services",
      industry: "home-services",
      businessName: "Clearway Carpet Cleaning",
      services: "Carpet cleaning\nUpholstery cleaning",
      serviceAreas: "Portland, Oregon",
    });

    expect(config.industry).toBe("home-services");
  });

  it("keeps the validated SEO dossier attached to generated content", () => {
    const config = normalise(
      {},
      {
        businessName: "Harbor Plumbing",
        services: "Drain cleaning",
        serviceAreas: "Tacoma",
        industry: "home-services",
        seoResearch: {
          version: 1,
          mode: "researched",
          validatedQueries: [
            {
              query: "drain cleaning tacoma",
              searchVolume: 90,
              provenance: "dataforseo_keyword_overview",
            },
          ],
          pageDecisions: [
            {
              type: "service",
              title: "Drain cleaning",
              provenance: "client_supplied",
            },
          ],
          cost: { tasks: 2, usd: 0.07, limitUsd: 0.1 },
          warnings: [],
        },
      },
    );

    expect(config.seoResearch).toMatchObject({
      mode: "researched",
      publishReady: true,
      cost: { tasks: 2, usd: 0.07, limitUsd: 0.1 },
    });
    expect(config.seoResearch.validatedQueries[0].query).toBe(
      "drain cleaning tacoma",
    );
    expect(config.locations.map((location: { name: string }) => location.name))
      .toEqual(["Tacoma"]);
  });

  it("creates only location routes selected by grounded research", () => {
    const config = normalise(
      {},
      {
        businessName: "Harbor Plumbing",
        services: "Drain cleaning",
        serviceAreas: "Tacoma, WA\nLakewood, WA",
        industry: "home-services",
        seoResearch: {
          mode: "researched",
          pageDecisions: [
            {
              type: "location",
              title: "Tacoma WA",
              provenance: "research_strategy",
            },
          ],
          cost: { tasks: 2, usd: 0.07, limitUsd: 0.1 },
        },
      },
    );

    expect(
      config.locations.map((location: { name: string }) => location.name),
    ).toEqual(["Tacoma, WA"]);
  });

  it("preserves submitted service areas when research is only a baseline", () => {
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      services: "Drain cleaning",
      serviceAreas: "Tacoma, WA\nLakewood, WA",
      industry: "home-services",
      seoResearch: { mode: "baseline", pageDecisions: [] },
    });
    expect(config.business.serviceAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
    expect(config.locations.map((location: { name: string }) => location.name))
      .toEqual(["Tacoma, WA", "Lakewood, WA"]);
  });

  it("preserves submitted service areas when research selected no location pages", () => {
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      services: "Drain cleaning",
      serviceAreas: "Tacoma, WA\nLakewood, WA",
      industry: "home-services",
      seoResearch: { mode: "researched", pageDecisions: [] },
    });
    expect(config.business.serviceAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
    expect(config.locations.map((location: { name: string }) => location.name))
      .toEqual(["Tacoma, WA", "Lakewood, WA"]);
  });

  it("does not create location routes from coverage facts without a selected researched location page", () => {
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      services: ["Drain cleaning"],
      serviceAreas: "Tacoma, WA\nLakewood, WA",
      primaryCity: "Tacoma, WA",
      industry: "home-services",
      seoResearch: {
        version: 2,
        mode: "researched",
        publishReady: true,
        pageMap: [
          { id: "home", pageType: "home", title: "Harbor Plumbing", slug: "/", supportingKeywords: [], fanOutQuestions: [], priority: "high", evidence: [] },
          { id: "service:drain", pageType: "service", title: "Drain cleaning", slug: "/services/drain-cleaning/", service: "Drain cleaning", supportingKeywords: [], fanOutQuestions: [], priority: "high", evidence: [] },
        ],
      },
    });

    expect(config.business.serviceAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
    expect(config.business.primaryCity).toBe("Tacoma, WA");
    expect(config.locations).toEqual([]);
    expect(config.seoPageMap.map((page: { pageType: string }) => page.pageType)).toEqual(["home", "service"]);
  });

  it("preserves city names with state commas in canonical coverage facts", () => {
    const config = normalise({}, {
      businessName: "Harbor Plumbing",
      services: ["Drain cleaning"],
      primaryCity: "Tacoma, WA",
      coverageAreas: ["Tacoma, WA", "Lakewood, WA"],
      serviceAreas: "Tacoma, WA\nLakewood, WA",
      industry: "home-services",
      seoResearch: { version: 2, mode: "context-only", publishReady: false, pageMap: [] },
    });
    expect(config.business.serviceAreas).toEqual(["Tacoma, WA", "Lakewood, WA"]);
  });

  it("does not invent an argument value when an optional flag is absent", () => {
    expect(argumentValue(["node", "script.mjs"], "--research")).toBe("");
    expect(
      argumentValue(
        ["node", "script.mjs", "--research", "dossier.json"],
        "--research",
      ),
    ).toBe("dossier.json");
    expect(
      argumentValue(["node", "script.mjs", "--research"], "--research"),
    ).toBe("");
  });

  it("fails closed and bounds research before model generation", () => {
    expect(
      prepareGenerationIntake({ businessName: "Harbor Plumbing" }),
    ).toMatchObject({
      seoResearch: { mode: "baseline", publishReady: false },
    });
    const prepared = prepareGenerationIntake({
      seoResearch: {
        mode: "researched",
        validatedQueries: Array.from({ length: 20 }, (_, index) => ({
          query: `query ${index}`,
        })),
        evidence: Array.from({ length: 20 }, (_, index) => ({
          url: `${index}`,
        })),
      },
    });
    expect(prepared.seoResearch?.validatedQueries).toHaveLength(12);
    expect(prepared.seoResearch?.evidence).toHaveLength(6);
    const v2 = prepareGenerationIntake({ seoResearch: { version: 2, mode: "researched", publishReady: true, pageMap: [{ id: "service:a", pageType: "service" }] } });
    expect(v2.seoResearch?.pageMap).toHaveLength(1);
    expect(v2.seoResearch?.publishReady).toBe(true);
  });

  it("uses client photos and logo metadata without substituting an unrelated stock image", () => {
    const config = normalise(
      {
        business: {
          tagline: "Ship clearer software, with less friction.",
          description:
            "A focused description for the people evaluating the product.",
        },
        services: [
          {
            name: "Workflow software",
            description: "A practical system for repeatable work.",
            slug: "workflow-software",
          },
        ],
        copy: { heroKicker: "Operations, simplified" },
      },
      {
        businessName: "Northstar Software",
        phone: "555-0100",
        email: "hello@northstar.test",
        address: "Austin, TX",
        serviceAreas: "Remote",
        services: "Workflow software",
        differentiators: "Clear setup",
        primaryCta: "Book a demo",
        preset: "wellness",
        industry: "technology",
        assets: {
          logo: "https://assets.example/intakes/logo.png",
          photoOne: "https://assets.example/intakes/product.png",
        },
      },
    );

    expect(config.industry).toBe("technology");
    expect(config.assets?.logo).toBe("https://assets.example/intakes/logo.png");
    expect(config.images.hero).toBe(
      "https://assets.example/intakes/product.png",
    );
    expect(config.images.secondary).toBeUndefined();
    expect(config.business.phone).toBe("555-0100");
    expect(config.copy.heroKicker).toBe("Operations, simplified");
    expect(config.conversion.layout).toBe("product-clarity");
    expect(config.assetReport.used).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asset: "logo", placement: "brand" }),
        expect.objectContaining({ asset: "photoOne", placement: "hero" }),
      ]),
    );
  });

  it("selects only an approved contextual fallback and adds conversion content", () => {
    const config = normalise(
      {},
      {
        businessName: "Clarity Advisory",
        phone: "555-0100",
        email: "hello@clarity.test",
        address: "Austin, TX",
        services: "Business consulting",
        differentiators: "Straight answers, practical recommendations",
        primaryCta: "Book a consultation",
        preset: "wellness",
        industry: "professional-services",
      },
    );

    expect(config.images.hero).toBe(
      "/images/packs/professional-services-advisory-v1.png",
    );
    expect(config.images.secondary).toBeUndefined();
    expect(config.conversion.layout).toBe("editorial-authority");
    expect(config.conversion.qualification).toHaveLength(1);
    expect(config.conversion.faqs.length).toBeGreaterThan(0);
    expect(config.conversion.guidedQualifier).toMatchObject({ enabled: true });
    expect(config.conversion.quickAnswers).toMatchObject({
      enabled: true,
      label: "Quick answers",
    });
    expect(config.conversion.quickAnswers.items).toEqual(
      config.conversion.faqs,
    );
    expect(config.conversion.exitOffer.enabled).toBe(false);
    expect(config.design.experience.packId).toMatch(
      /^(cinematic-narrative|bold-utility|kinetic-poster)$/,
    );
  });

  it("keeps the accounting reference niche while using its reviewed advisory image", () => {
    const config = normalise(
      {},
      {
        businessName: "Oak & Ledger Tax",
        industry: "accounting",
        services: "Tax preparation\nBookkeeping\nPayroll processing",
        preset: "wellness",
      },
    );

    expect(config.businessKind).toBe("accounting");
    expect(config.images.hero).toBe(
      "/images/packs/professional-services-advisory-v1.png",
    );
    expect(config.assetReport.used).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asset: "hero",
          source: "stock-pack",
          license: "LaunchLoom-owned generated fallback",
        }),
      ]),
    );
  });

  it("enables a restrained exit offer only when the client supplied a real offer", () => {
    const config = normalise(
      {},
      {
        businessName: "Willow Home Care",
        services: "Companion care",
        primaryCta: "Request a care conversation",
        offer: "A complimentary first care conversation",
        industry: "wellness",
        preset: "wellness",
      },
    );

    expect(config.conversion.exitOffer).toMatchObject({
      enabled: true,
      heading: "A complimentary first care conversation",
      ctaLabel: "Request a care conversation",
    });
    expect(JSON.stringify(config.conversion)).not.toContain("—");
  });

  it("enables the Got questions assistant only when the client explicitly selects it", () => {
    const enabled = normalise(
      {},
      {
        businessName: "Example Plumbing",
        services: "Drain cleaning",
        primaryCta: "Request service",
        industry: "home-services",
        preset: "home-services",
        conversionAiChat: "yes",
      },
    );
    const defaultConfig = normalise(
      {},
      {
        businessName: "Example Plumbing",
        services: "Drain cleaning",
        primaryCta: "Request service",
        industry: "home-services",
        preset: "home-services",
      },
    );

    expect(enabled.conversion.aiChat).toMatchObject({
      enabled: true,
      label: "Got questions?",
      apiUrl: "",
      token: "",
    });
    expect(defaultConfig.conversion.aiChat.enabled).toBe(false);
  });

  it("selects readable action text for the submitted Lumiere terracotta", () => {
    const config = normalise(
      {},
      {
        businessName: "Lumiere Artisan Bakery and Cafe",
        services: "Artisan bread",
        primaryCta: "Request a quote",
        primaryColor: "#c86d51",
        industry: "hospitality",
        preset: "home-services",
      },
    );

    expect(config.style).toMatchObject({
      primaryColor: "#c86d51",
      contrastColor: "#000000",
    });
  });

  it("creates a comfortable full-section palette for a neon athletic accent", () => {
    const config = normalise(
      {},
      {
        businessName: "Pulse Athletic Club",
        services: "Strength coaching",
        primaryColor: "#d4ff00",
        industry: "wellness",
        brandNotes:
          "Ultra-modern dark mode with a deep matte charcoal background (#111315) and bold geometric headers.",
      },
    );

    expect(config.style.primaryColor).toBe("#d4ff00");
    expect(config.style.surfaceColor).toBe("#111315");
    expect(config.style.brandSurfaceColor).not.toBe("#d4ff00");
    expect(config.style.brandSurfaceTextColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(config.style.brandTextColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(config.design.treatment.typography).toBe("geometric");
    expect(config.businessKind).toBe("fitness");
    expect(config.design.recipe).toBe("general-editorial");
    expect(config.design.variantId).toMatch(/^general-/);
  });

  it("selects a stable but intake-specific complete design variant", () => {
    const previous = process.env.LAUNCHLOOM_INTAKE_ID;
    process.env.LAUNCHLOOM_INTAKE_ID = "20";
    const first = normalise(
      {},
      {
        businessName: "Pulse Athletic Club",
        services: "Strength coaching",
        industry: "wellness",
      },
    );
    const repeated = normalise(
      {},
      {
        businessName: "Pulse Athletic Club",
        services: "Strength coaching",
        industry: "wellness",
      },
    );
    if (previous === undefined) delete process.env.LAUNCHLOOM_INTAKE_ID;
    else process.env.LAUNCHLOOM_INTAKE_ID = previous;

    expect(repeated.design.variantId).toBe(first.design.variantId);
    expect(first.design.sections.length).toBeGreaterThanOrEqual(6);
    expect(first.design.treatment.typography).toBeTruthy();
  });

  it("does not give a hospitality business trades framing from its preset", () => {
    const config = normalise(
      {
        business: {
          tagline:
            "Charleston's home of 48-hour sourdough, laminated pastry, and slow mornings on King Street.",
          description:
            "Lumiere bakes slow-fermented sourdough, handcrafted French viennoiserie, and bespoke event cakes from its King Street bakery. Guests can also stop in for espresso and seasonal drinks.",
        },
        services: [
          {
            name: "Slow-Fermented Organic Sourdough and Specialty Breads",
            description:
              "Loaves built on a 48-hour wild-yeast fermentation with organic heirloom grains, baked daily for the cafe counter and special orders.",
          },
        ],
        copy: {
          servicesHeading: "Baked Slow, Served Beautifully",
          servicesIntro:
            "From daily bread to celebration cakes, choose what brings you in.",
        },
      },
      {
        businessName: "Lumiere Artisan Bakery and Cafe",
        services: "Slow-Fermented Organic Sourdough & Specialty Breads",
        industry: "hospitality",
        preset: "home-services",
      },
    );

    expect(config.design.recipe).toBe("general-editorial");
    expect(
      config.design.sections.map((section: { type: string }) => section.type),
    ).not.toContain("social-proof");
    expect(config.conversion.layout).toBe("editorial-authority");
    expect(config.locations).toEqual([]);
    expect(config.business.tagline.split(/\s+/)).toHaveLength(5);
    expect(config.business.tagline).toBe(
      "Charleston's home of 48-hour sourdough",
    );
    expect(config.copy.heroBody.length).toBeLessThanOrEqual(170);
    expect(config.services[0].description.length).toBeLessThanOrEqual(125);
    expect(config.services[0].description).toContain("Loaves built");
    expect(config.copy.servicesIntro).toContain("celebration cakes");
  });

  it("finishes long about copy at a word boundary with punctuation", () => {
    const config = normalise(
      {
        copy: {
          aboutBody:
            "Lumiere was built around a simple conviction: bread and pastry deserve time. Our bakers ferment every sourdough for 48 hours on wild yeast, work exclusively with organic heirloom grains, laminate pastry by hand, and bake each morning for the neighborhood.",
        },
      },
      {
        businessName: "Lumiere Artisan Bakery and Cafe",
        services: "Sourdough bread",
        industry: "hospitality",
        preset: "home-services",
      },
    );

    expect(config.copy.aboutBody.length).toBeLessThanOrEqual(180);
    expect(config.copy.aboutBody).toMatch(/[.!?]$/);
    expect(config.copy.aboutBody).toBe(
      "Lumiere was built around a simple conviction: bread and pastry deserve time.",
    );
  });

  it("does not substitute stock imagery for an unsupported industry", () => {
    const config = normalise(
      {},
      {
        businessName: "Northstar Software",
        services: "Workflow software",
        industry: "technology",
        preset: "wellness",
      },
    );

    expect(config.images.hero).toBeUndefined();
    expect(config.images.secondary).toBeUndefined();
    expect(config.conversion.layout).toBe("product-clarity");
  });

  it("selects the home-care recipe, care questions, and licensed contextual assets", () => {
    const config = normalise(
      {
        services: [
          {
            name: "Companion care",
            description:
              "Conversation, shared activities, and practical support for familiar routines at home.",
            decisionSupport: {
              scope: "Discuss the routines where companionship would help.",
              nextStep: "Begin with a family care conversation.",
              preparation: "Bring a picture of a typical day.",
            },
          },
        ],
      },
      {
        businessName: "Willow Home Care",
        services: "Companion care",
        industry: "wellness",
        preset: "wellness",
      },
    );

    expect(config.businessKind).toBe("home-care");
    expect(config.design.recipe).toBe("care-editorial");
    expect(config.conversion.qualification[0].name).toBe("careNeed");
    expect(config.services[0].decisionSupport.scope).toContain("routines");
    expect(config.assetReport.used).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placement: "hero",
          source: "stock-pack",
          provider: "Unsplash",
          license: "Unsplash License",
        }),
      ]),
    );
  });

  it("replaces stock attribution when a client image owns the placement", () => {
    const config = normalise(
      {},
      {
        businessName: "Willow Home Care",
        services: "Home care",
        industry: "wellness",
        preset: "wellness",
        assets: { photoOne: "https://assets.example/client-hero.jpg" },
      },
    );

    expect(
      config.assetReport.used.filter(
        (item: { placement: string }) => item.placement === "hero",
      ),
    ).toEqual([
      expect.objectContaining({ source: "client", asset: "photoOne" }),
    ]);
  });

  it("does not allow generic model service copy through to the site", () => {
    const config = normalise(
      {
        services: [
          {
            name: "Roof repair",
            description: "Roof repair tailored to your needs.",
          },
        ],
      },
      {
        businessName: "Northside Roofing",
        services: "Roof repair",
        industry: "home-services",
        preset: "home-services",
      },
    );

    expect(config.services[0].description).toContain("clear next step");
    expect(config.services[0].description).not.toMatch(
      /tailored to your needs/i,
    );
  });

  it("renders submitted Markdown links as readable proof text", () => {
    const config = normalise(
      {
        differentiators: [
          "[Mike Seeders Plumbing](https://example.com/) provides residential plumbing across Leon County.",
        ],
      },
      {
        businessName: "Mike Seeders Plumbing",
        services: "Plumbing repair",
        differentiators: "Local plumbing support",
        industry: "home-services",
        preset: "home-services",
      },
    );

    expect(config.differentiators).toEqual([
      "Mike Seeders Plumbing provides residential plumbing across Leon County.",
    ]);
  });

  it("extracts usable process copy from model step objects", () => {
    const config = normalise(
      {
        conversion: {
          process: [
            {
              title: "Share what your family needs",
              description: "Extra detail",
            },
            { label: "Get a clear recommendation" },
          ],
        },
      },
      {
        businessName: "Daley Hope",
        services: "Home care",
        industry: "wellness",
      },
    );

    expect(config.conversion.process).toEqual([
      "Share what your family needs",
      "Get a clear recommendation",
    ]);
    expect(config.conversion.process).not.toContain("[object Object]");
  });

  it("preserves newline-delimited service groups with internal commas", () => {
    const config = normalise(
      {},
      {
        businessName: "Daily Hope Healthcare Services",
        services:
          "Personal Care Assistance (Hygiene, Bathing, Grooming, Mobility Support)\nCompanionship & Emotional Support (Social Engagement, Activities, Mental Wellness)\nMeal Preparation, Nutrition & Grocery Shopping\nRespite Care for Family Caregivers",
        industry: "wellness",
        preset: "wellness",
      },
    );

    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual([
      "Personal Care Assistance (Hygiene, Bathing, Grooming, Mobility Support)",
      "Companionship & Emotional Support (Social Engagement, Activities, Mental Wellness)",
      "Meal Preparation, Nutrition & Grocery Shopping",
      "Respite Care for Family Caregivers",
    ]);
  });

  it("uses complete submitted proof statements instead of comma fragments", () => {
    const config = normalise(
      {
        differentiators: [
          "We deliver a complete spectrum of flexible",
          "non-medical home care from a few hours a week",
        ],
      },
      {
        businessName: "Daily Hope Healthcare Services",
        services: "Personal care",
        differentiators:
          "We are locally owned and clients deal directly with agency leadership. Our caregivers live in the communities they serve, providing dependable arrival times and neighborly care. We deliver flexible non-medical home care focused on dignity, independence, and peace of mind.",
        industry: "wellness",
        preset: "wellness",
      },
    );

    expect(config.differentiators).toHaveLength(3);
    expect(
      config.differentiators.every((item: string) => /[.!?]$/.test(item)),
    ).toBe(true);
    expect(config.differentiators).not.toContain(
      "We deliver a complete spectrum of flexible",
    );
  });

  it("suppresses an unverified address that conflicts with a stated business base", () => {
    const config = normalise(
      {},
      {
        businessName: "Daily Hope Healthcare Services",
        address: "2101 N Country Club Rd Suite 102, Tucson, AZ 85716, USA",
        placeId: "",
        serviceAreas: "Bala Cynwyd, Montgomery County, Philadelphia County",
        services: "Personal care",
        differentiators:
          "We are a locally owned agency based in Bala Cynwyd where clients deal directly with agency leadership.",
        primaryCta: "Get directions",
        industry: "wellness",
        preset: "wellness",
      },
    );

    expect(config.business.address).toBe("");
    expect(config.business.googleMapsUrl).toBe("");
    expect(config.business.primaryCta).toBe("Contact us");
  });

  it("keeps submitted service names and flags shallow conversion drafts", () => {
    const config = normalise(
      {
        services: [
          {
            name: "Invented service",
            description: "A service tailored to your needs.",
          },
        ],
        copy: { heroKicker: "Next level support", servicesHeading: "Help" },
        conversion: { process: ["Call us"], faqs: [] },
      },
      {
        businessName: "Northside Roofing",
        services: "Roof repair\nRoof replacement",
        primaryCta: "Request an inspection",
        industry: "home-services",
        preset: "home-services",
      },
    );

    expect(
      config.services.map((service: { name: string }) => service.name),
    ).toEqual(["Roof repair", "Roof replacement"]);
    expect(evaluateDraft(config).issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/opening message/i),
        expect.stringMatching(/primary headings/i),
        expect.stringMatching(/visitor journey/i),
      ]),
    );
  });

  it("blocks repair-outcome copy when the client explicitly prohibited those claims", () => {
    const intake = {
      businessName: "Riverview Mobile Auto Care",
      industry: "auto-repair",
      services: "Mobile vehicle diagnostics\nBrake inspection and repair",
      serviceAreas: "Portland, OR",
      differentiators:
        "Documented inspection before recommendations. Itemized estimate before work.",
      brandNotes:
        "Do not claim emergency availability, warranties, prices, or repair outcomes.",
    };
    const prohibited = normalise({}, intake);
    prohibited.copy.heroHeading = "Your Car Gets Fixed Where It Sits";
    expect(evaluateDraft(prohibited).issues).toContain(
      "Generated copy includes a repair outcome prohibited by the client art direction.",
    );

    const cautious = normalise({}, intake);
    cautious.copy.heroHeading = "Mobile auto care for Portland drivers";
    expect(evaluateDraft(cautious).issues).not.toContain(
      "Generated copy includes a repair outcome prohibited by the client art direction.",
    );

    for (const statement of [
      "We do not claim your vehicle will be repaired at home.",
      "We cannot promise your car will be fixed at home.",
      "We never claim your vehicle gets fixed during the visit.",
      "No one can guarantee your car will be restored.",
      "We don't claim our team will repair every issue.",
      "We won't claim your vehicle will be resolved in one visit.",
    ]) {
      const negated = normalise(
        { copy: { heroBody: statement } },
        intake,
      );
      expect(evaluateDraft(negated).issues).not.toContain(
        "Generated copy includes a repair outcome prohibited by the client art direction.",
      );
    }

    const positiveAfterNegation = normalise(
      {
        copy: {
          heroBody:
            "We do not guarantee prices; our team will fix every vehicle today.",
        },
      },
      intake,
    );
    expect(evaluateDraft(positiveAfterNegation).issues).toContain(
      "Generated copy includes a repair outcome prohibited by the client art direction.",
    );

    const unrelatedNegation = normalise(
      {
        copy: {
          heroBody:
            "Our call-out fee is not guaranteed and our team will repair every issue today.",
        },
      },
      intake,
    );
    expect(evaluateDraft(unrelatedNegation).issues).toContain(
      "Generated copy includes a repair outcome prohibited by the client art direction.",
    );
  });

  it("selects a safe refined draft over the original prohibited claim", async () => {
    const fetchMock = stubCopyModelResponses([
      repairOutcomeCandidate("Your Car Gets Fixed Where It Sits"),
      repairOutcomeCandidate("Mobile auto care for Portland drivers"),
    ]);
    const config = await generateSiteConfigWithModel({
      businessName: "Riverview Mobile Auto Care",
      industry: "auto-repair",
      services: "Mobile vehicle diagnostics\nBrake inspection and repair",
      serviceAreas: "Portland, OR",
      phone: "(503) 555-0146",
      differentiators:
        "Documented inspection before recommendations.\nItemized estimate before work.",
      brandNotes:
        "Do not claim emergency availability, warranties, prices, or repair outcomes.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(config.copy.heroHeading).toBe("Mobile auto care for Portland drivers");
    const requestBodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body || "{}")),
    );
    expect(requestBodies.map((body) => body.max_completion_tokens)).toEqual([
      8192, 4096,
    ]);
    expect(config.qualityReport.issues).not.toContain(
      "Generated copy includes a repair outcome prohibited by the client art direction.",
    );
  });

  it("fails closed if copy refinement keeps an explicitly prohibited repair outcome", async () => {
    const prohibited = repairOutcomeCandidate("Your Car Gets Fixed Where It Sits");
    const fetchMock = stubCopyModelResponses([prohibited, prohibited]);

    await expect(
      generateSiteConfigWithModel({
        businessName: "Riverview Mobile Auto Care",
        industry: "auto-repair",
        services: "Mobile vehicle diagnostics\nBrake inspection and repair",
        serviceAreas: "Portland, OR",
        phone: "(503) 555-0146",
        differentiators:
          "Documented inspection before recommendations.\nItemized estimate before work.",
        brandNotes:
          "Do not claim emergency availability, warranties, prices, or repair outcomes.",
      }),
    ).rejects.toThrow(/explicit repair-outcome prohibition/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an OpenRouter credit failure at a higher reasoning effort", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const fetchMock = vi.fn(
      async (_input?: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: {
              message:
                "This request requires more credits, or fewer max_tokens.",
              code: 402,
              metadata: { limit_source: "openrouter_credits" },
            },
          }),
          { status: 402, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateSiteConfigWithModel({
        businessName: "Fieldnotes Veterinary Studio",
        industry: "veterinary",
        services: "Wellness examinations\nDiagnostic consultations",
      }),
    ).rejects.toThrow(/OpenRouter returned 402/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("matches generated service copy by service identity instead of array position", () => {
    const config = normalise(
      {
        services: [
          {
            name: "Water heater repair",
            description:
              "Diagnose inconsistent hot water and explain the repair options.",
          },
          {
            name: "Drain cleaning",
            description:
              "Clear recurring kitchen and bathroom drain blockages.",
          },
        ],
      },
      {
        businessName: "Example Plumbing",
        services: "Drain cleaning\nWater heater repair",
        industry: "home-services",
        preset: "home-services",
      },
    );

    expect(config.services[0].description).toContain("drain blockages");
    expect(config.services[1].description).toContain("hot water");
  });

  it("does not cut generated copy through the middle of a word", () => {
    const config = normalise(
      {
        business: {
          description: `${"Useful complete sentence. ".repeat(30)}unfinishedword`,
        },
      },
      {
        businessName: "Example Business",
        services: "Consultation",
        industry: "professional-services",
      },
    );

    expect(config.business.description).toMatch(/[.!?]$/);
    expect(config.business.description.length).toBeLessThanOrEqual(520);
  });

  it("routes a directions CTA to a map only for an exact location", () => {
    const exact = normalise(
      { copy: { contactHeading: "Get directions" } },
      {
        businessName: "Harbor Bakery",
        address: "10 Harbor Road, Charleston, SC 29401",
        placeId: "ChIJ-harbor",
        services: "Bread and pastries",
        primaryCta: "Get directions",
        industry: "hospitality",
      },
    );
    const broad = normalise(
      {},
      {
        businessName: "Remote Bakery",
        address: "Charleston, SC",
        services: "Bread and pastries",
        primaryCta: "Get directions",
        industry: "hospitality",
      },
    );

    expect(exact.conversion.quickAnswers.ctaTarget).toBe("#location");
    expect(exact.conversion.exitOffer.ctaTarget).toBe("#location");
    expect(exact.copy.contactHeading).toBe("Contact Harbor Bakery");
    expect(broad.conversion.quickAnswers.ctaTarget).toBe("#contact");
  });
});
