import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const REFERENCE_TEMPLATE_SCHEMA_VERSION = 1;
export const REFERENCE_TEMPLATE_STATUSES = [
  "extracted",
  "pending",
  "unavailable",
  "failed",
];
export const REFERENCE_TEMPLATE_METHODS = [
  "pinned-git",
  "zip-download",
  "owned-artifact",
  "live-site",
];

const LIVE_SITE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".txt",
  ".md",
  ".json",
  ".svg",
  ".xml",
]);
const BUNDLED_EXTENSIONS = new Set([
  ...LIVE_SITE_EXTENSIONS,
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

const DEFAULT_LIMITS = {
  maxFiles: 2500,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 80 * 1024 * 1024,
  liveMaxTotalBytes: 8 * 1024 * 1024,
  maxExcludedMedia: 300,
};

const SENSITIVE_QUERY_VALUE =
  /([?&](?:amp;)?(?:api[_-]?key|apikey|access[_-]?token|authorization|auth|credential|key|password|secret|sig|signature|token)=)[^&#"'<>\s]*/giu;

/**
 * Removes credential-like query values before URLs enter retained records.
 * Keep the parameter name and path so the inventory remains useful without
 * preserving a bearer, signed-media, or API credential value.
 */
export function redactSensitiveUrl(value, limit = 600) {
  return String(value || "")
    .replace(SENSITIVE_QUERY_VALUE, "$1[redacted]")
    .slice(0, limit);
}

export function redactSensitiveUrlText(value) {
  return String(value || "").replace(
    SENSITIVE_QUERY_VALUE,
    "$1[redacted]",
  );
}

/**
 * Live-site captures are structural references, not executable source. Remove
 * script-bearing fallbacks, comments containing executable markup, inline
 * handlers, and javascript URLs before retaining the DOM.
 */
export function scrubLiveTemplateHtml(value) {
  return redactSensitiveUrlText(String(value || ""))
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<\/?noscript\b[^>]*>/giu, "")
    .replace(
      /<!--[\s\S]*?(?:<script\b|javascript:|\son[a-z][\w:-]*\s*=)[\s\S]*?-->/giu,
      "",
    )
    .replace(
      /\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu,
      "",
    )
    .replace(
      /\s+(?:href|src|action|formaction|poster|data|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/giu,
      "",
    )
    .replace(/javascript:/giu, "about:blank");
}

export function scrubLiveTemplateCss(value) {
  return redactSensitiveUrlText(String(value || "")).replace(
    /javascript:/giu,
    "about:blank",
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function requiredText(value, label, limit = 500) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
  if (!normalized) throw new Error(`Reference template is missing ${label}.`);
  return normalized;
}

function optionalText(value, limit = 500) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
  return normalized || null;
}

function within(parent, child, label) {
  const relative = path.relative(parent, child);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error(
      `Reference template ${label} must stay inside its dossier folder.`,
    );
}

function normalizeSource(source = {}) {
  return {
    url: requiredText(source.url, "source URL", 600),
    repository: optionalText(source.repository, 500),
    revision: optionalText(source.revision, 200),
    templatePath: optionalText(source.templatePath, 400),
    artifactPath: optionalText(source.artifactPath, 400),
    generator: optionalText(source.generator, 400),
    license: optionalText(source.license, 120),
    licenseEvidencePath: optionalText(source.licenseEvidencePath, 260),
    rightsEvidencePath: optionalText(source.rightsEvidencePath, 260),
    attestationPath: optionalText(source.attestationPath, 260),
    archiveSha256: optionalText(source.archiveSha256, 64),
    finalUrl: optionalText(source.finalUrl, 600),
    httpStatus: Number.isInteger(source.httpStatus) ? source.httpStatus : null,
    pageTitle: optionalText(source.pageTitle, 200),
    retrievedAt: optionalText(source.retrievedAt, 40),
    tool: optionalText(source.tool, 120),
    viewport:
      source.viewport && typeof source.viewport === "object"
        ? {
            width: Number.isInteger(source.viewport.width)
              ? source.viewport.width
              : null,
            height: Number.isInteger(source.viewport.height)
              ? source.viewport.height
              : null,
          }
        : null,
  };
}

/**
 * Returns the canonical digest-free shape of a reference template record.
 * Writers and validators share this normalization so a written digest always
 * matches the recomputed digest.
 */
export function normalizeReferenceTemplateRecord(record = {}) {
  const files = Array.isArray(record.files)
    ? record.files
        .map((file) => ({
          path: requiredText(file?.path, "file path", 500).replaceAll(
            path.sep,
            "/",
          ),
          bytes: Number.isInteger(file?.bytes) ? file.bytes : -1,
          sha256: String(file?.sha256 || "").toLowerCase(),
        }))
        .sort((a, b) => a.path.localeCompare(b.path))
    : [];
  const excludedMedia = Array.isArray(record.excludedMedia)
    ? (() => {
        if (record.excludedMedia.length > DEFAULT_LIMITS.maxExcludedMedia)
          throw new Error(
            `Reference template excluded media exceeds the ${DEFAULT_LIMITS.maxExcludedMedia} entry limit.`,
          );
        return record.excludedMedia.map((entry) => ({
          url: requiredText(entry?.url, "excluded media URL", 600),
          reason: requiredText(entry?.reason, "excluded media reason", 120),
        }));
      })()
    : [];
  return {
    schemaVersion: REFERENCE_TEMPLATE_SCHEMA_VERSION,
    dossierId: requiredText(record.dossierId, "dossierId", 100),
    status: String(record.status || ""),
    method: String(record.method || ""),
    source: normalizeSource(record.source),
    entrypoint: optionalText(record.entrypoint, 500),
    files,
    excludedMedia,
    reason: optionalText(record.reason, 400),
  };
}

export function referenceTemplateDigest(record) {
  return crypto
    .createHash("sha256")
    .update(stableJson(normalizeReferenceTemplateRecord(record)))
    .digest("hex");
}

function extensionAllowed(method, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!extension) return false;
  if (method === "live-site") return LIVE_SITE_EXTENSIONS.has(extension);
  return BUNDLED_EXTENSIONS.has(extension);
}

export function validateReferenceTemplateRecord(record, options = {}) {
  const {
    dossierDirectory,
    dossierId,
    dossierRights,
    dossierRightsEvidencePath,
    templateDirectoryOverride,
    limits: limitOverrides,
  } = options;
  const limits = { ...DEFAULT_LIMITS, ...(limitOverrides || {}) };
  if (!record || typeof record !== "object")
    throw new Error("Reference template record must be an object.");
  if (!dossierDirectory)
    throw new Error(
      "Reference template validation requires a dossier directory.",
    );
  const directory = path.resolve(dossierDirectory);
  if (fs.realpathSync(directory) !== directory)
    throw new Error("Reference dossier directory must not be a symlink.");
  const normalized = normalizeReferenceTemplateRecord(record);
  const id = normalized.dossierId;
  if (dossierId && id !== dossierId)
    throw new Error(
      `Reference template dossierId '${id}' does not match its folder '${dossierId}'.`,
    );
  if (Number(record.schemaVersion) !== REFERENCE_TEMPLATE_SCHEMA_VERSION)
    throw new Error("Reference template schemaVersion must be 1.");
  if (!REFERENCE_TEMPLATE_STATUSES.includes(normalized.status))
    throw new Error(
      `Reference template status must be one of: ${REFERENCE_TEMPLATE_STATUSES.join(", ")}.`,
    );
  if (!REFERENCE_TEMPLATE_METHODS.includes(normalized.method))
    throw new Error(
      `Reference template method must be one of: ${REFERENCE_TEMPLATE_METHODS.join(", ")}.`,
    );

  const manifest = readDossierManifest(directory);
  const rightsEvidencePath =
    dossierRightsEvidencePath ||
    normalized.source.rightsEvidencePath ||
    manifest?.source?.rightsEvidencePath ||
    null;
  const attestationPath = normalized.source.attestationPath;
  if (dossierRights !== "owned") {
    if (!attestationPath)
      throw new Error(
        `Reference template '${id}' needs a local rights attestation path.`,
      );
    if (path.isAbsolute(attestationPath))
      throw new Error(
        "Template rights attestation path must be dossier-relative.",
      );
    const resolvedAttestation = path.resolve(directory, attestationPath);
    within(directory, resolvedAttestation, "rights attestation path");
    if (
      !fs.existsSync(resolvedAttestation) ||
      fs.lstatSync(resolvedAttestation).isSymbolicLink() ||
      !fs.statSync(resolvedAttestation).isFile()
    )
      throw new Error(
        `Reference template '${id}' is missing its local rights attestation: ${attestationPath}.`,
      );
    within(
      fs.realpathSync(directory),
      fs.realpathSync(resolvedAttestation),
      "rights attestation path",
    );

    if (!rightsEvidencePath)
      throw new Error(
        `Reference template '${id}' needs a source rights evidence path.`,
      );
    if (normalized.source.rightsEvidencePath !== rightsEvidencePath)
      throw new Error(
        `Reference template '${id}' rights evidence path must match its dossier manifest.`,
      );
    if (path.isAbsolute(rightsEvidencePath))
      throw new Error("Template rights evidence path must be dossier-relative.");
    const resolvedRightsEvidence = path.resolve(directory, rightsEvidencePath);
    within(directory, resolvedRightsEvidence, "rights evidence path");
    if (
      !fs.existsSync(resolvedRightsEvidence) ||
      fs.lstatSync(resolvedRightsEvidence).isSymbolicLink() ||
      !fs.statSync(resolvedRightsEvidence).isFile()
    )
      throw new Error(
        `Reference template '${id}' is missing source rights evidence: ${rightsEvidencePath}.`,
      );
    within(
      fs.realpathSync(directory),
      fs.realpathSync(resolvedRightsEvidence),
      "rights evidence path",
    );
    if (
      dossierRights === "licensed" &&
      normalized.source.licenseEvidencePath !== rightsEvidencePath
    )
      throw new Error(
        `Reference template '${id}' license evidence must match its dossier rights evidence path.`,
      );
  }

  if (normalized.status !== "extracted") {
    if (!normalized.reason)
      throw new Error(
        `Reference template '${id}' must record a reason for status '${normalized.status}'.`,
      );
    if (record.digest)
      throw new Error(
        `Reference template '${id}' must not declare a digest before extraction.`,
      );
    if (normalized.files.length)
      throw new Error(
        `Reference template '${id}' must not declare files before extraction.`,
      );
    return {
      ...normalized,
      reason: normalized.reason,
      notes: optionalText(record.notes, 600),
      digest: null,
    };
  }

  const templateDirectory = path.resolve(
    templateDirectoryOverride || path.join(directory, "template"),
  );
  if (
    !fs.existsSync(templateDirectory) ||
    fs.lstatSync(templateDirectory).isSymbolicLink() ||
    !fs.statSync(templateDirectory).isDirectory()
  )
    throw new Error(
      `Reference template '${id}' is missing its template folder.`,
    );
  within(
    fs.realpathSync(directory),
    fs.realpathSync(templateDirectory),
    "template folder",
  );

  const entrypoint = normalized.entrypoint;
  if (!entrypoint || !entrypoint.startsWith("source/"))
    throw new Error(
      `Reference template '${id}' entrypoint must live under its template source folder.`,
    );
  if (path.isAbsolute(entrypoint))
    throw new Error("Reference template entrypoint must be relative.");
  const entrypointPath = path.resolve(templateDirectory, entrypoint);
  within(templateDirectory, entrypointPath, "entrypoint");

  if (!normalized.files.length)
    throw new Error(`Reference template '${id}' has no retained files.`);
  if (normalized.files.length > limits.maxFiles)
    throw new Error(
      `Reference template '${id}' exceeds the ${limits.maxFiles} file limit.`,
    );

  const sourceDirectory = path.join(templateDirectory, "source");
  if (
    !fs.existsSync(sourceDirectory) ||
    fs.lstatSync(sourceDirectory).isSymbolicLink() ||
    !fs.statSync(sourceDirectory).isDirectory()
  )
    throw new Error(`Reference template '${id}' is missing its source folder.`);
  within(
    fs.realpathSync(templateDirectory),
    fs.realpathSync(sourceDirectory),
    "source folder",
  );
  const actualFiles = collectTemplateFiles(sourceDirectory).map(
    (file) => `source/${file}`,
  );
  const actualFileSet = new Set(actualFiles);
  let totalBytes = 0;
  const seen = new Set();
  for (const file of normalized.files) {
    if (seen.has(file.path))
      throw new Error(
        `Reference template '${id}' repeats file '${file.path}'.`,
      );
    seen.add(file.path);
    if (!file.path.startsWith("source/"))
      throw new Error(
        `Reference template '${id}' file '${file.path}' must live under its template source folder.`,
      );
    if (path.isAbsolute(file.path))
      throw new Error("Reference template file paths must be relative.");
    if (!extensionAllowed(normalized.method, file.path))
      throw new Error(
        `Reference template '${id}' file '${file.path}' is not an allowed ${normalized.method} asset.`,
      );
    const filePath = path.resolve(templateDirectory, file.path);
    within(templateDirectory, filePath, `file path '${file.path}'`);
    if (
      !fs.existsSync(filePath) ||
      fs.lstatSync(filePath).isSymbolicLink() ||
      !fs.statSync(filePath).isFile()
    )
      throw new Error(
        `Reference template '${id}' is missing retained file '${file.path}'.`,
      );
    within(
      fs.realpathSync(templateDirectory),
      fs.realpathSync(filePath),
      `file path '${file.path}'`,
    );
    const bytes = fs.readFileSync(filePath);
    if (bytes.length !== file.bytes)
      throw new Error(
        `Reference template '${id}' file '${file.path}' size does not match its record.`,
      );
    if (bytes.length > limits.maxFileBytes)
      throw new Error(
        `Reference template '${id}' file '${file.path}' exceeds the per-file size limit.`,
      );
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!/^[a-f0-9]{64}$/u.test(file.sha256) || sha256 !== file.sha256)
      throw new Error(
        `Reference template '${id}' file '${file.path}' SHA-256 does not match its retained bytes.`,
      );
    totalBytes += bytes.length;
  }
  for (const actualFile of actualFiles)
    if (!seen.has(actualFile))
      throw new Error(
        `Reference template '${id}' has an unrecorded retained file '${actualFile}'.`,
      );
  if (actualFileSet.size !== normalized.files.length)
    throw new Error(
      `Reference template '${id}' file manifest does not match retained files.`,
    );
  const totalLimit =
    normalized.method === "live-site"
      ? limits.liveMaxTotalBytes
      : limits.maxTotalBytes;
  if (totalBytes > totalLimit)
    throw new Error(
      `Reference template '${id}' exceeds the ${totalLimit} byte total limit.`,
    );
  if (!seen.has(entrypoint))
    throw new Error(
      `Reference template '${id}' entrypoint is not part of its retained files.`,
    );
  if (!fs.existsSync(entrypointPath))
    throw new Error(
      `Reference template '${id}' entrypoint is missing: ${entrypoint}.`,
    );

  const declaredDigest = String(record.digest || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(declaredDigest))
    throw new Error(
      `Reference template '${id}' must declare a SHA-256 digest.`,
    );
  const computedDigest = referenceTemplateDigest(record);
  if (declaredDigest !== computedDigest)
    throw new Error(
      `Reference template '${id}' digest does not match its retained record.`,
    );

  return {
    ...normalized,
    entrypoint,
    notes: optionalText(record.notes, 600),
    digest: computedDigest,
  };
}

export function readReferenceTemplateRecord(dossierDirectory) {
  const recordPath = path.join(dossierDirectory, "template", "extraction.json");
  if (!fs.existsSync(recordPath)) return null;
  if (fs.lstatSync(recordPath).isSymbolicLink())
    throw new Error(
      `Reference template record must not be a symlink: ${recordPath}.`,
    );
  return JSON.parse(fs.readFileSync(recordPath, "utf8"));
}

function readDossierManifest(dossierDirectory) {
  const manifestPath = path.join(dossierDirectory, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  if (fs.lstatSync(manifestPath).isSymbolicLink())
    throw new Error(`Reference dossier manifest must not be a symlink: ${manifestPath}.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest && typeof manifest === "object" ? manifest : null;
}

function readDossierRights(dossierDirectory) {
  return readDossierManifest(dossierDirectory)?.source?.rights || null;
}

function collectTemplateFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Reference template must not contain a symlink: ${fullPath}.`);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile())
        files.push(
          path.relative(directory, fullPath).replaceAll(path.sep, "/"),
        );
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

export function loadReferenceTemplate(
  dossierPath,
  { repositoryRoot = process.cwd() } = {},
) {
  const root = path.resolve(repositoryRoot);
  const relativeDirectory = requiredText(dossierPath, "dossierPath", 400);
  if (path.isAbsolute(relativeDirectory))
    throw new Error("Reference dossier path must be repository-relative.");
  const directory = path.resolve(root, relativeDirectory);
  within(root, directory, "dossier directory");
  const realRoot = fs.realpathSync(root);
  const realDirectory = fs.realpathSync(directory);
  within(realRoot, realDirectory, "dossier directory");
  if (realDirectory !== directory)
    throw new Error("Reference dossier directory must not be a symlink.");
  const record = readReferenceTemplateRecord(directory);
  if (!record) return null;
  const validated = validateReferenceTemplateRecord(record, {
    dossierDirectory: directory,
    dossierId: path.basename(directory),
    dossierRights: readDossierRights(directory),
    dossierRightsEvidencePath:
      readDossierManifest(directory)?.source?.rightsEvidencePath || null,
  });
  return {
    ...validated,
    path: `${relativeDirectory.replaceAll(path.sep, "/")}/template`,
    absoluteDirectory: path.join(directory, "template"),
  };
}

export function listReferenceTemplateEntries(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const dossiersRoot = path.join(root, "data/reference-library/dossiers");
  if (!fs.existsSync(dossiersRoot))
    throw new Error(`Reference dossier library is missing: ${dossiersRoot}.`);
  const ids = fs
    .readdirSync(dossiersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const entries = [];
  for (const id of ids) {
    const directory = path.join(dossiersRoot, id);
    const dossierPath = `data/reference-library/dossiers/${id}`;
    const rights = readDossierRights(directory);
    const rightsEvidencePath =
      readDossierManifest(directory)?.source?.rightsEvidencePath || null;
    const record = readReferenceTemplateRecord(directory);
    if (!record) {
      entries.push({
        id,
        dossierPath,
        status: "pending",
        method: null,
        digest: null,
        entrypoint: null,
        fileCount: 0,
        totalBytes: 0,
        rights,
        retrievedAt: null,
        reason: "No template extraction recorded yet.",
      });
      continue;
    }
    const validated = validateReferenceTemplateRecord(record, {
      dossierDirectory: directory,
      dossierId: id,
      dossierRights: rights,
      dossierRightsEvidencePath: rightsEvidencePath,
    });
    entries.push({
      id,
      dossierPath,
      status: validated.status,
      method: validated.method,
      digest: validated.digest,
      entrypoint: validated.entrypoint,
      fileCount: validated.files.length,
      totalBytes: validated.files.reduce((sum, file) => sum + file.bytes, 0),
      rights,
      retrievedAt: validated.source.retrievedAt,
      reason: validated.reason || null,
    });
  }
  return entries;
}

export function buildReferenceTemplateIndex(entries, { updatedAt } = {}) {
  const summary = {
    extracted: 0,
    pending: 0,
    unavailable: 0,
    failed: 0,
  };
  for (const entry of entries) {
    if (Object.prototype.hasOwnProperty.call(summary, entry.status))
      summary[entry.status] += 1;
  }
  return {
    schemaVersion: 1,
    id: "launchloom-reference-templates",
    updatedAt: updatedAt || new Date().toISOString(),
    policy:
      "internal-refinement-only; retained under owned, licensed, or permission-cleared rights",
    summary,
    entries,
  };
}

export function referenceTemplateIndexPath(repositoryRoot = process.cwd()) {
  return path.join(
    path.resolve(repositoryRoot),
    "data/reference-library/template-index.json",
  );
}

export function readReferenceTemplateIndex(repositoryRoot = process.cwd()) {
  const indexPath = referenceTemplateIndexPath(repositoryRoot);
  if (!fs.existsSync(indexPath)) return null;
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

export function writeReferenceTemplateIndex(
  repositoryRoot = process.cwd(),
  { updatedAt } = {},
) {
  const entries = listReferenceTemplateEntries(repositoryRoot);
  const index = buildReferenceTemplateIndex(entries, { updatedAt });
  const indexPath = referenceTemplateIndexPath(repositoryRoot);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`);
  fs.renameSync(temporaryPath, indexPath);
  return index;
}
