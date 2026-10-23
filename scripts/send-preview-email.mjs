import fs from "node:fs/promises";
import {
  cleanEmailText,
  isPublicHttpsUrl,
  renderLifecycleEmail,
} from "../emails/render-email.mjs";
import { resolvePreviewLink } from "./preview-link.mjs";
import { previewHostSuffixes } from "../src/lib/preview-proxy-contract.mjs";

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
const audience = [
  "developer",
  "client",
  "delivery-failure",
  "manual-attention",
].includes(args.audience)
  ? args.audience
  : "client";
const feedbackFile = String(args["feedback-file"] || "").trim();
const outcomeFile = String(args["outcome-file"] || "").trim();
const queuedFeedbackFile = String(args["queued-feedback-file"] || "").trim();
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
const queuedFeedback = queuedFeedbackFile
  ? (await fs.readFile(queuedFeedbackFile, "utf8"))
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, 12_000)
  : "";
if (!previewUrl) throw new Error("--preview is required.");
// Never email a localhost or private link: recipients click these and land
// nowhere. Fail before rendering so the operator sees the exact bad input.
for (const [field, value] of [
  ["--preview", previewUrl],
  ["--review", reviewUrl],
]) {
  if (value && !isPublicHttpsUrl(value)) {
    throw new Error(
      `${field} must be a public https URL; refusing to email a localhost or private link (${value.slice(0, 120)}).`,
    );
  }
}

if (!recipient) throw new Error("--to is required.");
// Developer-facing links may point at a preview still covered by the legacy
// Cloudflare Access application. Route those through the authenticated Worker
// proxy so the recipient uses their LaunchLoom account instead of the retired
// Access one-time PIN. Client recipients never receive an admin-only link.
let emailPreviewUrl = previewUrl;
let emailReviewUrl = reviewUrl;
if (audience !== "client") {
  const adminOrigin = String(process.env.LAUNCHLOOM_ADMIN_ORIGIN || "").trim();
  const suffixes = previewHostSuffixes(process.env.LAUNCHLOOM_PREVIEW_HOSTS);
  const resolvedPreview = await resolvePreviewLink({
    previewUrl,
    adminOrigin,
    suffixes,
  });
  emailPreviewUrl = resolvedPreview.url;
  emailReviewUrl =
    reviewUrl === previewUrl
      ? resolvedPreview.url
      : (
          await resolvePreviewLink({
            previewUrl: reviewUrl,
            adminOrigin,
            suffixes,
          })
        ).url;
  console.log(`preview_link=${resolvedPreview.proxied ? "proxied" : "direct"}`);
}
const { subject, html, text } = renderLifecycleEmail({
  audience,
  kind,
  clientName,
  previewUrl: emailPreviewUrl,
  reviewUrl: emailReviewUrl,
  sendAnywayUrl: String(args["send-anyway-url"] || ""),
  diagnosticPrUrl: String(args["diagnostic-pr"] || ""),
  diagnosticRunUrl: String(args["diagnostic-run"] || ""),
  clientFeedback,
  revisionOutcome,
  queuedFeedback,
  queuedStage: String(args["queued-stage"] || "developer"),
});

// Publication queues the rendered envelope in the Worker outbox. Rendering
// has no email side effect and does not require provider credentials.
if (args['envelope-file']) {
  await fs.writeFile(String(args['envelope-file']), JSON.stringify({to:recipient,subject,html,text}));
  process.exit(0);
}

if (!resendKey || !from) {
  console.warn(
    "Email not sent: configure RESEND_API_KEY and LAUNCHLOOM_FROM_EMAIL.",
  );
  console.log("notification=not-sent");
  process.exit(0);
}

const request = {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendKey}`,
    "Content-Type": "application/json",
    ...(args["idempotency-key"]
      ? { "Idempotency-Key": String(args["idempotency-key"]) }
      : {}),
  },
  body: JSON.stringify({
    from,
    to: [recipient],
    subject,
    html,
    text,
    tags: [{ name: "launchloom_kind", value: `${audience}-${kind}` }],
  }),
};
let response;
let lastError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    response = await fetch("https://api.resend.com/emails", {
      ...request,
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status))
      break;
  } catch (error) {
    lastError = error;
  }
  if (attempt < 3)
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
}
if (!response)
  throw new Error(
    `Email delivery failed after 3 attempts: ${lastError instanceof Error ? lastError.message : "network error"}`,
  );
if (!response.ok)
  throw new Error(
    `Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`,
  );
const receipt = await response.json().catch(() => ({}));
console.log(`notification=${audience}`);
if (receipt?.id) console.log(`email_id=${cleanEmailText(receipt.id, 160)}`);
