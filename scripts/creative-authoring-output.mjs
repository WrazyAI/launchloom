export const AUTHORING_STAGE_BUDGETS = Object.freeze({
  contract: Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
  experience: Object.freeze({ maxTokens: 48_000, timeoutMs: 8 * 60_000 }),
  // Service, location, and services-index pages are authored as additional
  // pages of the same visual system, so they get real composition budgets
  // instead of reusing the generic inner template.
  service: Object.freeze({ maxTokens: 32_000, timeoutMs: 6 * 60_000 }),
  location: Object.freeze({ maxTokens: 32_000, timeoutMs: 6 * 60_000 }),
  "service-index": Object.freeze({ maxTokens: 24_000, timeoutMs: 5 * 60_000 }),
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

export const VERIFIED_CLIENT_PERSONNEL_CONTRACT = [
  "CLIENT PERSONNEL FACT BOUNDARY",
  "Reference screenshots, Reference DNA, and dossiers describe the source brand only; they do not verify this client's employees, technicians, staff count, names, roles, credentials, uniforms, or team.",
  "Only claim or depict client staff when the corresponding verified staff/person detail appears in content.claimEvidence.staff, content.claimEvidence.teamMembers, or content.claimEvidence.team.",
  "When none of those fields contains matching verified detail, do not invent named people, headcount, technician attendance, uniforms, or a client team. Translate person-led reference mechanics into a non-personnel process or decision chapter using only verified facts and available content tokens. Never use generated or stock people as this client's employees or customers.",
].join("\n");

function hasVerifiedPersonnel(contentShape) {
  const evidence = contentShape?.claimEvidence || {};
  return [evidence.staff, evidence.teamMembers, evidence.team].some((value) => {
    if (Array.isArray(value))
      return value.some((item) =>
        typeof item === "string"
          ? Boolean(item.trim())
          : Boolean(
              item &&
              typeof item === "object" &&
              Object.values(item).some((entry) =>
                typeof entry === "string"
                  ? Boolean(entry.trim())
                  : entry != null,
              ),
            ),
      );
    if (typeof value === "string") return Boolean(value.trim());
    return Boolean(
      value && typeof value === "object" && Object.keys(value).length,
    );
  });
}

/**
 * Translate people-centered reference mechanics when the sealed client facts
 * contain no verified personnel. The source-person imagery is not client
 * evidence, so preserve its composition while replacing the person-specific
 * role with a factual, object-led treatment.
 */
export function referencePersonnelCueTranslation({
  route = {},
  contentShape = {},
} = {}) {
  if (hasVerifiedPersonnel(contentShape)) return "";

  const dna = route.referenceDna || {};
  const signatures = Array.isArray(dna.requiredSignatureElements)
    ? dna.requiredSignatureElements
        .map((item) => `${item?.id || ""} ${item?.description || ""}`)
        .join(" ")
    : "";
  const dossierPrompt =
    typeof route.referenceDossier === "string"
      ? route.referenceDossier
      : route.referenceDossier?.designPrompt || "";
  const cues = [
    route.label,
    route.signature,
    dna.referenceName,
    signatures,
    dna.imageTreatment?.mode,
    dna.imageTreatment?.crop,
    dna.imageTreatment?.focalPoint,
    dna.servicePresentation?.pattern,
    ...(Array.isArray(dna.sectionSequence) ? dna.sectionSequence : []),
    dossierPrompt,
  ]
    .filter((value) => typeof value === "string")
    .join(" ");
  if (
    !/\b(?:person[- ]led|people[- ]led|people|person|portrait|technician|employee|staff|uniform|crew|mechanic|nurse|therapist|inspector|contractor|founder|owner[- ]led)\b/iu.test(
      cues,
    )
  )
    return "";

  return [
    "REFERENCE PERSONNEL-CUE TRANSLATION — FINAL FACT OVERRIDE",
    "This assigned reference contains people-centered or personnel cues, but the sealed client content has no verified personnel. Its people, names, faces, roles, uniforms, quotes, and employee depictions belong only to the source reference; they are not facts about this client.",
    "Preserve the poster composition and its non-personnel mechanics: scale, asymmetry, framing, typography hierarchy, palette, service-tile rhythm, and benefit-band placement. Replace the source-person role with a non-human, object-led visual using only an existing sealed client asset or a restrained abstract service-system graphic. Realize person-led reassurance through verified client content about the service process or customer decision, not an invented employee or implied technician attendance.",
    "Do not copy or describe a source person as this client's employee or customer. Do not add names, roles, headcount, uniforms, first-person team claims, employee testimonials, or claims about who will visit. Use verified client content only, and keep every business-specific sentence bound to sealed content tokens.",
  ].join("\n");
}

const sourceMetadataKeys = new Set([
  "id",
  "familyId",
  "referenceName",
  "source",
  "rights",
  "url",
  "provenance",
  "path",
  "absolutePath",
  "sha256",
  "selector",
]);

function translatePersonnelDescription(value) {
  return value
    .replace(
      /friendly uniformed technician photography/giu,
      "object-led household-service photography without people",
    )
    .replace(/uniformed technicians?/giu, "household-service detail")
    .replace(/technician campaign (poster|hero)/giu, "object-led campaign $1")
    .replace(
      /technician and promise together/giu,
      "object-led service detail and promise together",
    )
    .replace(
      /technician and trust explanation/giu,
      "service-process trust explanation",
    )
    .replace(/technician reassurance/giu, "service-process reassurance")
    .replace(/person-led reassurance/giu, "process-led reassurance")
    .replace(/people-led explanation/giu, "process-led explanation")
    .replace(/people-led/giu, "process-led")
    .replace(/person-led/giu, "process-led")
    .replace(/technicians?/giu, "service detail")
    .replace(/portraits?/giu, "object-led focal imagery");
}

function adaptReferenceValue(value, key = "") {
  if (typeof value === "string")
    return sourceMetadataKeys.has(key)
      ? value
      : translatePersonnelDescription(value);
  if (Array.isArray(value))
    return value.map((item) => adaptReferenceValue(item, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        adaptReferenceValue(childValue, childKey),
      ]),
    );
  return value;
}

/**
 * Remove conflicting source-person wording from model-bound route context
 * when the client has no verified personnel. Stable IDs and provenance stay
 * intact; only descriptive design language is translated.
 */
export function adaptReferencePersonnelCuesForClient(route, contentShape = {}) {
  if (!referencePersonnelCueTranslation({ route, contentShape })) return route;
  return adaptReferenceValue(route);
}

export function appendReferencePersonnelCue(prompt, request) {
  const instruction =
    request?.finalSafetyInstruction ??
    referencePersonnelCueTranslation(request);
  return instruction ? `${String(prompt).trimEnd()}\n\n${instruction}` : prompt;
}

export const CLIENT_PALETTE_ROLE_CONTRACT = [
  "CLIENT PALETTE ROLE CONTRACT",
  "Map the client visual brief palette to page surfaces by role:",
  "Use data-ll-surface=page|light|dark|hero|brand|nav on each owned surface, including navigation and inner-page content. visualBrief.palette.surfaces supplies validated pairs. The runtime defines --ll-surface, --ll-text, --ll-muted-text, --ll-link, --ll-action, --ll-on-action, --ll-border and --ll-focus locally for each marked surface.",
  "Runtime colour roles are read-only. Never declare, assign, override, or register --ll-surface, --ll-text, --ll-muted-text, --ll-link, --ll-action, --ll-on-action, --ll-border, or --ll-focus, including CSS declarations, @property, inline styles, or motion setProperty calls. Read them only through var(...). Use --ll-creative-* for candidate-owned variables.",
  "Use these local role variables for foreground/background CSS; never inherit a light text token across a transition onto a light surface. Mark muted copy data-ll-muted and actions data-ll-action. Preserve the chosen primary as brand identity; use derived readable variants for links and text.",
  "Ordinary copy, navigation and button text require 4.5:1; large text requires 3:1; required control boundaries and focus indicators require 3:1. Hover, focus, open menus and mobile must retain readable pairings. Decorative rules need not be forced to 3:1.",
  "Treat each hover, active, and focus style as a separate foreground/background pair. When an action fill changes, also choose a readable foreground for that changed fill. Never pair --ll-text as an action fill with --ll-on-action text unless that exact pair is verified to meet contrast.",
  "Image text needs a local contrasting plate or independently verified scrim. Do not rely on a dark average photo or text shadow. Unknown image, pseudo-element, blend and filter backdrops are unresolved until proved or repaired. Do not paint text-bearing elements with pseudo-element backdrops; use native list markers or an explicit aria-hidden child marker instead. The same deterministic rendered contrast gate applies to all pages.",
  "- surfaceColor is the dominant page surface. The page body and the large content fields use it.",
  "- heroColor is the opening hero surface. It stays distinct from the page surface.",
  "- brandSurfaceColor and brandSurfaceTextColor are limited brand bands, such as one conversion band or the footer, and never the dominant page surface.",
  "- primaryColor and contrastColor are the action and accent pair for buttons, links, and small marks.",
  "- inkColor, mutedColor, and lineColor carry body type, secondary type, and rules.",
  "When the assigned reference's own surface direction conflicts with the client brief, the brief wins on surfaces while the reference keeps its composition, geometry, and hierarchy.",
  "A brand color used as the dominant page surface, or an inverted light/dark direction, fails the palette-adherence gate.",
  "A bounded generated block marked `launchloom: bounded rendered contrast corrections` may be appended to the candidate stylesheet. It repairs only text backdrops that the deterministic audit cannot prove, using the local role variables, and it is part of the delivered design.",
  "Preserve that block exactly in later edits: never rewrite it by hand, never duplicate it, and never delete it to resolve a finding. When authoring or repairing flagged text, prefer a real local surface or a clean wrapper over paint the audit cannot prove.",
].join("\n");

export const CLIENT_TYPOGRAPHY_CONTRACT = [
  "CLIENT TYPOGRAPHY CONTRACT",
  "The client may have chosen a heading and body family from the self-hosted catalog. visualBrief.typography names them (id, name, stack) or is null when no choice was made.",
  "When a heading family is named, every display, heading, and wordmark font-family in authored CSS must bind the shared variable with your chosen palette stack as the fallback: font-family: var(--font-heading, <your palette stack>);",
  "When a body family is named, every body, navigation, and UI font-family must bind: font-family: var(--font-body, <your palette stack>);",
  "Keep the reference's scale, weight contrast, tracking, line-height, and display/body relationship; the client choice changes the family, never the hierarchy.",
  "Never bind both roles to one variable, never stack both variables in one declaration, never declare the host variables --font-heading, --font-body, --accent, --accent-ink, or --on-accent yourself, and never invent a remote font URL. When no family is named, use the palette stacks directly with no variable binding.",
  "CLIENT ACCENT CONTRACT",
  "When visualBrief.accent is present, use it only for secondary marks: underlines, small labels, icon strokes, and hover borders. Use var(--accent-ink, <readable fallback>) for accent text on the page surface and var(--accent, <fallback>) for fills and borders.",
  "Never use the accent for the primary action, navigation background, or a large surface, and never let it replace the client primary as brand identity.",
].join("\n");

export function completionLimitRequestField(tokens) {
  if (!Number.isSafeInteger(tokens) || tokens < 1)
    throw new Error(
      "OpenRouter completion-token limit must be a positive integer.",
    );
  return { max_completion_tokens: tokens };
}

export function referenceImplementationChecklist(referenceDna) {
  const navigationRequirement =
    'REQUIRED NAVIGATION LINKS (EVERY ROUTE, INCLUDING WHEN REFERENCE DNA IS NULL): include visible native lowercase <nav> containing literal JSX anchors <a href="#services">Services</a>, <a href="#faqs">FAQs</a>, and <a href="#contact">Contact</a>. Do not remove, replace, or convert these anchors to components or click handlers.';
  const semanticHeadingRequirement =
    "Render exactly one meaningful H1 inside the page's single <main> landmark. The main landmark must contain the hero heading and unique page content; do not place the H1 before or after main.";
  if (referenceDna == null)
    return `${navigationRequirement}\n${semanticHeadingRequirement}`;

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
  const viewportTopology =
    topology.hero || topology.mobileHero
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

  const imageIndependentGuardrail =
    topology.hero === "type-led-statement" ||
    /without photography|image[- ]independent/iu.test(
      String(referenceDna.imageTreatment?.mode || ""),
    );
  const referenceMarkers = [
    ["data-hero-geometry", referenceDna.heroGeometry?.mode, "the hero element"],
    [
      "data-navigation-geometry",
      referenceDna.navigationGeometry?.mode,
      "the visible nav element",
    ],
    [
      "data-service-presentation",
      referenceDna.servicePresentation?.pattern,
      'the section with id="services"',
    ],
    [
      "data-cta-placement",
      referenceDna.ctaPlacement?.early,
      "the early conversion anchor",
    ],
    [
      "data-mobile-recomposition",
      referenceDna.mobileRecomposition?.strategy,
      "the page's primary layout element",
    ],
    [
      "data-motion-primitive",
      referenceDna.motion?.primitive,
      "the element that owns the reference interaction",
    ],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(
      ([attribute, value, target]) =>
        `- Put ${attribute}=${JSON.stringify(value)} on ${target}. Copy the Reference DNA value verbatim.`,
    );
  return [
    'REQUIRED LITERAL SECTION IDS: put id="services", id="faqs", and id="contact" on the actual matching content sections. These must be literal JSX string attributes, not variables, expressions, aliases, or empty anchor elements.',
    navigationRequirement,
    semanticHeadingRequirement,
    ...(viewportTopology
      ? [
          "VIEWPORT-SPECIFIC HERO TOPOLOGY (HARD REQUIREMENT):",
          viewportTopology,
        ]
      : []),
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
    ...(imageIndependentGuardrail
      ? [
          "IMAGE-INDEPENDENT REFERENCE GUARDRAIL (HARD REQUIREMENT):",
          "This reference carries hierarchy with typography, rules, tables, and ledgers rather than photography. Do not place sealed photo tokens as decorative chapter filler, background washes, or inside aria-hidden figures. Use an image only where a chapter needs a real content image, give it a specific descriptive alt, keep it subordinate to the type-led hierarchy, and otherwise carry that chapter without imagery.",
        ]
      : []),
    ...(acceptanceChecks.length
      ? [
          "RENDERED ACCEPTANCE CHECKS:",
          ...acceptanceChecks,
          "Treat these as rendered acceptance criteria, not descriptive prose. Verify them against the visible page before returning source.",
        ]
      : []),
    "REFERENCE SECTION ORDER: put each data-reference-section value on its corresponding visible <section> element, in this exact DOM order:",
    ...sectionIds.map(
      (id, index) => `${index + 1}. data-reference-section="${id}"`,
    ),
    "Before returning Experience.jsx, check that all three required IDs exist literally and that every reference section marker appears once, on the semantically matching section, in this order.",
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
