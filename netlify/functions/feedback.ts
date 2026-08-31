import type { Config, Context } from "@netlify/functions";
import { dispatch, github } from "./_shared/github";
import { verifyReviewToken } from "./_shared/review-token";

export default async function feedback(request: Request, _context: Context) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { token, comment, pageUrl } = await request.json();
    const payload = verifyReviewToken(String(token || ""));
    const note = String(comment || "").trim().slice(0, 5000);
    if (!note) return Response.json({ error: "Please enter feedback first." }, { status: 400 });
    if (!payload.repo.startsWith("WrazyAI/")) return Response.json({ error: "Invalid project." }, { status: 403 });
    await github(`/repos/${payload.repo}/issues/${payload.pr}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `<!-- launchloom-feedback -->\n**Client feedback**\n\n${note}\n\n_Page: ${String(pageUrl || "").slice(0, 1000)}_`,
      }),
    });
    await dispatch("process-feedback", { repo: payload.repo, pr: payload.pr, siteId: payload.siteId });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Feedback failed", error);
    return Response.json({ error: "That review link is invalid or has expired." }, { status: 403 });
  }
}

export const config: Config = { path: "/api/feedback" };
