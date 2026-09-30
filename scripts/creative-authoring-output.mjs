export const AUTHORING_STAGE_BUDGETS = Object.freeze({
  contract: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
  experience: Object.freeze({ maxTokens: 48_000, timeoutMs: 8 * 60_000 }),
  // Service pages are authored as a second page of the same visual system, so
  // they get a real composition budget instead of reusing the generic inner
  // template. The ceiling stays below the experience stage because the page
  // carries one service chapter rather than the full homepage narrative.
  service: Object.freeze({ maxTokens: 32_000, timeoutMs: 6 * 60_000 }),
  styles: Object.freeze({ maxTokens: 40_000, timeoutMs: 8 * 60_000 }),
  motion: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
});

export const CREATIVE_REPAIR_MAX_COMPLETION_TOKENS = 48_000;

export const EARLY_CONVERSION_OUTPUT_CONTRACT = [
  "EARLY CONVERSION INVARIANT",
  "The element marked data-early-conversion must be a compact native anchor to #contact whose visible label is supplied by content.hero.primaryLabel. Keep the marker on that same contact-bound anchor and preserve the assigned Reference DNA CTA placement.",
  "Do not replace it with a button, form, or JavaScript-only action, and do not hardcode its label.",
].join("\n");

export const REFERENCE_PROVENANCE_OUTPUT_CONTRACT = [
  "REFERENCE PROVENANCE BOUNDARY",
  "The reference source, source name, URL, rights and attribution are research metadata only.",
  "Never render them in visitor-facing copy, page titles or descriptions, Open Graph metadata, structured data, image alt text, link labels, or credits; they are not client business facts.",
].join("\n");

export function completionLimitRequestField(tokens) {
  if (!Number.isSafeInteger(tokens) || tokens < 1)
    throw new Error("OpenRouter completion-token limit must be a positive integer.");
  return { max_completion_tokens: tokens };
}

export function referenceImplementationChecklist(referenceDna) {
  const navigationRequirement =
    'REQUIRED NAVIGATION LINKS (EVERY ROUTE, INCLUDING WHEN REFERENCE DNA IS NULL): include visible native lowercase <nav> containing literal JSX anchors <a href="#services">Services</a>, <a href="#faqs">FAQs</a>, and <a href="#contact">Contact</a>. Do not remove, replace, or convert these anchors to components or click handlers.';
  if (referenceDna == null) return navigationRequirement;

  const sections = Array.isArray(referenceDna?.sectionSequence)
    ? referenceDna.sectionSequence
    : [];
  const topology = referenceDna?.compositionTopology || {};
  const topologyGuardrails = [];
  if (topology.hero === "type-led-statement") {
    topologyGuardrails.push(
      "Desktop type-led-statement guardrail: keep one dominant statement field. A substantial adjacent image panel is split-media and is not allowed. If imagery is needed, use a small non-adjacent accent or move the image to the next chapter; never leave an empty media placeholder.",
      "During authoring and repair, do not satisfy an imagery finding by changing the assigned desktop hero topology.",
    );
    if (topology.mobileHero && topology.mobileHero !== topology.hero)
      topologyGuardrails.push(
        `Responsive translation guardrail: mobile may use ${topology.mobileHero}, but do not mirror that mobile image treatment into a desktop side-by-side media field.`,
      );
  }
  const viewportTopology = topology.hero || topology.mobileHero
    ? [
        `Desktop hero topology: ${topology.hero || "unclassified"}`,
        `Desktop media relation: ${topology.mediaRelation || "unclassified"}`,
        `Mobile hero topology: ${topology.mobileHero || "unclassified"}`,
        `Mobile media relation: ${topology.mobileMediaRelation || "unclassified"}`,
        "Implement desktop and mobile hero topology as separate responsive layout contracts. When they differ, do not carry desktop image occupancy into mobile or force the desktop overlay onto the mobile opening.",
        ...topologyGuardrails,
      ].join("\n")
    : "";
  const sectionIds = sections.map((section) => {
    const id = String(section || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    return id;
  });
  if (
    sectionIds.length < 3 ||
    sectionIds.some((id) => !id) ||
    new Set(sectionIds).size !== sectionIds.length
  )
    throw new Error(
      "Reference DNA sectionSequence must contain at least three unique, non-empty marker IDs.",
    );
  const requirementText = (value, limit = 420) =>
    String(value || "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, limit);
  const visibleSignatures = (
    Array.isArray(referenceDna.requiredSignatureElements)
      ? referenceDna.requiredSignatureElements
      : []
  )
    .map((element) => {
      const id = requirementText(element?.id, 120);
      if (!id) return "";
      const description =
        requirementText(element?.description, 420) ||
        "the distinctive reference mechanic represented by this signature";
      return `- data-reference-signature=${JSON.stringify(id)} must visibly realize: ${description}`;
    })
    .filter(Boolean);
  const artDirectionRequirements = [
    ["Image treatment", referenceDna.imageTreatment?.mode],
    ["Image crop", referenceDna.imageTreatment?.crop],
    ["Image focal role", referenceDna.imageTreatment?.focalPoint],
    ["Service presentation", referenceDna.servicePresentation?.pattern],
    ["Service interaction", referenceDna.servicePresentation?.interaction],
    ["Palette contrast intent", referenceDna.palette?.contrastIntent],
  ]
    .map(([label, value]) => {
      const detail = requirementText(value, 420);
      return detail ? `- ${label}: ${detail}` : "";
    })
    .filter(Boolean);
  const acceptanceChecks = (
    Array.isArray(referenceDna.acceptanceChecks)
      ? referenceDna.acceptanceChecks
      : []
  )
    .map((item, index) => {
      const detail = requirementText(item, 420);
      return detail ? `${index + 1}. ${detail}` : "";
    })
    .filter(Boolean);

  const referenceMarkers = [
    ["data-hero-geometry", referenceDna.heroGeometry?.mode, "the hero element"],
    ["data-navigation-geometry", referenceDna.navigationGeometry?.mode, "the visible nav element"],
    ["data-service-presentation", referenceDna.servicePresentation?.pattern, 'the section with id="services"'],
    ["data-cta-placement", referenceDna.ctaPlacement?.early, "the early conversion anchor"],
    ["data-mobile-recomposition", referenceDna.mobileRecomposition?.strategy, "the page's primary layout element"],
    ["data-motion-primitive", referenceDna.motion?.primitive, "the element that owns the reference interaction"],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([attribute, value, target]) =>
      `- Put ${attribute}=${JSON.stringify(value)} on ${target}. Copy the Reference DNA value verbatim.`,
    );
  return [
    'REQUIRED LITERAL SECTION IDS: put id="services", id="faqs", and id="contact" on the actual matching content sections. These must be literal JSX string attributes, not variables, expressions, aliases, or empty anchor elements.',
    navigationRequirement,
    ...(viewportTopology ? ["VIEWPORT-SPECIFIC HERO TOPOLOGY (HARD REQUIREMENT):", viewportTopology] : []),
    "REQUIRED REFERENCE-DNA MARKERS: use these exact values on their matching visible elements:",
    ...referenceMarkers,
    "These are machine-readable verification markers, not visual substitutions. The rendered DOM and screenshots must still visibly realize the assigned geometry, service presentation, CTA placement, mobile recomposition, and interaction.",
    ...(visibleSignatures.length
      ? [
          "REQUIRED VISIBLE SIGNATURE REALIZATION (HARD REQUIREMENT):",
          ...visibleSignatures,
          "A data-reference-signature marker alone does not satisfy a signature. Put the marker on the element that actually realizes the described visual mechanic, and make that mechanic obvious in the rendered desktop and mobile page.",
          "Reference safety means changing identity, copy, and source assets, not erasing the transferable mechanic. Preserve the mechanic with client-specific content rather than collapsing to generic local-business grammar.",
        ]
      : []),
    ...(artDirectionRequirements.length
      ? [
          "REFERENCE ART-DIRECTION CONTRACT (HARD REQUIREMENT):",
          ...artDirectionRequirements,
          "Use supplied client imagery within these assigned visual roles. When the same client assets are reused across candidate routes, differentiate them through reference-led crop, layering, sequencing, surface treatment, color treatment, and spatial choreography. Do not revert to a conventional text/image split or card grid merely because the underlying assets are shared.",
        ]
      : []),
    ...(acceptanceChecks.length
      ? [
          "RENDERED ACCEPTANCE CHECKS:",
          ...acceptanceChecks,
          "Treat these as rendered acceptance criteria, not descriptive prose. Verify them against the visible page before returning source.",
        ]
      : []),
    'REFERENCE SECTION ORDER: put each data-reference-section value on its corresponding visible <section> element, in this exact DOM order:',
    ...sectionIds.map(
      (id, index) => `${index + 1}. data-reference-section="${id}"`,
    ),
    'Before returning Experience.jsx, check that all three required IDs exist literally and that every reference section marker appears once, on the semantically matching section, in this order.',
  ].join("\n");
}

function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function authoringCompletionDiagnostics({
  stage,
  routeId,
  maxTokens,
  payload,
  content,
}) {
  const usage = payload?.usage || {};
  const completionDetails = usage.completion_tokens_details || {};
  return {
    stage,
    routeId,
    finishReason: payload?.choices?.[0]?.finish_reason || "unknown",
    maxTokens,
    completionTokens: finiteNumberOrNull(usage.completion_tokens),
    reasoningTokens: finiteNumberOrNull(
      completionDetails.reasoning_tokens ?? usage.reasoning_tokens,
    ),
    contentChars:
      typeof content === "string"
        ? content.length
        : Array.isArray(content)
          ? content.reduce(
              (total, part) =>
                total + (typeof part?.text === "string" ? part.text.length : 0),
              0,
            )
          : 0,
  };
}

export function formatAuthoringCompletionDiagnostics(diagnostics) {
  return [
    `finish_reason=${diagnostics.finishReason}`,
    `max_completion_tokens=${diagnostics.maxTokens}`,
    `completion_tokens=${diagnostics.completionTokens ?? "not-reported"}`,
    `reasoning_tokens=${diagnostics.reasoningTokens ?? "not-reported"}`,
    `content_chars=${diagnostics.contentChars}`,
  ].join(" ");
}
