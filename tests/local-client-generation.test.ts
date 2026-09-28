import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareLocalClientGeneration } from "../scripts/local-client-generation.mjs";

const rainlineIntake = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/local-client-intakes/rainline-plumbing.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("local client generation", () => {
  it("normalizes the current form payload through production site configuration without enabling publication", () => {
    const result = prepareLocalClientGeneration(rainlineIntake);

    expect(result.payload).toMatchObject({
      submissionId: "submission-rainline-plumbing-local-2026",
      businessName: "Rainline Plumbing",
      services: "Drain cleaning\nWater heater repair\nLeak repair",
    });
    expect(result.config).toMatchObject({
      preset: "home-services",
      business: {
        name: "Rainline Plumbing",
        serviceAreas: ["Eugene"],
        primaryCta: "Request a plumbing visit",
        tagline: "Drain cleaning in Eugene",
        hours: "",
      },
      services: [
        { name: "Drain cleaning" },
        { name: "Water heater repair" },
        { name: "Leak repair" },
      ],
      seoResearch: { mode: "context-only", publishReady: false },
    });
    expect(JSON.stringify(result)).not.toContain("turnstileToken");
    expect(JSON.stringify(result)).not.toContain("inviteToken");
    expect(result.publishReady).toBe(false);
  });

  it("rejects incomplete current-form submissions before producing a review config", () => {
    expect(() =>
      prepareLocalClientGeneration({ ...rainlineIntake, businessName: "" }),
    ).toThrow(/business name/u);
  });
});
