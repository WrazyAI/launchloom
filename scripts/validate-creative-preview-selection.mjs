import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyVisualGateReport,
  splitFailureLines,
} from "./creative-gate-severity.mjs";

/**
 * Decide whether a creative selection may deploy a preview.
 *
 * Strict selections (`creative-preview`, `creative-bakeoff`) require a
 * non-fallback bakeoff winner and a clean visual gate. A near-miss selection
 * requires the explicit `nearMissSelection` marker and may carry open design
 * findings. Every hard gate failure rejects.
 *
 * @param {{config: Record<string, any>, bakeoff: Record<string, any>, gate: Record<string, any>}} input
 * @returns {{decision: "clean" | "warned" | "reject", candidateId: string | null, warnings: string[], reasons: string[]}}
 */
export function validateCreativePreviewSelection({ config, bakeoff, gate } = {}) {
  const reasons = [];
  const experience = config?.design?.experience;
  const renderer = experience?.renderer;
  const candidateId =
    typeof experience?.candidateId === "string"
      ? experience.candidateId.trim()
      : "";
  const selectionMode = experience?.selectionMode;
  if (renderer !== "creative-candidate")
    reasons.push("creative renderer was not selected");
  if (!candidateId) reasons.push("creative candidate id is missing");
  if (!bakeoff || typeof bakeoff !== "object")
    reasons.push("creative bakeoff report is missing");
  if (bakeoff?.selectedCandidateId !== candidateId)
    reasons.push("bakeoff selection does not match the configured candidate");

  const gateResult = classifyVisualGateReport(gate);
  if (gateResult.decision === "reject")
    reasons.push(...gateResult.reasons);

  const candidates = Array.isArray(bakeoff?.candidates)
    ? bakeoff.candidates
    : null;
  if (!candidates) reasons.push("creative bakeoff candidates are missing");
  const selectedCandidate =
    candidates?.find((candidate) => candidate?.candidateId === candidateId) ||
    null;
  if (!selectedCandidate)
    reasons.push("selected candidate is missing from the bakeoff report");
  const warnings = [...gateResult.warnings];
  if (selectedCandidate) {
    const split = splitFailureLines(selectedCandidate.failures || []);
    const hard = [...split.hard];
    if (selectionMode === "creative-near-miss") {
      for (let index = hard.length - 1; index >= 0; index -= 1) {
        if (/^contrast fail/u.test(hard[index])) {
          warnings.push(...hard.splice(index, 1));
        }
      }
    }
    if (hard.length)
      reasons.push("selected candidate has hard deterministic failures");
    if (
      selectionMode === "creative-near-miss" &&
      !selectedCandidate.renderedReferenceFidelity?.audit
    )
      reasons.push("selected candidate audit evidence is missing");
    // A composition that declares a media region but renders no raster media
    // is image-led in intent and graphic in result. Never call that clean: the
    // approved imagery contract was not met, even when the graphic stand-in is
    // deliberate and readable.
    const mediaViewports = (Array.isArray(selectedCandidate.viewports)
      ? selectedCandidate.viewports
      : []
    ).filter((viewport) => Number(viewport?.heroMediaRegionCount) > 0);
    const noRenderedMedia =
      mediaViewports.length > 0 &&
      mediaViewports.every(
        (viewport) => Number(viewport?.heroMediaVisualCount) === 0,
      );
    const coverage = selectedCandidate.imageCoverage;
    const emptyCoverage =
      coverage &&
      Number(coverage.count) === 0 &&
      coverage.required === true;
    if (noRenderedMedia)
      warnings.push(
        "Image-led composition rendered no approved imagery; the preview uses a graphic stand-in.",
      );
    else if (emptyCoverage)
      warnings.push(
        "No approved imagery was available for an image-required composition.",
      );
    else if (coverage && coverage.required === true && coverage.hero !== true)
      warnings.push(
        "Hero imagery was not approved for an image-required composition.",
      );
  }

  if (
    selectionMode === "creative-preview" ||
    selectionMode === "creative-bakeoff"
  ) {
    if (bakeoff?.fallback !== false)
      reasons.push("strict selection is marked as a fallback");
    if (gateResult.decision !== "clean")
      reasons.push("strict selection did not pass the visual gate");
  } else if (selectionMode === "creative-near-miss") {
    if (bakeoff?.nearMissSelection !== true)
      reasons.push("near-miss selection marker is missing");
    if (!["clean", "warned"].includes(gateResult.decision))
      reasons.push("near-miss selection did not pass the hard gate");
  } else {
    reasons.push("creative selection mode is missing or unknown");
  }

  const decision =
    reasons.length === 0
      ? gateResult.decision === "clean" && warnings.length
        ? "warned"
        : gateResult.decision
      : "reject";
  return {
    decision,
    candidateId: candidateId || null,
    warnings,
    reasons,
  };
}

function parseArgs(argv = []) {
  const args = {};
  const valueFlags = new Set(["config", "bakeoff", "gate", "out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!valueFlags.has(key)) throw new Error(`Unknown option: ${token}`);
    const value = String(argv[index + 1] || "");
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${token}`);
    args[key] = value;
    index += 1;
  }
  for (const required of ["config", "bakeoff", "gate"])
    if (!args[required]) throw new Error(`--${required} is required.`);
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = validateCreativePreviewSelection({
    config: await readJson(args.config),
    bakeoff: await readJson(args.bakeoff),
    gate: await readJson(args.gate),
  });
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    const output = path.resolve(args.out);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, text);
  }
  process.stdout.write(text);
  if (result.decision === "reject") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
