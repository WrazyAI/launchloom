#!/usr/bin/env node
import fs from "node:fs/promises";
import { buildAgentRunEvidence } from "./build-agent-run-evidence.mjs";

async function readJson(path) {
  if (!path) return null;
  try {
    return JSON.parse(await fs.readFile(String(path), "utf8"));
  } catch {
    return null;
  }
}

export function buildRunEvidencePayload({
  report,
  creativeSummary,
  assets,
  routeReport,
  preview,
  recordedAt,
}) {
  if (!preview?.attemptId || !preview?.repository)
    throw new Error("A preview receipt is required for run evidence.");
  return buildAgentRunEvidence({
    report,
    creativeSummary,
    assets,
    routeReport,
    preview,
    attemptId: preview.attemptId,
    repository: preview.repository,
    recordedAt,
  });
}

export async function publishAgentRunEvidence(
  evidence,
  { apiUrl, secret, fetchImpl = fetch },
) {
  if (!apiUrl) throw new Error("LAUNCHLOOM_API_URL is required.");
  if (!secret) throw new Error("REVISION_COORDINATOR_SECRET is required.");
  const response = await fetchImpl(
    `${String(apiUrl).replace(/\/$/u, "")}/api/internal/agent-follow-ups/run-evidence`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(evidence),
    },
  );
  if (!response.ok)
    throw new Error(`Run evidence failed with HTTP ${response.status}.`);
  return { ok: true };
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
  const [report, creativeSummary, assets, routeReport, preview] =
    await Promise.all([
      readJson(args.report),
      readJson(args["creative-summary"]),
      readJson(args.assets),
      readJson(args["route-report"]),
      readJson(args.preview),
    ]);
  const evidence = buildRunEvidencePayload({
    report,
    creativeSummary,
    assets,
    routeReport,
    preview,
  });
  await publishAgentRunEvidence(evidence, {
    apiUrl: args["api-url"] || process.env.LAUNCHLOOM_API_URL,
    secret: process.env.REVISION_COORDINATOR_SECRET,
  });
  console.log(JSON.stringify({ ok: true, attemptId: evidence.attemptId }));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}
