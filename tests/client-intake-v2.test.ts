import { describe, expect, it } from "vitest";
import {
  CLIENT_INTAKE_V2_FORM_FIELDS,
  createClientIntakeV2Submission,
  normalizeClientIntake,
} from "../src/lib/client-intake-v2.mjs";

const onlineFormStringFields = [
  "submissionId",
  "inviteToken",
  "placeId",
  "googleMapsUrl",
  "gmbSkipped",
  "bot-field",
  "businessName",
  "contactName",
  "email",
  "phone",
  "address",
  "website",
  "domain",
  "services",
  "industry",
  "serviceAreas",
  "serviceRadius",
  "differentiators",
  "primaryCta",
  "brandNotes",
  "brandColorPicker",
  "brandColor",
  "leadEmail",
  "confirmRights",
  "confirmSeoResearch",
  "confirmAccuracy",
];

const required = {
  submissionId: "submission-1234567890",
  businessName: "Harbor Plumbing",
  contactName: "Sam Owner",
  email: "sam@example.test",
  phone: "555-0100",
  address: "1 Main Street, Tacoma, WA",
};

describe("ClientIntakeV2 normalization", () => {
  it("serializes the full online form field set for the local generator", () => {
    expect([...CLIENT_INTAKE_V2_FORM_FIELDS].sort()).toEqual(
      [...onlineFormStringFields].sort(),
    );

    const formFields = Object.fromEntries(
      onlineFormStringFields.map((field) => [field, ""]),
    );
    Object.assign(formFields, {
      businessName: "Rainline Plumbing",
      contactName: "Casey Morgan",
      email: "casey@example.test",
      phone: "(541) 555-0142",
      address: "123 Example Street, Eugene, OR 97401",
      services: "Drain cleaning\nWater heater repair",
      industry: "home-services",
      serviceAreas: "Eugene, OR",
      serviceRadius: "20",
      primaryCta: "Request a plumbing visit",
      confirmAccuracy: "yes",
      brandColor: "#235d57",
      unexpectedAgentField: "must not be submitted",
    });
    const payload = createClientIntakeV2Submission(formFields, {
      submissionId: "submission-rainline-plumbing-local-2026",
      inviteToken: "local-fixture-only",
      assets: { photoOne: "./assets/rainline-hero.svg" },
    });

    expect(Object.keys(payload).sort()).toEqual(
      [...onlineFormStringFields, "intakeVersion", "assets"].sort(),
    );
    expect(payload).toMatchObject({
      intakeVersion: "2",
      submissionId: "submission-rainline-plumbing-local-2026",
      inviteToken: "local-fixture-only",
      services: "Drain cleaning\nWater heater repair",
      brandColor: "#235d57",
      assets: { photoOne: "./assets/rainline-hero.svg" },
    });
    expect(payload).not.toHaveProperty("unexpectedAgentField");
    expect(normalizeClientIntake(payload)).toMatchObject({
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Eugene, OR",
      serviceRadius: 20,
      confirmedServices: ["Drain cleaning", "Water heater repair"],
    });
  });

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

  it("preserves comma-delimited legacy service submissions", () => {
    expect(normalizeClientIntake({
      ...required,
      services: "Drain cleaning, Water heater repair",
      serviceAreas: "Tacoma, WA",
      confirmAccuracy: "yes",
      confirmRights: "yes",
      confirmSeoResearch: "yes",
    })).toMatchObject({
      legacy: true,
      services: ["Drain cleaning", "Water heater repair"],
      coverageAreas: ["Tacoma, WA"],
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

  it("preserves commas inside confirmed service names and bounds allowlisted client fields", () => {
    const normalized = normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: ["Heating, ventilation and AC"],
      industry: "home-services",
      primaryCity: "Tacoma, WA",
      serviceRadius: "20",
      confirmAccuracy: "yes",
      differentiators: "x".repeat(2200),
      brandNotes: { unexpected: "object" },
      brandColor: "#245a46extra",
      primaryColor: "#245a46",
      leadEmail: "leads@example.test",
      website: "w".repeat(700),
      gmbSkipped: ["yes"],
    });

    expect(normalized.services).toEqual(["Heating, ventilation and AC"]);
    expect(normalized.differentiators).toHaveLength(2000);
    expect(normalized.brandNotes).toBe("");
    expect(normalized.brandColor).toBe("");
    expect(normalized.primaryColor).toBe("#245a46");
    expect(normalized.leadEmail).toBe("leads@example.test");
    expect(normalized.website).toHaveLength(500);
    expect(normalized.gmbSkipped).toBe("");
  });

  it("rejects an invalid lead notification email", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: ["Drain cleaning"],
      industry: "home-services",
      primaryCity: "Tacoma, WA",
      serviceRadius: "20",
      confirmAccuracy: "yes",
      leadEmail: "not-an-email",
    })).toThrow(/valid lead notification email/u);
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
