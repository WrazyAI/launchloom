import fs from "node:fs/promises";
import path from "node:path";
import { parseModelJson } from "./model-json.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";

const REPAIR_SCHEMA = {
  name: "launchloom_creative_repair",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["experience", "styles", "motion"],
    properties: {
      experience: { type: "string" },
      styles: { type: "string" },
      motion: { type: "string" },
    },
  },
};

function clean(value, limit = 900) {
  return String(value || "").replace(/[—–]/gu, "-").trim().slice(0, limit);
}

function findingText(finding) {
  if (typeof finding === "string") return finding;
  if (!finding || typeof finding !== "object") return "";
  return [finding.category, finding.message, finding.evidence, finding.recommendation]
    .filter(Boolean)
    .join(" ");
}

function hasFinding(findings, pattern) {
  return findings.some((finding) => pattern.test(findingText(finding)));
}

function mergeFindings(...sources) {
  return sources.flatMap((source) => (Array.isArray(source) ? source : []));
}

function appendRepair(styles, marker, css) {
  if (styles.includes(marker)) return styles;
  return `${styles.trim()}\n\n${marker}\n${css.trim()}\n`;
}

/**
 * Apply only deterministic, scoped safety repairs for findings that are
 * directly evidenced by the screenshot gate. These are not a renderer or
 * layout fallback: they preserve the authored DOM and composition, and the
 * workflow rerenders every viewport before promotion.
 */
export function applyCreativeVisualSafetyRepairs(files, findings = []) {
  let styles = String(files?.styles || "");
  if (hasFinding(findings, /footer[\s\S]*(?:unreadable|contrast|dark tone|clipped)|(?:unreadable|contrast|dark tone|clipped)[\s\S]*footer/iu)) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: footer-contrast */",
      `
[data-reference-section="footer"] {
  padding-top: clamp(2rem, 5vw, 4rem);
}

[data-reference-section="footer"] > strong,
[data-reference-section="footer"] h2,
[data-reference-section="footer"] h3 {
  color: var(--ll-creative-paper, #fff) !important;
}
`,
    );
  }
  if (hasFinding(findings, /hero[\s\S]*(?:white-on-white|unreadable|invisible|contrast|light panel)|(?:white-on-white|unreadable|invisible|contrast|light panel)[\s\S]*hero/iu)) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: hero-host-collision */",
      `
/* The production shell has a legacy .hero surface rule. Keep it from
   repainting an authored candidate's hero while preserving its composition. */
[data-hero] {
  background-color: transparent !important;
  color: inherit !important;
}

[data-hero] h1,
[data-hero] .hero-offer {
  color: inherit !important;
}
`,
    );
  }
  if (hasFinding(findings, /(?:sticky|floating|pill|cta)[\s\S]*(?:overlap|collision|cover)|(?:overlap|collision|cover)[\s\S]*(?:sticky|floating|pill|cta)/iu)) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: conversion-clearance */",
      `
/* The authored conversion control remains the same anchor and style, but
   cannot obscure a signature marquee or image strip at the viewport edge. */
[data-creative-host="true"] a[data-navigation-geometry="fixed-bottom-conversation-pill"],
body > div > a[data-navigation-geometry="fixed-bottom-conversation-pill"] {
  position: static !important;
  display: table !important;
  margin: 1.5rem auto 1.5rem !important;
  transform: none !important;
}

/* QuickAnswers belongs to the production shell. Scope the adjustment to a
   creative host so legacy pages retain their existing floating assistant. */
body:has([data-creative-host="true"]) .quick-answers {
  position: static !important;
  display: table !important;
  margin: 0 1.5rem 1.5rem auto !important;
}

@media (max-width: 760px) {
  [data-reference-section="footer"] {
    padding-bottom: max(6rem, calc(3rem + env(safe-area-inset-bottom)));
  }
}
`,
    );
  }
  if (hasFinding(findings, /(?:service|services)[\s\S]*(?:oversized|overlong|display heading|five-line|dwarf)|(?:oversized|overlong|display heading|five-line|dwarf)[\s\S]*(?:service|services)/iu)) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: service-intro-hierarchy */",
      `
/* Keep the service promise legible without letting it overpower the actual
   service rows that carry the conversion decision. */
[data-reference-section="pricing"] > h2,
[data-reference-section="services"] > h2 {
  max-width: 42rem !important;
  margin-bottom: 2rem !important;
  font-family: var(--ll-creative-sans, Arial, sans-serif) !important;
  font-size: clamp(1.05rem, 2.2vw, 1.55rem) !important;
  font-style: normal !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  line-height: 1.45 !important;
}
`,
    );
  }
  if (hasFinding(findings, /(?:mobile|small)[\s\S]*(?:navigation|nav|menu)[\s\S]*(?:absent|missing|not visible|hidden)|(?:navigation|nav|menu)[\s\S]*(?:absent|missing|not visible|hidden)[\s\S]*(?:mobile|small)/iu)) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: mobile-navigation-visibility */",
      `
@media (max-width: 760px) {
  [data-navigation-geometry] header,
  [data-navigation-geometry] .site-header,
  [data-navigation-geometry] .command-bar {
    flex-wrap: wrap !important;
    height: auto !important;
    min-height: 4rem;
    padding-bottom: .75rem;
  }

  [data-navigation-geometry] header nav,
  [data-navigation-geometry] .site-header nav,
  [data-navigation-geometry] .command-bar nav {
    display: flex !important;
    order: 3;
    flex-basis: 100%;
    justify-content: space-between;
    gap: .75rem;
    padding-top: .75rem;
    border-top: 1px solid currentColor;
    font-size: .75rem;
  }
}
`,
    );
  }
  return { ...files, styles };
}

/**
 * Bounded author-owned repair loop. The evaluator is deliberately injected so
 * tests can prove the retry limit without contacting a model provider.
 */
export async function runCreativeRepairLoop({
  files,
  referenceDna,
  findings = [],
  screenshots = [],
  generate,
  evaluate,
  maxCycles = 2,
} = {}) {
  if (!files || typeof files !== "object") throw new Error("Creative repair requires candidate files.");
  if (typeof generate !== "function") throw new Error("Creative repair requires a generation adapter.");
  if (typeof evaluate !== "function") throw new Error("Creative repair requires an evaluator.");
  let current = { ...files };
  const cycles = [];
  let result = await evaluate(current);
  let forcedRepair = findings.length > 0;
  for (let cycle = 1; (!result.pass || forcedRepair) && cycle <= maxCycles; cycle += 1) {
    const cycleFindings = mergeFindings(findings, result.findings);
    let repaired;
    try {
      repaired = await generate({
        stage: "repair",
        cycle,
        maxCycles,
        referenceDna,
        findings: cycleFindings,
        screenshots,
        files: current,
      });
    } catch (error) {
      // A malformed or unavailable author response must not publish stale
      // output. Preserve the repair budget and give only the evidence-driven
      // safety transforms a chance to recover before failing closed.
      current = applyCreativeVisualSafetyRepairs(current, cycleFindings);
      result = await evaluate(current);
      forcedRepair = false;
      cycles.push({
        cycle,
        pass: Boolean(result.pass),
        findings: result.findings || [],
        generationError: clean(error instanceof Error ? error.message : error, 600),
      });
      continue;
    }
    if (!repaired || typeof repaired !== "object") throw new Error(`Creative repair cycle ${cycle} returned no files.`);
    current = {
      experience: clean(repaired.experience || current.experience, Number.MAX_SAFE_INTEGER),
      styles: clean(repaired.styles || current.styles, Number.MAX_SAFE_INTEGER),
      motion: clean(repaired.motion || current.motion, Number.MAX_SAFE_INTEGER),
    };
    current = applyCreativeVisualSafetyRepairs(current, cycleFindings);
    result = await evaluate(current);
    forcedRepair = false;
    cycles.push({ cycle, pass: Boolean(result.pass), findings: result.findings || [] });
  }
  return {
    pass: Boolean(result.pass),
    cycles,
    cyclesUsed: cycles.length,
    maxCycles,
    files: current,
    findings: result.findings || [],
  };
}

async function imagePart(file) {
  const data = await fs.readFile(file);
  const extension = path.extname(file).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { type: "image_url", image_url: { url: `data:${mime};base64,${data.toString("base64")}` } };
}

async function requestRepair({ model, referenceDna, findings, files, screenshots }) {
  const content = [{ type: "text", text: `Repair this authored LaunchLoom candidate in place. Preserve its composition and sealed content bindings. Do not convert it into a legacy renderer. Reference DNA:\n${JSON.stringify(referenceDna, null, 2)}\nFindings:\n${JSON.stringify(findings, null, 2)}\nCurrent Experience.jsx:\n${files.experience}\nCurrent styles.css:\n${files.styles}\nCurrent motion.js:\n${files.motion}\nReturn complete files. Keep the required data-reference-signature, geometry, section, CTA, mobile, and motion markers. Do not add remote URLs, hardcoded business facts, or em dashes.` }];
  for (const screenshot of screenshots.slice(0, 3)) content.push(await imagePart(screenshot));
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-OpenRouter-Title": "LaunchLoom creative repair" },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      reasoning: { effort: process.env.CREATIVE_EXPERIENCE_REASONING_EFFORT || "max", exclude: true },
      response_format: { type: "json_schema", json_schema: REPAIR_SCHEMA },
      max_tokens: 24_000,
      messages: [
        { role: "system", content: "Return JSON only. You are repairing your own production frontend against screenshot-level evidence." },
        { role: "user", content },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenRouter creative repair failed (${response.status}): ${payload?.error?.message || "unknown error"}`);
  return parseModelJson(payload.choices?.[0]?.message?.content || "");
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
  const candidateDir = path.resolve(args.candidate);
  const metadata = JSON.parse(await fs.readFile(path.join(candidateDir, "metadata.json"), "utf8"));
  const files = {
    experience: await fs.readFile(path.join(candidateDir, "Experience.jsx"), "utf8"),
    styles: await fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
    motion: await fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
  };
  const report = args.report ? JSON.parse(await fs.readFile(path.resolve(args.report), "utf8")) : {};
  const findings = report.findings || report.audit?.findings || report.candidates?.find((candidate) => candidate.candidateId === metadata.candidateId)?.failures || [];
  const screenshotCandidates = (args.screenshots || "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => path.resolve(item));
  const screenshots = [];
  for (const screenshot of screenshotCandidates) {
    try { await fs.access(screenshot); screenshots.push(screenshot); } catch { /* a failed candidate may have no render evidence */ }
  }
  const model = args.model || process.env.CREATIVE_EXPERIENCE_MODEL || "openai/gpt-5.6-luna";
  const result = await runCreativeRepairLoop({
    files,
    referenceDna: metadata.creativeManifest?.referenceDna || metadata.referenceDna,
    findings,
    screenshots,
    maxCycles: Math.min(2, Math.max(0, Number(args.maxCycles || 2))),
    generate: (request) => requestRepair({ model, ...request }),
    evaluate: async (candidateFiles) => validateReferenceCandidate({ referenceDna: metadata.creativeManifest?.referenceDna || metadata.referenceDna, experienceSource: candidateFiles.experience, stylesSource: candidateFiles.styles, motionSource: candidateFiles.motion }),
  });
  if (result.cyclesUsed) {
    await fs.writeFile(path.join(candidateDir, "Experience.jsx"), `${result.files.experience.trim()}\n`);
    await fs.writeFile(path.join(candidateDir, "styles.css"), `${result.files.styles.trim()}\n`);
    await fs.writeFile(path.join(candidateDir, "motion.js"), `${result.files.motion.trim()}\n`);
  }
  const out = path.resolve(args.out || path.join(candidateDir, "repair-report.json"));
  await fs.writeFile(out, `${JSON.stringify({ version: 1, candidateId: metadata.candidateId, model, ...result }, null, 2)}\n`);
  if (!result.pass) throw new Error(`Creative repair exhausted ${result.maxCycles} cycles for ${metadata.candidateId}.`);
  console.log(`creative_repair_pass=true candidate=${metadata.candidateId} cycles=${result.cyclesUsed}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
