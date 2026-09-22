import fs from "node:fs/promises";
import path from "node:path";
import { parseModelJson } from "./model-json.mjs";
import { typographyPalettePrompt } from "./creative-typography.mjs";
import { authorExperienceCandidates } from "./production-experience-author.mjs";
import {
  cacheableReferenceDna,
  logOpenRouterCacheUsage,
  openRouterChatCompletion,
  openRouterPromptCacheKey,
  openRouterSessionId,
  promptCachedMessageContent,
  promptCachedText,
  promptCacheRequestFields,
  readOpenRouterResponseEnvelope,
} from "./openrouter-client.mjs";
import { promptImagePart } from "./prompt-evidence.mjs";
import { validateCreativeSessionConfig } from "./reasoning-preflight-lib.mjs";

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
  "openai/gpt-5.6-luna";
const sessionPath = args.session ? path.resolve(args.session) : "";
const creativeSession = sessionPath
  ? validateCreativeSessionConfig(
      JSON.parse(await fs.readFile(sessionPath, "utf8")),
    )
  : null;
const reasoningEffort =
  creativeSession?.reasoningEffort ||
  process.env.CREATIVE_EXPERIENCE_REASONING_EFFORT ||
  (model === "openai/gpt-5.6-luna" ? "xhigh" : "low");
const failureMode = args["failure-mode"] || "throw";
const usage = [];
const authorDeadline =
  Date.now() +
  Math.max(
    5 * 60_000,
    Number(process.env.CREATIVE_EXPERIENCE_AUTHOR_TIMEOUT_MS || 20 * 60_000),
  );
const sharedAbortController = new AbortController();

if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required for Phase 2 authorship.");

const authorStageSchema = {
  name: "launchloom_production_author_stage",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["stage", "designContract", "designRationale", "content"],
    properties: {
      stage: {
        type: "string",
        enum: ["contract", "experience", "styles", "motion"],
      },
      designContract: { type: "string", maxLength: 12000 },
      designRationale: { type: "string", maxLength: 1600 },
      content: { type: "string" },
    },
  },
};

function markerSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function authorSystemPrompt(request) {
  return `Return valid JSON only. Create an ambitious, production-grade frontend while obeying the sealed content and safety contract exactly.

You are authoring one candidate for the LaunchLoom production creative compiler.

TYPOGRAPHY PALETTE
${typographyPalettePrompt()}
Choose typography by role from these locally safe stacks. Do not invent remote font URLs. Preserve the reference's scale, weight contrast, tracking, line-height, and display/body relationship even when an exact proprietary reference font is unavailable.

ALLOWED CONTENT TOKENS
${request.contentTokens.join("\n")}

RELEASE RULES
${request.rules}

Transfer principles from the reference evidence, never source layout, copy, branding, code, imagery, or trade dress. The candidate must embody its assigned route and must not collapse toward a generic split hero, white pill navigation, card grid, or shared LaunchLoom template. Treat the family, Reference DNA, mobile behavior, and prohibited patterns as binding design constraints, not suggestions.

REFERENCE FIDELITY RULES
- Do not average references or drift to a familiar LaunchLoom composition.
- Do not use a generic split hero, generic card wall, or repeated accordion unless Reference DNA explicitly requires it.
- Preserve assigned section rhythm, hero geometry, navigation geometry, service presentation, and interaction concept.
- Include every required signature element and expose its data-reference-signature attribute in the rendered DOM.
- Use one distinctive, purposeful interaction from the assigned family and provide its reduced-motion equivalent.
- Keep business facts, SEO copy, contact details, and imagery bound to sealed content tokens. Never copy reference branding, copy, assets, or trade dress.

STAGE SAFETY
- Contract output defines the implementation but never contains source files.
- Experience JSX owns semantic structure and sealed content bindings; it must use the shared LeadForm and no remote/network primitives.
- CSS styles the authored markup without changing structure, remote assets, or viewport safety.
- motion.js exports mountExperienceMotion(runtime), uses reduced-motion fallbacks, and never creates a second experience implementation.
- Every stage must preserve Reference DNA mechanics and the same route identity.
- Every response uses the same shared JSON schema. Set stage to the current stage exactly.
- For contract: fill designContract and designRationale; return content as an empty string.
- For experience, styles, or motion: fill content; return designContract and designRationale as empty strings.`;
}

function routePromptPrefix(request) {
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
      referenceDna: cacheableReferenceDna(request.route.referenceDna),
      evidence: (request.route.evidence || []).map((item) => ({
        name: item.name,
        source: item.source,
        rights: item.rights,
        measuredDesignTokens: item.measuredDesignTokens,
        sourceStyles: item.sourceStyles,
        sourceFonts: item.sourceFonts,
        notes: item.notes,
      })),
    },
    null,
    2,
  );
  const dna = request.route.referenceDna;
  const referenceMarkers = dna
    ? `
CANONICAL REFERENCE MARKERS
Copy these normalized values exactly into the matching data attributes. They are structural contract markers, not prose:
data-hero-geometry="${markerSlug(dna.heroGeometry?.mode)}"
data-navigation-geometry="${markerSlug(dna.navigationGeometry?.mode)}"
data-service-presentation="${markerSlug(dna.servicePresentation?.pattern)}"
data-cta-placement="${markerSlug(dna.ctaPlacement?.early)}"
data-mobile-recomposition="${markerSlug(dna.mobileRecomposition?.strategy)}"
data-motion-primitive="${markerSlug(dna.motion?.primitive)}"
Do not substitute the primary or secondary CTA placement for the early CTA marker. The early conversion element must use the exact data-cta-placement value above.`
    : "";

  return `ROUTE
${route}

SEALED CONTENT SHAPE
${JSON.stringify(request.contentShape, null, 2)}
${referenceMarkers}`;
}

function boundedFormatRepair(request) {
  if (!request.validationError || request.stage === "experience") return "";
  return `
BOUNDED FORMAT REPAIR
The previous ${request.stage} output failed validation: ${request.validationError}
Return the complete corrected ${request.stage} output using the required schema. Preserve the assigned route.

PREVIOUS OUTPUT
${request.previousSource}
`;
}

function stagePromptSuffix(request) {
  const repair = boundedFormatRepair(request);
  if (request.stage === "contract")
    return `${repair}
CONTRACT STAGE
Return a precise implementation contract and a rationale under 220 words. The contract must specify the independent page narrative, DOM outline, exact section IDs, class vocabulary, navigation behavior, hero geometry, early conversion, non-card service treatment, section sequence, typography system, image placement using content.hero image tokens, compact-desktop behavior, mobile recomposition, one justified interaction strategy, reduced-motion behavior, and accessibility. Do not return source files.`;

  if (request.stage === "experience")
    return `DESIGN CONTRACT
${request.designContract}

${request.validationError ? `COMPLIANCE REPAIR
The previous JSX failed: ${request.validationError}
Repair that exact violation without reducing the composition or changing the design contract.

PREVIOUS JSX
${request.previousSource}
` : ""}
EXPERIENCE STAGE
Return complete Experience.jsx in content. Export default function Experience({ content, runtime }). Import { LeadForm } from @launchloom/runtime and render exactly one <LeadForm content={content} runtime={runtime} /> inside the section with id="contact". The hero's early conversion is a compact anchor or button linking to #contact, not the full four-field form. Never put LeadForm inside the hero, nav, or promise band. Every helper component that reads sealed content must receive content (or a sealed destructured subset) as a prop; never reference a free content variable. Use content tokens for every business fact and every visitor-facing marketing sentence or section heading. Do not place authored marketing words directly between JSX tags. Generic interface labels may be Services, FAQs, Contact, Menu, Open menu, and Close menu. The deterministic host imports and mounts ./motion.js after the component renders; do not import or invoke ./motion.js from Experience.jsx. The deterministic runtime owns root instrumentation. Include data-hero on the opening section, data-early-conversion on the primary early action, and sections with ids services, faqs, and contact. Use real anchor links href="#services", href="#faqs", and href="#contact" in the navigation; JavaScript-only section buttons are not sufficient. Service detail links must resolve to the real /services/ route using the sealed service slug and a trailing slash. Never turn a service slug into a homepage fragment, because service slugs are real SEO routes, not section IDs. Before returning, confirm the source binds the hero heading, services, and FAQs from content.hero.heading, content.services, and content.faqs, either directly or through destructuring. Use content.hero.image, content.hero.secondaryImage, and content.hero.tertiaryImage for supplied imagery, with descriptive non-claiming alt text. Do not return CSS.

Add these literal implementation markers to the rendered DOM: data-hero-geometry="<Reference DNA hero geometry slug>", data-navigation-geometry="<navigation geometry slug>", data-service-presentation="<service presentation slug>", data-cta-placement="<CTA placement slug>", data-mobile-recomposition="<mobile recomposition slug>", and data-motion-primitive="<motion primitive slug>". Add every required signature as data-reference-signature="<signature id>" on the corresponding section or element. Add data-reference-section="<section sequence id>" to each major section so the compiler can verify the assigned rhythm. Do not invent values: use the slugs from Reference DNA.`;

  if (request.stage === "styles")
    return `${repair}
DESIGN CONTRACT
${request.designContract}

AUTHORED EXPERIENCE JSX
${request.experienceSource}

STYLES STAGE
Return complete styles.css in content. Return CSS text only, never an HTML document, JSX, markdown fences, or script tags. Style the exact markup without changing its structure. The header plus hero must have a measured bounding bottom no greater than the viewport height at 1536x864 and 1366x768 at 100 percent zoom. Use a compact hero composition: one headline, short body, one early CTA, and the image treatment. Do not make the hero grow to accommodate a contact form, service list, or long copy. Avoid large fixed padding and min-heights that exceed the viewport; use min-height: 0 where content can wrap. Recompose for 390x844 without horizontal overflow. Include visible focus, adequate contrast, readable body type, and prefers-reduced-motion. Use no remote URLs.`;

  return `${repair}
DESIGN CONTRACT
${request.designContract}

AUTHORED EXPERIENCE JSX
${request.experienceSource}

MOTION STAGE
Return complete motion.js in content. Return JavaScript text only, never JSX, React components, HTML, CSS, markdown fences, or a second experience implementation. Export mountExperienceMotion(runtime), returning a cleanup function. Use native browser APIs or GSAP only when the assigned motion opportunity materially improves the narrative. Read runtime?.reducedMotion or match prefers-reduced-motion and provide a still equivalent. Use at most one pinned or scrubbed sequence. Do not use network access.`;
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
    throw new Error("Phase 2 authorship exceeded its configured budget.");
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(stageLimitMs, remainingMs),
  );
  try {
    const userContent = [
      { type: "text", text: routePromptPrefix(request) },
    ];
    const evidencePaths = [
      request.route.referenceDna?.evidence?.desktopScreenshot?.path,
      request.route.referenceDna?.evidence?.mobileScreenshot?.path,
    ].filter(Boolean);
    for (const screenshotPath of evidencePaths) {
      if (userContent.length >= 3) break;
      try {
        userContent.push(await promptImagePart(path.resolve(screenshotPath)));
      } catch (error) {
        throw new Error(`Reference evidence could not be loaded for ${request.route.id}: ${screenshotPath}`, { cause: error });
      }
    }
    userContent.push(
      promptCachedText(
        model,
        "End reusable route and reference context. Stage-specific work follows.",
      ),
    );
    userContent.push({ type: "text", text: stagePromptSuffix(request) });
    const fallbackEfforts = {
      max: ["max", "medium", "low"],
      xhigh: ["xhigh", "high", "medium", "low"],
      high: ["high", "medium", "low"],
      medium: ["medium", "low"],
      low: ["low"],
      none: ["none"],
    };
    const efforts = fallbackEfforts[reasoningEffort] || [reasoningEffort];
    // Validation repairs should prioritize a complete structured response over
    // maximum hidden reasoning. A failed max-effort repair must not consume the
    // whole configured authoring budget before trying the proven lower lane.
    const requestedEfforts = creativeSession
      ? [reasoningEffort]
      : request.validationError
        ? efforts.slice(1).length
          ? efforts.slice(1)
          : efforts
        : efforts;
    let lastError;
    for (const effort of requestedEfforts) {
      try {
        const systemPrompt = authorSystemPrompt(request);
        const sessionId =
          creativeSession?.sessionId ||
          openRouterSessionId(
            "creative-author",
            model,
            effort,
            request.contentShape?.brand?.name,
            request.contentShape?.brand?.phone,
            request.contentShape?.brand?.email,
          );
        const promptCacheKey = openRouterPromptCacheKey(
          "creative-author-system",
          model,
          effort,
          creativeSession?.reasoningPolicyVersion || "static-reasoning",
          systemPrompt,
        );
        const response = await openRouterChatCompletion({
          title: "LaunchLoom Production Experience Author",
          signal: controller.signal,
          sessionId,
          body: {
              model,
              ...promptCacheRequestFields(model, promptCacheKey),
              temperature: request.stage === "contract" ? 0.76 : 0.62,
              reasoning: { effort, exclude: true },
              response_format: {
                type: "json_schema",
                json_schema: authorStageSchema,
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
                  content: promptCachedMessageContent(model, systemPrompt),
                },
                { role: "user", content: userContent },
              ],
            },
        });
        const {
          payload,
          rawBody,
          parseError: responseBodyError,
        } = await readOpenRouterResponseEnvelope(response);
        if (sharedAbortController.signal.aborted)
          throw new Error("Phase 2 authorship cancelled after a sibling failure.");
        const usageRecord = {
          routeId: request.route.id,
          stage: request.stage,
          provider: payload.provider || null,
          reasoningEffort: effort,
          usage: payload.usage || null,
          cache: logOpenRouterCacheUsage(
            `creative-author-${request.stage}`,
            payload.usage,
          ),
          sessionId,
          parseStatus: responseBodyError ? "response-body-error" : "response-received",
          durationMs: Date.now() - startedAt,
        };
        usage.push(usageRecord);
        if (!response.ok) {
          usageRecord.parseStatus = "http-error";
          const errorContext =
            JSON.stringify(payload) !== "{}"
              ? JSON.stringify(payload).slice(0, 1000)
              : rawBody || responseBodyError?.message || "empty response";
          throw new Error(
            `OpenRouter ${response.status}: ${errorContext}`,
          );
        }
        if (responseBodyError) {
          throw new Error("OpenRouter returned an unreadable response body.", {
            cause: responseBodyError,
          });
        }
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
          usageRecord.parseStatus = "missing-content";
          throw new Error(
            `No ${request.stage} content returned for ${request.route.id} (${payload.choices?.[0]?.finish_reason || "unknown"}).`,
          );
        }
        let parsed;
        try {
          parsed = parseModelJson(content);
        } catch (error) {
          usageRecord.parseStatus = "parse-failed";
          throw error;
        }
        usageRecord.parseStatus = "parsed";
        console.log(
          `production_experience_stage=completed route=${request.route.id} stage=${request.stage} effort=${effort} duration_ms=${Date.now() - startedAt}`,
        );
        return parsed;
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted || effort === requestedEfforts.at(-1))
          throw error;
        console.warn(
          `production_experience_stage=retry route=${request.route.id} stage=${request.stage} next_effort=${requestedEfforts[requestedEfforts.indexOf(effort) + 1]}`,
        );
      }
    }
    throw lastError || new Error(`No ${request.stage} response returned.`);
  } finally {
    clearTimeout(timeout);
    sharedAbortController.signal.removeEventListener("abort", abortStage);
  }
}

function aggregateCacheUsage(records) {
  const parseStatusCounts = records.reduce((counts, record) => {
    const status = record.parseStatus || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const total = records.reduce(
    (sum, record) => ({
      promptTokens: sum.promptTokens + Number(record.cache?.promptTokens || 0),
      cachedTokens: sum.cachedTokens + Number(record.cache?.cachedTokens || 0),
      cacheWriteTokens:
        sum.cacheWriteTokens + Number(record.cache?.cacheWriteTokens || 0),
      cost: sum.cost + Number(record.cache?.cost || 0),
      cacheDiscount:
        sum.cacheDiscount + Number(record.cache?.cacheDiscount || 0),
    }),
    {
      promptTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      cost: 0,
      cacheDiscount: 0,
    },
  );
  return {
    ...total,
    responseCount: records.length,
    parsedResponseCount: parseStatusCounts.parsed || 0,
    parseFailureCount: records.length - (parseStatusCounts.parsed || 0),
    parseStatusCounts,
    cost: Math.round(total.cost * 1_000_000) / 1_000_000,
    cacheDiscount:
      Math.round(total.cacheDiscount * 1_000_000) / 1_000_000,
    cacheHitPercent:
      total.promptTokens > 0
        ? Math.round((total.cachedTokens / total.promptTokens) * 1000) / 10
        : 0,
  };
}

async function writeResult(result) {
  const staging = `${outputPath}.staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  await fs.writeFile(
    path.join(staging, "content-manifest.json"),
    `${JSON.stringify(result.contentManifest, null, 2)}\n`,
  );
  if (creativeSession)
    await fs.writeFile(
      path.join(staging, "reasoning-preflight.json"),
      `${JSON.stringify(creativeSession, null, 2)}\n`,
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
        failures: result.failures || [],
        creativeSession,
        reasoningEffort,
        usage,
        cacheSummary: aggregateCacheUsage(usage),
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
        creativeSession,
        reasoningEffort,
        error: error instanceof Error ? error.message : String(error),
        usage,
        cacheSummary: aggregateCacheUsage(usage),
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
    creativeSession,
  });
  await writeResult(result);
  console.log(`production_experience_candidates=${outputPath}`);
  console.log(`production_experience_model=${model}`);
  console.log(`production_experience_reasoning_effort=${reasoningEffort}`);
  if (creativeSession) {
    console.log(`production_experience_reasoning_mode=${creativeSession.mode}`);
    console.log(
      `production_experience_reasoning_recommended=${creativeSession.recommendedEffort}`,
    );
  }
  console.log(`production_experience_count=${result.candidates.length}`);
  const cacheSummary = aggregateCacheUsage(usage);
  console.log(
    `production_experience_cache_hit_percent=${cacheSummary.cacheHitPercent}`,
  );
  console.log(
    `production_experience_cached_tokens=${cacheSummary.cachedTokens}`,
  );
  console.log(`production_experience_cost=${cacheSummary.cost}`);
  console.log(
    `production_experience_response_count=${cacheSummary.responseCount}`,
  );
  console.log(
    `production_experience_parse_failures=${cacheSummary.parseFailureCount}`,
  );
  console.log(
    `production_experience_cache_discount=${cacheSummary.cacheDiscount}`,
  );
  if (result.failures?.length)
    console.error(
      `production_experience_candidate_failures=${JSON.stringify(result.failures)}`,
    );
} catch (error) {
  sharedAbortController.abort();
  if (failureMode !== "record") throw error;
  await writeFailure(error);
  console.error(
    `production_experience_status=failed ${error instanceof Error ? error.message : String(error)}`,
  );
}
