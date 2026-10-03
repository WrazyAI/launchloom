// Fictional, locally owned regression material. No client/provider calls.
export function pageBriefFixture(recipe = "local-trades") {
  const areas = ["Testville", "North Testville"];
  const serviceNames =
    recipe === "care-editorial"
      ? ["Initial consultation", "Follow-up support"]
      : ["Drain cleaning", "Leak repair"];
  const slugs =
    recipe === "care-editorial"
      ? ["initial-consultation", "follow-up-support"]
      : ["drain-cleaning", "leak-repair"];
  const ids = serviceNames.map((name) => "service:" + name.toLowerCase());
  const cityId = "location:testville";
  const pageEvidence = [];
  const pageContent = {};
  const claim = (routeId, id, value) => {
    const record = {
      id: routeId + ":" + id,
      value,
      source: "synthetic client-confirmed test notes",
      kind: "client_supplied",
      confirmed: true,
      public: true,
      routeIds: [routeId],
    };
    pageEvidence.push(record);
    return { text: value, evidenceIds: [record.id] };
  };
  const firstIntro =
    recipe === "care-editorial"
      ? "Use the first conversation to describe the support you are considering and ask what a consultation involves."
      : "Describe which fixtures drain slowly and when the change started, so you can discuss the scope of a drain-cleaning request.";
  const secondIntro =
    recipe === "care-editorial"
      ? "Bring the questions that arose after your first conversation and discuss the support you would like to continue."
      : "Describe where water appears, whether the leak is ongoing and which visible pipe or fitting is involved before discussing the next step.";
  for (const [index, routeId] of ids.entries()) {
    const intro = index === 0 ? firstIntro : secondIntro;
    pageContent[routeId] = {
      introduction: claim(routeId, "intro", intro),
      metadata: {
        description: claim(
          routeId,
          "meta",
          index === 0
            ? "Prepare for a focused conversation about the service scope, concerns and details that will help Fixture Studio understand your request."
            : "Discuss the follow-up details, questions and preparation relevant to this distinct service from Fixture Studio.",
        ),
      },
      scope: [
        claim(
          routeId,
          "scope",
          index === 0
            ? recipe === "care-editorial"
              ? "Discuss your priorities and ask which care options are appropriate to consider."
              : "Discuss the affected drains, the symptoms you see and the access needed to examine the request."
            : recipe === "care-editorial"
              ? "Review the questions from your previous discussion and explain any change in the support you want."
              : "Discuss the visible leak location and the circumstances in which water appears.",
        ),
      ],
      preparation: [
        claim(
          routeId,
          "prep",
          index === 0
            ? "Write down the concerns you want to discuss and any observations that help explain them."
            : "Bring the notes from the earlier discussion and describe what has changed.",
        ),
      ],
      nextStep: [
        claim(
          routeId,
          "next",
          "Use the contact form to describe your request and confirm the relevant next step.",
        ),
      ],
      suitability: [
        claim(
          routeId,
          "suitability",
          index === 0
            ? "This page helps you prepare a first, focused service enquiry."
            : "This page helps you discuss a separate concern or a follow-up question.",
        ),
      ],
      faqs: [
        {
          question:
            index === 0
              ? "What should I describe in my first enquiry?"
              : "Which changes should I mention?",
          answer: claim(
            routeId,
            "faq",
            index === 0
              ? "Explain which concern prompted your enquiry and when you first noticed it."
              : "Explain what has changed since the earlier discussion and what you would like help understanding.",
          ),
        },
      ],
      process: [
        claim(
          routeId,
          "process",
          "Share the relevant details, discuss the service scope and confirm the next step.",
        ),
      ],
      relatedServices: [
        {
          routeId: ids[1 - index],
          reason: claim(
            routeId,
            "related",
            index === 0
              ? "Use the separate service page when your concern matches its distinct scope."
              : "Return to the first service page if you need to prepare an initial enquiry.",
          ),
        },
      ],
      media: [
        {
          src: `/images/page-${index}.svg`,
          alt:
            index === 0
              ? "Synthetic diagram for initial service preparation"
              : "Synthetic diagram for a separate service concern",
          evidenceId: routeId + ":image",
        },
      ],
    };
    pageEvidence.push({
      id: routeId + ":image",
      value: `/images/page-${index}.svg`,
      alt: pageContent[routeId].media[0].alt,
      source: "locally authored synthetic fixture diagram",
      kind: "client_asset",
      confirmed: true,
      public: true,
      routeIds: [routeId],
    });
  }
  pageContent[cityId] = {
    introduction: claim(
      cityId,
      "intro",
      "Discuss a service request in Testville and check how property access affects preparation for the visit.",
    ),
    metadata: {
      description: claim(
        cityId,
        "meta",
        "Prepare a Testville service enquiry with the property access details and questions supplied for this fictional route fixture.",
      ),
    },
    localContext: [
      claim(
        cityId,
        "context",
        "The synthetic client asks Testville property owners to confirm whether the side gate can be opened for service access.",
      ),
    ],
    faqs: [
      {
        question: "What access detail should I confirm?",
        answer: claim(
          cityId,
          "faq",
          "Ask the property owner whether side gate access can be made available before discussing arrangements.",
        ),
      },
    ],
    media: [
      {
        src: "/images/page-city.svg",
        alt: "Synthetic diagram showing a side gate access route",
        evidenceId: cityId + ":image",
      },
    ],
  };
  pageEvidence.push({
    id: cityId + ":image",
    value: "/images/page-city.svg",
    alt: pageContent[cityId].media[0].alt,
    source: "locally authored synthetic fixture diagram",
    kind: "client_asset",
    confirmed: true,
    public: true,
    routeIds: [cityId],
  });
  for (const [routeId, label] of [
    ["about:", "business background"],
    ["contact:", "contact preparation"],
    ["services-hub:", "service choices"],
  ]) {
    pageContent[routeId] = {
      introduction: claim(
        routeId,
        "intro",
        `Review the supplied ${label} information before discussing a request with Fixture Studio.`,
      ),
      metadata: {
        description: claim(
          routeId,
          "meta",
          `Read the supplied ${label} information and prepare a focused request for the fictional Fixture Studio business.`,
        ),
      },
      preparation: [
        claim(
          routeId,
          "preparation",
          `Bring the questions relevant to ${label} when discussing your request.`,
        ),
      ],
    };
  }
  // The coverage-only area deliberately has an evidence-poor proposed brief.
  pageContent["location:north testville"] = {
    introduction: {
      text: "Unsupported interchangeable city prose.",
      evidenceIds: [],
    },
  };
  return {
    preset: recipe === "care-editorial" ? "wellness" : "home-services",
    industry: recipe === "care-editorial" ? "wellness" : "home-services",
    businessKind: recipe === "care-editorial" ? "wellness" : "plumbing",
    demoNotice: "Fictional page-brief verification fixture",
    business: {
      name: "Fixture Studio",
      tagline: "Discuss the support you need.",
      description:
        "Fixture Studio is a fictional verification business. Its pages demonstrate how supported service information can guide a useful enquiry without inventing claims, timelines, prices, reviews or credentials. No real services are offered by this synthetic fixture.",
      phone: "(555) 555-0100",
      email: "fixture@example.com",
      address: "",
      addressVisibility: "private",
      serviceAreas: areas,
      hours: "",
      primaryCta: "Discuss your request",
      leadEmail: "fixture@example.com",
    },
    style: {
      primaryColor: "#205d51",
      tone: recipe === "care-editorial" ? "calm" : "confident",
    },
    services: serviceNames.map((name, index) => ({
      name,
      slug: slugs[index],
      description:
        index === 0
          ? "Prepare a focused initial enquiry."
          : "Discuss a separate service concern.",
    })),
    locations: [
      { name: "Testville", slug: "testville" },
      { name: "North Testville", slug: "north-testville" },
    ],
    differentiators: [
      "Supported preparation guidance",
      "Scope discussed before arrangements",
    ],
    images: { hero: "/images/page-0.svg" },
    assets: {},
    conversion: {
      quickAnswers: {
        enabled: false,
        label: "",
        greeting: "",
        items: [],
        ctaLabel: "",
        ctaTarget: "contact",
      },
      aiChat: {
        enabled: false,
        label: "",
        greeting: "",
        disclaimer: "",
        apiUrl: "",
        token: "",
      },
      exitOffer: {
        enabled: false,
        eyebrow: "",
        heading: "",
        body: "",
        ctaLabel: "",
        ctaTarget: "contact",
      },
      layout:
        recipe === "care-editorial" ? "editorial-authority" : "local-proof",
      process: ["Describe your needs.", "Discuss the relevant scope."],
      faqs: [
        {
          question: "How do I ask about coverage?",
          answer: "Share your location and service need.",
        },
      ],
    },
    design: { recipe, sections: [] },
    routePolicy: {
      version: 1,
      decisions: [
        {
          pageType: "location",
          target: " TESTVILLE ",
          status: "approved",
          evidence: ["synthetic operator review"],
          admission: {
            services: serviceNames.map((name) => name.toUpperCase()),
            visitorNeed: "Check property access.",
            distinctValue: "Client access preparation notes.",
            localFacts: [
              {
                value: "Confirm side gate access.",
                source: "synthetic client notes",
                provenance: "client_supplied_local_information",
              },
            ],
          },
        },
        { pageType: "location", target: "North Testville", status: "proposed" },
        { pageType: "privacy", status: "approved" },
      ],
    },
    supportingPages: {
      privacy: {
        body: "Supplied synthetic policy text for this fixture. ".repeat(100),
        source: "locally supplied synthetic document",
        reviewed: true,
      },
    },
    pageContent,
    pageEvidence,
    assetReport: {
      used: [0, 1, "city"].map((index) => ({
        asset: `/images/page-${index}.svg`,
        placement: "page-context",
        source: "client",
        license: "locally owned synthetic test diagram",
        subject:
          recipe === "care-editorial"
            ? "consultation preparation"
            : "plumbing service preparation",
      })),
      skipped: [],
    },
  };
}
export const fixtureImage =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#e6f0eb"/><path d="M120 130h260v160h140" fill="none" stroke="#205d51" stroke-width="38"/><circle cx="120" cy="130" r="44" fill="#205d51"/></svg>';
