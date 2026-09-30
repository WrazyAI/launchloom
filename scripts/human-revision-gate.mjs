import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  VISUAL_GATE_MODEL,
  buildSafeVisualManifest,
  parseVisualAuditContent,
} from "./visual-quality-gate-lib.mjs";
import {
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";

const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "severity", "viewport", "evidence", "recommendation"],
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
    severity: { type: "string", enum: ["critical", "major", "minor"] },
    viewport: {
      type: "string",
      enum: ["desktop", "compact", "mobile", "all"],
    },
    evidence: { type: "string", maxLength: 320 },
    recommendation: { type: "string", maxLength: 400 },
  },
};

const auditSchema = {
  name: "launchloom_human_revision_gate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "verdict", "feedbackResults"],
    properties: {
      summary: { type: "string", maxLength: 500 },
      verdict: { type: "string", enum: ["pass", "revise", "block"] },
      feedbackResults: {
        type: "array",
        maxItems: 24,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["feedbackIndex", "verdict", "evidence", "findings"],
          properties: {
            feedbackIndex: { type: "integer", minimum: 0 },
            verdict: { type: "string", enum: ["pass", "revise", "block"] },
            evidence: { type: "string", maxLength: 600 },
            findings: {
              type: "array",
              maxItems: 6,
              items: findingSchema,
            },
          },
        },
      },
    },
  },
};

export const HUMAN_REVISION_IMAGE_MAX_BYTES = 300_000;
export const HUMAN_REVISION_TOTAL_IMAGE_MAX_BYTES = 900_000;
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

function expectedFeedbackItems(config, requestText) {
  const revision = config.revisionReport || {};
  const results = Array.isArray(revision.results) ? revision.results : [];
  const scopedItems = Array.isArray(revision.creativeRepairScope?.feedbackItems)
    ? revision.creativeRepairScope.feedbackItems
    : [];
  const creativeResults = results.filter(
    (result) => result?.status === "creative",
  );
  const sourceItems = scopedItems.length
    ? scopedItems
    : creativeResults.length
      ? creativeResults
      : [{ feedbackIndex: 0, feedback: requestText }];
  const normalized = [];
  const seen = new Set();

  for (const item of sourceItems) {
    const feedbackIndex = item?.feedbackIndex;
    const feedback = String(item?.feedback || "").trim();
    if (!Number.isSafeInteger(feedbackIndex) || feedbackIndex < 0 || !feedback)
      throw new Error(
        "Human revision gate requires a valid feedback index and exact feedback text for every creative item.",
      );
    if (seen.has(feedbackIndex))
      throw new Error(
        `Human revision gate received duplicate feedback index ${feedbackIndex}.`,
      );
    seen.add(feedbackIndex);
    normalized.push({ feedbackIndex, feedback });
  }
  if (normalized.length > 24)
    throw new Error(
      "Human revision gate supports at most 24 creative feedback items per rendered audit.",
    );

  for (const result of creativeResults) {
    const index = result?.feedbackIndex;
    if (!Number.isSafeInteger(index) || !seen.has(index))
      throw new Error(
        "Human revision gate is missing exact feedback text for a creative feedback index.",
      );
    const scoped = normalized.find((item) => item.feedbackIndex === index);
    if (String(result.feedback || "").trim() !== scoped.feedback)
      throw new Error(
        `Human revision gate feedback scope does not match revision item ${index + 1}.`,
      );
  }
  return normalized.sort((a, b) => a.feedbackIndex - b.feedbackIndex);
}

function validateAudit(value, expectedItems, candidateId = "") {
  if (
    !value ||
    typeof value !== "object" ||
    !["pass", "revise", "block"].includes(value.verdict) ||
    !Array.isArray(value.feedbackResults)
  )
    throw new Error(
      "Human revision audit response is missing required feedbackResults for every creative feedback index.",
    );
  const expectedIndexes = new Set(
    expectedItems.map((item) => item.feedbackIndex),
  );
  const seen = new Set();
  const feedbackResults = value.feedbackResults.map((result) => {
    const index = result?.feedbackIndex;
    if (!Number.isSafeInteger(index) || !expectedIndexes.has(index))
      throw new Error(
        "Human revision audit returned an unexpected or invalid feedback index.",
      );
    if (seen.has(index))
      throw new Error(
        `Human revision audit returned duplicate evidence for feedback index ${index}.`,
      );
    seen.add(index);
    if (
      !["pass", "revise", "block"].includes(result?.verdict) ||
      typeof result?.evidence !== "string" ||
      !result.evidence.trim() ||
      !Array.isArray(result.findings)
    )
      throw new Error(
        `Human revision audit omitted evidence or a valid verdict for feedback index ${index}.`,
      );
    if (result.verdict !== "pass" && !result.findings.length)
      throw new Error(
        `Human revision audit must provide a concrete finding for feedback index ${index}.`,
      );
    if (
      result.verdict === "pass" &&
      result.findings.some((finding) =>
        ["critical", "major"].includes(finding.severity),
      )
    )
      throw new Error(
        `Human revision audit cannot pass feedback index ${index} with critical or major findings.`,
      );
    return {
      ...result,
      feedbackIndex: index,
      evidence: result.evidence.trim(),
      feedback: expectedItems.find((item) => item.feedbackIndex === index)
        .feedback,
      candidateId,
    };
  });
  if (seen.size !== expectedIndexes.size)
    throw new Error(
      "Human revision audit must return a separate result for every creative feedback index.",
    );
  const expectedVerdict = feedbackResults.some(
    (result) => result.verdict === "block",
  )
    ? "block"
    : feedbackResults.some((result) => result.verdict === "revise")
      ? "revise"
      : "pass";
  if (value.verdict !== expectedVerdict)
    throw new Error(
      "Human revision audit aggregate verdict does not match its per-feedback results.",
    );
  feedbackResults.sort((a, b) => a.feedbackIndex - b.feedbackIndex);
  return {
    summary: String(value.summary || "").slice(0, 500),
    verdict: expectedVerdict,
    feedbackResults,
    findings: feedbackResults.flatMap((result) =>
      result.findings.map((finding) => ({
        ...finding,
        feedbackIndex: result.feedbackIndex,
      })),
    ),
  };
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
  const feedbackItems = expectedFeedbackItems(config, requestText);
  const candidateId = String(
    config.design?.experience?.candidateId || "",
  ).trim();
  const required = ["desktop.png", "mobile.png"];
  for (const file of required) await fs.access(path.join(screenshotsDir, file));
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
      text: `TRIGGERING REVIEW REQUEST (may combine multiple items)
${requestText}

CREATIVE FEEDBACK ITEMS TO VERIFY INDEPENDENTLY
${JSON.stringify(feedbackItems)}

PUBLIC SITE MANIFEST
${JSON.stringify(manifest)}

STRUCTURED REVISION RESULTS
${JSON.stringify(structuredRevision)}

Judge every creative feedback item independently by its exact feedbackIndex. Return exactly one feedbackResults entry for every listed index and no others. Each entry must include a non-empty evidence sentence tied to what is visible in the provided desktop, compact, or mobile screenshots. Do not let one satisfied request compensate for another. Do not use an aggregate impression to mark the whole batch pass. Return pass for an item only when that specific request is visibly satisfied, or its structured result is fulfilled for a nonvisual request and the screenshots do not contradict it. Otherwise return revise with a concrete finding. The top-level verdict must be pass only if every item verdict is pass, revise if any item needs revision, and block if any item is blocked. Judge the request itself, not general aesthetics. Do not invent facts or requirements.`,
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

  const imagePayloadBytes = userContent.reduce((total, part) => {
    const url = part?.image_url?.url;
    if (!url) return total;
    const encoded = String(url).split(",", 2)[1] || "";
    return total + Buffer.byteLength(encoded, "base64");
  }, 0);
  if (imagePayloadBytes > HUMAN_REVISION_TOTAL_IMAGE_MAX_BYTES)
    throw new Error(
      `Human revision screenshot prompt exceeds ${HUMAN_REVISION_TOTAL_IMAGE_MAX_BYTES} bytes after normalization (${imagePayloadBytes} bytes).`,
    );

  const sessionId = openRouterSessionId("human-revision-gate", model, {
    businessName: config.business?.name || "",
    email: config.business?.email || "",
    phone: config.business?.phone || "",
    domain: config.business?.domain || "",
  });
  let lastError;
  let payload;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await openRouterChatCompletion({
        title: "LaunchLoom human revision gate",
        signal: controller.signal,
        sessionId,
        responseCache: true,
        responseCacheTtlSeconds: 900,
        fetchImpl,
        body: {
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
                "You are LaunchLoom's strict human-revision acceptance gate. Treat each feedbackIndex as a separate acceptance criterion. Return one independently judged result with concrete screenshot evidence per listed index; never infer that all items pass from an aggregate impression. Do not reward unrelated polish. Do not invent facts or requirements. Use screenshot evidence for visual claims and the structured revision result only for nonvisual configuration changes. A request that is visibly incomplete must be revised. Return only actual remaining mismatches. Do not use em dashes.",
            },
            { role: "user", content: userContent },
          ],
        },
      });
      const responseCache = logOpenRouterResponseCacheUsage(
        "human-revision-gate",
        response,
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
        feedbackItems,
        candidateId,
      );
      const cache = logOpenRouterCacheUsage(
        "human-revision-gate",
        payload.usage,
      );
      const report = {
        version: 1,
        model,
        feedback: requestText,
        audit,
        usage: payload.usage || null,
        cache,
        responseCache,
        sessionId,
        provider: payload.provider || null,
        attempt,
      };
      if (reportPath) {
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
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
