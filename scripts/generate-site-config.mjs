import fs from "node:fs/promises";

const MODEL = "z-ai/glm-5.3-flash";

const STOCK_PACKS = {
  wellness: {
    hero: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1600&q=85",
    secondary: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=85",
  },
  "home-services": {
    hero: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1600&q=85",
    secondary: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=85",
  },
  "professional-services": {
    hero: "/images/packs/professional-services-advisory-v1.png",
  },
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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function usefulServiceDescription(value, serviceName) {
  const candidate = text(value, 180);
  const generic = /tailored to your needs|personalized support|quality you can trust|when it matters|next level/i;
  if (candidate.length >= 28 && !generic.test(candidate)) return candidate;
  return `Talk through your needs for ${serviceName} and leave with a clear next step.`;
}

function processStepText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const step = value;
    return text(
      step.title || step.label || step.name || step.step || step.text || step.description,
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

function stockImages(industry) {
  // These are reviewed packs, not a live keyword search. If the pack does not
  // describe the business, the template intentionally renders brand art.
  return { ...(STOCK_PACKS[industry] || {}) };
}

function layoutFor(industry, preset) {
  if (industry === "home-services" || preset === "home-services")
    return "local-proof";
  if (industry === "technology") return "product-clarity";
  return "editorial-authority";
}

function qualificationFor(industry) {
  if (industry === "home-services")
    return [
      { name: "service", label: "What do you need help with?", placeholder: "Select a service", options: ["Repair", "Installation", "Maintenance", "Not sure yet"] },
      { name: "timing", label: "When do you need help?", placeholder: "Select timing", options: ["As soon as possible", "This week", "Planning ahead"] },
    ];
  if (industry === "wellness")
    return [
      { name: "interest", label: "What are you interested in?", placeholder: "Select an option", options: ["A consultation", "A specific treatment", "Advice on options", "Not sure yet"] },
      { name: "timing", label: "When would you like to come in?", placeholder: "Select timing", options: ["This week", "Next week", "Just exploring"] },
    ];
  return [
    { name: "interest", label: "What would you like to discuss?", placeholder: "Select an option", options: ["A new project", "Improving an existing service", "A consultation", "Not sure yet"] },
  ];
}

function defaultCopy(business, industry) {
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
    contactKicker: "Start the conversation",
    contactHeading: business.primaryCta || "Talk with our team",
    processKicker: "A clear process",
    processHeading: "Know what happens next.",
    faqKicker: "Questions, answered",
    faqHeading: "A few useful details before you reach out.",
    formIntro: "A few quick details help us point you in the right direction.",
  };
}

function defaultFaq(industry, cta) {
  const action = cta || "get in touch";
  if (industry === "home-services")
    return [
      { question: "How quickly can you help?", answer: "Tell us what is happening and your timing. We will confirm the next available step directly." },
      { question: "Can I request help for my area?", answer: "Send your address and service needs and we will confirm coverage before scheduling." },
    ];
  return [
    { question: "What happens after I reach out?", answer: `Share a few details and our team will follow up with the most useful next step.` },
    { question: "Is there any obligation?", answer: `No pressure. ${action} to discuss your needs and decide whether we are a fit.` },
  ];
}

function fallback(intake) {
  const preset =
    intake.preset === "home-services" ? "home-services" : "wellness";
  const industry = industryFor(intake);
  const areas = lines(intake.serviceAreas);
  const services = lines(intake.services)
    .slice(0, 8)
    .map((name) => ({
      name,
      slug: slugify(name),
      description: usefulServiceDescription("", name),
    }));
  const businessName = intake.businessName || "Your business";
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
    },
    style: {
      primaryColor:
        intake.primaryColor || (preset === "wellness" ? "#205d51" : "#bd552d"),
      tone: intake.tone || "confident",
    },
    services: services.length
      ? services
      : [
          {
            name: "Our services",
            slug: "services",
            description: "Personalized support from a local team.",
          },
        ],
    differentiators: lines(intake.differentiators).slice(0, 4),
    locations:
      preset === "home-services"
        ? areas.map((name) => ({ name, slug: slugify(name) }))
        : [],
    industry,
    images: stockImages(industry),
    copy: defaultCopy({ primaryCta: intake.primaryCta }, industry),
    conversion: {
      layout: layoutFor(industry, preset),
      qualification: qualificationFor(industry),
      process: ["Tell us what you need", "Get clear next steps", "Move forward with confidence"],
      faqs: defaultFaq(industry, intake.primaryCta),
    },
    assetReport: { used: [], skipped: [] },
  };
}

export function normalise(candidate, intake) {
  const base = fallback(intake);
  const value = candidate && typeof candidate === "object" ? candidate : {};
  const preset =
    value.preset === "home-services" ? "home-services" : base.preset;
  const serviceInput = Array.isArray(value.services)
    ? value.services
    : base.services;
  const services = serviceInput.slice(0, 8).map((service, index) => ({
    name: String(
      service.name || base.services[index]?.name || "Our service",
    ).slice(0, 80),
    description: String(
      usefulServiceDescription(
        service.description || base.services[index]?.description,
        service.name || base.services[index]?.name || "this service",
      ),
    ),
    slug: slugify(service.slug || service.name || `service-${index + 1}`),
  }));
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
    ? value.differentiators.map(String).slice(0, 5)
    : base.differentiators;
  const assets =
    intake.assets && typeof intake.assets === "object"
      ? intake.assets
      : undefined;
  const images = { ...base.images };
  const assetReport = { used: [], skipped: [] };
  if (typeof assets?.photoOne === "string") {
    images.hero = assets.photoOne;
    assetReport.used.push({ asset: "photoOne", placement: "hero", source: "client" });
  }
  if (typeof assets?.photoTwo === "string") {
    images.secondary = assets.photoTwo;
    assetReport.used.push({ asset: "photoTwo", placement: "story", source: "client" });
  } else if (typeof assets?.photoThree === "string") {
    images.secondary = assets.photoThree;
    assetReport.used.push({ asset: "photoThree", placement: "story", source: "client" });
  } else if (typeof assets?.teamPhoto === "string") {
    images.secondary = assets.teamPhoto;
    assetReport.used.push({ asset: "teamPhoto", placement: "story", source: "client" });
  }
  if (typeof assets?.logo === "string")
    assetReport.used.push({ asset: "logo", placement: "brand", source: "client" });
  const suppliedCopy =
    value.copy && typeof value.copy === "object" ? value.copy : {};
  const copy = Object.fromEntries(
    Object.entries(defaultCopy(business, base.industry)).map(
      ([key, fallbackValue]) => [
        key,
        text(suppliedCopy[key] || fallbackValue, 180),
      ],
    ),
  );
  const rawConversion = value.conversion && typeof value.conversion === "object" ? value.conversion : {};
  const proposedFaqs = Array.isArray(rawConversion.faqs) ? rawConversion.faqs : base.conversion.faqs;
  const proposedProcess = (Array.isArray(rawConversion.process) ? rawConversion.process : base.conversion.process)
    .map(processStepText)
    .filter(Boolean)
    .slice(0, 4);
  const validatedFaqs = proposedFaqs
    .map((faq) => ({ question: text(faq?.question, 160), answer: text(faq?.answer, 360) }))
    .filter((faq) => faq.question && faq.answer)
    .slice(0, 5);
  const conversion = {
    layout: layoutFor(base.industry, preset),
    qualification: base.conversion.qualification,
    process: proposedProcess.length ? proposedProcess : base.conversion.process,
    faqs: validatedFaqs.length ? validatedFaqs : base.conversion.faqs,
  };
  return {
    preset,
    industry: base.industry,
    business,
    style: { ...base.style, ...(value.style || {}) },
    services: services.length ? services : base.services,
    differentiators: different.length ? different : base.differentiators,
    locations:
      preset === "home-services"
        ? business.serviceAreas.map((name) => ({ name, slug: slugify(name) }))
        : [],
    images,
    copy,
    conversion,
    assetReport,
    ...(assets ? { assets } : {}),
    ...(intake.lead && typeof intake.lead === "object"
      ? { lead: intake.lead }
      : {}),
  };
}

async function askModel(intake, effort) {
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
        model: MODEL,
        reasoning_effort: effort,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are LaunchLoom's senior conversion copywriter and conversion strategist for local and service businesses. Return JSON only. Create specific, polished, plain-English website copy from verified facts. Build a credible path from visitor problem to action: a differentiated promise, distinct service outcomes, concrete decision support, concise process steps, and useful FAQs. Improve clarity, hierarchy, and customer benefit without inventing licenses, medical claims, guarantees, pricing, credentials, testimonials, business hours, locations, deadlines, or results. Never replace submitted contact facts. Avoid generic filler such as 'tailored to your needs', 'when it matters', 'work that lasts', 'next level', 'quality you can trust', or 'we are here for you'. Make every service description distinct and concrete. Only use proof claims supplied in the brief. Do not return HTML or frontend code.",
          },
          {
            role: "user",
            content: `Transform this verified client brief into JSON with keys preset, business, style, services, differentiators, copy, conversion. business must include name, tagline, description, phone, email, address, serviceAreas, hours, primaryCta, offer, domain, leadEmail. services is an array of {name, description, slug}. copy must include heroKicker, servicesHeading, aboutKicker, aboutHeading, contactKicker, contactHeading, processKicker, processHeading, faqKicker, faqHeading, formIntro. conversion must include process (2–4 concise steps) and faqs (2–5 {question, answer} objects). The tagline is a concise, differentiated promise; description is a 2–3 sentence customer-facing introduction; service descriptions explain a distinct outcome or approach. Treat submitted business facts as authoritative.\n\n${JSON.stringify(intake)}`,
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
  return JSON.parse(content);
}

export async function generateSiteConfig(intake) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required to generate client copy.");
  try {
    return normalise(await askModel(intake, "low"), intake);
  } catch (firstError) {
    console.warn(
      "Low-effort generation failed; retrying once with high effort.",
      firstError.message,
    );
    return normalise(await askModel(intake, "high"), intake);
  }
}

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
