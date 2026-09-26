import { describe, expect, it } from "vitest";
import { renderIntakeReceivedEmail } from "../emails/render-email.mjs";

describe("LaunchLoom intake received email", () => {
  it("confirms receipt and that processing is starting without promising a timeline", () => {
    const email = renderIntakeReceivedEmail({
      businessName: "Harbor Plumbing",
    });

    expect(email.subject).toMatch(/intake.*received/iu);
    expect(email.html).toContain("Harbor Plumbing");
    expect(email.text).toContain("Harbor Plumbing");
    expect(email.text).toMatch(/received/iu);
    expect(email.text).toMatch(/processing is starting/iu);
    expect(email.text).not.toMatch(
      /\b(today|tomorrow|\d+\s+(?:hours?|days?|weeks?))\b/iu,
    );
    expect(email.text).not.toMatch(/guarantee|promise|will be ready/iu);
  });

  it("escapes an untrusted business name in HTML and removes header line breaks", () => {
    const email = renderIntakeReceivedEmail({
      businessName:
        'Evil </title><script>alert("x")</script>\r\nBcc: thief@example.test & Co',
    });

    expect(email.subject).not.toMatch(/[\r\n]/u);
    expect(email.html).toContain(
      "Evil &lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Bcc: thief@example.test &amp; Co",
    );
    expect(email.html).not.toContain("<script>alert");
    expect(email.text).toContain(
      'Evil </title><script>alert("x")</script> Bcc: thief@example.test & Co',
    );
  });

  it("uses a safe generic greeting when the business name is empty", () => {
    const email = renderIntakeReceivedEmail({ businessName: "   " });

    expect(email.subject).toContain("Your business");
    expect(email.text).toContain("Your business");
  });
});
