import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREATIVE_PROMOTION_THRESHOLDS,
  diversityReport,
  fingerprintDistance,
  scoreCreativeCandidate,
  validateCandidateManifest,
} from "./creative-compiler.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";
import {
  evaluateRenderedDiversity,
  evaluateRenderedReferenceFidelity,
} from "./rendered-reference-fidelity.mjs";
import { heroViewportFitFailure } from "./creative-viewport-policy.mjs";
import {
  copyClientBuildInput,
  copyTrustedBuildDependencies,
  runClientProcess,
} from "./client-build-environment.mjs";

export { heroViewportFitFailure };
export {
  fullPageCaptureErrors,
  inspect,
  prepareFullPageCapture,
  startServer,
} from "./client-render-harness.mjs";

const REQUIRED_RENDER_VIEWPORTS = [
  { name: "desktop", width: 1536, height: 864 },
  { name: "compact", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function stageTrustedRendererRuntime(trustedNodeModules) {
  const runtimeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "launchloom-trusted-renderer-"),
  );
  try {
    await fs.chmod(runtimeRoot, 0o755);
    const scriptsRoot = path.join(runtimeRoot, "scripts");
    const modulesRoot = path.join(runtimeRoot, "node_modules");
    const sourceScriptsRoot = path.dirname(fileURLToPath(import.meta.url));
    await fs.mkdir(scriptsRoot);
    await fs.mkdir(modulesRoot);
    for (const file of [
      "client-render-harness.mjs",
      "render-client-candidate.mjs",
    ])
      await fs.copyFile(
        path.join(sourceScriptsRoot, file),
        path.join(scriptsRoot, file),
      );
    for (const packageName of ["playwright", "playwright-core"])
      await copyTrustedBuildDependencies(
        path.join(trustedNodeModules, packageName),
        path.join(modulesRoot, packageName),
      );
    return {
      root: runtimeRoot,
      scriptPath: path.join(scriptsRoot, "render-client-candidate.mjs"),
    };
  } catch (error) {
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function validRatioBounds(value) {
  if (value === null) return true;
  return (
    isRecord(value) &&
    [
      "leftRatio",
      "topRatio",
      "widthRatio",
      "heightRatio",
      "areaRatio",
      "centerOffsetRatio",
      "bottomRatio",
    ].every((key) => Number.isFinite(value[key]))
  );
}

/**
 * Validate the untrusted render-worker report before its fields enter scoring.
 * @param {unknown} report
 * @param {{candidateId: string, requireRenderedDom?: boolean}} options
 * @returns {Record<string, any>}
 */
export function validateCreativeRenderReport(
  report,
  { candidateId, requireRenderedDom = false } = {},
) {
  const invalid = () =>
    new Error("Client render worker returned incomplete evidence.");
  if (
    !isRecord(report) ||
    report.version !== 1 ||
    report.candidateId !== candidateId ||
    !Array.isArray(report.viewports) ||
    report.viewports.length !== REQUIRED_RENDER_VIEWPORTS.length
  )
    throw invalid();

  for (const expected of REQUIRED_RENDER_VIEWPORTS) {
    const matches = report.viewports.filter(
      (entry) => isRecord(entry) && entry.name === expected.name,
    );
    if (matches.length !== 1) throw invalid();
    const entry = matches[0];
    if (entry.width !== expected.width || entry.height !== expected.height)
      throw invalid();
    if (
      !isRecord(entry.evidence) ||
      entry.evidence.viewportWidth !== expected.width ||
      entry.evidence.viewportHeight !== expected.height
    )
      throw invalid();

    const evidence = entry.evidence;
    const numericFields = [
      "h1Count",
      "missingFragments",
      "missingNavTargets",
      "missingAlt",
      "unnamedControls",
      "heroBottom",
      "viewportHeight",
      "viewportWidth",
      "brokenImages",
      "emDashes",
    ];
    const booleanFields = [
      "hasHero",
      "hasEarlyConversion",
      "hasServices",
      "hasFaqs",
      "hasContact",
      "hasLeadForm",
      "overflow",
    ];
    const stringArrayFields = [
      "navTargets",
      "referenceSignatures",
      "referenceSections",
    ];
    const stringFields = [
      "heroGeometry",
      "navigationGeometry",
      "servicePresentation",
      "ctaPlacement",
      "mobileRecomposition",
      "motionPrimitive",
      "creativeRenderer",
    ];
    if (
      numericFields.some((key) => !Number.isFinite(evidence[key])) ||
      booleanFields.some((key) => typeof evidence[key] !== "boolean") ||
      stringArrayFields.some(
        (key) =>
          !Array.isArray(evidence[key]) ||
          !evidence[key].every((value) => typeof value === "string"),
      ) ||
      stringFields.some((key) => typeof evidence[key] !== "string") ||
      !["headline", "openingImage", "navigation", "earlyConversion"].every(
        (key) => validRatioBounds(evidence[key]),
      )
    )
      throw invalid();

    if (
      !Array.isArray(entry.browserErrors) ||
      !entry.browserErrors.every((value) => typeof value === "string") ||
      !Array.isArray(entry.fullPageCaptureErrors) ||
      !entry.fullPageCaptureErrors.every((value) => typeof value === "string")
    )
      throw invalid();
    if (
      requireRenderedDom &&
      (typeof entry.renderedDom !== "string" || entry.renderedDom.length === 0)
    )
      throw invalid();
    if (
      !requireRenderedDom &&
      entry.renderedDom !== null &&
      typeof entry.renderedDom !== "string"
    )
      throw invalid();
  }
  return report;
}

function argsFrom(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
}

function hardFailures(evidence, viewport, referenceDna = null) {
  return [
    evidence.h1Count !== 1 && "expected one H1",
    !evidence.hasHero && "missing hero marker",
    !evidence.hasEarlyConversion && "missing early conversion marker",
    !evidence.hasServices && "missing services section",
    !evidence.hasFaqs && "missing FAQs section",
    !evidence.hasContact && "missing contact section",
    evidence.missingFragments > 0 && "missing required fragment target",
    evidence.missingNavTargets > 0 &&
      "navigation does not expose required targets",
    !evidence.hasLeadForm && "missing shared lead form runtime",
    evidence.missingAlt > 0 && "image is missing alt text",
    evidence.unnamedControls > 0 &&
      "interactive control has no accessible name",
    heroViewportFitFailure(evidence, viewport, referenceDna),
    evidence.overflow && "horizontal overflow",
    evidence.brokenImages > 0 && "broken image",
    evidence.emDashes > 0 && "em dash found",
    evidence.creativeRenderer !== "creative-candidate" &&
      "creative renderer marker missing",
  ].filter(Boolean);
}

/**
 * @param {{siteDir?: string, candidatesDir?: string, reportPath?: string, screenshotsDir?: string, promote?: boolean, preview?: boolean, deferPromotion?: boolean, excludedCandidateIds?: string[], renderedReferenceEvaluator?: (input: any) => Promise<any>, renderedDiversityEvaluator?: (input: any) => Promise<any>, requireDiversity?: boolean, runClientProcessImpl?: typeof runClientProcess}} options
 * @returns {Promise<Record<string, any>>}
 */
export async function runCreativeBakeoff({
  siteDir = "templates/client-site",
  candidatesDir = ".launchloom/generated-experiences",
  reportPath,
  screenshotsDir,
  promote = false,
  preview = false,
  deferPromotion = false,
  excludedCandidateIds = [],
  renderedReferenceEvaluator = evaluateRenderedReferenceFidelity,
  renderedDiversityEvaluator = evaluateRenderedDiversity,
  requireDiversity = true,
  runClientProcessImpl = runClientProcess,
} = {}) {
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const reportFile = path.resolve(
    root,
    reportPath || ".launchloom/creative-bakeoff.json",
  );
  const evidenceDir = path.resolve(
    root,
    screenshotsDir || ".launchloom/creative-bakeoff-screenshots",
  );
  const entries = (
    await fs.readdir(candidateRoot, { withFileTypes: true }).catch(() => [])
  )
    .filter(
      (entry) =>
        entry.isDirectory() && /^candidate-[a-z0-9]+$/u.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  if (!entries.length)
    throw new Error(`No creative candidates found in ${candidateRoot}.`);

  const excludedIds = new Set(
    Array.isArray(excludedCandidateIds)
      ? excludedCandidateIds.filter(
          (candidateId) => typeof candidateId === "string" && candidateId,
        )
      : [],
  );
  if (excludedIds.size && (!preview || promote))
    throw new Error(
      "Candidate exclusions are only supported for non-promoting preview reruns.",
    );
  const candidates = [];
  for (const directory of entries) {
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(candidateRoot, directory, "metadata.json"),
        "utf8",
      ),
    );
    const manifest = validateCandidateManifest(
      metadata.creativeManifest || metadata,
    );
    if (excludedIds.has(manifest.candidateId)) continue;
    candidates.push({ directory, metadata, manifest });
  }
  if (!candidates.length) {
    const exclusions = [...excludedIds].sort();
    throw new Error(
      exclusions.length
        ? `No creative candidates remain after exclusions: ${exclusions.join(", ")}.`
        : `No creative candidates found in ${candidateRoot}.`,
    );
  }
  const diversity = diversityReport(candidates.map(({ metadata }) => metadata));
  const originalConfigPath = path.join(root, "src/site.config.json");
  const originalConfig = await fs.readFile(originalConfigPath, "utf8");
  const selectedDir = path.join(root, "src/generated-experiences/selected");
  const selectedBackup = `${selectedDir}.bakeoff-${process.pid}`;
  await fs.rm(selectedBackup, { recursive: true, force: true });
  await fs
    .cp(selectedDir, selectedBackup, { recursive: true, force: true })
    .catch(() => {});
  const results = [];
  await fs.mkdir(evidenceDir, { recursive: true });

  let rendererRuntime;
  try {
    const trustedNodeModules = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../node_modules",
    );
    await fs.access(trustedNodeModules);
    rendererRuntime = await stageTrustedRendererRuntime(trustedNodeModules);

    for (const candidate of candidates) {
      const candidateResult = {
        candidateId: candidate.manifest.candidateId,
        directory: candidate.directory,
        familyId: candidate.manifest.familyId,
        fingerprint: candidate.manifest.fingerprint,
        manifest: candidate.manifest,
        valid: true,
        score: 0,
        failures: [],
        commandDiagnostics: [],
        viewports: [],
      };
      let candidateCommandStage = "candidate-validation";
      try {
        const experienceSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "Experience.jsx"),
          "utf8",
        );
        const stylesSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "styles.css"),
          "utf8",
        );
        const motionSource = await fs.readFile(
          path.join(candidateRoot, candidate.directory, "motion.js"),
          "utf8",
        );
        const sourceFidelity =
          candidate.manifest.version >= 2
            ? validateReferenceCandidate({
                referenceDna: candidate.manifest.referenceDna,
                experienceSource,
                stylesSource,
                motionSource,
              })
            : {
                version: 1,
                pass: true,
                visualPass: true,
                score: 100,
                findings: [],
                hardFindings: [],
                visualFindings: [],
                requiredSignatures: [],
              };
        candidateResult.referenceFidelity = sourceFidelity;
        if (!sourceFidelity.pass)
          candidateResult.failures.push(
            ...sourceFidelity.hardFindings.map(
              (item) => `source: ${item.message}`,
            ),
          );
        await promoteCreativeCandidate({
          siteDir: root,
          candidateDir: path.relative(
            root,
            path.join(candidateRoot, candidate.directory),
          ),
          // Rendering a candidate for the bakeoff must remain available even
          // when source-level visual findings are present. Production
          // publication is enforced by the final promotion call below.
          preview: true,
        });
        const clientWorkerRoot = await fs.mkdtemp(
          path.join(os.tmpdir(), "launchloom-client-render-"),
        );
        const clientWorkerSite = path.join(clientWorkerRoot, "site");
        const clientWorkerEvidence = path.join(clientWorkerRoot, "evidence");
        const renderReportPath = path.join(
          clientWorkerRoot,
          "render-report.json",
        );
        let renderReport;
        try {
          await fs.mkdir(clientWorkerSite, { recursive: true });
          await fs.mkdir(clientWorkerEvidence, { recursive: true });
          await copyClientBuildInput(root, clientWorkerSite);
          await copyTrustedBuildDependencies(
            trustedNodeModules,
            path.join(clientWorkerSite, "node_modules"),
          );
          const safeWorkerEnv = {
            PUBLIC_REVIEW_MODE: "true",
            PLAYWRIGHT_BROWSERS_PATH:
              process.env.PLAYWRIGHT_BROWSERS_PATH ||
              path.join(os.homedir(), ".cache", "ms-playwright"),
          };
          candidateCommandStage = "client-build";
          await runClientProcessImpl({
            command: "npm",
            args: ["run", "build"],
            cwd: clientWorkerSite,
            writablePaths: [clientWorkerRoot],
            envOverrides: safeWorkerEnv,
          });
          candidateCommandStage = "browser-render";
          await runClientProcessImpl({
            command: process.execPath,
            args: [
              rendererRuntime.scriptPath,
              "--site-dir",
              clientWorkerSite,
              "--candidate-id",
              candidate.manifest.candidateId,
              "--evidence",
              clientWorkerEvidence,
              "--report",
              renderReportPath,
              "--capture-viewport",
              String(candidate.manifest.version >= 2),
            ],
            cwd: clientWorkerSite,
            writablePaths: [clientWorkerRoot],
            envOverrides: safeWorkerEnv,
          });
          const reportStat = await fs.lstat(renderReportPath);
          if (!reportStat.isFile() || reportStat.size > 4 * 1024 * 1024)
            throw new Error(
              "Client render worker returned an invalid report file.",
            );
          renderReport = validateCreativeRenderReport(
            JSON.parse(await fs.readFile(renderReportPath, "utf8")),
            {
              candidateId: candidate.manifest.candidateId,
              requireRenderedDom: candidate.manifest.version >= 2,
            },
          );
          for (const entry of await fs.readdir(clientWorkerEvidence)) {
            if (!/^candidate-[a-z0-9]+-[a-z]+(?:-viewport)?\.png$/u.test(entry))
              throw new Error(
                "Client render worker returned an unsafe artifact name.",
              );
            const artifactStat = await fs.lstat(
              path.join(clientWorkerEvidence, entry),
            );
            if (!artifactStat.isFile() || artifactStat.size > 50 * 1024 * 1024)
              throw new Error(
                "Client render worker returned an invalid screenshot file.",
              );
            await fs.copyFile(
              path.join(clientWorkerEvidence, entry),
              path.join(evidenceDir, entry),
            );
          }
        } finally {
          await fs.rm(clientWorkerRoot, { recursive: true, force: true });
        }
        for (const renderedViewport of renderReport.viewports) {
          const viewport = {
            name: renderedViewport.name,
            width: renderedViewport.width,
            height: renderedViewport.height,
          };
          const evidence = renderedViewport.evidence;
          const browserErrors = renderedViewport.browserErrors || [];
          const failures = [
            ...hardFailures(
              evidence,
              viewport,
              candidate.manifest.referenceDna,
            ),
            browserErrors.length > 0 && "browser error",
          ].filter(Boolean);
          candidateResult.failures.push(
            ...failures.map((failure) => `${viewport.name}: ${failure}`),
          );
          candidateResult.viewports.push({
            ...viewport,
            ...evidence,
            browserErrors,
          });
          if (candidate.manifest.version >= 2) {
            const renderedFidelity = validateReferenceCandidate({
              referenceDna: candidate.manifest.referenceDna,
              experienceSource,
              stylesSource,
              motionSource,
              renderedDom: renderedViewport.renderedDom,
            });
            const viewportVisualFindings = renderedFidelity.visualFindings.map(
              (item) => ({
                ...item,
                viewport: viewport.name,
              }),
            );
            candidateResult.referenceFidelity = {
              ...candidateResult.referenceFidelity,
              rendered: renderedFidelity,
              renderedByViewport: {
                ...(candidateResult.referenceFidelity.renderedByViewport || {}),
                [viewport.name]: renderedFidelity,
              },
              renderedVisualFindings: [
                ...(candidateResult.referenceFidelity.renderedVisualFindings ||
                  []),
                ...viewportVisualFindings,
              ],
              pass:
                candidateResult.referenceFidelity.pass && renderedFidelity.pass,
            };
            if (!renderedFidelity.pass)
              candidateResult.failures.push(
                ...renderedFidelity.hardFindings.map(
                  (item) => `${viewport.name}: ${item.message}`,
                ),
              );
          }
          candidateResult.failures.push(
            ...(renderedViewport.fullPageCaptureErrors || []),
          );
        }
        if (candidate.manifest.version >= 2) {
          const renderedReference = await renderedReferenceEvaluator({
            referenceDna: candidate.manifest.referenceDna,
            candidateScreenshots: {
              desktop: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-desktop-viewport.png`,
              ),
              compact: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-compact-viewport.png`,
              ),
              mobile: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-mobile-viewport.png`,
              ),
              fullDesktop: path.join(
                evidenceDir,
                `${candidate.manifest.candidateId}-desktop.png`,
              ),
            },
            renderedGeometry: Object.fromEntries(
              candidateResult.viewports.map((viewport) => [
                viewport.name,
                {
                  viewportWidth: viewport.width,
                  viewportHeight: viewport.viewportHeight,
                  heroBottom: viewport.heroBottom,
                  headline: viewport.headline,
                  openingImage: viewport.openingImage,
                  navigation: viewport.navigation,
                  earlyConversion: viewport.earlyConversion,
                },
              ]),
            ),
          });
          candidateResult.renderedReferenceFidelity = renderedReference;
          candidateResult.referenceFidelity = {
            ...candidateResult.referenceFidelity,
            sourceContractScore:
              candidateResult.referenceFidelity?.score ?? 100,
            sourceVisualFindings:
              candidateResult.referenceFidelity?.visualFindings || [],
            pixelScore: renderedReference.score,
            pixelPass: renderedReference.pass,
            score: renderedReference.score,
            pass:
              candidateResult.referenceFidelity?.pass !== false &&
              renderedReference.pass,
          };
          if (!renderedReference.pass) {
            const visualFindings = renderedReference.audit?.findings || [];
            candidateResult.failures.push(
              ...(visualFindings.length
                ? visualFindings.map(
                    (item) =>
                      `rendered-reference: ${item.evidence || item.category}`,
                  )
                : ["rendered-reference: reference fidelity did not pass"]),
            );
          }
        }
      } catch (error) {
        candidateResult.failures.push(
          error instanceof Error ? error.message : String(error),
        );
        const diagnostic = error?.clientProcessDiagnostic;
        if (diagnostic)
          candidateResult.commandDiagnostics.push({
            stage: candidateCommandStage,
            ...diagnostic,
          });
      }
      candidateResult.failures = [...new Set(candidateResult.failures)];
      candidateResult.valid = candidateResult.failures.length === 0;
      const desktopEvidence = candidateResult.viewports.filter(
        (viewport) => viewport.name !== "mobile",
      );
      const mobileEvidence = candidateResult.viewports.find(
        (viewport) => viewport.name === "mobile",
      );
      const allEvidence = candidateResult.viewports;
      candidateResult.visualFingerprint = allEvidence[0]
        ? [
            allEvidence[0].referenceSignatures?.join(","),
            allEvidence[0].referenceSections?.join(","),
            allEvidence[0].heroGeometry,
            allEvidence[0].servicePresentation,
            allEvidence[0].motionPrimitive,
          ].join("|")
        : "";
      const pixelScores =
        candidateResult.renderedReferenceFidelity?.audit?.scores || {};
      const visual = {
        hierarchy:
          candidateResult.manifest.version >= 2
            ? Math.round(
                (Number(pixelScores.typography || 0) +
                  Number(pixelScores.spatialRhythm || 0)) /
                  2,
              )
            : allEvidence.every(
                  (viewport) => viewport.h1Count === 1 && viewport.hasHero,
                )
              ? 100
              : 0,
        composition:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.heroGeometry || 0)
            : desktopEvidence.every(
                  (viewport) =>
                    viewport.heroBottom <= viewport.viewportHeight + 1 &&
                    !viewport.overflow,
                )
              ? 100
              : 0,
        responsive:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.mobileRecomposition || 0)
            : Boolean(
                  mobileEvidence &&
                  !mobileEvidence.overflow &&
                  mobileEvidence.hasHero,
                )
              ? 100
              : 0,
        industryFit:
          candidateResult.manifest.version >= 2
            ? Math.round(
                (Number(pixelScores.imagery || 0) +
                  Number(pixelScores.servicePresentation || 0)) /
                  2,
              )
            : 80,
        conversion: allEvidence.every(
          (viewport) => viewport.hasEarlyConversion && viewport.hasLeadForm,
        )
          ? candidateResult.manifest.version >= 2
            ? Number(pixelScores.ctaPlacement || 0)
            : 100
          : 0,
        referenceFidelity: candidateResult.referenceFidelity?.score ?? 0,
        motionEvidence:
          candidateResult.manifest.version >= 2
            ? Number(pixelScores.interactionEvidence || 0)
            : allEvidence.every((viewport) => viewport.motionPrimitive)
              ? 100
              : 0,
        imageRelevance: allEvidence.every(
          (viewport) => viewport.brokenImages === 0,
        )
          ? candidateResult.manifest.version >= 2
            ? Number(pixelScores.imagery || 0)
            : 100
          : 0,
      };
      const technical = {
        accessibility: allEvidence.every(
          (viewport) =>
            viewport.missingAlt === 0 &&
            viewport.unnamedControls === 0 &&
            viewport.browserErrors.length === 0,
        )
          ? 100
          : 0,
      };
      const peerDistances = candidates
        .filter(
          (peer) =>
            peer.manifest.candidateId !== candidate.manifest.candidateId,
        )
        // The compact creative manifest intentionally carries the route
        // fingerprint hash, but not every structural dimension. Compare the
        // authored metadata so pairwise diversity reflects the actual route
        // grammar rather than collapsing distinct candidates to distance 1.
        .map((peer) => fingerprintDistance(candidate.metadata, peer.metadata));
      const minimumDistance = peerDistances.length
        ? Math.min(...peerDistances)
        : candidate.manifest.version >= 2
          ? CREATIVE_PROMOTION_THRESHOLDS.minimumFingerprintDistance
          : 0;
      const distinctivenessScore = Math.min(
        100,
        Math.round(
          (minimumDistance /
            CREATIVE_PROMOTION_THRESHOLDS.minimumFingerprintDistance) *
            100,
        ),
      );
      candidateResult.visualScore = Math.round(
        Object.values(visual).reduce((sum, value) => sum + value, 0) /
          Object.keys(visual).length,
      );
      candidateResult.technicalScore = technical.accessibility;
      candidateResult.distinctivenessScore = distinctivenessScore;
      candidateResult.minimumFingerprintDistance = minimumDistance;
      // Structural fingerprint distinctiveness remains diagnostic for v2.
      // Rendered screenshot diversity is evaluated after all candidates render
      // and is the sole diversity authority for v2 promotion.
      const scoringDistinctiveness =
        candidate.manifest.version >= 2 ? 100 : distinctivenessScore;
      candidateResult.score = scoreCreativeCandidate({
        hardPass: candidateResult.valid,
        visual,
        technical,
        distinctiveness: scoringDistinctiveness,
      });
      candidateResult.eligible =
        candidateResult.valid &&
        candidateResult.referenceFidelity?.pass !== false &&
        candidateResult.referenceFidelity?.score >=
          CREATIVE_PROMOTION_THRESHOLDS.referenceFidelityScore &&
        candidateResult.visualScore >=
          CREATIVE_PROMOTION_THRESHOLDS.visualScore &&
        (candidate.manifest.version >= 2 ||
          candidateResult.distinctivenessScore >=
            CREATIVE_PROMOTION_THRESHOLDS.distinctivenessScore);
      results.push(candidateResult);
    }
  } finally {
    if (rendererRuntime)
      await fs.rm(rendererRuntime.root, { recursive: true, force: true });
    await fs.writeFile(originalConfigPath, originalConfig);
    await fs.rm(selectedDir, { recursive: true, force: true });
    const backupEntries = await fs.readdir(selectedBackup).catch(() => []);
    await fs.mkdir(selectedDir, { recursive: true });
    await Promise.all(
      backupEntries.map((entry) =>
        fs.cp(path.join(selectedBackup, entry), path.join(selectedDir, entry), {
          recursive: true,
          force: true,
        }),
      ),
    );
    await fs.rm(selectedBackup, { recursive: true, force: true });
  }

  // Review previews must show authored work. Diversity remains a production
  // promotion requirement, not a reason to silently select the legacy page.
  const previewEligible = results.filter(
    (candidate) =>
      candidate.valid &&
      candidate.referenceFidelity?.pass !== false &&
      (candidate.manifest.version < 2 ||
        candidate.referenceFidelity?.score >=
          CREATIVE_PROMOTION_THRESHOLDS.referenceFidelityScore) &&
      candidate.visualScore >= CREATIVE_PROMOTION_THRESHOLDS.visualScore &&
      candidate.technicalScore >= 100,
  );
  const versionTwoCandidates = results.filter(
    (candidate) => candidate.manifest?.version >= 2,
  );
  const pixelCandidates = versionTwoCandidates.filter((candidate) =>
    ["desktop", "compact", "mobile"].every((name) =>
      candidate.viewports.some((viewport) => viewport.name === name),
    ),
  );
  let visualDiversity;
  if (pixelCandidates.length >= 2) {
    const judged = await renderedDiversityEvaluator({
      candidates: pixelCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        desktop: path.join(evidenceDir, `${candidate.candidateId}-desktop.png`),
        mobile: path.join(evidenceDir, `${candidate.candidateId}-mobile.png`),
      })),
    });
    visualDiversity = {
      version: judged.version,
      model: judged.model,
      minimumDistance: judged.minimumPairDistance,
      score: judged.score,
      pairs: judged.audit?.pairs || [],
      genericFallbackDetected: Boolean(judged.audit?.genericFallbackDetected),
      summary: judged.audit?.summary || "",
      pass: judged.pass,
    };
  } else if (versionTwoCandidates.length) {
    visualDiversity = {
      minimumDistance: 0,
      pairs: [],
      pass: false,
      source: "incomplete-rendered-evidence",
    };
  } else {
    const visualPairs = [];
    for (let i = 0; i < results.length; i += 1) {
      for (let j = i + 1; j < results.length; j += 1) {
        const distance =
          results[i].visualFingerprint &&
          results[i].visualFingerprint !== results[j].visualFingerprint
            ? 100
            : 0;
        visualPairs.push({
          left: results[i].candidateId,
          right: results[j].candidateId,
          distance,
          pass:
            distance >=
            CREATIVE_PROMOTION_THRESHOLDS.minimumPairwiseVisualDistance,
        });
      }
    }
    visualDiversity = {
      minimumDistance: visualPairs.length
        ? Math.min(...visualPairs.map((pair) => pair.distance))
        : 100,
      pairs: visualPairs,
      pass: visualPairs.every((pair) => pair.pass),
      source: "legacy-structural-fallback",
    };
  }
  const hasVersionTwoCandidates = versionTwoCandidates.length > 0;
  const measuredDiversityPass = hasVersionTwoCandidates
    ? visualDiversity.pass
    : diversity.pass && visualDiversity.pass;
  const diversityPass = !requireDiversity || measuredDiversityPass;
  const valid =
    preview && !promote
      ? previewEligible
      : diversityPass
        ? results.filter((candidate) => candidate.eligible)
        : [];
  const winner =
    valid.sort(
      (left, right) =>
        right.score - left.score ||
        left.candidateId.localeCompare(right.candidateId),
    )[0] || null;
  const selectionPass = Boolean(
    winner && (preview && !promote ? true : diversityPass),
  );

  const report = {
    version: 1,
    mode: promote ? "promote" : preview ? "preview" : "review",
    thresholds: CREATIVE_PROMOTION_THRESHOLDS,
    scoreSource:
      "rendered-structure-and-contract; multimodal visual gate remains required",
    diversity,
    visualDiversity,
    diversityRequired: requireDiversity,
    excludedCandidateIds: [...excludedIds].sort(),
    candidates: results,
    selectedCandidateId: selectionPass ? winner.candidateId : null,
    // Preview selection depends on candidate quality, while diversity remains
    // visible in the report and mandatory for production promotion.
    fallback: !selectionPass,
    promotionReady: Boolean(winner && measuredDiversityPass && winner.eligible),
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  const shouldPublishSelection =
    (promote && report.promotionReady) ||
    (preview && !promote && selectionPass);
  if (shouldPublishSelection && !deferPromotion) {
    await promoteCreativeCandidate({
      siteDir: root,
      candidateDir: path.relative(
        root,
        path.join(candidateRoot, winner.directory),
      ),
      visualScore: winner.visualScore,
      distinctivenessScore: winner.distinctivenessScore,
      selectionMode: promote ? "creative-bakeoff" : "creative-preview",
      preview,
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv);
  const report = await runCreativeBakeoff({
    siteDir: args["site-dir"] || "templates/client-site",
    candidatesDir: args.candidates || ".launchloom/generated-experiences",
    reportPath: args.report,
    screenshotsDir: args.screenshots,
    promote: args.promote === "true",
    preview: args.preview === "true",
  });
  console.log(
    JSON.stringify({
      selectedCandidateId: report.selectedCandidateId,
      fallback: report.fallback,
      diversityPass: report.diversity.pass,
      report: args.report || ".launchloom/creative-bakeoff.json",
    }),
  );
}
