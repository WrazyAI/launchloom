/** String fields rendered by the current online onboarding form. */
export const CLIENT_INTAKE_FORM_FIELDS = Object.freeze([
  "address",
  "bot-field",
  "brandNotes",
  "businessModel",
  "businessName",
  "competitorUrls",
  "confirmAccuracy",
  "confirmRights",
  "confirmSeoResearch",
  "contactName",
  "conversionAiChat",
  "customerProblems",
  "differentiators",
  "domain",
  "email",
  "excludedServices",
  "gmbSkipped",
  "googleMapsUrl",
  "imageDirection",
  "industry",
  "leadEmail",
  "offer",
  "phone",
  "placeId",
  "preset",
  "primaryColor",
  "primaryCta",
  "priorityLocations",
  "priorityService",
  "searchPhrases",
  "seoNotSure",
  "serviceAreas",
  "services",
  "socialLinks",
  "stylePreference",
  "submissionId",
  "tone",
  "website",
]);

/** File fields are uploaded separately and represented by URLs in `assets`. */
export const CLIENT_INTAKE_FILE_FIELDS = Object.freeze([
  "logo",
  "photoOne",
  "photoTwo",
  "photoThree",
  "teamPhoto",
]);

export const CLIENT_INTAKE_ISSUE_FIELDS = Object.freeze([
  ...CLIENT_INTAKE_FORM_FIELDS,
  "assets",
]);

function clean(value, max = 8_000) {
  return String(value ?? "")
    .replace(/\u0000/gu, "")
    .trim()
    .slice(0, max);
}

/**
 * Builds the JSON body sent by OnboardingForm after image uploads complete.
 * Unknown fields and file contents never cross the intake boundary.
 * @param {Record<string, unknown>} formFields
 * @param {{ submissionId: string, assets?: Record<string, string> }} metadata
 */
export function createClientIntakeSubmission(formFields, metadata) {
  const fields = Object.fromEntries(
    CLIENT_INTAKE_FORM_FIELDS.map((name) => [
      name,
      typeof formFields[name] === "string" ? clean(formFields[name]) : "",
    ]),
  );
  const assets = Object.fromEntries(
    CLIENT_INTAKE_FILE_FIELDS.flatMap((name) => {
      const value = metadata.assets?.[name];
      return typeof value === "string" && value.trim()
        ? [[name, value.trim().slice(0, 2_000)]]
        : [];
    }),
  );
  return {
    ...fields,
    submissionId: clean(metadata.submissionId, 100)
      .replace(/[^a-z0-9-]+/giu, "-")
      .replace(/^-|-$/gu, ""),
    assets,
  };
}
