import { describe, expect, it } from "vitest";
import { normalise } from "../scripts/generate-site-config.mjs";

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
  });
});
