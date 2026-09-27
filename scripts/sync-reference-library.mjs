import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREATIVE_FAMILIES } from "./creative-compiler.mjs";
import {
  loadReferenceDossier,
  validateReferenceDossier,
} from "./reference-dossier.mjs";

const root = path.resolve(import.meta.dirname, "..");
const corePath = path.join(root, "data/reference-library/core-collection.json");
const registryPath = path.join(root, "data/inspiration-registry.json");
const requiredProvenanceEvidence = [
  "rights/requester-attestation.md",
  "rights/business-verification.md",
  "rights/capture-record.md",
];
const PROVENANCE_ONLY_ASSET_EVIDENCE = new Set([
  "business-verification.md",
  "capture-record.md",
  "generated-assets.md",
  "generated-image-manifest.md",
  "imagegen-prompts.md",
  "openai-output-terms.md",
  "provenance.md",
  "readme.md",
  "requester-attestation.md",
  "source-observations.md",
  "source-provenance.md",
  "source-readme.md",
  "source-revision.txt",
]);

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizedSourceUrl(value) {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString();
}

function familyForDossier(dossier) {
  const dna = dossier.referenceDna;
  const text = [
    dossier.familyId,
    dna.annotatedDescription,
    dna.heroGeometry.mode,
    dna.navigationGeometry.mode,
    dna.servicePresentation.pattern,
    dna.motion.primitive,
    ...dna.sectionSequence,
    ...dossier.tags.composition,
    ...dossier.tags.motion,
  ].join(" ").toLowerCase();
  const rules = [
    ["guided-conversation", /guided|conversation|consultation|qualifier|questionnaire|intake form|question-led/u],
    ["utility-diagnostic", /diagnostic|problem-led|symptom|inspection|service-desk|quote form|troubleshoot/u],
    ["market-collage", /collage|mosaic|asymmetric grid|layered grid|overlapping/u],
    ["archive-rail", /archive|collection|portfolio|project gallery|work gallery|case stud|editorial menu|service taxonomy|service index|equipment-and-copy|resource index|article cards/u],
    ["spatial-object", /spatial|object-led|product render|artifact|3d scene/u],
    ["cinematic-stage", /cinematic|full-bleed|film-like|image-led|immersive photograph|aerial photograph/u],
    ["typographic-poster", /poster|oversized type|kinetic type|condensed|typographic/u],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "editorial-monument";
}

function makeRecord(dossier, niche, existing) {
  if (existing) {
    const familyId = Object.hasOwn(CREATIVE_FAMILIES, existing.familyId)
      ? existing.familyId
      : familyForDossier(dossier);
    return {
      ...existing,
      source: dossier.source.name,
      sourceUrl: dossier.source.url,
      rights: dossier.source.rights,
      industries: unique([...(existing.industries || []), niche.businessKind]),
      familyId,
      referenceFamilyId: dossier.familyId,
      dossierPath: dossier.path,
      screenshotPath: `${dossier.path}/${dossier.evidence.desktop.path}`,
      mobileScreenshotPath: `${dossier.path}/${dossier.evidence.mobile.path}`,
      referenceTags: existing.referenceTags || dossier.tags,
      evidenceKind: existing.evidenceKind || `${dossier.source.rights}-reference`,
    };
  }
  const dna = dossier.referenceDna;
  const familyId = familyForDossier(dossier);
  return {
    id: dossier.id,
    name: dossier.referenceName,
    referenceName: dossier.referenceName,
    referenceFamilyId: dossier.familyId,
    source: dossier.source.name,
    sourceUrl: dossier.source.url,
    rights: dossier.source.rights,
    industries: unique([...dossier.businessKinds, ...dossier.tags.business, niche.businessKind]),
    moods: unique(dossier.tags.style),
    navigation: dna.navigationGeometry.mode,
    heroGeometry: dna.heroGeometry.mode,
    servicePresentation: dna.servicePresentation.pattern,
    sectionRhythm: dna.sectionSequence.join(" -> "),
    typographyCategory: dna.typography.display,
    imageStrategy: dna.imageTreatment.mode,
    motionOpportunities: unique([dna.motion.primitive, ...dossier.tags.motion]),
    familyId,
    dossierPath: dossier.path,
    mobileBehavior: dna.mobileRecomposition.strategy,
    prohibitedPatterns: dna.prohibitedPatterns,
    screenshotPath: `${dossier.path}/${dossier.evidence.desktop.path}`,
    mobileScreenshotPath: `${dossier.path}/${dossier.evidence.mobile.path}`,
    referenceNotes: dna.annotatedDescription,
    notes: `Permission-cleared reference for ${niche.label}. Transfer design mechanics only.`,
    evidenceKind: `${dossier.source.rights}-direct-site`,
    sourceStyles: dossier.tags.style,
    sourceFonts: [dna.typography.display],
    referenceTags: dossier.tags,
  };
}

function normalizeManifestEvidence(manifest, directory) {
  manifest.source ||= {};
  const existingAssets = Array.isArray(manifest.source.assetEvidencePaths)
    ? manifest.source.assetEvidencePaths
    : [];
  const provenance = new Set(
    Array.isArray(manifest.source.provenanceEvidencePaths)
      ? manifest.source.provenanceEvidencePaths
      : [],
  );
  const assets = [];
  for (const value of existingAssets) {
    const relative = String(value || "").trim();
    if (!relative || relative === manifest.source.rightsEvidencePath) continue;
    const basename = path.basename(relative).toLowerCase();
    if (
      manifest.source.rights !== "licensed" ||
      PROVENANCE_ONLY_ASSET_EVIDENCE.has(basename)
    )
      provenance.add(relative);
    else assets.push(relative);
  }
  for (const relative of requiredProvenanceEvidence) {
    if (
      relative !== manifest.source.rightsEvidencePath &&
      fs.existsSync(path.join(directory, relative))
    )
      provenance.add(relative);
  }
  const normalizedAssets = unique(assets);
  const normalizedProvenance = unique(
    [...provenance].filter((relative) => relative !== manifest.source.rightsEvidencePath),
  );
  if (normalizedAssets.length)
    manifest.source.assetEvidencePaths = normalizedAssets;
  else delete manifest.source.assetEvidencePaths;
  if (normalizedProvenance.length)
    manifest.source.provenanceEvidencePaths = normalizedProvenance;
  else delete manifest.source.provenanceEvidencePaths;
}

export function buildSyncedLibraryState({ core, registry, repositoryRoot = root }) {
  if (!Array.isArray(core?.niches) || core.niches.length !== 14)
    throw new Error("Canonical local SEO core must contain exactly 14 niches.");
  const coreIds = core.niches.flatMap((niche) => {
    if (!Array.isArray(niche.referenceIds) || niche.referenceIds.length !== 6)
      throw new Error(`Core niche '${niche.id}' must have exactly six reference IDs.`);
    return niche.referenceIds;
  });
  if (new Set(coreIds).size !== 84)
    throw new Error("Canonical core must contain exactly 84 unique dossier IDs.");

  const existingById = new Map(registry.records.map((record) => [record.id, record]));
  const sourceByUrl = new Map();
  const manifests = new Map();
  const normalizedBusinessKindByNiche = new Map(
    core.niches.map((niche) => [
      niche,
      String(niche.businessKind || "").trim().toLowerCase(),
    ]),
  );
  for (const niche of core.niches) {
    for (const id of niche.referenceIds) {
      const dossierPath = `data/reference-library/dossiers/${id}`;
      const directory = path.join(repositoryRoot, dossierPath);
      const manifestPath = path.join(directory, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      normalizeManifestEvidence(manifest, directory);
      const dossier = validateReferenceDossier(manifest, { dossierDirectory: directory });
      if (!dossier.productionEligible)
        throw new Error(`Canonical reference '${id}' is not marked production eligible.`);
      const nicheKind = normalizedBusinessKindByNiche.get(niche) || "";
      if (!dossier.businessKinds.some((kind) => kind.toLowerCase() === nicheKind) &&
          !dossier.tags.business.some((kind) => kind.toLowerCase() === nicheKind))
        manifest.businessKinds = unique([...manifest.businessKinds, nicheKind]);
      manifest.tags.business = unique([...manifest.tags.business, nicheKind]);
      const sourceKey = normalizedSourceUrl(dossier.source.url);
      const previousSource = sourceByUrl.get(sourceKey);
      if (previousSource && previousSource !== id)
        throw new Error(`Core references '${previousSource}' and '${id}' reuse source URL ${sourceKey}.`);
      sourceByUrl.set(sourceKey, id);
      manifests.set(id, { manifest, directory, dossierPath });
    }
  }

  const records = [...registry.records];
  for (const niche of core.niches) {
    for (const id of niche.referenceIds) {
      const item = manifests.get(id);
      if (!item) throw new Error(`Core dossier '${id}' was not loaded.`);
      const manifest = item.manifest;
      const nicheKind = normalizedBusinessKindByNiche.get(niche) || "";
      if (!manifest.businessKinds.some((kind) => kind.toLowerCase() === nicheKind))
        manifest.businessKinds = unique([...manifest.businessKinds, nicheKind]);
      manifest.tags.business = unique([...manifest.tags.business, nicheKind]);
      const dossier = validateReferenceDossier(manifest, { dossierDirectory: item.directory });
      const existing = existingById.get(id);
      const record = makeRecord(
        { ...dossier, path: item.dossierPath },
        { ...niche, businessKind: nicheKind },
        existing,
      );
      if (existing) {
        const index = records.findIndex((entry) => entry.id === id);
        records[index] = record;
      } else {
        records.push(record);
      }
      item.manifest = manifest;
    }
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record.dossierPath)
      throw new Error(`Reference '${record.id}' has no canonical dossier path.`);
    const dossier = loadReferenceDossier(record.dossierPath, {
      repositoryRoot,
    });
    if (dossier.id !== record.id)
      throw new Error(
        `Reference '${record.id}' points to mismatched dossier '${dossier.id}'.`,
      );
    const directory = path.resolve(repositoryRoot, record.dossierPath);
    const existingManifest = manifests.get(record.id)?.manifest;
    const manifest = existingManifest || JSON.parse(
      fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
    );
    normalizeManifestEvidence(manifest, directory);
    manifests.set(record.id, {
      manifest,
      directory,
      dossierPath: record.dossierPath,
    });
    records[index] = {
      ...record,
      screenshotPath: dossier.referenceDna.evidence.desktopScreenshot.path,
      mobileScreenshotPath: dossier.referenceDna.evidence.mobileScreenshot.path,
    };
  }

  const nextRegistry = {
    ...registry,
    updatedAt: String(core.updatedAt || new Date().toISOString().slice(0, 10)),
    records,
  };
  return { registry: nextRegistry, manifests };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const check = args.includes("--check") || !args.includes("--plan");
  const core = JSON.parse(fs.readFileSync(corePath, "utf8"));
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const next = buildSyncedLibraryState({ core, registry, repositoryRoot: root });
  const changedManifests = [...next.manifests.entries()].filter(([, item]) => {
    const current = fs.readFileSync(path.join(item.directory, "manifest.json"), "utf8");
    return current !== `${JSON.stringify(item.manifest, null, 2)}\n`;
  });
  const currentRegistry = fs.readFileSync(registryPath, "utf8");
  const registryChanged = currentRegistry !== `${JSON.stringify(next.registry, null, 2)}\n`;
  if (write) {
    for (const { manifest, directory } of next.manifests.values())
      fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(registryPath, `${JSON.stringify(next.registry, null, 2)}\n`);
  } else if (check && (changedManifests.length || registryChanged)) {
    const changed = changedManifests.map(([id]) => id);
    if (registryChanged) changed.push("data/inspiration-registry.json");
    throw new Error(`Reference library sync is stale (${changed.join(", ")}). Run npm run sync:reference-library -- --write.`);
  }
  console.log(`reference_core_niches=${core.niches.length} reference_core_ids=84 registry_records=${next.registry.records.length} mode=${write ? "write" : check ? "check" : "plan"}`);
}
