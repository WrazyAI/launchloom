import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLIENT_INTAKE_FILE_FIELDS,
  CLIENT_INTAKE_FORM_FIELDS,
  CLIENT_INTAKE_ISSUE_FIELDS,
  createClientIntakeSubmission,
} from "../src/lib/client-intake-contract.mjs";

const formSource = readFileSync(
  new URL("../src/components/OnboardingForm.tsx", import.meta.url),
  "utf8",
);

describe("shared client intake contract", () => {
  it("serializes every online string field and excludes file controls and unknown fields", () => {
    const visibleNames = new Set(
      [...formSource.matchAll(/name="([^"]+)"/gu)].map((match) => match[1]),
    );
    const fileNames = [
      "logo",
      "photoOne",
      "photoTwo",
      "photoThree",
      "teamPhoto",
    ];
    const expectedStringNames = [...visibleNames].filter(
      (name) => !fileNames.includes(name),
    );
    expect([...CLIENT_INTAKE_FORM_FIELDS].sort()).toEqual(
      expectedStringNames.sort(),
    );
    expect([...CLIENT_INTAKE_FILE_FIELDS].sort()).toEqual(fileNames.sort());

    const payload = createClientIntakeSubmission(
      {
        businessName: "\u0000 Rainline Plumbing ",
        services: "Drain cleaning\nWater heater repair",
        confirmAccuracy: "yes",
        turnstileToken: "private-token",
        inviteToken: "future-signed-invite",
      },
      {
        submissionId: "submission-rainline-plumbing-local-2026",
        assets: { photoOne: "https://assets.example.test/hero.webp" },
      },
    );

    expect(Object.keys(payload).sort()).toEqual(
      [...CLIENT_INTAKE_ISSUE_FIELDS].sort(),
    );
    expect(payload).toMatchObject({
      submissionId: "submission-rainline-plumbing-local-2026",
      businessName: "Rainline Plumbing",
      services: "Drain cleaning\nWater heater repair",
      confirmAccuracy: "yes",
      assets: { photoOne: "https://assets.example.test/hero.webp" },
    });
    expect(payload).not.toHaveProperty("turnstileToken");
    expect(payload).not.toHaveProperty("inviteToken");
    expect(payload).not.toHaveProperty("logo");
  });

  it("drops non-string fields and bounds submission metadata before the Worker stores it", () => {
    const payload = createClientIntakeSubmission(
      { businessName: 99, services: ["Drain cleaning"] },
      { submissionId: "bad id", assets: { photoOne: "ok", unknown: "drop" } },
    );

    expect(payload.businessName).toBe("");
    expect(payload.services).toBe("");
    expect(payload.submissionId).toBe("bad-id");
    expect(payload.assets).toEqual({ photoOne: "ok" });
  });
});
