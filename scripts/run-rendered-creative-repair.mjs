import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCreativeBakeoff } from "./run-creative-bakeoff.mjs";
import {
  CreativeRepairResponseError,
  requestRepair,
} from "./creative-repair-loop.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import { validateProductionCandidateFiles } from "./production-experience-author.mjs";
import { runHumanRevisionGate } from "./human-revision-gate.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";

const VIEWPORTS = ["desktop", "compact", "mobile"];
const REPAIR_FILES = ["Experience.jsx", "styles.css", "motion.js"];

function cliArgs(argv) {
  return Object.fromEntries(
    argv.slice(2).reduce(
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
  ]);
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

function diversityRepairTargets(report) {
  if (report?.visualDiversity?.pass !== false) return [];
  const findingsByCandidate = new Map();
  const add = (candidateId, finding) => {
    if (!candidateId) return;
    const findings = findingsByCandidate.get(candidateId) || [];
    if (!findings.includes(finding)) findings.push(finding);
    findingsByCandidate.set(candidateId, findings);
  };
  for (const pair of report.visualDiversity.pairs || []) {
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
        report.visualDiversity.summary ||
          "Rendered candidates are not visually distinct enough for production promotion. Preserve this candidate's assigned reference mechanics and move away from generic shared grammar.",
      );
  }
  return [...findingsByCandidate].map(([candidateId, findings]) => ({
    candidateId,
    finding: findings.join("\n"),
  }));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readCandidate(candidateDir) {
  const [metadata, contentManifest, experience, styles, motion] = await Promise.all([
    readJson(path.join(candidateDir, "metadata.json")),
    readJson(path.join(candidateDir, "content-manifest.json")),
    fs.readFile(path.join(candidateDir, "Experience.jsx"), "utf8"),
    fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
    fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
  ]);
  return {
    metadata,
    contentManifest,
    content: contentManifest.values || {},
    files: { experience, styles, motion },
  };
}

function normalizeRepair(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CreativeRepairResponseError(
      "Creative repair returned an invalid file bundle.",
    );
  const normalized = {};
  for (const key of ["experience", "styles", "motion"]) {
    if (typeof value[key] !== "string" || !value[key].trim())
      throw new CreativeRepairResponseError(
        `Creative repair returned no ${key} source.`,
      );
    normalized[key] = value[key].replace(/[—–]/gu, "-").trim();
  }
  return normalized;
}

/**
 * @typedef {{mkdir: (path: string, options?: any) => Promise<any>, writeFile: (file: string, data: string) => Promise<any>, rm: (path: string, options?: any) => Promise<any>, rename: (source: string, destination: string) => Promise<any>}} RepairFs
 */

/**
 * @param {string} candidateDir
 * @param {{experience?: string, styles?: string, motion?: string}} files
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
  const backedUp = [];
  const installed = [];
  let preserveBackup = false;
  await fsImpl.mkdir(staging, { recursive: true });
  await fsImpl.mkdir(backup, { recursive: true });
  try {
    for (const [name, content] of Object.entries(map))
      await fsImpl.writeFile(path.join(staging, name), `${content.trim()}\n`);

    for (const name of REPAIR_FILES) {
      await fsImpl.rename(
        path.join(candidateDir, name),
        path.join(backup, name),
      );
      backedUp.push(name);
    }

    for (const name of REPAIR_FILES) {
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

async function copySelectedScreenshots({ screenshotsDir, candidateId, targetDir }) {
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
  for (const entry of entries.filter((item) => item.isDirectory())) {
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
      ["policyVersion", reasoning.policyVersion, creativeSession.reasoningPolicyVersion],
      ["selectorModelVersion", reasoning.selectorModelVersion, creativeSession.selectorModelVersion],
    ].filter(([, actual, expected]) => actual !== expected);
    if (mismatches.length)
      throw new Error(
        `Candidate ${metadata?.candidateId || entry.name} reasoning binding does not match the frozen creative session: ${mismatches.map(([field, actual, expected]) => `${field}=${actual ?? "(missing)"} expected ${expected ?? "(missing)"}`).join(" | ")}`,
      );
  }
}

async function defaultRepairCandidate({
  candidateDir,
  findings,
  screenshots,
  model,
  creativeSession = null,
} = {}) {
  const { metadata, contentManifest, content, files } =
    await readCandidate(candidateDir);
  const referenceDna =
    metadata.creativeManifest?.referenceDna || metadata.referenceDna;
  if (!referenceDna)
    throw new Error(`${metadata.candidateId || candidateDir} has no Reference DNA.`);
  const repaired = normalizeRepair(
    await requestRepair({
      model,
      referenceDna,
      findings,
      files,
      screenshots,
      contentManifest,
      creativeSession,
    }),
  );
  const validated = validateProductionCandidateFiles({
    files: repaired,
    route: {
      id: metadata.routeId || metadata.candidateId || "rendered-repair",
      referenceDna,
    },
    content,
  });
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
    throw new Error(`Creative repair candidate directory must be relative: ${directory}`);
  const root = path.resolve(candidateRoot);
  const resolved = path.resolve(root, directory);
  const relative = path.relative(root, resolved);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Creative repair candidate directory escapes the candidates root: ${directory}`);
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
  error = null,
}) {
  const directory = path.join(outDir, `round-${String(round).padStart(2, "0")}`, "repairs");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, `${candidateId}.json`),
    `${JSON.stringify(
      {
        version: 1,
        candidateId,
        reason,
        cycle: cyclesUsed,
        findings,
        ...(error
          ? {
              error: {
                name: error.name || "Error",
                code: error.code || "CREATIVE_REPAIR_FAILED",
                message: String(error.message || error).slice(0, 600),
              },
            }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
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
  model = process.env.CREATIVE_EXPERIENCE_MODEL || "openai/gpt-5.6-luna",
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
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const evidenceRoot = path.resolve(root, outDir);
  const cycleLimit = boundedCycles(maxCycles);
  const cycleUse = new Map();
  const repairFailures = new Map();
  const history = [];
  const maxRounds = Math.max(1, cycleLimit * 3 + 1);
  const requestedMode = mode === "promote" ? "promote" : "preview";
  const frozenCreativeSession = creativeSession
    ? validateCreativeSessionConfig(creativeSession, {
        creativeModel: model,
      })
    : null;
  await validateCandidateReasoningBindings(
    candidateRoot,
    frozenCreativeSession,
  );
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
  await fs.rm(evidenceRoot, { recursive: true, force: true });
  await fs.mkdir(evidenceRoot, { recursive: true });

  async function repair(
    candidateId,
    findings,
    reason,
    round,
    screenshotsDir,
    candidateDirectory,
  ) {
    const used = cycleUse.get(candidateId) || 0;
    if (used >= cycleLimit) return false;
    const candidateDir = resolveCandidateDirectory(
      candidateRoot,
      candidateDirectory,
    );
    const screenshots = VIEWPORTS.map((viewport) =>
      path.join(screenshotsDir, `${candidateId}-${viewport}.png`),
    );
    // A build failure can legitimately leave an ENOENT screenshot, but
    // permissions and I/O errors must fail closed instead of weakening evidence.
    const availableScreenshots = await collectAvailableScreenshots(screenshots);
    const nextCycle = used + 1;
    try {
      await repairCandidateImpl({
        candidateDir,
        candidateId,
        findings,
        screenshots: availableScreenshots,
        model,
        creativeSession: frozenCreativeSession,
        cycle: nextCycle,
        maxCycles: cycleLimit,
      });
    } catch (error) {
      if (!(error instanceof CreativeRepairResponseError)) throw error;
      // The response consumed one bounded repair attempt. Keep the candidate
      // fail-closed, record the exact boundary failure, and let the bakeoff
      // continue with any other independently authored candidates.
      cycleUse.set(candidateId, nextCycle);
      repairFailures.set(candidateId, {
        code: error.code,
        message: String(error.message || error).slice(0, 600),
      });
      await persistRepairEvidence({
        outDir: evidenceRoot,
        round,
        candidateId,
        reason,
        findings,
        cyclesUsed: nextCycle,
        error,
      });
      return false;
    }
    cycleUse.set(candidateId, nextCycle);
    await persistRepairEvidence({
      outDir: evidenceRoot,
      round,
      candidateId,
      reason,
      findings,
      cyclesUsed: nextCycle,
    });
    return true;
  }

  for (let round = 0; round < maxRounds; round += 1) {
    const roundDir = path.join(
      evidenceRoot,
      `round-${String(round).padStart(2, "0")}`,
    );
    const screenshotsDir = path.join(roundDir, "screenshots");
    const reportPath = path.join(roundDir, "creative-bakeoff.json");
    await fs.mkdir(roundDir, { recursive: true });
    const report = await runBakeoffImpl({
      siteDir: root,
      candidatesDir: candidateRoot,
      reportPath,
      screenshotsDir,
      preview: true,
      promote: false,
      deferPromotion: true,
      requireDiversity,
    });
    const record = {
      round,
      selectedCandidateId: report.selectedCandidateId,
      promotionReady: Boolean(report.promotionReady),
      visualDiversityPass: Boolean(report.visualDiversity?.pass),
      repairs: [],
      repairFailures: [],
    };
    history.push(record);

    if (humanRepairPending && (report.candidates || []).length !== 1)
      throw new Error(
        "Human creative feedback requires an isolated selected candidate.",
      );

    if (!report.selectedCandidateId) {
      const candidates = (report.candidates || []).filter(candidateNeedsRepair);
      let repairedAny = false;
      for (const candidate of candidates) {
        const findings = [
          ...candidateFindings(candidate),
          ...(humanRepairPending ? humanFindings : []),
        ];
        const repaired = await repair(
          candidate.candidateId,
          findings.length ? findings : ["Candidate did not pass rendered preview gates."],
          humanRepairPending
            ? "human-review-feedback"
            : "candidate-render-failure",
          round,
          screenshotsDir,
          candidate.directory,
        );
        if (repaired) {
          repairedAny = true;
          record.repairs.push(candidate.candidateId);
        } else if (repairFailures.has(candidate.candidateId)) {
          record.repairFailures.push({
            candidateId: candidate.candidateId,
            ...repairFailures.get(candidate.candidateId),
          });
        }
      }
      if (repairedAny && humanRepairPending) humanRepairPending = false;
      if (!repairedAny)
        throw new Error(
          `No authored creative candidate passed and the ${cycleLimit}-cycle repair budget is exhausted${repairFailures.size ? ` (${[...repairFailures.values()].map((failure) => failure.message).join("; ")})` : ""}.`,
        );
      continue;
    }

    const selectedId = report.selectedCandidateId;
    const selected = reportCandidate(report, selectedId);
    if (!selected)
      throw new Error(`Selected candidate ${selectedId} is missing from the bakeoff report.`);
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
      );
      if (!repaired)
        throw new Error(
          `Human feedback for ${selectedId} could not be applied within the ${cycleLimit}-cycle repair budget${repairFailures.has(selectedId) ? ` (${repairFailures.get(selectedId).message})` : ""}.`,
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
          ...gateFindings(visualGate),
        ],
        "selected-visual-gate",
        round,
        screenshotsDir,
        selected.directory,
      );
      if (!repaired)
        throw new Error(
          `Selected candidate ${selectedId} still fails rendered visual QA after ${cycleLimit} repair cycles${repairFailures.has(selectedId) ? ` (${repairFailures.get(selectedId).message})` : ""}.`,
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
      record.humanRevisionVerdict =
        humanGate.audit?.verdict || "error";
      if (humanGate.audit?.verdict !== "pass") {
        const repaired = await repair(
          selectedId,
          [
            ...humanFindings,
            ...(humanGate.audit?.findings || []).map((finding) => ({
              category: finding.category,
              message: finding.evidence,
              evidence: finding.evidence,
              recommendation: finding.recommendation,
            })),
          ],
          "human-revision-gate",
          round,
          screenshotsDir,
          selected.directory,
        );
        if (!repaired)
          throw new Error(
            `Selected candidate ${selectedId} still does not satisfy the human review request after ${cycleLimit} repair cycles${repairFailures.has(selectedId) ? ` (${repairFailures.get(selectedId).message})` : ""}.`,
          );
        record.repairs.push(selectedId);
        continue;
      }
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
      let repairedAny = false;
      for (const target of targets) {
        const repaired = await repair(
          target.candidateId,
          [target.finding],
          "rendered-diversity",
          round,
          screenshotsDir,
          reportCandidate(report, target.candidateId)?.directory,
        );
        if (repaired) {
          repairedAny = true;
          record.repairs.push(target.candidateId);
        } else if (repairFailures.has(target.candidateId)) {
          record.repairFailures.push({
            candidateId: target.candidateId,
            ...repairFailures.get(target.candidateId),
          });
        }
      }
      if (!repairedAny)
        throw new Error(
          `Production promotion is not ready after the ${cycleLimit}-cycle per-candidate repair budget${repairFailures.size ? ` (${[...repairFailures.values()].map((failure) => failure.message).join("; ")})` : ""}.`,
        );
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
      model,
      creativeSession: frozenCreativeSession
        ? {
            sessionId: frozenCreativeSession.sessionId,
            reasoningEffort: frozenCreativeSession.reasoningEffort,
            recommendedEffort: frozenCreativeSession.recommendedEffort,
            mode: frozenCreativeSession.mode,
            reasoningPolicyVersion:
              frozenCreativeSession.reasoningPolicyVersion,
            selectorModelVersion:
              frozenCreativeSession.selectorModelVersion,
          }
        : null,
      selectedCandidateId: selectedId,
      promotionReady: Boolean(report.promotionReady),
      visualGatePass: true,
      humanRevisionPass: humanFeedback
        ? record.humanRevisionVerdict === "pass"
        : true,
      visualDiversityPass: Boolean(report.visualDiversity?.pass),
      repairCycles: Object.fromEntries(cycleUse),
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
      const liveConfig = JSON.parse(
        await fs.readFile(liveConfigPath, "utf8"),
      );
      if (liveConfig.revisionReport) {
        liveConfig.revisionReport.creativeSourceRepairVerified = {
          pass: true,
          candidateId: selectedId,
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
    ? validateCreativeSessionConfig(
        await readJson(path.resolve(sessionFile)),
      )
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
      process.env.CREATIVE_EXPERIENCE_MODEL ||
      "openai/gpt-5.6-luna",
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
      summary: path.resolve(
        args["site-dir"] || "templates/client-site",
        args.out || ".launchloom/creative-repair",
        "summary.json",
      ),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
