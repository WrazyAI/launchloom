import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FAQList, type CreativeContent } from "../templates/client-site/src/lib/creative-runtime";

describe("creative runtime FAQ disclosure", () => {
  it("keeps native details disclosure without a duplicate plus marker", () => {
    const content = {
      brand: {
        name: "Example practice",
        phone: "",
        email: "",
        address: "",
        serviceAreas: [],
      },
      hero: {
        kicker: "",
        heading: "",
        body: "",
        primaryLabel: "",
      },
      services: [],
      proof: [],
      process: [],
      faqs: [
        {
          question: "How does the first conversation work?",
          answer: "We begin with a conversation.",
        },
      ],
      locations: [],
      copy: {},
      businessDescription: "",
      showLocationMap: false,
      hasSocialProof: false,
      socialProof: null,
    } satisfies CreativeContent;

    const html = renderToStaticMarkup(
      React.createElement(FAQList, { content }),
    );

    expect(html).toContain(
      '<details><summary class="launchloom-faq-summary">How does the first conversation work?',
    );
    expect(html).toContain(
      '<span class="launchloom-faq-indicator" aria-hidden="true"></span>',
    );
    expect(html).not.toContain("aria-hidden=\"true\">+</span>");
  });
});
