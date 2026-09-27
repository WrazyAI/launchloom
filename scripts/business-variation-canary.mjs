import fs from "node:fs";
import path from "node:path";
import { buildInspirationPack } from "./inspiration-registry.mjs";
import { loadReferenceDossier } from "./reference-dossier.mjs";

export const BUSINESS_VARIATION_SCENARIOS = Object.freeze({
  hvac: Object.freeze({
    industry: "hvac",
    nicheId: "hvac-contractors",
    styleTerms: [
      "plain-language diagnosis",
      "symptom-first service routing",
      "seasonal heating and cooling",
    ],
    business: {
      name: "Boreal Heating & Cooling",
      tagline: "Comfort starts with a clear diagnosis.",
      description:
        "A hypothetical heating and cooling service serving Minneapolis and St. Paul.",
      phone: "(612) 555-0148",
      email: "hello@boreal-climate.example",
      address: "",
      serviceAreas: ["Minneapolis", "St. Paul", "Roseville"],
      hours: "By appointment",
      primaryCta: "Request a service assessment",
      offer: "",
      domain: "boreal-climate.example",
      leadEmail: "hello@boreal-climate.example",
    },
    services: [
      {
        name: "Furnace diagnostics and repair",
        slug: "furnace-repair",
        description:
          "Describe the heating issue and get a clear explanation of the next diagnostic step.",
      },
      {
        name: "Air conditioning repair",
        slug: "air-conditioning-repair",
        description:
          "Share what the system is doing so the visit can focus on the reported cooling problem.",
      },
      {
        name: "Heat pump service",
        slug: "heat-pump-service",
        description:
          "Discuss heating or cooling symptoms and the equipment before work is planned.",
      },
    ],
    differentiators: [
      "Start with the symptom, not a guessed repair",
      "Understand options before deciding on work",
      "Service-area guidance for the Twin Cities",
    ],
    style: {
      tone: "direct and technically clear",
      visualDirection:
        "service-led utility with a symptom-first opening, clear diagnostic choices, and concise technical labels",
    },
    copy: {
      heroKicker: "Heating and cooling service in Minneapolis and St. Paul",
      heroHeading: "Start with what the system is doing.",
      heroBody:
        "Tell us what changed. The first step is a clear service conversation, not a guessed repair.",
      servicesHeading: "Choose the system that needs attention",
      contactHeading: "Describe the issue",
    },
    conversion: {
      faqs: [
        {
          question: "What should I share before a service visit?",
          answer:
            "Share the system type, what changed, and when the issue appears. You do not need to diagnose the cause.",
        },
        {
          question: "Will I know the options before work begins?",
          answer:
            "The visit begins with diagnosis and a discussion of the available next steps before you decide how to proceed.",
        },
        {
          question: "Do you work on heat pumps?",
          answer:
            "Heat pump service is one of the listed service paths. Include the equipment type and reported symptoms in your request.",
        },
      ],
      process: [
        "Describe the symptom",
        "Review the diagnostic findings",
        "Choose the next step",
      ],
      quickAnswers: { enabled: false },
    },
    seoResearch: {
      evidenceStatus: "hypothetical-canary-input-not-verified-research",
      targetKeywords: [
        "furnace repair St. Paul",
        "air conditioning repair Minneapolis",
        "heat pump service Twin Cities",
      ],
      copyVocabulary: ["system symptoms", "diagnostic visit", "repair options"],
      customerQuestions: [
        "What changed with the heating or cooling system?",
        "What happens during an HVAC diagnostic visit?",
        "Do you service heat pumps in the Twin Cities?",
      ],
    },
  }),
  "auto-repair": Object.freeze({
    industry: "auto-repair",
    nicheId: "auto-repair-shops",
    styleTerms: [
      "diagnostic transparency",
      "repair-path clarity",
      "workshop-forward craftsmanship",
    ],
    business: {
      name: "Juniper Motor & Garage",
      tagline: "Know what needs attention before work begins.",
      description:
        "A hypothetical independent auto repair shop serving Denver and nearby neighborhoods.",
      phone: "(303) 555-0148",
      email: "hello@juniper-motor.example",
      address: "",
      serviceAreas: ["Denver", "Arvada", "Lakewood"],
      hours: "By appointment",
      primaryCta: "Request a repair assessment",
      offer: "",
      domain: "juniper-motor.example",
      leadEmail: "hello@juniper-motor.example",
    },
    services: [
      {
        name: "Brake service and repair",
        slug: "brake-service-repair",
        description:
          "Describe the noise, vibration, or change in braking so the first inspection can focus on the symptom.",
      },
      {
        name: "Check-engine diagnostics",
        slug: "check-engine-diagnostics",
        description:
          "Share when the warning light appeared and how the vehicle has been behaving before a diagnostic visit.",
      },
      {
        name: "Scheduled vehicle maintenance",
        slug: "scheduled-vehicle-maintenance",
        description:
          "Review the vehicle's use and service history to identify the maintenance questions to address next.",
      },
    ],
    differentiators: [
      "Start with the reported symptom, not a guessed repair",
      "Review diagnostic findings before choosing the next step",
      "Service-area guidance for Denver and nearby communities",
    ],
    style: {
      tone: "plainspoken and technically clear",
      visualDirection:
        "independent workshop identity with diagnostic-ticket structure, technical annotations, and tactile parts imagery; avoid the conventional full-bleed mechanic hero",
    },
    copy: {
      heroKicker: "Independent auto repair in Denver",
      heroHeading: "Know what needs attention before work begins.",
      heroBody:
        "Tell us what changed with the vehicle. The first step is a focused diagnostic conversation, not a guessed repair.",
      servicesHeading: "Start with the system or symptom",
      contactHeading: "Describe what the vehicle is doing",
    },
    conversion: {
      faqs: [
        {
          question: "What details help before a diagnostic visit?",
          answer:
            "Share the vehicle year and model, the symptom, and when it happens. You do not need to identify the cause.",
        },
        {
          question: "Will repair options be discussed before work begins?",
          answer:
            "The next step is to review what the inspection found and discuss available options before deciding how to proceed.",
        },
        {
          question: "Which Denver-area communities are served?",
          answer:
            "The listed service area includes Denver, Arvada, and Lakewood. Contact the shop to confirm whether a specific address is covered.",
        },
      ],
      process: [
        "Describe the vehicle and symptom",
        "Review the inspection findings",
        "Choose the next step together",
      ],
      quickAnswers: { enabled: false },
    },
    seoResearch: {
      evidenceStatus: "hypothetical-canary-input-not-verified-research",
      targetKeywords: [
        "brake repair Denver",
        "check engine light diagnostics Denver",
        "scheduled car maintenance Denver",
      ],
      copyVocabulary: [
        "reported symptom",
        "diagnostic findings",
        "repair options",
      ],
      customerQuestions: [
        "What should I share before an auto diagnostic visit?",
        "What happens after a check-engine warning appears?",
        "How do I know which maintenance questions to ask?",
      ],
    },
  }),
  painting: Object.freeze({
    industry: "painting",
    nicheId: "painting-contractors",
    styleTerms: [
      "color-led craft",
      "surface preparation",
      "project transformation",
    ],
    business: {
      name: "Colorwork Painting Studio",
      tagline: "A good finish starts with the surface.",
      description:
        "A hypothetical residential painting contractor serving Atlanta and nearby communities.",
      phone: "(404) 555-0186",
      email: "hello@colorwork-paint.example",
      address: "",
      serviceAreas: ["Atlanta", "Decatur", "Marietta"],
      hours: "By appointment",
      primaryCta: "Request a painting estimate",
      offer: "",
      domain: "colorwork-paint.example",
      leadEmail: "hello@colorwork-paint.example",
    },
    services: [
      {
        name: "Interior painting",
        slug: "interior-painting",
        description:
          "Plan room-by-room painting around the existing surfaces, preparation needs, and finish you want to discuss.",
      },
      {
        name: "Exterior repainting",
        slug: "exterior-repainting",
        description:
          "Review the siding, trim, and exposed surfaces so preparation and coating choices can be scoped clearly.",
      },
      {
        name: "Cabinet refinishing",
        slug: "cabinet-refinishing",
        description:
          "Discuss cabinet condition, finish preferences, and the preparation steps involved before requesting an estimate.",
      },
    ],
    differentiators: [
      "Discuss preparation before selecting a finish",
      "Plan the work around rooms, surfaces, and use",
      "Confirm coverage for Atlanta and nearby communities",
    ],
    style: {
      tone: "considered, practical, and color-confident",
      visualDirection:
        "architectural painting editorial with surface studies, color fields, and deliberate finish details; avoid generic contractor split-hero and fabricated before-and-after proof",
    },
    copy: {
      heroKicker: "Residential painting in Atlanta",
      heroHeading: "A better finish starts with the surface.",
      heroBody:
        "Tell us which rooms or exterior surfaces you are planning. The first step is a clear conversation about preparation, finish, and scope.",
      servicesHeading: "Choose the surface to plan first",
      contactHeading: "Describe the rooms and surfaces",
    },
    conversion: {
      faqs: [
        {
          question: "What helps start a painting estimate?",
          answer:
            "Share the rooms or exterior surfaces, their current condition, and any finish preferences. Photos can help explain the scope.",
        },
        {
          question: "Why discuss preparation before paint color?",
          answer:
            "Surface condition and preparation affect the work plan. Discussing those first helps clarify which finish choices fit the project.",
        },
        {
          question: "Which areas are included?",
          answer:
            "The listed service area includes Atlanta, Decatur, and Marietta. Contact the studio to confirm a specific address.",
        },
      ],
      process: [
        "Share the rooms or surfaces",
        "Review preparation and finish needs",
        "Discuss estimate scope and next steps",
      ],
      quickAnswers: { enabled: false },
    },
    seoResearch: {
      evidenceStatus: "hypothetical-canary-input-not-verified-research",
      targetKeywords: [
        "interior painter Atlanta",
        "exterior house painting Atlanta",
        "cabinet refinishing Decatur GA",
      ],
      copyVocabulary: [
        "surface preparation",
        "paint finish",
        "room-by-room scope",
      ],
      customerQuestions: [
        "What should I share to start a painting estimate?",
        "How does surface preparation affect a painting project?",
        "Do you serve Atlanta, Decatur, and Marietta?",
      ],
    },
  }),
});

export function buildBusinessVariationConfig(baseConfig, scenarioId) {
  const scenario = BUSINESS_VARIATION_SCENARIOS[scenarioId];
  if (!scenario)
    throw new Error(
      `Unknown business variation scenario '${scenarioId}'. Available scenarios: ${Object.keys(BUSINESS_VARIATION_SCENARIOS).join(", ")}.`,
    );
  const config = structuredClone(baseConfig || {});
  config.business = structuredClone(scenario.business);
  config.businessKind = scenario.industry;
  config.industry = scenario.industry;
  config.services = structuredClone(scenario.services);
  config.differentiators = [...scenario.differentiators];
  config.style = structuredClone(scenario.style);
  config.copy = structuredClone(scenario.copy);
  config.conversion = structuredClone(scenario.conversion);
  config.seoResearch = structuredClone(scenario.seoResearch);
  config.locations = [];
  config.images = { hero: "", secondary: "", tertiary: "" };
  config.assets = {};
  return config;
}

export function buildBusinessVariationPack(
  repositoryRoot,
  registry,
  scenarioId,
  { seed } = {},
) {
  const scenario = BUSINESS_VARIATION_SCENARIOS[scenarioId];
  if (!scenario)
    throw new Error(
      `Unknown business variation scenario '${scenarioId}'. Available scenarios: ${Object.keys(BUSINESS_VARIATION_SCENARIOS).join(", ")}.`,
    );
  if (!String(seed || "").trim())
    throw new Error("A reproducible business variation seed is required.");

  const pack = buildInspirationPack(
    {
      seed,
      generationId: `business-variation-${scenarioId}-${seed}`,
      industry: scenario.industry,
      styleTerms: scenario.styleTerms,
      recentReferenceIds: [],
      recentRouteSignatures: [],
      recentReferenceSets: [],
    },
    registry,
    { repositoryRoot, requireDossiers: true },
  );
  const collection = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, "data/reference-library/core-collection.json"),
      "utf8",
    ),
  );
  const niche = collection.niches.find(
    (candidate) => candidate.id === scenario.nicheId,
  );
  const allowed = new Set(niche?.referenceIds || []);
  const invalidRoute = pack.routes.find((route) => {
    if (
      route.referenceIds?.length !== 1 ||
      !allowed.has(route.referenceIds[0]) ||
      !route.referenceDossier?.path ||
      !route.referenceDossier.tags?.business?.includes(scenario.industry)
    )
      return true;
    const dossier = loadReferenceDossier(route.referenceDossier.path, {
      repositoryRoot,
    });
    return !dossier.productionEligible;
  });
  if (pack.routes.length !== 3 || invalidRoute)
    throw new Error(
      `The ${scenarioId} variation canary must use three production-eligible references from its own canonical business niche.`,
    );
  return { scenario, pack };
}
