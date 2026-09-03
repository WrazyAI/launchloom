const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.LAUNCHLOOM_FROM_EMAIL;
const developerEmail = process.env.LAUNCHLOOM_DEV_EMAIL || "zahemen9900@gmail.com";
const previewUrl = String(args.preview || "");
const reviewUrl = String(args.review || previewUrl);
const clientEmail = String(args.to || "").trim();
const clientName = String(args.name || "your new site").trim();
const kind = String(args.kind || "preview");

if (!previewUrl) throw new Error("--preview is required.");

if (!clientEmail) throw new Error("--to is required.");
const subject = `Your ${clientName} website preview is ready`;
const html = `<p>Hi,</p><p>Your ${kind === "revision" ? "updated " : ""}website preview for <strong>${clientName}</strong> is ready to review.</p><p><a href="${reviewUrl}">Open your preview and leave feedback</a></p><p>The review bar at the top lets you send feedback or approve this exact version. For feedback, use the email address that received this message.</p><p>— LaunchLoom</p>`;

if (!resendKey || !from) {
  console.warn("Email not sent: configure RESEND_API_KEY and LAUNCHLOOM_FROM_EMAIL.");
  console.log("notification=not-sent");
  process.exit(0);
}

for (const recipient of new Set([clientEmail, developerEmail].filter(Boolean))) {
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject, html, tags: [{ name: "launchloom_kind", value: `${kind}-preview` }] }) });
  if (!response.ok) throw new Error(`Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`);
}
console.log("notification=client-and-developer");
