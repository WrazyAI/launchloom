import fs from "node:fs/promises";
import path from "node:path";

const model = process.env.CREATIVE_REFERENCE_ANALYZER_MODEL || "openai/gpt-5.6-luna";

const schema = {
  name: "launchloom_reference_dna_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "annotatedDescription",
      "heroGeometry",
      "navigationGeometry",
      "typography",
      "palette",
      "imageTreatment",
      "sectionSequence",
      "servicePresentation",
      "ctaPlacement",
      "motion",
      "mobileRecomposition",
      "prohibitedPatterns",
      "requiredSignatureElements",
      "acceptanceChecks",
      "measurements"
    ],
    properties: {
      annotatedDescription: { type: "string", maxLength: 1400 },
      heroGeometry: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "alignment", "viewport"],
        properties: {
          mode: { type: "string" },
          alignment: { type: "string" },
          viewport: { type: "string" }
        }
      },
      navigationGeometry: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "placement", "mobile"],
        properties: {
          mode: { type: "string" },
          placement: { type: "string" },
          mobile: { type: "string" }
        }
      },
      typography: {
        type: "object",
        additionalProperties: false,
        required: ["display", "body", "scale"],
        properties: {
          display: { type: "string" },
          body: { type: "string" },
          scale: { type: "string" }
        }
      },
      palette: {
        type: "object",
        additionalProperties: false,
        required: ["surfaces", "ink", "accents", "contrastIntent"],
        properties: {
          surfaces: { type: "array", maxItems: 6, items: { type: "string" } },
          ink: { type: "string" },
          accents: { type: "array", maxItems: 5, items: { type: "string" } },
          contrastIntent: { type: "string" }
        }
      },
      imageTreatment: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "crop", "focalPoint"],
        properties: {
          mode: { type: "string" },
          crop: { type: "string" },
          focalPoint: { type: "string" }
        }
      },
      sectionSequence: { type: "array", minItems: 4, maxItems: 16, items: { type: "string" } },
      servicePresentation: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "interaction"],
        properties: {
          pattern: { type: "string" },
          interaction: { type: "string" }
        }
      },
      ctaPlacement: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "secondary", "early"],
        properties: {
          primary: { type: "string" },
          secondary: { type: "string" },
          early: { type: "string" }
        }
      },
      motion: {
        type: "object",
        additionalProperties: false,
        required: ["primitive", "library", "reducedMotion"],
        properties: {
          primitive: { type: "string" },
          library: { type: "string" },
          reducedMotion: { type: "string" }
        }
      },
      mobileRecomposition: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "rules"],
        properties: {
          strategy: { type: "string" },
          rules: { type: "array", minItems: 2, maxItems: 8, items: { type: "string" } }
        }
      },
      prohibitedPatterns: { type: "array", minItems: 3, maxItems: 12, items: { type: "string" } },
      requiredSignatureElements: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "selector", "description"],
          properties: {
            id: { type: "string" },
            selector: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      acceptanceChecks: { type: "array", minItems: 4, maxItems: 12, items: { type: "string" } },
      measurements: {
        type: "object",
        additionalProperties: false,
        required: [
          "headlineWidthRatio",
          "headlineHeightRatio",
          "heroImageOccupancyRatio",
          "contentColumnWidthRatio",
          "navTopRatio",
          "navSideInsetRatio",
          "ctaTopRatio",
          "dominantSectionHeightRatios",
          "imageAspectRatios",
          "overlapRelationships",
          "surfaceTransitions",
          "mobile"
        ],
        properties: {
          headlineWidthRatio: { type: "number", minimum: 0, maximum: 1 },
          headlineHeightRatio: { type: "number", minimum: 0, maximum: 1 },
          heroImageOccupancyRatio: { type: "number", minimum: 0, maximum: 1 },
          contentColumnWidthRatio: { type: "number", minimum: 0, maximum: 1 },
          navTopRatio: { type: "number", minimum: 0, maximum: 1 },
          navSideInsetRatio: { type: "number", minimum: 0, maximum: 0.5 },
          ctaTopRatio: { type: "number", minimum: 0, maximum: 1 },
          dominantSectionHeightRatios: { type: "array", minItems: 3, maxItems: 12, items: { type: "number", minimum: 0.1, maximum: 4 } },
          imageAspectRatios: { type: "array", minItems: 1, maxItems: 8, items: { type: "number", minimum: 0.2, maximum: 5 } },
          overlapRelationships: { type: "array", maxItems: 8, items: { type: "string" } },
          surfaceTransitions: { type: "array", maxItems: 10, items: { type: "string" } },
          mobile: {
            type: "object",
            additionalProperties: false,
            required: ["headlineWidthRatio", "imageOccupancyRatio", "ctaTopRatio", "contentInsetRatio"],
            properties: {
              headlineWidthRatio: { type: "number", minimum: 0, maximum: 1 },
              imageOccupancyRatio: { type: "number", minimum: 0, maximum: 1 },
              ctaTopRatio: { type: "number", minimum: 0, maximum: 1 },
              contentInsetRatio: { type: "number", minimum: 0, maximum: 0.5 }
            }
          }
        }
      }
    }
  }
};

function argsFrom(argv) {
  return Object.fromEntries(argv.slice(2).reduce((pairs, value, index, all) =>
    index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs, []));
}

async function imagePart(file) {
  const data = await fs.readFile(file);
  const extension = path.extname(file).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { type: "image_url", image_url: { url: `data:${mime};base64,${data.toString("base64")}` } };
}

function parseChoice(payload) {
  const raw = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!raw) throw new Error("Reference analyzer returned no content.");
  try {
    return JSON.parse(raw.replace(/^\`\`\`(?:json)?\s*/iu, "").replace(/\s*\`\`\`$/u, ""));
  } catch (error) {
    throw new Error(`Reference analyzer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function analyzeRoute(route, fetchImpl = fetch) {
  const dna = route.referenceDna || {};
  const desktop = dna.evidence?.desktopScreenshot?.path;
  const mobile = dna.evidence?.mobileScreenshot?.available ? dna.evidence.mobileScreenshot.path : "";
  if (!desktop) throw new Error(`Reference route ${route.id} has no desktop screenshot.`);
  const content = [
    {
      type: "text",
      text: `Analyze this design reference as implementation mechanics, not as brand identity. Produce measured Reference DNA for an independent implementation. Existing route hints are context only and may be corrected by the pixels.

ROUTE HINTS
${JSON.stringify({
  familyId: dna.familyId,
  referenceName: dna.referenceName,
  heroGeometry: route.heroGeometry,
  navigation: route.navigation,
  servicePresentation: route.servicePresentation,
  sectionRhythm: route.sectionRhythm,
  typographyCategory: route.typographyCategory,
  imageStrategy: route.imageStrategy,
  motionOpportunity: route.motionOpportunity
}, null, 2)}

Rules:
- infer geometry from the screenshots, not from familiar templates
- describe ratios relative to viewport size
- identify image occupancy, crop strategy, whitespace rhythm, overlap, section-height rhythm, and surface transitions
- infer only motion that is visually supported by the screenshots or the route's documented motion opportunity
- required signatures must be design mechanics that can be independently implemented
- prohibited patterns should name generic fallbacks that would visibly break this reference family
- do not copy branding, copy, proprietary fonts, logos, or trade dress`
    },
    { type: "text", text: "Desktop reference:" },
    await imagePart(desktop),
    ...(mobile ? [{ type: "text", text: "Mobile reference:" }, await imagePart(mobile)] : [])
  ];
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "LaunchLoom Reference DNA Analyzer"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      reasoning: { effort: "medium", exclude: true },
      max_tokens: 9000,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content: "Return JSON only. You are a senior visual systems designer extracting measurable, transferable design mechanics from screenshots."
        },
        { role: "user", content }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`Reference analyzer failed for ${route.id} (${response.status}): ${payload?.error?.message || "unknown error"}`);
  return parseChoice(payload);
}

export async function enrichInspirationPack(pack, { fetchImpl = fetch } = {}) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required to derive Reference DNA from screenshots.");
  if (!Array.isArray(pack?.routes) || !pack.routes.length)
    throw new Error("Reference DNA analysis requires inspiration routes.");
  const routes = [];
  for (const route of pack.routes) {
    const analyzed = await analyzeRoute(route, fetchImpl);
    routes.push({
      ...route,
      referenceDna: {
        ...route.referenceDna,
        ...analyzed,
        evidence: {
          ...route.referenceDna.evidence,
          annotatedDescription: analyzed.annotatedDescription
        },
        analyzedFromEvidence: true,
        analyzerModel: model,
        analyzedAt: new Date().toISOString()
      }
    });
  }
  return { ...pack, referenceDnaAnalyzed: true, referenceDnaAnalyzerModel: model, routes };
}

async function main() {
  const args = argsFrom(process.argv);
  if (!args.inspiration) throw new Error("--inspiration is required.");
  const input = path.resolve(args.inspiration);
  const output = path.resolve(args.out || args.inspiration);
  const pack = JSON.parse(await fs.readFile(input, "utf8"));
  const enriched = await enrichInspirationPack(pack);
  await fs.writeFile(output, `${JSON.stringify(enriched, null, 2)}\n`);
  console.log(JSON.stringify({ routes: enriched.routes.length, model, output }));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
