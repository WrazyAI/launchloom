import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLIENT_INTAKE_V2_SUBMISSION_FIELDS,
  createClientIntakeV2Submission,
} from "../src/lib/client-intake-v2.mjs";
import { prepareLocalClientIntake } from "../scripts/local-client-generation.mjs";

const rainlineFormPayload = JSON.parse(
  readFileSync(new URL("../fixtures/local-client-intakes/rainline-plumbing.json", import.meta.url), "utf8"),
);

const formSubmission = createClientIntakeV2Submission(
  {
    businessName: "Rainline Plumbing",
    contactName: "Casey Morgan",
    email: "casey@example.test",
    phone: "(541) 555-0142",
    address: "123 Example Street, Eugene, OR 97401",
    services: "Drain cleaning\nWater heater repair\nLeak repair",
    industry: "home-services",
    serviceAreas: "Eugene, OR",
    serviceRadius: "20",
    differentiators: "Clear arrival updates and careful work areas",
    primaryCta: "Request a plumbing visit",
    brandNotes: "Friendly, direct, and easy to scan.",
    brandColor: "#235d57",
    leadEmail: "leads@example.test",
    confirmAccuracy: "yes",
    confirmRights: "yes",
    confirmSeoResearch: "yes",
    gmbSkipped: "yes",
  },
  {
    submissionId: "submission-rainline-plumbing-local-2026",
    inviteToken: "signed.invite.token.must-not-be-kept",
  },
);

describe("local client generation input", () => {
  it("keeps the checked-in example intake on the exact online submission field set", () => {
    expect(Object.keys(rainlineFormPayload).sort()).toEqual(
      [...CLIENT_INTAKE_V2_SUBMISSION_FIELDS].sort(),
    );
    expect(prepareLocalClientIntake(rainlineFormPayload).intake).toMatchObject({
      businessName: "Rainline Plumbing",
      services: ["Emergency plumbing", "Drain cleaning", "Water heater repair"],
      primaryCity: "Eugene, OR",
      serviceRadius: 20,
    });
  });

  it("runs the form-shaped V2 request through the shared normalizer without keeping invitation credentials", () => {
    const local = prepareLocalClientIntake(formSubmission);

    expect(local.payload).toMatchObject({
      intakeVersion: "2",
      submissionId: "submission-rainline-plumbing-local-2026",
      inviteToken: "local-fixture-only",
      services: "Drain cleaning\nWater heater repair\nLeak repair",
      serviceAreas: "Eugene, OR",
      serviceRadius: "20",
      brandColor: "#235d57",
    });
    expect(local.intake).toMatchObject({
      legacy: false,
      services: ["Drain cleaning", "Water heater repair", "Leak repair"],
      confirmedServices: ["Drain cleaning", "Water heater repair", "Leak repair"],
      primaryCity: "Eugene, OR",
      serviceRadius: 20,
      coverageAreas: ["Eugene, OR"],
    });
    expect(local.fixture).toMatchObject({
      businessName: "Rainline Plumbing",
      industry: "home-services",
      primaryCity: "Eugene, OR",
      services: ["Drain cleaning", "Water heater repair", "Leak repair"],
      coverage: ["Eugene, OR"],
    });
    expect(JSON.stringify(local)).not.toContain("signed.invite.token.must-not-be-kept");
  });

  it("rejects legacy payloads so the local generator cannot silently use the old intake form", () => {
    expect(() => prepareLocalClientIntake({ ...formSubmission, intakeVersion: "1" })).toThrow(
      /intakeVersion 2/u,
    );
  });
});
