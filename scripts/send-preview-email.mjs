import fs from "node:fs/promises";
import {
  cleanEmailText,
  renderLifecycleEmail,
} from "../emails/render-email.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.LAUNCHLOOM_FROM_EMAIL;
const previewUrl = String(args.preview || "");
const reviewUrl = String(args.review || previewUrl);
const recipient = String(args.to || "").trim();
const clientName = cleanEmailText(args.name || "your new site", 160);
const kind = String(args.kind || "preview");
const audience = ["developer", "client", "delivery-failure"].includes(
  args.audience,
)
  ? args.audience
  : "client";
const feedbackFile = String(args["feedback-file"] || "").trim();
const outcomeFile = String(args["outcome-file"] || "").trim();
const clientFeedback = feedbackFile
  ? (await fs.readFile(feedbackFile, "utf8"))
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, 12_000)
  : "";
const revisionOutcome = outcomeFile
  ? (await fs.readFile(outcomeFile, "utf8"))
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, 1_000)
  : "";
if (!previewUrl) throw new Error("--preview is required.");

if (!recipient) throw new Error("--to is required.");
const { subject, html, text } = renderLifecycleEmail({
  audience,
  kind,
  clientName,
  previewUrl,
  reviewUrl,
  clientFeedback,
  revisionOutcome,
});

if (!resendKey || !from) {
  console.warn(
    "Email not sent: configure RESEND_API_KEY and LAUNCHLOOM_FROM_EMAIL.",
  );
  console.log("notification=not-sent");
  process.exit(0);
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [recipient],
    subject,
    html,
    text,
    tags: [{ name: "launchloom_kind", value: `${audience}-${kind}` }],
  }),
});
if (!response.ok)
  throw new Error(
    `Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`,
  );
console.log(`notification=${audience}`);
