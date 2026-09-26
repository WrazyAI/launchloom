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

export function buildReferenceDna(route, { requireEvidence = false } = {}) {
  const canonical =
    route.canonicalReferenceDna ||
    route.evidence?.find((item) => item.canonicalReferenceDna)
      ?.canonicalReferenceDna ||
    null;
  const analyzed = route.referenceDna || {};
  const familyId =
    clean(canonical?.familyId, 80) ||
    clean(route.referenceFamilyId, 80) ||
    familyForRoute(route);
  const defaults =
    FAMILY_DEFAULTS[familyId] || FAMILY_DEFAULTS["kokoro-editorial-architecture"];
  const desktop = evidenceRecord(route, "desktop");
  const mobile = evidenceRecord(route, "mobile");
  const incompleteReasons = [];
  if (!desktop.available) incompleteReasons.push("required desktop reference screenshot is unavailable");
  if (mobile.path && !mobile.available) incompleteReasons.push("declared mobile reference screenshot is unavailable");
  if (!desktop.source) incompleteReasons.push("reference source is missing");
  if (!desktop.rights) incompleteReasons.push("reference rights are missing");
  const dna = {
    version: Number(canonical?.version || REFERENCE_DNA_VERSION),
    canonical: canonical?.canonical === true,
    familyId,
    referenceName:
      clean(canonical?.referenceName, 180) ||
      clean(route.referenceName, 180) ||
      defaults.referenceName,
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
      measuredDesignTokens:
        route.measuredDesignTokens ||
        route.evidence?.[0]?.measuredDesignTokens ||
        undefined,
      sourceStyles: list(
        route.sourceStyles || route.evidence?.[0]?.sourceStyles,
        20,
      ),
      sourceFonts: list(
        route.sourceFonts || route.evidence?.[0]?.sourceFonts,
        12,
      ),
      tags: list(route.tags || route.evidence?.[0]?.tags, 24),
      designTemplate:
        route.designTemplate || route.evidence?.[0]?.designTemplate || undefined,
      provenance:
        route.provenance || route.evidence?.[0]?.provenance || undefined,
      calibrationProfile:
        clean(
          route.calibrationProfile ||
            route.evidence?.[0]?.calibrationProfile,
          80,
        ) || undefined,
      referenceCalibration: route.referenceCalibration || undefined,
    },
    heroGeometry:
      canonical?.heroGeometry || analyzed.heroGeometry || defaults.heroGeometry,
    navigationGeometry:
      canonical?.navigationGeometry ||
      analyzed.navigationGeometry ||
      defaults.navigationGeometry,
    typography:
      canonical?.typography || analyzed.typography || defaults.typography,
    palette: canonical?.palette || analyzed.palette || defaults.palette,
    imageTreatment:
      canonical?.imageTreatment ||
      analyzed.imageTreatment ||
      defaults.imageTreatment,
    sectionSequence: canonical?.sectionSequence
      ? list(canonical.sectionSequence, 20)
      : normalizeSectionSequence(
          analyzed.sectionSequence || defaults.sectionSequence,
          familyId,
        ),
    sectionSequenceEvidence: list(
      canonical?.sectionSequence ||
        analyzed.sectionSequenceEvidence ||
        analyzed.sectionSequence ||
        defaults.sectionSequence,
      20,
    ),
    servicePresentation:
      canonical?.servicePresentation ||
      analyzed.servicePresentation ||
      defaults.servicePresentation,
    ctaPlacement:
      canonical?.ctaPlacement || analyzed.ctaPlacement || defaults.ctaPlacement,
    motion: canonical?.motion || analyzed.motion || defaults.motion,
    mobileRecomposition:
      canonical?.mobileRecomposition ||
      analyzed.mobileRecomposition ||
      defaults.mobileRecomposition,
    prohibitedPatterns: list(
      [
        ...(canonical
          ? []
          : FAMILY_DEFAULTS[familyId]?.prohibitedPatterns || []),
        ...(route.prohibitedPatterns || []),
        ...(canonical?.prohibitedPatterns || []),
        ...(analyzed.prohibitedPatterns || []),
      ],
      30,
    ),
    requiredSignatureElements:
      canonical?.requiredSignatureElements ||
      analyzed.requiredSignatureElements ||
      defaults.requiredSignatureElements,
    acceptanceChecks: list(
      canonical?.acceptanceChecks ||
        analyzed.acceptanceChecks ||
        defaults.acceptanceChecks,
      20,
    ),
    measurements: canonical?.measurements || analyzed.measurements || null,
    analyzedFromEvidence: Boolean(analyzed.analyzedFromEvidence),
    analyzerModel: clean(analyzed.analyzerModel, 160),
    analyzedAt: clean(analyzed.analyzedAt, 80),
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
