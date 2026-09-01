import type { FormSubmittedEvent } from "@netlify/functions";
import { dispatch, github, githubRepository } from "./_shared/github";

type Intake = Record<string, string>;

function clean(value: string | undefined, limit = 8000) {
  return (value || "").replace(/\u0000/g, "").trim().slice(0, limit);
}

async function formSubmitted(event: FormSubmittedEvent) {
  // Netlify verifies the form submission and its signature before it invokes
  // this background event handler. event.data is the submitted field map.
  const data = event.data as Intake;
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

// Platform events use an object export. A bare default function is a web
// handler and will not be subscribed to Netlify Forms events.
export default { formSubmitted };
