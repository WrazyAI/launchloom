import { describe, expect, it } from "vitest";
import {
  feedbackRequestSummary,
  feedbackReviewedPageFromComment,
  feedbackRequestFromComment,
  feedbackStructureFromComment,
  feedbackTextFromComment,
  nextClientFeedbackContext,
  pendingFeedbackFromComments,
  revisionIntakeFromConfig,
} from "../scripts/feedback-utils.mjs";

const structureMarker = (value: unknown) =>
  `<!-- launchloom-feedback-structure:${Buffer.from(
    JSON.stringify(value),
  ).toString("base64url")} -->`;

describe("revision feedback", () => {
  it("preserves the reviewed route while stripping signed review credentials", () => {
    const body = [
      "<!-- launchloom-feedback:developer -->",
      "**Developer feedback · Layout**",
      "Make this service page footer feel integrated.",
      "",
      "_Page: https://review.example.pages.dev/services/family-dentistry/?review=signed-secret#contact_",
    ].join("\n");

    expect(feedbackReviewedPageFromComment(body)).toBe(
      "https://review.example.pages.dev/services/family-dentistry/",
    );
    expect(feedbackRequestFromComment(body)).toMatchObject({
      text: "[Layout] Make this service page footer feel integrated.",
      reviewedPage:
        "https://review.example.pages.dev/services/family-dentistry/",
    });
    expect(JSON.stringify(feedbackRequestFromComment(body))).not.toContain(
      "signed-secret",
    );
    expect(
      feedbackReviewedPageFromComment(
        [
          "<!-- launchloom-feedback:developer -->",
          "**Developer feedback**",
          "Same route without a trailing slash.",
          "",
          "_Page: https://review.example.pages.dev/services/family-dentistry?review=another-secret_",
        ].join("\n"),
      ),
    ).toBe("https://review.example.pages.dev/services/family-dentistry/");
  });

  it("removes review metadata and signed page URLs from feedback", () => {
    const feedback = feedbackTextFromComment(
      "<!-- launchloom-feedback:developer -->\n**Developer feedback · Logo**\n\nShow the company name beside the logo.\n\n_Page: https://review.example.pages.dev/?review=signed-value_",
    );

    expect(feedback).toBe("[Logo] Show the company name beside the logo.");
    expect(feedback).not.toContain("pages.dev");
    expect(feedback).not.toContain("signed-value");
  });

  it("rebuilds a revision brief from canonical business fields", () => {
    const intake = revisionIntakeFromConfig(
      {
        preset: "wellness",
        industry: "wellness",
        business: {
          name: "Daley Hope Health Care",
          phone: "555-0100",
          email: "hello@example.test",
          address: "Bala Cynwyd, PA",
          serviceAreas: ["Bala Cynwyd"],
          primaryCta: "Book a consultation",
          leadEmail: "leads@example.test",
        },
        services: [{ name: "Home care" }],
        differentiators: ["Compassionate support"],
        style: { primaryColor: "#205d51", tone: "confident" },
        assets: { logo: "https://assets.example/logo.png" },
      },
      "[Logo] Show the company name beside the logo.",
    );

    expect(intake.businessName).toBe("Daley Hope Health Care");
    expect(intake.services).toBe("Home care");
    expect(intake.assets.logo).toBe("https://assets.example/logo.png");
  });

  it("carries client feedback through developer refinements on the same revision PR", () => {
    const clientContext = nextClientFeedbackContext(
      {
        revisionPr: "12",
        stage: "client",
        feedback: ["Make the gallery more editorial."],
      },
      "developer",
      ["Tighten the CTA after the gallery."],
      "12",
    );
    expect(clientContext).toEqual(["Make the gallery more editorial."]);

    const nextClientContext = nextClientFeedbackContext(
      {
        revisionPr: "12",
        clientFeedbackContext: clientContext,
      },
      "client",
      ["Use a quieter closing section."],
      "12",
    );
    expect(nextClientContext).toEqual([
      "Make the gallery more editorial.",
      "Use a quieter closing section.",
    ]);
  });

  it("starts a fresh client-feedback context on a different revision PR", () => {
    expect(
      nextClientFeedbackContext(
        {
          revisionPr: "12",
          clientFeedbackContext: ["Old published request."],
        },
        "client",
        ["New request."],
        "18",
      ),
    ).toEqual(["New request."]);
  });

  it("applies only the exact queued feedback comment when requested", () => {
    const comments = [
      {
        created_at: "2026-09-08T10:00:00Z",
        body: "<!-- launchloom-revision:developer -->\nFirst revision",
      },
      {
        created_at: "2026-09-08T09:00:00Z",
        body: "<!-- launchloom-feedback:developer -->\n**Developer feedback**\n\nOlder note",
      },
    ];

    expect(pendingFeedbackFromComments(comments, "developer")).toEqual([]);
    expect(
      pendingFeedbackFromComments([comments[1]], "developer", true),
    ).toEqual([{ text: "Older note", structure: { attachments: [], colors: [] } }]);
  });

  it("parses structured attachments and colors from a feedback comment", () => {
    const body = [
      "<!-- launchloom-feedback:client -->",
      structureMarker({
        attachments: [
          {
            target: "hero",
            kind: "upload",
            url: "https://assets.example.test/feedback/acme/hero-a.webp",
          },
          {
            target: "logo",
            kind: "generated",
            url: "https://assets.example.test/feedback-drafts/acme/logo-b.webp",
            prompt: "A minimal lighthouse mark",
            model: "fal-ai/minimax/image-01",
          },
        ],
        colors: [{ role: "primary", hex: "#1f3a5f" }],
      }),
      "**Client feedback · Hero image**",
      "",
      "Please swap the opening image.",
      "",
      "_Requested changes:_",
      "- Replace the hero image with the uploaded image.",
      "",
      "_Page: https://review.example.pages.dev/_",
    ].join("\n");

    expect(feedbackTextFromComment(body)).toBe(
      "[Hero image] Please swap the opening image.",
    );
    const structure = feedbackStructureFromComment(body);
    expect(structure.attachments).toHaveLength(2);
    expect(structure.attachments[0]).toMatchObject({
      target: "hero",
      kind: "upload",
    });
    expect(structure.attachments[1]).toMatchObject({
      target: "logo",
      kind: "generated",
      prompt: "A minimal lighthouse mark",
    });
    expect(structure.colors).toEqual([{ role: "primary", hex: "#1f3a5f" }]);
    const [request] = pendingFeedbackFromComments(
      [{ created_at: "2026-09-08T09:00:00Z", body }],
      "client",
      true,
    );
    expect(feedbackRequestSummary(request)).toContain(
      "Replace the main image with the uploaded image.",
    );
    expect(feedbackRequestSummary(request)).toContain("generated image");
  });

  it("keeps a structure-only feedback request with an empty note", () => {
    const body = [
      "<!-- launchloom-feedback:developer -->",
      structureMarker({
        attachments: [],
        colors: [{ role: "surface", hex: "#faf7f2" }],
      }),
      "**Developer feedback · Colors**",
      "",
      "_Page: https://review.example.pages.dev/_",
    ].join("\n");
    const requests = pendingFeedbackFromComments(
      [{ created_at: "2026-09-08T09:00:00Z", body }],
      "developer",
      true,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe("[Colors]");
    expect(requests[0].structure.colors).toEqual([
      { role: "surface", hex: "#faf7f2" },
    ]);
  });

  it("ignores malformed structure markers", () => {
    const body =
      "<!-- launchloom-feedback:developer -->\n<!-- launchloom-feedback-structure:not-base64!! -->\n**Developer feedback**\n\nNote\n\n_Page: https://review.example.pages.dev/_";
    expect(feedbackStructureFromComment(body)).toEqual({
      attachments: [],
      colors: [],
    });
  });
});
