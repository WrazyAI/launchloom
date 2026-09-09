import fs from "node:fs/promises";
import { parseModelJson } from "./model-json.mjs";

export { parseModelJson } from "./model-json.mjs";

const MODEL = "z-ai/glm-5.3-flash";

const SHARED_CREATIVE_DIRECTION =
  "Build a specific local-business decision journey. Near the opening, make clear who the business helps, what it provides, where it operates when location matters, and the next action. Give each section a distinct job; do not repeat one claim across the hero, proof, services, and About copy. Use one primary action and one useful secondary action. Prefer client assets. Mention no person in a stock image as an employee, customer, patient, or client. Treat an area served as coverage, not a physical office. Do not use em dashes.";

const RECIPE_CREATIVE_DIRECTION =
  "For home care and care businesses, write for the person and family making a trust-sensitive decision: calm editorial language, routines and concerns, a clear first conversation, practical preparation, and reassurance without medical promises. Keep home care language distinct from treatment or aesthetics language. For local trades, use direct problem-led language: identify recognizable symptoms, coverage, what the customer should prepare, and the next service step. Do not promise price, arrival time, warranty, or availability unless supplied.";

const STOCK_PACKS = {
  "home-care": {
    hero: "https://images.unsplash.com/photo-1543333995-a78aea2eee50?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1762955911431-4c44c7c3f408?auto=format&fit=crop&w=1200&q=85",
    metadata: {
      hero: {
        provider: "Unsplash",
        creator: "Dominik Lange",
        sourceUrl: "https://unsplash.com/photos/VUOiQW4OeLI",
        license: "Unsplash License",
        subject: "caregiver walking outdoors with an older adult",
      },
      secondary: {
        provider: "Unsplash",
        creator: "Age Cymru",
        sourceUrl: "https://unsplash.com/photos/bSXk1lOp8T0",
        license: "Unsplash License",
        subject: "care worker supporting older adults during an activity",
      },
    },
  },
  "garage-door": {
    hero: "https://images.unsplash.com/photo-1770756051811-1612ac8bedfa?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1571189437635-473398e910c1?auto=format&fit=crop&w=1200&q=85",
    metadata: {
      hero: {
        provider: "Unsplash",
        creator: "GoodLifeConstruction",
        sourceUrl: "https://unsplash.com/photos/3qRx6B4cT6g",
        license: "Unsplash License",
        subject: "modern residential garage doors",
      },
      secondary: {
        provider: "Unsplash",
        creator: "Vincent Wachowiak",
        sourceUrl: "https://unsplash.com/photos/11DIVFs4kKE",
        license: "Unsplash License",
        subject: "residential gray garage door",
      },
    },
  },
  wellness: {
    hero: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=85",
  },
  "home-services": {
    hero: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=85",
    secondary:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=85",
  },
  "professional-services": {
    hero: "/images/packs/professional-services-advisory-v1.png",
  },
};

const DESIGN_RECIPES = {
  "care-editorial": [
    ["opening", "hero", "care-portrait"],
    ["reassurance", "trust", "quiet"],
    ["care-options", "services", "editorial"],
    ["care-story", "about", "immersive"],
    ["care-process", "process", "guided"],
    ["family-voices", "social-proof", "editorial"],
    ["care-gallery", "gallery", "editorial"],
    ["care-questions", "faq", "editorial"],
    ["care-consultation", "contact", "consultation"],
  ],
  "local-trades": [
    ["service-opening", "hero", "trades-split"],
    ["service-proof", "trust", "bold"],
    ["repair-options", "services", "problem-led"],
    ["service-process", "process", "numbered"],
    ["customer-proof", "social-proof", "cards"],
    ["recent-work", "gallery", "work"],
    ["service-area", "coverage", "local"],
    ["service-questions", "faq", "practical"],
    ["request-service", "contact", "quote"],
  ],
  "general-editorial": [
    ["opening", "hero", "editorial"],
    ["proof", "trust", "quiet"],
    ["services", "services", "editorial"],
    ["story", "about", "immersive"],
    ["process", "process", "guided"],
    ["social-proof", "social-proof", "editorial"],
    ["questions", "faq", "editorial"],
    ["contact", "contact", "consultation"],
  ],
};

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "client-site"
  );
}

function lines(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function text(value, limit = 240) {
  return String(value || "")
    .replace(/—/g, "-")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeHex(value, fallback) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}

function readableOn(hex) {
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const luminance = channels
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}

function usefulServiceDescription(value, serviceName) {
  const candidate = text(value, 180);
  const generic =
    /tailored to your needs|personalized support|quality you can trust|when it matters|next level/i;
  if (candidate.length >= 28 && !generic.test(candidate)) return candidate;
  return `Talk through your needs for ${serviceName} and leave with a clear next step.`;
}

function processStepText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const step = value;
    return text(
      step.title ||
        step.label ||
        step.name ||
        step.step ||
        step.text ||
        step.description,
      120,
    );
  }
  return text(value, 120);
}

function industryFor(intake) {
  const selected = text(intake.industry, 80).toLowerCase();
  if (
    [
      "wellness",
      "home-services",
      "technology",
      "professional-services",
      "hospitality",
      "real-estate",
      "other",
    ].includes(selected)
  )
    return selected;
  const facts = [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
  if (
    /health|care|wellness|clinic|therapy|dental|medspa|medical|beauty/.test(
      facts,
    )
  )
    return "wellness";
  if (
    /repair|plumb|electric|roof|garage|cleaning|landscap|hvac|contractor/.test(
      facts,
    )
  )
    return "home-services";
  if (/software|technology|tech|saas|app|digital|ai |automation/.test(facts))
    return "technology";
  if (/law|legal|account|consult|financial|insurance|agency/.test(facts))
    return "professional-services";
  return "other";
}

function businessKindFor(intake, industry) {
  const facts = [
    intake.businessName,
    intake.services,
    intake.differentiators,
    intake.brandNotes,
  ]
    .join(" ")
    .toLowerCase();
  if (
    /home care|home health|caregiver|senior care|elder care|personal care|respite/.test(
      facts,
    )
  )
    return "home-care";
  if (/garage door|overhead door|door opener|torsion spring/.test(facts))
    return "garage-door";
  return industry;
}

function stockImages(kind) {
  // These are reviewed packs, not a live keyword search. If the pack does not
  // describe the business, the template intentionally renders brand art.
  const pack = STOCK_PACKS[kind] || {};
  return {
    ...(pack.hero ? { hero: pack.hero } : {}),
    ...(pack.secondary ? { secondary: pack.secondary } : {}),
  };
}

function stockAssetReport(kind, images) {
  const pack = STOCK_PACKS[kind];
  if (!pack?.metadata) return [];
  return ["hero", "secondary"]
    .filter((placement) => images[placement] && pack.metadata[placement])
    .map((placement) => ({
      asset: placement,
      placement,
      source: "stock-pack",
      ...pack.metadata[placement],
    }));
}

function decisionSupportFor(kind, serviceName) {
  if (kind === "home-care")
    return {
      scope: `Ask how ${serviceName} can support the person's current routines and preferences.`,
      nextStep:
        "Begin with a care conversation before a plan or schedule is proposed.",
      preparation:
        "Note the routines that need support, preferred timing, and who should join the conversation.",
    };
  if (kind === "garage-door")
    return {
      scope: `Describe the symptoms that led you to request ${serviceName}.`,
      nextStep:
        "Share the service address so coverage and the appropriate next step can be confirmed.",
      preparation:
        "Note whether the door is open or closed and avoid handling springs, cables, or an unstable door.",
    };
  return {
    scope: `Ask what is included in ${serviceName} for your situation.`,
    nextStep:
      "Share your goal and contact details so the team can recommend the next step.",
    preparation:
      "Bring the questions and constraints that matter to your decision.",
  };
}

function designFor(kind, industry, preset) {
  const recipe =
    kind === "home-care" || industry === "wellness"
      ? "care-editorial"
      : industry === "home-services" || preset === "home-services"
        ? "local-trades"
        : "general-editorial";
  return {
    recipe,
    sections: DESIGN_RECIPES[recipe].map(([id, type, variant]) => ({
      id,
      type,
      variant,
    })),
  };
}

function layoutFor(industry, preset) {
  if (industry === "home-services" || preset === "home-services")
    return "local-proof";
  if (industry === "technology") return "product-clarity";
  return "editorial-authority";
}

function qualificationFor(industry, kind = industry) {
  if (kind === "home-care")
    return [
      {
        name: "careNeed",
        label: "What kind of support are you exploring?",
        placeholder: "Select an option",
        options: [
          "Personal care",
          "Companionship",
          "Respite for family",
          "Not sure yet",
        ],
      },
      {
        name: "timing",
        label: "When might support be needed?",
        placeholder: "Select timing",
        options: [
          "As soon as possible",
          "Within a few weeks",
          "Planning ahead",
        ],
      },
    ];
  if (industry === "home-services")
    return [
      {
        name: "service",
        label: "What do you need help with?",
        placeholder: "Select a service",
        options: ["Repair", "Installation", "Maintenance", "Not sure yet"],
      },
      {
        name: "timing",
        label: "When do you need help?",
        placeholder: "Select timing",
        options: ["As soon as possible", "This week", "Planning ahead"],
      },
    ];
  if (industry === "wellness")
    return [
      {
        name: "interest",
        label: "What are you interested in?",
        placeholder: "Select an option",
        options: [
          "A consultation",
          "A specific treatment",
          "Advice on options",
          "Not sure yet",
        ],
      },
      {
        name: "timing",
        label: "When would you like to come in?",
        placeholder: "Select timing",
        options: ["This week", "Next week", "Just exploring"],
      },
    ];
  return [
    {
      name: "interest",
      label: "What would you like to discuss?",
      placeholder: "Select an option",
      options: [
        "A new project",
        "Improving an existing service",
        "A consultation",
        "Not sure yet",
      ],
    },
  ];
}

function conversionFeaturesFor({
  industry,
  businessKind,
  business,
  qualification,
  faqs,
  aiChatEnabled,
}) {
  const guidedHeading =
    businessKind === "home-care" || industry === "wellness"
      ? "A few quick questions"
      : industry === "home-services"
        ? "Tell us what needs attention"
        : "Find the right next step";
  const guidedIntro =
    industry === "home-services"
      ? "Choose the closest options so the team can understand your request before following up."
      : "Choose the closest options so the first conversation can focus on what matters to you.";
  return {
    guidedQualifier: {
      enabled: qualification.length > 0,
      heading: guidedHeading,
      intro: guidedIntro,
    },
    quickAnswers: {
      enabled: faqs.length > 0,
      label: "Quick answers",
      greeting: `Welcome to ${business.name}. How can we help?`,
      items: faqs.slice(0, 5),
      ctaLabel: business.primaryCta,
      ctaTarget: "#contact",
    },
    aiChat: {
      enabled: Boolean(aiChatEnabled),
      label: "AI answers",
      greeting: `Ask about ${business.name} services, coverage, or the next step.`,
      disclaimer:
        "AI-generated answers use this website's verified information and may be incomplete.",
      apiUrl: "",
      token: "",
    },
    exitOffer: {
      enabled: Boolean(business.offer),
      eyebrow: "Before you go",
      heading: business.offer || business.primaryCta,
      body: "Share what you need and the team will follow up with a useful next step.",
      ctaLabel: business.primaryCta,
      ctaTarget: "#contact",
    },
  };
}

function defaultCopy(business, industry, kind = industry) {
  if (kind === "home-care")
    return {
      heroKicker: "Care that starts with listening",
      servicesHeading: "Support for the routines that matter at home.",
      aboutKicker: "A thoughtful approach",
      aboutHeading: "Begin with the person, the family, and the day ahead.",
      aboutBody:
        "Talk through current routines, practical concerns, and the support being considered before deciding on a next step.",
      contactKicker: "Start the conversation",
      contactHeading: business.primaryCta || "Talk with the care team",
      processKicker: "Starting care",
      processHeading: "A calm path from first call to a practical plan.",
      faqKicker: "Questions from families",
      faqHeading: "Useful details to discuss before care begins.",
      formIntro:
        "Share only what you are comfortable sharing. The team will follow up to discuss next steps.",
    };
  if (kind === "garage-door")
    return {
      heroKicker: "Local garage door service",
      servicesHeading: "Start with the symptom. Find the service that fits.",
      aboutKicker: "A clearer service call",
      aboutHeading: "Describe the issue before scheduling the next step.",
      aboutBody:
        "Share what the door is doing and the property address so the team can confirm coverage and the appropriate service.",
      contactKicker: "Tell us what the door is doing",
      contactHeading: business.primaryCta || "Request garage door service",
      processKicker: "What happens next",
      processHeading: "A direct route from a door problem to a clear plan.",
      faqKicker: "Practical answers",
      faqHeading: "What to know before requesting service.",
      formIntro:
        "Include the service address and a short description of the issue so the team can confirm coverage.",
    };
  const subject =
    industry === "technology"
      ? "technology"
      : industry === "professional-services"
        ? "advice"
        : "service";
  return {
    heroKicker: "Built around your next step",
    servicesHeading: `Practical ${subject}, shaped around what you need.`,
    aboutKicker: "Why people choose us",
    aboutHeading: `A clearer, more personal way to move forward.`,
    aboutBody:
      "Share the goal, constraints, and questions behind your decision so the team can recommend a useful next step.",
    contactKicker: "Start the conversation",
    contactHeading: business.primaryCta || "Talk with our team",
    processKicker: "A clear process",
    processHeading: "Know what happens next.",
    faqKicker: "Questions, answered",
    faqHeading: "A few useful details before you reach out.",
    formIntro: "A few quick details help us point you in the right direction.",
  };
}

function defaultFaq(industry, cta, kind = industry) {
  const action = cta || "get in touch";
  if (kind === "home-care")
    return [
      {
        question: "How do we know which type of support to request?",
        answer:
          "Describe the routines that are difficult now. The team can explain which available services may fit before a plan is proposed.",
      },
      {
        question: "What should we prepare for the first conversation?",
        answer:
          "A short list of daily routines, current concerns, preferred timing, and the people involved in decisions is a useful place to start.",
      },
    ];
  if (industry === "home-services")
    return [
      {
        question: "How quickly can you help?",
        answer:
          "Tell us what is happening and your timing. We will confirm the next available step directly.",
      },
      {
        question: "Can I request help for my area?",
        answer:
          "Send your address and service needs and we will confirm coverage before scheduling.",
      },
    ];
  return [
    {
      question: "What happens after I reach out?",
      answer: `Share a few details and our team will follow up with the most useful next step.`,
    },
    {
      question: "Is there any obligation?",
      answer: `No pressure. ${action} to discuss your needs and decide whether we are a fit.`,
    },
  ];
}

const GENERIC_COPY =
  /tailored to your needs|personalized support|quality you can trust|when it matters|next level|we are here for you|your trusted partner|one[- ]stop/i;

export function evaluateDraft(config) {
  const issues = [];
  const businessName = text(config.business?.name, 100);
  const services = Array.isArray(config.services) ? config.services : [];
  const process = config.conversion?.process || [];
  const faqs = config.conversion?.faqs || [];
  const copy = config.copy || {};

  if (!businessName || /^your business$/i.test(businessName))
    issues.push(
      "The verified business name is missing or looks like a placeholder.",
    );
  if (!services.length)
    issues.push("There is no clear service offer on the site.");
  if (
    services.some(
      (service) =>
        text(service.name, 80).length < 3 ||
        text(service.description, 200).length < 45 ||
        GENERIC_COPY.test(String(service.description || "")),
    )
  )
    issues.push(
      "At least one service card lacks a specific, customer-useful outcome.",
    );
  if (
    text(copy.heroKicker, 160).length < 8 ||
    text(copy.servicesHeading, 160).length < 12
  )
    issues.push(
      "The opening message lacks a clear, specific value proposition.",
    );
  if (
    GENERIC_COPY.test(
      `${copy.heroKicker || ""} ${copy.servicesHeading || ""} ${copy.aboutHeading || ""}`,
    )
  )
    issues.push("The primary headings use generic marketing language.");
  if (text(config.business?.primaryCta, 80).length < 4)
    issues.push("The primary conversion action is unclear.");
  if (process.length < 3 || process.some((step) => text(step, 120).length < 10))
    issues.push("The visitor journey needs at least three clear next steps.");
  if (
    faqs.length < 2 ||
    faqs.some(
      (faq) =>
        text(faq.question, 160).length < 8 || text(faq.answer, 360).length < 40,
    )
  )
    issues.push("The FAQ section lacks enough useful decision support.");
  if (
    config.images?.hero &&
    !config.assets?.photoOne &&
    !Object.values(STOCK_PACKS)
      .flatMap(Object.values)
      .includes(config.images.hero)
  )
    issues.push(
      "The hero image is not from an approved contextual asset pack.",
    );

  return { score: Math.max(0, 100 - issues.length * 12), issues };
}

function fallback(intake) {
  const preset =
    intake.preset === "home-services" ? "home-services" : "wellness";
  const industry = industryFor(intake);
  const businessKind = businessKindFor(intake, industry);
  const areas = lines(intake.serviceAreas);
  const services = lines(intake.services)
    .slice(0, 8)
    .map((name) => ({
      name,
      slug: slugify(name),
      description: usefulServiceDescription("", name),
      decisionSupport: decisionSupportFor(businessKind, name),
    }));
  const businessName = intake.businessName || "Your business";
  const primaryColor = safeHex(
    intake.primaryColor,
    preset === "wellness" ? "#205d51" : "#bd552d",
  );
  return {
    preset,
    business: {
      name: businessName,
      tagline:
        preset === "wellness"
          ? "Care that makes room for you."
          : "Reliable help, right when you need it.",
      description:
        intake.differentiators ||
        `${businessName} offers thoughtful, local service.`,
      phone: intake.phone || "",
      email: intake.email || "",
      address: intake.address || "",
      serviceAreas: areas,
      hours: "Hours available on request",
      primaryCta:
        intake.primaryCta ||
        (preset === "wellness" ? "Book a consultation" : "Request service"),
      offer: intake.offer || "",
      domain: intake.domain || "",
      leadEmail: intake.leadEmail || intake.email || "",
      placeId: intake.placeId || "",
      googleMapsUrl: intake.googleMapsUrl || "",
    },
    style: {
      primaryColor,
      contrastColor: readableOn(primaryColor),
      tone: intake.tone || "confident",
    },
    services: services.length
      ? services
      : [
          {
            name: "Our services",
            slug: "services",
            description: "Personalized support from a local team.",
            decisionSupport: decisionSupportFor(businessKind, "our services"),
          },
        ],
    differentiators: lines(intake.differentiators).slice(0, 4),
    locations:
      preset === "home-services"
        ? areas.map((name) => ({ name, slug: slugify(name) }))
        : [],
    industry,
    businessKind,
    images: stockImages(businessKind),
    copy: defaultCopy(
      { primaryCta: intake.primaryCta },
      industry,
      businessKind,
    ),
    conversion: {
      layout: layoutFor(industry, preset),
      qualification: qualificationFor(industry, businessKind),
      process: [
        "Tell us what you need",
        "Get clear next steps",
        "Move forward with confidence",
      ],
      faqs: defaultFaq(industry, intake.primaryCta, businessKind),
    },
    design: designFor(businessKind, industry, preset),
    assetReport: {
      used: stockAssetReport(businessKind, stockImages(businessKind)),
      skipped: [],
    },
  };
}

export function normalise(candidate, intake) {
  const base = fallback(intake);
  const value = candidate && typeof candidate === "object" ? candidate : {};
  const preset =
    value.preset === "home-services" ? "home-services" : base.preset;
  const submittedServiceNames = lines(intake.services);
  // The model can improve descriptions, but it cannot rename, replace, or
  // invent the services the client says it sells.
  const serviceInput = submittedServiceNames.length
    ? submittedServiceNames.map((name, index) => ({
        name,
        slug: slugify(name),
        description: Array.isArray(value.services)
          ? value.services[index]?.description
          : undefined,
        decisionSupport: Array.isArray(value.services)
          ? value.services[index]?.decisionSupport
          : undefined,
      }))
    : Array.isArray(value.services)
      ? value.services
      : base.services;
  const services = serviceInput.slice(0, 8).map((service, index) => {
    const name = String(
      service.name || base.services[index]?.name || "Our service",
    ).slice(0, 80);
    const proposedSupport =
      service.decisionSupport && typeof service.decisionSupport === "object"
        ? service.decisionSupport
        : {};
    const fallbackSupport = decisionSupportFor(base.businessKind, name);
    return {
      name,
      description: String(
        usefulServiceDescription(
          service.description || base.services[index]?.description,
          name,
        ),
      ),
      slug: slugify(service.slug || service.name || `service-${index + 1}`),
      decisionSupport: {
        scope: text(proposedSupport.scope || fallbackSupport.scope, 260),
        nextStep: text(
          proposedSupport.nextStep || fallbackSupport.nextStep,
          260,
        ),
        preparation: text(
          proposedSupport.preparation || fallbackSupport.preparation,
          260,
        ),
      },
    };
  });
  // Only model-authored marketing copy may change. Contact details, offers,
  // places, and services remain verified client data.
  const proposedBusiness =
    value.business && typeof value.business === "object" ? value.business : {};
  const business = {
    ...base.business,
    tagline: text(proposedBusiness.tagline || base.business.tagline, 130),
    description: text(
      proposedBusiness.description || base.business.description,
      520,
    ),
  };
  const different = Array.isArray(value.differentiators)
    ? value.differentiators
        .map((item) => text(item, 160))
        .filter(Boolean)
        .slice(0, 5)
    : base.differentiators;
  const assets =
    intake.assets && typeof intake.assets === "object"
      ? intake.assets
      : undefined;
  const images = { ...base.images };
  const assetReport = {
    used: stockAssetReport(base.businessKind, images),
    skipped: [],
  };
  if (typeof assets?.photoOne === "string") {
    images.hero = assets.photoOne;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "hero",
    );
    assetReport.used.push({
      asset: "photoOne",
      placement: "hero",
      source: "client",
    });
  }
  if (typeof assets?.photoTwo === "string") {
    images.secondary = assets.photoTwo;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "photoTwo",
      placement: "story",
      source: "client",
    });
  } else if (typeof assets?.photoThree === "string") {
    images.secondary = assets.photoThree;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "photoThree",
      placement: "story",
      source: "client",
    });
  } else if (typeof assets?.teamPhoto === "string") {
    images.secondary = assets.teamPhoto;
    assetReport.used = assetReport.used.filter(
      (item) => item.placement !== "secondary",
    );
    assetReport.used.push({
      asset: "teamPhoto",
      placement: "story",
      source: "client",
    });
  }
  if (typeof assets?.logo === "string")
    assetReport.used.push({
      asset: "logo",
      placement: "brand",
      source: "client",
    });
  const suppliedCopy =
    value.copy && typeof value.copy === "object" ? value.copy : {};
  const copy = Object.fromEntries(
    Object.entries(defaultCopy(business, base.industry, base.businessKind)).map(
      ([key, fallbackValue]) => [
        key,
        text(suppliedCopy[key] || fallbackValue, 180),
      ],
    ),
  );
  const rawConversion =
    value.conversion && typeof value.conversion === "object"
      ? value.conversion
      : {};
  const proposedFaqs = Array.isArray(rawConversion.faqs)
    ? rawConversion.faqs
    : base.conversion.faqs;
  const proposedProcess = (
    Array.isArray(rawConversion.process)
      ? rawConversion.process
      : base.conversion.process
  )
    .map(processStepText)
    .filter(Boolean)
    .slice(0, 4);
  const validatedFaqs = proposedFaqs
    .map((faq) => ({
      question: text(faq?.question, 160),
      answer: text(faq?.answer, 360),
    }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 5);
  const qualification = base.conversion.qualification;
  const featureConfig = conversionFeaturesFor({
    industry: base.industry,
    businessKind: base.businessKind,
    business,
    qualification,
    faqs: validatedFaqs.length ? validatedFaqs : base.conversion.faqs,
    aiChatEnabled:
      String(intake.conversionAiChat || "").toLowerCase() === "yes",
  });
  const conversion = {
    layout: layoutFor(base.industry, preset),
    qualification,
    process: proposedProcess.length ? proposedProcess : base.conversion.process,
    faqs: validatedFaqs.length ? validatedFaqs : base.conversion.faqs,
    ...featureConfig,
  };
  return removeEmDashes({
    preset,
    industry: base.industry,
    businessKind: base.businessKind,
    business,
    style: { ...(value.style || {}), ...base.style },
    services: services.length ? services : base.services,
    differentiators: different.length ? different : base.differentiators,
    locations:
      preset === "home-services"
        ? business.serviceAreas.map((name, index) => {
            const proposed = Array.isArray(value.locations)
              ? value.locations.find(
                  (location) => slugify(location?.name || "") === slugify(name),
                ) || value.locations[index]
              : undefined;
            return {
              name,
              slug: slugify(name),
              description: text(
                proposed?.description ||
                  `${business.name} accepts service requests from ${name} and confirms availability by address.`,
                320,
              ),
              localNote: text(
                proposed?.localNote ||
                  `Share the ${name} service address and the issue you are seeing so the team can confirm coverage and the next available step.`,
                320,
              ),
            };
          })
        : [],
    images,
    copy,
    conversion,
    design: designFor(base.businessKind, base.industry, preset),
    assetReport,
    ...(assets ? { assets } : {}),
    ...(intake.lead && typeof intake.lead === "object"
      ? { lead: intake.lead }
      : {}),
  });
}

export function removeEmDashes(value) {
  if (typeof value === "string") return value.replace(/—/g, "-");
  if (Array.isArray(value)) return value.map(removeEmDashes);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, removeEmDashes(item)]),
    );
  return value;
}

async function askModel(intake, effort, model = MODEL) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "LaunchLoom",
      },
      body: JSON.stringify({
        model,
        reasoning_effort: effort,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are LaunchLoom's senior conversion copywriter and conversion strategist for local and service businesses. Return JSON only. Create specific, polished, plain-English website copy from verified facts. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION} Build a credible path from visitor problem to action with a differentiated promise, distinct service outcomes, concrete decision support, concise process steps, and useful FAQs. Improve clarity, hierarchy, and customer benefit without inventing licenses, medical claims, guarantees, pricing, credentials, testimonials, business hours, locations, deadlines, staff, or results. Never replace submitted contact facts. When the brief includes feedback, treat it as the primary revision request: address it directly and preserve unrelated approved copy and positioning. Avoid generic filler such as 'tailored to your needs', 'when it matters', 'work that lasts', 'next level', 'quality you can trust', or 'we are here for you'. Make every service description distinct and concrete. Only use proof claims supplied in the brief. Do not return HTML or frontend code.`,
          },
          {
            role: "user",
            content: `Transform this verified client brief into JSON with keys preset, business, style, services, differentiators, locations, copy, conversion. business must include name, tagline, description, phone, email, address, serviceAreas, hours, primaryCta, offer, domain, leadEmail. services is an array of {name, description, slug, decisionSupport:{scope,nextStep,preparation}}. Keep every submitted service name exactly as provided. Each decisionSupport field must answer a different practical buying question using only supported facts and cautious next-step language. locations is an array of {name, description, localNote}; include only submitted service areas, distinguish serving an area from having a physical office there, and avoid interchangeable city-swap copy. copy must include heroKicker, servicesHeading, aboutKicker, aboutHeading, aboutBody, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. aboutBody adds useful context instead of repeating the hero description or proof points. conversion must include process (2–4 concise steps) and faqs (2–5 {question, answer} objects). The tagline is a concise, differentiated promise; description is a 2–3 sentence customer-facing introduction; service descriptions explain a distinct outcome or approach. Treat submitted business facts as authoritative.\n\n${JSON.stringify(intake)}`,
          },
        ],
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `OpenRouter returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return parseModelJson(content);
}

async function refineDraft(intake, draft, report, model = MODEL) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "LaunchLoom quality refinement",
      },
      body: JSON.stringify({
        model,
        reasoning_effort: "low",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are the final creative director for a conversion-focused local-business website. Return JSON only, using the exact site-config shape provided. ${SHARED_CREATIVE_DIRECTION} ${RECIPE_CREATIVE_DIRECTION} Fix only the listed quality issues. Preserve the selected design recipe, every verified business fact, service name, address, contact detail, offer, brand asset, and unrelated approved positioning. Improve specificity, hierarchy, decision support, and calls to action without inventing proof, pricing, credentials, outcomes, locations, staff, or claims. Do not return HTML, CSS, code, explanations, or markdown.`,
          },
          {
            role: "user",
            content: `Verified intake facts:\n${JSON.stringify(intake)}\n\nCurrent draft:\n${JSON.stringify(draft)}\n\nQuality issues to fix:\n${report.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}`,
          },
        ],
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `OpenRouter refinement returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter refinement returned no content.");
  return parseModelJson(content);
}

export async function generateSiteConfigWithModel(intake, model = MODEL) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required to generate client copy.");
  let draft;
  try {
    draft = normalise(await askModel(intake, "low", model), intake);
  } catch (firstError) {
    console.warn(
      "Low-effort generation failed; retrying once with high effort.",
      firstError.message,
    );
    draft = normalise(await askModel(intake, "high", model), intake);
  }
  const initialReport = evaluateDraft(draft);
  if (!initialReport.issues.length)
    return {
      ...draft,
      qualityReport: { ...initialReport, refined: false },
    };

  try {
    const refined = normalise(
      await refineDraft(intake, draft, initialReport, model),
      intake,
    );
    const finalReport = evaluateDraft(refined);
    const selected = finalReport.score >= initialReport.score ? refined : draft;
    return {
      ...selected,
      qualityReport: {
        ...(selected === refined ? finalReport : initialReport),
        refined: selected === refined,
      },
    };
  } catch (error) {
    console.warn(
      "Quality refinement failed; keeping validated initial draft.",
      error instanceof Error ? error.message : error,
    );
    return { ...draft, qualityReport: { ...initialReport, refined: false } };
  }
}

export const generateSiteConfig = (intake) =>
  generateSiteConfigWithModel(intake);

function extractIntake(body) {
  const match = body.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match) throw new Error("Could not find intake JSON in the issue body.");
  return JSON.parse(match[1]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const source = process.argv[process.argv.indexOf("--source") + 1];
  const destination = process.argv[process.argv.indexOf("--out") + 1];
  if (!source || !destination)
    throw new Error(
      "Usage: node generate-site-config.mjs --source intake.md --out site.config.json",
    );
  const intake = extractIntake(await fs.readFile(source, "utf8"));
  await fs.writeFile(
    destination,
    `${JSON.stringify(await generateSiteConfig(intake), null, 2)}\n`,
  );
}
