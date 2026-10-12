import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Find the exact operation's production deployment after an ambiguous upload.
// The public commit alone cannot prove that this operation owns a deployment.
export async function findPublicationDeployment(
  env = process.env,
  request = fetch,
) {
  const {
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_API_TOKEN: token,
    PUBLICATION_PROJECT: project,
    PUBLICATION_ID: id,
    APPROVED_SHA: sha,
  } = env;
  if (!account || !token || !project || !id || !sha)
    throw Error("Publication deployment identity is incomplete.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}`;
  async function get(url) {
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || !body.success)
      throw Error("Cloudflare deployment readback unavailable.");
    return body;
  }
  const current = (await get(base)).result;
  for (let page = 1; page <= 100; page++) {
    const body = await get(`${base}/deployments?per_page=25&page=${page}`);
    const rows = body.result;
    if (!Array.isArray(rows))
      throw Error("Invalid Cloudflare deployment response.");
    const match = rows.find(
      (d) =>
        d.environment === "production" &&
        d.deployment_trigger?.metadata?.commit_hash === sha &&
        d.deployment_trigger?.metadata?.commit_message ===
          `LaunchLoom publication ${id}`,
    );
    if (match) {
      if (current.canonical_deployment?.id !== match.id)
        throw Error(
          "Publication deployment was superseded; do not overwrite it.",
        );
      if (
        match.latest_stage?.status !== "success" ||
        match.latest_stage?.name !== "deploy" ||
        match.is_skipped === true
      )
        throw Error("Publication deployment has not completed successfully.");
      const deployment = {
        id: match.id,
        origin: `https://${project}.pages.dev`,
        commit: sha,
      };
      await fs.writeFile(
        env.PUBLICATION_DEPLOYMENT_FILE,
        JSON.stringify(deployment),
      );
      return deployment;
    }
    const totalPages = body.result_info?.total_pages;
    if (Number.isInteger(totalPages) && totalPages > 0) {
      if (page >= totalPages) return null;
    } else if (rows.length < 25) return null;
  }
  throw Error(
    "Publication deployment reconciliation exceeded 2500 records; operator action required.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await findPublicationDeployment();
  if (!result && process.env.PUBLICATION_REQUIRE_DEPLOYMENT === "true")
    throw Error("Exact publication deployment is missing.");
  console.log(`publication_deployment_found=${!!result}`);
}
