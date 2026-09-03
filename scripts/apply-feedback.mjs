import fs from "node:fs/promises";
import { generateSiteConfig } from "./generate-site-config.mjs";

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
  .map((comment) =>
    comment.body
      .replace(/<!--[\s\S]*?-->/, "")
      .replace(/\*_Page:[\s\S]*/, "")
      .trim(),
  );
if (!feedback.length) {
  console.log("No pending LaunchLoom feedback.");
  process.exit(0);
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const intake = {
  ...config.business,
  preset: config.preset,
  services: config.services.map((service) => service.name).join("\n"),
  serviceAreas: config.business.serviceAreas.join("\n"),
  differentiators: config.differentiators.join("\n"),
  primaryColor: config.style.primaryColor,
  tone: config.style.tone,
  feedback: feedback.join("\n\n"),
};
const revised = await generateSiteConfig(intake);
if (config.assets) revised.assets = config.assets;
if (config.lead) revised.lead = config.lead;
await fs.writeFile(configPath, `${JSON.stringify(revised, null, 2)}\n`);
console.log(`Applied ${feedback.length} feedback item(s) to ${configPath}.`);
