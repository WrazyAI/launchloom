import { it, expect } from "vitest";
import {
  compilePageBriefs,
  pageBriefFor,
  pageBriefReadiness,
} from "../templates/client-site/src/lib/page-briefs.mjs";
const base = {
  industry: "home-services",
  business: {
    name: "Fixture Plumbing",
    description: "Supplied business description.",
    serviceAreas: ["Testville", "North Testville"],
  },
  services: [
    {
      name: "Drain cleaning",
      slug: "drain-cleaning",
      description: "A short drain service card.",
    },
    {
      name: "Leak repair",
      slug: "leak-repair",
      description: "A short leak service card.",
    },
  ],
  locations: [{ name: "Testville", slug: "testville" }],
  routePolicy: {
    version: 1,
    decisions: [
      {
        pageType: "location",
        target: "Testville",
        status: "approved",
        evidence: ["operator review"],
        admission: {
          services: ["Drain cleaning"],
          visitorNeed: "Check access.",
          distinctValue: "Client access notes.",
          localFacts: [
            {
              value: "Ask about side access.",
              source: "client notes",
              provenance: "client_supplied_local_information",
            },
          ],
        },
      },
    ],
  },
};
const id = "service:drain cleaning";
function rich() {
  const values = {
    intro:
      "Tell us which drains are slow and whether the issue affects more than one fixture.",
    meta: "Prepare useful information about slow drains before discussing drain cleaning with Fixture Plumbing.",
    scope: "Discuss the affected fixtures and when the drainage changed.",
    faq: "Share which fixtures are affected; this helps describe the service request.",
    related:
      "A visible pipe leak is a different concern to discuss through leak repair.",
  };
  const pageEvidence = Object.entries(values).map(([name, value]) => ({
    id: name,
    value,
    source: "synthetic client supplied notes",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [id],
  }));
  const claim = (name: keyof typeof values) => ({
    text: values[name],
    evidenceIds: [name],
  });
  return {
    ...base,
    pageEvidence,
    pageContent: {
      [id]: {
        introduction: claim("intro"),
        metadata: { description: claim("meta") },
        scope: [claim("scope")],
        faqs: [
          {
            question: "What drain details should I share?",
            answer: claim("faq"),
          },
        ],
        relatedServices: [
          { routeId: "service:leak repair", reason: claim("related") },
        ],
      },
    },
  };
}
function completeResearchedServiceBrief() {
  const config: any = { ...rich(), pageContentContractVersion: 1 };
  config.services = config.services.slice(0, 1);
  config.locations = [];
  const content = config.pageContent[id];
  delete content.relatedServices;
  const add = (recordId: string, value: string) => {
    config.pageEvidence.push({
      id: recordId,
      value,
      source: "synthetic measured route fixture",
      kind: "client_supplied",
      confirmed: true,
      public: true,
      routeIds: [id],
    });
    return { text: value, evidenceIds: [recordId] };
  };
  content.metadata = {
    description: add(
      "metadata",
      "Prepare details about affected fixtures and timing before discussing drain cleaning with Fixture Plumbing.",
    ),
  };
  content.preparation = [
    add("preparation", "Note which fixtures are affected and when the change began."),
  ];
  content.nextStep = [
    add("next-step", "Share the details and ask which inspection or service request fits before agreeing to work."),
  ];
  const questionOne = add("question-one", "What drain details should I share?");
  const answerTwo = add("answer-two", "Ask what the visit can check and which findings the team can explain before discussing any follow-up work.");
  const questionTwo = add("question-two", "What can a drain cleaning visit assess?");
  const answerOne = content.faqs[0].answer;
  content.faqs = [
    { question: questionOne, answer: answerOne },
    { question: questionTwo, answer: answerTwo },
  ];
  return config;
}
it("separates supported introduction, metadata and short card copy", () => {
  const brief = pageBriefFor(rich(), id)!;
  expect(brief.ready).toBe(true);
  expect(brief.mode).toBe("supported");
  expect(brief.introduction).not.toBe(brief.cardDescription);
  expect(brief.metadata.description).not.toBe(brief.introduction);
  expect(brief.faqs[0].answer).toContain("fixtures");
  expect(brief.related[0].name).toBe("Leak repair");
});
it("requires evidence-backed route content for indexable services in the v1 content contract", () => {
  const config = { ...base, pageContentContractVersion: 1, pageContent: {} };
  const readiness = pageBriefReadiness(config);
  expect(readiness.allowed).toBe(false);
  if (readiness.allowed) throw new Error("Missing service content must block readiness.");
  expect(readiness.code).toBe("page_content_required");
  expect(readiness.error).toContain("service:drain cleaning");
});
it("requires service scope, preparation, next step, and two supported FAQs", () => {
  const config = { ...rich(), pageContentContractVersion: 1 };
  const readiness = pageBriefReadiness(config);
  expect(readiness.allowed).toBe(false);
  if (readiness.allowed) throw new Error("Incomplete service content must block readiness.");
  expect(readiness.error).toMatch(/preparation|nextStep|two supported FAQs/iu);
});
it("accepts a complete measured route brief only when its FAQ questions are evidence-backed", () => {
  const config = completeResearchedServiceBrief();
  expect(pageBriefReadiness(config)).toEqual({ allowed: true });
  config.pageContent[id].faqs[0].question = "What should I ask?";
  const readiness = pageBriefReadiness(config);
  expect(readiness.allowed).toBe(false);
  if (readiness.allowed) throw new Error("An unsupported FAQ question must block readiness.");
  expect(readiness.error).toMatch(/FAQ questions need route-scoped evidence/iu);
});
it("requires generated page copy to name the source fields it was grounded in", () => {
  const config = completeResearchedServiceBrief();
  config.seoPageMap = [{
    pageType: "service",
    service: "Drain cleaning",
    fanOutQuestions: ["What should I ask?"],
  }];
  const record = config.pageEvidence.find((item: any) => item.id === "intro");
  record.kind = "generated_copy";
  expect(pageBriefReadiness(config).allowed).toBe(false);
  record.sourceRefs = ["services.0.description", "seoPageMap.0.fanOutQuestions.0"];
  expect(pageBriefReadiness(config).allowed).toBe(true);
});
it("does not invent missing proof, options, timing or answers to research questions", () => {
  const config = {
    ...rich(),
    seoPageMap: [
      {
        pageType: "service",
        service: "Drain cleaning",
        fanOutQuestions: ["What does it cost?"],
      },
    ],
  };
  const brief = pageBriefFor(config, id)!;
  expect(brief.sections.some((section) => section.kind === "proof")).toBe(
    false,
  );
  expect(brief.omissions.some((entry) => entry.field === "options")).toBe(true);
  expect(brief.researchQuestions[0]).toMatchObject({
    state: "unanswered",
    source: "research_question_only",
  });
  expect(brief.faqs.some((faq) => faq.question === "What does it cost?")).toBe(
    false,
  );
});
it.each(["confirmed", "public", "value", "routeIds"])(
  "rejects missing/wrong evidence %s rather than publish unsupported claims",
  (field) => {
    const config = rich();
    const record = config.pageEvidence[0];
    (record as any)[field] =
      field === "value"
        ? "A different claim."
        : field === "routeIds"
          ? ["service:leak repair"]
          : false;
    expect(pageBriefReadiness(config).allowed).toBe(false);
    expect(pageBriefFor(config, id)!.introduction).not.toBe(
      config.pageContent[id].introduction.text,
    );
  },
);
it("keeps proposed city content excluded and validates useful local information on admitted cities", () => {
  const config = {
    ...base,
    pageContent: {
      "location:north testville": {
        introduction: { text: "Unsupported city copy.", evidenceIds: [] },
      },
      "location:testville": {},
    },
    pageEvidence: [],
  };
  const report = compilePageBriefs(config);
  expect(
    report.briefs.some((brief) => brief.routeId === "location:north testville"),
  ).toBe(false);
  expect(report.deferred).toContainEqual(
    expect.objectContaining({
      routeId: "location:north testville",
      state: "draft",
    }),
  );
  expect(pageBriefReadiness(config).allowed).toBe(false);
});
it("retains deterministic legacy descriptions without relabeling them verified", () => {
  const brief = pageBriefFor(base, id)!;
  expect(brief.mode).toBe("legacy");
  expect(brief.introduction).toBe(base.services[0].description);
  expect(brief.evidenceIds).toEqual([]);
  expect(pageBriefReadiness(base).allowed).toBe(true);
});
it("does not use a stored ready report to bypass invalid current page material", () => {
  const config = {
    ...rich(),
    pageBriefs: { version: 1, issues: [] },
    pageContent: { [id]: {} },
  };
  expect(pageBriefReadiness(config).allowed).toBe(false);
});
it("requires contextual licensed media and does not reuse an unrelated hero automatically", () => {
  const config = {
    ...rich(),
    images: { hero: "/images/hero.webp" },
    pageContent: {
      [id]: {
        ...rich().pageContent[id],
        media: [
          {
            src: "/images/hero.webp",
            alt: "Drain context",
            evidenceId: "photo",
          },
        ],
      },
    },
  };
  expect(pageBriefReadiness(config).allowed).toBe(false);
});
it("preserves the complete supplied policy body", () => {
  const body = "Supplied policy text. ".repeat(150);
  const config = {
    ...base,
    routePolicy: {
      version: 1,
      decisions: [{ pageType: "privacy", status: "approved" }],
    },
    supportingPages: {
      privacy: { body, source: "supplied policy document", reviewed: true },
    },
  };
  expect(pageBriefFor(config, "privacy:")!.supportingBody).toBe(body);
});

it("updates only the named approved service FAQ using already confirmed evidence", async () => {
  const { applyOperation, expectedArtifacts, verifyRevision } =
    await import("../scripts/revision-engine.mjs");
  const config = rich();
  const untouched = JSON.stringify(config.pageContent);
  config.pageEvidence.push({
    id: "new-answer",
    value:
      "Tell us whether the kitchen sink and bathroom drain are both affected.",
    source: "explicit synthetic client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [id],
  });
  config.pageEvidence.push({
    id: "new-question",
    value: "Which fixtures should I mention?",
    source: "explicit synthetic client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [id],
  });
  const operation = {
    kind: "set_page_content",
    routeId: id,
    field: "faqs",
    value: [
      {
        question: "Which fixtures should I mention?",
        answer: {
          text: "Tell us whether the kitchen sink and bathroom drain are both affected.",
          evidenceIds: ["new-answer"],
        },
      },
    ],
  };
  expect(applyOperation(config, operation)).toBe(true);
  expect(JSON.stringify(config.pageContent)).not.toBe(untouched);
  expect(config.services).toEqual(base.services);
  expect(config.business).toEqual(base.business);
  const artifacts = expectedArtifacts([operation], config);
  expect(
    artifacts.every(
      (artifact: any) => artifact.route === "/services/drain-cleaning/",
    ),
  ).toBe(true);
  const html =
    "<h1>Drain cleaning</h1><summary>Which fixtures should I mention?</summary><p>Tell us whether the kitchen sink and bathroom drain are both affected.</p>";
  expect(
    verifyRevision(
      config,
      {
        results: [{ feedbackIndex: 0, status: "fulfilled" }],
        expectedArtifacts: artifacts,
      },
      html,
      html,
      { "/services/leak-repair/": html },
    ).ok,
  ).toBe(false);
  expect(
    verifyRevision(
      config,
      {
        results: [{ feedbackIndex: 0, status: "fulfilled" }],
        expectedArtifacts: artifacts,
      },
      "",
      html,
      { "/services/drain-cleaning/": html },
    ),
  ).toMatchObject({ ok: true, failures: [] });
});
it("refuses unknown routes and unsupported new claims without mutating any approved content", async () => {
  const { applyPageContentRevision } =
    await import("../templates/client-site/src/lib/page-briefs.mjs");
  const config = rich();
  const before = JSON.stringify(config);
  expect(
    applyPageContentRevision(config, {
      kind: "set_page_content",
      routeId: "location:north testville",
      field: "localContext",
      value: [],
    }),
  ).toBe(false);
  expect(
    applyPageContentRevision(config, {
      kind: "set_page_content",
      routeId: id,
      field: "introduction",
      value: {
        text: "Guaranteed response in ten minutes.",
        evidenceIds: ["intro"],
      },
    }),
  ).toBe(false);
  expect(JSON.stringify(config)).toBe(before);
});

it("resolves canonical route IDs despite repeated whitespace in supplied service names", () => {
  const config = structuredClone(rich());
  config.services[0].name = " Drain  cleaning ";
  const brief = pageBriefFor(config, id)!;
  expect(brief.ready).toBe(true);
  expect(brief.cardDescription).toBe(base.services[0].description);
});
it("does not treat a services hub path as an individual service page target", async () => {
  const { planRevision } = await import("../scripts/revision-engine.mjs");
  const config: any = rich();
  const hub = "services-hub:";
  config.pageContent[hub] = {
    introduction: {
      text: "Review confirmed service choices before discussing the request.",
      evidenceIds: ["hub"],
    },
  };
  config.pageEvidence.push({
    id: "hub",
    value: "Review confirmed service choices before discussing the request.",
    source: "client notes",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [hub],
  });
  const operation = {
    kind: "set_page_content",
    feedbackIndex: 0,
    routeId: id,
    field: "introduction",
    value: config.pageContent[id].introduction,
  };
  const planned = await planRevision(
    ["Update the introduction on /services/drain-cleaning/."],
    config,
    async () => [operation],
  );
  expect(planned.ok).toBe(true);
});
it("requires both changes when page feedback also names a homepage copy field", async () => {
  const { planRevision } = await import("../scripts/revision-engine.mjs");
  const config: any = rich();
  const operation = {
    kind: "set_page_content",
    feedbackIndex: 0,
    routeId: id,
    field: "introduction",
    value: config.pageContent[id].introduction,
  };
  const planned = await planRevision(
    [
      "Update the introduction on /services/drain-cleaning/ and update the hero heading.",
    ],
    config,
    async () => [operation],
  );
  expect(planned.ok).toBe(false);
});

it.each(["introduction", "metadataDescription", "localContext", "media"])(
  "bounds supported %s revisions to their approved route",
  async (field) => {
    const { pageBriefFixture } =
      await import("../scripts/fixtures/page-briefs-fixture.mjs");
    const { applyPageContentRevision } =
      await import("../templates/client-site/src/lib/page-briefs.mjs");
    const { expectedArtifacts, verifyRevision, planRevision } =
      await import("../scripts/revision-engine.mjs");
    const config: any = pageBriefFixture();
    const routeId =
      field === "localContext"
        ? "location:testville"
        : "service:drain cleaning";
    const before = structuredClone(config.pageContent);
    const value =
      field === "media"
        ? [config.pageContent[routeId].media[0]]
        : field === "localContext"
          ? config.pageContent[routeId].localContext
          : field === "metadataDescription"
            ? config.pageContent[routeId].metadata.description
            : config.pageContent[routeId].introduction;
    const operation = {
      kind: "set_page_content",
      feedbackIndex: 0,
      routeId,
      field,
      value,
    };
    expect(applyPageContentRevision(config, operation)).toBe(true);
    for (const key of Object.keys(before).filter((key) => key !== routeId))
      expect(config.pageContent[key]).toEqual(before[key]);
    const artifacts = expectedArtifacts([operation], config);
    expect(
      artifacts.every(
        (artifact: any) =>
          artifact.route === pageBriefFor(config, routeId)!.path,
      ),
    ).toBe(true);
    if (field === "metadataDescription") {
      const content = value.text.replace(/&/gu, "&amp;");
      const html = `<meta name="description" content="${content}">`;
      expect(
        verifyRevision(
          config,
          {
            results: [{ feedbackIndex: 0, status: "fulfilled" }],
            expectedArtifacts: artifacts,
          },
          "",
          html,
          { [artifacts[0].route]: html },
        ).ok,
      ).toBe(true);
    }
    const label =
      field === "localContext"
        ? "local detail"
        : field === "media"
          ? "page image"
          : field === "metadataDescription"
            ? "metadata description"
            : "introduction";
    const planned = await planRevision(
      [`Update the ${label} on ${pageBriefFor(config, routeId)!.path}.`],
      config,
      async () => [operation],
    );
    expect(planned.ok).toBe(true);
  },
);
it("does not expose known private locations or unapproved source records in model evidence", async () => {
  const { publicPageEvidence } =
    await import("../templates/client-site/src/lib/page-briefs.mjs");
  const config: any = rich();
  config.business.address = "42 Private Lane";
  config.business.addressVisibility = "private";
  config.pageEvidence[0].value = "Meet at 42 Private Lane.";
  config.pageContent[id].introduction.text = config.pageEvidence[0].value;
  config.pageEvidence.push({
    id: "private-draft",
    value: "Unapproved draft fact.",
    source: "private source document",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: ["location:north testville"],
  });
  const exposed = JSON.stringify({
    briefs: compilePageBriefs(config),
    evidence: publicPageEvidence(config),
  });
  expect(exposed).not.toContain("42 Private Lane");
  expect(exposed).not.toContain("Unapproved draft fact.");
  expect(exposed).not.toContain("private source document");
});

it("keeps expected wording from each requested FAQ revision instead of relabeling the final state", async () => {
  const { applyOperation, expectedArtifacts } =
    await import("../scripts/revision-engine.mjs");
  const config = rich();
  const first = {
    kind: "set_page_content",
    routeId: id,
    field: "faqs",
    value: structuredClone(config.pageContent[id].faqs),
  };
  config.pageEvidence.push({
    id: "second-answer",
    value: "Describe the affected bathroom fixture.",
    source: "client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [id],
  });
  config.pageEvidence.push({
    id: "second-question",
    value: "Which bathroom fixture?",
    source: "client correction",
    kind: "client_supplied",
    confirmed: true,
    public: true,
    routeIds: [id],
  });
  const second = {
    kind: "set_page_content",
    routeId: id,
    field: "faqs",
    value: [
      {
        question: "Which bathroom fixture?",
        answer: {
          text: "Describe the affected bathroom fixture.",
          evidenceIds: ["second-answer"],
        },
      },
    ],
  };
  expect(applyOperation(config, first)).toBe(true);
  expect(applyOperation(config, second)).toBe(true);
  expect(
    expectedArtifacts([first, second], config).map(
      (artifact: any) => artifact.value,
    ),
  ).toContain(first.value[0].answer.text);
});
it("requires exact-page HTML evidence for a rich route revision", async () => {
  const { expectedArtifacts, verifyRevision } =
    await import("../scripts/revision-engine.mjs");
  const config = rich();
  const operation = {
    kind: "set_page_content",
    routeId: id,
    field: "introduction",
    value: config.pageContent[id].introduction,
  };
  const artifacts = expectedArtifacts([operation], config);
  const html = `<p>${config.pageContent[id].introduction.text}</p>`;
  expect(
    verifyRevision(
      config,
      {
        results: [{ feedbackIndex: 0, status: "fulfilled" }],
        expectedArtifacts: artifacts,
      },
      html,
      html,
    ).ok,
  ).toBe(false);
});

it("does not fulfill a route FAQ request by changing that route introduction", async () => {
  const { planRevision } = await import("../scripts/revision-engine.mjs");
  const config = rich();
  const operation = {
    kind: "set_page_content",
    feedbackIndex: 0,
    routeId: id,
    field: "introduction",
    value: config.pageContent[id].introduction,
  };
  const planned = await planRevision(
    ["Update the FAQ on /services/drain-cleaning/."],
    config,
    async () => [operation],
  );
  expect(planned.ok).toBe(false);
  expect(planned.operations).toEqual([]);
});
it("requires both page fields when a revision explicitly requests an introduction and FAQ", async () => {
  const { planRevision } = await import("../scripts/revision-engine.mjs");
  const config = rich();
  const operation = {
    kind: "set_page_content",
    feedbackIndex: 0,
    routeId: id,
    field: "introduction",
    value: config.pageContent[id].introduction,
  };
  const planned = await planRevision(
    ["Update the introduction and FAQ on /services/drain-cleaning/."],
    config,
    async () => [operation],
  );
  expect(planned.ok).toBe(false);
});

it("refuses a new unsupported FAQ question even when its answer reuses approved evidence", async () => {
  const { applyPageContentRevision } =
    await import("../templates/client-site/src/lib/page-briefs.mjs");
  const config = rich();
  const before = JSON.stringify(config);
  const existing = config.pageContent[id].faqs[0];
  expect(
    applyPageContentRevision(config, {
      kind: "set_page_content",
      routeId: id,
      field: "faqs",
      value: [
        {
          question: "Why are you the highest rated service in Testville?",
          answer: existing.answer,
        },
      ],
    }),
  ).toBe(false);
  expect(JSON.stringify(config)).toBe(before);
});

it("does not silently downgrade an approved supported route when its page input is deleted", () => {
  const config: any = rich();
  config.pageBriefs = compilePageBriefs(config);
  config.pageContent = {};
  expect(pageBriefReadiness(config)).toMatchObject({
    allowed: false,
    code: "page_content_required",
  });
});

it("rejects a supporting route presented as a related service instead of silently dropping it", () => {
  const config = rich();
  config.pageContent[id].relatedServices[0].routeId = "contact:";
  expect(pageBriefReadiness(config)).toMatchObject({
    allowed: false,
    code: "page_content_required",
  });
});
