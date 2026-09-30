import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCreativeBakeoff } from "./run-creative-bakeoff.mjs";
import {
  applyCreativeRepairEdits,
  requestRepair,
} from "./creative-repair-loop.mjs";
import {
  assertCreativeRevisionScope,
  createCreativeRepairScopeDeclaration,
  resolveCreativeRevisionScope,
} from "./creative-revision-scope.mjs";

export {
  assertCreativeRevisionScope,
  createCreativeRepairScopeDeclaration,
  resolveCreativeRevisionScope,
};
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import {
  restoreImageAltsFromOriginal,
  restoreRequiredExperienceMarkers,
  restoreRequiredSectionIdsOnSemanticSections,
  validateProductionCandidateFiles,
} from "./production-experience-author.mjs";
import { runHumanRevisionGate } from "./human-revision-gate.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";
import { RENDERED_REFERENCE_THRESHOLDS } from "./rendered-reference-fidelity.mjs";

const VIEWPORTS = ["desktop", "compact", "mobile"];

function cliArgs(argv) {
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

function boundedCycles(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(0, Math.min(2, Math.trunc(parsed)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function dimensionFindings(candidate) {
  const audit = candidate?.renderedReferenceFidelity?.audit;
  if (!audit) return [];
  const findings = [];
  const overall = Number(audit.overallScore);
  if (
    Number.isFinite(overall) &&
    overall < RENDERED_REFERENCE_THRESHOLDS.overall
  )
    findings.push(
      `rendered-reference overall fidelity scored ${overall} and must reach ${RENDERED_REFERENCE_THRESHOLDS.overall}.`,
    );
  for (const [key, value] of Object.entries(audit.scores || {})) {
    const minimum = Number(RENDERED_REFERENCE_THRESHOLDS[key]);
    const score = Number(value);
    if (Number.isFinite(minimum) && Number.isFinite(score) && score < minimum)
      findings.push(
        `rendered-reference dimension ${key} scored ${score} and must reach ${minimum}.`,
      );
  }
  return findings;
}

function candidateFindings(candidate) {
  return unique([
    ...(candidate?.failures || []),
    ...(candidate?.renderedReferenceFidelity?.audit?.findings || []).map(
      (item) =>
        `${item.severity || "major"} ${item.category || "reference"} ${item.viewport || "all"}: ${item.evidence || item.repair || "Rendered reference mismatch."}`,
    ),
    ...(candidate?.referenceFidelity?.renderedVisualFindings || []).map(
      (item) => item.message || item.code || "Reference contract mismatch.",
    ),
    ...dimensionFindings(candidate),
  ]);
}

function candidateDiversityFinding(
  report,
  candidateId,
  diversity = report?.visualDiversity,
) {
  if (!diversity) return "";
  const pairs = (diversity.pairs || []).filter(
    (pair) =>
      (pair.left === candidateId || pair.right === candidateId) &&
      (diversity.pass !== false || pair.pass === false),
  );
  if (!pairs.length && diversity.pass !== false) return "";
  if (!pairs.length)
    return `Rendered candidate diversity failed: ${diversity.summary || "the candidates share too much visual grammar"}. Preserve this candidate's assigned reference and make its composition distinct from its siblings.`;
  return pairs
    .map((pair) => {
      const sibling = pair.left === candidateId ? pair.right : pair.left;
      const reason =
        pair.reason || diversity.summary || "the candidate set has converged";
      return diversity.pass === false
        ? `Rendered diversity failed at ${pair.distance ?? "unknown"}/100 against sibling ${sibling}. Make this candidate's reference-led composition more distinct; do not converge toward the sibling. Evidence: ${reason}`
        : `Rendered diversity currently passes at ${pair.distance ?? "unknown"}/100 against sibling ${sibling}. Preserve or increase this candidate's distinct design grammar; do not converge toward the sibling. Evidence: ${reason}`;
    })
    .join("\n");
}

function previewDiversityEvidence(report) {
  const preview = report?.previewDiversity;
  const visual = report?.visualDiversity;
  if (!preview) return visual;
  return {
    ...(visual || {}),
    ...preview,
    pass: preview.pass,
    summary: preview.summary || visual?.summary || "",
    pairs: visual?.pairs?.length ? visual.pairs : preview.pairs || [],
  };
}

function gateFindings(report) {
  return (report?.audit?.findings || []).map((item) => ({
    category: item.category,
    severity: item.severity,
    viewport: item.viewport,
    evidence: item.evidence,
    recommendation: item.recommendation,
  }));
}

function gatePass(report) {
  const major = (report?.audit?.findings || []).filter((item) =>
    ["critical", "major"].includes(item.severity),
  );
  return Boolean(
    report &&
    report.status !== "error" &&
    report.audit?.verdict === "pass" &&
    !(report.blockers || []).length &&
    !major.length,
  );
}

function candidateNeedsRepair(candidate) {
  return Boolean(
    candidate &&
    (!candidate.valid ||
      candidate.referenceFidelity?.pass === false ||
      candidate.renderedReferenceFidelity?.pass === false ||
      !candidate.eligible),
  );
}

function diversityRepairTargets(report, diversity = report?.visualDiversity) {
  if (diversity?.pass !== false) return [];
  const findingsByCandidate = new Map();
  const add = (candidateId, finding) => {
    if (!candidateId) return;
    const findings = findingsByCandidate.get(candidateId) || [];
    if (!findings.includes(finding)) findings.push(finding);
    findingsByCandidate.set(candidateId, findings);
  };
  for (const pair of diversity.pairs || []) {
    if (pair.pass === false) {
      add(
        pair.left,
        `Rendered diversity failed against ${pair.right}: ${pair.reason || "candidate visual grammars are too similar"}. Preserve this route's own Reference DNA and make its rendered mechanics more route-specific.`,
      );
      add(
        pair.right,
        `Rendered diversity failed against ${pair.left}: ${pair.reason || "candidate visual grammars are too similar"}. Preserve this route's own Reference DNA and make its rendered mechanics more route-specific.`,
      );
    }
  }
  if (!findingsByCandidate.size) {
    for (const candidate of report.candidates || [])
      add(
        candidate.candidateId,
        diversity.summary ||
          "Rendered candidates are not visually distinct enough for production promotion. Preserve this candidate's assigned reference mechanics and move away from generic shared grammar.",
      );
  }
  return [...findingsByCandidate].map(([candidateId, findings]) => ({
    candidateId,
    finding: findings.join("\n"),
  }));
}

function repairPriority(report, candidateId) {
  const candidate = reportCandidate(report, candidateId);
  const scores = [
    candidate?.renderedReferenceFidelity?.score,
    candidate?.referenceFidelity?.score,
    candidate?.visualScore,
  ].filter((score) => typeof score === "number" && Number.isFinite(score));
  return scores.length ? Math.min(...scores) : Number.NEGATIVE_INFINITY;
}

// The per-candidate repair budget is scarce, so the loop repairs the
// candidate closest to passing the measured gates first. Repairing the
// weakest candidate first historically spent every cycle on candidates that
// could not close a twenty-point gap and left the leader unrepaired.
function closestToPassingFirst(report, targets) {
  return [...targets].sort((left, right) => {
    const scoreDelta =
      repairPriority(report, right.candidateId) -
      repairPriority(report, left.candidateId);
    return scoreDelta || left.candidateId.localeCompare(right.candidateId);
  });
}

function closestFailedSibling(report, candidateId) {
  const failedComparisons = [report?.visualDiversity, report?.previewDiversity]
    .filter((diversity) => diversity?.pass === false)
    .flatMap((diversity) => diversity.pairs || [])
    .filter(
      (pair) =>
        pair?.pass === false &&
        (pair.left === candidateId || pair.right === candidateId),
    )
    .map((pair) => ({
      candidateId: pair.left === candidateId ? pair.right : pair.left,
      distance:
        typeof pair.distance === "number" && Number.isFinite(pair.distance)
          ? pair.distance
          : Number.POSITIVE_INFINITY,
    }))
    .filter((pair) => typeof pair.candidateId === "string" && pair.candidateId);

  return failedComparisons.sort(
    (left, right) =>
      left.distance - right.distance ||
      left.candidateId.localeCompare(right.candidateId),
  )[0]?.candidateId;
}

async function comparisonScreenshotsFor(report, candidateId, screenshotsDir) {
  const siblingCandidateId = closestFailedSibling(report, candidateId);
  if (!siblingCandidateId) return [];
  const captures = ["desktop", "mobile"].map((viewport) => ({
    candidateId: siblingCandidateId,
    viewport,
    path: path.join(
      screenshotsDir,
      `${siblingCandidateId}-${viewport}-viewport.png`,
    ),
  }));
  const available = new Set(
    await collectAvailableScreenshots(captures.map((capture) => capture.path)),
  );
  return captures.filter((capture) => available.has(capture.path));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function creativeFeedbackItems(config, requestText) {
  const revision = config.revisionReport || {};
  const results = Array.isArray(revision.results) ? revision.results : [];
  const scopedItems = Array.isArray(revision.creativeRepairScope?.feedbackItems)
    ? revision.creativeRepairScope.feedbackItems
    : [];
  const creativeResults = results.filter(
    (result) => result?.status === "creative",
  );
  const sourceItems = scopedItems.length
    ? scopedItems
    : creativeResults.length
      ? creativeResults
      : [{ feedbackIndex: 0, feedback: requestText }];
  const feedbackItems = [];
  const seen = new Set();
  for (const item of sourceItems) {
    const feedbackIndex = item?.feedbackIndex;
    const feedback = String(item?.feedback || "").trim();
    if (!Number.isSafeInteger(feedbackIndex) || feedbackIndex < 0 || !feedback)
      throw new Error(
        "Creative human verification requires an exact feedback index and request text for every item.",
      );
    if (seen.has(feedbackIndex))
      throw new Error(
        `Creative human verification received duplicate feedback index ${feedbackIndex}.`,
      );
    seen.add(feedbackIndex);
    feedbackItems.push({ feedbackIndex, feedback });
  }
  for (const result of creativeResults) {
    const item = feedbackItems.find(
      (candidate) => candidate.feedbackIndex === result.feedbackIndex,
    );
    if (!item || String(result.feedback || "").trim() !== item.feedback)
      throw new Error(
        `Creative human verification is missing or mismatches revision feedback item ${result.feedbackIndex + 1}.`,
      );
  }
  return feedbackItems.sort(
    (left, right) => left.feedbackIndex - right.feedbackIndex,
  );
}

function verifiedHumanFeedbackResults(audit, expectedItems, candidateId) {
  if (!Array.isArray(audit?.feedbackResults))
    throw new Error(
      "Human revision gate returned an aggregate pass without per-feedbackIndex evidence.",
    );
  const expectedByIndex = new Map(
    expectedItems.map((item) => [item.feedbackIndex, item]),
  );
  const seen = new Set();
  const verified = [];
  for (const result of audit.feedbackResults) {
    const index = result?.feedbackIndex;
    const expected = expectedByIndex.get(index);
    if (
      !Number.isSafeInteger(index) ||
      !expected ||
      seen.has(index) ||
      result?.verdict !== "pass" ||
      String(result?.feedback || "").trim() !== expected.feedback ||
      typeof result?.evidence !== "string" ||
      !result.evidence.trim() ||
      result?.candidateId !== candidateId ||
      !Array.isArray(result.findings) ||
      result.findings.some((finding) =>
        ["critical", "major"].includes(finding?.severity),
      )
    )
      throw new Error(
        `Human revision gate passed without valid candidate-bound evidence for feedback index ${Number.isSafeInteger(index) ? index : "unknown"}.`,
      );
    seen.add(index);
    verified.push({
      feedbackIndex: index,
      feedback: expected.feedback,
      verdict: "pass",
      evidence: result.evidence.trim(),
      candidateId,
    });
  }
  if (seen.size !== expectedByIndex.size)
    throw new Error(
      "Human revision gate aggregate pass omitted evidence for one or more creative feedback indexes.",
    );
  return verified.sort(
    (left, right) => left.feedbackIndex - right.feedbackIndex,
  );
}

async function readCandidate(candidateDir) {
  const [metadata, contentManifest, experience, styles, motion, servicePage] =
    await Promise.all([
      readJson(path.join(candidateDir, "metadata.json")),
      readJson(path.join(candidateDir, "content-manifest.json")),
      fs.readFile(path.join(candidateDir, "Experience.jsx"), "utf8"),
      fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
      fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
      fs.readFile(path.join(candidateDir, "ServicePage.jsx"), "utf8").catch(() => ""),
    ]);
  return {
    metadata,
    contentManifest,
    content: contentManifest.values || {},
    files: {
      experience,
      styles,
      motion,
      ...(servicePage.trim() ? { servicePage } : {}),
    },
  };
}

function normalizeRepair(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Creative repair returned an invalid file bundle.");
  const normalized = {};
  for (const key of ["experience", "styles", "motion"]) {
    if (typeof value[key] !== "string" || !value[key].trim())
      throw new Error(`Creative repair returned no ${key} source.`);
    normalized[key] = value[key].replace(/[—–]/gu, "-").trim();
  }
  return normalized;
}

/**
 * @typedef {{mkdir: (path: string, options?: any) => Promise<any>, writeFile: (file: string, data: string) => Promise<any>, rm: (path: string, options?: any) => Promise<any>, rename: (source: string, destination: string) => Promise<any>}} RepairFs
 */

/**
 * @param {string} candidateDir
 * @param {{experience?: string, styles?: string, motion?: string, servicePage?: string}} files
 * @param {{fsImpl?: RepairFs}} [options]
 * @returns {Promise<void>}
 */
export async function writeCandidate(
  candidateDir,
  files,
  { fsImpl = fs } = {},
) {
  const transactionId = `${process.pid}-${Date.now()}`;
  const staging = path.join(
    candidateDir,
    `.rendered-repair-stage-${transactionId}`,
  );
  const backup = path.join(
    candidateDir,
    `.rendered-repair-backup-${transactionId}`,
  );
  const map = {
    "Experience.jsx": files.experience,
    "styles.css": files.styles,
    "motion.js": files.motion,
  };
  if (typeof files.servicePage === "string" && files.servicePage.trim())
    map["ServicePage.jsx"] = files.servicePage;
  const transactionFiles = Object.keys(map);
  const backedUp = [];
  const installed = [];
  let preserveBackup = false;
  await fsImpl.mkdir(staging, { recursive: true });
  await fsImpl.mkdir(backup, { recursive: true });
  try {
    for (const [name, content] of Object.entries(map))
      await fsImpl.writeFile(path.join(staging, name), `${content.trim()}\n`);

    for (const name of transactionFiles) {
      await fsImpl.rename(
        path.join(candidateDir, name),
        path.join(backup, name),
      );
      backedUp.push(name);
    }

    for (const name of transactionFiles) {
      await fsImpl.rename(
        path.join(staging, name),
        path.join(candidateDir, name),
      );
      installed.push(name);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const name of [...installed].reverse()) {
      try {
        await fsImpl.rm(path.join(candidateDir, name), {
          recursive: true,
          force: true,
        });
      } catch (rollbackError) {
        rollbackErrors.push(
          `${name} cleanup failed: ${rollbackError?.message || rollbackError}`,
        );
      }
    }
    for (const name of [...backedUp].reverse()) {
      const original = path.join(backup, name);
      const destination = path.join(candidateDir, name);
      try {
        await fsImpl.rm(destination, {
          recursive: true,
          force: true,
        });
        await fsImpl.rename(original, destination);
      } catch (rollbackError) {
        rollbackErrors.push(
          `${name} restore failed: ${rollbackError?.message || rollbackError}`,
        );
      }
    }
    if (rollbackErrors.length) {
      preserveBackup = true;
      const originalMessage = error?.message || String(error);
      const recovery = new Error(
        `${originalMessage} Rollback incomplete; recovery backup preserved at ${backup}. ${rollbackErrors.join(" | ")}`,
        { cause: error instanceof Error ? error : undefined },
      );
      recovery.recoveryBackup = backup;
      throw recovery;
    }
    throw error;
  } finally {
    await fsImpl.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (!preserveBackup)
      await fsImpl.rm(backup, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {string[]} screenshots
 * @param {{fsImpl?: Pick<typeof fs, "access">}} [options]
 * @returns {Promise<string[]>}
 */
export async function collectAvailableScreenshots(
  screenshots,
  { fsImpl = fs } = {},
) {
  const available = [];
  for (const file of screenshots) {
    try {
      await fsImpl.access(file);
      available.push(file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return available;
}

async function copySelectedScreenshots({
  screenshotsDir,
  candidateId,
  targetDir,
}) {
  await fs.mkdir(targetDir, { recursive: true });
  for (const viewport of VIEWPORTS) {
    const source = path.join(screenshotsDir, `${candidateId}-${viewport}.png`);
    const target = path.join(targetDir, `${viewport}.png`);
    await fs.copyFile(source, target);
  }
}

function spawnCapture(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * @param {{siteDir: string, screenshotsDir: string, reportPath: string, configPath?: string, visualGateScript?: string}} options
 * @returns {Promise<Record<string, any> & {processExitCode: number}>}
 */
export async function runVisualGateProcess({
  siteDir,
  screenshotsDir,
  reportPath,
  configPath = path.join(siteDir, "src/site.config.json"),
  visualGateScript = path.resolve("scripts/visual-quality-gate.mjs"),
} = {}) {
  await fs.rm(reportPath, { force: true });
  const result = await spawnCapture(
    process.execPath,
    [
      visualGateScript,
      "--mode",
      "verify",
      "--config",
      configPath,
      "--screenshots",
      screenshotsDir,
      "--report",
      reportPath,
    ],
    { cwd: siteDir },
  );
  const report = await readJson(reportPath).catch(() => null);
  if (!report)
    throw new Error(
      `Creative visual gate produced no report (exit ${result.code}): ${result.stderr.slice(-1200)}`,
    );
  if (result.code !== 0 || report.status === "error")
    throw new Error(
      `Creative visual gate could not run: ${report.error || result.stderr.slice(-1200) || `process exited ${result.code}`}`,
    );
  return { ...report, processExitCode: result.code };
}

async function validateCandidateReasoningBindings(
  candidateRoot,
  creativeSession,
) {
  const entries = await fs.readdir(candidateRoot, { withFileTypes: true });
  const directoryEntries = entries.filter((item) => item.isDirectory());
  const candidateCount = directoryEntries.filter((item) =>
    /^candidate-[a-z0-9]+$/u.test(item.name),
  ).length;
  for (const entry of directoryEntries) {
    const metadataPath = path.join(candidateRoot, entry.name, "metadata.json");
    const metadata = await readJson(metadataPath).catch(() => null);
    const reasoning = metadata?.reasoning || null;
    if (!reasoning) {
      if (creativeSession)
        throw new Error(
          `Adaptive creative session ${creativeSession.sessionId} cannot be applied to candidate ${metadata?.candidateId || entry.name} because its authored reasoning binding is missing.`,
        );
      continue;
    }
    if (!reasoning.sessionId)
      throw new Error(
        `Candidate ${metadata?.candidateId || entry.name} has incomplete adaptive reasoning metadata and cannot be repaired or promoted.`,
      );
    if (!creativeSession)
      throw new Error(
        `Candidate ${metadata?.candidateId || entry.name} was authored with adaptive reasoning session ${reasoning.sessionId}, but no reasoning-preflight session was supplied.`,
      );

    const mismatches = [
      ["sessionId", reasoning.sessionId, creativeSession.sessionId],
      ["effort", reasoning.effort, creativeSession.reasoningEffort],
      [
        "policyVersion",
        reasoning.policyVersion,
        creativeSession.reasoningPolicyVersion,
      ],
      [
        "selectorModelVersion",
        reasoning.selectorModelVersion,
        creativeSession.selectorModelVersion,
      ],
    ].filter(([, actual, expected]) => actual !== expected);
    if (mismatches.length)
      throw new Error(
        `Candidate ${metadata?.candidateId || entry.name} reasoning binding does not match the frozen creative session: ${mismatches.map(([field, actual, expected]) => `${field}=${actual ?? "(missing)"} expected ${expected ?? "(missing)"}`).join(" | ")}`,
      );
  }
  return candidateCount;
}

/**
 * Validate and atomically persist one authored candidate repair.
 * @param {{candidateDir: string, findings: any[], screenshots: string[], comparisonScreenshots?: Array<{candidateId: string, viewport: string, path: string}>, model: string, creativeSession?: Record<string, any> | null}} options
 * @returns {Promise<{experience: string, styles: string, motion: string}>}
 */
export async function defaultRepairCandidate({
  candidateDir,
  findings,
  screenshots,
  comparisonScreenshots = [],
  model,
  creativeSession = null,
} = {}) {
  const { metadata, contentManifest, content, files } =
    await readCandidate(candidateDir);
  const referenceDna =
    metadata.creativeManifest?.referenceDna || metadata.referenceDna;
  if (!referenceDna)
    throw new Error(
      `${metadata.candidateId || candidateDir} has no Reference DNA.`,
    );
  const humanReview = (findings || []).some(
    (finding) =>
      finding &&
      typeof finding === "object" &&
      finding.category === "human-review-feedback",
  );
  const creativeRepairScope = humanReview ? metadata.creativeRepairScope : null;
  if (humanReview && !creativeRepairScope)
    throw repairOutputRejected(
      new Error("Human repair candidate omitted its resolved section scope."),
    );
  const repairResponse = await requestRepair({
    model,
    referenceDna,
    referenceDossier:
      metadata.creativeManifest?.referenceDossier || metadata.referenceDossier,
    findings,
    files,
    screenshots,
    comparisonScreenshots,
    contentManifest,
    creativeSession,
    creativeRepairScope,
  });
  let validated;
  try {
    const modelRepaired = humanReview
      ? applyCreativeRepairEdits(files, repairResponse?.edits)
      : normalizeRepair(repairResponse);
    if (humanReview)
      assertCreativeRevisionScope(files, modelRepaired, creativeRepairScope);
    const repaired = {
      ...modelRepaired,
      experience: restoreImageAltsFromOriginal(
        restoreRequiredExperienceMarkers(
          restoreRequiredSectionIdsOnSemanticSections(
            modelRepaired.experience,
            {
              id: metadata.routeId || metadata.candidateId || "rendered-repair",
            },
          ),
          files.experience,
          { id: metadata.routeId || metadata.candidateId || "rendered-repair" },
        ),
        files.experience,
        content,
      ),
    };
    validated = validateProductionCandidateFiles({
      files: repaired,
      route: {
        id: metadata.routeId || metadata.candidateId || "rendered-repair",
        referenceDna,
      },
      content,
      visualBrief: contentManifest.visualBrief || {},
    });
    if (humanReview)
      assertCreativeRevisionScope(files, validated.files, creativeRepairScope);
  } catch (error) {
    throw repairOutputRejected(error);
  }
  await writeCandidate(candidateDir, validated.files);
  return validated.files;
}

function reportCandidate(report, candidateId) {
  return (report?.candidates || []).find(
    (candidate) => candidate.candidateId === candidateId,
  );
}

function resolveCandidateDirectory(candidateRoot, directory) {
  if (typeof directory !== "string" || !directory.trim())
    throw new Error("Creative repair report omitted a candidate directory.");
  if (path.isAbsolute(directory))
    throw new Error(
      `Creative repair candidate directory must be relative: ${directory}`,
    );
  const root = path.resolve(candidateRoot);
  const resolved = path.resolve(root, directory);
  const relative = path.relative(root, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Creative repair candidate directory escapes the candidates root: ${directory}`,
    );
  }
  return resolved;
}

async function writeVisualGateConfig({
  siteDir,
  roundDir,
  selected,
  selectionMode,
}) {
  const configPath = path.join(siteDir, "src/site.config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const manifest = selected.manifest || {};
  config.design ||= {};
  config.design.experience = {
    ...(config.design.experience || {}),
    renderer: "creative-candidate",
    candidateId: selected.candidateId,
    familyId: selected.familyId || manifest.familyId,
    referenceFamilyId:
      manifest.referenceDna?.familyId || selected.familyId || manifest.familyId,
    referenceDnaVersion: manifest.referenceDna?.version || null,
    contractHash: manifest.routeFingerprint,
    fingerprint: manifest.fingerprint,
    selectionMode,
  };
  const stagedPath = path.join(roundDir, "visual-gate-site.config.json");
  await fs.writeFile(stagedPath, `${JSON.stringify(config, null, 2)}\n`);
  return stagedPath;
}

async function persistRepairEvidence({
  outDir,
  round,
  candidateId,
  reason,
  findings,
  cyclesUsed,
  status = "repaired",
  error,
  attempts = [],
}) {
  const directory = path.join(
    outDir,
    `round-${String(round).padStart(2, "0")}`,
    "repairs",
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, `${candidateId}.json`),
    `${JSON.stringify(
      {
        version: 1,
        candidateId,
        reason,
        cycle: cyclesUsed,
        status,
        ...(error ? { error } : {}),
        ...(attempts.length ? { attempts } : {}),
        findings,
      },
      null,
      2,
    )}\n`,
  );
}

function repairOutputRejected(error) {
  const rejected = new Error(
    `Creative repair output rejected by source validation: ${error?.message || String(error)}`,
    { cause: error instanceof Error ? error : undefined },
  );
  rejected.code = "CREATIVE_REPAIR_OUTPUT_REJECTED";
  return rejected;
}

function safeRepairRejectionMessage(error) {
  return String(
    error?.message || error || "Creative repair output was rejected.",
  )
    .replace(/\s+/gu, " ")
    .slice(0, 800);
}

/**
 * Render -> judge -> repair -> rerender orchestration for authored candidates.
 * Pixel-level reference fidelity and rendered diversity remain owned by
 * runCreativeBakeoff. The final visual QA gate is also screenshot-driven.
 * No production promotion occurs until both report.promotionReady and the
 * selected candidate's final visual gate pass.
 *
 * @param {{
 *   siteDir?: string,
 *   candidatesDir?: string,
 *   outDir?: string,
 *   mode?: string,
 *   model?: string,
 *   creativeSession?: Record<string, any> | null,
 *   maxCycles?: number,
 *   requireDiversity?: boolean,
 *   requestedFindings?: unknown[],
 *   visualGateScript?: string,
 *   runBakeoffImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
 *   runVisualGateImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
 *   runHumanGateImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
 *   repairCandidateImpl?: (options: Record<string, unknown>) => Promise<Record<string, string> | void> | Record<string, string> | void,
 *   promoteImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
 * }} options
 */
export async function runRenderedCreativeRepair({
  siteDir = "templates/client-site",
  candidatesDir = ".launchloom/generated-experiences",
  outDir = ".launchloom/creative-repair",
  mode = "preview",
  model,
  creativeSession = null,
  maxCycles = 2,
  requireDiversity = true,
  requestedFindings = [],
  visualGateScript,
  runBakeoffImpl = runCreativeBakeoff,
  runVisualGateImpl = runVisualGateProcess,
  runHumanGateImpl = runHumanRevisionGate,
  repairCandidateImpl = defaultRepairCandidate,
  promoteImpl = promoteCreativeCandidate,
} = {}) {
  const resolvedModel =
    model ||
    creativeSession?.creativeModel ||
    process.env.CREATIVE_EXPERIENCE_MODEL ||
    "openai/gpt-6-luna";
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const evidenceRoot = path.resolve(root, outDir);
  const cycleLimit = boundedCycles(maxCycles);
  const cycleUse = new Map();
  const history = [];
  const requestedMode = mode === "promote" ? "promote" : "preview";
  const frozenCreativeSession = creativeSession
    ? validateCreativeSessionConfig(creativeSession, {
        creativeModel: resolvedModel,
      })
    : null;
  const candidateCount = await validateCandidateReasoningBindings(
    candidateRoot,
    frozenCreativeSession,
  );
  const maxRounds = Math.max(1, candidateCount * (cycleLimit + 1) + 1);
  const humanFindings = Array.isArray(requestedFindings)
    ? requestedFindings.filter(Boolean)
    : [];
  const humanFeedback = humanFindings
    .map((finding) =>
      typeof finding === "string"
        ? finding
        : finding?.message || finding?.evidence || "",
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (humanFindings.length > 0 && !humanFeedback)
    throw new Error("Human feedback must contain non-empty request text.");
  let humanRepairPending = humanFindings.length > 0;
  let verifiedHumanFeedback = null;
  const excludedCandidateIds = new Set();
  /** @type {Record<string, string>} */
  const rejectedCandidates = {};
  await fs.rm(evidenceRoot, { recursive: true, force: true });
  await fs.mkdir(evidenceRoot, { recursive: true });

  async function repair(
    candidateId,
    findings,
    reason,
    round,
    screenshotsDir,
    candidateDirectory,
    report,
  ) {
    const used = cycleUse.get(candidateId) || 0;
    if (used >= cycleLimit) return { status: "exhausted" };
    const candidateDir = resolveCandidateDirectory(
      candidateRoot,
      candidateDirectory,
    );
    // Show Luna the real browser-scale desktop/mobile compositions first, then
    // the full page for section rhythm. Older evidence sets fall back to the
    // original full-page captures.
    const viewportScreenshots = ["desktop", "mobile"].map((viewport) =>
      path.join(screenshotsDir, `${candidateId}-${viewport}-viewport.png`),
    );
    const fullPageScreenshots = VIEWPORTS.map((viewport) =>
      path.join(screenshotsDir, `${candidateId}-${viewport}.png`),
    );
    const currentViewports =
      await collectAvailableScreenshots(viewportScreenshots);
    const comparisonScreenshots = await comparisonScreenshotsFor(
      report,
      candidateId,
      screenshotsDir,
    );
    const screenshots =
      currentViewports.length === viewportScreenshots.length
        ? comparisonScreenshots.length
          ? currentViewports
          : [...currentViewports, fullPageScreenshots[0]]
        : fullPageScreenshots;
    // A build failure can legitimately leave an ENOENT screenshot, but
    // permissions and I/O errors must fail closed instead of weakening evidence.
    const availableScreenshots = await collectAvailableScreenshots(screenshots);
    let attempt = used;
    let activeFindings = findings;
    const attempts = [];
    while (attempt < cycleLimit) {
      attempt += 1;
      try {
        await repairCandidateImpl({
          candidateDir,
          candidateId,
          findings: activeFindings,
          screenshots: availableScreenshots,
          comparisonScreenshots,
          model: resolvedModel,
          creativeSession: frozenCreativeSession,
          cycle: attempt,
          maxCycles: cycleLimit,
        });
        cycleUse.set(candidateId, attempt);
        await persistRepairEvidence({
          outDir: evidenceRoot,
          round,
          candidateId,
          reason,
          findings: activeFindings,
          cyclesUsed: attempt,
          attempts,
        });
        return { status: "repaired", attempts };
      } catch (error) {
        const mayRetryRepairOutputRejection =
          requestedMode === "preview" &&
          !humanFeedback &&
          error?.code === "CREATIVE_REPAIR_OUTPUT_REJECTED";
        if (!mayRetryRepairOutputRejection) throw error;

        const message = safeRepairRejectionMessage(error);
        const status = attempt < cycleLimit ? "retrying" : "rejected";
        attempts.push({ cycle: attempt, status, error: message });
        cycleUse.set(candidateId, attempt);
        if (attempt >= cycleLimit) {
          excludedCandidateIds.add(candidateId);
          rejectedCandidates[candidateId] = message;
          await persistRepairEvidence({
            outDir: evidenceRoot,
            round,
            candidateId,
            reason,
            findings: activeFindings,
            cyclesUsed: attempt,
            status: "rejected",
            error: message,
            attempts,
          });
          return { status: "rejected", error: message, attempts };
        }

        activeFindings = [
          ...activeFindings,
          {
            category: "repair-output-rejected",
            severity: "major",
            message:
              "The previous repair output did not satisfy the bounded repair contract or deterministic source validation.",
            evidence: message,
            recommendation:
              "Return a non-empty, bounded repair that fixes the reported output or source-validation issue. Preserve sealed content bindings, the contact-bound early-conversion anchor, required Reference DNA markers, and verified content. Do not remove required semantics or weaken safety checks to make validation pass.",
          },
        ];
      }
    }
    return { status: "exhausted" };
  }

  for (let round = 0; round < maxRounds; round += 1) {
    const roundDir = path.join(
      evidenceRoot,
      `round-${String(round).padStart(2, "0")}`,
    );
    const screenshotsDir = path.join(roundDir, "screenshots");
    const reportPath = path.join(roundDir, "creative-bakeoff.json");
    await fs.mkdir(roundDir, { recursive: true });
    let report;
    try {
      report = await runBakeoffImpl({
        siteDir: root,
        candidatesDir: candidateRoot,
        reportPath,
        screenshotsDir,
        preview: true,
        promote: false,
        deferPromotion: true,
        requireDiversity,
        excludedCandidateIds: [...excludedCandidateIds].sort(),
      });
    } catch (error) {
      const isExhaustedPreview =
        requestedMode === "preview" &&
        /No creative candidates remain after exclusions:/u.test(
          String(error?.message || error),
        );
      const rejectionDetails = Object.entries(rejectedCandidates)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([candidateId, message]) => `- ${candidateId}: ${message}`)
        .join("\n");
      if (!isExhaustedPreview || !rejectionDetails) throw error;
      throw new Error(
        `${error.message}\nRejected candidate details:\n${rejectionDetails}`,
        { cause: error },
      );
    }
    const record = {
      round,
      selectedCandidateId: report.selectedCandidateId,
      promotionReady: Boolean(report.promotionReady),
      visualDiversityPass: Boolean(report.visualDiversity?.pass),
      previewDiversityPass:
        report.previewDiversity?.pass === undefined
          ? null
          : Boolean(report.previewDiversity.pass),
      previewDiversityStrategy: report.previewDiversity?.strategy || null,
      repairs: [],
      rejectedCandidates: [],
    };
    history.push(record);

    if (humanRepairPending && (report.candidates || []).length !== 1)
      throw new Error(
        "Human creative feedback requires an isolated selected candidate.",
      );

    if (!report.selectedCandidateId) {
      const candidates = (report.candidates || []).filter(candidateNeedsRepair);
      const previewDiversity =
        requestedMode === "preview" ? previewDiversityEvidence(report) : null;
      const previewDiversityTargets =
        previewDiversity?.pass === false
          ? diversityRepairTargets(report, previewDiversity)
          : [];
      const canRepair = (candidateId) =>
        (cycleUse.get(candidateId) || 0) < cycleLimit &&
        !excludedCandidateIds.has(candidateId);
      const repairCandidates = candidates
        .filter((candidate) => canRepair(candidate.candidateId))
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          directory: candidate.directory,
          candidate,
          finding: null,
        }));
      const repairTargets = repairCandidates.length
        ? repairCandidates
        : previewDiversityTargets
            .filter((target) => canRepair(target.candidateId))
            .map((target) => ({
              ...target,
              candidate: reportCandidate(report, target.candidateId),
              directory: reportCandidate(report, target.candidateId)?.directory,
            }))
            .filter((target) => target.candidate);
      const target = closestToPassingFirst(report, repairTargets)[0];
      if (!target)
        throw new Error(
          `No authored creative candidate passed and the ${cycleLimit}-cycle repair budget is exhausted.`,
        );

      const diversity =
        previewDiversity?.pass === false
          ? previewDiversity
          : report.visualDiversity;
      const diversityFinding = candidateDiversityFinding(
        report,
        target.candidateId,
        diversity,
      );
      const findings = target.finding
        ? [target.finding]
        : [
            ...candidateFindings(target.candidate),
            ...(diversityFinding ? [diversityFinding] : []),
            ...(humanRepairPending ? humanFindings : []),
          ];
      const repaired = await repair(
        target.candidateId,
        findings.length
          ? findings
          : ["Candidate did not pass rendered preview gates."],
        target.finding
          ? "rendered-diversity-preview"
          : humanRepairPending
            ? "human-review-feedback"
            : "candidate-render-failure",
        round,
        screenshotsDir,
        target.directory,
        report,
      );
      if (repaired.status === "repaired") {
        record.repairs.push(target.candidateId);
        if (humanRepairPending) humanRepairPending = false;
      } else if (repaired.status === "rejected") {
        record.rejectedCandidates.push(target.candidateId);
      } else {
        throw new Error(
          `No authored creative candidate passed and the ${cycleLimit}-cycle repair budget is exhausted.`,
        );
      }
      continue;
    }

    const selectedId = report.selectedCandidateId;
    const selected = reportCandidate(report, selectedId);
    if (!selected)
      throw new Error(
        `Selected candidate ${selectedId} is missing from the bakeoff report.`,
      );
    const selectedDirectory = resolveCandidateDirectory(
      candidateRoot,
      selected.directory,
    );

    if (humanRepairPending) {
      const repaired = await repair(
        selectedId,
        humanFindings,
        "human-review-feedback",
        round,
        screenshotsDir,
        selected.directory,
        report,
      );
      if (repaired.status !== "repaired")
        throw new Error(
          `Human feedback for ${selectedId} could not be applied within the ${cycleLimit}-cycle repair budget.`,
        );
      humanRepairPending = false;
      record.repairs.push(selectedId);
      record.humanFeedbackApplied = true;
      continue;
    }

    const gateConfigPath = await writeVisualGateConfig({
      siteDir: root,
      roundDir,
      selected,
      selectionMode:
        requestedMode === "promote" ? "creative-bakeoff" : "creative-preview",
    });
    const gateScreenshots = path.join(roundDir, "selected-gate-screenshots");
    await copySelectedScreenshots({
      screenshotsDir,
      candidateId: selectedId,
      targetDir: gateScreenshots,
    });
    const gateReportPath = path.join(roundDir, "visual-gate.json");
    const visualGate = await runVisualGateImpl({
      siteDir: root,
      screenshotsDir: gateScreenshots,
      reportPath: gateReportPath,
      candidateId: selectedId,
      round,
      configPath: gateConfigPath,
      ...(visualGateScript ? { visualGateScript } : {}),
    });
    record.visualGateVerdict = visualGate.audit?.verdict || "error";

    if (!gatePass(visualGate)) {
      const repaired = await repair(
        selectedId,
        [
          ...candidateFindings(reportCandidate(report, selectedId)),
          ...(candidateDiversityFinding(report, selectedId)
            ? [candidateDiversityFinding(report, selectedId)]
            : []),
          ...gateFindings(visualGate),
        ],
        "selected-visual-gate",
        round,
        screenshotsDir,
        selected.directory,
        report,
      );
      if (repaired.status === "rejected") {
        record.rejectedCandidates.push(selectedId);
        continue;
      }
      if (repaired.status !== "repaired")
        throw new Error(
          `Selected candidate ${selectedId} still fails rendered visual QA after ${cycleLimit} repair cycles.`,
        );
      record.repairs.push(selectedId);
      continue;
    }

    if (humanFeedback) {
      const humanGateReportPath = path.join(
        roundDir,
        "human-revision-gate.json",
      );
      const humanGate = await runHumanGateImpl({
        configPath: gateConfigPath,
        screenshotsDir: gateScreenshots,
        feedback: humanFeedback,
        reportPath: humanGateReportPath,
      });
      record.humanRevisionVerdict = humanGate.audit?.verdict || "error";
      if (humanGate.audit?.verdict !== "pass") {
        const repaired = await repair(
          selectedId,
          [
            ...humanFindings,
            ...(candidateDiversityFinding(report, selectedId)
              ? [candidateDiversityFinding(report, selectedId)]
              : []),
            ...(humanGate.audit?.findings || []).map((finding) => ({
              category: finding.category,
              feedbackIndex: finding.feedbackIndex,
              message: finding.evidence,
              evidence: finding.evidence,
              recommendation: finding.recommendation,
            })),
          ],
          "human-revision-gate",
          round,
          screenshotsDir,
          selected.directory,
          report,
        );
        if (repaired.status !== "repaired")
          throw new Error(
            `Selected candidate ${selectedId} still does not satisfy the human review request after ${cycleLimit} repair cycles.`,
          );
        record.repairs.push(selectedId);
        continue;
      }
      const gateConfig = await readJson(gateConfigPath);
      const expectedItems = creativeFeedbackItems(gateConfig, humanFeedback);
      verifiedHumanFeedback = verifiedHumanFeedbackResults(
        humanGate.audit,
        expectedItems,
        selectedId,
      );
    }

    if (requestedMode === "promote" && !report.promotionReady) {
      const targets = diversityRepairTargets(report);
      if (!targets.length) {
        const selectedCandidate = reportCandidate(report, selectedId);
        const findings = candidateFindings(selectedCandidate);
        targets.push({
          candidateId: selectedId,
          finding:
            findings.join("\n") ||
            "Production promotion is not ready. Preserve the assigned Reference DNA and repair the selected candidate's remaining promotion blockers.",
        });
      }
      const target = closestToPassingFirst(
        report,
        targets.filter(
          (item) => (cycleUse.get(item.candidateId) || 0) < cycleLimit,
        ),
      )[0];
      if (!target)
        throw new Error(
          `Production promotion is not ready after the ${cycleLimit}-cycle per-candidate repair budget.`,
        );
      const repaired = await repair(
        target.candidateId,
        [target.finding],
        "rendered-diversity",
        round,
        screenshotsDir,
        reportCandidate(report, target.candidateId)?.directory,
        report,
      );
      if (repaired.status !== "repaired")
        throw new Error(
          `Production promotion is not ready after the ${cycleLimit}-cycle per-candidate repair budget.`,
        );
      record.repairs.push(target.candidateId);
      continue;
    }

    const finalDir = path.join(evidenceRoot, "final");
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.mkdir(finalDir, { recursive: true });
    await fs.copyFile(reportPath, path.join(finalDir, "creative-bakeoff.json"));
    await fs.copyFile(gateReportPath, path.join(finalDir, "visual-gate.json"));
    const finalScreenshots = path.join(finalDir, "screenshots");
    await fs.mkdir(finalScreenshots, { recursive: true });
    for (const viewport of VIEWPORTS)
      await fs.copyFile(
        path.join(screenshotsDir, `${selectedId}-${viewport}.png`),
        path.join(finalScreenshots, `${selectedId}-${viewport}.png`),
      );

    const summary = {
      version: 1,
      status: "promotion-pending",
      mode: requestedMode,
      model: resolvedModel,
      creativeSession: frozenCreativeSession
        ? {
            sessionId: frozenCreativeSession.sessionId,
            reasoningEffort: frozenCreativeSession.reasoningEffort,
            recommendedEffort: frozenCreativeSession.recommendedEffort,
            mode: frozenCreativeSession.mode,
            reasoningPolicyVersion:
              frozenCreativeSession.reasoningPolicyVersion,
            selectorModelVersion: frozenCreativeSession.selectorModelVersion,
          }
        : null,
      selectedCandidateId: selectedId,
      promotionReady: Boolean(report.promotionReady),
      visualGatePass: true,
      humanRevisionPass: humanFeedback
        ? record.humanRevisionVerdict === "pass"
        : true,
      visualDiversityPass: Boolean(report.visualDiversity?.pass),
      previewDiversityPass:
        report.previewDiversity?.pass === undefined
          ? null
          : Boolean(report.previewDiversity.pass),
      previewDiversityStrategy: report.previewDiversity?.strategy || null,
      repairCycles: Object.fromEntries(cycleUse),
      rejectedCandidates,
      history,
      final: {
        bakeoffReport: path.join(finalDir, "creative-bakeoff.json"),
        visualGateReport: path.join(finalDir, "visual-gate.json"),
        screenshotsDir: finalScreenshots,
      },
    };
    await fs.writeFile(
      path.join(evidenceRoot, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );

    try {
      if (requestedMode === "promote") {
        await promoteImpl({
          siteDir: root,
          candidateDir: selectedDirectory,
          visualScore: selected.visualScore,
          distinctivenessScore: selected.distinctivenessScore,
          selectionMode: "creative-bakeoff",
        });
      } else {
        await promoteImpl({
          siteDir: root,
          candidateDir: selectedDirectory,
          visualScore: selected.visualScore,
          distinctivenessScore: selected.distinctivenessScore,
          selectionMode: "creative-preview",
          preserveSelectedManifest: Boolean(humanFeedback),
        });
      }
    } catch (error) {
      const failedSummary = {
        ...summary,
        status: "promotion-failed",
        promotionError: error?.message || String(error),
      };
      await fs.writeFile(
        path.join(evidenceRoot, "summary.json"),
        `${JSON.stringify(failedSummary, null, 2)}\n`,
      );
      throw error;
    }

    if (humanFeedback) {
      const liveConfigPath = path.join(root, "src/site.config.json");
      const liveConfig = JSON.parse(await fs.readFile(liveConfigPath, "utf8"));
      if (liveConfig.revisionReport) {
        liveConfig.revisionReport.creativeSourceRepairVerified = {
          pass: true,
          candidateId: selectedId,
          feedbackResults: verifiedHumanFeedback,
          repairCycles: Object.fromEntries(cycleUse),
        };
        await fs.writeFile(
          liveConfigPath,
          `${JSON.stringify(liveConfig, null, 2)}\n`,
        );
      }
    }

    const passedSummary = { ...summary, status: "passed" };
    await fs.writeFile(
      path.join(evidenceRoot, "summary.json"),
      `${JSON.stringify(passedSummary, null, 2)}\n`,
    );
    return { ...passedSummary, bakeoff: report, visualGate };
  }

  throw new Error(
    `Rendered creative repair exceeded its bounded orchestration rounds (${maxRounds}).`,
  );
}

async function main() {
  const args = cliArgs(process.argv);
  const sessionFile = String(args.session || "").trim();
  const creativeSession = sessionFile
    ? validateCreativeSessionConfig(await readJson(path.resolve(sessionFile)))
    : null;
  const feedbackFile = String(args["feedback-file"] || "").trim();
  const requestedFindings = feedbackFile
    ? [
        {
          category: "human-review-feedback",
          message: await fs.readFile(path.resolve(feedbackFile), "utf8"),
          evidence: "Explicit developer or client review request.",
          recommendation:
            "Refine the authored creative candidate to satisfy this review request while preserving sealed content, Reference DNA, accessibility, and runtime contracts.",
        },
      ]
    : [];
  const result = await runRenderedCreativeRepair({
    siteDir: args["site-dir"] || "templates/client-site",
    candidatesDir: args.candidates || ".launchloom/generated-experiences",
    outDir: args.out || ".launchloom/creative-repair",
    mode: args.mode || "preview",
    model:
      args.model ||
      creativeSession?.creativeModel ||
      process.env.CREATIVE_EXPERIENCE_MODEL ||
      "openai/gpt-6-luna",
    creativeSession,
    maxCycles: args["max-cycles"] || 2,
    requireDiversity: args["require-diversity"] !== "false",
    requestedFindings,
    visualGateScript: args["visual-gate-script"],
  });
  console.log(
    JSON.stringify({
      creativeRepairStatus: result.status,
      selectedCandidateId: result.selectedCandidateId,
      promotionReady: result.promotionReady,
      visualGatePass: result.visualGatePass,
      reasoningEffort: creativeSession?.reasoningEffort || null,
      reasoningMode: creativeSession?.mode || null,
      repairCycles: result.repairCycles,
      rejectedCandidates: result.rejectedCandidates,
      summary: path.resolve(
        args["site-dir"] || "templates/client-site",
        args.out || ".launchloom/creative-repair",
        "summary.json",
      ),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
