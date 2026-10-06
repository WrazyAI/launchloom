import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderLeadConfirmationEmail,
  renderLeadEmail,
  renderLifecycleEmail,
} from "../emails/render-email.mjs";

const signedReviewUrl =
  "https://review.example.pages.dev/services?review=eyJzaXRlSWQiOiJ0ZXN0In0.signature&next=%2Fhome";

describe("LaunchLoom lifecycle emails", () => {
  it("shows SEO research readiness in the initial developer email", () => {
    const email = renderLifecycleEmail({
      audience: "developer",
      kind: "initial",
      clientName: "Harbor Plumbing",
      previewUrl: "https://preview.example",
      reviewUrl: "https://review.example",
      revisionOutcome:
        "Research is incomplete. Production approval is blocked until research succeeds.",
    });

    expect(email.html).toContain("SEO research status");
    expect(email.text).toContain("Production approval is blocked");
  });

  it.each([
    ["developer", "initial", "Review developer preview"],
    ["developer", "revision", "Review developer preview"],
    ["client", "published", "Review your website"],
    ["delivery-failure", "published", "Open production website"],
    ["manual-attention", "revision-failed", "Open reviewed website"],
    ["manual-attention", "generation-failed", "Review failed request"],
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
      previewUrl: "https://review.example.pages.dev/services/",
      reviewUrl: "https://review.example.pages.dev/services/",
      diagnosticPrUrl: "https://github.com/WrazyAI/example/pull/2",
      diagnosticRunUrl: "https://github.com/WrazyAI/launchloom/actions/runs/123",
      clientFeedback: "Simplify the hero and add a chatbot.",
      revisionOutcome: "The chatbot request needs manual implementation.",
    });

    expect(email.subject).toContain("Revision needs attention");
    expect(email.html).toContain("Feedback that needs attention");
    expect(email.text).toContain("Simplify the hero");
    expect(email.text).toContain("needs manual implementation");
    expect(email.text).toContain("Open reviewed website: https://review.example.pages.dev/services/");
    expect(email.text).toContain("Pull request: https://github.com/WrazyAI/example/pull/2");
    expect(email.text).toContain("Actions run: https://github.com/WrazyAI/launchloom/actions/runs/123");
    const primaryHref = email.html.match(/href="([^"]+)"/)?.[1];
    expect(primaryHref).toBe("https://review.example.pages.dev/services/");
    expect(email.html).toContain("Diagnostics:");
    expect(email.html).not.toContain("—");
  });

  it("does not label a GitHub generation-failure destination as a reviewed website", () => {
    const email = renderLifecycleEmail({
      audience: "manual-attention",
      kind: "generation-failed",
      clientName: "North Shore Care",
      previewUrl: "https://github.com/WrazyAI/launchloom/issues/3",
      reviewUrl: "https://github.com/WrazyAI/launchloom/actions/runs/4",
    });

    expect(email.html).toContain("Review failed request");
    expect(email.html).not.toContain("Open reviewed website");
    const primaryHref = email.html.match(/href="([^"]+)"/)?.[1];
    expect(primaryHref).toBe(
      "https://github.com/WrazyAI/launchloom/actions/runs/4",
    );
    expect(email.text).toContain(
      "Review failed request: https://github.com/WrazyAI/launchloom/actions/runs/4",
    );
  });

  it("offers a warned, explicit send-anyway destination only for eligible previews", () => {
    const destination = `${signedReviewUrl}&intent=send-anyway`;
    const eligible = renderLifecycleEmail({
      audience: "manual-attention",
      kind: "revision-failed",
      clientName: "North Shore Care",
      previewUrl: "https://creative-diagnostic.example.pages.dev",
      reviewUrl: "https://launchloom.example/review?token=diagnostic-token",
      sendAnywayUrl: destination,
    });
    const ineligible = renderLifecycleEmail({
      audience: "manual-attention",
      kind: "generation-failed",
      clientName: "North Shore Care",
      previewUrl: "https://github.com/WrazyAI/example/issues/3",
      reviewUrl: "https://github.com/WrazyAI/example/actions/runs/4",
    });

    expect(eligible.html).toContain("Send this version anyway");
    expect(eligible.html).toContain("not recommended");
    expect(eligible.html.replace(/&amp;/g, "&")).toContain(destination);
    expect(eligible.text).toContain(
      "SEND THIS VERSION ANYWAY (NOT RECOMMENDED)",
    );
    expect(eligible.text).toContain(destination);
    expect(ineligible.html).not.toContain("Send this version anyway");
    expect(ineligible.text).not.toContain("Send this version anyway");
  });

  it("includes the client's own triggering request after an approved client revision", () => {
    const email = renderLifecycleEmail({
      audience: "client",
      kind: "published",
      clientName: "North Shore Care",
      previewUrl: "https://north-shore-care.pages.dev",
      reviewUrl: signedReviewUrl,
      clientFeedback:
        "[Layout] Make the gallery feel more editorial and move the CTA below it.",
    });

    expect(email.html).toContain("Your feedback reflected in this revision");
    expect(email.text).toContain(
      "Make the gallery feel more editorial and move the CTA below it.",
    );
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

describe("LaunchLoom email link safety", () => {
  it("refuses to render lifecycle emails with localhost or private action links", () => {
    expect(() =>
      renderLifecycleEmail({
        audience: "developer",
        kind: "initial",
        clientName: "North Shore Care",
        previewUrl: "http://localhost:4321/services",
        reviewUrl: "http://localhost:4321/review?token=abc",
      }),
    ).toThrow(/public https URL/u);
    expect(() =>
      renderLifecycleEmail({
        audience: "client",
        kind: "published",
        clientName: "North Shore Care",
        previewUrl: "https://north-shore-care.pages.dev",
        reviewUrl: "https://localhost/review?token=abc",
      }),
    ).toThrow(/public https URL/u);
    expect(() =>
      renderLifecycleEmail({
        audience: "manual-attention",
        kind: "revision-failed",
        clientName: "North Shore Care",
        previewUrl: "https://north-shore-care.pages.dev",
        reviewUrl: "https://north-shore-care.pages.dev",
        sendAnywayUrl: "http://127.0.0.1:8787/review?token=abc",
      }),
    ).toThrow(/public https URL/u);
  });

  it("omits a private enquiry-page link from lead emails", () => {
    const email = renderLeadEmail({
      name: "Ada Lovelace",
      phone: "555-0100",
      email: "ada@example.test",
      message: "Please call me about repairs.",
      project: "Harbor & Pine",
      pageUrl: "http://localhost:4321/services",
    });

    expect(email.html).not.toContain("localhost");
    expect(email.text).not.toContain("localhost");
    expect(email.text).not.toContain("Website enquiry page");
  });

  it("keeps a public https action link byte-exact", () => {
    const email = renderLifecycleEmail({
      audience: "developer",
      kind: "initial",
      clientName: "North Shore Care",
      previewUrl: "https://north-shore-care.pages.dev",
      reviewUrl: signedReviewUrl,
    });

    expect(email.html.replace(/&amp;/g, "&")).toContain(signedReviewUrl);
  });

  it("refuses to mint review links from a localhost platform origin", () => {
    const script = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../scripts/create-review-link.mjs",
    );
    const run = (extraEnv: Record<string, string>) => {
      try {
        const stdout = execFileSync(
          process.execPath,
          [
            script,
            "--stage",
            "client",
            "--repo",
            "WrazyAI/launchloom-example",
            "--site",
            "launchloom-example",
            "--email",
            "david@maigreeks.com",
            "--client-email",
            "client@example.test",
            "--feedback-issue",
            "1",
            "--origins",
            "https://launchloom-example.pages.dev",
          ],
          {
            env: {
              ...process.env,
              REVIEW_SIGNING_SECRET: "test-secret",
              ...extraEnv,
            },
            encoding: "utf8",
            stdio: "pipe",
          },
        );
        return { ok: true, stdout, stderr: "" };
      } catch (error) {
        return {
          ok: false,
          stdout: "",
          stderr: String((error as { stderr?: unknown }).stderr || ""),
        };
      }
    };

    const localhost = run({ LAUNCHLOOM_PLATFORM_URL: "http://localhost:4321" });
    expect(localhost.ok).toBe(false);
    expect(localhost.stderr).toMatch(/public https origin/u);

    const official = run({});
    expect(official.ok).toBe(true);
    expect(official.stdout).toMatch(
      /^https:\/\/launchloom\.wrazyos\.com\/review\?token=/u,
    );
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
      consent: "By submitting, you agree to be contacted.",
      submittedAt: "2026-10-05T12:34:56.000Z",
    });

    expect(email.html).toContain("Ada &lt;Admin&gt;");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Daily &amp; overnight");
    expect(email.html).toContain(">the website enquiry page</a>");
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("2026-10-05 12:34 UTC");
    expect(email.html).toContain(
      "The visitor submitted this request with the consent: &quot;By submitting, you agree to be contacted.&quot;",
    );
    expect(email.text).toContain(
      "Website enquiry page: https://harbor.example/services?from=form&kind=care",
    );
    expect(email.text).toContain("Reply directly to this email");
    expect(email.text).toContain(
      "Consent shown at submission: By submitting, you agree to be contacted.",
    );
  });

  it("renders a structured visitor confirmation without em dashes", () => {
    const email = renderLeadConfirmationEmail({
      name: "Ada Lovelace",
      phone: "555-0100",
      email: "ada@example.test",
      message: "Please call me about <repairs>.",
      project: "Harbor & Pine",
      qualification: [["Support type", "Repair & maintenance"]],
      businessPhone: "(555) 555-0199",
    });

    expect(email.subject).toBe("We received your request - Harbor & Pine");
    expect(email.html).toContain("Thanks, Ada. Your request is with Harbor &amp; Pine.");
    expect(email.html).toContain("Repair &amp; maintenance");
    expect(email.html).toContain("&lt;repairs&gt;");
    expect(email.html).toContain("If you need help sooner, call (555) 555-0199.");
    expect(email.html).toContain("What happens next");
    expect(email.html).not.toContain("—");
    expect(email.text).toContain("REQUEST RECEIVED");
    expect(email.text).toContain("Thanks, Ada.");
    expect(email.text).toContain("If you need help sooner, call (555) 555-0199.");
  });
});
