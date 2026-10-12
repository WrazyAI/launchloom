import { execFileSync } from "node:child_process";
import path from "node:path";
import { deployPrivatePagesPreview } from "./private-pages-preview.mjs";
import { waitForPagesPreview } from "./pages-preview-readiness.mjs";
import {
  pagesDeploymentUrl,
  resolveTestPreviewProject,
  verifyTestPreviewAccess,
} from "./run-pipeline-test.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);

const projectName = resolveTestPreviewProject(args.project);
if (!args.directory) throw new Error("--directory is required.");
const directory = path.resolve(args.directory);
const sourceSha = args["source-sha"];
const branch = args.branch;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accessClientId = process.env.CLOUDFLARE_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET;
if (!accountId || !apiToken || !accessClientId || !accessClientSecret)
  throw new Error(
    "A build directory, Cloudflare API credentials, and Access service token are required.",
  );

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const wrangler = path.join(workspace, "node_modules", ".bin", "wrangler");
const preview = await deployPrivatePagesPreview({
  projectName,
  directory,
  sourceSha,
  branch,
  async ensureProject({ projectName: project }) {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}`;
    const current = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: "no-store",
    });
    if (current.status === 404) {
      execFileSync(
        wrangler,
        ["pages", "project", "create", project, "--production-branch", "main"],
        { cwd: workspace, stdio: ["ignore", "ignore", "inherit"] },
      );
    } else if (!current.ok) {
      throw new Error(
        `Could not safely inspect the dedicated Pages preview project (HTTP ${current.status}).`,
      );
    }
  },
  async deploy({
    directory: deployDirectory,
    projectName: project,
    branch: deployBranch,
    sourceSha: sha,
  }) {
    const output = execFileSync(
      wrangler,
      [
        "pages",
        "deploy",
        deployDirectory,
        "--project-name",
        project,
        "--branch",
        deployBranch,
        "--commit-hash",
        sha,
        "--commit-message",
        deployBranch === "access-probe"
          ? "Verify private diagnostic preview access"
          : "Deploy private LaunchLoom creative diagnostic",
      ],
      { cwd: workspace, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    return { url: pagesDeploymentUrl(output) };
  },
  waitForReady: (url, options) =>
    waitForPagesPreview({
      url,
      ...options,
      timeoutSeconds: 90,
      intervalSeconds: 5,
      onAttempt: (message) => console.error(message),
    }),
  verifyAccess: (url) =>
    verifyTestPreviewAccess({
      url,
      clientId: accessClientId,
      clientSecret: accessClientSecret,
    }),
});
console.log(JSON.stringify(preview));
