import { applyOperation } from "./revision-engine.mjs";

export const VISUAL_GATE_MODEL = "z-ai/glm-5.3-flash";

export function parseVisualAuditContent(value) {
  const content = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!content) throw new Error("Visual audit returned empty content.");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Visual audit returned incomplete or invalid JSON: ${error.message}`,
      { cause: error },
    );
  }
}

export function parseVisualAuditChoice(choice) {
  if (!choice || typeof choice !== "object")
    throw new Error("Visual audit response did not include a choice.");
  if (["length", "max_tokens"].includes(choice.finish_reason))
    throw new Error(
      `Visual audit response was truncated (${choice.finish_reason}).`,
    );
  return validateVisualAudit(parseVisualAuditContent(choice.message?.content));
}

const ALLOWED_KINDS = new Set([
  "set_section_variant",
  "reorder_section",
  "set_design_treatment",
]);
const SHARED_VARIANTS = {
  hero: ["centered"],
  services: ["featured"],
  about: ["compact"],
  process: ["compact"],
  contact: ["compact"],
};
const EXPERIENCE_CONTRACTS = {
  "cinematic-narrative": {
    navigation: "minimal-inline",
    conversion: "discovery-ribbon",
    proof: "principle-line",
    closing: "cinematic-inquiry",
    variants: {
      standard: {
        hero: "image-narrative",
        services: "editorial-index",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "gallery",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      monument: {
        hero: "centered-monument",
        services: "chaptered-index",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "social-proof",
          "gallery",
          "faq",
          "location-map",
          "contact",
        ],
      },
    },
  },
  "bold-utility": {
    navigation: "utility-pill",
    conversion: "embedded-qualifier",
    proof: "quiet-ledger",
    closing: "conversation-handoff",
    variants: {
      standard: {
        hero: "editorial-dialogue",
        services: "service-chapters",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "trust",
          "about",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      portrait: {
        hero: "guided-portrait",
        services: "service-grid",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "about",
          "trust",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
    },
  },
  "kinetic-poster": {
    navigation: "command-bar",
    conversion: "quick-request",
    proof: "evidence-strip",
    closing: "action-poster",
    variants: {
      standard: {
        hero: "poster-split",
        services: "diagnostic-list",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "coverage",
          "process",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
      "full-bleed": {
        hero: "poster-full-bleed",
        services: "problem-grid",
        sectionOrder: [
          "hero",
          "conversion",
          "services",
          "process",
          "coverage",
          "social-proof",
          "faq",
          "location-map",
          "contact",
        ],
      },
    },
  },
};

function publicText(value, limit = 500) {
  return String(value || "")
    .replace(/—/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function safeDesignManifest(config) {
  if (config.design?.experience?.renderer === "creative-candidate") {
    return {
      recipe: publicText(config.design?.recipe, 60),
      renderer: {
        type: "creative-candidate",
        candidateId: publicText(config.design?.experience?.candidateId, 100),
        familyId: publicText(config.design?.experience?.familyId, 80),
        fingerprint: publicText(config.design?.experience?.fingerprint, 100),
        visualScore: Number(config.design?.experience?.visualScore || 0),
        distinctivenessScore: Number(
          config.design?.experience?.distinctivenessScore || 0,
        ),
      },
      navigationLinks: ["Services", "FAQs", "Contact"],
      requiredSections: ["hero", "conversion", "services", "faq", "contact"],
      optionalSections: [],
      sectionOrder: [],
      allowedVariants: {},
      treatment: null,
    };
  }
  const packId = publicText(config.design?.experience?.packId, 50);
  const contract =
    config.design?.experience?.blueprintVersion === 2
      ? EXPERIENCE_CONTRACTS[packId]
      : undefined;
  const requestedVariantId = publicText(
    config.design?.experience?.variantId,
    50,
  );
  const variant = contract
    ? contract.variants[requestedVariantId] || contract.variants.standard
    : undefined;
  if (contract && variant) {
    const variantId = contract.variants[requestedVariantId]
      ? requestedVariantId
      : "standard";
    return {
      recipe: publicText(config.design?.recipe, 60),
      renderer: {
        type: "experience-pack",
        packId,
        variantId,
        blueprintVersion: 2,
        navigation: contract.navigation,
        hero: variant.hero,
        conversion: contract.conversion,
        services: variant.services,
        proof: contract.proof,
        closing: contract.closing,
      },
      navigationLinks: ["Services", "FAQs", "Contact"],
      requiredSections: ["hero", "conversion", "services", "faq", "contact"],
      optionalSections: variant.sectionOrder.filter(
        (section) =>
          !["hero", "conversion", "services", "faq", "contact"].includes(
            section,
          ),
      ),
      sectionOrder: [...variant.sectionOrder],
      allowedVariants: {},
      treatment: null,
    };
  }
  return {
    recipe: publicText(config.design?.recipe, 60),
    renderer: { type: "legacy-design-family" },
    sections: (config.design?.sections || []).slice(0, 14).map((section) => ({
      id: publicText(section.id, 70),
      type: publicText(section.type, 40),
      variant: publicText(section.variant, 50),
    })),
    requiredSections: (config.design?.sections || [])
      .slice(0, 14)
      .map((section) => publicText(section.type, 40)),
    allowedVariants: Object.fromEntries(
      (config.design?.sections || [])
        .slice(0, 14)
        .map((section) => [
          publicText(section.type, 40),
          [
            ...new Set([
              publicText(section.variant, 50),
              ...(SHARED_VARIANTS[section.type] || []),
            ]),
          ],
        ]),
    ),
    treatment: config.design?.treatment
      ? {
          density: publicText(config.design.treatment.density, 20),
          typography: publicText(config.design.treatment.typography, 20),
        }
      : null,
  };
}

export function buildSafeVisualManifest(config) {
  return {
    preset: publicText(config.preset, 40),
    industry: publicText(config.industry, 80),
    businessKind: publicText(config.businessKind, 80),
    business: {
      name: publicText(config.business?.name, 120),
      tagline: publicText(config.business?.tagline, 180),
      description: publicText(config.business?.description, 600),
      primaryCta: publicText(config.business?.primaryCta, 100),
      offer: publicText(config.business?.offer, 180),
      serviceAreas: (config.business?.serviceAreas || [])
        .map((area) => publicText(area, 100))
        .filter(Boolean)
        .slice(0, 10),
    },
    services: (config.services || []).slice(0, 10).map((service) => ({
      slug: publicText(service.slug, 90),
      name: publicText(service.name, 120),
      description: publicText(service.description, 400),
    })),
    differentiators: (config.differentiators || [])
      .map((item) => publicText(item, 180))
      .filter(Boolean)
      .slice(0, 6),
    copy: Object.fromEntries(
      [
        "heroKicker",
        "heroHeading",
        "heroBody",
        "servicesHeading",
        "servicesIntro",
        "aboutKicker",
        "aboutHeading",
        "aboutBody",
        "processKicker",
        "processHeading",
        "faqKicker",
        "faqHeading",
        "contactKicker",
        "contactHeading",
        "formIntro",
      ]
        .filter((key) => config.copy?.[key])
        .map((key) => [key, publicText(config.copy[key], 600)]),
    ),
    design: safeDesignManifest(config),
    assets: {
      hasLogo: Boolean(config.assets?.logo),
      hasClientHero: Boolean(config.assets?.photoOne),
      hasClientSecondary: Boolean(config.assets?.photoTwo),
      hasClientGallery: Boolean(config.assets?.photoThree),
      placements: (config.assetReport?.used || []).slice(0, 8).map((asset) => ({
        asset: publicText(asset.asset, 80),
        placement: publicText(asset.placement, 80),
        source: publicText(asset.source, 50),
        subject: publicText(asset.subject, 160),
      })),
    },
    conversion: {
      process: (config.conversion?.process || [])
        .map((step) => publicText(step, 180))
        .slice(0, 6),
      faqCount: (config.conversion?.faqs || []).length,
      enabledFeatures: [
        "guidedQualifier",
        "quickAnswers",
        "aiChat",
        "exitOffer",
      ].filter((feature) => config.conversion?.[feature]?.enabled),
    },
  };
}

export function validateVisualAudit(value) {
  if (!value || typeof value !== "object")
    throw new Error("Visual audit was not an object.");
  if (!["pass", "revise", "block"].includes(value.verdict))
    throw new Error("Visual audit returned an invalid verdict.");
  const findings = Array.isArray(value.findings)
    ? value.findings.slice(0, 8)
    : [];
  const operations = Array.isArray(value.operations)
    ? value.operations
        .filter((operation) => operation && ALLOWED_KINDS.has(operation.kind))
        .slice(0, 3)
        .map((operation) => ({
          kind: operation.kind,
          sectionType: publicText(operation.sectionType, 40),
          variant: publicText(operation.variant, 50),
          relativeTo: publicText(operation.relativeTo, 40),
          position: ["before", "after"].includes(operation.position)
            ? operation.position
            : "",
          density: ["compact", "balanced", "spacious"].includes(
            operation.density,
          )
            ? operation.density
            : "",
          typography: ["editorial", "sans", "strong"].includes(
            operation.typography,
          )
            ? operation.typography
            : "",
        }))
    : [];
  return {
    summary: publicText(value.summary, 500),
    verdict: value.verdict,
    findings: findings.map((finding) => ({
      category: publicText(finding.category, 50),
      severity: ["critical", "major", "minor"].includes(finding.severity)
        ? finding.severity
        : "minor",
      viewport: ["desktop", "compact", "mobile", "both"].includes(finding.viewport)
        ? finding.viewport
        : "both",
      evidence: publicText(finding.evidence, 320),
      recommendation: publicText(finding.recommendation, 400),
    })),
    operations,
  };
}

export function applySafeVisualOperations(config, operations) {
  if (
    config.design?.experience?.blueprintVersion === 2 &&
    EXPERIENCE_CONTRACTS[config.design.experience.packId]
  )
    return [];
  const applied = [];
  for (const operation of operations.slice(0, 3)) {
    if (!ALLOWED_KINDS.has(operation.kind)) continue;
    const candidate = structuredClone(operation);
    if (applyOperation(config, candidate)) applied.push(candidate);
  }
  return applied;
}

export function blockingFindings(audit, { includeMajor = false } = {}) {
  return audit.findings.filter(
    (finding) =>
      finding.severity === "critical" || (includeMajor && finding.severity === "major"),
  );
}
