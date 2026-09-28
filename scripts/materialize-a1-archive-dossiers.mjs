import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReferenceDossier } from "./reference-dossier.mjs";

const root = path.resolve(import.meta.dirname, "..");
const evidenceDate = "2026-09-26";
const requesterAttestation = (name, url) => `# Requester-attested screenshot and model-use clearance\n\nOn ${evidenceDate}, the LaunchLoom requester confirmed clearance for retaining full-page desktop and mobile captures of ${name}, deriving this design-mechanics prompt, and sending these captures to the LaunchLoom pipeline model as internal visual-reference input. The captured source URL is ${url}.\n\nThis dossier records requester-attested clearance. It is not a source-owner license, written grant, or independent legal verification; no source-owner grant file was attached. Keep these captures and prompt internal to the reference archive. Transfer only design mechanics. Do not publish these source captures, use them as client assets, or reproduce source copy, logos, photography, people, reviews, claims, prices, code, or trade dress. If the requester withdraws this clearance or its authority is found insufficient, disable use and remove the captures from model context pending an appropriate grant.\n`;

const entries = [
  {
    id: "a1-craft-collage-field",
    name: "Craft illustrated product-systems narrative",
    familyId: "a1-collage-composition",
    a1Slug: "craft-2025",
    captureSlug: "craft",
    sourceName: "Craft product website",
    sourceUrl: "https://www.craft.do/",
    discoveryUrl: "https://www.a1.gallery/website/craft-2025",
    businessKinds: ["productivity-software", "software", "technology"],
    tags: {
      business: ["productivity-software", "software", "technology"],
      style: ["hand-drawn-product-collage", "soft-editorial", "pastel-surfaces", "playful-precision"],
      composition: ["illustrated-sky-opening", "layered-product-ui", "alternating-feature-panels", "human-proof-pauses", "plan-comparison-close"],
      conversion: ["free-trial-entry", "feature-discovery", "plan-comparison", "download-links"],
      motion: ["cloud-depth-drift", "product-window-reveal", "swipe-safe-mobile-panels", "static-reduced-motion-state"],
      imagery: ["hand-drawn-cloud-landscape", "product-interface-scenes", "team-portrait-strip", "app-platform-badges"],
    },
    dna: {
      annotatedDescription: "A light productivity product story begins with a soft blue illustrated sky and large centered promise, then places real interface imagery into layered paper-like windows. Small capability glyphs and a portrait strip create early rhythm. The rest alternates lavender, mint, yellow, and white feature panels with concise editorial copy, interface demos, one-line customer quotes, integrations, pricing, a green trial close, and a dense dark footer. The design uses product UI as its main imagery rather than a generic lifestyle hero.",
      heroGeometry: { mode: "centered product promise over a hand-drawn sky, with overlapping workspace windows at the lower edge", alignment: "compact top utility navigation, centered short headline, clear trial action, product UI anchoring the composition", viewport: "brand, product category, promise, trial path, and first product interface are visible without an unnecessary copy wall" },
      navigationGeometry: { mode: "compact horizontal product navigation with account and trial actions", placement: "small floating capsule aligned near the top of the illustrated hero", mobile: "compress secondary links into a touch-safe menu while preserving product identity and the trial action" },
      typography: { display: "expressive editorial serif", body: "neutral product sans", scale: "serif display used sparingly for promise and feature chapter; small interface labels remain crisp and sans-serif" },
      palette: { surfaces: ["warm white", "powder blue", "pale lavender", "soft mint", "butter yellow", "charcoal"], ink: "near-black", accents: ["sky blue", "leaf green", "soft coral"], contrastIntent: "pastel chapter colors support illustration but all body copy and controls retain strong readable contrast" },
      imageTreatment: { mode: "hand-drawn atmospheric illustration interleaved with crisp authentic product-interface compositions", crop: "wide hero artwork followed by centered floating UI windows and broad feature panels", focalPoint: "the interface state that demonstrates one product capability" },
      sectionSequence: ["capsule product navigation", "illustrated sky hero", "capability icon row", "portrait-led social proof", "lavender interface feature", "mint integrations feature", "quote pause", "yellow calendar workflow", "structured collections feature", "connected-apps rail", "plan comparison", "green trial close", "dark global footer"],
      servicePresentation: { pattern: "product capabilities as distinct jobs-to-be-done, demonstrated with real interface scenes instead of uniform service cards", interaction: "small icon index and optional horizontal app rail; keep every feature understandable without hover" },
      ctaPlacement: { primary: "Start a free trial in the hero and closing green panel", secondary: "Explore the product or feature demos", early: "inside the opening view after the product promise" },
      motion: { primitive: "gentle depth shifts between illustrated clouds and floating UI panels", library: "native transforms and low-amplitude scroll reveals", reducedMotion: "show all UI panels in their settled positions and preserve the complete reading order" },
      mobileRecomposition: { strategy: "single-column product narrative with contained horizontal product rails", rules: ["keep the hero promise and trial control in the first screen", "stack interface windows rather than shrinking them", "use swipe-safe rails only for genuinely browseable products", "retain each chapter's pastel identity without losing readable contrast", "keep the footer useful at narrow widths"] },
      prohibitedPatterns: ["copying Craft names, copy, interface, logos, photos, pricing, or product claims", "uniform feature-card wall", "decorative interface screenshots that do not explain a verified capability", "pastel text with insufficient contrast", "hover-only product content", "using source portraits as client customers or staff"],
      requiredSignatureElements: [
        { id: "illustrated-sky-opening", selector: "[data-reference-signature=illustrated-sky-opening]", description: "quiet illustrated horizon above a compact workspace preview" },
        { id: "capability-color-chapters", selector: "[data-reference-signature=capability-color-chapters]", description: "feature chapters use distinct but coordinated surface colors and product evidence" },
        { id: "trial-close", selector: "[data-reference-signature=trial-close]", description: "a visually distinct final trial invitation before the footer" },
      ],
      acceptanceChecks: ["the hero states a verified product promise and primary action", "each capability chapter explains one real customer job", "interface imagery is client-provided or newly generated, never copied from the reference", "mobile keeps product UI legible and page width at the viewport", "trial links, integrations, and plan details are verified before publishing", "no source proof, review, price, or claim is transplanted"],
    },
    prompt: {
      visual: "Build a light, product-led narrative, not a generic SaaS template. Use a restrained illustrated-sky opening, a compact capsule navigation, a centered short promise, and a layered workspace preview. Let product UI do the storytelling: each major feature chapter should show one task in a crisp interface composition paired with a short explanatory passage. Alternate a few quiet pastel surfaces such as powder blue, lavender, mint, and butter yellow against generous warm-white space. Use an editorial serif only for selected chapter headlines and a neutral sans for interface labels and body copy. Add small capability glyphs, a human-proof pause, a restrained integration rail, a legible plan comparison, a high-contrast trial close, and a compact dark footer. Do not mimic Craft's exact illustrations, interface, language, logos, portraits, pricing, or visual trade dress.",
      sequence: "Sequence the page as: capsule navigation and illustrated hero; capability index; compact proof strip; alternating interface-led feature chapters; one testimonial pause; workflow or collection demonstration; supported integrations; verified plan comparison; trial CTA; footer. Do not force service/FAQ/contact sections into a product site, and do not add sections without facts or product material.",
      responsive: "At 390px, preserve the promise and primary action in the opening view. Stack overlapping desktop windows into a clear vertical demonstration or a labeled, touch-safe rail. Never shrink screenshots until labels become unreadable. Keep chapter color, section order, text contrast, and action hierarchy. Respect reduced motion with fully visible static UI, and prevent horizontal page overflow.",
      signatures: "Required signature mechanics: illustrated-sky opening, layered real product-interface evidence, contrasting feature-chapter surfaces, and a distinct free-trial close. Reinterpret those mechanics for the client's verified product and supplied/generated art; these signatures are not permission to copy source content.",
      prohibited: "Never use Craft's brand, product copy, UI assets, exact feature labels, customer identities, portraits, logos, pricing, claims, or source artwork. No generic bento wall, no decorative UI mockups without purpose, no fake testimonials, no invented integrations, and no inaccessible hover-only disclosures. Bind all published product facts, prices, links, and SEO copy to verified content tokens.",
    },
  },
  {
    id: "a1-scs-kinetic-command",
    name: "SCS kinetic global command field",
    familyId: "a1-kinetic-command",
    a1Slug: "scs",
    captureSlug: "scs",
    sourceName: "SCS Global Security official website",
    sourceUrl: "https://o-scs.com/",
    discoveryUrl: "https://www.a1.gallery/website/scs",
    businessKinds: ["security-services", "professional-services", "global-security"],
    tags: {
      business: ["security-services", "professional-services", "global-security"],
      style: ["kinetic-command", "high-contrast", "condensed-display", "cinematic-gradient"],
      composition: ["glowing-orbit-hero", "oversized-action-statement", "color-field-service-band", "global-coordinate-ledger", "editorial-intelligence-feed"],
      conversion: ["work-with-us-action", "service-selection", "consultation-intake", "global-contact-close"],
      motion: ["scroll-linked-type-state", "pinned-scene-transitions", "global-map-pan", "reduced-motion-static-scenes"],
      imagery: ["abstract-orbital-light", "high-contrast-documentary-scenes", "global-location-index", "editorial-field-notes"],
    },
    dna: {
      annotatedDescription: "The site treats a serious global security firm like a cinematic control room: a black opening with an illuminated orange-to-cyan orbit around a huge two-line statement; minimal utility navigation; measured global proof; a sequence of dark and pale stages; a loud orange service manifesto; a technical world-presence index; editorial field notes; an explicit service catalog; a structured inquiry form; and a minimal dark close. It uses motion and contrast to signal operational focus, not decorative luxury.",
      heroGeometry: { mode: "full-viewport action poster with giant centered type and a luminous circular field", alignment: "small corner identity and utility controls surround one short centered statement", viewport: "brand category, regional/global scope, concrete service promise, and an inquiry action read immediately" },
      navigationGeometry: { mode: "sparse command navigation with discreet section links and a single bright action", placement: "fine-print row at the top edge with a circular signal action", mobile: "compact menu and mark at top; expose the inquiry action without shrinking the statement" },
      typography: { display: "condensed technical grotesk", body: "neutral compact sans with occasional mono coordinates", scale: "oversized short uppercase hero; very small operational labels; short explanatory lines" },
      palette: { surfaces: ["near black", "charcoal", "cold white", "deep navy"], ink: "white on dark and almost-black on pale", accents: ["signal orange", "cyan", "red-orange"], contrastIntent: "high contrast for operational copy; motion gradients remain behind text and never reduce legibility" },
      imageTreatment: { mode: "luminous orbital graphics, global data and selective documentary imagery", crop: "full-bleed abstract field, poster-sized service band, then compact image-led field notes", focalPoint: "the illuminated center and the service/region being communicated" },
      sectionSequence: ["quiet command navigation", "orbital type hero", "global proof strip", "pinned statement scenes", "orange expertise poster", "dark worldwide presence index", "editorial field notes", "service taxonomy", "structured inquiry form", "minimal corporate footer"],
      servicePresentation: { pattern: "services as a dense, oversized typographic list inside one deliberate signal-color band", interaction: "each service is a readable focus row linked to verified detail, not a grid of generic capability cards" },
      ctaPlacement: { primary: "Work with us in navigation and hero", secondary: "open an inquiry or select a verified service", early: "visible in the opening navigation before the long cinematic sequence" },
      motion: { primitive: "scroll-linked statement and background-field transitions across a contained scene", library: "native scroll state or GSAP ScrollTrigger with explicit cleanup", reducedMotion: "unpin every scene, show each statement once in normal flow, and disable continuous field drift" },
      mobileRecomposition: { strategy: "vertical command narrative inside a touch-scrollable page, with scene motion simplified", rules: ["keep the menu and identity controls compact", "keep hero type to a short readable statement", "replace wide data rows with stacked labeled values", "turn service bands into clear vertical service links", "ensure custom scroll containers remain keyboard and touch scrollable", "never hide all page content behind a single fixed viewport"] },
      prohibitedPatterns: ["copying SCS identity, exact headline, logo, services, locations, contacts, or source imagery", "repeated pinned text caused by an incorrectly measured scroll container", "scroll hijacking or a page with no accessible native scroll path", "strobing gradients, rapid flashes, or autoplay video without a still state", "tiny operational text with inadequate contrast", "invented locations, response promises, client logos, or security credentials"],
      requiredSignatureElements: [
        { id: "orbital-command-opening", selector: "[data-reference-signature=orbital-command-opening]", description: "short hero statement framed by an atmospheric but non-obscuring orbit or field" },
        { id: "service-signal-band", selector: "[data-reference-signature=service-signal-band]", description: "one high-signal service index distinct from the dark field" },
        { id: "global-proof-index", selector: "[data-reference-signature=global-proof-index]", description: "verified service-area or proof information in compact technical rows" },
      ],
      acceptanceChecks: ["hero states the real trade or service area without unsupported claims", "all page scenes are accessible with reduced motion and keyboard/touch scroll", "service list links to real verified service content", "locations and proof metrics are drawn only from business facts", "mobile has no fixed-scene trap or horizontal overflow", "contact action reaches the verified form or telephone number"],
    },
    prompt: {
      visual: "Create a cinematic command-field experience for the client's actual high-stakes service, not a generic dark technology page. Use a near-black base, precise condensed display type, sparse utility navigation, one short oversized statement, and a restrained luminous ring or signal field. Build contrast through controlled surface transitions: dark scene, signal-color service index, return to a technical location/proof field, editorial evidence, and a clear contact close. Use only a few typographic scales: monumental uppercase promise, compact operational labels, and readable short body copy. The signal accent should identify the action or service focus rather than decorate every surface.",
      sequence: "Use this rhythm: utility nav and orbital hero; small proof strip; one purposeful pinned or scroll-linked scene sequence; a high-contrast service band; verified service-area data; one editorial case/process or field-note region if the business has real evidence; service links; inquiry form; concise footer. Motion must clarify progression and must not repeat the same headline through a stitching error or scroll lock.",
      responsive: "At mobile, keep native touch scrolling usable even if a nested scroller is needed. Preserve the statement but reduce its line count and scale. Convert coordinates, service rows, and proof into readable stacked records. Disable pinned scenes and continuous light movement for reduced motion; let all copy appear once in a normal vertical flow. Validate the complete page at 390x844 and inspect the first screen at normal browser zoom.",
      signatures: "Required mechanics: a luminous circular or radial signal around the opening promise, a single high-energy service index, and a precise global/service-area ledger. Use original art, a client-supplied signal color, and the client's genuine coverage; do not reproduce the SCS logo, orange service panel, copy, or countries.",
      prohibited: "Never copy SCS security claims, locations, numbers, source photos, client logos, type lockup, or trade dress. Do not invent emergency response, license, protection capability, territory, outcomes, or service guarantees. No scroll hijacking, repeated pinned headlines, decorative data, or inaccessible mobile overflow. SEO terms must read naturally and remain grounded in the client's verified service and location facts.",
    },
  },
  {
    id: "a1-mckp-object-stage",
    name: "MCKP interactive object stage",
    familyId: "a1-object-stage",
    a1Slug: "mckp",
    captureSlug: "mckp",
    sourceName: "MCKP interactive mockup product website",
    sourceUrl: "https://mckp.live/",
    discoveryUrl: "https://www.a1.gallery/website/mckp",
    businessKinds: ["design-software", "software", "creative-technology"],
    tags: {
      business: ["design-software", "software", "creative-technology"],
      style: ["dark-object-stage", "technical-minimal", "3d-product-render", "instrument-serif-accent"],
      composition: ["isolated-device-hero", "floating-scene-gallery", "interface-capability-atlas", "integration-matrix", "change-log-close"],
      conversion: ["start-free", "gallery-exploration", "embed-workflow", "product-upgrade"],
      motion: ["cursor-aware-object-drift", "scene-breathe", "scroll-triggered-demo", "static-object-poster"],
      imagery: ["3d-device-render", "dark-material-stage", "interface-crop", "responsive-product-scenes"],
    },
    dna: {
      annotatedDescription: "A product object is staged in a near-black gallery: a compact utility nav, a two-line headline, an isolated tilted phone mockup on a textured dark plane, and minimal start/explore actions. The page then alternates scene galleries with precise explanations, an interactive embed demonstration, a dark capability atlas, a customization scene, integrations, change-log tiles, and one final invitation. Its visual energy comes from object rendering, lighting, and close-up product states rather than colorful cards.",
      heroGeometry: { mode: "monumental centered product headline above one tilted 3D device on a deep stage", alignment: "small top navigation, centered promise, tiny actions, large object as the central image", viewport: "identify the product, show the object, and offer a first exploration action without explanatory clutter" },
      navigationGeometry: { mode: "small quiet utility links with a contrasting compact action", placement: "thin header along the top boundary of the dark canvas", mobile: "retain a tiny brand/action header and replace inline links with a touch-safe menu" },
      typography: { display: "neutral modern sans with a restrained instrument-serif accent", body: "compact technical sans and mono labels", scale: "large two-line display headline, small product microcopy, medium feature headings" },
      palette: { surfaces: ["black", "charcoal", "smoke", "select white/gray demo surfaces"], ink: "white and soft gray", accents: ["electric blue", "signal red", "acid green"], contrastIntent: "dark scenes carry readable white type; bright interface demo panels are limited to clear product evidence" },
      imageTreatment: { mode: "photoreal 3D device/mockup rendering against rough dark materials", crop: "isolated hero object, scene thumbnails, then close-up interface panels", focalPoint: "the device or interface state being demonstrated" },
      sectionSequence: ["micro utility navigation", "isolated object hero", "recent scene gallery", "embed workflow demonstration", "capability atlas", "customization scene", "integration matrix", "change log", "large final product invitation", "small footer"],
      servicePresentation: { pattern: "capabilities appear as an ordered technical atlas with an image, interface state, and concise explanation", interaction: "clickable scene gallery and visible product controls with noninteractive screenshot fallback" },
      ctaPlacement: { primary: "Start for free or the client's genuine main product action", secondary: "Explore the gallery or product", early: "directly beneath the hero object" },
      motion: { primitive: "slow, cursor-aware object focus and scroll-revealed product scenes", library: "CSS perspective or restrained Three.js only where the object is central; otherwise native transforms", reducedMotion: "provide a static device render and immediate scene navigation" },
      mobileRecomposition: { strategy: "object-first vertical sequence with poster fallbacks", rules: ["show the device before small explanatory copy", "stack scene previews into a vertical list or swipe-safe gallery", "keep product interface labels legible", "avoid sticky scaling stacks on narrow devices", "disable cursor-only effects and provide touch interactions", "preserve a static render if 3D is unavailable"] },
      prohibitedPatterns: ["copying MCKP's device renders, product UI, names, app screenshots, pricing, or claims", "unrelated decorative 3D objects", "heavy bento-card grid replacing the isolated object concept", "unbounded video, WebGL, or GPU effects", "cursor-only controls on touch", "invented integrations, performance numbers, or product capabilities"],
      requiredSignatureElements: [
        { id: "isolated-product-object", selector: "[data-reference-signature=isolated-product-object]", description: "one clearly staged product object is the hero's visual anchor" },
        { id: "capability-scene-atlas", selector: "[data-reference-signature=capability-scene-atlas]", description: "product features are demonstrated with distinct scene/interface states" },
        { id: "static-object-fallback", selector: "[data-reference-signature=static-object-fallback]", description: "a stable, accessible still state exists when motion or 3D is unavailable" },
      ],
      acceptanceChecks: ["the hero object is relevant to the client's real product", "all scenes are generated/client-supplied, not copied from MCKP", "mobile interactions work without a mouse", "3D has a tested static fallback and does not block page content", "feature claims and integrations are verified", "final CTA and pricing, if shown, match the client's real offer"],
    },
    prompt: {
      visual: "Build an object-led product stage, not a bento-style SaaS template. Start with a small utility nav and a short, oversized two-line promise above one isolated product render on a nearly black material field. Let the object establish the page's visual hierarchy. Follow it with a scene/gallery rail, a product-use demonstration, a capability atlas, customization proof, integrations, and a concise release log. Use dark negative space, focused light, restrained accent colors, small technical labels, and a neutral sans with a limited serif accent. Every scene must show a real customer task or a verified product capability.",
      sequence: "Keep the rhythm: object hero; browseable scenes; embed/use case; a small number of capability demonstrations; customization or process; verified integration list; release/change log; one strong final CTA. Do not replace the concept with uniform cards. If there is no client product imagery, request/generate original asset scenes bound to content tokens.",
      responsive: "On mobile, place the object first, keep type compact enough to avoid clipping, stack feature scenes, and convert hover transitions into tap-safe controls. No horizontal page overflow. Disable pointer drift and heavy rendering on touch or reduced-motion devices, and show a high-quality static object image immediately if 3D fails.",
      signatures: "Required mechanics: an isolated central object, material/lighting contrast, a progressive set of product scenes, and a clear non-motion fallback. Use an object that genuinely represents the client's product; do not reuse MCKP's phone, interface screenshots, texture, or model.",
      prohibited: "Never reproduce MCKP's product scenes, UI, copy, logo, fonts as a requirement, features, price, claims, or exact composition. Do not add unrelated 3D decoration, auto-playing scenes without pause, canvas-only text, fake integrations, or untested GPU effects. The page must remain legible and navigable if all motion and WebGL are disabled.",
    },
  },
  {
    id: "a1-uncommon-founder-atlas",
    name: "The Uncommon Founder principles atlas",
    familyId: "a1-kinetic-founder",
    a1Slug: "the-uncommon-founder",
    captureSlug: "uncommon-founder",
    sourceName: "The Uncommon Founder coaching and advisory website",
    sourceUrl: "https://www.theuncommonfounder.com/",
    discoveryUrl: "https://www.a1.gallery/website/the-uncommon-founder",
    businessKinds: ["coaching", "consulting", "professional-services"],
    tags: {
      business: ["coaching", "consulting", "professional-services"],
      style: ["dark-pixel-accent", "reflective-editorial", "lime-signal", "founder-led"],
      composition: ["centered-founder-promise", "principles-path", "essay-interlude", "client-progress-proof", "expertise-atlas", "lime-call-close"],
      conversion: ["introductory-call", "coaching-fit", "expertise-selection", "newsletter-secondary"],
      motion: ["pixel-field-drift", "scroll-revealed-principles", "progress-led-quote-sequence", "reduced-motion-static"],
      imagery: ["sparse-pixel-atmosphere", "real-client-video-evidence", "minimal-symbols", "dark-editorial-text"],
    },
    dna: {
      annotatedDescription: "A founder-advisory story uses nearly black graphite, white typography, a vivid pale-lime signal, pixel-like particles, and mono micro-labels. A centered statement leads into a compact client logo rail and a framed principles system; long founder prose and differentiated client-success cards add human depth. The second half moves through a three-part partnership process, an expertise selection, a large lime conversation panel, a quieter newsletter option, and a sparse, particle-accented footer. It is deliberately specific and reflective rather than a generic professional-services card template.",
      heroGeometry: { mode: "centered typographic founder promise with sparse pixel field and one small action", alignment: "centered title and summary; broad negative space separates it from the next proof rail", viewport: "the audience, founder role, and conversation action are stated before the long essay" },
      navigationGeometry: { mode: "small wordmark and compact text links with a single conversation action", placement: "thin top edge above a centered hero", mobile: "condense links into a tap-safe menu and preserve one direct call action" },
      typography: { display: "modern geometric sans with pixel/mono micro-labels", body: "readable neutral sans", scale: "large centered promise, medium essay lines, tiny labels used as navigation rather than body text" },
      palette: { surfaces: ["graphite", "near black", "slightly raised charcoal"], ink: "soft white", accents: ["pale acid lime", "muted gray"], contrastIntent: "lime marks selected ideas and conversion; body copy remains white/gray with accessible contrast" },
      imageTreatment: { mode: "sparse pixel particles, restrained founder/client evidence, and minimal line symbols", crop: "mostly typographic sections with a few inset video/proof cards", focalPoint: "the principle or client progress story currently being explained" },
      sectionSequence: ["compact founder navigation", "centered founder promise", "client logo rail", "principles panel", "founder essay interlude", "client success distinctions", "progress and testimonial evidence", "partnership process", "expertise choice", "lime conversation CTA", "newsletter secondary action", "particle footer"],
      servicePresentation: { pattern: "expertise options as three distinct advisory roles supported by principle and process", interaction: "simple, labeled choices leading to a verified inquiry or relevant detail" },
      ctaPlacement: { primary: "Book or request a verified introductory conversation", secondary: "Explore approach or newsletter", early: "small conversation action in the header/hero; large CTA follows the expertise explanation" },
      motion: { primitive: "slow, sparse pixel-field drift and a scroll-led sequence that marks principles/progress", library: "CSS/native scroll reveals or a restrained GSAP sequence", reducedMotion: "freeze particle field and show all principles and client evidence in natural order" },
      mobileRecomposition: { strategy: "single-column reflective essay with stacked proof and process", rules: ["keep the centered promise concise", "stack the principles and client-progress cards with clear labels", "remove hover-only pixel effects", "preserve generous but not empty vertical rhythm", "keep the lime CTA full-width and readable", "do not present client logos or testimonials without verified consent"] },
      prohibitedPatterns: ["copying founder claims, quotations, framework names, client logos, video, testimonials, or lime brand trade dress", "turning the page into a dark bento dashboard", "pixel noise behind long paragraphs", "unverified coaching outcomes or client results", "excessive blank space that hides missing proof", "newsletter competing with the primary consultation CTA"],
      requiredSignatureElements: [
        { id: "principles-path", selector: "[data-reference-signature=principles-path]", description: "a distinctive principles or decision framework described in the client's own terms" },
        { id: "progress-proof", selector: "[data-reference-signature=progress-proof]", description: "permissioned evidence about client progress or an honest alternative process proof" },
        { id: "signal-conversation-close", selector: "[data-reference-signature=signal-conversation-close]", description: "high-signal conversation invitation after the service/expertise explanation" },
      ],
      acceptanceChecks: ["hero identifies who the advisor helps and what first conversation means", "principle and service framework come from verified client intake", "all clients, results, logos, and testimonials have explicit provenance", "mobile reading measure and line breaks stay comfortable", "one primary conversation action remains visually dominant", "claims about outcomes are not inferred from the reference"],
    },
    prompt: {
      visual: "Create a founder-led advisory narrative that feels reflective, specific, and self-possessed. Use a charcoal field, white/gray type, one pale-lime signal, and restrained mono micro-labels. Open with a centered promise and sparse particle/line atmosphere, not a split hero. Give the page a clear principles framework, a short logo/proof pause only when verified, an essay-like founder point of view, differentiated client needs or process stages, an expertise choice, and a large conversation close. Keep the typography-led rhythm and negative space, but make every pause intentional and content-bearing.",
      sequence: "Use: compact wordmark/nav; centered promise; verified trust strip; principles or method; short narrative; contextual service choices; permissioned proof or a process demonstration; partnership steps; expertise/service decision; one signal-color CTA; optional secondary newsletter; concise footer. The story should help the visitor decide if the advisory offer fits.",
      responsive: "At 390px, stack framework and proof cards, keep prose narrow and readable, and turn hover details into visible or tap-accessible content. Maintain one primary conversation CTA. Decorative particles become static or disappear for reduced motion and must not affect contrast or page width.",
      signatures: "Required mechanics: a sparse pixel/point field, a founder-specific principle sequence, differentiated expertise choices, and a high-contrast conversation close. Rebuild the ideas from client evidence; use new names, original copy, and permissioned proof only.",
      prohibited: "Never copy The Uncommon Founder story, framework language, brand, client logos, images, testimonials, quotes, results, or exact green treatment. No generic agency cards, fake client wins, invented founder credentials, or claim that all clients achieve the same outcome. Preserve local SEO facts and make the CTA go to a verified channel.",
    },
  },
  {
    id: "a1-ethan-cinematic-3d",
    name: "Ethan Suero dark studio and work rail",
    familyId: "a1-cinematic-3d",
    a1Slug: "ethan-suero",
    captureSlug: "ethan-suero",
    sourceName: "Ethan Suero digital studio website",
    sourceUrl: "https://www.ethansuero.com/",
    discoveryUrl: "https://www.a1.gallery/website/ethan-suero",
    businessKinds: ["design-studio", "web-design", "creative-services"],
    tags: {
      business: ["design-studio", "web-design", "creative-services"],
      style: ["dark-studio-editorial", "restrained-motion", "cinematic-photography", "modern-grotesk"],
      composition: ["studio-proof-opening", "offset-statement-copy", "horizontal-work-rail", "service-stage-list", "image-led-process-close"],
      conversion: ["project-inquiry", "work-gallery", "service-selection", "process-faq"],
      motion: ["horizontal-work-rail", "scroll-reveal", "video-poster-transition", "reduced-motion-static"],
      imagery: ["curated-case-study-stills", "dark-editorial-photography", "short-loop-posters", "client-approved-project-evidence"],
    },
    dna: {
      annotatedDescription: "A dark creative-studio page opens with a tiny wordmark/utility header, a huge compressed promise and a sparse project/work widget. It alternates left and right text statements with quiet explanatory copy, a restrained client-mark strip, a metric/quote proof block, and a horizontally browsable work gallery. Lower sections make the engagement model legible through service and process stages, then use an editorial image-led close, process FAQs, contact links, and a typographic studio footer. Black surfaces and gentle motion keep the portfolio evidence primary.",
      heroGeometry: { mode: "dark full-width studio field with a large condensed statement, small work preview, and short supporting copy", alignment: "wordmark and utility nav above; promise left-weighted with a project visual or work entry nearby", viewport: "studio category, point of view, and a project inquiry or work action fit within the opening screen" },
      navigationGeometry: { mode: "minimal wordmark, small section menu, and compact project/contact action", placement: "thin top header on a near-black field", mobile: "retain the brand and one action; move work links into a simple menu" },
      typography: { display: "bold condensed grotesk", body: "neutral modern sans", scale: "large condensed studio statement, readable offset narrative blocks, small mono/uppercase labels" },
      palette: { surfaces: ["near black", "charcoal", "deep gray"], ink: "white with muted silver copy", accents: ["occasional muted project color"], contrastIntent: "reserve white type for primary statements and keep secondary captions above comfortable contrast" },
      imageTreatment: { mode: "curated project stills, poster frames, and a restrained cinematic texture", crop: "horizontal project rail with selective wide film-like closing image", focalPoint: "real client-approved project work, not abstract decorative imagery" },
      sectionSequence: ["minimal studio header", "oversized studio proposition", "brief studio statement", "client proof strip", "metric and attributed quote", "offset point-of-view statements", "horizontal selected-work rail", "service/engagement stages", "image-led project invitation", "process FAQs", "contact and work links", "oversized studio wordmark close"],
      servicePresentation: { pattern: "services are explained as stages or clear project capabilities within the studio narrative", interaction: "a horizontal work rail plus simple linked service/process stages; ensure controls have accessible keyboard/touch paths" },
      ctaPlacement: { primary: "Start a project conversation", secondary: "View selected work", early: "in the header or hero without obscuring the project preview" },
      motion: { primitive: "horizontal work gallery movement and low-amplitude scroll reveal", library: "native overflow scrolling or GSAP for a single controlled rail", reducedMotion: "show a static, keyboard-scrollable project list and poster frames" },
      mobileRecomposition: { strategy: "vertical studio story with a touch-scrollable project rail", rules: ["keep title inside the mobile width", "stack offset copy blocks in reading order", "make projects swipe-safe with a visible progress hint", "use video posters instead of autoplay on mobile", "keep all contact/service links reachable without hover", "avoid image strips that force page-level horizontal overflow"] },
      prohibitedPatterns: ["copying Ethan Suero's logo, copy, project images, client list, metrics, testimonials, or exact page style", "invented client outcomes, awards, or percentage improvements", "autoplay video without poster/pause or heavy media on mobile", "unlabeled carousel controls or inaccessible drag-only work rail", "uniform portfolio card grid", "unverified project-inquiry response promises"],
      requiredSignatureElements: [
        { id: "studio-statement", selector: "[data-reference-signature=studio-statement]", description: "one oversized studio proposition supported by concise explanation" },
        { id: "selected-work-rail", selector: "[data-reference-signature=selected-work-rail]", description: "a distinct browseable sequence of verified work or service scenes" },
        { id: "process-and-inquiry-close", selector: "[data-reference-signature=process-and-inquiry-close]", description: "a clear project process followed by a direct inquiry route" },
      ],
      acceptanceChecks: ["the opening explains what the studio/service actually does", "projects and client evidence are verified and permissioned", "carousel works by keyboard, pointer, and touch", "reduced-motion mode shows all essential work", "mobile does not crop giant headings or hide navigation", "inquiry links and process details are accurate"],
    },
    prompt: {
      visual: "Create a confident dark studio narrative with near-black surfaces, oversized condensed typography, restrained gray copy, and curated work imagery. The page should feel like a studio with a point of view, not a generic agency template. Put one short promise and an unmistakable work/contact action in the opening. Use offset editorial statements, a small proof strip only if the client can substantiate it, a controlled work rail, a clear process/service sequence, and one cinematic project invitation. Keep visual noise low so actual work carries the identity.",
      sequence: "Build: minimal studio nav; concise headline and work entry; short position statement; verified proof strip; one metric or process evidence block; offset founder/studio narrative; selected work rail; service and engagement steps; inquiry CTA; process FAQs if useful; clean contact/footer close. Do not add sections just to imitate an agency sitemap.",
      responsive: "On mobile, stack the narrative, constrain display type, and make the work rail a touch-safe native scroller or labeled list. Use poster images instead of autoplay video; keep project captions and service links visible. Disable scroll-tied motion when reduced motion is requested, and ensure the page itself never requires horizontal scrolling.",
      signatures: "Required mechanics: dark studio field, compressed statement, an image-led selected-work rail, offset editorial copy, and a process-to-inquiry ending. Substitute client-authorized projects or generated relevant images; never use source portfolio imagery.",
      prohibited: "Never copy Ethan Suero branding, source copy, client logos, work images, exact headlines, metrics, testimonials, fonts as a requirement, or trade dress. Do not invent clients, case-study outcomes, awards, or performance lifts. Avoid dark-on-dark low contrast, unlabeled drag interactions, and autoplay-only media. All factual and SEO content must remain grounded in the verified client record.",
    },
  },
  {
    id: "kokoro-spatial-editorial",
    name: "Kokoro spatial architecture editorial",
    familyId: "kokoro-editorial-architecture",
    a1Slug: "",
    captureSlug: "kokoro",
    sourceName: "Kokoro architecture website template demo",
    sourceUrl: "https://kokoro.framer.website/",
    discoveryUrl: "https://framplates.com/kokoro",
    businessKinds: ["architecture", "interior-design", "architecture-studio"],
    tags: {
      business: ["architecture", "interior-design", "architecture-studio"],
      style: ["quiet-spatial-editorial", "warm-material-photography", "oversized-serif", "two-level-identity"],
      composition: ["monument-wordmark-opening", "isolated-interior-scenes", "editorial-thesis", "magazine-ledger", "cinematic-closing-scene"],
      conversion: ["selected-work-discovery", "studio-inquiry", "direct-email-close"],
      motion: ["slow-image-reveal", "horizontal-scene-pan", "reduced-motion-static"],
      imagery: ["architectural-interiors", "warm-wood-and-stone", "full-bleed-material-scenes", "wide-space-details"],
    },
    dna: {
      annotatedDescription: "The architecture demo uses a monumental two-level serif identity and a quiet editorial pace. The opening pairs micro-navigation at opposing corners with tall interior photographs against substantial negative space; a centered architectural thesis follows the portrait. Wide room scenes interrupt a magazine/archive ledger with article titles and dates, then a final cinematic interior leads into a short invitation and email. This is image-led and typographic, not a split-hero/service-card template. Transfer hierarchy and spatial mechanics only; the secondary type treatment must be original.",
      heroGeometry: { mode: "monumental serif wordmark followed by an isolated portrait-oriented interior scene", alignment: "small corner navigation, giant studio identity, single vertical image, then a centered thesis", viewport: "studio category and image establish atmosphere; the first inquiry action appears after the visual thesis" },
      navigationGeometry: { mode: "quiet opposing-corner utility navigation", placement: "a small factual service-area or business-context label in the upper left, with Services, FAQs, and Contact links in the opposing upper right; never repeat the full studio name in a tiny header above the monumental identity", mobile: "a factual location label at upper left and compact Menu control at upper right; expose Services, FAQs, Contact, and inquiry links in a touch-friendly menu without duplicating the full studio name" },
      typography: { display: "high-contrast editorial serif identity in two deliberate typographic levels with an independent secondary type role; no copied script treatment", body: "quiet neutral sans", scale: "broad two-level identity with deliberate line breaks for long verified names; visually substantial before the first image, with quiet navigation, medium centered thesis, very small archive metadata, and restrained body copy" },
      palette: { surfaces: ["soft warm gray", "ivory", "deep charcoal", "natural wood"], ink: "near-black", accents: ["restrained warm brown", "soft olive"], contrastIntent: "photographs supply warmth; serif text remains dark and legible against clear untextured surfaces" },
      imageTreatment: { mode: "architectural interiors treated as calm spatial objects", crop: "portrait hero/interior images, wide overlapping scene strip, then one full-bleed closing room", focalPoint: "structure, natural light, material and proportion" },
      sectionSequence: ["micro corner navigation", "monument studio wordmark", "portrait interior sequence", "centered design thesis", "wide spatial image strip", "magazine/archive ledger", "full-bleed final interior", "centered inquiry invitation", "email and minimal social footer"],
      servicePresentation: { pattern: "architecture capabilities are translated into an editorial project/archive index, not generic service cards", interaction: "browseable project/article rows with restrained date/metadata and a clear work detail link" },
      ctaPlacement: { primary: "Discuss a project or verified studio inquiry after the separate thesis and again at the closing scene", secondary: "View selected works or journal", early: "place the first inquiry action after the portrait image and a clearly separate centered thesis; keep only compact native route links in desktop navigation and do not put the thesis under the identity or a large CTA over photography" },
      motion: { primitive: "slow image reveal or restrained crop transition with a subtle horizontal scene pan", library: "native scroll-linked reveals or one GSAP timeline", reducedMotion: "settled full images, no pinned scroll or continuous camera movement" },
      mobileRecomposition: { strategy: "vertical image-led architecture essay with ledger rows", rules: ["scale the wordmark without horizontal clipping", "keep image proportions tall and intentional", "stack the scene strip or use a controlled touch rail", "make the archive ledger readable and tappable", "place inquiry after the thesis and final scene", "preserve enough negative space without empty artificial sections"] },
      prohibitedPatterns: ["copying the Kokoro wordmark, script logo, story, project imagery, magazine topics, email, or exact trade dress", "invented projects, awards, sustainability claims, square footage, or locations", "unlicensed source interiors used as client work", "decorative cursive used for long text", "unbounded pinning or mobile scroll locks", "empty whitespace used to hide missing content"],
      requiredSignatureElements: [
        { id: "monument-wordmark", selector: "[data-reference-signature=monument-wordmark]", description: "oversized spatial identity that leads into imagery" },
        { id: "magazine-ledger", selector: "[data-reference-signature=magazine-ledger]", description: "a restrained editorial index of real projects, notes or verified articles" },
        { id: "closing-interior-scene", selector: "[data-reference-signature=closing-interior-scene]", description: "one immersive final image before a direct inquiry invitation" },
      ],
      acceptanceChecks: ["business category and location are visible for search relevance", "all portfolio/project claims and images belong to the client or are generated", "archive rows link to valid details and never fabricate dates", "mobile preserves image-led rhythm without overflow", "inquiry action is real and appears before page end", "motion has a static reduced-motion equivalent"],
    },
    prompt: {
      visual: "Create a quiet, spatial architecture story using monumental editorial serif typography, restrained warm metallic accent, ample but purposeful negative space, and large interior imagery. Begin with an oversized identity, then let one portrait interior sit alone before a centered thesis. Alternate wide room scenes and a magazine-like archive ledger, then close on one immersive interior and a clear inquiry. It should feel like a considered architecture journal, not a split hero plus a generic service grid.",
      sequence: "Use this sequence: tiny corner navigation; monumental identity; one or more portrait space images; concise architectural thesis; wide selected-work scene rail; project or insight ledger with metadata only when verified; one cinematic closing image; direct studio inquiry and minimal footer. Adapt the archive rows to real work, articles, or process notes available in the client facts. Do not invent a magazine to fill space.",
      responsive: "At mobile, keep the wordmark within 390px, retain full image subjects, stack image scenes, and make project rows large enough for touch. Reduce oversized whitespace where it pushes the inquiry too far down. Keep all long-form text readable and preserve the ending image without horizontal page scroll.",
      signatures: "Required mechanics: monumental wordmark, isolated architecture imagery, an archive/ledger transition, and a distinctive closing interior scene. Use the client's original identity and images or newly generated architectural imagery; never use the Kokoro logo, script, photographs, article list, or copy.",
      prohibited: "Do not replicate Kokoro branding, wordmark, gold script, photographs, magazine titles, dates, contact details, layout pixel-for-pixel, or source claims. No fabricated portfolio projects, awards, locations, sustainability performance, or dimensions. Do not make contact dependent on finding a tiny email in the footer; keep a useful inquiry action visible and factual.",
    },
  },
];

function buildDesignPrompt(entry) {
  return `# ${entry.name}: archive-only design implementation brief\n\nThis document extracts visual mechanics from the permission-cleared source captures. It is not source copy and does not grant permission to reuse any source brand asset. The dossier is archive-only and is not eligible for automatic production selection.\n\n## visual hierarchy\n${entry.prompt.visual}\n\n## page sequence\n${entry.prompt.sequence}\n\n## responsive translation\n${entry.prompt.responsive}\n\n## signature elements\n${entry.prompt.signatures}\n\n## prohibited patterns\n${entry.prompt.prohibited}\n\n## local-business translation and SEO\nFor a LaunchLoom client, translate this composition only after grounding the page in the client's verified business kind, services, service area, customer questions, contact channels, assets, and SEO research. Keep the opening statement useful to the actual searcher, use natural service/location language, answer the real decision questions, and place one primary conversion action early. Never copy source copy, logos, people, photos, products, claims, or interface assets. Any missing fact remains absent or is requested from the client; do not fill it with a plausible invention. Keep semantic headings, keyboard and touch access, sufficient contrast, reduced-motion behavior, and a working form or call action.\n\n## archive status\nReference family: ${entry.familyId}. Source: ${entry.sourceUrl}. A1 discovery page: ${entry.discoveryUrl}. This dossier is preserved as permission-cleared internal design evidence only and is excluded from the 84-reference Local SEO production core.\n`;
}

function normalizedPageUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return `${url.origin}${pathname}`;
  } catch {
    return "";
  }
}

export function captureEvidence(entry, captureRecord, kind) {
  const capture = captureRecord.captures[kind];
  if (
    !capture ||
    !Number.isInteger(capture.httpStatus) ||
    capture.httpStatus < 200 ||
    capture.httpStatus >= 400 ||
    !capture.fullPage
  )
    throw new Error(`Archive reference '${entry.id}' has no successful full-page ${kind} capture.`);
  let expectedOrigin = "";
  let finalOrigin = "";
  try {
    expectedOrigin = new URL(entry.sourceUrl).origin;
    finalOrigin = new URL(capture.finalUrl).origin;
  } catch {
    // Invalid or missing final URLs fail closed below.
  }
  if (!expectedOrigin || !finalOrigin || finalOrigin !== expectedOrigin)
    throw new Error(`Archive reference '${entry.id}' ${kind} final URL origin does not match its declared source.`);
  const expectedSource = normalizedPageUrl(entry.sourceUrl);
  const requestedSource = normalizedPageUrl(capture.url);
  if (!expectedSource || !requestedSource || requestedSource !== expectedSource)
    throw new Error(`Archive reference '${entry.id}' ${kind} requested URL does not match its declared source.`);
  const expectedViewport = kind === "desktop"
    ? { width: 1440, height: 900 }
    : { width: 390, height: 844 };
  if (
    capture.viewport?.width !== expectedViewport.width ||
    capture.viewport?.height !== expectedViewport.height
  )
    throw new Error(`Archive reference '${entry.id}' ${kind} capture has the wrong viewport dimensions.`);
  if (
    !capture.image ||
    capture.image.width !== capture.viewport.width ||
    capture.image.height < capture.viewport.height
  )
    throw new Error(`Archive reference '${entry.id}' has invalid ${kind} screenshot dimensions.`);
  return {
    path: `screenshots/${kind}.png`,
    capture: "full-page",
    viewport: capture.viewport,
    screenshotHeight: capture.image.height,
  };
}

function buildManifest(entry, captureRecord, screenshotHashes) {
  const desktop = captureEvidence(entry, captureRecord, "desktop");
  const mobile = captureEvidence(entry, captureRecord, "mobile");
  return {
    schemaVersion: 1,
    id: entry.id,
    productionEligible: false,
    archiveOnlyReason: "Curated cross-industry design mechanics. Not one of the six business-verified production references in a Local SEO Core niche.",
    referenceName: entry.name,
    familyId: entry.familyId,
    source: {
      name: entry.sourceName,
      url: entry.sourceUrl,
      discoverySource: "A1 Gallery MCP / curated reference research",
      discoveryUrl: entry.discoveryUrl,
      rights: "permission-cleared",
      rightsEvidence: `The LaunchLoom requester attested on ${evidenceDate} that the exact ${entry.sourceName} desktop/mobile captures and derived mechanics prompt may be retained internally and supplied to the pipeline model as visual reference. This is requester-attested clearance; no source-owner grant was attached or independently verified.`,
      rightsEvidencePath: "rights/requester-attestation.md",
      provenanceEvidencePaths: ["capture-record.json"],
    },
    businessKinds: entry.businessKinds,
    tags: entry.tags,
    evidence: { desktop, mobile },
    provenance: {
      retrievedAt: evidenceDate,
      captureMethod: captureRecord.captures.desktop.captureMethod,
      discoveryPage: entry.discoveryUrl,
      desktopCapture: captureRecord.captures.desktop,
      mobileCapture: captureRecord.captures.mobile,
      desktopScreenshotSha256: screenshotHashes.desktop,
      mobileScreenshotSha256: screenshotHashes.mobile,
      notes: "Screenshots are direct official-source page captures at declared desktop and mobile viewports. Custom scrolling surfaces are recorded and captured as scroll-position sequences. A1 metadata informed taxonomy and visual annotation only. Original source material is not copied into client deliverables.",
    },
    referenceDna: entry.dna,
    review: {
      status: "requester-attested-internal-archive-only",
      curator: "LaunchLoom reference curation",
      reviewedAt: evidenceDate,
      scope: "Visual mechanics archive. productionEligible=false and excluded from every current production niche.",
    },
  };
}

function inspirationRecord(entry, manifest) {
  const dna = manifest.referenceDna;
  return {
    id: entry.id,
    name: entry.name,
    referenceName: entry.name,
    referenceFamilyId: entry.familyId,
    source: manifest.source.name,
    sourceUrl: manifest.source.url,
    rights: manifest.source.rights,
    industries: entry.businessKinds,
    moods: entry.tags.style,
    navigation: dna.navigationGeometry.mode,
    heroGeometry: dna.heroGeometry.mode,
    servicePresentation: dna.servicePresentation.pattern,
    sectionRhythm: dna.sectionSequence.join(" -> "),
    typographyCategory: dna.typography.display,
    imageStrategy: dna.imageTreatment.mode,
    motionOpportunities: [dna.motion.primitive, ...entry.tags.motion],
    familyId: entry.familyId,
    dossierPath: `data/reference-library/dossiers/${entry.id}`,
    mobileBehavior: dna.mobileRecomposition.strategy,
    prohibitedPatterns: dna.prohibitedPatterns,
    screenshotPath: `data/reference-library/dossiers/${entry.id}/screenshots/desktop.png`,
    mobileScreenshotPath: `data/reference-library/dossiers/${entry.id}/screenshots/mobile.png`,
    referenceNotes: dna.annotatedDescription,
    notes: "Archive-only design mechanics. Not selected by the Local SEO Core production randomizer.",
    evidenceKind: "permission-cleared-archive-reference",
    sourceStyles: entry.tags.style,
    sourceFonts: [dna.typography.display, dna.typography.body],
    referenceTags: entry.tags,
  };
}

async function backupIfPresent(sourcePath, backupPath) {
  try {
    await fs.access(sourcePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.copyFile(sourcePath, backupPath);
  return true;
}

/** Materialize new full-page captures while preserving any prior screenshots. */
export async function replaceArchiveScreenshots({
  dossierDirectory,
  captureDirectory,
  backupDirectory,
} = {}) {
  if (!dossierDirectory || !captureDirectory || !backupDirectory)
    throw new Error("Archive screenshot replacement requires dossier, capture, and backup directories.");

  const screenshots = ["desktop.png", "mobile.png"];
  for (const screenshot of screenshots)
    await fs.access(path.join(captureDirectory, screenshot));

  const screenshotsDirectory = path.join(dossierDirectory, "screenshots");
  await fs.mkdir(screenshotsDirectory, { recursive: true });
  for (const screenshot of screenshots) {
    const existingPath = path.join(screenshotsDirectory, screenshot);
    await backupIfPresent(
      existingPath,
      path.join(backupDirectory, screenshot),
    );
    await fs.copyFile(
      path.join(captureDirectory, screenshot),
      existingPath,
    );
  }
}

export function indexArchiveEntries(sourceEntries = []) {
  const byId = new Map();
  for (const entry of sourceEntries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim())
      throw new Error("Archive dossier entries require a non-empty id.");
    if (byId.has(entry.id))
      throw new Error(`Duplicate archive dossier id '${entry.id}'.`);
    byId.set(entry.id, entry);
  }
  return byId;
}

function stagedPath(rootDirectory, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath))
    throw new Error("Archive dossier replacement paths must be relative.");
  const resolved = path.resolve(rootDirectory, relativePath);
  if (resolved === rootDirectory || !resolved.startsWith(`${rootDirectory}${path.sep}`))
    throw new Error(`Archive dossier replacement path escapes the dossier: ${relativePath}`);
  return resolved;
}

/**
 * Replace a dossier from a validated sibling staging directory with rollback.
 * @param {{ dossierDirectory?: string, backupDirectory?: string, files?: Array<{path: string, source?: string, content?: string | Uint8Array}>, validateStaged?: (directory: string) => unknown, renameImpl?: typeof fs.rename }} options
 */
export async function replaceArchiveDossierFiles({
  dossierDirectory,
  backupDirectory,
  files = [],
  validateStaged,
  renameImpl = fs.rename,
} = {}) {
  if (!dossierDirectory || !Array.isArray(files) || !files.length)
    throw new Error("Archive dossier replacement requires a target directory and staged files.");
  const parentDirectory = path.dirname(dossierDirectory);
  await fs.mkdir(parentDirectory, { recursive: true });
  const transactionDirectory = await fs.mkdtemp(
    path.join(parentDirectory, `.${path.basename(dossierDirectory)}-replace-`),
  );
  const stagedDirectory = path.join(transactionDirectory, "staged-dossier");
  const previousDirectory = path.join(transactionDirectory, "previous-dossier");
  let hadPreviousDossier = false;
  let preserveRecoveryDirectory = false;

  try {
    try {
      await fs.access(dossierDirectory);
      hadPreviousDossier = true;
      await fs.cp(dossierDirectory, stagedDirectory, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await fs.mkdir(stagedDirectory, { recursive: true });
    }

    for (const file of files) {
      const target = stagedPath(stagedDirectory, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (typeof file.source === "string")
        await fs.copyFile(file.source, target);
      else if (Object.hasOwn(file, "content") && file.content !== undefined)
        await fs.writeFile(target, file.content);
      else
        throw new Error(`Archive dossier replacement '${file.path}' has no source or content.`);
    }
    if (typeof validateStaged === "function")
      await validateStaged(stagedDirectory);

    if (hadPreviousDossier && backupDirectory) {
      await fs.mkdir(path.dirname(backupDirectory), { recursive: true });
      await fs.cp(dossierDirectory, backupDirectory, { recursive: true, errorOnExist: true });
    }

    if (hadPreviousDossier)
      await renameImpl(dossierDirectory, previousDirectory);
    try {
      await renameImpl(stagedDirectory, dossierDirectory);
    } catch (commitError) {
      if (hadPreviousDossier) {
        try {
          await renameImpl(previousDirectory, dossierDirectory);
        } catch (rollbackError) {
          preserveRecoveryDirectory = true;
          throw new AggregateError(
            [commitError, rollbackError],
            `Archive dossier commit failed and rollback could not restore the prior directory. Recovery copy: ${previousDirectory}`,
          );
        }
      }
      throw commitError;
    }
    if (hadPreviousDossier)
      await fs.rm(previousDirectory, { recursive: true, force: true }).catch(() => {});
  } finally {
    if (!preserveRecoveryDirectory)
      await fs.rm(transactionDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function materializeArchiveDossiers({ write = false } = {}) {
  const registryPath = path.join(root, "data/inspiration-registry.json");
  const a1Path = path.join(root, "data/a1-reference-library.json");
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  const a1 = JSON.parse(await fs.readFile(a1Path, "utf8"));
  const recordById = new Map(registry.records.map((record) => [record.id, record]));
  const a1ById = new Map(a1.records.map((record) => [record.id, record]));
  const report = [];
  const entriesById = indexArchiveEntries(entries);
  const plannedArchiveEntries = new Map();

  for (const entry of entriesById.values()) {
    const dossierDirectory = path.join(root, "data/reference-library/dossiers", entry.id);
    const captureDirectory = path.join("/tmp", `launchloom-${entry.captureSlug}-capture`);
    const captureRecord = JSON.parse(await fs.readFile(path.join(captureDirectory, "capture-record.json"), "utf8"));
    const designPrompt = buildDesignPrompt(entry);
    if (designPrompt.trim().length < 900)
      throw new Error(`Archive design prompt for ${entry.id} is too short.`);
    for (const screenshot of ["desktop.png", "mobile.png"])
      await fs.access(path.join(captureDirectory, screenshot));
    const screenshotHashes = {};
    for (const kind of ["desktop", "mobile"])
      screenshotHashes[kind] = crypto
        .createHash("sha256")
        .update(await fs.readFile(path.join(captureDirectory, `${kind}.png`)))
        .digest("hex");
    const manifest = buildManifest(entry, captureRecord, screenshotHashes);
    plannedArchiveEntries.set(entry.id, {
      id: manifest.id,
      dossierPath: `data/reference-library/dossiers/${manifest.id}`,
      referenceName: manifest.referenceName,
      sourceUrl: manifest.source.url,
      rights: manifest.source.rights,
      status: manifest.review.status,
    });

    const validationDirectory = await fs.mkdtemp("/tmp/launchloom-archive-validation-");
    try {
      await fs.mkdir(path.join(validationDirectory, "screenshots"), { recursive: true });
      await fs.mkdir(path.join(validationDirectory, "rights"), { recursive: true });
      for (const screenshot of ["desktop.png", "mobile.png"])
        await fs.copyFile(
          path.join(captureDirectory, screenshot),
          path.join(validationDirectory, "screenshots", screenshot),
        );
      await fs.writeFile(
        path.join(validationDirectory, "capture-record.json"),
        `${JSON.stringify(captureRecord, null, 2)}\n`,
      );
      await fs.writeFile(
        path.join(validationDirectory, "rights/requester-attestation.md"),
        requesterAttestation(entry.sourceName, entry.sourceUrl),
      );
      await fs.writeFile(path.join(validationDirectory, "design-prompt.md"), designPrompt);
      validateReferenceDossier(manifest, { dossierDirectory: validationDirectory });
    } finally {
      await fs.rm(validationDirectory, { recursive: true, force: true });
    }

    if (write) {
      await replaceArchiveDossierFiles({
        dossierDirectory,
        backupDirectory: path.join(
          "/tmp/launchloom-fragment-backup",
          `${entry.id}-${process.pid}-${Date.now()}`,
        ),
        files: [
          { path: "screenshots/desktop.png", source: path.join(captureDirectory, "desktop.png") },
          { path: "screenshots/mobile.png", source: path.join(captureDirectory, "mobile.png") },
          { path: "capture-record.json", source: path.join(captureDirectory, "capture-record.json") },
          {
            path: "rights/requester-attestation.md",
            content: requesterAttestation(entry.sourceName, entry.sourceUrl),
          },
          { path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
          { path: "design-prompt.md", content: designPrompt },
        ],
        validateStaged: (stagedDirectory) =>
          validateReferenceDossier(manifest, { dossierDirectory: stagedDirectory }),
      });
    }
    const existing = recordById.get(entry.id);
    const source = existing || a1ById.get(entry.id);
    if (!source && entry.id !== "kokoro-spatial-editorial")
      throw new Error(`Archive reference ${entry.id} has no source record.`);
    const normalized = inspirationRecord(entry, manifest);
    if (existing) {
      const index = registry.records.findIndex((record) => record.id === entry.id);
      registry.records[index] = { ...existing, ...normalized };
    } else {
      registry.records.push(normalized);
    }
    report.push({ id: entry.id, productionEligible: false, promptCharacters: designPrompt.length });
  }

  registry.updatedAt = evidenceDate;
  const archiveIndex = {
    schemaVersion: 1,
    id: "launchloom-reference-archive",
    updatedAt: evidenceDate,
    policy: "permission-cleared-only; requester-attested archive material remains non-production until explicitly reviewed for niche fit",
    productionCore: "data/reference-library/core-collection.json",
    productionEligible: false,
    entries: [],
  };
  const dossierRoot = path.join(root, "data/reference-library/dossiers");
  for (const directoryName of await fs.readdir(dossierRoot)) {
    const manifestPath = path.join(dossierRoot, directoryName, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (manifest.productionEligible) continue;
      archiveIndex.entries.push({
        id: manifest.id,
        dossierPath: `data/reference-library/dossiers/${manifest.id}`,
        referenceName: manifest.referenceName,
        sourceUrl: manifest.source.url,
        rights: manifest.source.rights,
        status: manifest.review?.status || "archive-only",
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const entry of plannedArchiveEntries.values())
    if (!archiveIndex.entries.some((item) => item.id === entry.id))
      archiveIndex.entries.push(entry);
  archiveIndex.entries.sort((left, right) => left.id.localeCompare(right.id));
  if (write) {
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await fs.writeFile(
      path.join(root, "data/reference-library/archive-index.json"),
      `${JSON.stringify(archiveIndex, null, 2)}\n`,
    );
  }
  return { write, entries: report, archiveDossierCount: archiveIndex.entries.length, registryCount: registry.records.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await materializeArchiveDossiers({ write: process.argv.includes("--write") });
  console.log(JSON.stringify(result, null, 2));
}
