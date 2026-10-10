import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const safeProject = (value) => {
  const project = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(project))
    throw new Error("Private preview Pages project name is invalid.");
  return project;
};

const safeSha = (value) => {
  if (!/^[a-f0-9]{40}$/iu.test(String(value || "")))
    throw new Error("Private preview requires an exact source commit SHA.");
  return String(value).toLowerCase();
};

const safeBranch = (value) => {
  const branch = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,27}[a-z0-9])?$/u.test(branch))
    throw new Error("Private preview branch name is invalid.");
  return branch;
};

/** @param {string} directory */
export async function assertPrivateDiagnosticOutput(directory) {
  const indexHtml = await fs
    .readFile(path.join(directory, "index.html"), "utf8")
    .catch(() => "");
  const robotsTxt = await fs
    .readFile(path.join(directory, "robots.txt"), "utf8")
    .catch(() => "");
  const headersText = await fs
    .readFile(path.join(directory, "_headers"), "utf8")
    .catch(() => "");
  const xRobotsTag =
    headersText.match(/^\s*X-Robots-Tag:\s*([^\r\n]+)/imu)?.[1] || "";
  if (
    !indexHtml ||
    !/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*\bnoindex\b[^"']*["']/iu.test(
      indexHtml,
    )
  )
    throw new Error(
      "Private diagnostic homepage must contain a robots noindex meta tag.",
    );
  if (
    !/^User-agent:\s*\*\s*$/imu.test(robotsTxt) ||
    !/^Allow:\s*\/\s*$/imu.test(robotsTxt) ||
    /^Disallow:\s*\/\s*$/imu.test(robotsTxt)
  )
    throw new Error("Test preview robots.txt must allow crawling.");
  if (!/\bnoindex\b/iu.test(xRobotsTag))
    throw new Error(
      "Private diagnostic _headers must include an X-Robots-Tag noindex directive.",
    );
  try {
    await fs.access(path.join(directory, "sitemap.xml"));
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  throw new Error(
    "Private diagnostic output must not contain a sitemap.xml file.",
  );
}

export async function createPrivatePreviewProbe(directory) {
  if (!directory)
    throw new Error("A private preview probe directory is required.");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>LaunchLoom access probe</title></head><body><main><h1>Access control probe</h1><p>This page contains no client or business data.</p></main></body></html>\n',
  );
  await fs.writeFile(
    path.join(directory, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
  );
  await fs.writeFile(
    path.join(directory, "robots.txt"),
    "User-agent: *\nAllow: /\n",
  );
  await assertPrivateDiagnosticOutput(directory);
  return directory;
}

/**
 * Deploy a content-free Access probe and verify it before any diagnostic site
 * files are uploaded. The deployed site is rechecked before its URL is returned.
 *
 * @param {{
 *   projectName: string,
 *   directory: string,
 *   sourceSha: string,
 *   branch: string,
 *   ensureProject: (input: {projectName: string}) => Promise<void>,
 *   deploy: (input: {directory: string, projectName: string, branch: string, sourceSha: string}) => Promise<{url: string}>,
 *   waitForReady: (url: string, options: {protectedPreview: boolean}) => Promise<unknown>,
 *   verifyAccess: (url: string) => Promise<unknown>,
 *   makeProbe?: () => Promise<string>,
 *   removeProbe?: (probeDirectory: string) => Promise<void>
 * }} input
 * @returns {Promise<{probeUrl: string, url: string}>}
 */
export async function deployPrivatePagesPreview({
  projectName,
  directory,
  sourceSha,
  branch,
  ensureProject,
  deploy,
  waitForReady,
  verifyAccess,
  makeProbe = () =>
    fs.mkdtemp(path.join(os.tmpdir(), "launchloom-access-probe-")),
  removeProbe = (probeDirectory) =>
    fs.rm(probeDirectory, { recursive: true, force: true }),
} = {}) {
  const project = safeProject(projectName);
  const sha = safeSha(sourceSha);
  const deploymentBranch = safeBranch(branch);
  if (
    !directory ||
    typeof ensureProject !== "function" ||
    typeof deploy !== "function" ||
    typeof waitForReady !== "function" ||
    typeof verifyAccess !== "function"
  )
    throw new Error("Private preview deployment dependencies are incomplete.");

  await fs.access(directory);
  await assertPrivateDiagnosticOutput(directory);
  await ensureProject({ projectName: project });
  const probeDirectory = await makeProbe();
  try {
    await createPrivatePreviewProbe(probeDirectory);
    const probe = await deploy({
      directory: probeDirectory,
      projectName: project,
      branch: "access-probe",
      sourceSha: sha,
    });
    if (!probe?.url)
      throw new Error(
        "Access-probe deployment did not return an immutable Pages URL.",
      );
    await waitForReady(probe.url, { protectedPreview: true });
    await verifyAccess(probe.url);

    const candidate = await deploy({
      directory,
      projectName: project,
      branch: deploymentBranch,
      sourceSha: sha,
    });
    if (!candidate?.url)
      throw new Error(
        "Diagnostic deployment did not return an immutable Pages URL.",
      );
    await waitForReady(candidate.url, { protectedPreview: true });
    await verifyAccess(candidate.url);
    return { probeUrl: probe.url, url: candidate.url };
  } finally {
    await removeProbe(probeDirectory);
  }
}
