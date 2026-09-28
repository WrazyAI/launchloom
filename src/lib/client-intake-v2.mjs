/** @typedef {10 | 20 | 30 | 50 | "50+"} ServiceRadius */

/**
 * String controls serialized by the current three-step online intake form.
 * File controls are uploaded separately and represented by `assets` URLs.
 */
export const CLIENT_INTAKE_V2_FORM_FIELDS = Object.freeze([
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
]);

export const CLIENT_INTAKE_V2_FILE_FIELDS = Object.freeze([
  "logo",
  "photoOne",
  "photoTwo",
  "photoThree",
  "teamPhoto",
]);

/** Complete JSON request shape after form files have been uploaded. */
export const CLIENT_INTAKE_V2_SUBMISSION_FIELDS = Object.freeze([
  ...CLIENT_INTAKE_V2_FORM_FIELDS,
  "intakeVersion",
  "assets",
]);

/** Business-truth fields allowed into the internal intake issue. */
export const CLIENT_INTAKE_V2_ISSUE_FIELDS = Object.freeze([
  "intakeVersion",
  "version",
  "legacy",
  "submissionId",
  "businessName",
  "contactName",
  "email",
  "phone",
  "address",
  "website",
  "domain",
  "desiredDomain",
  "industry",
  "services",
  "confirmedServices",
  "serviceAreas",
  "primaryCity",
  "serviceRadius",
  "coverageAreas",
  "differentiators",
  "primaryCta",
  "brandNotes",
  "brandColor",
  "primaryColor",
  "leadEmail",
  "assets",
  "placeId",
  "googleMapsUrl",
  "gmbSkipped",
  "confirmAccuracy",
  "confirmRights",
  "confirmSeoResearch",
  "confirmation",
]);

function clean(value, max = 1000) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

/**
 * Builds the same post-upload JSON payload sent by OnboardingForm. Callers
 * provide the form's string fields plus the invitation metadata and upload URLs.
 * @param {Record<string, unknown>} formFields
 * @param {{ submissionId: string, inviteToken: string, assets?: Record<string, string> }} metadata
 */
export function createClientIntakeV2Submission(formFields, metadata) {
  const fields = Object.fromEntries(
    CLIENT_INTAKE_V2_FORM_FIELDS.map((name) => [
      name,
      typeof formFields[name] === "string" ? formFields[name] : "",
    ]),
  );
  return {
    ...fields,
    submissionId: clean(metadata.submissionId, 100),
    intakeVersion: "2",
    inviteToken: clean(metadata.inviteToken, 20_000),
    assets: metadata.assets && typeof metadata.assets === "object"
      ? { ...metadata.assets }
      : {},
  };
}

function list(value, limit = 20, splitCommas = false) {
  const source = Array.isArray(value) ? value : [value];
  const result = [];
  for (const item of source) {
    const delimiter = splitCommas && !Array.isArray(value) ? /\r?\n|,/u : /\r?\n/u;
    for (const entry of clean(item, 400).split(delimiter)) {
      const normalized = clean(entry, 160);
      if (normalized && !result.some((existing) => existing.toLowerCase() === normalized.toLowerCase()))
        result.push(normalized);
    }
  }
  return result.slice(0, limit);
}

function affirmative(value) {
  return value === true || ["yes", "on", "true"].includes(clean(value, 10).toLowerCase());
}

/** @param {Record<string, unknown>} raw */
export function normalizeClientIntake(raw) {
  const legacy = clean(raw.intakeVersion, 10) !== "2";
  const submissionId = clean(raw.submissionId, 100);
  const businessName = clean(raw.businessName, 120);
  const contactName = clean(raw.contactName, 120);
  const email = clean(raw.email, 240).toLowerCase();
  const phone = clean(raw.phone, 80);
  const address = clean(raw.address, 300);
  if (!/^[a-z0-9-]{12,100}$/iu.test(submissionId))
    throw new Error("A valid submission reference is required.");
  if (!businessName || !contactName || !email || !phone || !address)
    throw new Error("Complete the required business details before submitting.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new Error("Enter a valid preview email.");

  const services = list(raw.services, legacy ? 40 : 6, legacy);
  if (!services.length) throw new Error("Confirm at least one service you offer.");
  if (!legacy && services.length > 5)
    throw new Error("Choose up to five core services.");

  let primaryCity = "";
  let serviceRadius = null;
  let coverageAreas;
  if (legacy) {
    coverageAreas = list(raw.coverageAreas || raw.serviceAreas, 20);
    primaryCity = clean(raw.primaryCity, 160) || coverageAreas[0] || "";
    const legacyRadius = clean(raw.serviceRadius, 4);
    if (["10", "20", "30", "50"].includes(legacyRadius))
      serviceRadius = Number(legacyRadius);
    else if (legacyRadius === "50+") serviceRadius = "50+";
  } else {
    primaryCity = clean(raw.primaryCity || raw.serviceAreas, 160);
    const radius = clean(raw.serviceRadius, 4);
    if (["10", "20", "30", "50"].includes(radius))
      serviceRadius = Number(radius);
    else if (radius === "50+") serviceRadius = "50+";
    if (!primaryCity || serviceRadius === null)
      throw new Error("Provide a main service city and a supported travel radius.");
    if (!clean(raw.industry, 80)) throw new Error("Choose the closest business category.");
    if (!affirmative(raw.confirmAccuracy))
      throw new Error("Confirm the business details and files before submitting.");
    coverageAreas = [primaryCity];
  }

  const legacyConfirmed =
    affirmative(raw.confirmAccuracy) &&
    affirmative(raw.confirmRights) &&
    affirmative(raw.confirmSeoResearch);
  if (legacy && !legacyConfirmed)
    throw new Error("Confirm the submitted business details before submitting.");

  const leadEmail = clean(raw.leadEmail, 240).toLowerCase();
  if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(leadEmail))
    throw new Error("Enter a valid lead notification email.");
  const normalizedHex = (value) => {
    const color = clean(value, 1000);
    return /^#[0-9a-f]{6}$/iu.test(color) ? color : "";
  };

  return {
    ...raw,
    intakeVersion: legacy ? clean(raw.intakeVersion, 10) : "2",
    version: 2,
    legacy,
    submissionId,
    businessName,
    contactName,
    email,
    phone,
    address,
    website: clean(raw.website, 500),
    domain: clean(raw.domain, 253),
    desiredDomain: clean(raw.desiredDomain, 253),
    industry: clean(raw.industry, 80),
    differentiators: clean(raw.differentiators, 2000),
    primaryCta: clean(raw.primaryCta, 80),
    brandNotes: clean(raw.brandNotes, 2000),
    brandColor: normalizedHex(raw.brandColor),
    primaryColor: normalizedHex(raw.primaryColor),
    leadEmail,
    placeId: clean(raw.placeId, 200),
    googleMapsUrl: clean(raw.googleMapsUrl, 1000),
    gmbSkipped: affirmative(raw.gmbSkipped) ? "yes" : "",
    confirmAccuracy: affirmative(raw.confirmAccuracy) ? "yes" : "",
    confirmRights: affirmative(raw.confirmRights) ? "yes" : "",
    confirmSeoResearch: affirmative(raw.confirmSeoResearch) ? "yes" : "",
    services,
    confirmedServices: services,
    primaryCity,
    serviceRadius,
    coverageAreas,
    serviceAreas: legacy ? coverageAreas.join("\n") : primaryCity,
    confirmation: { businessFactsAndAssetRights: true },
  };
}
