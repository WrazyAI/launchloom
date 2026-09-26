import {
  createClientIntakeV2Submission,
  normalizeClientIntake,
} from "../src/lib/client-intake-v2.mjs";

export const LOCAL_CLIENT_INTAKE_INVITE_TOKEN = "local-fixture-only";

function slug(value) {
  return String(value || "local-client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 42) || "local-client";
}

function visualKey(intake) {
  const description = [...intake.services, intake.businessName].join(" ").toLowerCase();
  if (/water damage|water removal|structural drying|restoration/u.test(description))
    return "water-restoration";
  if (/plumb|drain|water heater/u.test(description)) return "urgent-plumbing";
  if (/paint|refinish/u.test(description)) return "painting";
  if (intake.industry === "professional-services") return "professional-services";
  return "care-wellness";
}

/**
 * Accepts the post-upload request shape from OnboardingForm and creates an
 * offline-only generation record. The invitation token is always replaced so
 * a real signed link can never be copied into generated artifacts.
 *
 * @param {Record<string, unknown>} rawSubmission
 */
export function prepareLocalClientIntake(rawSubmission) {
  if (rawSubmission.intakeVersion !== "2")
    throw new Error("Local client generation requires intakeVersion 2.");

  const submissionId = String(rawSubmission.submissionId || crypto.randomUUID());
  const payload = createClientIntakeV2Submission(rawSubmission, {
    submissionId,
    inviteToken: LOCAL_CLIENT_INTAKE_INVITE_TOKEN,
    assets: rawSubmission.assets && typeof rawSubmission.assets === "object"
      ? rawSubmission.assets
      : {},
  });
  const intake = normalizeClientIntake(payload);
  const city = intake.primaryCity;
  const leadService = intake.services[0];

  return {
    payload,
    intake,
    fixture: {
      key: `local-${slug(intake.businessName)}`,
      visualKey: visualKey(intake),
      businessName: intake.businessName,
      industry: intake.industry,
      address: intake.address,
      primaryCity: city,
      services: intake.services,
      differentiators: intake.differentiators ? [intake.differentiators] : [],
      primaryCta: intake.primaryCta,
      radius: String(intake.serviceRadius),
      // Offline mode has no geocoder. Keep only the client-confirmed city.
      coverage: [city],
      promise: `${leadService} in ${city}`,
      description: `Ask about ${leadService.toLowerCase()} in ${city} and choose a next step.`,
      brandColor: intake.brandColor,
      localFormIntake: true,
    },
  };
}
