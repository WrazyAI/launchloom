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
  "primaryCity",
  "coverageAreas",
  "coverageSelection",
  "differentiators",
  "primaryCta",
  "brandNotes",
  "brandColorPicker",
  "brandColor",
  "headingFont",
  "bodyFont",
  "accentColor",
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
      headingFont: "fraunces",
      bodyFont: "inter",
      accentColor: "#C86D51",
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
      headingFont: "fraunces",
      bodyFont: "inter",
      accentColor: "#C86D51",
      assets: { photoOne: "./assets/rainline-hero.svg" },
    });
    expect(payload).not.toHaveProperty("unexpectedAgentField");
    expect(normalizeClientIntake(payload)).toMatchObject({
      services: ["Drain cleaning", "Water heater repair"],
      primaryCity: "Eugene, OR",
      serviceRadius: 20,
      confirmedServices: ["Drain cleaning", "Water heater repair"],
      headingFont: "fraunces",
      bodyFont: "inter",
      accentColor: "#C86D51",
    });
  });

  it("drops unknown font ids and malformed accents from intake", () => {
    const normalized = normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      serviceAreas: "Tacoma, WA",
      serviceRadius: "10",
      confirmAccuracy: "yes",
      headingFont: "not-a-font",
      bodyFont: "inter",
      accentColor: "burgundy",
    });
    expect(normalized.headingFont).toBe("");
    expect(normalized.bodyFont).toBe("inter");
    expect(normalized.accentColor).toBe("");
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
      coverageSelection: null,
      coverageConfirmation: {
        status: "legacy_unconfirmed",
        source: "unavailable",
        primaryCity: "Tacoma, WA",
        radiusMiles: 30,
      },
      confirmation: { businessFactsAndAssetRights: true },
      businessName: "Harbor Plumbing",
    });
  });

  it("carries a confirmed coverage selection through v2 normalization", () => {
    const normalized = normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      primaryCity: "Cookeville, TN",
      serviceAreas: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: "Cookeville, TN\nAlgood, TN\nBaxter, TN",
      coverageSelection: JSON.stringify({
        status: "confirmed",
        reference: "signed-coverage-reference",
        selectedIds: ["algood-place", "baxter-place"],
      }),
      confirmAccuracy: "yes",
    });

    expect(normalized.coverageAreas).toEqual(["Cookeville, TN", "Algood, TN", "Baxter, TN"]);
    expect(normalized.primaryCity).toBe("Cookeville, TN");
    expect(normalized.coverageSelection).toEqual({
      status: "confirmed",
      reference: "signed-coverage-reference",
      selectedIds: ["algood-place", "baxter-place"],
      reason: "",
    });
    // Provider provenance is derived by the Worker from the signed reference,
    // never from the submitted labels.
    expect(normalized.coverageConfirmation).toBeNull();
  });

  it("accepts an explicitly confirmed primary-city-only fallback", () => {
    const normalized = normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      primaryCity: "Cookeville, TN",
      serviceAreas: "Cookeville, TN",
      serviceRadius: "20",
      coverageAreas: "Cookeville, TN",
      coverageSelection: JSON.stringify({
        status: "primary_city_only",
        reason: "provider_failure",
      }),
      confirmAccuracy: "yes",
    });
    expect(normalized.coverageAreas).toEqual(["Cookeville, TN"]);
    expect(normalized.coverageConfirmation).toMatchObject({
      status: "primary_city_only",
      source: "client_confirmed_primary_city_only",
      reason: "provider_failure",
      radiusMiles: 20,
    });
  });

  it("rejects a confirmed coverage selection that does not match its submitted list", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      primaryCity: "Cookeville, TN",
      serviceAreas: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: "Cookeville, TN",
      coverageSelection: JSON.stringify({
        status: "confirmed",
        reference: "signed-coverage-reference",
        selectedIds: ["algood-place"],
      }),
      confirmAccuracy: "yes",
    })).toThrow(/coverage list changed/iu);
  });

  it("rejects malformed coverage confirmations instead of silently downgrading them", () => {
    expect(() => normalizeClientIntake({
      ...required,
      intakeVersion: "2",
      services: "Drain cleaning",
      industry: "home-services",
      primaryCity: "Cookeville, TN",
      serviceAreas: "Cookeville, TN",
      serviceRadius: "10",
      coverageAreas: "Cookeville, TN",
      coverageSelection: "{broken",
      confirmAccuracy: "yes",
    })).toThrow(/confirm/iu);
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


it("rejects more than five additional cities in a new confirmed intake", () => {
  const areas = ["Cookeville, TN", ...Array.from({length: 35}, (_, i) => `Confirmed Municipality ${i}, TN`)];
  expect(() => normalizeClientIntake({ ...required, intakeVersion:"2", industry:"home-services", services:"Drain cleaning", primaryCity:"Cookeville, TN",serviceRadius:"10", coverageAreas:areas.join("\n"),coverageSelection:JSON.stringify({status:"confirmed",reference:"signed-test-reference",selectedIds:areas.slice(1).map((_,i)=>`city-${i}`)}),confirmAccuracy:"yes" })).toThrow();
});
