import { describe, expect, it } from "vitest";
import { evaluateDraft, normalise } from "../scripts/generate-site-config.mjs";

describe("site configuration", () => {
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
