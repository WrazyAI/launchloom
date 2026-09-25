import fs from "node:fs/promises";
import { nextClientFeedbackContext, pendingFeedbackFromComments } from "./feedback-utils.mjs";
import { applyBoundedClientFeedback } from "./client-feedback-ops.mjs";
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

const exactComment = String(process.env.FEEDBACK_COMMENT_ID || "").trim();
if (exactComment && !/^\d+$/.test(exactComment))
  throw new Error("FEEDBACK_COMMENT_ID must be a GitHub issue comment ID.");
const response = await fetch(
  exactComment
    ? `https://api.github.com/repos/${repo}/issues/comments/${exactComment}`
    : `https://api.github.com/repos/${repo}/issues/${feedbackIssue}/comments`,
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
const payload = await response.json();
const comments = exactComment ? [payload] : payload;
const stage = process.env.FEEDBACK_STAGE === "client" ? "client" : "developer";
const feedback = pendingFeedbackFromComments(
  comments,
  stage,
  Boolean(exactComment),
);
if (!feedback.length) {
  console.log("No pending LaunchLoom feedback.");
  process.exit(0);
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const planned = stage === "client"
  ? applyBoundedClientFeedback(config, feedback)
  : await planRevision(feedback, config);
const revised = stage === "client" ? planned.config : removeEmDashes(planned.config);
const previousRevisionReport = config.revisionReport || {};
const clientFeedbackContext = nextClientFeedbackContext(
  previousRevisionReport,
  stage,
  feedback,
  pr,
);
const creativeRenderer =
  revised.design?.experience?.renderer === "creative-candidate";
const creativeIgnoredArtifactTypes = new Set([
  "section",
  "section-type",
  "absent-section-type",
  "order",
  "variant",
  "class",
  "style",
]);
revised.revisionReport = {
  stage,
  revisionPr: String(pr),
  feedback,
  clientFeedbackContext,
  operations: planned.operations,
  results: planned.results,
  creativeSourceRepairRequired:
    stage !== "client" && creativeRenderer &&
    planned.results.some(
      (result) =>
        result.status === "creative" ||
        result.intents?.some((intent) =>
          ["layout", "color", "social-proof", "brand-name"].includes(intent),
        ),
    ),
  creativeSourceRepairVerified: null,
  expectedArtifacts: stage === "client" ? [] : expectedArtifacts(planned.operations, revised).filter(
    (artifact) =>
      !creativeRenderer ||
      (!creativeIgnoredArtifactTypes.has(artifact.type) &&
        !(
          artifact.type === "html" &&
          artifact.marker === 'class="wordmark__name"'
        )),
  ),
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
      .map((result) => {
        const detail =
          result.status === "fulfilled"
            ? `Applied ${result.operationKinds?.join(", ") || result.operation?.kind || "verified structured changes"}.`
            : result.status === "manual"
              ? `Manual attention: ${result.reason}`
            : result.status === "creative"
              ? "Queued for authored creative source refinement and rendered verification."
              : `Unresolved: ${result.unresolved.join(", ")}.`;
        return `Item ${result.feedbackIndex + 1}: ${result.status}. ${detail}`;
      })
      .join("\n"),
    "utf8",
  );
if (!planned.ok)
  throw new Error(
    `Feedback needs manual attention. ${planned.results
    .filter((result) => result.status !== "fulfilled")
      .map(
        (result) =>
          `Item ${result.feedbackIndex + 1}: ${result.status} (${result.reason || result.unresolved?.join(", ") || "unsupported request"})`,
      )
      .join("; ")}`,
  );
await fs.writeFile(configPath, `${JSON.stringify(revised, null, 2)}\n`);
console.log(`Applied ${feedback.length} feedback item(s) to ${configPath}.`);
