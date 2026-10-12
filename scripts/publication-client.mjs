import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function coordinatePublication(
  env = process.env,
  request = fetch,
) {
  const {
    PUBLICATION_ACTION: action,
    CLIENT_REPO: repo,
    PUBLICATION_ID: publicationId,
    REVISION_COORDINATOR_SECRET: secret,
  } = env;
  if (
    ![
      "claim",
      "authorize-upload",
      "uploaded",
      "published",
      "fail",
      "dismiss",
      "status",
      "retry",
    ].includes(action) ||
    !repo ||
    !publicationId ||
    !secret
  )
    throw Error(
      "Publication action, repository, operation ID, and coordinator secret are required.",
    );
  const api = (
    env.LAUNCHLOOM_API_URL || "https://api.launchloom.wrazyos.com"
  ).replace(/\/$/u, "");
  const runId =
    env.PUBLICATION_RUN_ID || `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`;
  const body = {
    action,
    repo,
    publicationId,
    runId,
    reason: env.PUBLICATION_FAILURE_REASON,
  };
  if (action === "uploaded")
    body.deployment = JSON.parse(
      await fs.readFile(env.PUBLICATION_DEPLOYMENT_FILE, "utf8"),
    );
  if (action === "published")
    body.delivery = JSON.parse(
      await fs.readFile(env.PUBLICATION_DELIVERY_FILE, "utf8"),
    );
  const response = await request(`${api}/api/internal/publications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (
    !response.ok ||
    (["authorize-upload", "uploaded", "published", "retry", "dismiss"].includes(
      action,
    ) &&
      result.allowed !== true)
  )
    throw Error(
      `Publication ${action} rejected (${response.status}, ${result.state || "unavailable"}).`,
    );
  if (env.GITHUB_OUTPUT) {
    const outputs = {
      run: result.run === true,
      skip_upload: result.skipUpload === true,
      state: result.state,
      approved_sha: result.approvedSha,
    };
    for (const [key, value] of Object.entries(outputs))
      if (value !== undefined) {
        if (/[\r\n]/u.test(String(value)))
          throw Error("Invalid coordinator output.");
        await fs.appendFile(env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
  }
  console.log(
    `publication_action=${action} state=${result.state || "unknown"}`,
  );
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await coordinatePublication();
