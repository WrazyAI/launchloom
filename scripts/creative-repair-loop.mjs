import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_PALETTE_ROLE_CONTRACT,
  CLIENT_TYPOGRAPHY_CONTRACT,
  CREATIVE_REPAIR_MAX_COMPLETION_TOKENS,
  EARLY_CONVERSION_OUTPUT_CONTRACT,
  REFERENCE_PROVENANCE_OUTPUT_CONTRACT,
  authoringCompletionDiagnostics,
  completionLimitRequestField,
  formatAuthoringCompletionDiagnostics,
  referenceImplementationChecklist,
} from "./creative-authoring-output.mjs";
import { parseModelJson } from "./model-json.mjs";
import {
  assertModelPromptTextBudget,
  formatModelBoundContentShape,
} from "./author-prompt-budget.mjs";
import { referenceDossierPromptBlock } from "./reference-dossier.mjs";
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

const REPAIR_FILE_ORDER = ["experience", "styles", "motion"];
const REPAIR_INNER_PAGE_KEYS = [
  "servicePage",
  "locationPage",
  "servicesIndexPage",
];

/**
 * Build the complete-file repair schema for the candidate's current files.
 * Strict structured output requires every property to be required, so inner
 * page fields are included only when the candidate actually carries them. An
 * empty string means "keep the current page unchanged".
 */
function repairSchemaFor(files = {}) {
  const innerKeys = REPAIR_INNER_PAGE_KEYS.filter(
    (key) => typeof files[key] === "string" && files[key].trim(),
  );
  const keys = [...REPAIR_FILE_ORDER, ...innerKeys];
  return {
    name: "launchloom_creative_repair",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: keys,
      properties: Object.fromEntries(
        keys.map((key) => [key, { type: "string" }]),
      ),
    },
  };
}

const REPAIR_FILE_SCHEMA = {
  name: "launchloom_creative_file_repair",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["file", "source"],
    properties: {
      file: { type: "string", enum: REPAIR_FILE_ORDER },
      source: { type: "string" },
    },
  },
};

const REPAIR_EDIT_SCHEMA = {
  name: "launchloom_creative_repair_edits",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["edits"],
    properties: {
      edits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["file", "find", "replace"],
          properties: {
            file: {
              type: "string",
              enum: [...REPAIR_FILE_ORDER, ...REPAIR_INNER_PAGE_KEYS],
            },
            find: { type: "string" },
            replace: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * Bounded-edit repair schema. Scoped human repairs stay restricted to the
 * homepage files because their section scope is declared against Experience.jsx;
 * automatic rendered repairs may also edit the authored inner pages.
 */
function repairEditSchemaFor(files = {}, { includeInnerPages = true } = {}) {
  if (!includeInnerPages) return REPAIR_EDIT_SCHEMA;
  const innerKeys = REPAIR_INNER_PAGE_KEYS.filter(
    (key) => typeof files[key] === "string" && files[key].trim(),
  );
  if (!innerKeys.length) return REPAIR_EDIT_SCHEMA;
  return {
    ...REPAIR_EDIT_SCHEMA,
    schema: {
      ...REPAIR_EDIT_SCHEMA.schema,
      properties: {
        ...REPAIR_EDIT_SCHEMA.schema.properties,
        edits: {
          ...REPAIR_EDIT_SCHEMA.schema.properties.edits,
          items: {
            ...REPAIR_EDIT_SCHEMA.schema.properties.edits.items,
            properties: {
              ...REPAIR_EDIT_SCHEMA.schema.properties.edits.items.properties,
              file: {
                type: "string",
                enum: [...REPAIR_FILE_ORDER, ...innerKeys],
              },
            },
          },
        },
      },
    },
  };
}

const REPAIR_SOURCE_EDIT_THRESHOLD_CHARS = 20_000;
const REPAIR_AFFORDABILITY_RETRY_MIN_TOKENS = 8_000;
const REPAIR_AFFORDABILITY_RETRY_HEADROOM_TOKENS = 1_024;
const REPAIR_EDITABLE_FILES = new Set([
  ...REPAIR_FILE_ORDER,
  ...REPAIR_INNER_PAGE_KEYS,
]);
const MAX_REPAIR_EDITS = 12;
const MAX_REPAIR_EDIT_FRAGMENT_CHARS = 6_000;
const MAX_REPAIR_PATCH_TEXT_CHARS = 24_000;
const MAX_REPAIR_FILE_SOURCE_CHARS = 80_000;
const MOTION_FINDING_PATTERN =
  /\b(?:motion|animation|animated|scrolltrigger|scroll-linked|parallax)\b/iu;
const REFERENCE_MISMATCH_PATTERN =
  /reference|composition|geometry|distinctiveness|diversity|generic|layout|section order|hero fit|image crop|visual mismatch/iu;

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
    finding.code,
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

function affordableRepairRetryLimit(status, payload, requestedTokens) {
  if (status !== 402) return null;
  const message = String(payload?.error?.message || "");
  const match = message.match(/can only afford\s+([\d,]+)\b/iu);
  if (!match) return null;
  const affordableTokens = Number(match[1].replace(/,/gu, ""));
  if (
    !Number.isSafeInteger(affordableTokens) ||
    affordableTokens >= requestedTokens
  )
    return null;
  const retryTokens = Math.min(
    requestedTokens - 1,
    affordableTokens - REPAIR_AFFORDABILITY_RETRY_HEADROOM_TOKENS,
  );
  return retryTokens >= REPAIR_AFFORDABILITY_RETRY_MIN_TOKENS
    ? retryTokens
    : null;
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

function isRepairEditSet(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.edits),
  );
}

function repairTargetFiles(findings) {
  const texts = (Array.isArray(findings) ? findings : [findings])
    .map(findingText)
    .filter(Boolean);
  const motionOnly =
    texts.length > 0 &&
    texts.every((text) => MOTION_FINDING_PATTERN.test(text)) &&
    !texts.some((text) => REFERENCE_MISMATCH_PATTERN.test(text));
  if (motionOnly) return ["motion"];

  const targets = new Set();
  const motionRequested = texts.some((text) =>
    MOTION_FINDING_PATTERN.test(text),
  );
  const stylesOnly = texts.length > 0 && texts.every((text) =>
    /\b(?:palette|color|colour|contrast|font|typography|spacing|density)\b/iu.test(
      text,
    ),
  );
  if (stylesOnly) targets.add("styles");
  else {
    targets.add("experience");
    targets.add("styles");
  }
  if (motionRequested) targets.add("motion");
  return REPAIR_FILE_ORDER.filter((file) => targets.has(file));
}

function validateCandidateFileReplacement(response, file) {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw repairOutputRejection(
      `Large creative repair must return a complete ${file} file replacement.`,
    );
  if (response.file !== file)
    throw repairOutputRejection(
      `Large creative repair requested ${file} but returned ${String(response.file || "no file")}.`,
    );
  if (
    typeof response.source !== "string" ||
    !response.source.trim() ||
    response.source.length > MAX_REPAIR_FILE_SOURCE_CHARS
  )
    throw repairOutputRejection(
      `Large creative repair ${file} source must be non-empty and at most ${MAX_REPAIR_FILE_SOURCE_CHARS} characters.`,
    );
  if (/data:image\/[^;\s]+;base64,/iu.test(response.source))
    throw repairOutputRejection(
      `Large creative repair ${file} source cannot contain inline image data.`,
    );
  return response.source.replace(/[—–]/gu, "-").trim();
}

function repairOutputRejection(message, cause) {
  const error = new Error(message, {
    ...(cause instanceof Error ? { cause } : {}),
  });
  error.code = "CREATIVE_REPAIR_OUTPUT_REJECTED";
  return error;
}

// Private output must never become an enumerable Error property or cause.
const privateRepairOutputs = new WeakMap();
function rememberPrivateRepairOutput(value, payload) {
  if (!value || typeof value !== "object") return value;
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (typeof raw !== "string") return value;
  const retained = raw.slice(0, 256_000);
  privateRepairOutputs.set(value, {
    version: 1, sha256: createHash("sha256").update(raw).digest("hex"),
    totalChars: raw.length, storedChars: retained.length,
    truncated: retained.length < raw.length, payload: retained,
  });
  return value;
}
export function privateRepairRejectionEvidence(value) {
  return value && typeof value === "object" ? privateRepairOutputs.get(value) || null : null;
}
export function inheritRepairRejectionEvidence(target, value, validationMessage) {
  const evidence = privateRepairRejectionEvidence(value);
  if (evidence && target && typeof target === "object") privateRepairOutputs.set(target, { ...evidence, ...(typeof validationMessage === "string" ? { validationMessage: validationMessage.slice(0, 6_000) } : {}) });
  return target;
}
/** Public diagnostics contain types/counts only, never caller-provided source. */
export function repairRejectionSummary(edit, index, occurrences = null) {
  const type = value => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const codes = [];
  const file = REPAIR_EDITABLE_FILES.has(edit?.file) ? edit.file : null;
  if (!file) codes.push("unsupported_file");
  if (typeof edit?.find !== "string") codes.push("invalid_find_type");
  else if (!edit.find.length) codes.push("empty_find");
  else if (edit.find.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS) codes.push("find_too_long");
  if (typeof edit?.replace !== "string") codes.push("invalid_replace_type");
  else if (edit.replace.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS) codes.push("replace_too_long");
  if (occurrences === 0) codes.push("find_missing");
  else if (occurrences > 1) codes.push("find_not_unique");
  return {
    version: 1, editIndex: Number.isInteger(index) && index >= 0 && index < MAX_REPAIR_EDITS ? index + 1 : null,
    file, codes, findType: type(edit?.find), replaceType: type(edit?.replace),
    findLength: typeof edit?.find === "string" ? edit.find.length : null,
    replaceLength: typeof edit?.replace === "string" ? edit.replace.length : null,
    occurrences: Number.isSafeInteger(occurrences) && occurrences >= 0 ? occurrences : null,
  };
}
function rejectedEdit(message, edit, index, occurrences = null) {
  const error = repairOutputRejection(message);
  error.repairRejectionSummary = repairRejectionSummary(edit, index, occurrences);
  return error;
}

/** Apply exact, bounded source replacements; ambiguous edits fail closed. */
export function applyCreativeRepairEdits(files, edits, { allowInnerPages = true } = {}) {
  if (!files || typeof files !== "object" || Array.isArray(files))
    throw new Error("Creative repair edits require candidate files.");
  if (
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > MAX_REPAIR_EDITS
  )
    throw repairOutputRejection(
      `Creative repair edits must contain 1 to ${MAX_REPAIR_EDITS} literal replacements.`,
    );

  const repaired = { ...files };
  let patchTextChars = 0;
  for (const [index, edit] of edits.entries()) {
    const label = `Creative repair edit ${index + 1}`;
    if (
      !edit ||
      typeof edit !== "object" ||
      !REPAIR_EDITABLE_FILES.has(edit.file) ||
      (!allowInnerPages && REPAIR_INNER_PAGE_KEYS.includes(edit.file))
    )
      throw rejectedEdit(
        `${label} targets an unsupported candidate file.`, edit, index,
      );
    if (
      typeof edit.find !== "string" ||
      !edit.find.length ||
      edit.find.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS ||
      typeof edit.replace !== "string" ||
      edit.replace.length > MAX_REPAIR_EDIT_FRAGMENT_CHARS
    )
      throw rejectedEdit(
        `${label} exceeds the bounded literal replacement contract.`, edit, index,
      );
    const replacement = edit.replace.replace(/[—–]/gu, "-");
    if (edit.find === replacement)
      throw rejectedEdit(
        `${label} does not change the candidate source.`, edit, index,
      );
    if (/data:image\//iu.test(edit.find) || /data:image\//iu.test(edit.replace))
      throw repairOutputRejection(`${label} cannot contain inline image data.`);
    patchTextChars += edit.find.length + edit.replace.length;
    if (patchTextChars > MAX_REPAIR_PATCH_TEXT_CHARS)
      throw repairOutputRejection(
        "Creative repair patch exceeds the bounded text budget.",
      );

    const source = repaired[edit.file];
    if (typeof source !== "string")
      throw new Error(`${label} targets a missing candidate file.`);
    const start = source.indexOf(edit.find);
    if (start < 0 || source.indexOf(edit.find, start + edit.find.length) >= 0)
      throw rejectedEdit(
        `${label} source fragment must match exactly once in ${edit.file}.`, edit, index,
        start < 0 ? 0 : source.split(edit.find).length - 1,
      );
    repaired[edit.file] =
      source.slice(0, start) +
      replacement +
      source.slice(start + edit.find.length);
  }
  return repaired;
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
 * @param {{files?: {experience?: string, styles?: string, motion?: string, servicePage?: string, locationPage?: string, servicesIndexPage?: string}, referenceDna?: any, referenceDossier?: any, findings?: any[], screenshots?: string[], comparisonScreenshots?: Array<{candidateId: string, viewport: string, path: string}>, generate?: (input: any) => Promise<any>, evaluate?: (files: any) => Promise<any>, maxCycles?: number}} options
 */
export async function runCreativeRepairLoop({
  files,
  referenceDna,
  referenceDossier,
  findings = [],
  screenshots = [],
  comparisonScreenshots = [],
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
        referenceDossier,
        findings: cycleFindings,
        screenshots,
        comparisonScreenshots,
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
    const previousFiles = current;
    current = {
      experience: clean(
        repaired.experience || current.experience,
        Number.MAX_SAFE_INTEGER,
      ),
      styles: clean(repaired.styles || current.styles, Number.MAX_SAFE_INTEGER),
      motion: clean(repaired.motion || current.motion, Number.MAX_SAFE_INTEGER),
    };
    for (const key of REPAIR_INNER_PAGE_KEYS) {
      const value =
        typeof repaired[key] === "string" && repaired[key].trim()
          ? repaired[key]
          : previousFiles[key];
      if (typeof value === "string" && value.trim())
        current[key] = clean(value, Number.MAX_SAFE_INTEGER);
    }
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

async function imagePart(file, options) {
  return promptImagePart(file, options);
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
 * Factor identical contrast diagnostic payloads across measured contexts.
 * Every route/viewport/state tuple and the exact remaining diagnostic are
 * retained, including ratios, selectors, text, colors, and unresolved causes.
 * Unknown findings stay verbatim. The authoritative findings are not mutated.
 */
export function modelBoundRepairFindings(findings = []) {
  const result = [];
  const groups = new Map();
  for (const finding of findings) {
    const match =
      typeof finding === "string" &&
      finding.match(
        /^contrast (\w+): (\S+) (desktop|compact|mobile) (\S+) (.+)$/u,
      );
    if (!match) {
      result.push(finding);
      continue;
    }
    const [, status, route, viewport, state, diagnostic] = match;
    const key = JSON.stringify([status, diagnostic]);
    let group = groups.get(key);
    if (!group) {
      group = { status, diagnostic, measurements: [] };
      groups.set(key, group);
      result.push(group);
    }
    group.measurements.push([route, viewport, state]);
  }
  return result;
}

/**
 * @param {{
 *   model?: string,
 *   referenceDna?: Record<string, any>,
 *   referenceDossier?: Record<string, any>,
 *   findings?: any[],
 *   files?: {experience?: string, styles?: string, motion?: string},
 *   screenshots?: string[],
 *   comparisonScreenshots?: Array<{candidateId: string, viewport: string, path: string}>,
 *   contentManifest?: Record<string, any>,
 *   creativeSession?: Record<string, any> | null,
 *   creativeRepairScope?: Record<string, any> | null,
 *   logger?: (message: string) => void,
 * }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function requestRepair({
  model,
  referenceDna,
  referenceDossier,
  findings,
  files,
  screenshots,
  comparisonScreenshots = [],
  contentManifest = {},
  creativeSession = null,
  creativeRepairScope = null,
  logger = console.log,
}) {
  const humanReview = (findings || []).some(
    (finding) =>
      finding &&
      typeof finding === "object" &&
      finding.category === "human-review-feedback",
  );
  if (
    humanReview &&
    (!creativeRepairScope ||
      creativeRepairScope.version !== 1 ||
      !Array.isArray(creativeRepairScope.sectionIds) ||
      creativeRepairScope.sectionIds.length === 0)
  )
    throw new Error(
      "Manual creative repair requires a resolved, non-empty section scope.",
    );
  const scopedHumanRepair = humanReview;
  const motionRepair = hasFinding(findings || [], MOTION_FINDING_PATTERN);
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
    return REFERENCE_MISMATCH_PATTERN.test(detail);
  });
  const repairInstruction = scopedHumanRepair
    ? "Make the smallest safe source edit that satisfies the explicit human review request only inside the resolved section scope. Do not change unrelated sections, section order, global CSS, sealed content, factual claims, contact behavior, or the assigned Reference DNA outside that scope. Do not convert this candidate into a legacy renderer."
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
  const visualBrief = contentManifest?.visualBrief || {};
  const referenceContext = [
    {
      type: "text",
      text: `ASSIGNED REFERENCE DNA
${JSON.stringify(stableReferenceDna, null, 2)}

ASSIGNED REFERENCE DOSSIER
${referenceDossierPromptBlock(referenceDossier) || "No dossier prompt was attached; use the measured Reference DNA and screenshots without inferring missing evidence."}

SEALED CONTENT TOKENS
${contentTokens.join("\n") || "(not supplied)"}

CURRENT SEALED CONTENT SHAPE
${formatModelBoundContentShape(contentShape)}

CLIENT VISUAL BRIEF
${JSON.stringify(visualBrief, null, 2)}
Preserve this client art direction during repair. Do not repair toward a generic LaunchLoom house style or overwrite an explicit light/dark, palette, composition, or named-reference request unless a measured finding requires that exact change.

${CLIENT_PALETTE_ROLE_CONTRACT}

${CLIENT_TYPOGRAPHY_CONTRACT}

${REFERENCE_PROVENANCE_OUTPUT_CONTRACT}

${EARLY_CONVERSION_OUTPUT_CONTRACT}

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
      referenceContext.push({
        type: "text",
        text: `Assigned reference evidence (${dimensions}). Its capture height may span multiple page sections and is not a browser viewport height. Reference DNA section-height fractions must not be used directly as CSS vh. The desktop header and complete hero must fit within 1536x864.`,
      });
      referenceContext.push(await imagePart(resolved, { detail: "high" }));
    } catch (cause) {
      throw new ReferenceEvidenceError(
        `Creative repair cannot load required reference evidence: ${record.path || record.absolutePath}`,
        { cause },
      );
    }
  }

  const structuralChecklist = referenceImplementationChecklist(referenceDna);

  referenceContext.push(
    promptCachedText(
      model,
      "End reusable assigned reference evidence. Repair-specific findings and current source follow.",
    ),
  );
  const candidateEvidence = [];
  for (const screenshot of screenshots.slice(0, 3)) {
    const dimensions = await imageSizeLabel(screenshot);
    const viewportCapture = /-viewport\.png$/u.test(screenshot);
    candidateEvidence.push({
      type: "text",
      text: viewportCapture
        ? `Current candidate first browser viewport (${dimensions}). Judge hero geometry, typography, and mobile recomposition at this scale.`
        : `Current candidate full-page overview (${dimensions}). Use it for section rhythm, not to infer browser-scale typography or hero height.`,
    });
    candidateEvidence.push(await imagePart(screenshot, {
      detail: viewportCapture ? "high" : "low",
      ...(viewportCapture ? {} : { fit: "page" }),
    }));
  }

  for (const comparison of comparisonScreenshots.slice(0, 2)) {
    if (
      !comparison ||
      typeof comparison.candidateId !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,79}$/iu.test(comparison.candidateId) ||
      !["desktop", "mobile"].includes(comparison.viewport) ||
      typeof comparison.path !== "string" ||
      !path.isAbsolute(comparison.path)
    )
      throw new Error(
        "Creative repair received invalid sibling screenshot evidence.",
      );
    try {
      await fs.access(comparison.path);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const dimensions = await imageSizeLabel(comparison.path);
    candidateEvidence.push({
      type: "text",
      text: `Sibling candidate ${comparison.candidateId} ${comparison.viewport} first viewport (${dimensions}). Comparison-only visual evidence. Do not copy its layout or style; preserve this candidate's assigned Reference DNA and use the comparison only to avoid visual convergence.`,
    });
    candidateEvidence.push(await imagePart(comparison.path, { detail: "high" }));
  }

  const sourcePrompt = (currentFiles, { editsOnly = false, targetFile = null } = {}) => {
    const editableNames = [
      ...REPAIR_FILE_ORDER,
      ...(scopedHumanRepair
        ? []
        : REPAIR_INNER_PAGE_KEYS.filter(
            (key) =>
              typeof currentFiles[key] === "string" && currentFiles[key].trim(),
          )),
    ];
    return `${repairInstruction}


${scopedHumanRepair ? `RESOLVED SECTION SCOPE\n${JSON.stringify(creativeRepairScope, null, 2)}\nOnly these section IDs may change.` : ""}

FINDINGS
${JSON.stringify(modelBoundRepairFindings(findings))}
Contrast objects losslessly group an identical diagnostic across measurements. Each measurements tuple is [route, viewport, interaction state]; every tuple is a measured blocker and must be addressed. The diagnostic retains its exact selector, text, ratio/required minimum, paint and unresolved causes. Full authoritative check reports remain in the private candidate evidence.

CURRENT EXPERIENCE.JSX
${currentFiles.experience}

CURRENT STYLES.CSS
${currentFiles.styles}

CURRENT MOTION.JS
${currentFiles.motion}
${
  currentFiles.servicePage ||
  currentFiles.locationPage ||
  currentFiles.servicesIndexPage
    ? `\nADDITIONAL AUTHORED PAGES\n${[
        currentFiles.servicePage
          ? `CURRENT SERVICEPAGE.JSX\n${currentFiles.servicePage}`
          : "",
        currentFiles.locationPage
          ? `CURRENT LOCATIONPAGE.JSX\n${currentFiles.locationPage}`
          : "",
        currentFiles.servicesIndexPage
          ? `CURRENT SERVICESINDEXPAGE.JSX\n${currentFiles.servicesIndexPage}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")}\n\nThese pages render the service detail, location detail, and services index routes as additional pages of the same visual system. Findings that name a service-page, location-page, or services-index-page issue must be repaired in that page's own source, not by breaking shared classes or markers. Keep every data-* page marker, the single shared LeadForm on each page, the /services/ links, and their class hooks working. When you change styles.css, keep those page selectors styled.`
    : ""
}

SOURCE SAFETY CONTRACT
Experience.jsx is markup and className hooks only. Do not add style attributes or style props to Experience.jsx, including React style={{...}}, style variables, or spreads that supply a style prop. Do not add <style> elements or inline visual rules. Use className hooks in JSX and put all visual declarations in styles.css. When changing appearance, update the matching CSS selector and its Experience.jsx className hook; keep behavior in motion.js and do not use it to inject visual declarations into markup.

REQUIRED STRUCTURAL CHECKLIST
${structuralChecklist}
Keep each required ID and section marker on its semantically matching visible section, in the exact specified DOM order, while making the requested repair. Do not remove or rename them.

ALT-TEXT CONTRACT
Every <img> must have a usable alt attribute. Use concise descriptive alt text for informative images. Use alt="" only when the image is purely decorative or its relevant information is fully conveyed by adjacent text. Preserve the reviewed description when reusing a known informative image, even if its crop or position changes. Do not replace an informative description with generic filler such as "Decorative image".

IMAGE ROLE DIVERSITY CONTRACT
Do not silently reuse the primary hero image to fill missing secondary or tertiary image roles. If supporting image tokens are unavailable, keep the hero unique and adapt those chapters to a non-duplicative text-led or graphic treatment that still preserves the assigned Reference DNA. Do not manufacture a feature pair, gallery, strip, or triptych by cropping the same source repeatedly.

CLIENT-REQUESTED INTERACTION CONTRACT
If the CLIENT VISUAL BRIEF explicitly asks for a purposeful interaction, guide, selector, chooser, or navigator, preserve or add a clearly labeled stateful native interaction marked with data-purposeful-interaction. Its useful default state and controls must be visible in static render evidence. FAQ disclosure, LeadForm, ChatLauncher, ordinary navigation, or an image carousel alone do not satisfy that request. Use only sealed service and decision-support content and never invent advice.

SEALED CONTENT BINDING CONTRACT
Treat every business-specific string and fact shown in CURRENT SEALED CONTENT SHAPE as sealed data, not source copy. Do not copy, paraphrase, or hardcode those values into JSX/HTML, CSS generated content, accessibility attributes, or motion code. Preserve existing content-token expressions and render business content through the existing content bindings or the supplied content-bound runtime helpers. Never replace a content binding with a literal value from the sealed shape. If a requested repair cannot be made while preserving those bindings, leave the binding intact and report the repair as unresolved rather than inventing or embedding copy.

${
  motionRepair
    ? `MOTION REPAIR CONTRACT
Treat motion.js as behavior-only. Never use motion code to add, remove, or change visitor-facing text, JSX/HTML, DOM structure, headings, labels, buttons, links, or accessibility copy. Use only existing selectors and DOM hooks. Do not use innerHTML, textContent, insertAdjacentHTML, or create new content nodes. If the motion needs a missing structural hook, leave the motion repair unresolved instead of changing the page markup. Changes to markup for a separate, explicit non-motion finding must stay in Experience.jsx and must not be implemented by motion code.
Keep CURRENT EXPERIENCE.JSX byte-for-byte unchanged when the findings request only a motion change.
Every motion sequence must respect reduced-motion preferences: check runtime?.reducedMotion and matchMedia("(prefers-reduced-motion: reduce)") before starting, keep a still equivalent with all content and controls usable when reduced motion is active, and cancel/revert active timelines or scroll effects when the preference changes. Clean up listeners, observers, timelines, and timers when the experience unmounts.`
    : ""
}

${
  scopedHumanRepair || editsOnly
    ? `Return JSON with an "edits" array only, never complete files. Each edit must name one of ${editableNames.join(", ")}; its exact "find" fragment must occur once; its "replace" is the smallest correction that addresses a supplied finding. Return 1-12 edits, each fragment at most 6000 characters, total find-plus-replace text at most 24000 characters. Change only files and source regions needed for the measured findings. An empty edit list means the request cannot be safely fulfilled and must fail closed.`
    : targetFile
      ? `Return JSON with file="${targetFile}" and source containing the complete replacement for that file only. Keep every other candidate file unchanged and preserve all source-safety, sealed-content, and Reference DNA contracts.`
      : "Return complete files required by the response schema and no unrelated explanation. Return the complete corrected source for any authored page named in the findings in its matching response field, and return an empty string for authored pages that should stay unchanged."

} Keep required reference signatures and safety/content contracts unless the explicit repair requires a safe visual rearrangement; never remove required host instrumentation or sealed token bindings. Do not add remote URLs, hardcoded business facts, or em dashes.`;
  };

  const buildRepairContent = (
    currentFiles,
    { targetFile = null, editsOnly = false } = {},
  ) => {
    const requestContent = [
      ...referenceContext,
      ...candidateEvidence,
      {
        type: "text",
        text: sourcePrompt(currentFiles, { targetFile, editsOnly }),
      },
    ];
    if (editsOnly)
      requestContent.push({
        type: "text",
        text: `LARGE-CANDIDATE REPAIR MODE
Return only the bounded literal edit set described above. Use exact, unique source fragments from the CURRENT authored sources shown above, including the additional authored pages when present. Do not re-emit complete files. Keep each edit in the file it names, preserve unaffected source byte-for-byte, and make focused changes for the supplied findings while preserving the assigned reference, sealed content bindings, required markers, and safety contract.`,

      });
    if (targetFile)
      requestContent.push({
        type: "text",
        text: `LARGE-CANDIDATE FILE-SCOPED REPAIR MODE
TARGET CANDIDATE FILE: ${targetFile}
Return a complete replacement for only this requested file. Keep source non-empty, at most ${MAX_REPAIR_FILE_SOURCE_CHARS} characters, and free of inline image data. All other files remain immutable; the combined bundle must pass source validation, rebuild, and rendered gates.`,
      });
    assertModelPromptTextBudget(requestContent);
    return requestContent;
  };

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
  const requestModelRepair = async (
    currentFiles,
    { targetFile = null, editsOnly = false } = {},
  ) => {
    const requestContent = buildRepairContent(currentFiles, { targetFile, editsOnly });
    const sendRepairRequest = (maxCompletionTokens) =>
      openRouterChatCompletion({
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
          response_format: {
            type: "json_schema",
            json_schema:
              scopedHumanRepair || editsOnly
                ? repairEditSchemaFor(currentFiles, {
                    includeInnerPages: !scopedHumanRepair,
                  })
                : targetFile ? REPAIR_FILE_SCHEMA : repairSchemaFor(currentFiles),

          },
          ...completionLimitRequestField(maxCompletionTokens),
          messages: [
            {
              role: "system",
              content:
                "Return JSON only. You are repairing your own production frontend against screenshot-level evidence.",
            },
            { role: "user", content: requestContent },
          ],
        },
      });

    let maxCompletionTokens = CREATIVE_REPAIR_MAX_COMPLETION_TOKENS;
    let response = await sendRepairRequest(maxCompletionTokens);
    let payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryLimit = affordableRepairRetryLimit(
        response.status,
        payload,
        maxCompletionTokens,
      );
      if (retryLimit) {
        logger(
          `creative_repair_retry reason=provider-affordability requested_max_completion_tokens=${maxCompletionTokens} retry_max_completion_tokens=${retryLimit}`,
        );
        maxCompletionTokens = retryLimit;
        response = await sendRepairRequest(maxCompletionTokens);
        payload = await response.json().catch(() => ({}));
      }
    }
    if (!response.ok)
      throw new Error(
        `OpenRouter creative repair failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
      );
    logOpenRouterCacheUsage("creative-repair", payload.usage);
    const responseContent = payload.choices?.[0]?.message?.content || "";
    const diagnostics = authoringCompletionDiagnostics({
      stage: "creative-repair",
      routeId: "repair",
      maxTokens: maxCompletionTokens,
      payload,
      content: responseContent,
    });
    const diagnosticText = formatAuthoringCompletionDiagnostics(diagnostics);
    logger(
      `creative_completion stage=creative-repair ${diagnosticText}${scopedHumanRepair ? " mode=bounded-edits" : targetFile ? ` mode=file-replacement file=${targetFile}` : ""}`,
    );
    try {
      if (["length", "max_tokens"].includes(diagnostics.finishReason))
        throw repairOutputRejection(
          `Creative repair response was truncated (${diagnosticText}).`,
        );
      let parsed;
      try {
        parsed = parseModelJson(responseContent);
      } catch (cause) {
        throw repairOutputRejection(
          `Creative repair response was malformed (${diagnosticText}).`,
          new Error("Model JSON parsing failed."),
        );
      }
      if (scopedHumanRepair || editsOnly) {
        if (!isRepairEditSet(parsed))
          throw repairOutputRejection(
            "Human creative repair must return bounded literal edits, not complete files.",
          );
        applyCreativeRepairEdits(currentFiles, parsed.edits, { allowInnerPages: !scopedHumanRepair });
        return rememberPrivateRepairOutput(parsed, responseContent);
      }
      if (targetFile) {
        const source = validateCandidateFileReplacement(
          parsed,
          targetFile,
        );
        return rememberPrivateRepairOutput({ ...currentFiles, [targetFile]: source }, responseContent);
      }
      return rememberPrivateRepairOutput(parsed, responseContent);
    } catch (error) {
      rememberPrivateRepairOutput(error, responseContent);
      if (error?.repairRejectionSummary) logger(JSON.stringify({ event: "creative_repair_output_rejected", summary: error.repairRejectionSummary }));
      throw error;
    }
  };

  const sourceChars = [...REPAIR_FILE_ORDER, ...REPAIR_INNER_PAGE_KEYS].reduce(
    (total, file) => total + String(files?.[file] || "").length,
    0,
  );
  if (scopedHumanRepair) return requestModelRepair(files);
  if (sourceChars <= REPAIR_SOURCE_EDIT_THRESHOLD_CHARS)
    return requestModelRepair(files);
  // Preserve bounded candidate-specific edits for authored inner pages.
  if (REPAIR_INNER_PAGE_KEYS.some((key) => typeof files[key] === "string" && files[key].trim())) {
    const repair = await requestModelRepair(files, { editsOnly: true });
    // Automatic callers validate a complete bundle. Resolve the bounded patch
    // against the exact sources before handing it to either repair runner.
    return inheritRepairRejectionEvidence(applyCreativeRepairEdits(files, repair.edits), repair);
  }
  let currentFiles = { ...files };
  for (const targetFile of repairTargetFiles(findings)) {
    if (String(currentFiles[targetFile] || "").length > MAX_REPAIR_FILE_SOURCE_CHARS)
      throw repairOutputRejection(
        `Large creative repair cannot replace ${targetFile}: current source exceeds ${MAX_REPAIR_FILE_SOURCE_CHARS} characters.`,
      );
    currentFiles = await requestModelRepair(currentFiles, { targetFile });
  }
  return currentFiles;
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
  const [
    experience,
    styles,
    motion,
    servicePage,
    locationPage,
    servicesIndexPage,
  ] = await Promise.all([
    fs.readFile(path.join(candidateDir, "Experience.jsx"), "utf8"),
    fs.readFile(path.join(candidateDir, "styles.css"), "utf8"),
    fs.readFile(path.join(candidateDir, "motion.js"), "utf8"),
    fs
      .readFile(path.join(candidateDir, "ServicePage.jsx"), "utf8")
      .catch(() => ""),
    fs
      .readFile(path.join(candidateDir, "LocationPage.jsx"), "utf8")
      .catch(() => ""),
    fs
      .readFile(path.join(candidateDir, "ServicesIndexPage.jsx"), "utf8")
      .catch(() => ""),
  ]);
  const files = {
    experience,
    styles,
    motion,
    ...(servicePage.trim() ? { servicePage } : {}),
    ...(locationPage.trim() ? { locationPage } : {}),
    ...(servicesIndexPage.trim() ? { servicesIndexPage } : {}),
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
    referenceDossier:
      metadata.creativeManifest?.referenceDossier || metadata.referenceDossier,
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
    for (const [key, file] of [
      ["servicePage", "ServicePage.jsx"],
      ["locationPage", "LocationPage.jsx"],
      ["servicesIndexPage", "ServicesIndexPage.jsx"],
    ])
      if (typeof result.files[key] === "string" && result.files[key].trim())
        await fs.writeFile(
          path.join(candidateDir, file),
          `${result.files[key].trim()}\n`,
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
