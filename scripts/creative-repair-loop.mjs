import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREATIVE_REPAIR_MAX_COMPLETION_TOKENS,
  authoringCompletionDiagnostics,
  completionLimitRequestField,
  formatAuthoringCompletionDiagnostics,
  referenceImplementationChecklist,
} from "./creative-authoring-output.mjs";
import { parseModelJson } from "./model-json.mjs";
import { validateReferenceCandidate } from "./reference-fidelity.mjs";
import {
  cacheableReferenceDna,
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedText,
  promptCacheRequestFields,
} from "./openrouter-client.mjs";
import { promptImageDimensions, promptImagePart } from "./prompt-evidence.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";

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
  return String(value || "")
    .replace(/[—–]/gu, "-")
    .trim()
    .slice(0, limit);
}

function findingText(finding) {
  if (typeof finding === "string") return finding;
  if (!finding || typeof finding !== "object") return "";
  return [
    finding.category,
    finding.message,
    finding.evidence,
    finding.recommendation,
  ]
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

class ReferenceEvidenceError extends Error {}

function isCompleteRepair(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["experience", "styles", "motion"].every(
      (key) => typeof value[key] === "string",
    ),
  );
}

/**
 * Apply only deterministic, scoped safety repairs for findings that are
 * directly evidenced by the screenshot gate. These are not a renderer or
 * layout fallback: they preserve the authored DOM and composition, and the
 * workflow rerenders every viewport before promotion.
 */
export function applyCreativeVisualSafetyRepairs(files, findings = []) {
  let styles = String(files?.styles || "");
  if (
    hasFinding(
      findings,
      /footer[\s\S]*(?:unreadable|contrast|dark tone|clipped)|(?:unreadable|contrast|dark tone|clipped)[\s\S]*footer/iu,
    )
  ) {
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
  if (
    hasFinding(
      findings,
      /hero[\s\S]*(?:white-on-white|unreadable|invisible|contrast|light panel)|(?:white-on-white|unreadable|invisible|contrast|light panel)[\s\S]*hero/iu,
    )
  ) {
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
  if (
    hasFinding(
      findings,
      /(?:sticky|floating|pill|cta)[\s\S]*(?:overlap|collision|cover)|(?:overlap|collision|cover)[\s\S]*(?:sticky|floating|pill|cta)/iu,
    )
  ) {
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
  if (
    hasFinding(
      findings,
      /(?:service|services)[\s\S]*(?:oversized|overlong|display heading|five-line|dwarf)|(?:oversized|overlong|display heading|five-line|dwarf)[\s\S]*(?:service|services)/iu,
    )
  ) {
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
  if (
    hasFinding(
      findings,
      /(?:service|services|title|heading)[\s\S]*(?:astrophotograph|long unbroken|right viewport edge|final letters|clipped|overflow)|(?:astrophotograph|long unbroken|right viewport edge|final letters|clipped|overflow)[\s\S]*(?:service|services|title|heading)/iu,
    )
  ) {
    styles = appendRepair(
      styles,
      "/* launchloom-visual-repair: mobile-service-title-fit */",
      `
/* Keep long, unbroken service names inside the mobile row without changing
   the authored archive composition or its desktop scale. */
@media (max-width: 760px) {
  [data-creative-host="true"] .archive-row-name,
  [data-creative-host="true"] [data-service-presentation] [data-service-name],
  [data-creative-host="true"] [data-service-presentation] h3 {
    max-width: 100% !important;
    font-size: clamp(1.5rem, 6.4vw, 2.35rem) !important;
    line-height: .9 !important;
    letter-spacing: -.045em !important;
    overflow-wrap: break-word !important;
    word-break: normal !important;
    white-space: normal !important;
  }
}
`,
    );
  }
  if (
    hasFinding(
      findings,
      /(?:mobile|small)[\s\S]*(?:navigation|nav|menu)[\s\S]*(?:absent|missing|not visible|hidden)|(?:navigation|nav|menu)[\s\S]*(?:absent|missing|not visible|hidden)[\s\S]*(?:mobile|small)/iu,
    )
  ) {
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
 *
 * @param {{files?: {experience?: string, styles?: string, motion?: string}, referenceDna?: any, findings?: any[], screenshots?: string[], generate?: (input: any) => Promise<any>, evaluate?: (files: any) => Promise<any>, maxCycles?: number}} options
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
  if (!files || typeof files !== "object")
    throw new Error("Creative repair requires candidate files.");
  if (typeof generate !== "function")
    throw new Error("Creative repair requires a generation adapter.");
  if (typeof evaluate !== "function")
    throw new Error("Creative repair requires an evaluator.");
  let current = { ...files };
  const cycles = [];
  let result = await evaluate(current);
  let forcedRepair = findings.length > 0;
  let authorAttempts = 0;
  let generationFailures = 0;
  let repairCycles = 0;
  while (
    (!result.pass || forcedRepair) &&
    authorAttempts < maxCycles &&
    repairCycles < maxCycles
  ) {
    repairCycles += 1;
    const cycle = repairCycles;
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
      if (!isCompleteRepair(repaired))
        throw new Error(
          `Creative repair cycle ${cycle} returned incomplete files.`,
        );
    } catch (error) {
      if (error instanceof ReferenceEvidenceError) throw error;
      // A malformed or unavailable author response must not publish stale
      // output. Preserve the repair budget and give only the evidence-driven
      // safety transforms a chance to recover before failing closed.
      generationFailures += 1;
      current = applyCreativeVisualSafetyRepairs(current, cycleFindings);
      result = await evaluate(current);
      forcedRepair = false;
      cycles.push({
        cycle,
        pass: Boolean(result.pass),
        findings: result.findings || [],
        generationError: clean(
          error instanceof Error ? error.message : error,
          600,
        ),
      });
      continue;
    }
    authorAttempts += 1;
    current = {
      experience: clean(
        repaired.experience || current.experience,
        Number.MAX_SAFE_INTEGER,
      ),
      styles: clean(repaired.styles || current.styles, Number.MAX_SAFE_INTEGER),
      motion: clean(repaired.motion || current.motion, Number.MAX_SAFE_INTEGER),
    };
    current = applyCreativeVisualSafetyRepairs(current, cycleFindings);
    result = await evaluate(current);
    forcedRepair = false;
    cycles.push({
      cycle,
      pass: Boolean(result.pass),
      findings: result.findings || [],
    });
  }
  return {
    pass: Boolean(result.pass),
    cycles,
    cyclesUsed: repairCycles,
    authorAttempts,
    generationFailures,
    maxCycles,
    files: current,
    findings: result.findings || [],
  };
}

async function imagePart(file) {
  return promptImagePart(file);
}

async function imageSizeLabel(file) {
  try {
    const { width, height } = await promptImageDimensions(file);
    return `${width}x${height} source pixels`;
  } catch {
    return "unknown source dimensions";
  }
}

export async function resolveReferenceEvidencePath(record) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const candidates = [
    record?.absolutePath,
    record?.path,
    record?.path && path.resolve(repositoryRoot, record.path),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const candidatePath = path.resolve(candidate);
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // Try the next representation.
    }
  }
  return "";
}

/**
 * @param {{
 *   model?: string,
 *   referenceDna?: Record<string, any>,
 *   findings?: any[],
 *   files?: {experience?: string, styles?: string, motion?: string},
 *   screenshots?: string[],
 *   contentManifest?: Record<string, any>,
 *   creativeSession?: Record<string, any> | null,
 *   logger?: (message: string) => void,
 * }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function requestRepair({
  model,
  referenceDna,
  findings,
  files,
  screenshots,
  contentManifest = {},
  creativeSession = null,
  logger = console.log,
}) {
  const humanReview = (findings || []).some(
    (finding) =>
      finding &&
      typeof finding === "object" &&
      finding.category === "human-review-feedback",
  );
  const referenceMismatch = (findings || []).some((finding) => {
    const detail =
      typeof finding === "string"
        ? finding
        : [
            finding?.category,
            finding?.code,
            finding?.evidence,
            finding?.message,
            finding?.recommendation,
          ]
            .filter(Boolean)
            .join(" ");
    return /reference|composition|geometry|distinctiveness|diversity|generic|layout|section order|hero fit|image crop|visual mismatch/iu.test(
      detail,
    );
  });
  const repairInstruction = humanReview
    ? "Refine this authored LaunchLoom candidate in place to satisfy the explicit human review request. The reviewer is authorized to change composition, presentation, hierarchy, imagery treatment, motion, and safe UI features described in that request. Preserve sealed content bindings, accessibility, factual integrity, and the assigned Reference DNA identity outside the requested change. Do not convert it into a legacy renderer."
    : referenceMismatch
      ? "Repair this authored LaunchLoom candidate to address the measured rendered-reference and visual findings. You may change composition, layout, hierarchy, section rhythm, image placement or crop, navigation geometry, and motion where needed to fix those findings. Do not preserve any composition or design mechanic explicitly identified as failing. Preserve verified business facts, sealed content bindings, accessibility, required functionality, and the assigned Reference DNA family and signature intent. Do not convert it into a legacy renderer."
      : "Repair this authored LaunchLoom candidate in place. Preserve its composition and sealed content bindings. Do not convert it into a legacy renderer.";

  const desktopReference = referenceDna?.evidence?.desktopScreenshot;
  if (
    desktopReference?.available === false ||
    !(desktopReference?.path || desktopReference?.absolutePath)
  ) {
    throw new ReferenceEvidenceError(
      "Creative repair requires desktop reference evidence.",
    );
  }

  const stableReferenceDna = cacheableReferenceDna(referenceDna);
  const contentTokens = Array.isArray(contentManifest?.tokens)
    ? contentManifest.tokens.map((item) => item.token).filter(Boolean)
    : [];
  const contentShape = contentManifest?.values || {};
  const content = [
    {
      type: "text",
      text: `ASSIGNED REFERENCE DNA
${JSON.stringify(stableReferenceDna, null, 2)}

SEALED CONTENT TOKENS
${contentTokens.join("\n") || "(not supplied)"}

CURRENT SEALED CONTENT SHAPE
${JSON.stringify(contentShape, null, 2)}

TRUSTED @launchloom/runtime HELPERS
LeadForm, FAQList, ContactLinks, LocationMap, ChatLauncher, SocialProof, resolveAsset, useReducedMotion.
Content-bound helper contract: FAQList, ContactLinks, LocationMap, and SocialProof must always receive the sealed object exactly as content={content}. Use <FAQList content={content} />, <ContactLinks content={content} />, <LocationMap content={content} />, and <SocialProof content={content} runtime={runtime} />. SocialProof is the only supported way for candidate code to present signed live Google reviews; it falls back to verified proof points.
Use these helpers instead of inventing network calls or duplicating platform behavior. SocialProof is the only supported way for candidate code to present signed live Google reviews; it falls back to verified proof points.`,
    },
  ];

  const referenceScreenshots = [
    desktopReference,
    referenceDna?.evidence?.mobileScreenshot,
  ].filter(
    (record) =>
      record?.available !== false && (record?.path || record?.absolutePath),
  );
  for (const record of referenceScreenshots) {
    const resolved = await resolveReferenceEvidencePath(record);
    try {
      if (!resolved) throw new Error("No accessible reference screenshot.");
      const dimensions = await imageSizeLabel(resolved);
      content.push({ type: "text", text: `Assigned reference evidence (${dimensions}). Its capture height may span multiple page sections and is not a browser viewport height. Reference DNA section-height fractions must not be used directly as CSS vh. The desktop header and complete hero must fit within 1536x864.` });
      content.push(await imagePart(resolved));
    } catch (cause) {
      throw new ReferenceEvidenceError(
        `Creative repair cannot load required reference evidence: ${record.path || record.absolutePath}`,
        { cause },
      );
    }
  }

  const structuralChecklist = referenceImplementationChecklist(referenceDna);

  content.push(
    promptCachedText(
      model,
      "End reusable assigned reference evidence. Repair-specific findings and current source follow.",
    ),
  );
  content.push({
    type: "text",
    text: `${repairInstruction}

FINDINGS
${JSON.stringify(findings, null, 2)}

CURRENT EXPERIENCE.JSX
${files.experience}

CURRENT STYLES.CSS
${files.styles}

CURRENT MOTION.JS
${files.motion}

REQUIRED STRUCTURAL CHECKLIST
${structuralChecklist}
Keep each required ID and section marker on its semantically matching visible section, in the exact specified DOM order, while making the requested repair. Do not remove or rename them.

ALT-TEXT CONTRACT
Every <img> must have a usable alt attribute. Use concise descriptive alt text for informative images. Use alt="" only when the image is purely decorative or its relevant information is fully conveyed by adjacent text. Preserve the reviewed description when reusing a known informative image, even if its crop or position changes. Do not replace an informative description with generic filler such as "Decorative image".

Return complete files. Keep required reference signatures and safety/content contracts unless the explicit human review request requires a safe visual rearrangement; never remove required host instrumentation or sealed token bindings. Do not add remote URLs, hardcoded business facts, or em dashes.`,
  });
  for (const screenshot of screenshots.slice(0, 3)) {
    const dimensions = await imageSizeLabel(screenshot);
    const viewportCapture = /-viewport\.png$/u.test(screenshot);
    content.push({ type: "text", text: viewportCapture
      ? `Current candidate first browser viewport (${dimensions}). Judge hero geometry, typography, and mobile recomposition at this scale.`
      : `Current candidate full-page overview (${dimensions}). Use it for section rhythm, not to infer browser-scale typography or hero height.` });
    content.push(await imagePart(screenshot));
  }

  const reasoningEffort =
    creativeSession?.reasoningEffort ||
    process.env.CREATIVE_EXPERIENCE_REASONING_EFFORT ||
    "xhigh";
  const sessionId =
    creativeSession?.sessionId ||
    openRouterSessionId(
      "creative-repair",
      model,
      reasoningEffort,
      referenceDna?.familyId,
      referenceDna?.referenceName,
    );
  const promptCacheKey = openRouterPromptCacheKey(
    "creative-repair-reference",
    model,
    reasoningEffort,
    creativeSession?.reasoningPolicyVersion || "static-reasoning",
    stableReferenceDna,
  );
  const response = await openRouterChatCompletion({
    title: "LaunchLoom creative repair",
    sessionId,
    body: {
      model,
      ...promptCacheRequestFields(model, promptCacheKey),
      temperature: 0.35,
      reasoning: {
        effort: reasoningEffort,
        exclude: true,
      },
      response_format: { type: "json_schema", json_schema: REPAIR_SCHEMA },
      ...completionLimitRequestField(CREATIVE_REPAIR_MAX_COMPLETION_TOKENS),
      messages: [
        {
          role: "system",
          content:
            "Return JSON only. You are repairing your own production frontend against screenshot-level evidence.",
        },
        { role: "user", content },
      ],
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `OpenRouter creative repair failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
    );
  logOpenRouterCacheUsage("creative-repair", payload.usage);
  const responseContent = payload.choices?.[0]?.message?.content || "";
  const diagnostics = authoringCompletionDiagnostics({
    stage: "creative-repair",
    routeId: "repair",
    maxTokens: CREATIVE_REPAIR_MAX_COMPLETION_TOKENS,
    payload,
    content: responseContent,
  });
  const diagnosticText = formatAuthoringCompletionDiagnostics(diagnostics);
  logger(`creative_completion stage=creative-repair ${diagnosticText}`);
  if (["length", "max_tokens"].includes(diagnostics.finishReason))
    throw new Error(
      `Creative repair response was truncated (${diagnosticText}).`,
    );
  try {
    return parseModelJson(responseContent);
  } catch (cause) {
    throw new Error(
      `Creative repair response was malformed (${diagnosticText}).`,
      { cause },
    );
  }
}

async function main() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 === 0
            ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]]
            : pairs,
        [],
      ),
  );
  const candidateDir = path.resolve(args.candidate);
  const metadata = JSON.parse(
    await fs.readFile(path.join(candidateDir, "metadata.json"), "utf8"),
  );
  const files = {
    experience: await fs.readFile(
      path.join(candidateDir, "Experience.jsx"),
      "utf8",
    ),
    styles: await fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
    motion: await fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
  };
  const report = args.report
    ? JSON.parse(await fs.readFile(path.resolve(args.report), "utf8"))
    : {};
  const findings =
    report.findings ||
    report.audit?.findings ||
    report.candidates?.find(
      (candidate) => candidate.candidateId === metadata.candidateId,
    )?.failures ||
    [];
  const screenshotCandidates = (args.screenshots || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
  const screenshots = [];
  for (const screenshot of screenshotCandidates) {
    try {
      await fs.access(screenshot);
      screenshots.push(screenshot);
    } catch {
      /* a failed candidate may have no render evidence */
    }
  }
  const sessionConfig = args.session
    ? validateCreativeSessionConfig(
        JSON.parse(await fs.readFile(path.resolve(args.session), "utf8")),
      )
    : null;
  const model =
    args.model ||
    sessionConfig?.creativeModel ||
    process.env.CREATIVE_EXPERIENCE_MODEL ||
    "openai/gpt-6-luna";
  const creativeSession = sessionConfig
    ? validateCreativeSessionConfig(sessionConfig, { creativeModel: model })
    : null;
  const result = await runCreativeRepairLoop({
    files,
    referenceDna:
      metadata.creativeManifest?.referenceDna || metadata.referenceDna,
    findings,
    screenshots,
    maxCycles: Math.min(2, Math.max(0, Number(args.maxCycles || 2))),
    generate: (request) =>
      requestRepair({ model, creativeSession, ...request }),
    evaluate: async (candidateFiles) =>
      validateReferenceCandidate({
        referenceDna:
          metadata.creativeManifest?.referenceDna || metadata.referenceDna,
        experienceSource: candidateFiles.experience,
        stylesSource: candidateFiles.styles,
        motionSource: candidateFiles.motion,
      }),
  });
  if (result.cyclesUsed) {
    await fs.writeFile(
      path.join(candidateDir, "Experience.jsx"),
      `${result.files.experience.trim()}\n`,
    );
    await fs.writeFile(
      path.join(candidateDir, "styles.css"),
      `${result.files.styles.trim()}\n`,
    );
    await fs.writeFile(
      path.join(candidateDir, "motion.js"),
      `${result.files.motion.trim()}\n`,
    );
  }
  const out = path.resolve(
    args.out || path.join(candidateDir, "repair-report.json"),
  );
  await fs.writeFile(
    out,
    `${JSON.stringify(
      {
        version: 1,
        candidateId: metadata.candidateId,
        model,
        creativeSession: creativeSession
          ? {
              sessionId: creativeSession.sessionId,
              reasoningEffort: creativeSession.reasoningEffort,
              recommendedEffort: creativeSession.recommendedEffort,
              mode: creativeSession.mode,
              reasoningPolicyVersion: creativeSession.reasoningPolicyVersion,
            }
          : null,
        ...result,
      },
      null,
      2,
    )}\n`,
  );
  if (!result.pass)
    throw new Error(
      `Creative repair exhausted ${result.maxCycles} cycles for ${metadata.candidateId}.`,
    );
  console.log(
    `creative_repair_pass=true candidate=${metadata.candidateId} cycles=${result.cyclesUsed}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
