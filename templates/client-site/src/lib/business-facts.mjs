// Shared by intake, canonical compilation, public configuration, and release checks.
// Full fact values belong only in the private canonical brief.
export function factText(value, limit = 1000) {
  const result =
    typeof value === "string" || typeof value === "number"
      ? String(value)
          .replace(/\u0000/gu, "")
          .replace(/—/gu, "-")
          .trim()
          .slice(0, limit)
      : "";
  return /^(?:unknown|not provided|n\/a)$/iu.test(result) ? "" : result;
}

export function addressVisibility(value) {
  // Existing clients without a preference retain their approved public behavior.
  if (value === undefined || value === null || value === "") return "public";
  if (value === "public" || value === "private") return value;
  throw new Error("Choose public or private address visibility.");
}

export function normalizeResearchLanguageCode(value) {
  const code = factText(value, 10).toLowerCase();
  return /^[a-z]{2,3}$/u.test(code) ? code : "en";
}

const list = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(/\r?\n/u))
    .map((item) => factText(item, 240))
    .filter(Boolean);
const definitions = [
  ["businessName", true, true, ["all-pages", "schema"]],
  ["phone", true, true, ["contact", "schema"]],
  ["email", true, true, ["contact", "review-delivery"]],
  ["leadEmail", true, false, ["lead-delivery"]],
  ["address", false, true, ["contact", "schema", "map"]],
  ["primaryCity", false, true, ["coverage", "research"]],
  ["primaryCta", false, true, ["conversion"]],
  ["domain", false, true, ["canonical-origin"]],
  ["hours", false, true, ["contact"]],
  ["yearEstablished", false, true, ["trust"]],
  ["credentials", false, true, ["trust"]],
  ["offer", false, true, ["conversion"]],
];

export function compileFactBrief(intake = {}) {
  const visibility = addressVisibility(intake.addressVisibility);
  const facts = definitions.map(([key, required, display, requirements]) => {
    const value = factText(
      key === "leadEmail" ? intake.leadEmail || intake.email : intake[key],
    );
    return {
      key,
      value,
      state: value
        ? "confirmed"
        : required
          ? "launch-blocking"
          : "missing-deferrable",
      source: value ? "client_supplied" : "unavailable",
      // Confirmation records client testimony, not independent credential verification.
      publicDisplay: Boolean(
        display && (key !== "address" || visibility === "public"),
      ),
      requirements,
      reason: value
        ? ""
        : required
          ? `Confirm ${key} before publication.`
          : `${key} can be omitted until supplied.`,
    };
  });
  const services = list(intake.confirmedServices || intake.services);
  const excluded = new Set(
    list(intake.excludedServices).map((value) => value.toLowerCase()),
  );
  const conflict = services.some((value) => excluded.has(value.toLowerCase()));
  facts.push({
    key: "services",
    value: services,
    source: services.length ? "client_supplied" : "unavailable",
    state: conflict
      ? "contradictory"
      : services.length
        ? "confirmed"
        : "launch-blocking",
    publicDisplay: true,
    requirements: ["service-pages", "research"],
    reason: conflict
      ? "A service is listed as both offered and excluded. Confirm the service list."
      : services.length
        ? ""
        : "Confirm at least one service before publication.",
  });
  if (
    visibility === "private" &&
    factText(intake.primaryCta).toLowerCase() === "get directions"
  ) {
    const action = facts.find((fact) => fact.key === "primaryCta");
    action.state = "contradictory";
    action.reason =
      "Directions were requested for a private location. Confirm a public destination or a different action.";
  }
  return {
    version: 1,
    addressVisibility: visibility,
    launchReady: !facts.some((fact) =>
      ["contradictory", "launch-blocking"].includes(fact.state),
    ),
    facts,
  };
}

export function factReadinessSummary(brief) {
  return {
    version: 1,
    launchReady: brief.launchReady,
    addressVisibility: brief.addressVisibility,
    // No values or alternative claims are sent to the public review UI.
    facts: brief.facts.map(
      ({ key, state, source, publicDisplay, requirements, reason }) => ({
        key,
        state,
        source,
        publicDisplay,
        requirements,
        reason,
      }),
    ),
  };
}

export function businessFactReadiness(config) {
  const report = config?.factReadiness;
  if (report === undefined) return { allowed: true };
  const states = new Set([
    "confirmed",
    "missing-deferrable",
    "contradictory",
    "launch-blocking",
  ]);
  const required = new Set(
    definitions
      .filter(([, required]) => required)
      .map(([key]) => key)
      .concat("services"),
  );
  const expected = new Set(definitions.map(([key]) => key).concat("services"));
  if (
    (!config.business ||
      (factText(config.business.name) &&
        factText(config.business.phone) &&
        factText(config.business.email) &&
        factText(config.business.leadEmail || config.business.email) &&
        addressVisibility(config.business.addressVisibility) ===
          report?.addressVisibility)) &&
    (config.services === undefined ||
      (Array.isArray(config.services) &&
        config.services.length > 0 &&
        config.services.every((service) => factText(service?.name)))) &&
    report?.version === 1 &&
    report.launchReady === true &&
    ["public", "private"].includes(report.addressVisibility) &&
    Array.isArray(report.facts) &&
    report.facts.length === expected.size &&
    new Set(report.facts.map((fact) => fact?.key)).size === expected.size &&
    report.facts.every(
      (fact) =>
        expected.has(fact?.key) &&
        states.has(fact.state) &&
        typeof fact.source === "string" &&
        typeof fact.publicDisplay === "boolean" &&
        Array.isArray(fact.requirements) &&
        typeof fact.reason === "string" &&
        (!required.has(fact.key) || fact.state === "confirmed") &&
        !["contradictory", "launch-blocking"].includes(fact.state),
    )
  )
    return { allowed: true };
  return {
    allowed: false,
    code: "business_facts_required",
    error:
      "Business facts need confirmation. Review the missing or contradictory facts before publishing.",
  };
}

export function redactPrivateLocation(value, intake = {}) {
  if (
    addressVisibility(
      intake.addressVisibility || intake.factBrief?.addressVisibility,
    ) !== "private"
  )
    return value;
  const tokens = [
    intake.address,
    intake.placeId,
    intake.googleMapsUrl,
    intake.businessTruth?.address,
    intake.businessTruth?.placeId,
    intake.businessTruth?.googleMapsUrl,
    intake.factBrief?.facts?.find((fact) => fact.key === "address")?.value,
  ].filter((token) => typeof token === "string" && token.trim());
  const encoded = [
    ...new Set(
      tokens.flatMap((token) => [
        token,
        encodeURIComponent(token),
        encodeURIComponent(token).replace(/%20/gu, "+"),
      ]),
    ),
  ];
  const redact = (item) => {
    if (typeof item === "string") {
      for (const token of encoded)
        item = item.replace(
          new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"),
          "",
        );
      return item;
    }
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, redact(entry)]),
      );
    return item;
  };
  return redact(value);
}

export function publicGenerationIntake(intake = {}) {
  const previous = intake.factBrief || intake.factReadiness;
  const visibility = [
    intake.addressVisibility,
    previous?.addressVisibility,
  ].includes("private")
    ? "private"
    : addressVisibility(intake.addressVisibility);
  const full = compileFactBrief({ ...intake, addressVisibility: visibility });
  // Projections can change a directions CTA for preview safety. They must never
  // erase its original blocker. Resolving it requires a fresh canonical brief.
  for (const prior of previous?.facts || []) {
    if (["contradictory", "launch-blocking"].includes(prior.state)) {
      const current = full.facts.find((fact) => fact.key === prior.key);
      if (
        current &&
        !["contradictory", "launch-blocking"].includes(current.state)
      ) {
        current.state = prior.state;
        current.reason = prior.reason;
      }
    }
  }
  full.launchReady = !full.facts.some((fact) =>
    ["contradictory", "launch-blocking"].includes(fact.state),
  );
  const { businessTruth, factBrief, ...publicFields } = intake;
  const privateLocation = full.addressVisibility === "private";
  const result = {
    ...publicFields,
    factReadiness: factReadinessSummary(full),
    addressVisibility: full.addressVisibility,
  };
  for (const key of [
    "businessName",
    "phone",
    "email",
    "leadEmail",
    "address",
    "hours",
    "yearEstablished",
    "credentials",
    "offer",
  ])
    if (key in result) result[key] = factText(result[key]);
  if (privateLocation) {
    result.address = "";
    result.placeId = "";
    result.googleMapsUrl = "";
    if (factText(result.primaryCta).toLowerCase() === "get directions")
      result.primaryCta = "Contact us";
  }
  return redactPrivateLocation(result, {
    ...intake,
    addressVisibility: visibility,
  });
}

export function publicBusiness(business = {}) {
  const visibility = addressVisibility(business.addressVisibility);
  return {
    ...business,
    addressVisibility: visibility,
    address: visibility === "private" ? "" : factText(business.address),
    ...(visibility === "private" ? { placeId: "", googleMapsUrl: "" } : {}),
  };
}
