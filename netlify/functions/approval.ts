import type { Config, Context } from "@netlify/functions";
import { dispatch, github } from "./_shared/github";
import { verifyReviewToken } from "./_shared/review-token";

export default async function approval(request: Request, _context: Context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const { token } = await request.json();
    const payload = verifyReviewToken(String(token || ""));
    if (!payload.repo.startsWith("WrazyAI/")) return Response.json({ error: "Invalid project." }, { status: 403, headers: cors });
    const current = await github(`/repos/${payload.repo}/pulls/${payload.pr}`).then((response) => response.json() as Promise<{ head: { sha: string }; state: string; draft: boolean }>);
    if (current.state !== "open" || current.draft || current.head.sha !== payload.headSha) {
      return Response.json({ error: "This preview has changed. Ask for a fresh approval link." }, { status: 409, headers: cors });
    }
    await github(`/repos/${payload.repo}/pulls/${payload.pr}/merge`, {
      method: "PUT",
      body: JSON.stringify({ sha: payload.headSha, merge_method: "squash", commit_title: "LaunchLoom approved site" }),
    });
    await dispatch("publish-site", { repo: payload.repo, siteId: payload.siteId });
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    console.error("Approval failed", error);
    return Response.json({ error: "We couldn’t approve this version. Ask for a fresh review link." }, { status: 403, headers: cors });
  }
}

export const config: Config = { path: "/api/approval" };
