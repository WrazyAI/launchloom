import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CREATIVE_PROMOTION_THRESHOLDS } from "./creative-compiler.mjs";
import { runCreativeBakeoff } from "./run-creative-bakeoff.mjs";
import { requestRepair } from "./creative-repair-loop.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import { validateProductionCandidateFiles } from "./production-experience-author.mjs";

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
    if (
      pair.pass === false ||
      Number(pair.distance || 0) <
        CREATIVE_PROMOTION_THRESHOLDS.minimumPairwiseVisualDistance
    ) {
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
    content: contentManifest.values || {},
    files: { experience, styles, motion },
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

async function writeCandidate(candidateDir, files) {
  const staging = path.join(candidateDir, `.rendered-repair-${process.pid}`);
  await fs.mkdir(staging, { recursive: true });
  const map = {
    "Experience.jsx": files.experience,
    "styles.css": files.styles,
    "motion.js": files.motion,
  };
  try {
    for (const [name, content] of Object.entries(map))
      await fs.writeFile(path.join(staging, name), `${content.trim()}\n`);
    for (const name of REPAIR_FILES)
      await fs.rename(path.join(staging, name), path.join(candidateDir, name));
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
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

export async function runVisualGateProcess({
  siteDir,
  screenshotsDir,
  reportPath,
  configPath = path.join(siteDir, "src/site.config.json"),
  visualGateScript = path.resolve("scripts/visual-quality-gate.mjs"),
} = {}) {
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
  if (report.status === "error")
    throw new Error(
      `Creative visual gate could not run: ${report.error || result.stderr.slice(-1200)}`,
    );
  return { ...report, processExitCode: result.code };
}

async function defaultRepairCandidate({
  candidateDir,
  findings,
  screenshots,
  model,
} = {}) {
  const { metadata, content, files } = await readCandidate(candidateDir);
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
 *   maxCycles?: number,
 *   requireDiversity?: boolean,
 *   visualGateScript?: string,
 *   runBakeoffImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
 *   runVisualGateImpl?: (options: Record<string, unknown>) => Promise<Record<string, any>>,
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
  maxCycles = 2,
  requireDiversity = true,
  visualGateScript,
  runBakeoffImpl = runCreativeBakeoff,
  runVisualGateImpl = runVisualGateProcess,
  repairCandidateImpl = defaultRepairCandidate,
  promoteImpl = promoteCreativeCandidate,
} = {}) {
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const evidenceRoot = path.resolve(root, outDir);
  const cycleLimit = boundedCycles(maxCycles);
  const cycleUse = new Map();
  const history = [];
  const maxRounds = Math.max(1, cycleLimit * 3 + 1);
  const requestedMode = mode === "promote" ? "promote" : "preview";
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
    const availableScreenshots = [];
    for (const file of screenshots) {
      try {
        await fs.access(file);
        availableScreenshots.push(file);
      } catch {
        // A build failure can legitimately leave no screenshot for a route.
      }
    }
    const nextCycle = used + 1;
    await repairCandidateImpl({
      candidateDir,
      candidateId,
      findings,
      screenshots: availableScreenshots,
      model,
      cycle: nextCycle,
      maxCycles: cycleLimit,
    });
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
    };
    history.push(record);

    if (!report.selectedCandidateId) {
      const candidates = (report.candidates || []).filter(candidateNeedsRepair);
      let repairedAny = false;
      for (const candidate of candidates) {
        const findings = candidateFindings(candidate);
        const repaired = await repair(
          candidate.candidateId,
          findings.length ? findings : ["Candidate did not pass rendered preview gates."],
          "candidate-render-failure",
          round,
          screenshotsDir,
          candidate.directory,
        );
        if (repaired) {
          repairedAny = true;
          record.repairs.push(candidate.candidateId);
        }
      }
      if (!repairedAny)
        throw new Error(
          `No authored creative candidate passed and the ${cycleLimit}-cycle repair budget is exhausted.`,
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
          `Selected candidate ${selectedId} still fails rendered visual QA after ${cycleLimit} repair cycles.`,
        );
      record.repairs.push(selectedId);
      continue;
    }

    if (requestedMode === "promote" && !report.promotionReady) {
      const targets = diversityRepairTargets(report);
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
        }
      }
      if (!repairedAny)
        throw new Error(
          `Production promotion is not ready because rendered diversity still fails after the ${cycleLimit}-cycle per-candidate repair budget.`,
        );
      continue;
    }

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
      status: "passed",
      mode: requestedMode,
      model,
      selectedCandidateId: selectedId,
      promotionReady: Boolean(report.promotionReady),
      visualGatePass: true,
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
    return { ...summary, bakeoff: report, visualGate };
  }

  throw new Error(
    `Rendered creative repair exceeded its bounded orchestration rounds (${maxRounds}).`,
  );
}

async function main() {
  const args = cliArgs(process.argv);
  const result = await runRenderedCreativeRepair({
    siteDir: args["site-dir"] || "templates/client-site",
    candidatesDir: args.candidates || ".launchloom/generated-experiences",
    outDir: args.out || ".launchloom/creative-repair",
    mode: args.mode || "preview",
    model:
      args.model ||
      process.env.CREATIVE_EXPERIENCE_MODEL ||
      "openai/gpt-5.6-luna",
    maxCycles: args["max-cycles"] || 2,
    requireDiversity: args["require-diversity"] !== "false",
    visualGateScript: args["visual-gate-script"],
  });
  console.log(
    JSON.stringify({
      creativeRepairStatus: result.status,
      selectedCandidateId: result.selectedCandidateId,
      promotionReady: result.promotionReady,
      visualGatePass: result.visualGatePass,
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
