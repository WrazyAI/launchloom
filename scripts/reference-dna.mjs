import fs from "node:fs";
import path from "node:path";

/**
 * Reference DNA is the evidence-backed visual contract handed to a creative
 * author.  It deliberately describes mechanics, not a reference site's
 * brand, copy, assets, or trade dress.
 */
export const REFERENCE_DNA_VERSION = 1;

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
});

function familyForRoute(route) {
  const text = routeText(route);
  if (/kokoro|spatial-editorial|magazine-ledger|warm-architectural/u.test(text)) return "kokoro-editorial-architecture";
  if (/kinetic-club|program-bands|veyra|agent-wave|athletic/u.test(text)) return "veyra-kinetic-typography";
  if (/health|masked|mosaic|clinical/u.test(text)) return "health-portal-masked-mosaic";
  if (/skyelite|horizon|destination|cinematic-stage/u.test(text)) return "skyelite-cinematic-luxury";
  if (/digital-liquid|liquid|glass|capability-cells/u.test(text)) return "digital-experiences-liquid-glass";
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
  const familyId = clean(route.referenceFamilyId, 80) || familyForRoute(route);
  const defaults = FAMILY_DEFAULTS[familyId] || FAMILY_DEFAULTS["kokoro-editorial-architecture"];
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
      annotatedDescription: clean(route.referenceNotes || route.notes, 900),
    },
    heroGeometry: route.referenceDna?.heroGeometry || defaults.heroGeometry,
    navigationGeometry: route.referenceDna?.navigationGeometry || defaults.navigationGeometry,
    typography: route.referenceDna?.typography || defaults.typography,
    palette: route.referenceDna?.palette || defaults.palette,
    imageTreatment: route.referenceDna?.imageTreatment || defaults.imageTreatment,
    sectionSequence: list(route.referenceDna?.sectionSequence || defaults.sectionSequence, 20),
    servicePresentation: route.referenceDna?.servicePresentation || defaults.servicePresentation,
    ctaPlacement: route.referenceDna?.ctaPlacement || defaults.ctaPlacement,
    motion: route.referenceDna?.motion || defaults.motion,
    mobileRecomposition: route.referenceDna?.mobileRecomposition || defaults.mobileRecomposition,
    prohibitedPatterns: list([...(defaults.prohibitedPatterns || []), ...(route.prohibitedPatterns || []), ...(route.referenceDna?.prohibitedPatterns || [])], 30),
    requiredSignatureElements: route.referenceDna?.requiredSignatureElements || defaults.requiredSignatureElements,
    acceptanceChecks: list(route.referenceDna?.acceptanceChecks || defaults.acceptanceChecks, 20),
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
  if (requireEvidence && (!value.complete || !value.evidence?.desktopScreenshot?.available)) throw new Error(`Reference DNA ${value.familyId} is incomplete: ${value.incompleteReasons?.join("; ") || "desktop evidence is unavailable"}.`);
  return value;
}

export function assertReferenceEvidence(routes) {
  if (!Array.isArray(routes) || !routes.length) throw new Error("Creative routes require reference evidence.");
  return routes.map((route) => validateReferenceDna(buildReferenceDna(route), { requireEvidence: true }));
}

export { FAMILY_DEFAULTS as REFERENCE_FAMILIES };
