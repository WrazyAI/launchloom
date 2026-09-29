import fs from "node:fs";
import path from "node:path";

/**
 * Reference DNA is the evidence-backed visual contract handed to a creative
 * author.  It deliberately describes mechanics, not a reference site's
 * brand, copy, assets, or trade dress.
 */
export const REFERENCE_DNA_VERSION = 2;

const clean = (value, limit = 260) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[—–]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);

const list = (value, limit = 20) => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => clean(item, 160))
      .filter(Boolean),
  ),
].slice(0, limit);

const sectionIdPatterns = Object.freeze({
  hero: /\b(?:hero|opening|header|poster|field|stage|column|monument)\b/iu,
  "image-chapter": /\b(?:image\s+chapter|featured\s+(?:image|portrait)|portrait\s+(?:image|chapter)|image\s+spread)\b/iu,
  "editorial-intro": /\b(?:editorial\s+(?:intro|statement)|intro(?:duction)?|context|about|statement)\b/iu,
  "image-mosaic": /\b(?:image\s+(?:mosaic|collage|strip)|mosaic|collage|triptych|gallery)\b/iu,
  "magazine-archive": /\b(?:magazine|archive|ledger|service\s+(?:rows?|index)|ruled\s+(?:service|archive))\b/iu,
  "closing-scene": /\b(?:closing|final|full[- ]bleed|cinematic\s+(?:image|scene))\b/iu,
  contact: /\b(?:contact|request|form|conversation|footer)\b/iu,
  "conversion-band": /\b(?:conversion|reassurance|cta|call[- ]to[- ]action)\b/iu,
  "program-bands": /\b(?:program|service\s+bands?|horizontal\s+bands?)\b/iu,
  proof: /\b(?:proof|testimonial|trust|social\s+proof)\b/iu,
  faq: /\b(?:faq|questions?|accordion)\b/iu,
  process: /\b(?:process|steps?|workflow)\b/iu,
  services: /\b(?:services?|capabilities|offerings?)\b/iu,
  marquee: /\b(?:marquee|scroll(?:ing)?\s+(?:strip|rail)|project\s+strip)\b/iu,
  pricing: /\b(?:pricing|plans?|packages?)\b/iu,
  projects: /\b(?:projects?|case\s+stud(?:y|ies)|project\s+stack)\b/iu,
});

/**
 * Keep the analyzer's descriptive section observations, but expose stable
 * IDs to the source/DOM fidelity gate. Model-written prose is useful evidence
 * and not a reliable machine contract by itself.
 */
export function normalizeSectionSequence(value, familyId) {
  const defaults = [...(FAMILY_DEFAULTS[familyId]?.sectionSequence || [])];
  const observed = Array.isArray(value)
    ? value.map((item) => clean(item, 160)).filter(Boolean)
    : [];
  if (!observed.length) return defaults;
  // Dossier-backed references intentionally use their own family IDs. When a
  // reference has no pre-registered profile, preserve its authored stable IDs
  // instead of interpreting them against an unrelated family's defaults.
  if (!defaults.length) {
    return [...new Set(observed.map((item) => {
      const direct = item
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "");
      return Object.keys(sectionIdPatterns).find(
        (candidate) => direct === candidate || direct.includes(candidate),
      ) || direct;
    }).filter(Boolean))].slice(0, 20);
  }
  const normalized = [];
  for (const item of observed) {
    const direct = item
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
    const directMatch = defaults.find(
      (candidate) => direct === candidate || direct.includes(candidate),
    );
    const mapped = directMatch || defaults.find(
      (candidate) => sectionIdPatterns[candidate]?.test(item),
    );
    if (mapped && !normalized.includes(mapped)) normalized.push(mapped);
  }
  // If the analyzer used prose that cannot be mapped confidently, retain the
  // family's reviewed rhythm instead of producing an unverifiable contract.
  return normalized.length >= Math.min(3, defaults.length)
    ? normalized
    : defaults;
}

const routeText = (route) =>
  [
    route?.id,
    route?.label,
    route?.familyId,
    route?.heroGeometry,
    route?.navigation,
    route?.servicePresentation,
    route?.sectionRhythm,
    route?.typographyCategory,
    route?.imageStrategy,
    route?.motionOpportunity,
  ]
    .map((value) => clean(value, 160).toLowerCase())
    .join(" ");

function referenceFamilyProfile(referenceName, values) {
  const [heroMode, heroAlignment, heroViewport] = values.hero;
  const [navMode, navPlacement, navMobile] = values.nav;
  const [display, body, scale] = values.type;
  const [surfaces, ink, accents, contrastIntent] = values.palette;
  const [imageMode, crop, focalPoint] = values.image;
  const [servicePattern, serviceInteraction] = values.services;
  const [primary, secondary, early] = values.cta;
  const [primitive, library, reducedMotion] = values.motion;
  const [mobileStrategy, mobileRules] = values.mobile;
  return {
    referenceName,
    heroGeometry: { mode: heroMode, alignment: heroAlignment, viewport: heroViewport },
    navigationGeometry: { mode: navMode, placement: navPlacement, mobile: navMobile },
    typography: { display, body, scale },
    palette: { surfaces, ink, accents, contrastIntent },
    imageTreatment: { mode: imageMode, crop, focalPoint },
    sectionSequence: values.sections,
    servicePresentation: { pattern: servicePattern, interaction: serviceInteraction },
    ctaPlacement: { primary, secondary, early },
    motion: { primitive, library, reducedMotion },
    mobileRecomposition: { strategy: mobileStrategy, rules: mobileRules },
    prohibitedPatterns: values.prohibited,
    requiredSignatureElements: values.signatures.map(([id, description]) => ({
      id,
      selector: `[data-reference-signature=${id}]`,
      description,
    })),
    acceptanceChecks: values.checks,
  };
}

const FAMILY_DEFAULTS = Object.freeze({
  "kokoro-editorial-architecture": {
    referenceName: "Kokoro-style editorial architecture",
    heroGeometry: { mode: "typographic-monument", alignment: "centered", viewport: "intro-and-image-chapter" },
    navigationGeometry: { mode: "quiet-corner-links", placement: "fixed-corners", mobile: "compact-overlay" },
    typography: { display: "high-contrast-editorial-serif", body: "quiet-humanist-sans", scale: "oversized-display-with-small-caps" },
    palette: { surfaces: ["near-black", "warm-charcoal"], ink: "bone-white", accents: ["muted-ochre"], contrastIntent: "high-contrast editorial" },
    imageTreatment: { mode: "architectural-tableaux", crop: "vertical editorial crop", focalPoint: "center-weighted" },
    sectionSequence: ["hero", "image-chapter", "editorial-intro", "image-mosaic", "magazine-archive", "closing-scene", "contact"],
    servicePresentation: { pattern: "magazine-archive-ledger", interaction: "row-reveal" },
    ctaPlacement: { primary: "quiet-link-after-intro", secondary: "archive-index", early: "after-hero-image" },
    motion: { primitive: "masked-image-reveal", library: "gsap-scrolltrigger", reducedMotion: "show static image chapters" },
    mobileRecomposition: { strategy: "single-column editorial chapters", rules: ["keep display scale readable", "turn archive rows into stacked links", "remove pinned scenes"] },
    prohibitedPatterns: ["generic-split-hero", "bento-card-wall", "pill-navbar", "numbered-service-cards", "hero-copy-wall"],
    requiredSignatureElements: [
      { id: "editorial-monument", selector: "[data-reference-signature=editorial-monument]", description: "oversized editorial opening" },
      { id: "magazine-archive", selector: "[data-reference-signature=magazine-archive]", description: "archive or magazine index" },
      { id: "closing-scene", selector: "[data-reference-signature=closing-scene]", description: "distinctive image-led closing scene" },
    ],
    acceptanceChecks: ["hero is a centered typographic monument", "an image-led architecture chapter follows the opening", "archive rows are not generic service cards", "closing scene is visually distinct"],
  },
  "veyra-kinetic-typography": {
    referenceName: "VEYRA / AGENT-WAVE kinetic typography",
    heroGeometry: { mode: "full-viewport-action-poster", alignment: "edge-anchored", viewport: "one-screen kinetic opening" },
    navigationGeometry: { mode: "performance-command-bar", placement: "top-edge", mobile: "condensed-command-menu" },
    typography: { display: "oversized-condensed-sans", body: "neutral-sans", scale: "viewport-linked" },
    palette: { surfaces: ["ink-black", "signal-color"], ink: "white", accents: ["electric-green", "signal-orange"], contrastIntent: "high-energy contrast" },
    imageTreatment: { mode: "full-bleed-action-documentary", crop: "motion-safe cover", focalPoint: "subject-led" },
    sectionSequence: ["hero", "conversion-band", "program-bands", "proof", "faq", "contact"],
    servicePresentation: { pattern: "horizontal-program-bands", interaction: "velocity-linked rows" },
    ctaPlacement: { primary: "hero-command", secondary: "conversion-band", early: "persistent bottom band" },
    motion: { primitive: "velocity-linked-type", library: "gsap-scrolltrigger", reducedMotion: "freeze at first frame" },
    mobileRecomposition: { strategy: "stacked poster panels", rules: ["preserve type scale hierarchy", "replace horizontal scrubs with swipe-safe rows", "keep CTA visible without overlap"] },
    prohibitedPatterns: ["generic-split-hero", "soft-editorial-card-grid", "long-why-us-copy", "decorative-numbering"],
    requiredSignatureElements: [
      { id: "kinetic-poster", selector: "[data-reference-signature=kinetic-poster]", description: "viewport-filling kinetic hero" },
      { id: "program-bands", selector: "[data-reference-signature=program-bands]", description: "horizontal program or service bands" },
    ],
    acceptanceChecks: ["hero type is visibly motion-led", "service rows have a directional interaction", "mobile keeps a readable poster hierarchy"],
  },
  "health-portal-masked-mosaic": {
    referenceName: "Health Portal image mosaic",
    heroGeometry: { mode: "shared-image-window-mosaic", alignment: "grid-led", viewport: "full-screen card mosaic" },
    navigationGeometry: { mode: "floating-clinical-menu", placement: "edge-floating", mobile: "sheet-menu" },
    typography: { display: "heavy-neutral-sans", body: "neutral-sans", scale: "responsive-utility" },
    palette: { surfaces: ["clinical-white", "soft-neutral"], ink: "black", accents: ["clinical-blue", "soft-lime"], contrastIntent: "calm readable contrast" },
    imageTreatment: { mode: "single-image-multi-window", crop: "mask-aligned", focalPoint: "subject-safe" },
    sectionSequence: ["hero-mosaic", "smile-gallery", "service-ribbon", "process", "faq", "contact"],
    servicePresentation: { pattern: "translucent-service-ribbon", interaction: "active-window selection" },
    ctaPlacement: { primary: "hero-card", secondary: "service-ribbon", early: "inside first mosaic" },
    motion: { primitive: "coordinated-mask-drift", library: "native-css-and-gsap", reducedMotion: "static masks" },
    mobileRecomposition: { strategy: "stacked mask windows", rules: ["retain shared image relationship", "stack service ribbon into two-column rows", "avoid clipped text"] },
    prohibitedPatterns: ["generic-split-hero", "unrelated-image-grid", "pill-navbar", "long-why-us-copy"],
    requiredSignatureElements: [
      { id: "masked-mosaic", selector: "[data-reference-signature=masked-mosaic]", description: "multiple windows into one image" },
      { id: "service-ribbon", selector: "[data-reference-signature=service-ribbon]", description: "translucent service ribbon" },
    ],
    acceptanceChecks: ["at least two cards share one image source", "service treatment is a ribbon or window selector", "mobile preserves the image-window concept"],
  },
  "skyelite-cinematic-luxury": {
    referenceName: "SkyElite cinematic luxury",
    heroGeometry: { mode: "centered-copy-over-motion-landscape", alignment: "centered", viewport: "full-screen cinematic field" },
    navigationGeometry: { mode: "transparent-horizon-navigation", placement: "top-overlay", mobile: "minimal-overlay-menu" },
    typography: { display: "overlapping-modern-sans", body: "light-neutral-sans", scale: "large-soft-overlap" },
    palette: { surfaces: ["mist-white", "sky-gray"], ink: "deep-slate", accents: ["warm-metal"], contrastIntent: "quiet premium contrast" },
    imageTreatment: { mode: "atmospheric-motion-background", crop: "wide cinematic", focalPoint: "horizon" },
    sectionSequence: ["hero-film", "destination-index", "benefits", "faq", "contact"],
    servicePresentation: { pattern: "floating-destination-index", interaction: "hover destination focus" },
    ctaPlacement: { primary: "hero-centered", secondary: "destination-index", early: "under hero copy" },
    motion: { primitive: "horizon-parallax", library: "gsap-scrolltrigger", reducedMotion: "poster frame" },
    mobileRecomposition: { strategy: "centered cinematic stack", rules: ["keep headline centered", "use poster image fallback", "avoid autoplay dependence"] },
    prohibitedPatterns: ["generic-card-wall", "dense-utility-nav", "decorative-numbering"],
    requiredSignatureElements: [
      { id: "cinematic-horizon", selector: "[data-reference-signature=cinematic-horizon]", description: "atmospheric full-screen hero" },
      { id: "destination-index", selector: "[data-reference-signature=destination-index]", description: "floating destination or benefit index" },
    ],
    acceptanceChecks: ["hero is centered over an atmospheric field", "motion has a still fallback", "navigation does not become a pill card wall"],
  },
  "digital-experiences-liquid-glass": {
    referenceName: "Digital Experiences liquid-glass studio",
    heroGeometry: { mode: "video-field-with-floating-instruments", alignment: "centered", viewport: "full-screen atmospheric field" },
    navigationGeometry: { mode: "orbital-glass-navigation", placement: "floating-top", mobile: "glass-sheet-menu" },
    typography: { display: "italic-editorial-display", body: "light-grotesk", scale: "tight-kinetic" },
    palette: { surfaces: ["pure-black", "transparent-glass"], ink: "white", accents: ["spectral-gray"], contrastIntent: "cinematic dark contrast" },
    imageTreatment: { mode: "abstract-video-atmosphere", crop: "cover with atmospheric bleed", focalPoint: "center" },
    sectionSequence: ["hero-field", "capability-cells", "process", "faq", "contact"],
    servicePresentation: { pattern: "liquid-glass-capability-cells", interaction: "focus-and-blur sequence" },
    ctaPlacement: { primary: "glass-hero", secondary: "capability-cells", early: "hero instrument" },
    motion: { primitive: "blur-focus-sequence", library: "gsap-scrolltrigger", reducedMotion: "opaque still panels" },
    mobileRecomposition: { strategy: "single-column glass panels", rules: ["reduce blur layers", "keep body copy readable", "avoid pinned scenes"] },
    prohibitedPatterns: ["generic-split-hero", "flat-card-grid", "unbounded-autoplay-video"],
    requiredSignatureElements: [
      { id: "liquid-field", selector: "[data-reference-signature=liquid-field]", description: "atmospheric field with floating glass controls" },
      { id: "capability-cells", selector: "[data-reference-signature=capability-cells]", description: "capabilities presented as glass cells" },
    ],
    acceptanceChecks: ["glass treatment is structural rather than decorative", "motion has reduced-motion fallback", "capabilities are not generic cards"],
  },
  "a1-collage-composition": {
    referenceName: "A1 collage composition",
    heroGeometry: { mode: "layered-collage-with-offset-product-stills", alignment: "asymmetric", viewport: "full-width tactile opening" },
    navigationGeometry: { mode: "floating-tool-nav", placement: "quiet top edge", mobile: "inline utility row" },
    typography: { display: "serif-and-sans-pair", body: "warm neutral sans", scale: "large editorial title with compact annotations" },
    palette: { surfaces: ["paper white", "light blue", "soft grey"], ink: "deep ink", accents: ["clear blue", "hand-drawn signal"], contrastIntent: "bright tactile contrast" },
    imageTreatment: { mode: "hand-drawn-product-collage", crop: "varied rectangular crops with layered offsets", focalPoint: "object-led with negative space" },
    sectionSequence: ["hero", "feature-atlas", "image-mosaic", "annotation-rail", "conversion-band", "contact"],
    servicePresentation: { pattern: "annotated-feature-objects", interaction: "layer hover and scroll depth" },
    ctaPlacement: { primary: "hero-tool", secondary: "conversion-band", early: "inside first collage" },
    motion: { primitive: "layered-pointer-drift", library: "native-css-and-gsap", reducedMotion: "static collage layers" },
    mobileRecomposition: { strategy: "stacked-collage-atlas", rules: ["keep offsets intentional", "turn object annotations into touch-safe rows", "preserve the first action above the fold"] },
    prohibitedPatterns: ["generic-split-hero", "uniform-rounded-card-grid", "heavy-pill-navigation", "cool-blue-saas-palette"],
    requiredSignatureElements: [
      { id: "collage-field", selector: "[data-reference-signature=collage-field]", description: "layered collage opening" },
      { id: "object-annotations", selector: "[data-reference-signature=object-annotations]", description: "annotations anchored to visual objects" },
      { id: "conversion-band", selector: "[data-reference-signature=conversion-band]", description: "graphic conversion band" },
    ],
    acceptanceChecks: ["hero is asymmetrical and layered", "objects have annotations or labels", "the first conversion action is inside the opening narrative", "mobile retains the collage relationship"],
  },
  "a1-kinetic-command": {
    referenceName: "A1 kinetic command",
    heroGeometry: { mode: "full-viewport-action-poster", alignment: "edge-anchored", viewport: "one-screen kinetic opening" },
    navigationGeometry: { mode: "performance-command-bar", placement: "top-edge", mobile: "condensed command menu" },
    typography: { display: "condensed-mono-display", body: "neutral sans", scale: "viewport-linked high-impact type" },
    palette: { surfaces: ["ink black", "signal orange", "dark blue"], ink: "white", accents: ["orange", "electric blue"], contrastIntent: "high-energy contrast" },
    imageTreatment: { mode: "full-bleed-action-documentary", crop: "motion-safe cover", focalPoint: "subject-led" },
    sectionSequence: ["hero", "program-bands", "impact-statements", "proof", "conversion-band", "contact"],
    servicePresentation: { pattern: "horizontal-program-bands", interaction: "velocity-linked rows" },
    ctaPlacement: { primary: "hero-command", secondary: "conversion-band", early: "persistent bottom band" },
    motion: { primitive: "velocity-linked-type", library: "gsap-scrolltrigger", reducedMotion: "freeze at first frame" },
    mobileRecomposition: { strategy: "stacked-poster-panels", rules: ["preserve type scale hierarchy", "replace horizontal scrubs with swipe-safe rows", "keep the CTA visible without overlap"] },
    prohibitedPatterns: ["generic-split-hero", "soft-editorial-card-grid", "decorative-numbering", "late-contact-only"],
    requiredSignatureElements: [
      { id: "kinetic-command", selector: "[data-reference-signature=kinetic-command]", description: "viewport-filling kinetic hero" },
      { id: "program-bands", selector: "[data-reference-signature=program-bands]", description: "directional program bands" },
      { id: "impact-statements", selector: "[data-reference-signature=impact-statements]", description: "large impact statements" },
    ],
    acceptanceChecks: ["hero type is visibly motion-led", "service rows have directional interaction", "the opening action remains readable at 100 percent zoom", "mobile keeps a poster hierarchy"],
  },
  "a1-object-stage": {
    referenceName: "A1 object stage",
    heroGeometry: { mode: "isolated-3d-object-on-deep-stage", alignment: "object-centered", viewport: "full-screen exhibition stage" },
    navigationGeometry: { mode: "distributed-object-stage-nav", placement: "edge-distributed", mobile: "compact top menu" },
    typography: { display: "instrument-serif-with-technical-mono", body: "technical sans", scale: "object-first display scale" },
    palette: { surfaces: ["near black", "deep grey"], ink: "cool white", accents: ["steel blue", "soft highlight"], contrastIntent: "object-stage contrast" },
    imageTreatment: { mode: "deep-focus-object-render", crop: "isolated object with atmospheric falloff", focalPoint: "object center" },
    sectionSequence: ["hero", "object-caption", "capability-atlas", "project-stack", "conversion-band", "contact"],
    servicePresentation: { pattern: "object-led-capability-atlas", interaction: "focus transition" },
    ctaPlacement: { primary: "hero-edge", secondary: "project-stack", early: "hero caption control" },
    motion: { primitive: "object-focus-transition", library: "gsap-scrolltrigger", reducedMotion: "static poster and caption" },
    mobileRecomposition: { strategy: "object-first-stacked-chapters", rules: ["shrink type before cropping the object", "replace sticky scaling with sequential reveals", "keep a static poster fallback"] },
    prohibitedPatterns: ["unrelated-3d-decoration", "generic-bento-grid", "autoplay-scroll-lock", "hero-copy-wall"],
    requiredSignatureElements: [
      { id: "object-stage", selector: "[data-reference-signature=object-stage]", description: "isolated object stage" },
      { id: "object-caption", selector: "[data-reference-signature=object-caption]", description: "caption tied to the object" },
      { id: "project-stack", selector: "[data-reference-signature=project-stack]", description: "stacked project narrative" },
    ],
    acceptanceChecks: ["the object is the narrative anchor", "capabilities are presented as an atlas rather than a bento wall", "project sections have a scroll relationship", "mobile remains usable without sticky lock-in"],
  },
  "a1-kinetic-founder": {
    referenceName: "A1 kinetic founder atlas",
    heroGeometry: { mode: "centered-typographic-founder-field", alignment: "centered", viewport: "full-screen statement field" },
    navigationGeometry: { mode: "compact-pixel-command-nav", placement: "top edge", mobile: "compact inline menu" },
    typography: { display: "pixel-display-with-mono-microcopy", body: "technical mono", scale: "oversized centered statement" },
    palette: { surfaces: ["ink black", "dark grey"], ink: "white", accents: ["pale green"], contrastIntent: "expressive dark contrast" },
    imageTreatment: { mode: "textured-dark-field-with-graphic-accents", crop: "full-bleed atmospheric texture", focalPoint: "type and signal accents" },
    sectionSequence: ["hero", "goal-atlas", "progress-proof", "testimonials", "conversion-band", "contact"],
    servicePresentation: { pattern: "goal-atlas-feature-sequence", interaction: "goal-atlas scrub" },
    ctaPlacement: { primary: "hero-command", secondary: "conversion-band", early: "after statement" },
    motion: { primitive: "scroll-linked-type-reveal", library: "gsap-scrolltrigger", reducedMotion: "static goal atlas" },
    mobileRecomposition: { strategy: "centered-statement-stack", rules: ["keep centered type hierarchy", "stack goal atlas items", "replace hover-only reveals with tap-safe disclosure"] },
    prohibitedPatterns: ["generic-split-hero", "generic-card-wall", "repeated-accordion", "late-contact-only"],
    requiredSignatureElements: [
      { id: "founder-field", selector: "[data-reference-signature=founder-field]", description: "centered typographic statement" },
      { id: "goal-atlas", selector: "[data-reference-signature=goal-atlas]", description: "goal-led feature atlas" },
      { id: "progress-proof", selector: "[data-reference-signature=progress-proof]", description: "progress and proof section" },
    ],
    acceptanceChecks: ["the opening reads as a centered statement rather than a split hero", "goals are presented as an atlas", "motion is tied to reading progress", "mobile uses tap-safe disclosure"],
  },
  "a1-cinematic-3d": {
    referenceName: "A1 cinematic 3D studio",
    heroGeometry: { mode: "cinematic-3d-studio-field", alignment: "centered", viewport: "full-screen atmospheric field" },
    navigationGeometry: { mode: "minimal-cinematic-nav", placement: "top overlay", mobile: "minimal overlay menu" },
    typography: { display: "restrained-modern-sans", body: "light neutral sans", scale: "quiet large type" },
    palette: { surfaces: ["near black", "dark grey"], ink: "white", accents: ["soft grey"], contrastIntent: "quiet cinematic contrast" },
    imageTreatment: { mode: "dark-video-and-3d-atmosphere", crop: "cover with atmospheric bleed", focalPoint: "center stage" },
    sectionSequence: ["hero", "featured-work", "process", "proof", "conversion-band", "contact"],
    servicePresentation: { pattern: "featured-work-rail", interaction: "work rail reveal" },
    ctaPlacement: { primary: "hero-centered", secondary: "featured-work", early: "under hero statement" },
    motion: { primitive: "slow-3d-camera-drift", library: "gsap-scrolltrigger", reducedMotion: "poster frame" },
    mobileRecomposition: { strategy: "poster-first-stacked-studio", rules: ["use a poster fallback", "stack the work rail", "disable camera drift when reduced motion is requested"] },
    prohibitedPatterns: ["generic-split-hero", "flat-card-grid", "unbounded-autoplay-video", "dense-utility-nav"],
    requiredSignatureElements: [
      { id: "cinematic-studio", selector: "[data-reference-signature=cinematic-studio]", description: "cinematic studio opening" },
      { id: "featured-work", selector: "[data-reference-signature=featured-work]", description: "featured work rail" },
      { id: "closing-inquiry", selector: "[data-reference-signature=closing-inquiry]", description: "closing inquiry scene" },
    ],
    acceptanceChecks: ["the hero is atmospheric rather than split", "work is shown as a rail or narrative sequence", "motion has a poster fallback", "mobile does not depend on autoplay"],
  },
  "3d-portfolio-object-led": {
    referenceName: "3D Portfolio object-led showcase",
    heroGeometry: { mode: "oversized-wordmark-with-object-focus", alignment: "edge-and-center", viewport: "full-screen object stage" },
    navigationGeometry: { mode: "distributed-uppercase-navigation", placement: "edge-distributed", mobile: "compact top menu" },
    typography: { display: "compressed-industrial-sans", body: "technical-sans", scale: "viewport-sized" },
    palette: { surfaces: ["near-black", "bone-white"], ink: "cool-white", accents: ["steel-blue"], contrastIntent: "object-stage contrast" },
    imageTreatment: { mode: "object-led-3d-collage", crop: "deep-focus object framing", focalPoint: "object center" },
    sectionSequence: ["object-hero", "marquee", "about", "services", "project-stack", "faq", "contact"],
    servicePresentation: { pattern: "large-type-service-list", interaction: "scroll-linked project stack" },
    ctaPlacement: { primary: "hero-edge", secondary: "project-stack", early: "hero contact control" },
    motion: { primitive: "sticky-card-scaling", library: "gsap-scrolltrigger", reducedMotion: "static project stack" },
    mobileRecomposition: { strategy: "object-first stacked chapters", rules: ["shrink type before cropping object", "turn marquee into swipe rail", "disable sticky stacking when reduced motion"] },
    prohibitedPatterns: ["unrelated-3d-decoration", "generic-bento-grid", "autoplay-scroll-lock"],
    requiredSignatureElements: [
      { id: "object-stage", selector: "[data-reference-signature=object-stage]", description: "object-led opening stage" },
      { id: "project-stack", selector: "[data-reference-signature=project-stack]", description: "sticky project stack or equivalent" },
    ],
    acceptanceChecks: ["object is the narrative anchor", "projects have a scroll relationship", "mobile remains scrollable and usable"],
  },
  "vortex-editorial-studio": {
    referenceName: "Vortex editorial studio",
    heroGeometry: { mode: "narrow-authored-column", alignment: "centered-column", viewport: "content-led opening" },
    navigationGeometry: { mode: "fixed-bottom-conversation-pill", placement: "bottom-center", mobile: "inline-action" },
    typography: { display: "neo-grotesk-with-pixel-serif", body: "humanist-sans", scale: "narrow-editorial" },
    palette: { surfaces: ["white", "ink-blue"], ink: "deep-blue", accents: ["violet"], contrastIntent: "quiet editorial contrast" },
    imageTreatment: { mode: "wide-moving-project-strip", crop: "rounded editorial crop", focalPoint: "project-led" },
    sectionSequence: ["column-hero", "marquee", "testimonial", "pricing", "projects", "partner", "faq", "contact"],
    servicePresentation: { pattern: "project-marquee-and-pricing-pair", interaction: "cursor-image-trail" },
    ctaPlacement: { primary: "bottom-conversation-pill", secondary: "pricing", early: "hero chat" },
    motion: { primitive: "infinite-project-marquee", library: "native-scroll-and-gsap", reducedMotion: "static project strip" },
    mobileRecomposition: { strategy: "narrow column with inline actions", rules: ["move bottom pill into flow", "stack pricing cards", "disable cursor trail"] },
    prohibitedPatterns: ["generic-split-hero", "service-card-wall", "late-contact-only"],
    requiredSignatureElements: [
      { id: "studio-column", selector: "[data-reference-signature=studio-column]", description: "narrow authored column" },
      { id: "project-marquee", selector: "[data-reference-signature=project-marquee]", description: "moving project strip" },
    ],
    acceptanceChecks: ["opening remains a narrow essay rather than split hero", "project imagery moves as a strip", "mobile converts cursor mechanics to touch-safe behavior"],
  },
  "neighborhood-table-collage": {
    referenceName: "Neighborhood collage market",
    heroGeometry: { mode: "loose-product-collage", alignment: "left-copy-with-offset-product-tiles", viewport: "warm full-width opening with an asymmetrical image cluster" },
    navigationGeometry: { mode: "market-day-navigation", placement: "small linear top row with utility CTA", mobile: "compact top row with inline action" },
    typography: { display: "friendly-display-serif", body: "warm neutral sans", scale: "large conversational headline with compact utility labels" },
    palette: { surfaces: ["warm cream", "soft sage", "butter yellow", "tomato orange", "deep cocoa"], ink: "deep cocoa", accents: ["tomato orange", "butter yellow", "sage"], contrastIntent: "warm high-contrast editorial commerce" },
    imageTreatment: { mode: "overlapping-product-stills", crop: "varied rectangular crops with collage overlap", focalPoint: "product-centered with generous negative space" },
    sectionSequence: ["hero", "services", "image-mosaic", "conversion-band", "faq", "contact"],
    servicePresentation: { pattern: "seasonal-shelf-menu", interaction: "quiet row hover and seasonal highlight" },
    ctaPlacement: { primary: "hero-counter-action", secondary: "visit-band", early: "inside first collage" },
    motion: { primitive: "collage-depth-parallax", library: "gsap-scrolltrigger", reducedMotion: "static stacked collage" },
    mobileRecomposition: { strategy: "stacked-product-collage", rules: ["stack product stills into an intentional offset stack", "turn shelf rows into full-width touch targets", "keep the visit action visible without overlaying copy"] },
    prohibitedPatterns: ["generic-split-hero", "uniform-rounded-card-grid", "cool-blue-saas-palette", "heavy-pill-navigation", "dense-dashboard-services", "monochrome-editorial-black"],
    requiredSignatureElements: [
      { id: "collage-hero", selector: "[data-reference-signature=collage-hero]", description: "asymmetrical product collage opening" },
      { id: "seasonal-shelf", selector: "[data-reference-signature=seasonal-shelf]", description: "seasonal menu or shelf rows" },
      { id: "visit-band", selector: "[data-reference-signature=visit-band]", description: "graphic band that moves visitors toward a visit or order" },
      { id: "product-still-overlap", selector: "[data-reference-signature=product-still-overlap]", description: "overlapping product stills with varied crops" },
    ],
    acceptanceChecks: ["hero uses a loose product collage rather than a symmetric split", "services read as seasonal shelf rows", "a graphic visit or order band appears before the closing contact", "mobile keeps the collage relationship while stacking safely"],
  },
  "launchloom-nocturnal-salon": referenceFamilyProfile("LaunchLoom nocturnal salon study", {
    hero: ["full-bleed low-light room with inset statement", "scene-led with copy anchored to the image", "single cinematic opening scene"],
    nav: ["discreet wordmark and corner links", "top edge over image", "compact inline links"],
    type: ["high-contrast display serif", "neutral humanist sans", "large statement with small utility labels"],
    palette: [["near-black", "espresso", "warm ivory"], "warm ivory", ["muted brass", "amber"], "low-light contrast with clear text surfaces"],
    image: ["warm interior and material close-ups", "wide room scene followed by tight detail crops", "light sources and material texture"],
    sections: ["hero", "image-chapter", "editorial-intro", "services", "process", "closing-scene", "faq", "contact"],
    services: ["sensory service chapters", "image-led chapter transitions"],
    cta: ["quiet booking action in hero", "service chapter link", "after opening scene"],
    motion: ["slow scene crossfade", "gsap-scrolltrigger", "use static image chapters"],
    mobile: ["single-column cinematic scenes", ["keep the call action in the opening flow", "crop people and materials safely", "remove pinned scenes"]],
    prohibited: ["generic-card-wall", "pill-navbar", "bright clinical palette", "decorative-numbered-service-cards"],
    signatures: [["nocturnal-scene", "full-bleed low-light opening scene"], ["material-chapter", "distinct material or atmosphere image chapter"]],
    checks: ["the hero is an image-led room scene, not a split template", "warm highlights remain legible against dark surfaces", "mobile preserves the scene-to-detail rhythm"],
  }),
  "care-modern-clinic-mosaic": referenceFamilyProfile("Care modern-clinic image mosaic study", {
    hero: ["left-aligned care statement beside offset image windows", "asymmetric copy-and-mosaic composition", "opening statement and image cluster"],
    nav: ["compact utility links", "top edge", "simple inline links"],
    type: ["humanist grotesk", "neutral sans", "large stacked headline with concise supporting text"],
    palette: [["warm white", "soft sage", "deep green"], "deep green", ["muted yellow", "sage"], "calm contrast with restrained color panels"],
    image: ["offset care-image mosaic", "one broad landscape crop with smaller supporting windows", "people and setting kept recognizable"],
    sections: ["hero", "image-mosaic", "conversion-band", "editorial-intro", "services", "process", "faq", "proof", "contact"],
    services: ["open editorial service panels", "row expansion or direct service links"],
    cta: ["first-conversation action within the opening region", "service-specific next step", "immediately after hero"],
    motion: ["staggered image-window reveal", "css", "show the complete still mosaic"],
    mobile: ["image-first stacked mosaic", ["stack image windows without overlap", "keep headline and primary action before supporting copy", "preserve service-row tap targets"]],
    prohibited: ["unrelated image grid", "generic bento-card wall", "long why-us paragraph", "duplicated care claims"],
    signatures: [["care-image-mosaic", "offset image windows beside the care promise"], ["open-service-panels", "open service rows instead of a uniform card wall"]],
    checks: ["the hero image cluster and copy are asymmetrical", "the first conversion action follows the opening promise", "service options remain scannable"],
  }),
  "quiet-care-consultation": referenceFamilyProfile("Quiet care consultation study", {
    hero: ["warm editorial statement beside an illustrated person window", "left copy with a large right portrait illustration", "headline, short reassurance, and action"],
    nav: ["quiet inline care links", "top edge", "compact inline links"],
    type: ["editorial serif", "quiet neutral sans", "large calm headline with short supporting copy"],
    palette: [["warm white", "deep green", "soft sage"], "deep green", ["muted sage"], "soft welcoming contrast"],
    image: ["single illustrated person framed in a large arch", "portrait crop inside a soft architectural mask", "person silhouette centered in the arch"],
    sections: ["hero", "editorial-intro", "services", "contact"],
    services: ["ruled care-service rows", "simple direct links"],
    cta: ["low-pressure conversation action", "service-row links", "in the opening copy"],
    motion: ["subtle portrait-mask reveal", "css", "show the complete illustration"],
    mobile: ["single-column care consultation", ["place the illustration after the promise", "keep service rows full-width", "keep contact action close to the form"]],
    prohibited: ["clinical blue dashboard", "generic service cards", "invented staff portrait", "long why-us essay"],
    signatures: [["care-promise", "warm editorial care promise"], ["care-service-ledger", "ruled care-service rows"]],
    checks: ["the portrait is clearly illustrative rather than a claimed staff member", "the service rows remain scannable", "the first action is low-pressure and visible"],
  }),
  "care-concierge-cinematic": referenceFamilyProfile("Care concierge cinematic study", {
    hero: ["dark full-width landscape with left-anchored care promise", "text over a full-bleed natural scene", "cinematic hero with action visible"],
    nav: ["quiet text navigation over image", "top edge", "compact text menu"],
    type: ["editorial serif display", "neutral sans", "large headline anchored to image with short support"],
    palette: [["deep forest", "near-black", "bone"], "bone", ["soft sage"], "cinematic contrast with warm natural image"],
    image: ["full-width landscape with care context", "darkened cover crop with subject-safe focus", "horizon and human figures"],
    sections: ["hero", "services", "image-chapter", "proof", "process", "faq", "contact"],
    services: ["ruled service index", "direct row-to-service links"],
    cta: ["hero request action", "service index links", "inside hero"],
    motion: ["subtle landscape parallax", "gsap-scrolltrigger", "use the static hero crop"],
    mobile: ["stacked cinematic story", ["retain headline contrast over image", "move secondary contact action into flow", "avoid image-dependent text placement"]],
    prohibited: ["centered floating card", "destination-style service tiles", "automatic video requirement", "dark surface without contrast"],
    signatures: [["care-cinematic-hero", "dark natural image with anchored opening copy"], ["service-index", "horizontal ruled service index"]],
    checks: ["copy is anchored over a natural full-width hero", "service navigation appears early", "static image remains complete when motion is disabled"],
  }),
  "care-wellness-journal": referenceFamilyProfile("Care wellness journal study", {
    hero: ["framed editorial statement beside a multi-window image mosaic", "asymmetric text panel and image windows", "compact editorial opening"],
    nav: ["small wordmark with restrained utility links", "top edge", "inline compact links"],
    type: ["editorial serif", "quiet neutral sans", "large italic statement with compact captions"],
    palette: [["near-black", "soft ivory", "care green"], "soft ivory", ["muted mint"], "dark-light chapters with readable inversion"],
    image: ["repeated landscape and care-image windows", "asymmetric rectangular mosaic", "wide landscape and people"],
    sections: ["hero", "image-mosaic", "editorial-intro", "services", "image-chapter", "process", "faq", "contact"],
    services: ["compact editorial service panels", "simple row links"],
    cta: ["conversation action in hero panel", "service-row link", "within the opening panel"],
    motion: ["gentle image-window reveal", "css", "static image mosaic"],
    mobile: ["editorial single column with image stack", ["unframe the headline when space is narrow", "stack the crops", "keep body copy short and actions visible"]],
    prohibited: ["unrelated card wall", "centered generic split hero", "decorative marquee", "dense long-form why-us copy"],
    signatures: [["journal-opening", "framed editorial copy and image-window mosaic"], ["care-chapter", "clear surface transition into a care story"]],
    checks: ["opening keeps the editorial frame and mosaic relationship", "large dark and light sections remain distinct", "the service list does not become a generic grid"],
  }),
  "trades-project-led": referenceFamilyProfile("Trades project-led study", {
    hero: ["oversized service poster beside a three-window project image stack", "dark text field beside tall image crops", "headline and request action visible before the next section"],
    nav: ["small wordmark and direct utility links", "top edge", "condensed inline links"],
    type: ["bold compressed sans", "technical sans", "very large multi-line service statement"],
    palette: [["near-black", "deep green", "warm white"], "warm white", ["service orange"], "high-contrast trade-service poster"],
    image: ["project-led image windows", "one tall crop with two supporting windows", "finished work or equipment"],
    sections: ["hero", "image-chapter", "services", "process", "coverage", "faq", "contact"],
    services: ["large-type service index", "open or navigate by service row"],
    cta: ["request action within poster hero", "call action beside primary request", "inside the opening poster"],
    motion: ["layered image-mask reveal", "gsap-scrolltrigger", "show the project image stack statically"],
    mobile: ["poster-first image stack", ["reduce headline scale before cropping", "stack image windows in document order", "keep both request and call actions reachable"]],
    prohibited: ["3D object stage", "decorative number columns", "uniform service-card grid", "split hero with tiny text"],
    signatures: [["trade-poster", "large service poster headline"], ["project-window-stack", "asymmetric vertical project image windows"]],
    checks: ["the service promise dominates the hero", "images are clearly project evidence, not abstract decoration", "service index follows the opening scene"],
  }),
  "spicer-roofing-storm-response": referenceFamilyProfile("Spicer storm-response roofing template", {
    hero: ["dark roof-scene with oversized storm inspection promise", "left poster copy over an image and gradient with roof illustration on the right", "complete alert strip, navigation, promise, and first request action"],
    nav: ["compact trade utility bar", "below a full-width orange storm-alert strip", "brand with one phone action and a compact menu"],
    type: ["heavy condensed grotesk", "compact humanist sans", "large poster headline with small technical labels"],
    palette: [["near-black", "charcoal", "warm paper"], "warm white", ["signal orange", "roofline amber"], "high contrast with orange reserved for urgency and actions"],
    image: ["cinematic roofline illustration and dark texture", "wide cover crop with a text-safe charcoal fade", "roof edge and warm light on the right"],
    sections: ["hero", "conversion-band", "services", "image-chapter", "process", "pricing", "proof", "faq", "contact"],
    services: ["ground-level symptom checklist and service choices", "diagnostic state plus accessible work comparison"],
    cta: ["inspection request in first viewport", "phone action beside request", "after the alert band and inside the hero"],
    motion: ["damage-check state and comparison handle", "native-css-and-browser-events", "static comparison with all choices visible"],
    mobile: ["poster-first stacked service flow", ["keep promise and actions together", "stack diagnostics without lateral scrolling", "make comparison keyboard and touch accessible"]],
    prohibited: ["copied source claims", "invented warranty metrics", "unverified insurance promise", "generic card wall", "unsupported emergency availability"],
    signatures: [["storm-alert-band", "high visibility band above utility navigation"], ["damage-self-check", "ground-level symptom checklist"], ["work-comparison", "accessible before/after control"], ["claim-timeline", "homeowner and provider responsibility steps"]],
    checks: ["service and next action are immediate", "urgent and planned work are distinct", "all numbers come from sealed facts", "mobile has no overflow or drag-only control"],
  }),
  "spicer-plumber-dispatch-console": referenceFamilyProfile("Spicer emergency plumber dispatch template", {
    hero: ["emergency promise beside a dispatch-console instrument", "left copy and right console panel in a dark split composition", "phone and next step visible in first viewport"],
    nav: ["compact dispatcher utility bar", "contact strip above direct service links", "brand and phone remain visible with brief menu"],
    type: ["heavy condensed grotesk", "compact technical sans", "short high-impact headline with data labels"],
    palette: [["deep navy", "blue-black", "slate panel"], "soft white", ["cyan", "signal yellow"], "high contrast instrument-panel readability"],
    image: ["low-light pipe-room atmosphere with embedded console", "horizontal background with strong navy overlay", "console and pipe detail"],
    sections: ["hero", "conversion-band", "services", "pricing", "proof", "coverage", "faq", "contact"],
    services: ["three-path emergency triage and flat-rate table", "choice-based routes with service-category filters"],
    cta: ["same-day service action beside console", "call beside request", "inside the emergency opening"],
    motion: ["service category filter and console state", "native-css-and-browser-events", "stable console and full rate table"],
    mobile: ["stacked emergency-to-planned-service flow", ["show emergency copy and phone first", "stack triage choices", "convert table to labeled rows", "remove map motion"]],
    prohibited: ["copied source name or demo claims", "invented ETA or dispatch status", "unverified credentials or reviews", "fake coverage map", "generic card wall"],
    signatures: [["dispatch-console", "hero console for live client-supplied service information"], ["emergency-triage", "urgent, scheduled, and unsure paths"], ["flat-rate-table", "scannable scope and price tokens"], ["response-zone-graphic", "verified service-area visualization"]],
    checks: ["phone route is immediate", "scheduled jobs can compare service rows", "ETA and price remain sealed tokens", "mobile rate list avoids sideways scroll"],
  }),
  "colorlib-bedrock-industrial-contractor": referenceFamilyProfile("Colorlib Bedrock industrial contractor template", {
    hero: ["oversized industrial poster over a wide construction photo", "stacked type left with site image supporting right half", "logo, promise, brief, and request fit first viewport"],
    nav: ["thin technical utility bar", "top edge with compact section links", "short utility menu with one action"],
    type: ["heavy compressed grotesk", "neutral technical sans", "large stacked headline and small uppercase metadata"],
    palette: [["charcoal", "blue-black", "steel slate"], "cool white", ["construction yellow", "muted steel blue"], "industrial clarity with one precise signal accent"],
    image: ["CC0 construction-site photography with dark overlay", "wide hero cover and small rectangular project crops", "site activity behind the headline"],
    sections: ["hero", "conversion-band", "services", "coverage", "projects", "process", "proof", "faq", "contact"],
    services: ["capability grid followed by sector ledger", "direct sector navigation"],
    cta: ["tender request in header and hero", "project case study", "after concise project promise"],
    motion: ["native section navigation and discreet theme control", "native-css-and-browser-events", "static image, grid, and process sequence"],
    mobile: ["stacked project fieldbook", ["scale poster type before changing order", "put project action before capabilities", "stack sector ledger and process"]],
    prohibited: ["copied tender claims", "invented turnover or staff metrics", "fabricated accreditations", "stock images presented as client work", "generic SaaS card wall"],
    signatures: [["industrial-poster", "oversized promise over construction site"], ["sector-ledger", "scannable factual capability list"], ["project-proof-grid", "work images as evidence"], ["tender-close", "scope request form and tender context"]],
    checks: ["one-screen desktop opening", "project proof uses approved assets", "credentials are verified", "tender action is clear", "mobile stays overflow-free"],
  }),
  "trades-field-report": referenceFamilyProfile("Trades field-report study", {
    hero: ["centered narrow service statement above an offset photo mosaic", "compact editorial column with image tiles", "headline, summary, and primary action fit the opening"],
    nav: ["simple text navigation", "top edge", "inline links or compact menu"],
    type: ["neutral geometric sans", "neutral sans", "moderate display size with tight field notes"],
    palette: [["warm white", "deep green", "service orange"], "deep green", ["service orange"], "clear utility contrast with restrained trade accent"],
    image: ["two horizontal project crops with staggered alignment", "wide rectangles with one supporting tile", "finished project detail"],
    sections: ["hero", "image-mosaic", "services", "image-chapter", "process", "coverage", "faq", "contact"],
    services: ["plain diagnostic service index", "direct expandable rows"],
    cta: ["primary service request in hero", "phone call as secondary action", "immediately under hero summary"],
    motion: ["subtle tile reveal", "css", "leave all project tiles visible"],
    mobile: ["centered narrow column with stacked work", ["avoid oversized line breaks", "put image tiles after the opening copy", "keep service descriptions to one sentence"]],
    prohibited: ["dark cinematic overlay", "oversized wordmark poster", "generic rounded card wall", "service process hidden below long copy"],
    signatures: [["field-report-intro", "compact centered service statement"], ["diagnostic-index", "direct list of service or repair options"]],
    checks: ["headline remains balanced at desktop and mobile widths", "photos sit directly after the promise", "the service list is plain and easy to scan"],
  }),
  "launchloom-urgent-trade-poster": referenceFamilyProfile("LaunchLoom urgent trade poster", {
    hero: ["urgent problem statement beside a high-visibility geometric signal", "left-anchored service type against an abstract warning frame", "one-screen problem summary with request and call actions"],
    nav: ["compact direct service navigation", "light utility strip above the poster", "short inline links and a visible phone action"],
    type: ["heavy industrial grotesk", "neutral utility sans", "oversized multi-line problem statement with tight supporting copy"],
    palette: [["deep petrol", "warm paper", "signal orange", "warning yellow"], "white", ["signal orange", "warning yellow"], "high visibility with clean light-surface contrast"],
    image: ["abstract geometric warning frame", "diagonal frame and circular diagnostic symbol", "graphic signal rather than decorative stock photography"],
    sections: ["hero", "conversion-band", "services", "image-chapter", "faq", "contact"],
    services: ["problem-first diagnostic index", "direct expandable issue rows"],
    cta: ["service request action in hero", "call-now action beside request", "inside the opening poster"],
    motion: ["subtle warning-frame offset reveal", "css", "keep the full geometry and issue index static"],
    mobile: ["stacked emergency service poster", ["reduce headline size before changing line breaks", "place the signal shape after the opening copy", "keep request and call actions visible and touch-safe"]],
    prohibited: ["fake live emergency status", "invented response-time guarantee", "generic rounded-card wall", "low-contrast orange text", "urgent claims unsupported by client facts"],
    signatures: [["urgent-service-poster", "problem-led poster with a high-visibility geometric frame"], ["diagnostic-index", "plain issue-first service rows"], ["urgent-action-band", "high-contrast next-step band after the opening scene"]],
    checks: ["the visitor can identify the service and location intent quickly", "the phone and request options are distinct", "urgency is conveyed by hierarchy without fabricated availability claims", "mobile preserves contrast and action visibility"],
  }),
  "launchloom-kinetic-club": referenceFamilyProfile("LaunchLoom kinetic club study", {
    hero: ["large action poster with a strong typographic block", "edge-led copy over energetic color field", "one-screen statement and action"],
    nav: ["compact utility links", "top edge", "collapsed or short inline navigation"],
    type: ["heavy condensed sans", "neutral sans", "oversized poster scale with small program labels"],
    palette: [["ink", "acid lime", "signal orange"], "off-white", ["acid lime", "signal orange"], "high-energy contrast"],
    image: ["documentary action stills", "full-bleed crop with subject-safe framing", "athlete or movement subject"],
    sections: ["hero", "conversion-band", "program-bands", "image-chapter", "proof", "faq", "contact"],
    services: ["horizontal class or program bands", "directional row reveal"],
    cta: ["primary class action in hero", "program-band action", "inside the poster"],
    motion: ["velocity-linked type and band reveal", "gsap-scrolltrigger", "freeze poster and show bands"],
    mobile: ["stacked action poster", ["replace horizontal scrub with touch-safe rows", "protect action buttons from headline overlap", "reduce motion when requested"]],
    prohibited: ["soft editorial card grid", "decorative numbered services", "long about section before classes"],
    signatures: [["club-poster", "oversized performance headline"], ["program-bands", "horizontal class or program bands"]],
    checks: ["the opening has athletic energy without copying a brand", "program options are not generic cards", "mobile remains usable without scroll-jacking"],
  }),
  "launchloom-clear-counsel": referenceFamilyProfile("LaunchLoom clear-counsel study", {
    hero: ["narrow professional positioning beside portrait proof", "quiet asymmetrical editorial columns", "positioning and primary contact action in the opening"],
    nav: ["small wordmark with direct links", "top edge", "simple compact menu"],
    type: ["editorial serif display", "humanist sans", "large restrained statement with fine labels"],
    palette: [["warm white", "ink", "muted ochre"], "ink", ["muted ochre"], "high-legibility professional contrast"],
    image: ["single professional portrait with generous negative space", "vertical portrait crop", "face and hands kept in frame"],
    sections: ["hero", "editorial-intro", "proof", "magazine-archive", "process", "faq", "contact"],
    services: ["ruled expertise ledger", "direct topic links"],
    cta: ["consultation action near positioning", "expertise ledger links", "after opening proof"],
    motion: ["subtle ledger-row reveal", "css", "static portrait and service rows"],
    mobile: ["single-column expertise page", ["stack portrait after the positioning statement", "turn ledger into touch rows", "keep credentials factual and supplied"]],
    prohibited: ["unverified client logo wall", "invented testimonials", "generic split hero", "decorative result metrics"],
    signatures: [["professional-positioning", "narrow confident positioning statement"], ["expertise-ledger", "ruled expertise or service rows"]],
    checks: ["portrait is supporting proof, not a stock identity claim", "expertise is presented as a ledger rather than cards", "only verified credentials or outcomes appear"],
  }),
  "a1-collage-composition": referenceFamilyProfile("A1 Gallery Craft collage composition", {
    hero: ["centered product promise above an illustrated horizon and interface capture", "centered serif copy with large product screenshot", "statement and main product image form the first scene"],
    nav: ["floating capsule with concise utility links", "top-center over the scene", "compact inline product links"],
    type: ["editorial serif", "clean sans", "centered statement with product-scale type"],
    palette: [["pale sky blue", "soft white", "charcoal"], "charcoal", ["periwinkle", "butter yellow", "coral"], "light airy surfaces with dark readable type"],
    image: ["illustrated landscape framing a product interface and feature gallery", "wide illustrated scene plus rectangular UI crops", "interface content centered within the scene"],
    sections: ["hero", "image-mosaic", "editorial-intro", "services", "projects", "image-chapter", "contact"],
    services: ["icon-led product capability rail", "horizontal feature selection"],
    cta: ["single primary product action in hero", "feature gallery link", "within the centered opening"],
    motion: ["restrained illustrated-layer drift", "css", "static illustration and interface capture"],
    mobile: ["stacked product scene", ["stack the interface capture under the promise", "keep collage crops distinct", "avoid pinning or horizontal overflow"]],
    prohibited: ["dark luxury palette", "generic bento dashboard", "copying product marks or interface copy", "unrelated portrait collage"],
    signatures: [["illustrated-product-scene", "illustrated horizon framing a product interface"], ["feature-icon-rail", "compact icon-led capability rail"]],
    checks: ["the interface capture is the visual anchor", "illustration supports rather than obscures the product", "brand assets and copy are not copied from the source"],
  }),
  "a1-kinetic-command": referenceFamilyProfile("A1 Gallery SCS kinetic command", {
    hero: ["full-viewport centered condensed statement over a luminous ring", "centered poster geometry", "headline and one action dominate the viewport"],
    nav: ["minimal command links and one action", "top edge", "condensed top menu"],
    type: ["condensed technical sans", "monospaced utility sans", "large all-caps message"],
    palette: [["near-black", "deep navy"], "cool white", ["signal orange", "electric cyan", "warm yellow"], "high contrast with controlled luminous accents"],
    image: ["abstract circular light field and atmospheric color transition", "centered ring with radial depth", "ring center"],
    sections: ["hero", "proof", "editorial-intro", "services", "process", "contact"],
    services: ["wide program bands", "horizontal service progression"],
    cta: ["single command action in hero", "service band action", "top or center of hero"],
    motion: ["ring glow and velocity-linked type", "gsap-scrolltrigger", "static ring with frozen headline"],
    mobile: ["centered poster and stacked bands", ["scale condensed type to fit", "simplify radial glow", "stack program bands without horizontal scroll"]],
    prohibited: ["soft pastel editorial layout", "generic card grid", "copied client logos or security claims", "heavy pill navigation"],
    signatures: [["luminous-ring-poster", "centered headline over circular light field"], ["program-bands", "wide service or program bands"]],
    checks: ["the ring is an abstract visual mechanic, not a copied logo", "headline remains the first visual read", "mobile removes unnecessary radial decoration"],
  }),
  "a1-object-stage": referenceFamilyProfile("A1 Gallery MCKP object stage", {
    hero: ["oversized stacked product heading above a single tilted device render", "large left-led type with a centered object stage", "headline and object remain one visual composition"],
    nav: ["minimal product utility navigation", "top edge", "compact utility links"],
    type: ["bold neutral sans with restrained serif detail", "clean sans", "oversized stacked product statement"],
    palette: [["near-black", "cool white", "dark slate"], "white", ["cyan blue"], "high contrast around one luminous object"],
    image: ["single 3D device render on a deep field", "tilted isolated object with deep-focus edges", "object silhouette and lit screen"],
    sections: ["hero", "image-chapter", "projects", "services", "contact"],
    services: ["object-led capability atlas", "object state changes into gallery examples"],
    cta: ["primary product action below hero copy", "secondary explore action", "directly under the hero statement"],
    motion: ["object focus and camera drift", "gsap-scrolltrigger", "poster-frame object with no scroll lock"],
    mobile: ["object-first stacked chapters", ["scale the object before cropping it", "keep project tiles scrollable", "disable pinned or locked motion"]],
    prohibited: ["unrelated 3D decoration", "generic bento wall", "brand or device-copy reproduction", "autoplay scroll lock"],
    signatures: [["object-stage", "single isolated 3D object as the visual anchor"], ["object-gallery", "gallery that demonstrates object states or mockups"]],
    checks: ["one object anchors the opening instead of decorative 3D", "the object keeps a readable silhouette on mobile", "interactive motion has a static fallback"],
  }),
  "a1-kinetic-founder": referenceFamilyProfile("A1 Gallery Uncommon Founder kinetic atlas", {
    hero: ["centered founder statement with pixel-fractured accent words", "centered typography on a dark field", "statement, short context, and contact action"],
    nav: ["small direct links with single contact action", "top edge", "compact inline links"],
    type: ["large modern sans with pixelated accent treatment", "monospaced micro-labels and neutral sans", "high-impact centered founder statement"],
    palette: [["charcoal", "near-black"], "white", ["electric lime"], "dark field with restrained pixel accent"],
    image: ["sparse pixel fragments and partner marks", "graphic fragments distributed through negative space", "type and small square fragments"],
    sections: ["hero", "proof", "editorial-intro", "magazine-archive", "process", "contact"],
    services: ["goal atlas with progressive entries", "scroll-linked goal reveal"],
    cta: ["contact action inside hero", "goal atlas action", "below the founder statement"],
    motion: ["pixel-text reveal and scroll-linked goal index", "gsap-scrolltrigger", "static typography and goal list"],
    mobile: ["stacked founder statement and goal atlas", ["remove decorative fragments before reducing text", "keep goal rows full width", "preserve visible contact action"]],
    prohibited: ["generic split hero", "bento-card wall", "invented client marks or founder claims", "glitch that harms legibility"],
    signatures: [["pixel-founder-statement", "centered typography with restrained pixel interruption"], ["goal-atlas", "numbered or indexed goal sequence"]],
    checks: ["pixel treatment is limited to accents", "all statement copy remains readable", "proof logos are used only when supplied by the client"],
  }),
  "a1-cinematic-3d": referenceFamilyProfile("A1 Gallery Ethan Suero cinematic studio", {
    hero: ["large editorial studio statement beside a featured digital-work scene", "dark oversized typography with offset project imagery", "first project image and statement share the opening"],
    nav: ["distributed project index and inquiry action", "top and left edge", "compact overlay menu"],
    type: ["restrained modern sans", "technical sans", "large stacked agency statement with small labels"],
    palette: [["charcoal", "near-black", "soft white"], "white", ["cool gray"], "dark cinematic contrast with restrained highlights"],
    image: ["featured web experience and 3D/video project collage", "one dominant interface image with smaller project crops", "project screen or object composition"],
    sections: ["hero", "projects", "editorial-intro", "services", "image-chapter", "contact"],
    services: ["featured-work rail", "project-first browsing"],
    cta: ["inquiry action in upper utility nav", "featured-work rail", "near the hero statement"],
    motion: ["slow scene reveal with cursor-safe project browsing", "gsap-scrolltrigger", "static project panels"],
    mobile: ["stacked studio portfolio chapters", ["convert distributed links into a compact menu", "stack projects as swipe-safe panels", "avoid autoplay dependence"]],
    prohibited: ["generic flat card grid", "unbounded autoplay video", "copied studio brand or project text", "unrelated 3D object"],
    signatures: [["cinematic-studio-opening", "dark large-type studio opening"], ["featured-work-rail", "featured digital project rail"]],
    checks: ["project imagery is the visual proof", "type and project scene form one composition", "motion does not obscure project navigation"],
  }),
});

function familyForRoute(route) {
  const text = routeText(route);
  if (/kokoro|spatial-editorial|magazine-ledger|warm-architectural/u.test(text)) return "kokoro-editorial-architecture";
  if (/kinetic-club|program-bands|veyra|agent-wave|athletic/u.test(text)) return "veyra-kinetic-typography";
  if (/health|masked|mosaic|clinical/u.test(text)) return "health-portal-masked-mosaic";
  if (/skyelite|horizon|destination|cinematic-stage/u.test(text)) return "skyelite-cinematic-luxury";
  if (/digital-liquid|liquid|glass|capability-cells/u.test(text)) return "digital-experiences-liquid-glass";
  if (/neighborhood|market-day|seasonal-shelf|product-collage|loose-product/u.test(text)) return "neighborhood-table-collage";
  if (/jack|3d|object|museum|spatial-object/u.test(text)) return "3d-portfolio-object-led";
  if (/viktor|vortex|studio-column|marquee/u.test(text)) return "vortex-editorial-studio";
  return "kokoro-editorial-architecture";
}

function screenshotPath(route, kind) {
  if (kind === "desktop") {
    return clean(
      route.desktopScreenshotPath || route.screenshotPath || route.evidence?.find((item) => item.screenshotPath)?.screenshotPath,
      500,
    );
  }
  return clean(
    route.mobileScreenshotPath || route.evidence?.find((item) => item.mobileScreenshotPath)?.mobileScreenshotPath,
    500,
  );
}

function evidenceRecord(route, kind) {
  const relativePath = screenshotPath(route, kind);
  const absolutePath = relativePath ? path.resolve(relativePath) : "";
  return {
    path: relativePath,
    absolutePath,
    available: Boolean(relativePath && fs.existsSync(absolutePath)),
    required: kind === "desktop",
    source: clean(route.source || route.evidence?.[0]?.source, 120),
    rights: clean(route.rights || route.evidence?.[0]?.rights, 40),
  };
}

function unregisteredReferenceProfile(route, familyId) {
  const sequence = Array.isArray(route.referenceDna?.sectionSequence) &&
      route.referenceDna.sectionSequence.length >= 3
    ? route.referenceDna.sectionSequence
    : ["hero", "services", "faq", "contact"];
  const hero = clean(route.heroGeometry, 160) || "reference-specific opening geometry";
  const navigation = clean(route.navigation, 160) || "navigation observed in reference screenshot";
  const services = clean(route.servicePresentation, 200) || "service treatment observed in reference screenshot";
  const image = clean(route.imageStrategy, 180) || "image treatment observed in reference screenshot";
  const motion = route.motionOpportunities?.[0] || "source-specific interaction from visual evidence";
  const mobile = clean(route.mobileBehavior, 240) || "recompose according to the required mobile screenshot";
  return {
    referenceName: clean(route.referenceName || route.name, 180) || familyId,
    heroGeometry: {
      mode: hero,
      alignment: "match the directly observed screenshot composition",
      viewport: "preserve the reference opening while keeping service and action visible",
    },
    navigationGeometry: {
      mode: navigation,
      placement: "use the placement shown by the direct reference screenshot",
      mobile,
    },
    typography: {
      display: clean(route.typographyCategory, 120) || "source-specific display typography",
      body: "readable neutral body type unless source evidence supports a different role",
      scale: "preserve the reference hierarchy and recompose for viewport size",
    },
    palette: {
      surfaces: ["derive from the direct reference screenshot"],
      ink: "derive from screenshot while preserving accessible contrast",
      accents: ["derive from the direct reference screenshot"],
      contrastIntent: "retain the source hierarchy while meeting contrast requirements",
    },
    imageTreatment: {
      mode: image,
      crop: "match the observed image placement and crop strategy",
      focalPoint: "preserve the visible subject and text-safe regions",
    },
    sectionSequence: sequence,
    servicePresentation: {
      pattern: services,
      interaction: "use only the interaction evidenced by the source or the typed client brief",
    },
    ctaPlacement: {
      primary: "place the verified client action at the observed primary decision point",
      secondary: "use only a verified secondary action",
      early: "near the opening promise, as supported by the reference geometry",
    },
    motion: {
      primitive: motion,
      library: "native browser behavior unless a stronger library is explicitly needed",
      reducedMotion: "show all content and use a static image state",
    },
    mobileRecomposition: {
      strategy: mobile,
      rules: ["preserve section order", "keep primary action reachable", "avoid horizontal page overflow"],
    },
    prohibitedPatterns: [
      ...(Array.isArray(route.prohibitedPatterns) ? route.prohibitedPatterns : []),
      "unrelated reference-family fallback",
      "generic-card-wall",
      "unverified source claims",
    ],
    requiredSignatureElements: [
      { id: "reference-opening", selector: "[data-reference-signature=reference-opening]", description: hero },
      { id: "reference-service-treatment", selector: "[data-reference-signature=reference-service-treatment]", description: services },
    ],
    acceptanceChecks: [
      "rendered hero matches the selected reference rather than a generic fallback",
      "section order and service treatment follow the selected reference evidence",
      "mobile follows the source-specific recomposition",
      "business facts remain sourced from sealed verified content",
    ],
  };
}

export function buildReferenceDna(route, { requireEvidence = false } = {}) {
  const familyId = clean(route.referenceFamilyId, 80) || familyForRoute(route);
  const defaults = FAMILY_DEFAULTS[familyId] || unregisteredReferenceProfile(route, familyId);
  const desktop = evidenceRecord(route, "desktop");
  const mobile = evidenceRecord(route, "mobile");
  const incompleteReasons = [];
  if (!desktop.available) incompleteReasons.push("required desktop reference screenshot is unavailable");
  if (mobile.path && !mobile.available) incompleteReasons.push("declared mobile reference screenshot is unavailable");
  if (!desktop.source) incompleteReasons.push("reference source is missing");
  if (!desktop.rights) incompleteReasons.push("reference rights are missing");
  const dna = {
    version: REFERENCE_DNA_VERSION,
    familyId,
    referenceName: clean(route.referenceName, 180) || defaults.referenceName,
    source: desktop.source,
    sourceUrl: clean(route.sourceUrl || route.evidence?.[0]?.sourceUrl, 500),
    rights: desktop.rights,
    evidence: {
      desktopScreenshot: desktop,
      mobileScreenshot: mobile.path ? mobile : null,
      annotatedDescription: clean(
        route.referenceNotes ||
          route.notes ||
          route.evidence?.[0]?.referenceNotes ||
          route.evidence?.[0]?.notes,
        1400,
      ),
      measuredDesignTokens: route.measuredDesignTokens || route.evidence?.[0]?.measuredDesignTokens || undefined,
      sourceStyles: list(route.sourceStyles || route.evidence?.[0]?.sourceStyles, 20),
      sourceFonts: list(route.sourceFonts || route.evidence?.[0]?.sourceFonts, 12),
    },
    heroGeometry: route.referenceDna?.heroGeometry || defaults.heroGeometry,
    navigationGeometry: route.referenceDna?.navigationGeometry || defaults.navigationGeometry,
    typography: route.referenceDna?.typography || defaults.typography,
    palette: route.referenceDna?.palette || defaults.palette,
    imageTreatment: route.referenceDna?.imageTreatment || defaults.imageTreatment,
    sectionSequence: normalizeSectionSequence(
      route.referenceDna?.sectionSequence || defaults.sectionSequence,
      familyId,
    ),
    sectionSequenceEvidence: list(
      route.referenceDna?.sectionSequenceEvidence ||
        route.referenceDna?.sectionSequence ||
        defaults.sectionSequence,
      20,
    ),
    servicePresentation: route.referenceDna?.servicePresentation || defaults.servicePresentation,
    ctaPlacement: route.referenceDna?.ctaPlacement || defaults.ctaPlacement,
    motion: route.referenceDna?.motion || defaults.motion,
    mobileRecomposition: route.referenceDna?.mobileRecomposition || defaults.mobileRecomposition,
    prohibitedPatterns: list([...(defaults.prohibitedPatterns || []), ...(route.prohibitedPatterns || []), ...(route.referenceDna?.prohibitedPatterns || [])], 30),
    requiredSignatureElements: route.referenceDna?.requiredSignatureElements || defaults.requiredSignatureElements,
    acceptanceChecks: list(route.referenceDna?.acceptanceChecks || defaults.acceptanceChecks, 20),
    measurements: route.referenceDna?.measurements || null,
    analyzedFromEvidence: Boolean(route.referenceDna?.analyzedFromEvidence),
    analyzerModel: clean(route.referenceDna?.analyzerModel, 160),
    analyzedAt: clean(route.referenceDna?.analyzedAt, 80),
    complete: incompleteReasons.length === 0,
    incompleteReasons,
  };
  if (requireEvidence && !dna.complete)
    throw new Error(`Reference DNA for ${route.id || route.label || "route"} is incomplete: ${incompleteReasons.join("; ")}.`);
  return dna;
}

export function validateReferenceDna(value, { requireEvidence = true } = {}) {
  if (!value || typeof value !== "object") throw new Error("Reference DNA is missing.");
  for (const field of ["familyId", "referenceName", "source", "rights", "heroGeometry", "navigationGeometry", "typography", "palette", "imageTreatment", "servicePresentation", "ctaPlacement", "motion", "mobileRecomposition"]) {
    if (!value[field]) throw new Error(`Reference DNA is missing ${field}.`);
  }
  if (!Array.isArray(value.sectionSequence) || value.sectionSequence.length < 3) throw new Error("Reference DNA needs a section sequence.");
  if (!Array.isArray(value.prohibitedPatterns) || !value.prohibitedPatterns.length) throw new Error("Reference DNA needs prohibited patterns.");
  if (!Array.isArray(value.requiredSignatureElements) || !value.requiredSignatureElements.length) throw new Error("Reference DNA needs required signature elements.");
  if (!Array.isArray(value.acceptanceChecks) || !value.acceptanceChecks.length) throw new Error("Reference DNA needs acceptance checks.");
  if (value.analyzedFromEvidence) {
    if (!value.measurements || typeof value.measurements !== "object")
      throw new Error("Evidence-analyzed Reference DNA needs measurements.");
    for (const key of ["headlineWidthRatio", "headlineHeightRatio", "heroImageOccupancyRatio", "contentColumnWidthRatio", "navTopRatio", "navSideInsetRatio", "ctaTopRatio"])
      if (!Number.isFinite(Number(value.measurements[key])))
        throw new Error(`Reference DNA measurements are missing ${key}.`);
  }
  if (requireEvidence && (!value.complete || !value.evidence?.desktopScreenshot?.available)) throw new Error(`Reference DNA ${value.familyId} is incomplete: ${value.incompleteReasons?.join("; ") || "desktop evidence is unavailable"}.`);
  return value;
}

export function assertReferenceEvidence(routes) {
  if (!Array.isArray(routes) || !routes.length) throw new Error("Creative routes require reference evidence.");
  return routes.map((route) => validateReferenceDna(buildReferenceDna(route), { requireEvidence: true }));
}

export { FAMILY_DEFAULTS as REFERENCE_FAMILIES };
