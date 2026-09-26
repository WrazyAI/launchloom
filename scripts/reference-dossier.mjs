import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateReferenceDna } from "./reference-dna.mjs";

const CLEARED_RIGHTS = new Set(["owned", "licensed", "permission-cleared"]);
const PROMPT_HEADINGS = [
  "visual hierarchy",
  "page sequence",
  "responsive translation",
  "signature elements",
  "prohibited patterns",
];
const TAG_GROUPS = ["business", "style", "composition", "conversion", "motion", "imagery"];

function requiredText(value, label, limit = 500) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
  if (!normalized) throw new Error(`Reference dossier is missing ${label}.`);
  return normalized;
}

function safeList(value, label, minimum = 1, maximum = 24) {
  if (!Array.isArray(value)) throw new Error(`Reference dossier ${label} must be a list.`);
  const result = value.map((item) => requiredText(item, label, 240)).slice(0, maximum);
  if (result.length < minimum) throw new Error(`Reference dossier ${label} needs at least ${minimum} item(s).`);
  return result;
}

function within(parent, child, label) {
  const relative = path.relative(parent, child);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`Reference dossier ${label} must stay inside its dossier folder.`);
}

function pngDimensions(filePath, label) {
  const bytes = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error(`Reference dossier ${label} must be a readable PNG screenshot.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function resolveScreenshot(directory, screenshot, label, viewportKind) {
  if (!screenshot || typeof screenshot !== "object")
    throw new Error(`Reference dossier needs a ${label} full-page screenshot.`);
  if (screenshot.capture !== "full-page")
    throw new Error(`Reference dossier ${label} capture must be full-page.`);
  const relative = requiredText(screenshot.path, `${label} screenshot path`, 260);
  if (path.isAbsolute(relative))
    throw new Error(`Reference dossier ${label} screenshot path must be relative.`);
  const filePath = path.resolve(directory, relative);
  within(directory, filePath, `${label} screenshot path`);
  if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isSymbolicLink() || !fs.statSync(filePath).isFile())
    throw new Error(`Reference dossier ${label} full-page screenshot is missing: ${relative}.`);
  const realDirectory = fs.realpathSync(directory);
  const realFilePath = fs.realpathSync(filePath);
  within(realDirectory, realFilePath, `${label} screenshot path`);
  const dimensions = pngDimensions(filePath, `${label} full-page capture`);
  const viewport = screenshot.viewport;
  const widthMin = viewportKind === "desktop" ? 1024 : 320;
  const widthMax = viewportKind === "desktop" ? 7680 : 767;
  if (!Number.isInteger(viewport?.width) || viewport.width < widthMin || viewport.width > widthMax)
    throw new Error(`Reference dossier ${label} viewport width is invalid for ${viewportKind}.`);
  if (!Number.isInteger(viewport?.height) || viewport.height < 600 || viewport.height > 4320)
    throw new Error(`Reference dossier ${label} viewport height is invalid.`);
  if (dimensions.width !== viewport.width || dimensions.height < viewport.height)
    throw new Error(`Reference dossier ${label} screenshot dimensions do not match its full-page viewport evidence.`);
  return {
    path: relative,
    absolutePath: filePath,
    available: true,
    required: true,
    fullPage: true,
    width: dimensions.width,
    height: dimensions.height,
    viewport: { width: viewport.width, height: viewport.height },
  };
}

function normalizeReferenceDna(manifest, screenshots) {
  const dna = manifest.referenceDna;
  if (!dna || typeof dna !== "object")
    throw new Error("Reference dossier is missing its structured referenceDna contract.");
  const value = {
    version: 2,
    familyId: requiredText(manifest.familyId, "familyId", 100),
    referenceName: requiredText(manifest.referenceName, "referenceName", 180),
    source: requiredText(manifest.source?.name, "source name", 160),
    sourceUrl: requiredText(manifest.source?.url, "source URL", 500),
    rights: requiredText(manifest.source?.rights, "source rights", 40),
    evidence: {
      desktopScreenshot: screenshots.desktop,
      mobileScreenshot: screenshots.mobile,
      annotatedDescription: requiredText(dna.annotatedDescription, "annotated design description", 1400),
    },
    heroGeometry: dna.heroGeometry,
    navigationGeometry: dna.navigationGeometry,
    typography: dna.typography,
    palette: dna.palette,
    imageTreatment: dna.imageTreatment,
    sectionSequence: safeList(dna.sectionSequence, "section sequence", 4, 20),
    sectionSequenceEvidence: safeList(dna.sectionSequence, "section sequence", 4, 20),
    servicePresentation: dna.servicePresentation,
    ctaPlacement: dna.ctaPlacement,
    motion: dna.motion,
    mobileRecomposition: dna.mobileRecomposition,
    prohibitedPatterns: safeList(dna.prohibitedPatterns, "prohibited patterns", 2, 30),
    requiredSignatureElements: Array.isArray(dna.requiredSignatureElements)
      ? dna.requiredSignatureElements
      : [],
    acceptanceChecks: safeList(dna.acceptanceChecks, "reference acceptance checks", 3, 30),
    measurements: null,
    analyzedFromEvidence: false,
    analyzerModel: "",
    analyzedAt: "",
    complete: true,
    incompleteReasons: [],
  };
  return validateReferenceDna(value, { requireEvidence: true });
}

export function validateReferenceDossier(manifest, { dossierDirectory } = {}) {
  if (!manifest || typeof manifest !== "object")
    throw new Error("Reference dossier manifest must be an object.");
  if (Number(manifest.schemaVersion) !== 1)
    throw new Error("Reference dossier schemaVersion must be 1.");
  if (typeof manifest.productionEligible !== "boolean")
    throw new Error("Reference dossier productionEligible must be an explicit boolean.");
  const id = requiredText(manifest.id, "id", 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id))
    throw new Error("Reference dossier id must be a lowercase slug.");
  requiredText(manifest.referenceName, "referenceName", 180);
  requiredText(manifest.familyId, "familyId", 100);
  const source = manifest.source;
  requiredText(source?.name, "source name", 160);
  requiredText(source?.url, "source URL", 500);
  const rights = requiredText(source?.rights, "source rights", 40);
  if (!CLEARED_RIGHTS.has(rights))
    throw new Error(`Reference dossier '${id}' is not cleared for persistent storage (rights: ${rights}).`);
  requiredText(source?.rightsEvidence, "rights evidence", 600);
  const businessKinds = safeList(manifest.businessKinds, "businessKinds", 1, 16);
  const sourceTags = manifest.tags && typeof manifest.tags === "object" ? manifest.tags : {};
  const tags = Object.fromEntries(
    TAG_GROUPS.map((group) => {
      if (manifest.productionEligible && !Array.isArray(sourceTags[group]))
        throw new Error(`Production dossier '${id}' needs a '${group}' tag list.`);
      const fallback = group === "business" ? businessKinds : [];
      return [group, Array.isArray(sourceTags[group])
        ? safeList(sourceTags[group], `${group} tags`, 1, 30)
        : fallback];
    }),
  );
  const directory = path.resolve(dossierDirectory || process.cwd());
  const desktop = resolveScreenshot(directory, manifest.evidence?.desktop, "desktop", "desktop");
  const mobile = resolveScreenshot(directory, manifest.evidence?.mobile, "mobile", "mobile");
  let rightsEvidenceDigest = null;
  let rightsEvidencePath = "";
  const assetEvidencePaths = [];
  const assetEvidenceDigests = {};
  if (rights !== "owned") {
    rightsEvidencePath = requiredText(source?.rightsEvidencePath, "local rights evidence path", 260);
    if (path.isAbsolute(rightsEvidencePath))
      throw new Error("Reference rights evidence path must be dossier-relative.");
    const proofPath = path.resolve(directory, rightsEvidencePath);
    within(directory, proofPath, "rights evidence path");
    if (!fs.existsSync(proofPath) || fs.lstatSync(proofPath).isSymbolicLink() || !fs.statSync(proofPath).isFile())
      throw new Error(`Reference dossier '${id}' is missing its local license or permission evidence.`);
    within(fs.realpathSync(directory), fs.realpathSync(proofPath), "rights evidence path");
    rightsEvidenceDigest = crypto.createHash("sha256").update(fs.readFileSync(proofPath)).digest("hex");
    const declaredAssets = Array.isArray(source?.assetEvidencePaths) ? source.assetEvidencePaths : [];
    if (manifest.productionEligible && !declaredAssets.length)
      throw new Error(`Production dossier '${id}' needs explicit license evidence for bundled images and fonts.`);
    for (const value of declaredAssets) {
      const relative = requiredText(value, "asset rights evidence path", 260);
      if (path.isAbsolute(relative))
        throw new Error("Asset rights evidence paths must be dossier-relative.");
      const assetPath = path.resolve(directory, relative);
      within(directory, assetPath, "asset rights evidence path");
      if (!fs.existsSync(assetPath) || fs.lstatSync(assetPath).isSymbolicLink() || !fs.statSync(assetPath).isFile())
        throw new Error(`Reference dossier '${id}' is missing an asset license/credit record: ${relative}.`);
      within(fs.realpathSync(directory), fs.realpathSync(assetPath), "asset rights evidence path");
      assetEvidencePaths.push(relative);
      assetEvidenceDigests[relative] = crypto.createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex");
    }
  }
  const promptPath = path.join(directory, "design-prompt.md");
  if (
    !fs.existsSync(promptPath) ||
    fs.lstatSync(promptPath).isSymbolicLink() ||
    !fs.lstatSync(promptPath).isFile()
  )
    throw new Error(`Reference dossier '${id}' design-prompt.md must be a regular file inside its folder.`);
  within(fs.realpathSync(directory), fs.realpathSync(promptPath), "design-prompt path");
  const designPrompt = fs.readFileSync(promptPath, "utf8").trim();
  if (designPrompt.length < 900 || designPrompt.length > 18_000)
    throw new Error(`Reference dossier '${id}' design-prompt.md must be 900 to 18000 characters.`);
  for (const heading of PROMPT_HEADINGS)
    if (!new RegExp(`^#{1,3}\\s+${heading}\\s*$`, "imu").test(designPrompt))
      throw new Error(`Reference dossier '${id}' design-prompt.md needs a '${heading}' section.`);
  const referenceDna = normalizeReferenceDna(manifest, { desktop, mobile });
  return {
    schemaVersion: 1,
    id,
    productionEligible: manifest.productionEligible,
    referenceName: requiredText(manifest.referenceName, "referenceName", 180),
    familyId: requiredText(manifest.familyId, "familyId", 100),
    source: {
      name: requiredText(source.name, "source name", 160),
      url: requiredText(source.url, "source URL", 500),
      rights,
      rightsEvidence: requiredText(source.rightsEvidence, "rights evidence", 600),
      ...(rightsEvidencePath ? { rightsEvidencePath } : {}),
      ...(assetEvidencePaths.length ? { assetEvidencePaths } : {}),
    },
    businessKinds,
    tags,
    evidence: { desktop, mobile },
    referenceDna,
    designPrompt,
    review: manifest.review && typeof manifest.review === "object" ? manifest.review : { status: "unreviewed" },
    evidenceDigests: {
      desktop: crypto.createHash("sha256").update(fs.readFileSync(desktop.absolutePath)).digest("hex"),
      mobile: crypto.createHash("sha256").update(fs.readFileSync(mobile.absolutePath)).digest("hex"),
      rightsEvidence: rightsEvidenceDigest,
      assets: assetEvidenceDigests,
    },
    digest: crypto.createHash("sha256").update(JSON.stringify({
      manifest,
      designPrompt,
      desktopDigest: crypto.createHash("sha256").update(fs.readFileSync(desktop.absolutePath)).digest("hex"),
      mobileDigest: crypto.createHash("sha256").update(fs.readFileSync(mobile.absolutePath)).digest("hex"),
      rightsEvidenceDigest,
      assetEvidenceDigests,
    })).digest("hex"),
  };
}

export function loadReferenceDossier(dossierPath, { repositoryRoot = process.cwd() } = {}) {
  const root = path.resolve(repositoryRoot);
  const relativeDirectory = requiredText(dossierPath, "dossierPath", 400);
  if (path.isAbsolute(relativeDirectory))
    throw new Error("Reference dossier path must be repository-relative.");
  const directory = path.resolve(root, relativeDirectory);
  within(root, directory, "directory");
  if (
    !fs.existsSync(directory) ||
    fs.lstatSync(directory).isSymbolicLink() ||
    !fs.statSync(directory).isDirectory()
  )
    throw new Error(`Reference dossier folder is missing: ${relativeDirectory}.`);
  within(fs.realpathSync(root), fs.realpathSync(directory), "directory");
  const manifestPath = path.join(directory, "manifest.json");
  if (!fs.existsSync(manifestPath) || fs.lstatSync(manifestPath).isSymbolicLink())
    throw new Error(`Reference dossier manifest is missing: ${relativeDirectory}/manifest.json.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const dossier = validateReferenceDossier(manifest, { dossierDirectory: directory });
  if (dossier.id !== path.basename(directory))
    throw new Error(`Reference dossier id '${dossier.id}' does not match its folder '${path.basename(directory)}'.`);
  const dossierRelativePath = relativeDirectory.replaceAll(path.sep, "/");
  const desktopScreenshot = {
    ...dossier.referenceDna.evidence.desktopScreenshot,
    path: `${dossierRelativePath}/${dossier.evidence.desktop.path}`,
  };
  const mobileScreenshot = {
    ...dossier.referenceDna.evidence.mobileScreenshot,
    path: `${dossierRelativePath}/${dossier.evidence.mobile.path}`,
  };
  return {
    ...dossier,
    path: dossierRelativePath,
    referenceDna: {
      ...dossier.referenceDna,
      evidence: {
        ...dossier.referenceDna.evidence,
        desktopScreenshot,
        mobileScreenshot,
      },
    },
  };
}

export function assertReferenceDossierMatchesRecord(dossier, record, { repositoryRoot = process.cwd() } = {}) {
  const root = path.resolve(repositoryRoot);
  for (const [kind, field] of [["desktop", "screenshotPath"], ["mobile", "mobileScreenshotPath"]]) {
    const registeredPath = requiredText(record?.[field], `${kind} registry screenshot path`, 400);
    if (path.isAbsolute(registeredPath))
      throw new Error(`Inspiration record '${record.id}' ${kind} screenshot path must be repository-relative.`);
    const registeredAbsolutePath = path.resolve(root, registeredPath);
    within(root, registeredAbsolutePath, `${kind} registry screenshot path`);
    const dossierAbsolutePath = dossier.evidence[kind].absolutePath;
    if (!fs.existsSync(registeredAbsolutePath))
      throw new Error(`Inspiration record '${record.id}' registered ${kind} screenshot is missing: ${registeredPath}.`);
    const registeredDigest = crypto.createHash("sha256").update(fs.readFileSync(registeredAbsolutePath)).digest("hex");
    const dossierDigest = crypto.createHash("sha256").update(fs.readFileSync(dossierAbsolutePath)).digest("hex");
    if (registeredDigest !== dossierDigest)
      throw new Error(`Reference dossier '${dossier.id}' ${kind} screenshot does not match its registry evidence.`);
  }
}

export function assertReferenceDossierPack(pack, { repositoryRoot = process.cwd() } = {}) {
  if (!pack?.referenceDossiersRequired) return pack;
  if (!Array.isArray(pack.routes) || pack.routes.length !== 3)
    throw new Error("A dossier-backed production pack must contain exactly three routes.");
  const selectedIds = new Set();
  for (const route of pack.routes) {
    const bound = route.referenceDossier;
    if (!bound?.path || !bound.digest || !bound.designPrompt)
      throw new Error(`Production route '${route.id}' is missing its bound Reference Dossier.`);
    const actual = loadReferenceDossier(bound.path, { repositoryRoot });
    if (
      !actual.productionEligible ||
      actual.id !== bound.id ||
      actual.familyId !== bound.familyId ||
      actual.digest !== bound.digest ||
      JSON.stringify(actual.tags) !== JSON.stringify(bound.tags)
    )
      throw new Error(`Production route '${route.id}' has a stale or mismatched Reference Dossier.`);
    if (actual.designPrompt !== bound.designPrompt)
      throw new Error(`Production route '${route.id}' design prompt differs from its dossier source.`);
    if (selectedIds.has(actual.id))
      throw new Error(`Production pack reuses dossier '${actual.id}' across routes.`);
    selectedIds.add(actual.id);
    const dna = route.referenceDna;
    if (
      dna?.familyId !== actual.referenceDna.familyId ||
      dna?.rights !== actual.source.rights ||
      dna?.evidence?.desktopScreenshot?.path !== actual.referenceDna.evidence.desktopScreenshot.path ||
      dna?.evidence?.mobileScreenshot?.path !== actual.referenceDna.evidence.mobileScreenshot.path ||
      !dna?.evidence?.desktopScreenshot?.available ||
      !dna?.evidence?.mobileScreenshot?.available ||
      !dna?.evidence?.desktopScreenshot?.fullPage ||
      !dna?.evidence?.mobileScreenshot?.fullPage
    )
      throw new Error(`Production route '${route.id}' Reference DNA does not match its required dossier evidence.`);
  }
  return pack;
}

export function referenceDossierPromptBlock(dossier, { maximumCharacters = 18_000 } = {}) {
  if (!dossier) return "";
  const designPrompt = String(dossier.designPrompt || "").trim();
  if (!designPrompt) throw new Error("Reference dossier is missing design prompt.");
  if (designPrompt.length > maximumCharacters)
    throw new Error(`Reference design prompt exceeds its ${maximumCharacters}-character budget.`);
  return [
    `REFERENCE DOSSIER: ${dossier.referenceName} [${dossier.id}]`,
    `Family: ${dossier.familyId}`,
    `Tags: ${JSON.stringify(dossier.tags || {})}`,
    `Rights: ${dossier.source.rights}. Transfer visual mechanics only; do not copy brand identity, source copy, assets, or trade dress.`,
    "The dossier is the authoritative description of this route. Do not average it with other references or substitute a familiar template.",
    designPrompt,
  ].join("\n\n");
}
