const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.LAUNCHLOOM_FROM_EMAIL;
const developerEmail = process.env.LAUNCHLOOM_DEV_EMAIL || "zahemen9900@gmail.com";
const previewUrl = String(args.preview || "");
const reviewUrl = String(args.review || previewUrl);
const clientEmail = String(args.to || "").trim();
const clientName = String(args.name || "your new site").trim();
const projectUrl = String(args.project || "");
const forceClient = args["force-client"] === "true";

if (!previewUrl) throw new Error("--preview is required.");

let publicPreview = forceClient;
if (!forceClient) {
  try {
    const response = await fetch(previewUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    publicPreview = response.status >= 200 && response.status < 400;
    console.log(`Preview availability check: ${response.status}`);
  } catch (error) {
    console.warn("Preview availability check failed:", error instanceof Error ? error.message : error);
  }
}

const recipient = publicPreview ? clientEmail : developerEmail;
if (!recipient) throw new Error("A client recipient is required when the preview is public.");
const subject = publicPreview ? `Your ${clientName} website preview is ready` : `Action needed: make ${clientName} preview public`;
const html = publicPreview
  ? `<p>Hi,</p><p>Your new website preview for <strong>${clientName}</strong> is ready to review.</p><p><a href="${reviewUrl}">Open your preview and leave feedback</a></p><p>The review bar at the top lets you send feedback or approve this exact version. For feedback, use the email address that received this message.</p><p>— LaunchLoom</p>`
  : `<p>A LaunchLoom preview for <strong>${clientName}</strong> has been built, but it is not publicly reachable yet.</p><p><a href="${projectUrl}">Make this Netlify project public</a></p><p>Preview: <a href="${previewUrl}">${previewUrl}</a></p><p>No client email was sent. Once public, run the <strong>Notify client preview</strong> GitHub Action for this intake.</p>`;

if (!resendKey || !from) {
  console.warn("Email not sent: configure RESEND_API_KEY and LAUNCHLOOM_FROM_EMAIL.");
  console.log(`notification=${publicPreview ? "client" : "developer"}`);
  process.exit(0);
}

const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject, html, tags: [{ name: "launchloom_kind", value: publicPreview ? "client-preview" : "visibility-action" }] }) });
if (!response.ok) throw new Error(`Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`);
console.log(`notification=${publicPreview ? "client" : "developer"}`);
