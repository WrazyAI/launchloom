import type { FormSubmittedEvent, NetlifyFunction } from "@netlify/functions";
import { dispatch, github, githubRepository } from "./_shared/github";

type Intake = Record<string, string>;

function clean(value: string | undefined, limit = 8000) {
  return (value || "").replace(/\u0000/g, "").trim().slice(0, limit);
}

const intake: NetlifyFunction = {
  async formSubmitted(event: FormSubmittedEvent) {
    const data = event.data as Intake;
    if (data["form-name"] !== "onboarding") return;
    const businessName = clean(data.businessName, 120) || "Untitled business";
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
  },
};

export default intake;
