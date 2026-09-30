import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCreativeContentManifest,
  validateProductionCandidateFiles,
} from "./production-experience-author.mjs";
import { businessKindMatches } from "./inspiration-registry.mjs";
import { assertReferenceDossierPack } from "./reference-dossier.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, item, index, values) =>
          index % 2 === 0
            ? [...pairs, [item.replace(/^--/u, ""), values[index + 1]]]
            : pairs,
        [],
      ),
  );
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
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

function withoutAnalysisTime(value) {
  if (Array.isArray(value)) return value.map(withoutAnalysisTime);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "analyzedAt")
      .map(([key, entry]) => [key, withoutAnalysisTime(entry)]),
  );
}

function same(left, right) {
  return stableJson(left) === stableJson(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dossierBinding(dossier) {
  if (!dossier || typeof dossier !== "object") return null;
  return {
    id: dossier.id || "",
    referenceName: dossier.referenceName || "",
    familyId: dossier.familyId || "",
    path: dossier.path || "",
    digest: dossier.digest || "",
    source: {
      name: dossier.source?.name || "",
      url: dossier.source?.url || "",
      rights: dossier.source?.rights || "",
    },
    tags: dossier.tags || {},
    designPrompt: dossier.designPrompt || "",
  };
}

const ALL_CANDIDATE_NAMES = ["candidate-a", "candidate-b", "candidate-c"];
const REQUIRED_AUTHORING_STAGES = ["contract", "experience", "styles", "motion"];
const ALLOWED_AUTHORING_STAGES = [...REQUIRED_AUTHORING_STAGES, "service", "service-index", "location"];

function candidateRouteIndex(candidateName) {
  return ALL_CANDIDATE_NAMES.indexOf(candidateName);
}

/**
 * Validate a complete or partial authored set without treating failed routes
 * as authored candidates. Partial sets are preview inputs only; the rendered
 * diversity and production gates remain authoritative later in the workflow.
 */
export function assertReusableCandidateSet(candidateNames, run, routes) {
  assert(
    Array.isArray(candidateNames) &&
      candidateNames.length >= 1 &&
      candidateNames.length <= ALL_CANDIDATE_NAMES.length &&
      candidateNames.every((name) => ALL_CANDIDATE_NAMES.includes(name)) &&
      new Set(candidateNames).size === candidateNames.length,
    "Reusable candidates must include at least one unique candidate-a/b/c directory.",
  );
  assert(
    Array.isArray(routes) && routes.length === ALL_CANDIDATE_NAMES.length,
    "Reusable candidates require the complete ordered three-route Reference DNA pack.",
  );
  const metadata = Array.isArray(run?.candidates) ? run.candidates : [];
  const candidateIds = metadata.map((candidate) => candidate?.candidateId);
  assert(
    same([...candidateIds].sort(), [...candidateNames].sort()),
    "Reusable candidate directories do not match the authored-run candidate manifest.",
  );
  for (const candidate of metadata) {
    const route = routes[candidateRouteIndex(candidate.candidateId)];
    assert(
      route && candidate.routeId === route.id,
      `${candidate.candidateId} does not match its ordered inspiration route.`,
    );
  }
  const failureIds = (Array.isArray(run?.failures) ? run.failures : []).map(
    (failure) => failure?.candidateId,
  );
  assert(
    failureIds.every((id) => ALL_CANDIDATE_NAMES.includes(id)) &&
      new Set(failureIds).size === failureIds.length &&
      !failureIds.some((id) => candidateIds.includes(id)) &&
      same(
        [...candidateIds, ...failureIds].sort(),
        [...ALL_CANDIDATE_NAMES].sort(),
      ),
    "Reusable authored-run outcomes must account for all three candidates without overlap.",
  );
  return true;
}

/** Validate that every reusable model stage is bound to the supplied visual evidence. */
export function assertReusablePromptEvidence(
  promptEvidence,
  { model, creativeSession, inspiration, candidateNames } = {},
) {
  assert(
    promptEvidence?.version === 1 &&
      promptEvidence.model === model &&
      Array.isArray(promptEvidence.records),
    "Reusable candidates require their versioned prompt-evidence manifest.",
  );
  const recordsByRoute = new Map();
  const routesById = new Map(inspiration.routes.map((route) => [route.id, route]));
  for (const record of promptEvidence.records) {
    const route = routesById.get(record?.routeId);
    assert(route, `Prompt evidence references unknown route '${record?.routeId}'.`);
    assert(
      record.referenceId === route.referenceDossier?.id &&
        record.referenceDossierDigest === route.referenceDossier?.digest,
      `Prompt evidence for ${record.routeId} is not bound to its validated dossier.`,
    );
    assert(
      record.sessionId === creativeSession.sessionId &&
        record.effort === creativeSession.reasoningEffort &&
        ALLOWED_AUTHORING_STAGES.includes(record.stage),
      `Prompt evidence for ${record.routeId} has an unexpected stage or frozen-session binding.`,
    );
    const suppliedEvidence = Array.isArray(record.evidence) ? record.evidence : [];
    for (const viewport of ["desktopScreenshot", "mobileScreenshot"]) {
      const reference = route.referenceDna?.evidence?.[viewport];
      const supplied = suppliedEvidence.find((item) => item?.path === reference?.path);
      assert(
        reference?.available !== false &&
          reference?.path &&
          reference?.sha256 &&
          supplied?.digest === reference.sha256,
        `Prompt evidence for ${record.routeId}/${record.stage} is missing the assigned ${viewport} screenshot digest.`,
      );
    }
    const routeRecords = recordsByRoute.get(record.routeId) || [];
    routeRecords.push(record);
    recordsByRoute.set(record.routeId, routeRecords);
  }

  for (const candidateName of candidateNames) {
    const route = inspiration.routes[candidateRouteIndex(candidateName)];
    const routeRecords = recordsByRoute.get(route.id) || [];
    const representedStages = new Set(routeRecords.map((record) => record.stage));
    assert(
      REQUIRED_AUTHORING_STAGES.every((stage) => representedStages.has(stage)),
      `Prompt evidence for ${candidateName} omits a required authoring stage.`,
    );
  }
  return true;
}

/**
 * @param {Record<string, any>} metadata
 * @param {Record<string, any>} contract
 * @param {Record<string, any>} route
 * @param {string} candidateName
 * @returns {true}
 */
export function assertReusableCandidateDossierBinding(
  metadata,
  contract,
  route,
  candidateName,
) {
  const expected = dossierBinding(route?.referenceDossier);
  assert(expected, `${candidateName} route has no validated Reference Dossier.`);
  for (const [label, actual] of [
    ["metadata", metadata?.creativeManifest?.referenceDossier || metadata?.referenceDossier],
    ["contract", contract?.creativeManifest?.referenceDossier],
  ])
    assert(
      same(dossierBinding(actual), expected),
      `${candidateName} ${label} Reference Dossier does not match its route.`,
    );
  return true;
}

/**
 * @param {{inspiration: Record<string, any>, config: Record<string, any>, repositoryRoot?: string}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function assertReusableInspirationPack({
  inspiration,
  config,
  repositoryRoot = process.cwd(),
} = {}) {
  assert(
    inspiration?.referenceDossiersRequired === true,
    "Reusable candidates require a permission-cleared dossier-backed Reference DNA pack.",
  );
  assert(
    inspiration.referenceLibrary?.policy === "permission-cleared-only" &&
      inspiration.referenceLibrary?.selectedDossierCount === 3 &&
      Array.isArray(inspiration.referenceLibrary?.recordIds),
    "Reusable candidates require the canonical permission-cleared reference-library binding.",
  );
  assertReferenceDossierPack(inspiration, { repositoryRoot });

  const configuredKind = String(config?.businessKind || config?.industry || "")
    .trim()
    .toLowerCase();
  const genericKinds = new Set([
    "",
    "all",
    "general",
    "other",
    "local-business",
    "local-service",
    "local-services",
    "small-business",
  ]);
  const businessKind = genericKinds.has(configuredKind)
    ? String(inspiration.request?.industry || "").trim().toLowerCase()
    : configuredKind;
  assert(
    businessKind && !genericKinds.has(businessKind),
    "Reusable candidates require a specific business kind.",
  );

  const corePath = path.join(repositoryRoot, "data/reference-library/core-collection.json");
  const core = JSON.parse(await fs.readFile(corePath, "utf8"));
  assert(
    Array.isArray(core?.niches) && core.niches.length > 0,
    "The canonical reference collection has no business niches.",
  );
  const matchingNiches = core.niches.filter((niche) =>
    businessKindMatches({ industries: [niche.businessKind] }, businessKind),
  );
  assert(
    matchingNiches.length > 0,
    `The canonical reference collection has no niche matching business kind '${businessKind}'.`,
  );
  const allowedDossierIds = new Set(
    matchingNiches.flatMap((niche) => Array.isArray(niche.referenceIds) ? niche.referenceIds : []),
  );
  const routeIds = inspiration.routes.map((route) => route.referenceDossier.id);
  assert(
    same([...routeIds].sort(), [...inspiration.referenceLibrary.recordIds].sort()),
    "Reusable reference-library IDs do not match the route dossier bindings.",
  );
  for (const route of inspiration.routes) {
    const dossier = route.referenceDossier;
    assert(
      allowedDossierIds.has(dossier.id) &&
        businessKindMatches({ industries: dossier.tags?.business }, businessKind),
      `Reusable dossier '${dossier.id}' is not in the canonical core niche for business kind '${businessKind}'.`,
    );
  }
  return inspiration;
}

function sessionBinding(metadata, expected, candidateId) {
  const reasoning = metadata.reasoning || {};
  const mismatches = [
    ["sessionId", reasoning.sessionId, expected.sessionId],
    ["effort", reasoning.effort, expected.reasoningEffort],
    ["policyVersion", reasoning.policyVersion, expected.reasoningPolicyVersion],
    [
      "selectorModelVersion",
      reasoning.selectorModelVersion,
      expected.selectorModelVersion,
    ],
  ].filter(([, actual, wanted]) => actual !== wanted);
  assert(
    mismatches.length === 0,
    `${candidateId} does not match the frozen reasoning session: ${mismatches
      .map(([field]) => field)
      .join(", ")}`,
  );
}

/**
 * @param {{configPath: string, inspirationPath: string, candidatesPath: string, outputPath: string, sessionPath: string, model: string, repositoryRoot?: string}} options
 * @returns {Promise<{validated: true, count: number, routes: string[], sessionId: string}>}
 */
export async function validateAndCopyReusableCandidates({
  configPath,
  inspirationPath,
  candidatesPath,
  outputPath,
  sessionPath,
  model,
  repositoryRoot = process.cwd(),
} = {}) {
  for (const [name, value] of Object.entries({
    configPath,
    inspirationPath,
    candidatesPath,
    outputPath,
    sessionPath,
    model,
  }))
    assert(
      typeof value === "string" && value.trim(),
      `Missing required ${name}.`,
    );

  const [config, inspiration, creativeSession] = await Promise.all([
    readJson(configPath),
    readJson(inspirationPath),
    readJson(sessionPath),
  ]);
  validateCreativeSessionConfig(creativeSession, { creativeModel: model });
  await assertReusableInspirationPack({ inspiration, config, repositoryRoot });
  assert(
    inspiration.referenceDnaAnalyzed === true &&
      Array.isArray(inspiration.routes) &&
      inspiration.routes.length === 3,
    "Reusable authored candidates require the complete three-route Reference DNA pack.",
  );
  const allCandidateNames = ALL_CANDIDATE_NAMES;
  const candidateFiles = [
    "Experience.jsx",
    "content-manifest.json",
    "contract.json",
    "metadata.json",
    "motion.js",
    "styles.css",
  ];
  // Authored candidates may carry service, location, and services-index page
  // companions from newer runs. They are validated when present but stay
  // optional for older frozen runs.
  const optionalCandidateFiles = [
    "ServicePage.jsx",
    "LocationPage.jsx",
    "ServicesIndexPage.jsx",
  ];
  const copiedRootFiles = [
    "creative-run.json",
    "content-manifest.json",
    "prompt-evidence.json",
    "reasoning-preflight.json",
  ];
  const allowedRootEntries = new Set([...allCandidateNames, ...copiedRootFiles]);
  const entries = await fs.readdir(candidatesPath, { withFileTypes: true });
  const unexpectedEntries = entries.filter(
    (entry) => !allowedRootEntries.has(entry.name),
  );
  assert(
      unexpectedEntries.length === 0,
      `Reusable candidate source contains unexpected top-level entries: ${unexpectedEntries.map((entry) => entry.name).join(", ")}`,
  );
  const candidateNames = allCandidateNames.filter((name) =>
    entries.some((entry) => entry.name === name && entry.isDirectory()),
  );
  assert(
    candidateNames.length > 0,
    "Reusable candidate source has no authored candidate directories.",
  );
  for (const file of copiedRootFiles) {
    const entry = entries.find((item) => item.name === file);
    assert(
      entry?.isFile(),
      `Reusable candidate source is missing regular file ${file}.`,
    );
  }
  for (const candidateName of candidateNames) {
    const entry = entries.find((item) => item.name === candidateName);
    assert(
      entry?.isDirectory(),
      `Reusable candidate source is missing ${candidateName}.`,
    );
    const sourceFiles = await fs.readdir(
      path.join(candidatesPath, candidateName),
      {
        withFileTypes: true,
      },
    );
    const unexpectedFiles = sourceFiles.filter(
      (item) =>
        !item.isFile() ||
        (!candidateFiles.includes(item.name) &&
          !optionalCandidateFiles.includes(item.name)),
    );
    assert(
      unexpectedFiles.length === 0 &&
        candidateFiles.every((name) =>
          sourceFiles.some((item) => item.name === name),
        ),
      `${candidateName} must contain the validated candidate files and no unexpected source.`,
    );
  }
  const source = path.resolve(candidatesPath);
  const destination = path.resolve(outputPath);
  const relative = path.relative(source, destination);
  const destinationInsideSource =
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative));
  assert(
    !destinationInsideSource,
    "Reusable candidate output must be outside the source candidate directory.",
  );
  await fs.access(destination).then(
    () => {
      throw new Error(
        "Reusable candidate output already exists; refusing to overwrite it.",
      );
    },
    (error) => {
      if (error.code !== "ENOENT") throw error;
    },
  );

  const staging = `${destination}.stage-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(staging, { recursive: false });
  try {
    for (const name of copiedRootFiles)
      await fs.copyFile(path.join(source, name), path.join(staging, name));
    for (const candidateName of candidateNames) {
      const stagedCandidate = path.join(staging, candidateName);
      await fs.mkdir(stagedCandidate);
      const names = await fs.readdir(path.join(source, candidateName));
      for (const file of names)
        await fs.copyFile(
          path.join(source, candidateName, file),
          path.join(stagedCandidate, file),
        );
    }

    const [run, rootManifest, rootSession] = await Promise.all([
      readJson(path.join(staging, "creative-run.json")),
      readJson(path.join(staging, "content-manifest.json")),
      readJson(path.join(staging, "reasoning-preflight.json")),
    ]);
    assert(
      run.status === "authored",
      "Reusable candidate run is not a complete authored run.",
    );
    assert(
      run.model === model,
      "Reusable candidate run was authored with a different model.",
    );
    assert(
      same(run.creativeSession, creativeSession) &&
        same(rootSession, creativeSession),
      "Reusable candidate run does not match the supplied frozen reasoning session.",
    );
    assertReusableCandidateSet(candidateNames, run, inspiration.routes);
    assertReusablePromptEvidence(
      await readJson(path.join(staging, "prompt-evidence.json")),
      { model, creativeSession, inspiration, candidateNames },
    );
    const expectedRootManifest = buildCreativeContentManifest(
      config,
      inspiration.routes[0],
    );
    assert(
      same(rootManifest, expectedRootManifest) &&
        run.contentManifestDigest === expectedRootManifest.digest,
      "Reusable root content manifest does not match the supplied configuration.",
    );

    for (const candidateName of candidateNames) {
      const index = candidateRouteIndex(candidateName);
      const candidatePath = path.join(staging, candidateName);
      const [
        metadata,
        contentManifest,
        contract,
        experience,
        styles,
        motion,
        servicePage,
        locationPage,
        servicesIndexPage,
      ] = await Promise.all([
        readJson(path.join(candidatePath, "metadata.json")),
        readJson(path.join(candidatePath, "content-manifest.json")),
        readJson(path.join(candidatePath, "contract.json")),
        fs.readFile(path.join(candidatePath, "Experience.jsx"), "utf8"),
        fs.readFile(path.join(candidatePath, "styles.css"), "utf8"),
        fs.readFile(path.join(candidatePath, "motion.js"), "utf8"),
        fs
          .readFile(path.join(candidatePath, "ServicePage.jsx"), "utf8")
          .catch(() => ""),
        fs
          .readFile(path.join(candidatePath, "LocationPage.jsx"), "utf8")
          .catch(() => ""),
        fs
          .readFile(path.join(candidatePath, "ServicesIndexPage.jsx"), "utf8")
          .catch(() => ""),
      ]);
      const route = inspiration.routes[index];
      const expectedManifest = buildCreativeContentManifest(config, route);
      const expectedDna = withoutAnalysisTime(route.referenceDna);
      const candidateDna = withoutAnalysisTime(
        metadata.creativeManifest?.referenceDna || metadata.referenceDna,
      );
      const contractDna = withoutAnalysisTime(
        contract.creativeManifest?.referenceDna || contract.route?.referenceDna,
      );
      assertReusableCandidateDossierBinding(
        metadata,
        contract,
        route,
        candidateName,
      );

      assert(
        metadata.candidateId === candidateName,
        `${candidateName} metadata identity mismatch.`,
      );
      assert(
        metadata.routeId === route.id,
        `${candidateName} route does not match the supplied Reference DNA pack.`,
      );
      assert(
        metadata.model === model,
        `${candidateName} was authored with a different model.`,
      );
      assert(
        contentManifest.digest === expectedManifest.digest &&
          same(contentManifest.values, expectedManifest.values) &&
          same(contentManifest.tokens, expectedManifest.tokens),
        `${candidateName} content tokens do not match the supplied site configuration.`,
      );
      assert(
        metadata.contentManifestDigest === expectedManifest.digest,
        `${candidateName} metadata is not bound to the supplied content manifest.`,
      );
      assert(
        expectedDna &&
          typeof expectedDna === "object" &&
          !Array.isArray(expectedDna) &&
          candidateDna &&
          typeof candidateDna === "object" &&
          !Array.isArray(candidateDna) &&
          contractDna &&
          typeof contractDna === "object" &&
          !Array.isArray(contractDna),
        `${candidateName} is missing a required Reference DNA binding.`,
      );
      assert(
        same(candidateDna, expectedDna) && same(contractDna, expectedDna),
        `${candidateName} Reference DNA does not match the supplied inspiration pack.`,
      );
      sessionBinding(metadata, creativeSession, candidateName);
      validateProductionCandidateFiles({
        files: {
          experience,
          styles,
          motion,
          ...(servicePage.trim() ? { servicePage } : {}),
          ...(locationPage.trim() ? { locationPage } : {}),
          ...(servicesIndexPage.trim() ? { servicesIndexPage } : {}),
        },
        route: { ...route, referenceDna: route.referenceDna },
        content: contentManifest.values,
      });
    }

    await fs.rename(staging, destination);
    return {
      validated: true,
      count: candidateNames.length,
      routes: candidateNames.map(
        (name) => inspiration.routes[candidateRouteIndex(name)].id,
      ),
      sessionId: creativeSession.sessionId,
      complete: candidateNames.length === allCandidateNames.length,
    };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const input = argsFrom(process.argv);
  try {
    const result = await validateAndCopyReusableCandidates({
      configPath: input.config,
      inspirationPath: input.inspiration,
      candidatesPath: input.candidates,
      outputPath: input.out,
      sessionPath: input.session,
      model: input.model,
    });
    console.log(
      `reused_authored_candidates validated=${result.validated} count=${result.count} complete=${result.complete} routes=${result.routes.join(",")} session_bound=true`,
    );
  } catch (error) {
    console.error(`Reusable creative candidates rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
