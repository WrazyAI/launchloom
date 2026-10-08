#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  buildReferenceTemplateIndex,
  listReferenceTemplateEntries,
  referenceTemplateDigest,
  readReferenceTemplateRecord,
  writeReferenceTemplateIndex,
} from "./reference-template.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const USER_AGENT = "LaunchLoom-reference-template-extractor/1.0";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const ATT_LICENSED = "rights/template-extraction.md";

const OWNED_SOURCES = {
  "care-concierge-cinematic": {
    artifactPath: "design-family-demos/cinematic-premium",
    generator: "scripts/build-design-family-demos.mjs",
    entrypoint: "index.html",
  },
  "care-image-mosaic": {
    artifactPath: "design-family-demos/image-mosaic",
    generator: "scripts/build-design-family-demos.mjs",
    entrypoint: "index.html",
  },
  "care-wellness-journal": {
    artifactPath: "design-family-demos/atmospheric-editorial",
    generator: "scripts/build-design-family-demos.mjs",
    entrypoint: "index.html",
  },
  "trade-project-showcase": {
    artifactPath: "design-family-demos/project-showcase",
    generator: "scripts/build-design-family-demos.mjs",
    entrypoint: "index.html",
  },
  "trades-field-report": {
    artifactPath: "design-family-demos/studio-minimal",
    generator: "scripts/build-design-family-demos.mjs",
    entrypoint: "index.html",
  },
  "clear-counsel-ledger": {
    artifactPath: "a1-design-showcase/clear-counsel.html",
    generator: "scripts/build-a1-design-showcase.mjs",
    entrypoint: "index.html",
  },
  "kinetic-club-program-bands": {
    artifactPath: "a1-design-showcase/kinetic-club.html",
    generator: "scripts/build-a1-design-showcase.mjs",
    entrypoint: "index.html",
  },
  "neighborhood-table-collage": {
    artifactPath: "a1-design-showcase/neighborhood-table.html",
    generator: "scripts/build-a1-design-showcase.mjs",
    entrypoint: "index.html",
  },
  "quiet-care-consultation": {
    artifactPath: "a1-design-showcase/quiet-practice.html",
    generator: "scripts/build-a1-design-showcase.mjs",
    entrypoint: "index.html",
  },
  "urgent-trade-service-poster": {
    artifactPath: "a1-design-showcase/rapid-response.html",
    generator: "scripts/build-a1-design-showcase.mjs",
    entrypoint: "index.html",
  },
  "nightjar-cinematic-salon": {
    artifactPath: "nightjar-cinematic-prototype/dist",
    generator: "artifacts/nightjar-cinematic-prototype",
    entrypoint: "index.html",
  },
};

const SKIPPED_ARTIFACT_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "screenshots",
  "qa",
  "tests",
]);
const SKIPPED_ARTIFACT_FILES = new Set([
  ".DS_Store",
  "package.json",
  "package-lock.json",
  "testsprite-plan.json",
  "testsprite-refined-steps.json",
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        index += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorText(error) {
  return String(error?.message || error || "unknown error")
    .replace(/\s+/gu, " ")
    .slice(0, 200);
}

function extensionAllowed(method, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const liveExtensions = new Set([
    ".html",
    ".htm",
    ".css",
    ".txt",
    ".md",
    ".json",
    ".svg",
    ".xml",
  ]);
  const bundledExtensions = new Set([
    ...liveExtensions,
    ".js",
    ".mjs",
    ".cjs",
    ".map",
    ".ts",
    ".tsx",
    ".jsx",
    ".scss",
    ".less",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".avif",
    ".ico",
    ".bmp",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".mp4",
    ".webm",
    ".pdf",
  ]);
  if (!extension) return false;
  if (method === "live-site") return liveExtensions.has(extension);
  return bundledExtensions.has(extension);
}

function walkFiles(directory) {
  const results = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile()) results.push(fullPath);
    }
  };
  visit(directory);
  return results;
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(0, 2000);
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} exited with ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
            ),
          ),
    );
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        await worker(items[current], current);
      }
    },
  );
  await Promise.all(runners);
}

function classifyDossier(manifest) {
  const source = manifest.source || {};
  if (source.rights === "owned") return "owned";
  if (source.repository === "https://github.com/zce/html5up") return "licensed";
  if (
    /^https:\/\/github\.com\/ColorlibHQ\/bootstrap-templates\//u.test(
      source.url || "",
    )
  )
    return "licensed";
  if (/spicerdesigns\.com\/templates\//u.test(source.url || ""))
    return "licensed";
  if (source.rights === "licensed") return "licensed";
  if (source.rights === "permission-cleared") return "live";
  return "unsupported";
}

function methodFor(manifest, classification) {
  if (classification === "owned") return "owned-artifact";
  if (classification === "live") return "live-site";
  if (/spicerdesigns\.com\/templates\//u.test(manifest.source?.url || ""))
    return "zip-download";
  return "pinned-git";
}

function licenseFor(manifest) {
  const source = manifest.source || {};
  if (source.rights === "owned") return "owned";
  if (source.repository === "https://github.com/zce/html5up")
    return "CC-BY-3.0";
  if (
    /^https:\/\/github\.com\/ColorlibHQ\/bootstrap-templates\//u.test(
      source.url || "",
    )
  )
    return "MIT";
  if (/spicerdesigns\.com\/templates\//u.test(source.url || ""))
    return "CC-BY-4.0";
  return null;
}

function attestationMarkdown(
  manifest,
  { method, license, licenseEvidencePath },
) {
  const source = manifest.source || {};
  const lines = [
    "# Template extraction rights record",
    "",
    `- Dossier: \`${manifest.id}\``,
    `- Source: ${source.name}`,
    `- Source URL: ${source.url}`,
    `- Rights basis: ${source.rights}`,
    `- Extraction method: ${method}`,
    `- Recorded: 2026-10-08`,
    "",
  ];
  if (source.rights === "licensed") {
    lines.push(
      "## License basis",
      "",
      `The extracted template is retained under the source license recorded at \`${licenseEvidencePath || source.rightsEvidencePath}\` (${license}). That license covers copying and adaptation of the template source.`,
    );
  } else {
    lines.push(
      "## Permission basis",
      "",
      "The LaunchLoom requester confirmed on 2026-10-08 that rights were obtained to extract and retain this reference's direct source template and to use it for internal pipeline refinement (design mechanics study and renderer development). This record covers template source retention and internal derivative work only.",
    );
  }
  lines.push(
    "",
    "## Use limits",
    "",
    "The retained template is internal reference material. Source branding, copy, imagery, fonts, and code must not be transferred into client sites, and no template-derived output may be published until the attribution decision recorded in `docs/reference-template-rights.md` is settled.",
    "",
  );
  return lines.join("\n");
}

async function fetchGitHubTree(owner, repository, revision) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/git/trees/${revision}?recursive=1`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok)
    throw new Error(`GitHub tree fetch failed: HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.tree) ? data.tree : [];
}

async function extractPinnedGit(manifest, stagedSource) {
  const source = manifest.source || {};
  let owner;
  let repository;
  let revision;
  let templatePath;
  if (source.repository === "https://github.com/zce/html5up") {
    owner = "zce";
    repository = "html5up";
    revision = source.commit;
    templatePath = source.templatePath;
  } else {
    const match = String(source.url || "").match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([a-f0-9]{7,40})\/(.+)$/u,
    );
    if (!match) throw new Error("Unsupported pinned repository URL.");
    [, owner, repository, revision, templatePath] = match;
  }
  if (!revision) throw new Error("Pinned repository revision is missing.");
  const prefix = String(templatePath || "").replace(/\/?$/u, "/");
  const tree = await fetchGitHubTree(owner, repository, revision);
  const blobs = tree.filter(
    (item) =>
      item.type === "blob" &&
      item.path.startsWith(prefix) &&
      item.path !== prefix,
  );
  if (!blobs.length)
    throw new Error(
      `No files found at ${prefix} in ${owner}/${repository}@${revision}.`,
    );
  const selected = [];
  const excluded = [];
  for (const blob of blobs) {
    const relative = blob.path.slice(prefix.length);
    if (!relative || relative.startsWith(".")) continue;
    if (!extensionAllowed("pinned-git", relative)) {
      excluded.push({
        url: `https://github.com/${owner}/${repository}/blob/${revision}/${blob.path}`,
        reason: "unsupported-extension",
      });
      continue;
    }
    if (Number(blob.size || 0) > MAX_FILE_BYTES) {
      excluded.push({
        url: `https://github.com/${owner}/${repository}/blob/${revision}/${blob.path}`,
        reason: "over-file-size-limit",
      });
      continue;
    }
    selected.push({ relative, blobPath: blob.path });
  }
  await mapWithConcurrency(selected, 4, async (file) => {
    const response = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repository}/${revision}/${file.blobPath}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Failed to fetch ${file.blobPath}: HTTP ${response.status}`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    const target = path.join(stagedSource, ...file.relative.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, bytes);
  });
  const entrypoint =
    selected.find((file) => file.relative === "index.html")?.relative ||
    selected.find((file) => file.relative.endsWith(".html"))?.relative;
  if (!entrypoint)
    throw new Error("No HTML entrypoint found in the pinned template.");
  return {
    entrypoint,
    excludedMedia: excluded.slice(0, 300),
    license:
      source.repository === "https://github.com/zce/html5up"
        ? "CC-BY-3.0"
        : "MIT",
    source: {
      repository: `https://github.com/${owner}/${repository}`,
      revision,
      templatePath: prefix,
      retrievedAt: nowIso(),
      license:
        source.repository === "https://github.com/zce/html5up"
          ? "CC-BY-3.0"
          : "MIT",
      licenseEvidencePath: source.rightsEvidencePath || null,
    },
    notes: `Fetched ${selected.length} files from the pinned repository at ${revision}.`,
  };
}

async function extractSpicer(manifest, stagedSource, workspace) {
  const source = manifest.source || {};
  const match = String(source.url || "").match(
    /spicerdesigns\.com\/templates\/([a-z0-9-]+)/u,
  );
  if (!match) throw new Error("Unsupported Spicer template URL.");
  const slug = match[1];
  const archiveUrl = `https://www.spicerdesigns.com/downloads/${slug}-template-html.zip`;
  const response = await fetch(archiveUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error(`Template download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES)
    throw new Error(
      `Template archive exceeds the ${MAX_ARCHIVE_BYTES} byte limit.`,
    );
  const archiveSha256 = sha256(bytes);
  const zipPath = path.join(workspace, "template.zip");
  await fsp.writeFile(zipPath, bytes);
  const extractDirectory = path.join(workspace, "unzipped");
  await fsp.mkdir(extractDirectory, { recursive: true });
  await runCommand("unzip", ["-qq", "-o", zipPath, "-d", extractDirectory]);
  let sourceRoot = extractDirectory;
  if (!fs.existsSync(path.join(extractDirectory, "index.html"))) {
    const directories = fs
      .readdirSync(extractDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "__MACOSX");
    if (
      directories.length === 1 &&
      fs.existsSync(
        path.join(extractDirectory, directories[0].name, "index.html"),
      )
    )
      sourceRoot = path.join(extractDirectory, directories[0].name);
  }
  const excluded = [];
  let copied = 0;
  for (const filePath of walkFiles(sourceRoot)) {
    const relative = path
      .relative(sourceRoot, filePath)
      .replaceAll(path.sep, "/");
    if (relative.split("/").includes("__MACOSX")) continue;
    if (relative.startsWith(".") || relative.includes("/.")) continue;
    if (!extensionAllowed("zip-download", relative)) {
      excluded.push({
        url: `${archiveUrl}#${relative}`,
        reason: "unsupported-extension",
      });
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_BYTES) {
      excluded.push({
        url: `${archiveUrl}#${relative}`,
        reason: "over-file-size-limit",
      });
      continue;
    }
    const target = path.join(stagedSource, ...relative.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(filePath, target);
    copied += 1;
  }
  if (!fs.existsSync(path.join(stagedSource, "index.html")))
    throw new Error("Downloaded Spicer template has no index.html entrypoint.");
  return {
    entrypoint: "index.html",
    excludedMedia: excluded.slice(0, 300),
    license: "CC-BY-4.0",
    source: {
      url: source.url,
      finalUrl: archiveUrl,
      archiveSha256,
      retrievedAt: nowIso(),
      license: "CC-BY-4.0",
      licenseEvidencePath: source.rightsEvidencePath || null,
    },
    notes: `Downloaded the official HTML build (${copied} files, archive SHA-256 ${archiveSha256}). The template page footer also shows an MIT label; the retained LICENSE in rights/ records CC BY 4.0 with the footer attribution condition. Reconcile before any derivative publication.`,
  };
}

async function extractOwnedArtifact(manifest, stagedSource, options) {
  const mapping = OWNED_SOURCES[manifest.id];
  if (!mapping)
    throw new Error(`No owned artifact mapping exists for '${manifest.id}'.`);
  const artifactPath = path.join(options.artifactsRoot, mapping.artifactPath);
  if (!fs.existsSync(artifactPath))
    return {
      status: "unavailable",
      reason: `Local artifact is not present at ${mapping.artifactPath}.`,
    };
  const stat = fs.statSync(artifactPath);
  let copied = 0;
  if (stat.isFile()) {
    await fsp.mkdir(stagedSource, { recursive: true });
    await fsp.copyFile(artifactPath, path.join(stagedSource, "index.html"));
    copied = 1;
  } else {
    for (const filePath of walkFiles(artifactPath)) {
      const relative = path
        .relative(artifactPath, filePath)
        .replaceAll(path.sep, "/");
      const segments = relative.split("/");
      if (segments.some((segment) => SKIPPED_ARTIFACT_SEGMENTS.has(segment)))
        continue;
      if (SKIPPED_ARTIFACT_FILES.has(segments[segments.length - 1])) continue;
      if (
        relative.startsWith(".") ||
        segments.some((segment) => segment.startsWith("."))
      )
        continue;
      if (relative.toLowerCase().endsWith(".zip")) continue;
      if (!extensionAllowed("owned-artifact", relative)) continue;
      if (fs.statSync(filePath).size > MAX_FILE_BYTES) continue;
      const target = path.join(stagedSource, ...segments);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(filePath, target);
      copied += 1;
    }
  }
  if (!fs.existsSync(path.join(stagedSource, mapping.entrypoint)))
    return {
      status: "unavailable",
      reason: `Artifact at ${mapping.artifactPath} has no ${mapping.entrypoint} entrypoint.`,
    };
  return {
    entrypoint: mapping.entrypoint,
    excludedMedia: [],
    license: "owned",
    source: {
      artifactPath: mapping.artifactPath,
      generator: mapping.generator,
      retrievedAt: nowIso(),
      license: "owned",
    },
    notes: `Copied ${copied} files from the local build artifact at ${mapping.artifactPath}. The artifact directory is gitignored; regenerate it with ${mapping.generator} when the owned prototype source changes.`,
  };
}

async function inlineImports(cssText, baseUrl, requestContext, failures) {
  const pattern =
    /@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?([^;]*);/gu;
  const matches = [...cssText.matchAll(pattern)].slice(0, 5);
  let output = cssText;
  for (const match of matches) {
    const media = String(match[2] || "").trim();
    if (media) continue;
    let resolved;
    try {
      resolved = new URL(match[1], baseUrl).href;
    } catch {
      continue;
    }
    if (resolved.startsWith("data:")) continue;
    try {
      const response = await requestContext.get(resolved, {
        timeout: 20000,
        failOnStatusCode: false,
      });
      if (response.ok()) {
        const text = await response.text();
        output = output.replace(
          match[0],
          `/* inlined import: ${resolved} */\n${text}`,
        );
      } else {
        failures.push({
          url: resolved,
          reason: `import HTTP ${response.status()}`,
        });
      }
    } catch (error) {
      if (process.env.LAUNCHLOOM_TEMPLATE_DEBUG)
        console.error("inline-import failure", error?.stack || error);
      failures.push({ url: resolved, reason: errorText(error) });
    }
  }
  return output;
}

async function extractLiveSite(manifest, stagedSource, options) {
  const url = manifest.source?.url;
  if (!url) throw new Error("Live site extraction requires a source URL.");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "en-US",
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => {
      if (pageErrors.length < 20)
        pageErrors.push(String(error?.message || error).slice(0, 200));
    });
    let response;
    try {
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: options.timeoutMs,
      });
    } catch (error) {
      throw new Error(`navigation failed: ${errorText(error)}`);
    }
    const httpStatus = response ? response.status() : null;
    if (response && response.status() >= 400)
      throw new Error(`navigation returned HTTP ${response.status()}`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    await page
      .evaluate(async () => {
        const step = Math.max(400, window.innerHeight * 0.9);
        const maximum = Math.min(document.body.scrollHeight, 30000);
        for (let y = 0; y < maximum; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});
    await page.waitForTimeout(800);

    const stylesheetLinks = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => ({
          href: link.href,
          media: link.getAttribute("media") || "",
        }))
        .filter((sheet) => sheet.href && !sheet.href.startsWith("data:")),
    );
    const styleFiles = [];
    const stylesheetFailures = [];
    for (let index = 0; index < stylesheetLinks.length; index += 1) {
      const sheet = stylesheetLinks[index];
      let text = null;
      try {
        const cssResponse = await context.request.get(sheet.href, {
          timeout: 30000,
          failOnStatusCode: false,
        });
        if (cssResponse.ok()) text = await cssResponse.text();
        else
          stylesheetFailures.push({
            url: sheet.href,
            reason: `HTTP ${cssResponse.status()}`,
          });
      } catch (error) {
        stylesheetFailures.push({ url: sheet.href, reason: errorText(error) });
      }
      if (!text) {
        const serialized = await page
          .evaluate((href) => {
            for (const styleSheet of document.styleSheets) {
              if (styleSheet.href !== href) continue;
              try {
                return [...styleSheet.cssRules]
                  .map((rule) => rule.cssText)
                  .join("\n");
              } catch {
                return null;
              }
            }
            return null;
          }, sheet.href)
          .catch(() => null);
        if (serialized) text = serialized;
      }
      if (text && text.trim())
        styleFiles.push({
          path: `styles/${String(index + 1).padStart(2, "0")}.css`,
          text,
          sourceUrl: sheet.href,
          media: sheet.media,
        });
      else if (
        !stylesheetFailures.some((failure) => failure.url === sheet.href)
      )
        stylesheetFailures.push({
          url: sheet.href,
          reason: "empty-or-unreadable",
        });
    }
    for (const file of styleFiles)
      file.text = await inlineImports(
        file.text,
        file.sourceUrl,
        context.request,
        stylesheetFailures,
      );

    const media = await page.evaluate(() => {
      const urls = new Set();
      const push = (value) => {
        const normalized = String(value || "").trim();
        if (normalized && !normalized.startsWith("data:"))
          urls.add(normalized.slice(0, 500));
      };
      const pushSrcset = (value) => {
        String(value || "")
          .split(",")
          .forEach((part) => push(part.trim().split(/\s+/u)[0]));
      };
      document.querySelectorAll("img").forEach((element) => {
        push(element.currentSrc);
        push(element.src);
        pushSrcset(element.srcset);
      });
      document.querySelectorAll("source").forEach((element) => {
        push(element.src);
        pushSrcset(element.srcset);
      });
      document.querySelectorAll("video").forEach((element) => {
        push(element.src);
        push(element.poster);
      });
      document
        .querySelectorAll("iframe")
        .forEach((element) => push(element.src));
      document
        .querySelectorAll("object")
        .forEach((element) => push(element.data));
      document
        .querySelectorAll("embed")
        .forEach((element) => push(element.src));
      return [...urls].slice(0, 300);
    });

    const styleMap = Object.fromEntries(
      styleFiles.map((file) => [file.sourceUrl, file.path]),
    );
    const html = await page.evaluate((map) => {
      document
        .querySelectorAll("script")
        .forEach((element) => element.remove());
      document.querySelectorAll("*").forEach((element) => {
        for (const attribute of [...element.attributes])
          if (attribute.name.toLowerCase().startsWith("on"))
            element.removeAttribute(attribute.name);
      });
      document.querySelectorAll("meta[http-equiv]").forEach((element) => {
        if (
          String(element.getAttribute("http-equiv") || "").toLowerCase() ===
          "content-security-policy"
        )
          element.remove();
      });
      document.querySelectorAll("base").forEach((element) => element.remove());
      document
        .querySelectorAll(
          'link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="modulepreload"]',
        )
        .forEach((element) => element.remove());
      document.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
        const local = map[element.href];
        if (local) element.setAttribute("href", local);
        for (const name of ["integrity", "nonce", "crossorigin"])
          element.removeAttribute(name);
      });
      document.querySelectorAll("style,link,script").forEach((element) => {
        element.removeAttribute("nonce");
      });
      return `<!doctype html>\n${document.documentElement.outerHTML}`;
    }, styleMap);

    await fsp.mkdir(path.join(stagedSource, "styles"), { recursive: true });
    await fsp.writeFile(path.join(stagedSource, "index.html"), html);
    for (const file of styleFiles)
      await fsp.writeFile(path.join(stagedSource, file.path), file.text);
    const pageTitle = await page.title().catch(() => "");
    const notes = [
      `Rendered DOM captured after script execution and lazy-load scrolling. Scripts and inline event handlers were stripped; ${styleFiles.length} of ${stylesheetLinks.length} stylesheets retained.`,
      stylesheetFailures.length
        ? `Stylesheet issues: ${stylesheetFailures
            .slice(0, 10)
            .map((failure) => `${failure.url} (${failure.reason})`)
            .join("; ")}.`
        : null,
      pageErrors.length ? `Page errors observed: ${pageErrors.length}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      entrypoint: "index.html",
      excludedMedia: media.map((mediaUrl) => ({
        url: mediaUrl,
        reason: "remote-media-not-retained",
      })),
      license: null,
      source: {
        url,
        finalUrl: page.url(),
        httpStatus,
        pageTitle: pageTitle.slice(0, 200),
        retrievedAt: nowIso(),
        viewport: { width: 1440, height: 900 },
      },
      notes,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function stageExtraction(manifest, classification, options) {
  const workspace = await fsp.mkdtemp(
    path.join(os.tmpdir(), `launchloom-template-${manifest.id}-`),
  );
  const stagedSource = path.join(workspace, "source");
  await fsp.mkdir(stagedSource, { recursive: true });
  try {
    let result;
    if (classification === "licensed") {
      const source = manifest.source || {};
      if (/spicerdesigns\.com\/templates\//u.test(source.url || ""))
        result = await extractSpicer(manifest, stagedSource, workspace);
      else result = await extractPinnedGit(manifest, stagedSource);
    } else if (classification === "owned") {
      result = await extractOwnedArtifact(manifest, stagedSource, options);
    } else if (classification === "live") {
      result = await extractLiveSite(manifest, stagedSource, options);
    } else {
      result = {
        status: "unavailable",
        reason: `No extraction adapter exists for this source (${classification}).`,
      };
    }
    return { ...result, stagedSource, workspace };
  } catch (error) {
    await fsp.rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

function buildFilesRecord(templateDirectory) {
  const sourceRoot = path.join(templateDirectory, "source");
  return walkFiles(sourceRoot)
    .map((filePath) => {
      const relative = path
        .relative(templateDirectory, filePath)
        .replaceAll(path.sep, "/");
      const bytes = fs.readFileSync(filePath);
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function commitExtraction({
  manifest,
  dossierDirectory,
  stagedSource,
  result,
  force,
}) {
  const templateDirectory = path.join(dossierDirectory, "template");
  if (fs.existsSync(templateDirectory) && !force) return "exists";
  if (fs.existsSync(templateDirectory))
    await fsp.rm(templateDirectory, { recursive: true, force: true });
  await fsp.mkdir(templateDirectory, { recursive: true });
  await fsp.cp(stagedSource, path.join(templateDirectory, "source"), {
    recursive: true,
  });
  const attestationRelative = result.source.attestationPath;
  if (attestationRelative) {
    const attestationPath = path.join(dossierDirectory, attestationRelative);
    if (!fs.existsSync(attestationPath)) {
      await fsp.mkdir(path.dirname(attestationPath), { recursive: true });
      await fsp.writeFile(
        attestationPath,
        attestationMarkdown(manifest, {
          method: result.method,
          license: result.license,
          licenseEvidencePath: result.source.licenseEvidencePath,
        }),
      );
    }
  }
  const files = buildFilesRecord(templateDirectory);
  const record = {
    schemaVersion: 1,
    dossierId: manifest.id,
    status: "extracted",
    method: result.method,
    source: result.source,
    entrypoint: result.entrypoint.startsWith("source/")
      ? result.entrypoint
      : `source/${result.entrypoint}`,
    files,
    excludedMedia: result.excludedMedia || [],
    notes: result.notes || null,
  };
  const digest = referenceTemplateDigest(record);
  const finalRecord = { ...record, digest };
  await fsp.writeFile(
    path.join(templateDirectory, "extraction.json"),
    `${JSON.stringify(finalRecord, null, 2)}\n`,
  );
  return "extracted";
}

async function writeStatusRecord({
  manifest,
  dossierDirectory,
  status,
  reason,
  method,
  source = {},
}) {
  const templateDirectory = path.join(dossierDirectory, "template");
  await fsp.mkdir(templateDirectory, { recursive: true });
  const attestationRelative =
    manifest.source?.rights === "owned" ? null : ATT_LICENSED;
  if (attestationRelative) {
    const attestationPath = path.join(dossierDirectory, attestationRelative);
    if (!fs.existsSync(attestationPath)) {
      await fsp.mkdir(path.dirname(attestationPath), { recursive: true });
      await fsp.writeFile(
        attestationPath,
        attestationMarkdown(manifest, {
          method,
          license: licenseFor(manifest),
          licenseEvidencePath: manifest.source?.rightsEvidencePath,
        }),
      );
    }
  }
  const record = {
    schemaVersion: 1,
    dossierId: manifest.id,
    status,
    method,
    source: {
      url: manifest.source?.url,
      repository: manifest.source?.repository || null,
      retrievedAt: nowIso(),
      attestationPath: attestationRelative,
      ...source,
    },
    reason,
  };
  await fsp.writeFile(
    path.join(templateDirectory, "extraction.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const write = args.write === true;
  const force = args.force === true;
  const indexOnly = args["index-only"] === true;
  const wantedClass = String(args.class || "all");
  const only = args.only
    ? new Set(
        String(args.only)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null;
  const limit = args.limit ? Number(args.limit) : null;
  const options = {
    artifactsRoot: path.resolve(
      root,
      String(args["artifacts-root"] || "artifacts"),
    ),
    timeoutMs: args["timeout-ms"] ? Number(args["timeout-ms"]) : 60000,
    delayMs: args["delay-ms"] ? Number(args["delay-ms"]) : 1500,
  };

  if (indexOnly) {
    const entries = listReferenceTemplateEntries(root);
    const index = buildReferenceTemplateIndex(entries);
    if (write) writeReferenceTemplateIndex(root);
    console.log(
      `template_index=${write ? "written" : "dry-run"} entries=${index.entries.length} extracted=${index.summary.extracted} pending=${index.summary.pending} unavailable=${index.summary.unavailable} failed=${index.summary.failed}`,
    );
    return;
  }

  const dossiersRoot = path.join(root, "data/reference-library/dossiers");
  const ids = fs
    .readdirSync(dossiersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const plans = [];
  for (const id of ids) {
    if (only && !only.has(id)) continue;
    const dossierDirectory = path.join(dossiersRoot, id);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dossierDirectory, "manifest.json"), "utf8"),
    );
    const classification = classifyDossier(manifest);
    if (wantedClass !== "all" && classification !== wantedClass) continue;
    plans.push({ id, dossierDirectory, manifest, classification });
  }
  const selected = limit ? plans.slice(0, limit) : plans;

  const summary = {
    planned: selected.length,
    extracted: 0,
    skipped: 0,
    failed: 0,
    unavailable: 0,
  };
  if (!write) {
    for (const plan of selected) {
      const existing = readReferenceTemplateRecord(plan.dossierDirectory);
      const state = existing
        ? `${existing.status}${existing.status === "extracted" ? " (kept)" : " (will retry)"}`
        : "new";
      console.log(
        `would_extract id=${plan.id} class=${plan.classification} state=${state}`,
      );
    }
    console.log(
      `template_extract_dry_run planned=${summary.planned} pass --write to extract`,
    );
    return;
  }

  for (const plan of selected) {
    const existing = readReferenceTemplateRecord(plan.dossierDirectory);
    if (existing?.status === "extracted" && !force) {
      summary.skipped += 1;
      console.log(`skip id=${plan.id} reason=already-extracted`);
      continue;
    }
    const method = methodFor(plan.manifest, plan.classification);
    let staged;
    try {
      staged = await stageExtraction(
        plan.manifest,
        plan.classification,
        options,
      );
    } catch (error) {
      summary.failed += 1;
      console.error(`failed id=${plan.id} error=${errorText(error)}`);
      if (existing?.status !== "extracted") {
        await writeStatusRecord({
          manifest: plan.manifest,
          dossierDirectory: plan.dossierDirectory,
          status: "failed",
          reason: errorText(error),
          method,
        });
      }
      if (plan.classification === "live") await sleep(options.delayMs);
      continue;
    }
    try {
      if (staged.status === "unavailable") {
        summary.unavailable += 1;
        console.log(
          `unavailable id=${plan.id} reason=${staged.reason || "unknown"}`,
        );
        if (existing?.status !== "extracted") {
          await writeStatusRecord({
            manifest: plan.manifest,
            dossierDirectory: plan.dossierDirectory,
            status: "unavailable",
            reason:
              staged.reason || "No extraction adapter produced a template.",
            method,
          });
        }
        continue;
      }
      const result = {
        ...staged,
        method,
        source: {
          url: plan.manifest.source?.url,
          ...staged.source,
          attestationPath:
            plan.manifest.source?.rights === "owned" ? null : ATT_LICENSED,
        },
      };
      const status = await commitExtraction({
        manifest: plan.manifest,
        dossierDirectory: plan.dossierDirectory,
        stagedSource: staged.stagedSource,
        result,
        force: force || existing?.status !== "extracted",
      });
      if (status === "exists") {
        summary.skipped += 1;
        console.log(`skip id=${plan.id} reason=existing-template-kept`);
      } else {
        summary.extracted += 1;
        console.log(`extracted id=${plan.id} class=${plan.classification}`);
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`failed id=${plan.id} error=${errorText(error)}`);
      if (existing?.status !== "extracted") {
        await writeStatusRecord({
          manifest: plan.manifest,
          dossierDirectory: plan.dossierDirectory,
          status: "failed",
          reason: errorText(error),
          method,
        });
      }
    } finally {
      if (staged?.workspace)
        await fsp.rm(staged.workspace, { recursive: true, force: true });
    }
    if (plan.classification === "live") await sleep(options.delayMs);
  }
  const index = writeReferenceTemplateIndex(root);
  console.log(
    `template_extract done planned=${summary.planned} extracted=${summary.extracted} skipped=${summary.skipped} unavailable=${summary.unavailable} failed=${summary.failed} index_extracted=${index.summary.extracted} index_pending=${index.summary.pending}`,
  );
}

main().catch((error) => {
  console.error(`template_extract_error ${errorText(error)}`);
  process.exitCode = 1;
});
