import fs from "node:fs/promises";
import path from "node:path";
import {
  VISUAL_GATE_MODEL,
  applySafeVisualOperations,
  blockingFindings,
  buildSafeVisualManifest,
  parseVisualAuditChoice,
  shouldFailVisualPlan,
} from "./visual-quality-gate-lib.mjs";
import {
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]]
          : pairs,
      [],
    ),
);
const mode = args.mode === "verify" ? "verify" : "plan";
const configPath = path.resolve(args.config || "src/site.config.json");
const screenshotsDir = path.resolve(
  args.screenshots || "artifacts/screenshots",
);
const reportPath = path.resolve(
  args.report || path.join(screenshotsDir, `visual-gate-${mode}.json`),
);
const model = args.model || VISUAL_GATE_MODEL;

if (!process.env.OPENROUTER_API_KEY)
  throw new Error(
    "OPENROUTER_API_KEY is required for the visual quality gate.",
  );

const auditSchema = {
  name: "launchloom_visual_quality_gate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "verdict", "findings", "operations"],
    properties: {
      summary: { type: "string", maxLength: 500 },
      verdict: { type: "string", enum: ["pass", "revise", "block"] },
      findings: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "category",
            "severity",
            "viewport",
            "evidence",
            "recommendation",
          ],
          properties: {
            category: {
              type: "string",
              enum: [
                "content-integrity",
                "industry-fit",
                "imagery",
                "hierarchy",
                "conversion",
                "distinctiveness",
                "responsive-layout",
                "accessibility",
              ],
            },
            severity: { type: "string", enum: ["critical", "major", "minor"] },
            viewport: { type: "string", enum: ["desktop", "compact", "mobile", "both"] },
            evidence: { type: "string", maxLength: 320 },
            recommendation: { type: "string", maxLength: 400 },
          },
        },
      },
      operations: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "sectionType",
            "variant",
            "relativeTo",
            "position",
            "density",
            "typography",
          ],
          properties: {
            kind: {
              type: "string",
              enum: [
                "set_section_variant",
                "reorder_section",
                "set_design_treatment",
              ],
            },
            sectionType: { type: "string" },
            variant: { type: "string" },
            relativeTo: { type: "string" },
            position: { type: "string", enum: ["", "before", "after"] },
            density: {
              type: "string",
              enum: ["", "compact", "balanced", "spacious"],
            },
            typography: {
              type: "string",
              enum: ["", "editorial", "sans", "strong"],
            },
          },
        },
      },
    },
  },
};

async function imagePart(file) {
  const data = await fs.readFile(file);
  const extension = path.extname(file).toLowerCase();
  const mime = extension === ".png" ? "image/png" : "image/jpeg";
  return {
    type: "image_url",
    image_url: { url: `data:${mime};base64,${data.toString("base64")}` },
  };
}

async function requestAudit(manifest) {
  const screenshots = ["desktop.png", "compact.png", "mobile.png"];
  const missing = [];
  for (const file of screenshots) {
    try {
      await fs.access(path.join(screenshotsDir, file));
    } catch {
      missing.push(file);
    }
  }
  const requiredMissing = missing.filter((file) => file !== "compact.png");
  if (requiredMissing.length)
    throw new Error(`Missing visual gate screenshots: ${requiredMissing.join(", ")}`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const sessionId = openRouterSessionId("visual-quality-gate", model, {
        business: manifest.business?.name || manifest.brand?.name || "",
        address: manifest.business?.address || manifest.brand?.address || "",
      });
      const response = await openRouterChatCompletion({
        title: "LaunchLoom visual quality gate",
        signal: controller.signal,
        sessionId,
        responseCache: true,
        responseCacheTtlSeconds: 900,
        body: {
            model,
            temperature: 0,
            max_completion_tokens: [6000, 9000, 12000][attempt - 1],
            reasoning_effort: "low",
            provider: { require_parameters: true },
            response_format: { type: "json_schema", json_schema: auditSchema },
            messages: [
              {
                role: "system",
                content:
                  "You are LaunchLoom's strict pre-deployment visual QA gate. Inspect the complete desktop and mobile screenshots against the supplied public-content manifest. Only design.requiredSections are mandatory. design.optionalSections may be absent when verified content is unavailable. When design.renderer.type is experience-pack or creative-candidate, judge its declared navigation, hero, conversion, services, proof, closing, family, and fingerprint instead of inferring a legacy variant from other fields, and return operations as an empty array. Only report actual defects that require a change. Never put compliments, confirmations, or the absence of a problem in findings; a passing audit should normally return findings as an empty array. Critical means content is visibly corrupted or clipped, industry language or imagery is clearly unrelated, a primary action is unusable or obscured, horizontal overflow breaks the page, or a required public section is absent. Generic composition, decorative numbering without sequence meaning, weak distinctiveness, repeated template grammar, and visibly overlong hero or card copy are major, not critical. Any major finding requires verdict revise or block; verdict pass is reserved for zero critical and zero major findings. Never invent business facts. Recommend at most three safe layout operations for legacy pages only. A creative candidate must be repaired or rejected by its authoring stage, never structurally rewritten into a shared template. For unused operation fields return empty strings. In verify mode return no operations. Do not use em dashes.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Public manifest: ${JSON.stringify(manifest)}\nConfirm visible content integrity, industry fit, contextual imagery, conversion clarity, hierarchy, distinctiveness, and mobile layout.`,
                  },
                  {
                    type: "text",
                    text: `Mode: ${mode}. In plan mode suggest only bounded layout corrections. In verify mode judge the rebuilt result and return operations as an empty array.`,
                  },
                  { type: "text", text: "Desktop screenshot:" },
                  await imagePart(path.join(screenshotsDir, "desktop.png")),
                  ...(missing.includes("compact.png") ? [] : [{ type: "text", text: "Compact desktop screenshot:" }, await imagePart(path.join(screenshotsDir, "compact.png"))]),
                  { type: "text", text: "Mobile screenshot:" },
                  await imagePart(path.join(screenshotsDir, "mobile.png")),
                ],
              },
            ],
          },
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          `OpenRouter visual audit failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      const audit = parseVisualAuditChoice(payload?.choices?.[0]);
      const cache = logOpenRouterCacheUsage("visual-quality-gate", payload.usage);
      return {
        audit,
        usage: payload.usage || null,
        cache,
        sessionId,
        provider: payload.provider || null,
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

const startedAt = Date.now();
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const manifest = buildSafeVisualManifest(config);
let result;
try {
  result = await requestAudit(manifest);
} catch (error) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({ version: 1, mode, model, status: "error", durationMs: Date.now() - startedAt, error: String(error?.message || error) }, null, 2)}\n`,
  );
  throw error;
}
const appliedOperations =
  mode === "plan"
    ? applySafeVisualOperations(config, result.audit.operations)
    : [];
const blockers = blockingFindings(result.audit, {
  includeMajor:
    mode === "verify" && manifest.design?.renderer?.type === "creative-candidate",
});
if (appliedOperations.length)
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
const report = {
  version: 1,
  mode,
  model,
  durationMs: Date.now() - startedAt,
  changed: appliedOperations.length > 0,
  appliedOperations,
  blockers,
  audit: result.audit,
  usage: result.usage,
  cache: result.cache,
  sessionId: result.sessionId,
  provider: result.provider,
  attempt: result.attempt,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    changed: report.changed,
    verdict: result.audit.verdict,
    blockers: blockers.length,
    report: reportPath,
  }),
);
if (
  mode === "verify" &&
  (blockers.length || result.audit.verdict === "block")
) {
  throw new Error(
    `GLM visual gate blocked deployment with ${blockers.length} critical finding(s). See ${reportPath}.`,
  );
}
if (mode === "plan" && shouldFailVisualPlan({
  rendererType: manifest.design?.renderer?.type,
  appliedOperations,
  blockers,
  verdict: result.audit.verdict,
})) {
  throw new Error(
    `GLM visual gate found a critical defect with no safe automatic correction. See ${reportPath}.`,
  );
}
