import { describe, expect, it } from "vitest";
import {
  feedbackTextFromComment,
  nextClientFeedbackContext,
  pendingFeedbackFromComments,
  revisionIntakeFromConfig,
} from "../scripts/feedback-utils.mjs";

describe("revision feedback", () => {
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
    ).toEqual(["Older note"]);
  });
});
