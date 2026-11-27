import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FAQList } from "../templates/client-site/src/lib/creative-runtime";

const baseContent: any = {
  faqs: [
    { question: "Homepage question?", answer: "Homepage answer." },
  ],
};

describe("FAQList runtime helper", () => {
  it("renders content.faqs by default", () => {
    const html = renderToStaticMarkup(
      createElement(FAQList, { content: baseContent }),
    );
    expect(html).toContain("Homepage question?");
    expect(html).toContain("Homepage answer.");
  });

  it("renders page-specific items prop when supplied by ServicePage or LocationPage", () => {
    const html = renderToStaticMarkup(
      createElement(FAQList, {
        content: baseContent,
        items: [
          { question: "Service-specific question?", answer: "Service-specific answer." },
        ],
      }),
    );
    expect(html).toContain("Service-specific question?");
    expect(html).toContain("Service-specific answer.");
    expect(html).not.toContain("Homepage question?");
  });

  it("supports faqs prop alias and falls back to content.faqs when empty", () => {
    const fromFaqs = renderToStaticMarkup(
      createElement(FAQList, {
        content: baseContent,
        faqs: [{ question: "Alias question?", answer: "Alias answer." }],
      }),
    );
    expect(fromFaqs).toContain("Alias question?");

    const emptyFallback = renderToStaticMarkup(
      createElement(FAQList, { content: baseContent, items: [] }),
    );
    expect(emptyFallback).toContain("Homepage question?");

    const invalidFallback = renderToStaticMarkup(
      createElement(FAQList, {
        content: baseContent,
        items: [{ question: "Missing answer" } as any],
      }),
    );
    expect(invalidFallback).toContain("Homepage question?");
  });
});
