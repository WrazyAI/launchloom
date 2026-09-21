import fs from "node:fs/promises";
import {
  logOpenRouterCacheUsage,
  logOpenRouterResponseCacheUsage,
  openRouterChatCompletion,
  openRouterSessionId,
} from "./openrouter-client.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

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

const fixturesPath = path.resolve(
  args.fixtures || "fixtures/visual-model-evaluation.json",
);
const outputDir = path.resolve(args.out || "artifacts/visual-model-evaluation");
const models = (
  args.models || "z-ai/glm-5.3-flash,qwen/qwen3.6-27b,moonshotai/kimi-k2.6"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const repeatCount = Math.max(1, Math.min(5, Number(args.repeats) || 1));
const fixtureIds = new Set(
  String(args.only || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
const fixtures = JSON.parse(await fs.readFile(fixturesPath, "utf8")).filter(
  (fixture) => !fixtureIds.size || fixtureIds.has(fixture.id),
);

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required for the visual evaluation.");
}

const auditSchema = {
  name: "launchloom_visual_audit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "strengths", "issues", "scores", "verdict"],
    properties: {
      summary: { type: "string", maxLength: 500 },
      strengths: {
        type: "array",
        maxItems: 5,
        items: { type: "string", maxLength: 240 },
      },
      issues: {
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
                "hierarchy",
                "content-integrity",
                "industry-fit",
                "imagery",
                "conversion",
                "distinctiveness",
                "responsive-layout",
                "accessibility",
              ],
            },
            severity: {
              type: "string",
              enum: ["critical", "major", "minor"],
            },
            viewport: {
              type: "string",
              enum: ["desktop", "mobile", "both"],
            },
            evidence: { type: "string", maxLength: 300 },
            recommendation: { type: "string", maxLength: 400 },
          },
        },
      },
      scores: {
        type: "object",
        additionalProperties: false,
        required: [
          "hierarchy",
          "industryFit",
          "imageryRelevance",
          "conversionClarity",
          "distinctiveness",
          "responsiveQuality",
          "contentIntegrity",
        ],
        properties: Object.fromEntries(
          [
            "hierarchy",
            "industryFit",
            "imageryRelevance",
            "conversionClarity",
            "distinctiveness",
            "responsiveQuality",
            "contentIntegrity",
          ].map((key) => [key, { type: "integer", minimum: 1, maximum: 5 }]),
        ),
      },
      verdict: {
        type: "string",
        enum: ["pass", "revise", "major-rework"],
      },
    },
  },
};

function parseJson(value) {
  return JSON.parse(
    String(value || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}

async function imagePart(file) {
  const data = await fs.readFile(file);
  return {
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${data.toString("base64")}` },
  };
}

async function captureFixture(browser, fixture) {
  const fixtureDir = path.join(outputDir, "screenshots", fixture.id);
  await fs.mkdir(fixtureDir, { recursive: true });
  const captures = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await page.goto(fixture.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(1_500);
    const file = path.join(fixtureDir, `${viewport.name}.jpg`);
    await page.screenshot({
      path: file,
      type: "jpeg",
      quality: 72,
      fullPage: true,
    });
    const bytes = await fs.readFile(file);
    captures.push({
      ...viewport,
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await page.close();
  }
  return captures;
}

async function audit(model, fixture, captures) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const sessionId = openRouterSessionId(
      "visual-model-eval",
      model,
      fixture.id || fixture.name,
    );
    const response = await openRouterChatCompletion({
      title: "LaunchLoom visual model bakeoff",
      signal: controller.signal,
      sessionId,
      responseCache: true,
      responseCacheTtlSeconds: 3600,
      body: {
          model,
          temperature: 0.1,
          max_tokens: 5_000,
          reasoning: { max_tokens: 1_000, exclude: true },
          provider: { require_parameters: true },
          response_format: {
            type: "json_schema",
            json_schema: auditSchema,
          },
          messages: [
            {
              role: "system",
              content:
                "You are a strict visual QA reviewer for conversion-focused local-business websites. Inspect only visible evidence in the supplied desktop and mobile screenshots. Identify concrete defects before offering stylistic opinions. Do not invent business facts, credentials, reviews, results, prices, or missing content. Treat unrelated industry language, mismatched service copy, clipped sentences, obstructive overlays, and requested artifacts that are hard to find as serious issues. Reward clear hierarchy, contextual imagery, distinctive composition, readable mobile layout, and an obvious next action. Return only the required JSON.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Audit ${fixture.name}, a ${fixture.industry} website. Compare desktop and mobile. These are evaluator focus areas, not guaranteed findings: ${fixture.reviewFocus.join("; ")}. Cite visible evidence for every issue. A page can be attractive and still fail content integrity or conversion clarity.`,
                },
                { type: "text", text: "Desktop screenshot:" },
                await imagePart(captures[0].file),
                { type: "text", text: "Mobile screenshot:" },
                await imagePart(captures[1].file),
              ],
            },
          ],
        },
    });
    const responseCache = logOpenRouterResponseCacheUsage(
      "visual-model-eval",
      response,
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `OpenRouter ${response.status}: ${JSON.stringify(body).slice(0, 500)}`,
      );
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content)
      return {
        ok: false,
        model,
        durationMs: Date.now() - startedAt,
        usage: body.usage || null,
        error: `OpenRouter returned no audit content (finish_reason=${body.choices?.[0]?.finish_reason || "unknown"}, reasoning_tokens=${body.usage?.completion_tokens_details?.reasoning_tokens || 0}).`,
      };
    const cache = logOpenRouterCacheUsage(
      "visual-model-eval",
      body.usage,
    );
    return {
      ok: true,
      model,
      durationMs: Date.now() - startedAt,
      usage: body.usage || null,
      cache,
      responseCache,
      sessionId,
      audit: parseJson(content),
    };
  } catch (error) {
    return {
      ok: false,
      model,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const fixture of fixtures) {
    const captures = await captureFixture(browser, fixture);
    const audits = [];
    for (let run = 1; run <= repeatCount; run += 1) {
      const runAudits = await Promise.all(
        models.map((model) => audit(model, fixture, captures)),
      );
      audits.push(...runAudits.map((result) => ({ ...result, run })));
    }
    results.push({ fixture, captures, audits });
    console.log(
      `visual_fixture_complete=${fixture.id} successful_models=${audits.filter((item) => item.ok).length}`,
    );
  }
} finally {
  await browser.close();
}

const artifact = {
  generatedAt: new Date().toISOString(),
  fixturesPath,
  models,
  repeatCount,
  results,
};
await fs.writeFile(
  path.join(outputDir, "results.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
console.log(`visual_model_evaluation_written=${outputDir}`);
