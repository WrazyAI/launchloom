import { describe, expect, it } from "vitest";
import { normalizeClientIntake } from "../src/lib/client-intake-v2";

const required = {
  submissionId: "submission-1234567890",
  businessName: "Harbor Plumbing",
  contactName: "Sam Owner",
  email: "sam@example.test",
  phone: "555-0100",
  address: "1 Main Street, Tacoma, WA",
};

describe("ClientIntakeV2 normalization", () => {
  it("normalizes v2 services, city, radius, and single confirmation", () => {
    expect(
      normalizeClientIntake({
        ...required,
        intakeVersion: "2",
        services: "Drain cleaning\nWater heater repair",
        industry: "home-services",
        serviceAreas: "Tacoma, WA",
        serviceRadius: "30",
        differentiators: "Clear communication",
        primaryCta: "Request a quote",
        confirmAccuracy: "yes",
      }),
    ).toMatchObject({
      version: 2,
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Tacoma, WA",
      serviceRadius: 30,
      coverageAreas: ["Tacoma, WA"],
      confirmation: { businessFactsAndAssetRights: true },
      businessName: "Harbor Plumbing",
    });
  });

  it("preserves legacy compatibility when legacy consent fields are all affirmed", () => {
    expect(
      normalizeClientIntake({
        ...required,
        services: "Drain cleaning\nWater heater repair",
        serviceAreas: "Tacoma\nLakewood",
        confirmAccuracy: "yes",
        confirmRights: "yes",
        confirmSeoResearch: "yes",
      }),
    ).toMatchObject({
      legacy: true,
      services: ["Drain cleaning", "Water heater repair"],
      coverageAreas: ["Tacoma", "Lakewood"],
    });
  });

  it("requires a single affirmative confirmation for the v2 client contract", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "20",
      confirmAccuracy: "no",
    })).toThrow(/confirm/iu);
  });

  it("rejects more than five client-selected services", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "A\nB\nC\nD\nE\nF",
      industry: "home-services",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "20",
      confirmAccuracy: "yes",
    })).toThrow(/up to five/u);
  });

  it("never treats unselected service suggestions as client-confirmed services", () => {
    const normalized = normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      suggestedServices: ["Drain cleaning", "Septic pumping"],
      industry: "home-services",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "20",
      confirmAccuracy: "yes",
    });

    expect(normalized.services).toEqual(["Drain cleaning"]);
    expect(normalized.confirmedServices).toEqual(["Drain cleaning"]);
  });

  it("rejects a v2 intake without a primary city and valid radius", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      serviceAreas: "",
      serviceRadius: "0",
      confirmAccuracy: "yes",
    })).toThrow(/city and a supported travel radius/u);
  });
});
