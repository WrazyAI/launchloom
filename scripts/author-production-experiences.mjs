import fs from "node:fs/promises";
import path from "node:path";
import { parseModelJson } from "./model-json.mjs";
import { authorExperienceCandidates } from "./production-experience-author.mjs";

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
const configPath = path.resolve(args.config || "src/site.config.json");
const inspirationPath = path.resolve(
  args.inspiration || ".launchloom/inspiration-pack.json",
);
const outputPath = path.resolve(
  args.out || ".launchloom/generated-experiences",
);
const model =
  args.model ||
  process.env.CREATIVE_EXPERIENCE_MODEL ||
  process.env.MODEL_AUTHORED_EXPERIENCE_MODEL ||
  "z-ai/glm-5.3-flash";
const failureMode = args["failure-mode"] || "throw";
const usage = [];
const authorDeadline = Date.now() + 7 * 60_000;
const sharedAbortController = new AbortController();

if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required for Phase 2 authorship.");

const schemas = {
  contract: {
    name: "launchloom_production_design_contract",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["designContract", "designRationale"],
      properties: {
        designContract: { type: "string", maxLength: 12000 },
        designRationale: { type: "string", maxLength: 1600 },
      },
    },
  },
  experience: contentSchema("launchloom_production_experience"),
  styles: contentSchema("launchloom_production_styles"),
  motion: contentSchema("launchloom_production_motion"),
};

function contentSchema(name) {
  return {
    name,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: { content: { type: "string" } },
    },
  };
}

function stagePrompt(request) {
  const route = JSON.stringify(
    {
      id: request.route.id,
      label: request.route.label,
      intent: request.route.intent,
      navigation: request.route.navigation,
      heroGeometry: request.route.heroGeometry,
      servicePresentation: request.route.servicePresentation,
      sectionRhythm: request.route.sectionRhythm,
      typographyCategory: request.route.typographyCategory,
      imageStrategy: request.route.imageStrategy,
      motionOpportunity: request.route.motionOpportunity,
      familyId: request.route.familyId,
      mobileBehavior: request.route.mobileBehavior,
      prohibitedPatterns: request.route.prohibitedPatterns,
      signature: request.route.signature,
      evidence: (request.route.evidence || []).map((item) => ({
        name: item.name,
        source: item.source,
        rights: item.rights,
        screenshotPath: item.screenshotPath,
        notes: item.notes,
      })),
    },
    null,
    2,
  );
  const shared = `You are authoring one candidate for the LaunchLoom production creative compiler.

ROUTE
${route}

SEALED CONTENT SHAPE
${JSON.stringify(request.contentShape, null, 2)}

ALLOWED CONTENT TOKENS
${request.contentTokens.join("\n")}

RELEASE RULES
${request.rules}

${request.validationError && request.stage !== "experience" ? `BOUNDED FORMAT REPAIR\nThe previous ${request.stage} output failed validation: ${request.validationError}\nReturn the complete corrected ${request.stage} output using the required schema. Preserve the assigned route.\n\nPREVIOUS OUTPUT\n${request.previousSource}\n` : ""}

Transfer principles from the reference evidence, never source layout, copy, branding, code, imagery, or trade dress. This candidate must embody its assigned route and must not collapse toward a generic split hero, white pill navigation, card grid, or shared LaunchLoom template. Treat the family, mobile behavior, and prohibited patterns as binding design constraints, not suggestions.`;

  if (request.stage === "contract")
    return `${shared}

Return a precise implementation contract and a rationale under 220 words. The contract must specify the independent page narrative, DOM outline, exact section IDs, class vocabulary, navigation behavior, hero geometry, early conversion, non-card service treatment, section sequence, typography system, image placement using content.assets tokens, compact-desktop behavior, mobile recomposition, one justified interaction strategy, reduced-motion behavior, and accessibility. Do not return source files.`;
  if (request.stage === "experience")
    return `${shared}

DESIGN CONTRACT
${request.designContract}

${request.validationError ? `COMPLIANCE REPAIR\nThe previous JSX failed: ${request.validationError}\nRepair that exact violation without reducing the composition or changing the design contract.\n\nPREVIOUS JSX\n${request.previousSource}\n` : ""}
Return complete Experience.jsx in content. Export default function Experience({ content, runtime }). Import LeadForm from @launchloom/runtime and render the shared LeadForm in the contact or early-conversion surface. Use content tokens for every business fact and every visitor-facing marketing sentence or section heading. Do not place authored marketing words directly between JSX tags. Generic interface labels may be Services, FAQs, Contact, Menu, Open menu, and Close menu. Import ./motion.js when motion is used. The deterministic runtime owns root instrumentation. Include data-hero on the opening section, data-early-conversion on the primary early action, and sections with ids services, faqs, and contact. Before returning, confirm the source binds the hero heading, services, and FAQs from content.hero.heading, content.services, and content.faqs, either directly or through destructuring. Do not return CSS.`;
  if (request.stage === "styles")
    return `${shared}

DESIGN CONTRACT
${request.designContract}

AUTHORED EXPERIENCE JSX
${request.experienceSource}

Return complete styles.css in content. Style the exact markup without changing its structure. The header and full hero must fit at 1536x864 and 1366x768 at 100 percent zoom. Recompose for 390x844 without horizontal overflow. Include visible focus, adequate contrast, readable body type, and prefers-reduced-motion. Use no remote URLs.`;
  return `${shared}

DESIGN CONTRACT
${request.designContract}

AUTHORED EXPERIENCE JSX
${request.experienceSource}

Return complete motion.js in content. Export mountExperienceMotion(runtime), returning a cleanup function. Use native browser APIs or GSAP only when the assigned motion opportunity materially improves the narrative. Read runtime?.reducedMotion or match prefers-reduced-motion and provide a still equivalent. Use at most one pinned or scrubbed sequence. Do not use network access.`;
}

async function requestStage(request) {
  if (sharedAbortController.signal.aborted)
    throw new Error("Phase 2 authorship cancelled after a sibling failure.");
  const startedAt = Date.now();
  console.log(
    `production_experience_stage=started route=${request.route.id} stage=${request.stage}`,
  );
  const controller = new AbortController();
  const abortStage = () => controller.abort();
  sharedAbortController.signal.addEventListener("abort", abortStage, {
    once: true,
  });
  const stageLimitMs =
    request.stage === "experience" || request.stage === "styles"
      ? 150_000
      : 90_000;
  const remainingMs = authorDeadline - Date.now();
  if (remainingMs <= 0)
    throw new Error("Phase 2 authorship exceeded its seven-minute budget.");
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(stageLimitMs, remainingMs),
  );
  try {
    const userContent = [{ type: "text", text: stagePrompt(request) }];
    for (const evidence of request.route.evidence || []) {
      const screenshotPath = evidence.screenshotPath;
      if (!screenshotPath || userContent.length >= 3) continue;
      try {
        const data = await fs.readFile(path.resolve(screenshotPath));
        const extension = path.extname(screenshotPath).toLowerCase();
        const mime = extension === ".png" ? "image/png" : "image/jpeg";
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${data.toString("base64")}` },
        });
      } catch {
        // Reference evidence is optional. The route contract remains usable
        // when a local screenshot is not available in the generation runner.
      }
    }
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "LaunchLoom Production Experience Author",
        },
        body: JSON.stringify({
          model,
          temperature: request.stage === "contract" ? 0.76 : 0.62,
          reasoning: {
            effort: request.stage === "contract" ? "medium" : "low",
            exclude: true,
          },
          response_format: {
            type: "json_schema",
            json_schema: schemas[request.stage],
          },
          max_tokens:
            request.stage === "experience" || request.stage === "styles"
              ? request.stage === "experience"
                ? 9000
                : 8000
              : request.stage === "contract"
                ? 4000
                : 3500,
          messages: [
            {
              role: "system",
              content:
                "Return valid JSON only. Create an ambitious, production-grade frontend while obeying the sealed content and safety contract exactly.",
            },
            { role: "user", content: userContent },
          ],
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (sharedAbortController.signal.aborted)
      throw new Error("Phase 2 authorship cancelled after a sibling failure.");
    if (!response.ok)
      throw new Error(
        `OpenRouter ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`,
      );
    const content = payload.choices?.[0]?.message?.content;
    if (!content)
      throw new Error(
        `No ${request.stage} content returned for ${request.route.id} (${payload.choices?.[0]?.finish_reason || "unknown"}).`,
      );
    usage.push({
      routeId: request.route.id,
      stage: request.stage,
      provider: payload.provider || null,
      usage: payload.usage || null,
      durationMs: Date.now() - startedAt,
    });
    console.log(
      `production_experience_stage=completed route=${request.route.id} stage=${request.stage} duration_ms=${Date.now() - startedAt}`,
    );
    return parseModelJson(content);
  } finally {
    clearTimeout(timeout);
    sharedAbortController.signal.removeEventListener("abort", abortStage);
  }
}

async function writeResult(result) {
  const staging = `${outputPath}.staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  await fs.writeFile(
    path.join(staging, "content-manifest.json"),
    `${JSON.stringify(result.contentManifest, null, 2)}\n`,
  );
  for (const candidate of result.candidates) {
    const directory = path.join(staging, candidate.directory);
    await fs.mkdir(directory, { recursive: true });
    await Promise.all(
      Object.entries(candidate.files).map(([name, content]) =>
        fs.writeFile(path.join(directory, name), content),
      ),
    );
  }
  await fs.writeFile(
    path.join(staging, "creative-run.json"),
    `${JSON.stringify(
      {
        version: 1,
        status: "authored",
        model: result.model,
        selectionKey: result.selectionKey,
        contentManifestDigest: result.contentManifest.digest,
        candidates: result.candidates.map((candidate) => candidate.metadata),
        usage,
      },
      null,
      2,
    )}\n`,
  );
  await fs.rm(outputPath, { recursive: true, force: true });
  await fs.rename(staging, outputPath);
}

async function writeFailure(error) {
  await fs.rm(outputPath, { recursive: true, force: true });
  await fs.mkdir(outputPath, { recursive: true });
  await fs.writeFile(
    path.join(outputPath, "creative-run.json"),
    `${JSON.stringify(
      {
        version: 1,
        status: "failed",
        model,
        error: error instanceof Error ? error.message : String(error),
        usage,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  const [site, inspirationPack] = await Promise.all([
    fs.readFile(configPath, "utf8").then(JSON.parse),
    fs.readFile(inspirationPath, "utf8").then(JSON.parse),
  ]);
  const result = await authorExperienceCandidates({
    site,
    inspirationPack,
    generate: requestStage,
    model,
  });
  await writeResult(result);
  console.log(`production_experience_candidates=${outputPath}`);
  console.log(`production_experience_model=${model}`);
  console.log(`production_experience_count=${result.candidates.length}`);
} catch (error) {
  sharedAbortController.abort();
  if (failureMode !== "record") throw error;
  await writeFailure(error);
  console.error(
    `production_experience_status=failed ${error instanceof Error ? error.message : String(error)}`,
  );
}
