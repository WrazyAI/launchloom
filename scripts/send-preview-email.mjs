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
const clientName = String(args.name || "your new site").trim();
const kind = String(args.kind || "preview");
const audience = ["developer", "client", "delivery-failure"].includes(
  args.audience,
)
  ? args.audience
  : "client";

if (!previewUrl) throw new Error("--preview is required.");

if (!recipient) throw new Error("--to is required.");
const developer = audience === "developer";
const deliveryFailure = audience === "delivery-failure";
const subject = deliveryFailure
  ? `Client delivery needs attention: ${clientName}`
  : developer
    ? `Developer review required: ${clientName}`
    : `Your ${clientName} website is ready to review`;
const html = deliveryFailure
  ? `<p>Hi David,</p><p>The production website for <strong>${clientName}</strong> deployed, but Resend rejected the client delivery email.</p><p><a href="${reviewUrl}">Open the production website</a></p><p>Please confirm or correct the client email before sending the link manually.</p><p>— LaunchLoom</p>`
  : developer
    ? `<p>Hi David,</p><p>A ${kind === "revision" ? "revised" : "new"} website preview for <strong>${clientName}</strong> is ready for internal review.</p><p><a href="${reviewUrl}">Open developer preview</a></p><p>Approve it to publish and invite the client, or leave feedback for another revision.</p><p>— LaunchLoom</p>`
    : `<p>Hi,</p><p>Your ${kind === "revision" ? "updated " : ""}website for <strong>${clientName}</strong> is live and ready for your review.</p><p><a href="${reviewUrl}">Open your website and leave feedback</a></p><p>Use the review bar at the top to send any requested changes. We will review them before publishing an update.</p><p>— LaunchLoom</p>`;

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
    tags: [{ name: "launchloom_kind", value: `${audience}-${kind}` }],
  }),
});
if (!response.ok)
  throw new Error(
    `Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`,
  );
console.log(`notification=${audience}`);
