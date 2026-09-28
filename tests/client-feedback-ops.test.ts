import { describe, expect, it } from "vitest";
import { applyBoundedClientFeedback } from "../scripts/client-feedback-ops.mjs";

const baseConfig = () => ({
  business: { name: "Harbor Plumbing", phone: "555-0100", email: "hello@example.test", leadEmail: "leads@example.test", address: "1 Main Street" },
  style: { primaryColor: "#205d51", contrastColor: "#ffffff" },
  design: { recipe: "local-trades", treatment: { typography: "strong", density: "balanced" } },
  assets: {
    logo: undefined as string | undefined,
    photoOne: "https://assets.launchloom.wrazyos.com/old/photo.png",
    photoTwo: undefined as string | undefined,
    photoThree: undefined as string | undefined,
  },
  images: { hero: "old-hero", secondary: "old-secondary", tertiary: "old-tertiary" },
  copy: { heroHeading: "Drain help without the guesswork", heroBody: undefined as string | undefined },
  services: [{ name: "Drain cleaning", slug: "drain-cleaning", description: "Clear blocked drains." }],
  conversion: { process: ["Tell us what is happening."], faqs: [{ question: "When should I call?", answer: "Call when a drain stays blocked." }] },
  differentiators: ["Clear communication"],
});

describe("bounded client feedback", () => {
  it("replaces a logo or business photo only from a server-hosted signed upload URL", () => {
    const config = baseConfig();
    const result = applyBoundedClientFeedback(config, [
      "[Logo] Replacement asset: https://assets.launchloom.wrazyos.com/client-replacements/harbor/12/a1/logo.png\n\nPlease use this logo.",
      "[Business photos] Replacement asset: https://assets.launchloom.wrazyos.com/client-replacements/harbor/12/a2/team.webp\n\nPlease use the team photo.",
    ]);
    expect(result.ok).toBe(true);
    expect(result.operations.map((operation) => operation.kind)).toEqual(["replace_asset", "replace_asset"]);
    expect(result.config.assets.logo).toContain("/client-replacements/");
    expect(result.config.assets.photoOne).toContain("/client-replacements/");
    expect(result.config.images.hero).toBe(result.config.assets.photoOne);
    expect(result.config.assets.photoTwo).toBeUndefined();
    expect(config.assets.logo).toBeUndefined();
  });

  it("always routes an ambiguous business photo replacement to the hero slot", () => {
    const config = baseConfig();
    config.assets.photoTwo = "https://assets.launchloom.wrazyos.com/old/about.png";
    config.assets.photoThree = "https://assets.launchloom.wrazyos.com/old/gallery.png";
    config.images = { hero: "old-hero", secondary: "old-about", tertiary: "old-gallery" };
    const replacement = "https://assets.launchloom.wrazyos.com/client-replacements/harbor/12/a3/service.webp";

    const result = applyBoundedClientFeedback(config, [
      `[Business photos] Replacement asset: ${replacement}\n\nUse this updated service photo.`,
    ]);

    expect(result.operations).toEqual([expect.objectContaining({ kind: "replace_asset", slot: "photoOne", url: replacement })]);
    expect(result.config.assets).toMatchObject({ photoOne: replacement, photoTwo: config.assets.photoTwo, photoThree: config.assets.photoThree });
    expect(result.config.images).toMatchObject({ hero: replacement, secondary: "old-about", tertiary: "old-gallery" });
  });

  it("rejects arbitrary URLs, missing uploads, and unsupported layout requests", () => {
    const result = applyBoundedClientFeedback(baseConfig(), [
      "[Logo] Replacement asset: https://evil.example/logo.png\n\nUse this.",
      "[Other small change] Move the lead form above the headline.",
    ]);
    expect(result.ok).toBe(false);
    expect(result.results.every((item) => item.status === "manual")).toBe(true);
    expect(result.operations).toEqual([]);
  });

  it("updates an explicit accessible brand colour and a supported style token", () => {
    const result = applyBoundedClientFeedback(baseConfig(), [
      "[Colour] Please use #f5d547 for the brand colour.",
      "[Font or styling] Typography: soft-sans; density: spacious.",
    ]);
    expect(result.ok).toBe(true);
    expect(result.config.style).toMatchObject({ primaryColor: "#f5d547", contrastColor: "#10251f", brandTextColor: "#10251f" });
    expect(result.config.design.treatment).toMatchObject({ typography: "soft-sans", density: "spacious" });
  });

  it("replaces one exact copy fragment and sends ambiguous text to manual review", () => {
    const config = baseConfig();
    const result = applyBoundedClientFeedback(config, [
      '[Text or factual correction] Replace text "Clear blocked drains." with "Clear a blocked drain and discuss the next step."',
    ]);
    expect(result.ok).toBe(true);
    expect(result.config.services[0].description).toBe("Clear a blocked drain and discuss the next step.");

    const ambiguous = baseConfig();
    ambiguous.copy.heroBody = "Clear blocked drains.";
    const rejected = applyBoundedClientFeedback(ambiguous, [
      '[Text] Replace "Clear blocked drains." with "Clear a blocked drain."',
    ]);
    expect(rejected.ok).toBe(false);
    expect(rejected.results[0].status).toBe("manual");
  });

  it("updates contact and business facts only when the requested field is explicit", () => {
    const result = applyBoundedClientFeedback(baseConfig(), [
      "[Contact details] Phone: (555) 555-0144",
      "[Text/factual correction] Business name: Harbor & Main Plumbing",
    ]);
    expect(result.ok).toBe(true);
    expect(result.config.business).toMatchObject({ phone: "(555) 555-0144", name: "Harbor & Main Plumbing" });
    expect(result.operations.map((operation) => operation.kind)).toEqual(["update_business_fact", "update_business_fact"]);
  });
});
