import { describe, expect, it } from "vitest";
import {
  renderLeadEmail,
  renderLifecycleEmail,
} from "../emails/render-email.mjs";

const signedReviewUrl =
  "https://review.example.pages.dev/services?review=eyJzaXRlSWQiOiJ0ZXN0In0.signature&next=%2Fhome";

describe("LaunchLoom lifecycle emails", () => {
  it.each([
    ["developer", "initial", "Review developer preview"],
    ["developer", "revision", "Review developer preview"],
    ["client", "published", "Review your website"],
    ["delivery-failure", "published", "Open production website"],
    ["manual-attention", "revision-failed", "Review failed request"],
  ] as const)(
    "renders the %s %s stage with HTML and text",
    (audience, kind, label) => {
      const email = renderLifecycleEmail({
        audience,
        kind,
        clientName: "North Shore Care",
        previewUrl: "https://north-shore-care.pages.dev",
        reviewUrl: signedReviewUrl,
      });

      expect(email.html).toContain("LaunchLoom");
      expect(email.html).toContain(label);
      expect(email.html).toContain('role="presentation"');
      expect(email.text).toContain(label);
      expect(email.text).toContain("https://");
      expect(email.subject).toContain("North Shore Care");
      expect(email.html).not.toContain(">" + signedReviewUrl + "<");
      expect(email.html).not.toContain("—");
      expect(email.text).not.toContain("—");
    },
  );

  it("includes preserved feedback and the failure reason in manual-attention email", () => {
    const email = renderLifecycleEmail({
      audience: "manual-attention",
      kind: "revision-failed",
      clientName: "North Shore Care",
      previewUrl: "https://github.com/WrazyAI/example/pull/2",
      reviewUrl: "https://github.com/WrazyAI/example/pull/2",
      clientFeedback: "Simplify the hero and add a chatbot.",
      revisionOutcome: "The chatbot request needs manual implementation.",
    });

    expect(email.subject).toContain("Revision needs attention");
    expect(email.html).toContain("Feedback that needs attention");
    expect(email.text).toContain("Simplify the hero");
    expect(email.text).toContain("needs manual implementation");
    expect(email.html).not.toContain("—");
  });

  it("preserves the exact signed review destination in the CTA", () => {
    const email = renderLifecycleEmail({
      audience: "developer",
      kind: "initial",
      clientName: "North Shore Care",
      previewUrl: "https://north-shore-care.pages.dev",
      reviewUrl: signedReviewUrl,
    });
    const href = email.html.match(/href="([^"]+)"/)?.[1];

    expect(href?.replace(/&amp;/g, "&")).toBe(signedReviewUrl);
    expect(email.html).toContain(">Review developer preview</a>");
  });

  it("formats multiple and long feedback safely with a truthful outcome", () => {
    const maliciousFeedback = [
      "[Layout] Move the form above the services.",
      "[Copy] Keep <script>alert('x')</script> & clarify eligibility.",
      "x".repeat(14_000),
    ].join("\n\n");
    const email = renderLifecycleEmail({
      audience: "developer",
      kind: "revision",
      clientName: "Care & Co <test>",
      previewUrl: "https://care.example.pages.dev",
      reviewUrl: signedReviewUrl,
      clientFeedback: maliciousFeedback,
      revisionOutcome:
        "Applied both supported changes; no business facts changed.",
    });

    expect(email.html).toContain("Feedback that informed this revision");
    expect(email.html).toContain("Revision outcome");
    expect(email.html).toContain(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).not.toContain("Care & Co <test>");
    expect(email.text).toContain("Applied both supported changes");
    expect(email.text.length).toBeLessThan(14_000);
  });

  it("shows the promoted queued request in the developer revision email", () => {
    const email = renderLifecycleEmail({
      audience: "developer",
      kind: "revision",
      clientName: "North Shore Care",
      previewUrl: "https://north-shore-care.pages.dev",
      reviewUrl: signedReviewUrl,
      clientFeedback: "[Wording] Tighten the headline.",
      queuedFeedback: "[Photos] Replace the team photo.",
      queuedStage: "developer",
    });

    expect(email.html).toContain("Your queued request is now in progress");
    expect(email.html).toContain("Replace the team photo.");
    expect(email.text).toContain("YOUR QUEUED REQUEST IS NOW IN PROGRESS");
    expect(email.html).not.toContain("—");
  });
});

describe("LaunchLoom lead emails", () => {
  it("renders and escapes every submitted field", () => {
    const email = renderLeadEmail({
      name: "Ada <Admin>",
      phone: "<img src=x onerror=alert(1)>",
      email: "ada&team@example.test",
      message: "Need help </td><script>alert(1)</script>\nNext week.",
      project: "Harbor & Pine",
      pageUrl: "https://harbor.example/services?from=form&kind=care",
      qualification: [
        ["Support <type>", "Daily & overnight"],
        ["Start", "Within <2 weeks"],
      ],
    });

    expect(email.html).toContain("Ada &lt;Admin&gt;");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Daily &amp; overnight");
    expect(email.html).toContain(">the website enquiry page</a>");
    expect(email.html).not.toContain("<script>alert");
    expect(email.text).toContain(
      "Website enquiry page: https://harbor.example/services?from=form&kind=care",
    );
    expect(email.text).toContain("Reply directly to this email");
  });
});
