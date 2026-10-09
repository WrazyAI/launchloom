import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  parsePipelineTestArgs,
  resolvePipelineTestPolicy,
} from "./pipeline-test-policy.mjs";
import { summarizeGenerationCosts } from "./generation-cost-summary.mjs";
import { seoResearchReadiness } from "../templates/client-site/src/lib/seo-readiness.mjs";
import { businessFactReadiness } from "../templates/client-site/src/lib/business-facts.mjs";
import { pageBriefReadiness } from "../templates/client-site/src/lib/page-briefs.mjs";
export { classifyPagesPreviewResponse, waitForPagesPreview } from "./pages-preview-readiness.mjs";
export {
  assertPrivateDiagnosticOutput,
  createPrivatePreviewProbe,
  deployPrivatePagesPreview,
} from "./private-pages-preview.mjs";

// Research verdict only: never a production authorization. The persisted
// provenance and every release guard retain the original, marked config.
export function focusedSeoReadiness(config) {
  const { pipelineTest: _testProvenance, ...researchConfig } = config;
  return seoResearchReadiness(researchConfig);
}

export function currentRunCostInputs(costs, report) {
  return { ...costs, creativeRun: report.stages.author.status === "not_run" ? null : costs.creativeRun };
}

export function currentRunCostSummary(costs, report, falImageUsdPerImage) {
  const unitPrice = Number(falImageUsdPerImage);
  return summarizeGenerationCosts(currentRunCostInputs(costs, report), {
    falImageUsdPerImage:
      Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
  });
}

export function assertPipelineTestFacts(config) {
  const readiness = businessFactReadiness(config);
  if (!readiness.allowed) throw new Error(readiness.error || "Business facts are not ready.");
}

export function pagesDeploymentUrl(output) {
  const matches = [...String(output).matchAll(/Deployment complete![^\r\n]*?(https:\/\/[a-z0-9.-]+\.pages\.dev)/giu)];
  if (matches.length !== 1) throw new Error("Immutable Pages deployment URL was not returned.");
  return new URL(matches[0][1]).href.replace(/\/$/u, "");
}

export function assertTestPreviewIndexingPolicy({
  robotsTxt = "",
  sitemapXml = "",
  xRobotsTag = "",
} = {}) {
  if (
    !/^User-agent:\s*\*\s*$/imu.test(robotsTxt) ||
    !/^Allow:\s*\/\s*$/imu.test(robotsTxt) ||
    /^Disallow:\s*\/\s*$/imu.test(robotsTxt)
  )
    throw new Error("Test preview robots.txt must allow crawling.");
  if (String(sitemapXml).trim())
    throw new Error("Test preview must not publish a sitemap.");
  if (!/\bnoindex\b/iu.test(xRobotsTag))
    throw new Error("Test preview response must include an X-Robots-Tag noindex directive.");
  return true;
}

/**
 * @param {{anonymousStatus?: number, anonymousLocation?: string, authenticatedStatus?: number}} [input]
 */
export function assertTestPreviewAccessPolicy({
  anonymousStatus,
  anonymousLocation = "",
  authenticatedStatus,
} = {}) {
  const redirectedToAccess =
    Number(anonymousStatus) >= 300 &&
    Number(anonymousStatus) < 400 &&
    /(?:^|\/)cdn-cgi\/access\/login(?:\/|\?|$)/iu.test(
      String(anonymousLocation),
    );
  const anonymouslyBlocked =
    [401, 403].includes(Number(anonymousStatus)) || redirectedToAccess;
  if (!anonymouslyBlocked)
    throw new Error(
      "Test preview is not protected behind Cloudflare Access; refusing to release its URL.",
    );
  if (Number(authenticatedStatus) !== 200)
    throw new Error(
      "Cloudflare Access did not authorize the configured developer request (service token).",
    );
  return true;
}

export async function verifyTestPreviewAccess({
  url,
  clientId,
  clientSecret,
  send = fetch,
}) {
  if (!clientId || !clientSecret)
    throw new Error("Cloudflare Access service-token credentials are required.");
  const anonymous = await send(url, { method: "GET", redirect: "manual" });
  const authenticated = await send(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    },
  });
  assertTestPreviewAccessPolicy({
    anonymousStatus: anonymous.status,
    anonymousLocation: anonymous.headers.get("location") || "",
    authenticatedStatus: authenticated.status,
  });
  return {
    anonymousStatus: anonymous.status,
    authenticatedStatus: authenticated.status,
  };
}

export function resolveTestPreviewProject(value = "launchloom-pipeline-preview") {
  const project = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(project))
    throw new Error("Test preview Pages project name is invalid.");
  return project;
}

export async function assertCompatibleTestAssets(current, previous, manifest, publicRoot) {
  const canonical = (value) => JSON.stringify(Object.entries(value || {}).filter(([, v]) => Boolean(v)).sort(([a], [b]) => a.localeCompare(b)));
  if (canonical(current.assets) !== canonical(previous.assets)) throw new Error("Client assets changed; fresh authoring is required.");
  const paths = new Set();
  const collect = (value) => {
    if (typeof value === "string" && value.startsWith("/images/generated/")) paths.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(previous.creativeAssets);
  for (const asset of paths) {
    const entry = manifest?.placements?.find((item) => item.path === asset);
    if (!entry || !/^[a-f0-9]{64}$/iu.test(entry.sha256 || "")) throw new Error("Generated asset provenance is missing.");
    const root = await fs.realpath(publicRoot);
    const file = await fs.realpath(path.resolve(root, `.${asset}`));
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error("Generated asset escaped its source root.");
    const checksum = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    if (checksum !== entry.sha256.toLowerCase()) throw new Error("Generated asset checksum mismatch.");
  }
}

const STAGES = [
  "prepare",
  "research",
  "configure",
  "reuse",
  "author",
  "creative",
  "select",
  "technical",
  "seo",
  "deploy",
  "notify",
  "persist",
];

export async function sendPipelineTestNotification({
  report,
  to,
  from,
  key,
  send = fetch,
}) {
  if (!to || !from || !key)
    throw new Error("Developer email credentials and recipient are required.");
  const { isPublicHttpsUrl } = await import("../emails/render-email.mjs");
  if (!isPublicHttpsUrl(report.previewUrl))
    throw new Error("Diagnostic email requires a live public HTTPS preview.");
  const text = [
    `Focused ${report.profile} test: ${report.verdict}`,
    `Diagnostic preview: ${report.previewUrl}`,
    `Source SHA: ${report.sourceSha}`,
    `Run/attempt: ${report.runId}`,
    ...Object.entries(report.stages)
      .filter(([name]) => !["notify", "persist"].includes(name))
      .map(([name, stage]) => `${name}: ${stage.status}`),
    `Recorded cost USD: ${report.costs?.totalUsd ?? "unreported"}${report.costs?.incomplete ? " (incomplete)" : ""}`,
    `Private report: https://github.com/${report.repository}/blob/${encodeURIComponent(report.branch)}/.launchloom/pipeline-test-report.json`,
    "Screenshots are stored beside the private report in .launchloom/screenshots.",
    "This diagnostic is isolated and cannot be published.",
  ].join("\n");
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `pipeline-test-${report.runId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `LaunchLoom ${report.profile}: ${report.verdict} diagnostic`,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Developer diagnostic email rejected: ${response.status}.`);
  const receipt = await response.json();
  if (!receipt.id)
    throw new Error("Developer email receipt is missing its delivery ID.");
  return { audience: "developer", delivered: true, emailId: receipt.id };
}

export function validatePipelineTestInput(input) {
  if (!["full-preview", "seo-only", "creative-only"].includes(input.profile))
    throw new Error("A focused test profile is required.");
  if (!/^[1-9]\d*$/u.test(input.issue))
    throw new Error("Issue must be a positive integer.");
  if (!/^[a-f0-9]{40}$/u.test(input.sourceSha))
    throw new Error("sourceSha must identify an immutable source commit.");
  if (!/^\d+-\d+$/u.test(input.runId))
    throw new Error("runId must include the workflow run and attempt.");
  if (
    input.candidateRepository &&
    !new RegExp(`^WrazyAI/launchloom-${input.issue}-[a-z0-9-]+$`, "u").test(
      input.candidateRepository,
    )
  )
    throw new Error(
      "Candidate repository must belong to the same business issue.",
    );
  return input;
}

/** External work is injected; verdict computation and delivery safety stay here. */
export async function runPipelineTest(input, dependencies) {
  validatePipelineTestInput(input);
  const policy = resolvePipelineTestPolicy({
    profile: input.profile,
    eventName:
      input.eventName || process.env.GITHUB_EVENT_NAME || "workflow_dispatch",
  });
  const report = {
    version: 1,
    profile: input.profile,
    testOnly: true,
    issue: input.issue,
    sourceSha: input.sourceSha,
    runId: input.runId,
    candidateCount: 0,
    candidateTarget: policy.candidateCount,
    startedAt: new Date().toISOString(),
    verdict: "failed",
    previewDelivered: false,
    stages: Object.fromEntries(
      STAGES.map((stage) => [stage, { status: "not_run" }]),
    ),
  };
  const context = { input, policy, report };
  async function stage(name) {
    const started = Date.now();
    try {
      const result = await dependencies[name](context);
      report.stages[name] = {
        status: "passed",
        durationMs: Date.now() - started,
        ...result,
      };
      return result;
    } catch (error) {
      report.stages[name] = {
        status: "failed",
        durationMs: Date.now() - started,
        error: String(error.message || error).slice(0, 1000),
      };
      return null;
    }
  }
  try {
    if (!(await stage("prepare"))) return report;
    if (policy.runSeoResearch && !(await stage("research"))) return report;
    if (!(await stage("configure"))) return report;
    let reused = false;
    if (input.profile === "seo-only") {
      const reuse = await stage("reuse");
      reused = reuse?.reused === true;
      if (reused)
        report.candidateCount = Number.isInteger(reuse.candidateCount)
          ? reuse.candidateCount
          : 1;
    }
    if (!reused) {
      const authorship = await stage("author");
      if (!authorship) return report;
      report.candidateCount = Number.isInteger(authorship.candidateCount)
        ? authorship.candidateCount
        : 0;
      if (
        input.profile === "full-preview" &&
        report.candidateCount !== policy.candidateCount
      ) {
        report.stages.author = {
          ...report.stages.author,
          status: "failed",
          error: `Expected ${policy.candidateCount} authored candidates, received ${report.candidateCount}.`,
        };
        return report;
      }
    }
    if (policy.runCreativeChecks) await stage("creative");
    if (!(await stage("select"))) return report;
    // Source selection, browser transitions and painted contrast are delivery gates.
    if (!(await stage("technical"))) return report;
    if (policy.runSeoResearch) await stage("seo");
    const relevant =
      input.profile === "seo-only"
        ? ["research", "select", "technical", "seo"]
        : input.profile === "creative-only"
          ? ["author", "creative", "select", "technical"]
          : ["research", "author", "creative", "select", "technical", "seo"];
    report.verdict = relevant.every(
      (name) => report.stages[name].status === "passed",
    )
      ? "passed"
      : "failed";
    // A combined preview is the end-to-end acceptance canary. Unlike the
    // isolated diagnostic profiles, it is deployed only after both quality
    // lanes and all shared rendered gates pass.
    if (input.profile === "full-preview" && report.verdict !== "passed")
      return report;
    const deployment = await stage("deploy");
    if (deployment?.url) {
      report.previewUrl = deployment.url;
      report.previewDelivered = true;
      await stage("notify");
    }
    return report;
  } finally {
    report.finishedAt = new Date().toISOString();
    await stage("persist");
  }
}

export async function command(
  binary,
  args,
  { cwd, env = {}, capture = false } = {},
) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });
    let output = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (bytes) => {
        output += bytes;
      });
      child.stderr.on("data", (bytes) => {
        stderr += bytes;
      });
    }
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(
            new Error(
              `${binary} ${args[0]} exited ${code}${capture ? `: ${stderr.slice(-500)}` : ""}`,
            ),
          ),
    );
  });
}

// Retry only the same non-force evidence push, never the paid generation.
export async function pushPipelineTestEvidence({
  cwd,
  branch,
  push = () => command("git", ["push", "--set-upstream", "origin", branch], { cwd, capture: true }),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await push();
      return { attempts: attempt + 1 };
    } catch (error) {
      const message = String(error?.message || error);
      const permanent = /authentication failed|permission denied|non-fast-forward|large files|exceeds?.*limit/iu.test(message);
      const transient = /internal server error|HTTP\s+50[0234]|returned error:\s*50[0234]|service unavailable|bad gateway|gateway timeout/iu.test(message);
      if (permanent || !transient || attempt === 2) throw error;
      await wait([1000, 3000][attempt]);
    }
  }
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** Actual cloud adapter. Its only writable client target is the unique QA repository. */
export function createCloudDependencies(
  input,
  {
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    work = process.env.RUNNER_TEMP,
  } = {},
) {
  if (!work)
    throw new Error("RUNNER_TEMP is required for the isolated test workspace.");
  const profileSlug = input.profile === "seo-only"
    ? "seo"
    : input.profile === "creative-only"
      ? "creative"
      : "full";
  const slug = `llqa-${input.issue}-${profileSlug}-${input.runId}`;
  const site = path.join(work, slug);
  const evidence = path.join(site, ".launchloom");
  const repo = `WrazyAI/${slug}`;
  const pagesProject = resolveTestPreviewProject(
    process.env.LAUNCHLOOM_TEST_PAGES_PROJECT,
  );
  const branch = `qa/${input.profile}/${input.runId}`;
  const config = path.join(site, "src/site.config.json");
  const research = path.join(evidence, "seo-research.json");
  const inspiration = path.join(evidence, "inspiration-pack.json");
  const session = path.join(evidence, "reasoning-preflight.json");
  const candidates = path.join(evidence, "generated-experiences");
  const reviewEnv = {
    PUBLIC_REVIEW_MODE: "true",
    PUBLIC_PIPELINE_TEST_MODE: input.profile,
  };
  let selected;
  const node = (script, args = [], options = {}) =>
    command(process.execPath, [path.join(root, "scripts", script), ...args], {
      cwd: root,
      ...options,
    });
  async function costSummary(report) {
    const { readGenerationCostInputs } = await import("./generation-cost-summary.mjs");
    const costs = await readGenerationCostInputs({
      seo: input.profile !== "creative-only" ? research : undefined,
      siteConfigUsage: path.join(evidence, "site-config-usage.json"),
      referenceDnaUsage: path.join(evidence, "reference-dna-usage.json"),
      preflight: session,
      creativeRun: path.join(candidates, "creative-run.json"),
      assets: path.join(evidence, "generated-assets.json"),
      repairDir: path.join(evidence, "creative-repair"),
    });
    costs.runner = {
      minutes: (Date.now() - Date.parse(report.startedAt)) / 60000,
      usdPerMinute: process.env.RUNNER_USD_PER_MINUTE || null,
    };
    return currentRunCostSummary(
      costs,
      report,
      process.env.FAL_IMAGE_USD_PER_IMAGE,
    );
  }
  async function ensurePrivatePreviewProject() {
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(pagesProject)}`;
    const current = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      cache: "no-store",
    });
    if (current.status === 404) {
      await command(
        path.join(root, "node_modules/.bin/wrangler"),
        ["pages", "project", "create", pagesProject, "--production-branch", "main"],
        { cwd: root },
      );
    } else if (!current.ok) {
      throw new Error(
        `Could not safely inspect the dedicated Pages preview project (HTTP ${current.status}).`,
      );
    }
    const probeDir = path.join(work, `${slug}-access-probe`);
    await fs.mkdir(probeDir, { recursive: true });
    await fs.writeFile(
      path.join(probeDir, "index.html"),
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>LaunchLoom preview access probe</title></head><body><main><h1>Access control probe</h1><p>This page contains no client or business data.</p></main></body></html>\n",
    );
    await fs.writeFile(
      path.join(probeDir, "_headers"),
      "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
    );
    await fs.writeFile(
      path.join(probeDir, "robots.txt"),
      "User-agent: *\nAllow: /\n",
    );
    const deployment = await command(
      path.join(root, "node_modules/.bin/wrangler"),
      [
        "pages",
        "deploy",
        probeDir,
        "--project-name",
        pagesProject,
        "--branch",
        "access-probe",
        "--commit-hash",
        input.sourceSha,
        "--commit-message",
        "Verify private pipeline preview access",
      ],
      { cwd: root, capture: true },
    );
    const probeUrl = pagesDeploymentUrl(deployment);
    await node("wait-for-pages-preview.mjs", ["--url", probeUrl, "--protected-preview", "true"]);
    const access = await verifyTestPreviewAccess({
      url: probeUrl,
      clientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID,
      clientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET,
    });
    return { probeUrl, access };
  }
  async function initializeAuthorship() {
    await node("compile-inspiration-pack.mjs", [
      "--config",
      config,
      "--intake",
      path.join(evidence, "canonical-site-brief.json"),
      "--out",
      inspiration,
    ]);
    await node("analyze-reference-dna.mjs", [
      "--config",
      config,
      "--inspiration",
      inspiration,
      "--out",
      inspiration,
      "--usage-out",
      path.join(evidence, "reference-dna-usage.json"),
    ]);
    await node("run-reasoning-preflight.mjs", [
      "--inspiration",
      inspiration,
      "--out",
      session,
    ]);
    const assetInspiration = path.join(evidence, "asset-inspiration-pack.json");
    const pack = await readJson(inspiration);
    await writeJson(assetInspiration, {
      ...pack,
      routes:
        input.profile === "seo-only" ? pack.routes.slice(0, 1) : pack.routes,
    });
    await node(
      "generate-contextual-assets.mjs",
      [
        "--config",
        config,
        "--inspiration",
        assetInspiration,
        "--output",
        path.join(site, "public/images/generated"),
        "--manifest",
        path.join(evidence, "generated-assets.json"),
      ],
      {
        env: {
          FAL_IMAGE_MAX_IMAGES: input.profile === "seo-only" ? "1" : "3",
          FAL_IMAGE_MAX_REQUESTS: input.profile === "seo-only" ? "2" : "6",
        },
      },
    );
  }
  async function sourceFiles(directory) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries({
          experience: "Experience.jsx",
          styles: "styles.css",
          motion: "motion.js",
          servicePage: "ServicePage.jsx",
          locationPage: "LocationPage.jsx",
          servicesIndexPage: "ServicesIndexPage.jsx",
        }).map(async ([key, name]) => [
          key,
          await fs.readFile(path.join(directory, name), "utf8").catch(() => ""),
        ]),
      ),
    );
  }
  return {
    async prepare({ report }) {
      for (const key of [
        "GH_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_ACCESS_CLIENT_ID",
        "CLOUDFLARE_ACCESS_CLIENT_SECRET",
        "LAUNCHLOOM_DEVELOPER_EMAIL",
        "RESEND_API_KEY",
        "LAUNCHLOOM_FROM_EMAIL",
      ])
        if (!process.env[key]) throw new Error(`${key} is required.`);
      const accessProbe = await ensurePrivatePreviewProject();
      report.previewAccess = {
        anonymousStatus: accessProbe.access.anonymousStatus,
        authenticatedStatus: accessProbe.access.authenticatedStatus,
      };
      await fs.mkdir(site, { recursive: false });
      await fs.cp(path.join(root, "templates/client-site"), site, {
        recursive: true,
        filter: (source) =>
          !/(?:^|\/)(node_modules|dist|\.astro)(?:\/|$)/u.test(source),
      });
      await fs.mkdir(evidence, { recursive: true });
      const body = await command(
        "gh",
        [
          "issue",
          "view",
          input.issue,
          "--repo",
          process.env.GITHUB_REPOSITORY || "WrazyAI/launchloom",
          "--json",
          "body",
          "--jq",
          ".body",
        ],
        { capture: true },
      );
      await fs.writeFile(path.join(evidence, "intake.md"), body);
      // Create the private evidence destination before any paid stage can fail.
      await command("gh", ["repo", "create", repo, "--private"]);
      await command("git", ["init", "--initial-branch", branch], { cwd: site });
      await command("git", ["config", "user.name", "LaunchLoom"], {
        cwd: site,
      });
      await command(
        "git",
        ["config", "user.email", "automation@launchloom.app"],
        { cwd: site },
      );
      await command(
        "git",
        ["remote", "add", "origin", `https://github.com/${repo}.git`],
        { cwd: site },
      );
      report.repository = repo;
      report.branch = branch;
      report.project = pagesProject;
      return {
        repository: repo,
        branch,
        project: pagesProject,
        previewAccess: report.previewAccess,
      };
    },
    async research() {
      await node("coverage-areas.mjs", [
        "--source",
        path.join(evidence, "intake.md"),
        "--out",
        path.join(evidence, "business-enrichment.json"),
      ]);
      await node("seo-research.mjs", [
        "--source",
        path.join(evidence, "intake.md"),
        "--out",
        research,
        "--map-out",
        path.join(evidence, "seo-map.md"),
        "--enrichment",
        path.join(evidence, "business-enrichment.json"),
      ]);
      const result = await readJson(research);
      return {
        artifact: ".launchloom/seo-research.json",
        mode: result.mode,
        publishReady: result.publishReady === true,
      };
    },
    async configure() {
      if (input.profile === "creative-only") {
        await node("coverage-areas.mjs", [
          "--source",
          path.join(evidence, "intake.md"),
          "--out",
          path.join(evidence, "business-enrichment.json"),
        ]);
        await writeJson(research, {
          version: 2,
          mode: "context-only",
          publishReady: false,
          status: "skipped",
          reason: "creative-only profile does not run SEO research",
          validatedQueries: [],
          pageMap: [],
          externalSearchEvidence: [],
          warnings: ["SEO research deliberately not run for this test."],
        });
      }
      await node("compile-canonical-site-brief.mjs", [
        "--source",
        path.join(evidence, "intake.md"),
        "--research",
        research,
        "--enrichment",
        path.join(evidence, "business-enrichment.json"),
        "--out",
        path.join(evidence, "canonical-site-brief.json"),
      ]);
      await node("generate-site-config.mjs", [
        "--brief",
        path.join(evidence, "canonical-site-brief.json"),
        "--out",
        config,
        "--usage-out",
        path.join(evidence, "site-config-usage.json"),
      ]);
      const current = await readJson(config);
      assertPipelineTestFacts(current);
      current.pipelineTest = {
        version: 1,
        profile: input.profile,
        testOnly: true,
        sourceSha: input.sourceSha,
        runId: input.runId,
      };
      if (input.profile === "creative-only")
        current.seoResearch = {
          ...current.seoResearch,
          status: "skipped",
          publishReady: false,
          reason: "creative-only test profile",
        };
      // Diagnostic forms stay unconfigured; no client mail or signed approval link.
      delete current.leadToken;
      delete current.lead;
      if (current.leadForm) {
        delete current.leadForm.token;
        current.leadForm.recipient = "";
      }
      await writeJson(config, current);
      return { artifact: "src/site.config.json" };
    },
    async reuse() {
      const repositories = input.candidateRepository
        ? [input.candidateRepository]
        : JSON.parse(
            await command(
              "gh",
              [
                "repo",
                "list",
                "WrazyAI",
                "--limit",
                "1000",
                "--json",
                "nameWithOwner,isPrivate",
              ],
              { capture: true },
            ),
          )
            .filter(
              (entry) =>
                entry.isPrivate &&
                entry.nameWithOwner.startsWith(
                  `WrazyAI/launchloom-${input.issue}-`,
                ),
            )
            .map((entry) => entry.nameWithOwner);
      const rejected = [];
      for (let index = 0; index < repositories.length; index++) {
        const repository = repositories[index];
        validatePipelineTestInput({
          ...input,
          candidateRepository: repository,
        });
        const source = path.join(work, `${slug}-source-${index}`);
        const validatedCandidates = path.join(
          evidence,
          `reuse-candidates-${index}`,
        );
        try {
          const info = JSON.parse(
            await command(
              "gh",
              ["repo", "view", repository, "--json", "isPrivate"],
              { capture: true },
            ),
          );
          if (info.isPrivate !== true)
            throw new Error("Reusable business repository must be private.");
          await command("gh", [
            "repo",
            "clone",
            repository,
            source,
            "--",
            "--branch",
            "review/initial",
            "--depth",
            "1",
          ]);
          const { validateAndCopyReusableCandidates } =
            await import("./validate-reusable-creative-candidates.mjs");
          const oldSession = await readJson(
            path.join(source, ".launchloom/reasoning-preflight.json"),
          );
          await validateAndCopyReusableCandidates({
            configPath: path.join(source, "src/site.config.json"),
            inspirationPath: path.join(
              source,
              ".launchloom/inspiration-pack.json",
            ),
            candidatesPath: path.join(
              source,
              ".launchloom/generated-experiences",
            ),
            outputPath: validatedCandidates,
            sessionPath: path.join(
              source,
              ".launchloom/reasoning-preflight.json",
            ),
            model:
              oldSession.creativeModel ||
              process.env.CREATIVE_EXPERIENCE_MODEL ||
              "openai/gpt-6-luna",
            repositoryRoot: root,
          });
          const pack = await readJson(
            path.join(source, ".launchloom/inspiration-pack.json"),
          );
          const current = await readJson(config);
          const previous = await readJson(
            path.join(source, "src/site.config.json"),
          );
          await assertCompatibleTestAssets(current, previous,
            await readJson(path.join(source, ".launchloom/generated-assets.json")).catch(() => ({})),
            path.join(source, "public"));
          current.creativeAssets = previous.creativeAssets || {};
          const {
            buildCreativeContentManifest,
            validateProductionCandidateFiles,
          } = await import("./production-experience-author.mjs");
          for (const name of ["candidate-a", "candidate-b", "candidate-c"]) {
            const directory = path.join(validatedCandidates, name);
            try {
              const metadata = await readJson(
                path.join(directory, "metadata.json"),
              );
              const route = pack.routes.find(
                (route) => route.id === metadata.routeId,
              );
              if (!route) throw new Error("Missing frozen candidate route.");
              const manifest = buildCreativeContentManifest(current, route);
              validateProductionCandidateFiles({
                files: await sourceFiles(directory),
                route,
                content: manifest.values,
                visualBrief: manifest.visualBrief,
              });
              // Token identity stays sealed; only current data binding is refreshed.
              const sealed = await readJson(
                path.join(directory, "content-manifest.json"),
              );
              if (
                JSON.stringify(sealed.tokens) !==
                JSON.stringify(manifest.tokens)
              )
                throw new Error("Sealed token definitions changed.");
              const sourceAssets = path.join(source, "public");
              // Client/source asset paths are local and validated by source + rendered checks.
              await fs.cp(sourceAssets, path.join(site, "public"), {
                recursive: true,
                force: false,
                errorOnExist: false,
                filter: (sourcePath) =>
                  !["robots.txt", "_headers", "sitemap.xml"].includes(
                    path.basename(sourcePath),
                  ),
              });
              await writeJson(inspiration, pack);
              await fs.rename(validatedCandidates, candidates);
              selected = {
                directory: path.join(candidates, name),
                route,
                manifest,
              };
              await writeJson(config, current);
              return {
                reused: true,
                candidateCount: 1,
                repository,
                sourceCommit: await command("git", ["rev-parse", "HEAD"], {
                  cwd: source,
                  capture: true,
                }),
                candidate: name,
              };
            } catch (error) {
              rejected.push({
                repository,
                candidate: name,
                reason: String(error.message).slice(0, 300),
              });
            }
          }
        } catch (error) {
          rejected.push({
            repository,
            reason: String(error.message).slice(0, 300),
          });
        }
      }
      await writeJson(path.join(evidence, "reuse-attempts.json"), rejected);
      return {
        reused: false,
        reason: "No compatible sealed source found.",
        rejectedCount: rejected.length,
      };
    },
    async author() {
      await initializeAuthorship();
      await node("author-production-experiences.mjs", [
        "--config",
        config,
        "--inspiration",
        inspiration,
        "--out",
        candidates,
        "--session",
        session,
        "--failure-mode",
        "throw",
        "--test-profile",
        input.profile,
      ]);
      const authored = await readJson(
        path.join(candidates, "creative-run.json"),
      );
      return {
        artifact: ".launchloom/generated-experiences",
        candidateCount: Array.isArray(authored.candidates)
          ? authored.candidates.length
          : 0,
      };
    },
    async creative({ policy }) {
      await command("npm", ["ci"], { cwd: site });
      await node(
        "run-rendered-creative-repair.mjs",
        [
          "--site-dir",
          site,
          "--candidates",
          candidates,
          "--out",
          path.join(evidence, "creative-repair"),
          "--session",
          session,
          "--mode",
          "preview",
          "--max-cycles",
          String(policy.repairCycles),
          "--visual-gate-script",
          path.join(root, "scripts/visual-quality-gate.mjs"),
        ],
        { env: reviewEnv },
      );
      const summary = await readJson(
        path.join(evidence, "creative-repair/summary.json"),
      );
      if (summary.promotionReady !== true || summary.visualGatePass !== true)
        throw new Error(
          "Creative reference, diversity or visual acceptance did not pass.",
        );
      return {
        artifact: ".launchloom/creative-repair/final/creative-bakeoff.json",
      };
    },
    async select() {
      // A failed creative evaluation may still expose a source-safe diagnostic.
      if (!selected) {
        const pack = await readJson(inspiration);
        const current = await readJson(config);
        const {
          buildCreativeContentManifest,
          validateProductionCandidateFiles,
        } = await import("./production-experience-author.mjs");
        const bakeoff = await readJson(
          path.join(evidence, "creative-repair/final/creative-bakeoff.json"),
        ).catch(() => null);
        const preferred = bakeoff?.selectedCandidateId;
        const names = [
          ...new Set(
            [preferred, "candidate-a", "candidate-b", "candidate-c"].filter(
              Boolean,
            ),
          ),
        ];
        for (const name of names) {
          if (!/^candidate-[abc]$/u.test(name)) continue;
          try {
            const directory = path.join(candidates, name);
            const metadata = await readJson(
              path.join(directory, "metadata.json"),
            );
            const route = pack.routes.find(
              (route) => route.id === metadata.routeId,
            );
            if (!route) throw new Error("Missing candidate route.");
            const manifest = buildCreativeContentManifest(current, route);
            validateProductionCandidateFiles({
              files: await sourceFiles(directory),
              route,
              content: manifest.values,
              visualBrief: manifest.visualBrief,
            });
            selected = { directory, route, manifest };
            break;
          } catch {
            /* Try the next source-safe candidate; never fall back to legacy. */
          }
        }
      }
      if (!selected)
        throw new Error("No source-safe authored candidate is available.");
      const { promoteCreativeCandidate } =
        await import("./promote-creative-candidate.mjs");
      await promoteCreativeCandidate({
        siteDir: site,
        candidateDir: selected.directory,
        preview: true,
        selectionMode: "pipeline-test-diagnostic",
        contentManifest: selected.manifest,
      });
      // Promotion can rewrite config; reassert immutable test marker afterward.
      const current = await readJson(config);
      current.pipelineTest = {
        version: 1,
        profile: input.profile,
        testOnly: true,
        sourceSha: input.sourceSha,
        runId: input.runId,
      };
      await writeJson(config, current);
      return { candidate: path.basename(selected.directory) };
    },
    async technical() {
      assertPipelineTestFacts(await readJson(config));
      await command("npm", ["ci"], { cwd: site });
      await command("npm", ["run", "check"], { cwd: site, env: reviewEnv });
      await command("npm", ["run", "build"], { cwd: site, env: reviewEnv });
      await node(
        "verify-rendered-revision.mjs",
        [
          "--config",
          config,
          "--dist",
          path.join(site, "dist"),
          "--screenshots",
          path.join(evidence, "screenshots"),
        ],
        { env: reviewEnv },
      );
      await node("verify-contrast.mjs", ["--site", site], { env: reviewEnv });
      return {
        screenshots: ".launchloom/screenshots",
        contrast: ".launchloom/contrast-report.json",
      };
    },
    async seo() {
      await node(
        "seo-release-gate.mjs",
        [
          "--mode",
          "review",
          "--config",
          config,
          "--dist",
          path.join(site, "dist"),
          "--report",
          path.join(evidence, "seo-review-report.json"),
        ],
        { env: reviewEnv },
      );
      const finalConfig = await readJson(config);
      const readiness = focusedSeoReadiness(finalConfig);
      await writeJson(
        path.join(evidence, "seo-research-readiness.json"),
        readiness,
      );
      if (!readiness.allowed)
        throw new Error(
          readiness.error || "SEO research readiness did not pass.",
        );
      const pageReadiness = pageBriefReadiness(finalConfig);
      if (!pageReadiness.allowed)
        throw new Error(
          pageReadiness.error || "Route-specific content readiness did not pass.",
        );
      return { artifact: ".launchloom/seo-review-report.json" };
    },
    async deploy({ report }) {
      await fs.writeFile(
        path.join(site, "dist/_headers"),
        "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n",
      );
      await fs.writeFile(
        path.join(site, "dist/robots.txt"),
        "User-agent: *\nAllow: /\n",
      );
      await fs.rm(path.join(site, "dist/sitemap.xml"), { force: true });
      const deployed = await command(
        path.join(root, "node_modules/.bin/wrangler"),
        [
          "pages",
          "deploy",
          path.join(site, "dist"),
          "--project-name",
          pagesProject,
          "--branch",
          branch,
          "--commit-hash",
          input.sourceSha,
          "--commit-message",
          `Focused ${input.profile} diagnostic`,
        ],
        { cwd: site, capture: true },
      );
      const url = pagesDeploymentUrl(deployed);
      await node("wait-for-pages-preview.mjs", ["--url", url, "--protected-preview", "true"]);
      const previewAccess = await verifyTestPreviewAccess({
        url,
        clientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID,
        clientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET,
      });
      report.previewAccess = previewAccess;
      const accessHeaders = {
        "CF-Access-Client-Id": process.env.CLOUDFLARE_ACCESS_CLIENT_ID,
        "CF-Access-Client-Secret": process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET,
      };
      const response = await fetch(url, {
        redirect: "manual",
        headers: accessHeaders,
      });
      const robotsResponse = await fetch(new URL("robots.txt", url), {
        redirect: "manual",
        headers: accessHeaders,
      });
      const sitemapResponse = await fetch(new URL("sitemap.xml", url), {
        redirect: "manual",
        headers: accessHeaders,
      });
      assertTestPreviewIndexingPolicy({
        robotsTxt: robotsResponse.ok ? await robotsResponse.text() : "",
        sitemapXml: sitemapResponse.ok ? await sitemapResponse.text() : "",
        xRobotsTag: response.headers.get("x-robots-tag") || "",
      });
      if (!response.ok)
        throw new Error("Live diagnostic did not return a successful homepage response.");
      report.previewUrl = url;
      return { url, access: previewAccess };
    },
    async notify({ report }) {
      report.costs = await costSummary(report);
      return sendPipelineTestNotification({
        report,
        to: process.env.LAUNCHLOOM_DEVELOPER_EMAIL,
        from: process.env.LAUNCHLOOM_FROM_EMAIL,
        key: process.env.RESEND_API_KEY,
      });
    },
    async persist({ report }) {
      report.costs = await costSummary(report);
      const persisted = structuredClone(report);
      delete persisted.stages.persist;
      await writeJson(
        path.join(evidence, "pipeline-test-report.json"),
        persisted,
      );
      if (!report.repository) return {};
      await command("git", ["add", "."], { cwd: site });
      await command(
        "git",
        ["commit", "-m", `Record ${input.profile} test ${report.verdict}`],
        { cwd: site },
      );
      const upload = await pushPipelineTestEvidence({ cwd: site, branch });
      return {
        artifact: ".launchloom/pipeline-test-report.json",
        repository: repo,
        attempts: upload.attempts,
      };
    },
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const args = parsePipelineTestArgs(process.argv.slice(2));
  const input = {
    profile: args.profile,
    issue: args.issue,
    sourceSha: process.env.GITHUB_SHA,
    runId: `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`,
    candidateRepository: args["candidate-repository"] || "",
  };
  validatePipelineTestInput(input);
  const report = await runPipelineTest(input, createCloudDependencies(input));
  console.log(
    JSON.stringify({
      profile: report.profile,
      verdict: report.verdict,
      previewDelivered: report.previewDelivered,
      previewUrl: report.previewUrl || null,
      stages: Object.fromEntries(Object.entries(report.stages).map(([name, stage]) => [name, stage.status])),
    }),
  );
  if (
    report.verdict !== "passed" ||
    !report.previewDelivered ||
    report.stages.notify.status !== "passed" ||
    report.stages.persist.status !== "passed"
  )
    process.exitCode = 1;
}
