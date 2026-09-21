import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  VISUAL_GATE_MODEL,
  buildSafeVisualManifest,
  parseVisualAuditContent,
} from "./visual-quality-gate-lib.mjs";

const auditSchema = {
  name: "launchloom_human_revision_gate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "verdict", "findings"],
    properties: {
      summary: { type: "string", maxLength: 500 },
      verdict: { type: "string", enum: ["pass", "revise", "block"] },
      findings: {
        type: "array",
        maxItems: 6,
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
                "requirement-mismatch",
                "visual-treatment",
                "feature-presence",
                "content-presentation",
                "responsive-layout",
              ],
            },
            severity: {
              type: "string",
              enum: ["critical", "major", "minor"],
            },
            viewport: {
              type: "string",
              enum: ["desktop", "compact", "mobile", "all"],
            },
            evidence: { type: "string", maxLength: 320 },
            recommendation: { type: "string", maxLength: 400 },
          },
        },
      },
    },
  },
};

export const HUMAN_REVISION_IMAGE_MAX_BYTES = 300_000;
export const HUMAN_REVISION_IMAGE_MAX_EDGE = 1280;

const HUMAN_REVISION_IMAGE_PROFILES = [
  { edge: 1280, quality: 78 },
  { edge: 1120, quality: 72 },
  { edge: 960, quality: 66 },
  { edge: 800, quality: 58 },
  { edge: 680, quality: 50 },
];

export async function imagePart(file) {
  let lastSize = 0;
  for (const profile of HUMAN_REVISION_IMAGE_PROFILES) {
    const data = await sharp(file)
      .rotate()
      .resize({
        width: profile.edge,
        height: profile.edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: profile.quality, effort: 4 })
      .toBuffer();
    lastSize = data.byteLength;
    if (lastSize <= HUMAN_REVISION_IMAGE_MAX_BYTES)
      return {
        type: "image_url",
        image_url: {
          url: `data:image/webp;base64,${data.toString("base64")}`,
        },
      };
  }
  throw new Error(
    `Human revision screenshot exceeds ${HUMAN_REVISION_IMAGE_MAX_BYTES} bytes after normalization: ${path.basename(file)} (${lastSize} bytes).`,
  );
}

function validateAudit(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !["pass", "revise", "block"].includes(value.verdict) ||
    !Array.isArray(value.findings)
  )
    throw new Error("Human revision audit returned an invalid result.");
  if (
    value.verdict === "pass" &&
    value.findings.some((finding) =>
      ["critical", "major"].includes(finding.severity),
    )
  )
    throw new Error(
      "Human revision audit cannot pass with critical or major findings.",
    );
  return value;
}

/**
 * @param {{
 *   configPath: string,
 *   screenshotsDir: string,
 *   feedback: string,
 *   reportPath?: string,
 *   model?: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export async function runHumanRevisionGate({
  configPath,
  screenshotsDir,
  feedback,
  reportPath,
  model = VISUAL_GATE_MODEL,
  fetchImpl = fetch,
} = {}) {
  const requestText = String(feedback || "").trim();
  if (!requestText)
    throw new Error("Human revision gate requires the triggering feedback.");
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error(
      "OPENROUTER_API_KEY is required for the human revision gate.",
    );

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const manifest = buildSafeVisualManifest(config);
  const structuredRevision = {
    stage: config.revisionReport?.stage || "",
    operations: config.revisionReport?.operations || [],
    results: config.revisionReport?.results || [],
  };
  const required = ["desktop.png", "mobile.png"];
  for (const file of required)
    await fs.access(path.join(screenshotsDir, file));
  const compactPath = path.join(screenshotsDir, "compact.png");
  const compactAvailable = await fs
    .access(compactPath)
    .then(() => true)
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });

  const userContent = [
    {
      type: "text",
      text: `TRIGGERING REVIEW REQUEST
${requestText}

PUBLIC SITE MANIFEST
${JSON.stringify(manifest)}

STRUCTURED REVISION RESULTS
${JSON.stringify(structuredRevision)}

Decide whether the rendered revision actually satisfies the triggering review request. Judge the request itself, not general aesthetics. A structured nonvisual operation may count as satisfied only when its structured result is fulfilled and the screenshots do not contradict it. For visual, layout, hierarchy, imagery, typography, feature-presence, or responsive requests, require visible screenshot evidence. If the request is only partially satisfied, return revise with a concrete repair recommendation. Return pass only when there are no critical or major request mismatches.`,
    },
    { type: "text", text: "Desktop screenshot:" },
    await imagePart(path.join(screenshotsDir, "desktop.png")),
    ...(compactAvailable
      ? [
          { type: "text", text: "Compact desktop screenshot:" },
          await imagePart(compactPath),
        ]
      : []),
    { type: "text", text: "Mobile screenshot:" },
    await imagePart(path.join(screenshotsDir, "mobile.png")),
  ];

  let lastError;
  let payload;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetchImpl(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "LaunchLoom human revision gate",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_completion_tokens: [5000, 7500, 10000][attempt - 1],
            reasoning_effort: "low",
            provider: { require_parameters: true },
            response_format: {
              type: "json_schema",
              json_schema: auditSchema,
            },
            messages: [
              {
                role: "system",
                content:
                  "You are LaunchLoom's strict human-revision acceptance gate. Verify whether the exact reviewer request is satisfied in the rendered website. Do not reward unrelated polish. Do not invent facts or requirements. Use screenshot evidence for visual claims and the structured revision result only for nonvisual configuration changes. A request that is visibly incomplete must be revised. Return findings only for actual remaining mismatches. Do not use em dashes.",
              },
              { role: "user", content: userContent },
            ],
          }),
        },
      );
      payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          `OpenRouter human revision audit failed (${response.status}): ${payload?.error?.message || "unknown error"}`,
        );
      const choice = payload?.choices?.[0];
      if (["length", "max_tokens"].includes(choice?.finish_reason))
        throw new Error(
          `Human revision audit was truncated (${choice.finish_reason}).`,
        );
      const audit = validateAudit(
        parseVisualAuditContent(choice?.message?.content || ""),
      );
      const report = {
        version: 1,
        model,
        feedback: requestText,
        audit,
        usage: payload.usage || null,
        provider: payload.provider || null,
        attempt,
      };
      if (reportPath) {
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(
          reportPath,
          `${JSON.stringify(report, null, 2)}\n`,
        );
      }
      return report;
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
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
  const feedback = args["feedback-file"]
    ? await fs.readFile(path.resolve(args["feedback-file"]), "utf8")
    : args.feedback || "";
  const report = await runHumanRevisionGate({
    configPath: path.resolve(args.config || "src/site.config.json"),
    screenshotsDir: path.resolve(args.screenshots || "artifacts/screenshots"),
    feedback,
    reportPath: path.resolve(
      args.report || "artifacts/human-revision-gate.json",
    ),
    model: args.model || VISUAL_GATE_MODEL,
  });
  console.log(
    JSON.stringify({
      verdict: report.audit.verdict,
      findings: report.audit.findings.length,
    }),
  );
  if (report.audit.verdict !== "pass")
    throw new Error(
      `Human revision gate requires another revision: ${report.audit.summary}`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
