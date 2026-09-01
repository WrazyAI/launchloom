const githubToken = process.env.GH_TOKEN;
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.LAUNCHLOOM_FROM_EMAIL;
const repository = process.env.LAUNCHLOOM_GITHUB_REPOSITORY || "WrazyAI/launchloom";

if (!githubToken) throw new Error("GH_TOKEN is required.");
if (!resendKey || !from) throw new Error("RESEND_API_KEY and LAUNCHLOOM_FROM_EMAIL are required.");

const githubHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${githubToken}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...githubHeaders, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? null : response.json();
}

function intakeFrom(body) {
  const match = String(body || "").match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error("Intake data is missing.");
  const intake = JSON.parse(match[1]);
  if (!intake.email || !intake.businessName) throw new Error("Intake email or business name is missing.");
  return intake;
}

function handoffFrom(comments) {
  const handoff = [...comments].reverse().find((comment) => comment.body?.includes("<!-- launchloom-client-ready -->"));
  if (!handoff) return null;
  const text = handoff.body;
  const preview = text.match(/(?:^|\n)Preview: (https?:\/\/[^\s\\]+)/)?.[1];
  const review = text.match(/(?:^|\n)Review link: (https?:\/\/[^\s\\]+)/)?.[1];
  return preview && review ? { preview, review } : null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

async function isPublic(url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function sendClientEmail({ email, businessName, review }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Your ${businessName} website preview is ready`,
      html: `<p>Hi,</p><p>Your new website preview for <strong>${escapeHtml(businessName)}</strong> is ready to review.</p><p><a href="${escapeHtml(review)}">Open your preview and leave feedback</a></p><p>The review bar at the top lets you send feedback or approve this exact version. For feedback, use the email address that received this message.</p><p>— LaunchLoom</p>`,
      tags: [{ name: "launchloom_kind", value: "client-preview" }],
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected email: ${response.status} ${(await response.text()).slice(0, 300)}`);
}

const issues = await github(`/repos/${repository}/issues?state=open&per_page=100`);
let sent = 0;
for (const issue of issues.filter((item) => item.body?.includes("<!-- launchloom-intake"))) {
  const comments = await github(`/repos/${repository}/issues/${issue.number}/comments?per_page=100`);
  if (comments.some((comment) => comment.body?.includes("<!-- launchloom-client-notified -->"))) continue;
  const handoff = handoffFrom(comments);
  if (!handoff || !(await isPublic(handoff.preview))) {
    console.log(`Issue #${issue.number}: preview is not public yet.`);
    continue;
  }
  const intake = intakeFrom(issue.body);
  await sendClientEmail({ email: intake.email, businessName: intake.businessName, review: handoff.review });
  await github(`/repos/${repository}/issues/${issue.number}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "<!-- launchloom-client-notified -->\n\nPreview-ready email sent automatically after the preview became public." }),
  });
  sent += 1;
  console.log(`Issue #${issue.number}: client preview email sent.`);
}
console.log(`Completed. Sent ${sent} preview-ready email(s).`);
