import fs from "node:fs/promises";

const action = String(process.env.REVISION_QUEUE_ACTION || "").trim();
const repo = String(process.env.CLIENT_REPO || "").trim();
const requestId = String(process.env.REVISION_REQUEST_ID || "").trim();
const secret = String(process.env.REVISION_COORDINATOR_SECRET || "");
const api = String(
  process.env.LAUNCHLOOM_API_URL || "https://api.launchloom.wrazyos.com",
).replace(/\/$/, "");

if (!action || !repo || !requestId || !secret)
  throw new Error(
    "REVISION_QUEUE_ACTION, CLIENT_REPO, REVISION_REQUEST_ID, and REVISION_COORDINATOR_SECRET are required.",
  );

const resultBody =
  action === "complete" &&
  process.env.REVISION_PREVIEW_URL &&
  process.env.REVISION_PREVIEW_DEPLOYMENT_ID &&
  process.env.REVISION_PREVIEW_PROJECT &&
  process.env.REVISION_RESULT_BASE_SHA
    ? {
        result: {
          baseSha: process.env.REVISION_RESULT_BASE_SHA,
          preview: {
            repository: repo,
            attemptId: `agent:${requestId}`,
            project: process.env.REVISION_PREVIEW_PROJECT,
            pr: Number(process.env.REVISION_PREVIEW_PR || 0),
            sha: process.env.REVISION_PREVIEW_SHA || "",
            deploymentId: process.env.REVISION_PREVIEW_DEPLOYMENT_ID,
            previewUrl: process.env.REVISION_PREVIEW_URL,
          },
        },
      }
    : {};

const response = await fetch(`${api}/api/internal/revisions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action,
    repo,
    requestId,
    reason: process.env.REVISION_FAILURE_REASON || undefined,
    failureSiteUrl: process.env.REVISION_FAILURE_SITE_URL || undefined,
    failureRunUrl: process.env.REVISION_FAILURE_RUN_URL || undefined,
    ...resultBody,
  }),
  signal: AbortSignal.timeout(20_000),
});
const result = await response.json().catch(() => ({}));
if (!response.ok)
  throw new Error(
    `Revision coordinator rejected ${action}: ${response.status} ${String(result.error || "unknown error").slice(0, 300)}`,
  );

async function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

if (action === "claim") {
  await output("run", String(Boolean(result.run)));
  await output("status", String(result.status || "unknown"));
  if (result.request && process.env.AGENT_REQUEST_PATH) {
    await fs.writeFile(
      process.env.AGENT_REQUEST_PATH,
      `${JSON.stringify(result.request)}\n`,
      "utf8",
    );
  }
}

if (action === "complete" && result.request) {
  await output("request", JSON.stringify(result.request));
}

if (action === "complete") {
  const promoted = result.promoted;
  await output("promoted", String(Boolean(promoted)));
  if (promoted && process.env.QUEUED_FEEDBACK_PATH) {
    const category = String(promoted.category || "").trim();
    const feedback = String(promoted.feedback || "").trim();
    await fs.writeFile(
      process.env.QUEUED_FEEDBACK_PATH,
      `${category ? `[${category}] ` : ""}${feedback}\n`,
      "utf8",
    );
    await output("queued_stage", String(promoted.stage || "developer"));
  }
}

console.log(`revision_queue_action=${action} ok=true`);
