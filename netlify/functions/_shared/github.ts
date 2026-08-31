const API = "https://api.github.com";

export function githubRepository() {
  const repository = process.env.LAUNCHLOOM_GITHUB_REPOSITORY || "WrazyAI/launchloom";
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("LAUNCHLOOM_GITHUB_REPOSITORY must be owner/repository.");
  return { owner, repo, repository };
}

export async function github(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_ORG_TOKEN;
  if (!token) throw new Error("GITHUB_ORG_TOKEN is not configured.");

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${response.status}: ${text.slice(0, 300)}`);
  }
  return response;
}

export async function dispatch(eventType: string, clientPayload: Record<string, unknown>) {
  const { owner, repo } = githubRepository();
  await github(`/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
  });
}
