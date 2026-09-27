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
  const candidateNames = ["candidate-a", "candidate-b", "candidate-c"];
  const candidateFiles = [
    "Experience.jsx",
    "content-manifest.json",
    "contract.json",
    "metadata.json",
    "motion.js",
    "styles.css",
  ];
  const copiedRootFiles = [
    "creative-run.json",
    "content-manifest.json",
    "reasoning-preflight.json",
  ];
  const allowedRootEntries = new Set([...candidateNames, ...copiedRootFiles]);
  const entries = await fs.readdir(candidatesPath, { withFileTypes: true });
  const unexpectedEntries = entries.filter(
    (entry) => !allowedRootEntries.has(entry.name),
  );
  assert(
    unexpectedEntries.length === 0,
    `Reusable candidate source contains unexpected top-level entries: ${unexpectedEntries.map((entry) => entry.name).join(", ")}`,
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
      (item) => !item.isFile() || !candidateFiles.includes(item.name),
    );
    assert(
      unexpectedFiles.length === 0 &&
        same(
          sourceFiles.map((item) => item.name).sort(),
          [...candidateFiles].sort(),
        ),
      `${candidateName} must contain exactly the six validated candidate files.`,
    );
  }
  assert(
    same(candidateNames, ["candidate-a", "candidate-b", "candidate-c"]),
    "Reusable candidate set must contain exactly candidate-a, candidate-b, and candidate-c.",
  );

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
      for (const file of candidateFiles)
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
    const expectedRootManifest = buildCreativeContentManifest(
      config,
      inspiration.routes[0],
    );
    assert(
      same(rootManifest, expectedRootManifest) &&
        run.contentManifestDigest === expectedRootManifest.digest,
      "Reusable root content manifest does not match the supplied configuration.",
    );

    for (const [index, candidateName] of candidateNames.entries()) {
      const candidatePath = path.join(staging, candidateName);
      const [metadata, contentManifest, contract, experience, styles, motion] =
        await Promise.all([
          readJson(path.join(candidatePath, "metadata.json")),
          readJson(path.join(candidatePath, "content-manifest.json")),
          readJson(path.join(candidatePath, "contract.json")),
          fs.readFile(path.join(candidatePath, "Experience.jsx"), "utf8"),
          fs.readFile(path.join(candidatePath, "styles.css"), "utf8"),
          fs.readFile(path.join(candidatePath, "motion.js"), "utf8"),
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
        files: { experience, styles, motion },
        route: { ...route, referenceDna: route.referenceDna },
        content: contentManifest.values,
      });
    }

    await fs.rename(staging, destination);
    return {
      validated: true,
      count: candidateNames.length,
      routes: inspiration.routes.map((route) => route.id),
      sessionId: creativeSession.sessionId,
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
      `reused_authored_candidates validated=${result.validated} count=${result.count} routes=${result.routes.join(",")} session_bound=true`,
    );
  } catch (error) {
    console.error(`Reusable creative candidates rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
