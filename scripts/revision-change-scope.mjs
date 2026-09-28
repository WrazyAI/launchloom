const BASE_REVISION_PATHS = Object.freeze([
  "AGENTS.md",
  "docs/site-generation-guidelines.md",
  "src/site.config.json",
]);

const CREATIVE_BUNDLE_PATHS = Object.freeze([
  "src/generated-experiences/selected/Experience.jsx",
  "src/generated-experiences/selected/styles.css",
  "src/generated-experiences/selected/motion.js",
  "src/generated-experiences/selected/manifest.json",
]);

function normalizeRevisionPath(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`An ${label} is empty or invalid.`);
  if (value !== value.trim())
    throw new Error(`Unsafe revision path in ${label}: ${value}`);
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    /^[a-z]:/iu.test(normalized) ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    /[*?\[\]]/u.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error(`Unsafe revision path in ${label}: ${value}`);
  return segments.join("/");
}

/**
 * Build the exact changed-file allowlist for one client feedback revision.
 * @param {{templateFiles?: string[], creativeSourceRepairRequired?: boolean, creativeSourceRepairVerified?: {pass?: boolean, candidateId?: string} | null, selectedCandidateId?: string}} [options]
 * @returns {string[]}
 */
export function buildRevisionAllowedPaths({
  templateFiles = [],
  creativeSourceRepairRequired = false,
  creativeSourceRepairVerified = null,
  selectedCandidateId = "",
} = {}) {
  if (!Array.isArray(templateFiles))
    throw new Error("Revision template file report must be an array.");
  const allowed = new Set(BASE_REVISION_PATHS);
  for (const templateFile of templateFiles) {
    const relative = normalizeRevisionPath(
      templateFile,
      "template sync report",
    );
    allowed.add(relative.startsWith("src/") ? relative : `src/${relative}`);
  }
  const verifiedCandidateId = String(
    creativeSourceRepairVerified?.candidateId || "",
  ).trim();
  const selectedId = String(selectedCandidateId || "").trim();
  const creativeSourceRepairPassed =
    creativeSourceRepairRequired === true &&
    creativeSourceRepairVerified?.pass === true &&
    Boolean(verifiedCandidateId) &&
    Boolean(selectedId) &&
    verifiedCandidateId === selectedId;
  if (creativeSourceRepairPassed)
    for (const file of CREATIVE_BUNDLE_PATHS) allowed.add(file);
  return [...allowed].sort();
}

/**
 * Fail if a feedback revision changed any path outside its exact allowlist.
 * @param {string[]} changedPaths
 * @param {string[]} allowedPaths
 * @returns {string[]}
 */
export function assertRevisionChangedPathsAllowed(changedPaths, allowedPaths) {
  if (!Array.isArray(changedPaths) || !Array.isArray(allowedPaths))
    throw new Error("Revision changed paths and allowlist must be arrays.");
  const changed = [
    ...new Set(
      changedPaths.map((item) => normalizeRevisionPath(item, "git diff")),
    ),
  ].sort();
  const allowed = new Set(
    allowedPaths.map((item) => normalizeRevisionPath(item, "allowlist")),
  );
  const rejected = changed.filter((item) => !allowed.has(item));
  if (rejected.length)
    throw new Error(`Out-of-scope revision paths: ${rejected.join(", ")}`);
  return changed;
}
