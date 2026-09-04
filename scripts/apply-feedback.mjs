import fs from "node:fs/promises";
import { feedbackTextFromComment } from "./feedback-utils.mjs";
import {
  applyOperation,
  deterministicOperations,
  expectedArtifacts,
  modelOperations,
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
const joinedFeedback = feedback.join("\n\n");
// Keep revisions narrow. Structural requests are deterministic; copy changes
// are allowed only through a small, validated patch surface.
let operations = deterministicOperations(joinedFeedback, config);
if (!operations.length)
  operations = await modelOperations(joinedFeedback, config);
const appliedOperations = operations.filter((operation) =>
  applyOperation(config, operation),
);
if (!appliedOperations.length)
  throw new Error(
    "This feedback needs manual attention; no supported, verifiable revision operation was available.",
  );
Object.assign(config, removeEmDashes(config));
config.revisionReport = {
  feedback,
  operations: appliedOperations,
  expectedArtifacts: expectedArtifacts(appliedOperations),
  requestedSocialProof:
    /\b(testimonials?|testimony|testimonies|review section|google reviews?|customer reviews?|client reviews?)\b/i.test(
      joinedFeedback,
    ),
};
await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
if (process.env.FEEDBACK_SUMMARY_PATH)
  await fs.writeFile(
    process.env.FEEDBACK_SUMMARY_PATH,
    feedback.join("\n\n").slice(0, 12_000),
    "utf8",
  );
if (process.env.FEEDBACK_OUTCOME_PATH)
  await fs.writeFile(
    process.env.FEEDBACK_OUTCOME_PATH,
    appliedOperations
      .map((operation) =>
        operation.kind === "set_social_proof"
          ? operation.source === "google_reviews"
            ? "Added a live, attributed Google Maps reviews section."
            : "Added a verified proof section because no Google reviews are available."
          : operation.kind === "show_brand_name"
            ? "Ensured the business name is visible beside the logo."
            : `Updated ${operation.field}.`,
      )
      .join(" "),
    "utf8",
  );
console.log(`Applied ${feedback.length} feedback item(s) to ${configPath}.`);
