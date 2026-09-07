import fs from "node:fs/promises";
import { feedbackTextFromComment } from "./feedback-utils.mjs";
import {
  expectedArtifacts,
  planRevision,
  removeEmDashes,
} from "./revision-engine.mjs";

const [repo, pr, configPath] = [
  process.env.CLIENT_REPO,
  process.env.CLIENT_PR,
  process.env.CLIENT_CONFIG_PATH || "src/site.config.json",
];
const feedbackIssue = process.env.FEEDBACK_ISSUE || pr;
if (!repo || !pr || !feedbackIssue)
  throw new Error("CLIENT_REPO, CLIENT_PR, and FEEDBACK_ISSUE are required.");
if (!process.env.GITHUB_ORG_TOKEN)
  throw new Error("GITHUB_ORG_TOKEN is required.");

const response = await fetch(
  `https://api.github.com/repos/${repo}/issues/${feedbackIssue}/comments`,
  {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_ORG_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "LaunchLoom-GitHub-Action",
    },
  },
);
if (!response.ok)
  throw new Error(`Could not fetch feedback: ${response.status}`);
const comments = await response.json();
const stage = process.env.FEEDBACK_STAGE === "client" ? "client" : "developer";
const latestRevision = comments
  .filter((comment) =>
    comment.body?.includes(`<!-- launchloom-revision:${stage} -->`),
  )
  .sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  )[0]?.created_at;
const feedback = comments
  .filter(
    (comment) =>
      comment.body?.includes(`<!-- launchloom-feedback:${stage} -->`) &&
      (!latestRevision ||
        new Date(comment.created_at) > new Date(latestRevision)),
  )
  .map((comment) => feedbackTextFromComment(comment.body))
  .filter(Boolean);
if (!feedback.length) {
  console.log("No pending LaunchLoom feedback.");
  process.exit(0);
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const planned = await planRevision(feedback, config);
const revised = removeEmDashes(planned.config);
revised.revisionReport = {
  feedback,
  operations: planned.operations,
  results: planned.results,
  expectedArtifacts: expectedArtifacts(planned.operations, revised),
};
if (process.env.FEEDBACK_SUMMARY_PATH)
  await fs.writeFile(
    process.env.FEEDBACK_SUMMARY_PATH,
    feedback.join("\n\n").slice(0, 12_000),
    "utf8",
  );
if (process.env.FEEDBACK_OUTCOME_PATH)
  await fs.writeFile(
    process.env.FEEDBACK_OUTCOME_PATH,
    planned.results
      .map(
        (result) =>
          `Item ${result.feedbackIndex + 1}: ${result.status}. ${result.status === "fulfilled" ? `Applied ${result.operationKinds.join(", ")}.` : `Unresolved: ${result.unresolved.join(", ")}.`}`,
      )
      .join("\n"),
    "utf8",
  );
if (!planned.ok)
  throw new Error(
    `Feedback needs manual attention. ${planned.results
      .filter((result) => result.status !== "fulfilled")
      .map(
        (result) =>
          `Item ${result.feedbackIndex + 1}: ${result.status} (${result.unresolved.join(", ")})`,
      )
      .join("; ")}`,
  );
await fs.writeFile(configPath, `${JSON.stringify(revised, null, 2)}\n`);
console.log(`Applied ${feedback.length} feedback item(s) to ${configPath}.`);
