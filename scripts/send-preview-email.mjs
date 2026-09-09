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

if (!recipient) throw new Error("--to is required.");
const { subject, html, text } = renderLifecycleEmail({
  audience,
  kind,
  clientName,
  previewUrl,
  reviewUrl,
  clientFeedback,
  revisionOutcome,
  queuedFeedback,
  queuedStage: String(args["queued-stage"] || "developer"),
});

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
