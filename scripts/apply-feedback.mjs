import fs from "node:fs/promises";
import path from "node:path";
import { materializeFeedbackAssets } from "./feedback-assets.mjs";
import { applyBoundedClientFeedback } from "./client-feedback-ops.mjs";
import {
  feedbackRequestSummary,
  nextClientFeedbackContext,
  pendingFeedbackFromComments,
} from "./feedback-utils.mjs";
import {
  expectedArtifacts,
  planRevision,
  removeEmDashes,
} from "./revision-engine.mjs";

const DEFAULT_ASSET_BASE_URL = "https://assets.launchloom.wrazyos.com";

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
const requests = pendingFeedbackFromComments(
  comments,
  stage,
  Boolean(exactComment),
);
if (!requests.length) {
  console.log("No pending LaunchLoom feedback.");
  process.exit(0);
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
let summaries = requests
  .map((item) => feedbackRequestSummary(item))
  .filter(Boolean);
let planned;
if (stage === "client") {
  // Client review stays bounded: verified small changes only, applied by the
  // deterministic client-feedback operation set.
  planned = applyBoundedClientFeedback(config, requests);
} else {
  // Developer review may replace imagery and choose colors. Replacements are
  // materialized into the private client repository before planning so the
  // rendered acceptance check can point at a committed local asset.
  const assetBaseUrl = String(
    process.env.ASSET_BASE_URL || DEFAULT_ASSET_BASE_URL,
  ).replace(/\/$/u, "");
  const feedbackAssetDir = path.resolve(
    path.dirname(configPath),
    "..",
    "public",
    "images",
    "feedback",
  );
  const materialized = await materializeFeedbackAssets({
    items: requests,
    assetBaseUrl,
    outputDir: feedbackAssetDir,
  });
  if (materialized.failures.length)
    throw new Error(
      `Requested images could not be prepared. ${materialized.failures.join(" ")}`,
    );
  summaries = materialized.items
    .map((item) => feedbackRequestSummary(item))
    .filter(Boolean);
  planned = await planRevision(materialized.items, config);
}
const revised =
  stage === "client" ? planned.config : removeEmDashes(planned.config);
const previousRevisionReport = config.revisionReport || {};
const clientFeedbackContext = nextClientFeedbackContext(
  previousRevisionReport,
  stage,
  summaries,
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
  feedback: summaries,
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
  expectedArtifacts: expectedArtifacts(planned.operations, revised).filter(
    (artifact) =>
      stage === "client" || !creativeRenderer ||
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
    summaries.join("\n\n").slice(0, 12_000),
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
console.log(`Applied ${requests.length} feedback item(s) to ${configPath}.`);
