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
});
