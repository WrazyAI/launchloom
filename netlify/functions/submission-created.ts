import { dispatch, github, githubRepository } from "./_shared/github";

type Intake = Record<string, string>;

function clean(value: string | undefined, limit = 8000) {
  return (value || "").replace(/\u0000/g, "").trim().slice(0, limit);
}

function readSubmissionData(event: unknown): Intake {
  let payload: any = event;
  if (payload && typeof payload === "object" && typeof payload.body === "string") {
    try {
      payload = JSON.parse(payload.body);
    } catch {
      return {};
    }
  }
  const data = payload?.payload?.data || payload?.data || payload?.payload || {};
  return data && typeof data === "object" ? data as Intake : {};
}

// Netlify's event-function filename convention maps submission-created to
// verified Netlify Form submissions. It is intentionally not web-accessible.
export default async function submissionCreated(event: unknown) {
  const data = readSubmissionData(event);
  const businessName = clean(data.businessName, 120);
  if (!businessName) return;

  const safeData = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, clean(value)]));
  const { owner, repo } = githubRepository();
  const issue = await github(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: `Intake: ${businessName}`,
      body: `<!-- launchloom-intake -->\n\n\`\`\`json\n${JSON.stringify(safeData, null, 2)}\n\`\`\``,
    }),
  }).then((response) => response.json() as Promise<{ number: number }>);
  await dispatch("intake-submitted", { issue: issue.number });
}
