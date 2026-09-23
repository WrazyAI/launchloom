import fs from "node:fs/promises";
import path from "node:path";
import { candidateDiagnosticSafety, chooseRecoveryCandidate, summarizeCreativeRepairFindings } from "./creative-recovery.mjs";
import { promoteCreativeCandidate } from "./promote-creative-candidate.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";

function argsFrom(argv) {
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

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function latestRenderedRound(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const rounds = entries
    .filter((entry) => entry.isDirectory() && /^round-\d+$/u.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
  for (const round of rounds) {
    const reportPath = path.join(root, round.name, "creative-bakeoff.json");
    try {
      return { round: round.name, reportPath, report: await readJson(reportPath) };
    } catch {
      // A partially written newest round is skipped in favor of the last complete report.
    }
  }
  return null;
}

export async function prepareCreativeRecovery({
  siteDir = ".",
  candidatesDir = ".launchloom/generated-experiences",
  repairRoot = ".launchloom/creative-repair",
  outputPath = ".launchloom/creative-recovery.json",
  candidateId = "",
} = {}) {
  const root = path.resolve(siteDir);
  const candidateRoot = path.resolve(root, candidatesDir);
  const evidenceRoot = path.resolve(root, repairRoot);
  const latest = await latestRenderedRound(evidenceRoot);
  if (!latest) throw new Error("No complete rendered candidate report is available for recovery.");
  const candidate = candidateId
    ? latest.report.candidates?.find((item) => item.candidateId === candidateId)
    : chooseRecoveryCandidate(latest.report.candidates);
  if (!candidate || !/^candidate-[a-z0-9]+$/iu.test(candidate.candidateId))
    throw new Error("No rendered creative candidate is available for a final repair.");
  const candidateDir = path.resolve(candidateRoot, candidate.directory);
  if (!candidateDir.startsWith(`${candidateRoot}${path.sep}`))
    throw new Error("Rendered candidate path escaped its private source directory.");

  let sourceAvailable = true;
  let manifest;
  for (const file of ["metadata.json", "content-manifest.json", "Experience.jsx", "styles.css", "motion.js"]) {
    try {
      await fs.access(path.join(candidateDir, file));
    } catch {
      sourceAvailable = false;
    }
  }
  if (sourceAvailable) manifest = await readJson(path.join(candidateDir, "metadata.json"));
  let reasoningSession = null;
  try {
    reasoningSession = validateCreativeSessionConfig(
      await readJson(path.join(root, ".launchloom/reasoning-preflight.json")),
    );
  } catch {
    reasoningSession = null;
  }
  const repairAvailable = Boolean(sourceAvailable && reasoningSession);
  let diagnostic = candidateDiagnosticSafety(candidate);
  if (!sourceAvailable)
    diagnostic = { safe: false, reasons: [...diagnostic.reasons, "candidate-source-incomplete"] };
  if (diagnostic.safe) {
    try {
      await promoteCreativeCandidate({
        siteDir: root,
        candidateDir: path.relative(root, candidateDir),
        preview: true,
        selectionMode: "creative-diagnostic",
      });
    } catch {
      diagnostic = { safe: false, reasons: [...diagnostic.reasons, "candidate-source-safety"] };
    }
  }
  const roundDir = path.join(evidenceRoot, latest.round);
  let visualGate = null;
  try {
    visualGate = await readJson(path.join(roundDir, "visual-gate.json"));
  } catch {
    visualGate = null;
  }
  const findings = summarizeCreativeRepairFindings(candidate, visualGate);
  const summary = {
    version: 1,
    status: "awaiting-developer-repair",
    candidateId: candidate.candidateId,
    familyId: manifest?.creativeManifest?.familyId || manifest?.familyId || null,
    candidateDirectory: path.relative(root, candidateDir),
    reportPath: path.relative(root, latest.reportPath),
    round: latest.round,
    score: Number(candidate.score) || 0,
    diagnosticPreviewEligible: diagnostic.safe,
    diagnosticPreviewReasons: diagnostic.reasons,
    repairAvailable,
    creativeSessionId: reasoningSession?.sessionId || null,
    findings,
    resultPreviewUrl: null,
    resultReviewUrl: null,
  };
  const destination = path.resolve(root, outputPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsFrom(process.argv);
  const result = await prepareCreativeRecovery({
    siteDir: args["site-dir"] || ".",
    candidatesDir: args.candidates || ".launchloom/generated-experiences",
    repairRoot: args["repair-root"] || ".launchloom/creative-repair",
    outputPath: args.out || ".launchloom/creative-recovery.json",
    candidateId: args["candidate-id"] || "",
  });
  console.log(JSON.stringify(result));
}
