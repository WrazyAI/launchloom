import type { Config, Context } from "@netlify/functions";
import { dispatch, github } from "./_shared/github";
import { verifyReviewToken } from "./_shared/review-token";

export default async function feedback(request: Request, _context: Context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const { token, comment, pageUrl, email, category } = await request.json();
    const payload = verifyReviewToken(String(token || ""));
    const note = String(comment || "").trim().slice(0, 5000);
    if (!note) return Response.json({ error: "Please enter feedback first." }, { status: 400, headers: cors });
    const submittedEmail = String(email || "").trim().toLowerCase();
    if (!submittedEmail || submittedEmail !== payload.clientEmail.toLowerCase()) {
      return Response.json({ error: "That email doesn’t match the email invited to review this site." }, { status: 403, headers: cors });
    }
    if (!payload.repo.startsWith("WrazyAI/")) return Response.json({ error: "Invalid project." }, { status: 403, headers: cors });
    await github(`/repos/${payload.repo}/issues/${payload.pr}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `<!-- launchloom-feedback -->\n**Client feedback${category ? ` · ${String(category).slice(0, 80)}` : ""}**\n\n${note}\n\n_Page: ${String(pageUrl || "").slice(0, 1000)}_`,
      }),
    });
    await dispatch("process-feedback", { repo: payload.repo, pr: payload.pr, siteId: payload.siteId });
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    console.error("Feedback failed", error);
    return Response.json({ error: "That review link is invalid or has expired." }, { status: 403, headers: cors });
  }
}

export const config: Config = { path: "/api/feedback" };
