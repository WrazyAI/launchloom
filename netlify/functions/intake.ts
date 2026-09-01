import type { Config, Context } from "@netlify/functions";
import { dispatch, github, githubRepository } from "./_shared/github";

type Intake = Record<string, string>;

function clean(value: unknown, limit = 8000) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, limit);
}

export default async function intake(request: Request, _context: Context) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(process.env.LAUNCHLOOM_PUBLIC_URL || request.url).origin;
    if (origin !== expectedOrigin) return Response.json({ error: "Invalid intake origin." }, { status: 403 });
    const raw = await request.json() as Intake;
    if (clean(raw["bot-field"]) || !clean(raw.submissionId, 100)) return Response.json({ error: "Invalid intake." }, { status: 400 });
    const businessName = clean(raw.businessName, 120);
    const email = clean(raw.email, 240);
    if (!businessName || !email || !clean(raw.confirmAccuracy, 10) || !clean(raw.confirmRights, 10)) return Response.json({ error: "Please complete the required business details." }, { status: 400 });
    const safeData = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, clean(value)]));
    const { owner, repo } = githubRepository();
    const recent = await github(`/repos/${owner}/${repo}/issues?state=open&per_page=100`).then((response) => response.json() as Promise<Array<{ body?: string; number: number }>>);
    const marker = `<!-- launchloom-intake:${safeData.submissionId} -->`;
    const duplicate = recent.find((issue) => issue.body?.includes(marker));
    if (duplicate) return Response.json({ ok: true, duplicate: true, issue: duplicate.number });
    const issue = await github(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: `Intake: ${businessName}`, body: `${marker}\n\n\`\`\`json\n${JSON.stringify(safeData, null, 2)}\n\`\`\`` }),
    }).then((response) => response.json() as Promise<{ number: number }>);
    await dispatch("intake-submitted", { issue: issue.number });
    return Response.json({ ok: true, issue: issue.number });
  } catch (error) {
    console.error("Intake handoff failed", error);
    return Response.json({ error: "We couldn’t start your preview. Please try once more." }, { status: 500 });
  }
}

export const config: Config = { path: "/api/intake" };
