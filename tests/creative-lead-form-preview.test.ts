import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LeadForm,
  type CreativeContent,
  type CreativeRuntime,
} from "../templates/client-site/src/lib/creative-runtime";

const content = {
  hero: { primaryLabel: "Request a quote" },
  copy: { formIntro: "A few details help the team respond." },
} as unknown as CreativeContent;

describe("creative lead form preview mode", () => {
  it("renders the authored form with a preview marker in diagnostic previews", () => {
    const markup = renderToStaticMarkup(
      createElement(LeadForm, {
        content,
        runtime: { diagnostic: true } as CreativeRuntime,
      }),
    );

    expect(markup).toContain('data-runtime="lead-form"');
    expect(markup).toContain('data-lead-preview="true"');
    expect(markup).toContain(
      "Developer preview: this form matches the client site, but submissions are disabled here.",
    );
    expect(markup).toContain("Request a quote");
    expect(markup).toContain('name="name"');
    expect(markup).toContain('name="phone"');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="message"');
    expect(markup).not.toContain("lead-form-disabled");
    expect(markup).not.toContain("Contact forms are disabled");
  });

  it("renders the live form without preview markers outside diagnostic previews", () => {
    const markup = renderToStaticMarkup(
      createElement(LeadForm, {
        content,
        runtime: {} as CreativeRuntime,
      }),
    );

    expect(markup).toContain('data-runtime="lead-form"');
    expect(markup).not.toContain('data-lead-preview="true"');
    expect(markup).not.toContain("Developer preview");
  });
});
