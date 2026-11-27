#!/usr/bin/env node
import fs from "node:fs/promises";
import {
  pagesDeploymentId,
  pagesDeploymentUrl,
} from "./pages-deployment.mjs";

const REPO = /^WrazyAI\/[a-z0-9][a-z0-9-]{0,100}$/u;
const ATTEMPT = /^[A-Za-z0-9:_-]{1,160}$/u;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const SHA = /^[a-f0-9]{40}$/u;

export function buildPreviewDeliveryPayload(
  args = {},
  environment = process.env,
) {
  const repository = String(args.repo || "").trim();
  const attemptId = String(args.attempt || "").trim();
  const project = String(args.project || "").trim();
  const pr = Number(args.pr);
  const sha = String(args.sha || "").trim().toLowerCase();
  const log = args.log ? String(args.log) : "";
  if (!REPO.test(repository)) throw new Error("Invalid client repository.");
  if (!ATTEMPT.test(attemptId)) throw new Error("Invalid attempt id.");
  if (!PROJECT.test(project)) throw new Error("Invalid Pages project.");
  if (!Number.isSafeInteger(pr) || pr < 1)
    throw new Error("Invalid pull request number.");
  if (!SHA.test(sha)) throw new Error("Invalid build SHA.");
  if (!log) throw new Error("A wrangler deploy log is required.");
  const previewUrl = pagesDeploymentUrl(log);
  const deploymentId = pagesDeploymentId(previewUrl);
  if (new URL(previewUrl).hostname !== `${deploymentId}.${project}.pages.dev`)
    throw new Error("Deployment URL does not match the project.");
  return {
    repository,
    attemptId,
    project,
    pr,
    sha,
    deploymentId,
    previewUrl,
    apiUrl: String(
      args["api-url"] || environment.LAUNCHLOOM_API_URL || "",
    ).replace(/\/$/u, ""),
    secret: String(environment.REVISION_COORDINATOR_SECRET || ""),
  };
}

export async function publishPreviewDelivery(payload, fetchImpl = fetch) {
  if (!payload.apiUrl)
    throw new Error("LAUNCHLOOM_API_URL is required.");
  if (!payload.secret)
    throw new Error("REVISION_COORDINATOR_SECRET is required.");
  const response = await fetchImpl(
    `${payload.apiUrl}/api/internal/agent-follow-ups/preview-deliveries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${payload.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repository: payload.repository,
        attemptId: payload.attemptId,
        project: payload.project,
        pr: payload.pr,
        sha: payload.sha,
        deploymentId: payload.deploymentId,
        previewUrl: payload.previewUrl,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Preview delivery failed with HTTP ${response.status}.`);
  return {
    previewUrl: payload.previewUrl,
    deploymentId: payload.deploymentId,
  };
}

async function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (args.log) args.log = await fs.readFile(String(args.log), "utf8");
  const payload = buildPreviewDeliveryPayload(args);
  const result = await publishPreviewDelivery(payload);
  console.log(JSON.stringify(result));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
