import fs from "node:fs/promises";
import path from "node:path";
import {
  VISUAL_GATE_MODEL,
  applySafeVisualOperations,
  blockingFindings,
  buildSafeVisualManifest,
  validateVisualAudit,
} from "./visual-quality-gate-lib.mjs";

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
            viewport: { type: "string", enum: ["desktop", "mobile", "both"] },
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

function jsonFromModel(value) {
  return JSON.parse(
    String(value || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}

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
  const screenshots = ["desktop.png", "mobile.png"];
  const missing = [];
  for (const file of screenshots) {
    try {
      await fs.access(path.join(screenshotsDir, file));
    } catch {
      missing.push(file);
    }
  }
  if (missing.length)
    throw new Error(`Missing visual gate screenshots: ${missing.join(", ")}`);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "LaunchLoom visual quality gate",
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 4000,
            reasoning_effort: "low",
            provider: { require_parameters: true },
            response_format: { type: "json_schema", json_schema: auditSchema },
            messages: [
              {
                role: "system",
                content:
                  "You are LaunchLoom's strict pre-deployment visual QA gate. Inspect the complete desktop and mobile screenshots against the supplied public-content manifest. Only design.requiredSections are mandatory. design.optionalSections may be absent when verified content is unavailable. When design.renderer.type is experience-pack, judge its declared navigation, hero, conversion, services, proof, closing, and section order instead of inferring a legacy variant from other fields. Critical means content is visibly corrupted or clipped, industry language or imagery is clearly unrelated, a primary action is unusable or obscured, horizontal overflow breaks the page, or a required public section is absent. Generic composition, decorative numbering without sequence meaning, weak distinctiveness, and visibly overlong hero or card copy are major, not critical. Never invent business facts. Recommend at most three safe layout operations. A section variant must come from design.allowedVariants for that section type. For unused operation fields return empty strings. In verify mode return no operations. Do not use em dashes.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Mode: ${mode}. Public manifest: ${JSON.stringify(manifest)}\nConfirm visible content integrity, industry fit, contextual imagery, conversion clarity, hierarchy, distinctiveness, and mobile layout. In plan mode suggest only bounded layout corrections. In verify mode judge the rebuilt result and return operations as an empty array.`,
                  },
                  { type: "text", text: "Desktop screenshot:" },
                  await imagePart(path.join(screenshotsDir, "desktop.png")),
                  { type: "text", text: "Mobile screenshot:" },
                  await imagePart(path.join(screenshotsDir, "mobile.png")),
                ],
              },
            ],
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          `OpenRouter visual audit failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      const audit = validateVisualAudit(
        jsonFromModel(payload?.choices?.[0]?.message?.content),
      );
      return {
        audit,
        usage: payload.usage || null,
        provider: payload.provider || null,
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
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
const blockers = blockingFindings(result.audit);
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
if (
  mode === "plan" &&
  !appliedOperations.length &&
  (blockers.length || result.audit.verdict === "block")
) {
  throw new Error(
    `GLM visual gate found a critical defect with no safe automatic correction. See ${reportPath}.`,
  );
}
