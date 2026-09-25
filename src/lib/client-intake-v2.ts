export type ServiceRadius = 10 | 20 | 30 | 50 | "50+";

export type NormalizedClientIntake = Record<string, unknown> & {
  version: 2;
  legacy: boolean;
  submissionId: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  services: string[];
  confirmedServices: string[];
  primaryCity: string;
  serviceRadius: ServiceRadius | null;
  coverageAreas: string[];
  confirmation: { businessFactsAndAssetRights: true };
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function list(value: unknown, limit = 20) {
  const source = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  for (const item of source) {
    for (const entry of clean(item, 400).split(/\r?\n|,/u)) {
      const normalized = clean(entry, 160);
      if (normalized && !result.some((existing) => existing.toLowerCase() === normalized.toLowerCase()))
        result.push(normalized);
    }
  }
  return result.slice(0, limit);
}

function affirmative(value: unknown) {
  return value === true || ["yes", "on", "true"].includes(clean(value, 10).toLowerCase());
}

export function normalizeClientIntake(raw: Record<string, unknown>): NormalizedClientIntake {
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

  const services = list(raw.services, legacy ? 40 : 6);
  if (!services.length) throw new Error("Confirm at least one service you offer.");
  if (!legacy && services.length > 5)
    throw new Error("Choose up to five core services.");

  let primaryCity = "";
  let serviceRadius: ServiceRadius | null = null;
  let coverageAreas: string[];
  if (legacy) {
    coverageAreas = list(raw.coverageAreas || raw.serviceAreas, 20);
    primaryCity = clean(raw.primaryCity, 160) || coverageAreas[0] || "";
    const legacyRadius = clean(raw.serviceRadius, 4);
    if (["10", "20", "30", "50"].includes(legacyRadius))
      serviceRadius = Number(legacyRadius) as ServiceRadius;
    else if (legacyRadius === "50+") serviceRadius = "50+";
  } else {
    primaryCity = clean(raw.primaryCity || raw.serviceAreas, 160);
    const radius = clean(raw.serviceRadius, 4);
    if (["10", "20", "30", "50"].includes(radius))
      serviceRadius = Number(radius) as ServiceRadius;
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

  return {
    ...raw,
    version: 2,
    legacy,
    submissionId,
    businessName,
    contactName,
    email,
    phone,
    address,
    services,
    confirmedServices: services,
    primaryCity,
    serviceRadius,
    coverageAreas,
    serviceAreas: legacy ? coverageAreas.join("\n") : primaryCity,
    confirmation: { businessFactsAndAssetRights: true },
  };
}
