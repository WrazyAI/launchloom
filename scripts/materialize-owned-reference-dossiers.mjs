import fs from "node:fs";
import path from "node:path";
import { REFERENCE_FAMILIES } from "./reference-dna.mjs";
import { loadReferenceDossier } from "./reference-dossier.mjs";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "data/inspiration-registry.json");
const dossierRoot = path.join(root, "data/reference-library/dossiers");
const write = process.argv.includes("--write");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

const promptDetails = {
  "nightjar-cinematic-salon": {
    visual: "Use an immersive, near-black salon opening led by the interior photograph, not a two-column marketing split. Anchor a short editorial serif promise to the scene, then use small warm-metal labels and restrained utility links. Keep one booking action visible in the first scene. Image light, wood, seating, and shadow establish the atmosphere; do not add unrelated floating decoration.",
    rhythm: "Move from the room scene to a distinct sensory chapter, a concise editorial explanation, service chapters, a simple preparation/process moment, a second cinematic closing scene, FAQs, and contact. The service list should feel like an evening program, not four repeated cards. Use real service names and appointment details only from sealed business content.",
    interaction: "A slow image crossfade or image-crop reveal can connect the room and material details. Prefer one controlled sequence with a static image fallback. Keep motion subtle enough that the words and booking control remain immediately readable; do not pin the whole page or make booking dependent on animation.",
    mobile: "On 390px, let the room crop lead, then place the promise, short support, and booking action in normal flow. Make each material chapter a separate full-width image/text beat. Avoid text over the brightest photograph areas, remove pinned behavior, and keep the phone or booking route reachable without a hover.",
    signatures: "A low-light room-scene hero with copy inset into its composition; a distinct close-detail or atmosphere chapter; a restrained chapter-based service presentation; and a final image scene that resolves into the booking action.",
    avoid: "Bright clinic colors, generic beige luxury cards, a floating white pill navbar, numbered service tiles, borrowed salon claims, invented staff, or a copy-heavy process essay.",
  },
  "care-image-mosaic": {
    visual: "Open on a warm-paper canvas with a left-side care promise and a deliberately offset cluster of large landscape image windows on the right. Use a humanist sans with a large stacked headline and concise supporting text. Keep the photo cluster visibly related through matching crops and a quiet green frame; do not turn it into unrelated thumbnails.",
    rhythm: "Follow the mosaic opening with a narrow first-conversation band, a short care explanation, open service panels, a practical process chapter, concise FAQs, factual trust information, and a two-column closing contact conversation. Let each section change surface or alignment so the full page has a clear pace.",
    interaction: "Reveal the image windows in a short stagger or let a service row show its detail inline. The image relationship must remain understandable if all motion is disabled. The main action belongs immediately after the promise, before extended reassurance or service copy.",
    mobile: "At 390px, place the promise and action before a vertical sequence of crops. Preserve the different window proportions, but remove overlap that obscures people or text. Make service rows full-width tap targets and keep the first contact action above the long explanatory chapters.",
    signatures: "An asymmetrical promise-and-mosaic opening; several windows into a coherent care image story; a conversion band directly after the hero; and open editorial service rows rather than a card grid.",
    avoid: "Unrelated stock-photo grids, long why-us paragraphs, repeated claims about compassionate care, a centered generic split hero, clinical-blue dashboard components, or testimonials and credentials not supplied by the client.",
  },
  "care-concierge-cinematic": {
    visual: "Let a wide natural landscape occupy the opening. Place a short, high-contrast care promise directly over the darker, subject-safe portion of the image, with compact quiet navigation at the top edge. Use a restrained display serif and neutral body sans. Keep the request action inside the hero and avoid placing a floating card over the horizon.",
    rhythm: "Move immediately into a ruled service index, then use a human care image chapter, factual proof or service-area details, a short process explanation, FAQs, and contact. This route is cinematic but still utility-first: users should understand what support is offered and how to begin without searching through atmosphere.",
    interaction: "If useful, add a very subtle landscape parallax or image chapter reveal. It must not affect text positioning, load a video, or hide service rows. Reduced motion shows the complete static image and all service links.",
    mobile: "On mobile, do not rely on text overlay positioning against an unpredictable crop. Use the image as an opening backdrop or poster followed by the promise and action in normal flow, then stack ruled service rows. Keep the landscape recognizable and use an explicit dark text-safe region.",
    signatures: "A dark, edge-to-edge natural opening; concise copy anchored to the scene; an early horizontal or ruled service index; and a later image chapter that adds human context without inventing a customer story.",
    avoid: "Destination tiles, a floating centered card, autoplay video, low-contrast text over sky, late-only contact, or any guarantee about care staffing or response that the client did not verify.",
  },
  "trades-field-report": {
    visual: "Use a centered, narrow field-service statement on warm white with direct navigation and a phone action. Place a staggered project-photo mosaic immediately after the opening copy; its large horizontal crop should carry more weight than the supporting tile. A restrained service-orange accent marks labels and the request button, while deep green anchors type and dark chapters.",
    rhythm: "Let finished-work imagery lead into a plain diagnostic service index, then one project detail, a short explanation of what happens next, a service-area chapter, FAQs, and a direct request/contact close. Each service row explains a recognizable problem and links to its next action.",
    interaction: "Use a small reveal on project tiles or a clear focus state on service rows. Do not require hover to understand the service. Keep the full opening compact enough to show the promise, short summary, and request/call options at 100% zoom.",
    mobile: "Stack the opening in this order: service/location label, concise promise, one-sentence scope, request and call actions, then the image tiles. Avoid aggressive headline breaks. Let the diagnostic list use simple full-width rows with a short description and visible link.",
    signatures: "A narrow field-report intro, work photos directly below the promise, and a problem-oriented repair index with direct row actions. Use the local service area only when present in sealed facts.",
    avoid: "Oversized poster typography, dark cinematic overlays, rounded-card walls, vague claims such as best-in-town, fabricated emergency availability, or hiding the next step below a lengthy process section.",
  },
  "care-wellness-journal": {
    visual: "Frame the opening as a compact editorial panel beside a multi-window care-and-landscape mosaic. Use high-contrast serif display type, quiet sans support, near-black and soft-ivory surfaces, and one care-green transition. Keep the framed headline readable and pair it with an early conversation action.",
    rhythm: "Let the mosaic give way to a human care chapter, then a short service explanation, an image-led care moment, a compact process, concise questions, and contact. Alternate dark and light chapters intentionally. The care section should be brief and specific, not a long essay repeating the hero.",
    interaction: "Reveal image windows gently or use a restrained surface transition between chapters. The page remains complete without animation. Do not add an unrelated project marquee just because the editorial frame could accommodate one.",
    mobile: "At 390px, release the headline from its desktop frame and stack the crops in an intentional sequence. Keep each image large enough to read, shorten supporting copy before shrinking text, and make the first conversation action visible before later sections.",
    signatures: "A framed editorial promise paired with aligned landscape windows; an unmistakable dark-to-green or green-to-light care chapter transition; and a compact service treatment that does not become a generic card grid.",
    avoid: "A centered split hero, decorative infinite marquee, long why-us content, unrelated image cards, or claims about outcomes, testimonials, staff, and service guarantees absent from client data.",
  },
  "trade-project-showcase": {
    visual: "Build a bold service poster beside a tall stack of project-photo windows. The oversized condensed promise leads, while the image column shows completed work or tools as evidence. Use near-black/deep-green fields, warm white type, and a narrow orange signal accent. Put both the request and call actions in the opening poster.",
    rhythm: "After the poster, show one larger work-in-context image, then a large-type service index, a compact process, an accurate coverage chapter, FAQs, and a request close. Keep project evidence and service information separate so neither competes with the hero.",
    interaction: "Reveal image masks once as they enter view or focus the matching service row. Motion is supporting, not a sticky spectacle. With reduced motion, show the complete static stack and keep every service link available.",
    mobile: "On mobile, reduce headline scale before forcing new breaks, then put the main photo after the promise and actions. Stack each image window in reading order. Do not crop out the subject or push the phone action below multiple screens.",
    signatures: "A service-poster hero with an asymmetric vertical photo stack; a large work-in-context chapter; and a large-type but directly scannable trade-service index.",
    avoid: "A 3D object stage, decorative number columns, uniform service cards, a tiny-copy split hero, unverifiable before/after claims, or fabricated project photos presented as completed client work.",
  },
  "urgent-trade-service-poster": {
    visual: "Use a light utility navigation strip, then a deep-petrol poster with a huge problem-led statement on the left and an oversized diagonal warning frame on the right. Use orange and yellow as clear signals, not as large blocks of unreadable text. Place a short explanation, request action, and call option directly under the promise.",
    rhythm: "A high-contrast three-part next-step band follows the poster. Continue with a graphic diagnostic chapter and plain issue-first service rows, then concise FAQs and a direct request form. The visual urgency comes from geometry and hierarchy, not from fabricated live status or a response-time promise.",
    interaction: "The warning frame may shift or reveal by a few pixels as the page enters view. Keep the motion CSS-sized and optional. The diagnostic ring is illustrative only; do not make it behave like a real-time meter, dispatch map, or availability indicator.",
    mobile: "On 390px, keep the dark poster statement, short scope, and both actions together. Move the geometric signal after the copy rather than placing text over it. Stack the next-step band into three readable rows and retain strong contrast and tap size.",
    signatures: "The diagonal yellow frame on a dark field; the orange next-step band immediately after the opening; and a plain diagnostic index organized around customer-visible problems.",
    avoid: "Fake emergency status, invented response guarantees, urgent copy unsupported by client facts, tiny text inside orange bars, generic rounded cards, or decorative charts that imply measured service data.",
  },
  "quiet-care-consultation": {
    visual: "Use a light editorial opening with a large calm serif promise on the left and one simple illustrated person silhouette in an architectural arch on the right. The portrait is clearly an illustration, never a named employee or customer. Keep warm white, deep green, and soft sage, with a low-pressure primary conversation action.",
    rhythm: "A concise dark-green reassurance chapter follows. Present care options as ruled, full-width service rows, then place the conversation form in a gentle tinted section and close without adding a redundant testimonial wall. Explain the first step with plain, practical language.",
    interaction: "A subtle arch-mask reveal may introduce the illustration. Service rows use direct links or simple disclosure with keyboard support. The page remains calm and complete with motion off.",
    mobile: "Stack the promise and action first, then the illustration, then the short reassurance and full-width service rows. Keep the form close to the final call to action; do not force side-by-side layout at phone widths.",
    signatures: "The arch-framed abstract person; a warm editorial promise; a dark-green listening/reassurance chapter; and ruled care-service rows instead of cards.",
    avoid: "Clinical blue dashboards, stock people presented as care staff, long why-us essays, invented qualifications, pressure-driven forms, or generic rounded service cards.",
  },
  "neighborhood-table-collage": {
    visual: "Open with an asymmetric product collage on warm cream: generous serif headline and short local proposition on the left, varied abstract/product stills to the right. Use cocoa ink, sage, butter yellow, and tomato orange. Include one useful visit/order action and a small opening-hours or directions detail only when verified.",
    rhythm: "Move from the collage to a seasonal shelf/menu presented as editorial rows, then a wide graphic visit band, concise FAQs, and a closing order or visit invitation. Let food and product photography create texture; the whole sequence should feel like a neighborhood counter, not a SaaS feature page.",
    interaction: "Use subtle depth between collage layers or a quiet seasonal row highlight. Keep all menu labels and directions available without hover or drag. Reduced motion uses the same layered stills in a stable layout.",
    mobile: "At mobile width, stack the product stills with deliberate offsets and no overlap over text. Make menu rows full width and readable. Keep the visit/order action near the opening and ensure address, opening hours, and contact remain factual.",
    signatures: "A loose asymmetrical product collage; a seasonal shelf/menu row presentation; one bold graphic visit band before contact; and warm, varied image crops with meaningful negative space.",
    avoid: "Blue SaaS colors, a rounded card wall, heavy pill navigation, invented ingredients or opening hours, unverified delivery claims, and monochrome luxury styling.",
  },
  "kinetic-club-program-bands": {
    visual: "Make a near-black athletic action poster with huge condensed typography, compact scoreboard-like utility navigation, a restrained atmospheric field, and acid-lime action accents. The opening should feel energetic at a glance but still explain who the program serves and how to take a first step.",
    rhythm: "Follow with a second bold training statement and horizontal program bands. Transition to one high-energy recovery/process panel, then an action-focused closing statement, concise FAQs, and contact. The bands should read as a coachable program index, not identical cards.",
    interaction: "If using GSAP or scroll-linked movement, keep it to one bounded sequence: a subtle headline/band reveal. No scroll-jacking, pinned lock, or horizontal drag required. Freeze in a clear still state for reduced motion.",
    mobile: "At 390px, stack the poster hierarchy and program rows. Reduce type before cropping or overlapping action buttons. Replace any desktop horizontal scrub with ordinary touch-safe rows and retain visible class or consultation actions.",
    signatures: "The high-impact black poster with oversized performance type; a lime signal action; wide program bands; and an energetic recovery chapter with geometric graphic framing.",
    avoid: "Soft editorial cards, decorative service numbering, an extended about page before programs, unsupported fitness results, body-shaming language, or motion that prevents normal scrolling.",
  },
  "clear-counsel-ledger": {
    visual: "Compose a quiet, asymmetric professional opening with a narrow side rail for a short practice descriptor, a large editorial serif statement, and one restrained portrait illustration. Use warm paper, ink, pale blue-grey, and one muted ochre/copper action. Keep navigation direct and the first contact option close to the positioning.",
    rhythm: "Move into a decision-led expertise ledger with ruled rows, then a two-surface process chapter that explains how an engagement works. Follow with concise FAQs and a discreet inquiry form. Do not add metrics, awards, logos, or outcome claims unless the client verifies them.",
    interaction: "Use small, keyboard-visible row focus or a restrained rule reveal. Keep the information architecture readable and non-interactive by default; do not turn legal or financial information into a clever animation.",
    mobile: "Collapse the side rail into a small eyebrow, put the positioning and action first, then place the illustration after the copy. Convert the ledger into full-width touch rows and keep the process steps clear in a single column.",
    signatures: "A narrow professional side rail; large restrained serif positioning; a simple portrait illustration; ruled expertise rows; and a distinct two-tone process explanation.",
    avoid: "Invented credentials or case outcomes, unverified client marks, a generic split hero, decorative metrics, claims of guaranteed results, or exposing sensitive information in the sample contact form.",
  },
};

function promptFor(record) {
  const detail = promptDetails[record.id];
  if (!detail) throw new Error(`No curated prompt exists for '${record.id}'.`);
  return `# Reference implementation brief\n\n## Scope and non-copy rule\nUse the paired screenshots as evidence for layout mechanics, design rhythm, type hierarchy, image placement, and interaction opportunities only. Re-author every word, asset, logo, and brand element for the client. Use verified client facts and SEO content tokens; do not transfer the fictional prototype's claims, address, staff, prices, or sample copy. Keep Services, FAQs, and Contact discoverable.\n\n## Visual hierarchy\n${detail.visual}\n\n## Page sequence\n${detail.rhythm}\n\n## Interaction and motion\n${detail.interaction}\n\n## Responsive translation\n${detail.mobile}\n\n## Signature elements\nPreserve these mechanics in the new implementation: ${detail.signatures}\n\n## Prohibited patterns\nDo not introduce any of the following: ${detail.avoid}\n\n## Local SEO and conversion constraints\nBind the business name, primary service, verified service area, contact details, pricing, qualifications, and FAQs to sealed content tokens and the researched intake. Place the main conversion action near the opening promise, then repeat it at useful decision points. Never invent a physical office from a service-area list, reviews, certifications, response times, operating hours, or outcomes. Do not use em dashes. At 1536x864 and 1366x768, the complete desktop navigation and hero must fit the opening viewport; at 390x844, preserve the intended composition with no horizontal overflow.\n`;
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG" || bytes.toString("ascii", 12, 16) !== "IHDR")
    throw new Error(`Expected a valid PNG capture at ${filePath}.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const records = registry.records.filter(
  (record) => record.rights === "owned" && record.screenshotPath && record.mobileScreenshotPath,
);
const prepared = records.map((record) => {
  const familyId = record.referenceFamilyId || record.familyId;
  if (!REFERENCE_FAMILIES[familyId]) throw new Error(`Reference '${record.id}' has no explicit Reference DNA family '${familyId}'.`);
  const prompt = promptFor(record);
  const desktopPath = path.resolve(root, record.screenshotPath);
  const mobilePath = path.resolve(root, record.mobileScreenshotPath);
  if (!fs.existsSync(desktopPath) || !fs.existsSync(mobilePath))
    throw new Error(`Reference '${record.id}' is missing its registered desktop/mobile evidence.`);
  const desktopSize = pngDimensions(desktopPath);
  const mobileSize = pngDimensions(mobilePath);
  if (desktopSize.width !== 1440 || mobileSize.width !== 390)
    throw new Error(`Reference '${record.id}' must use the standard 1440px desktop and 390px mobile captures.`);
  return { record, familyId, prompt, desktopPath, mobilePath, desktopSize, mobileSize };
});

if (!write) {
  console.log(`reference_dossier_seed=ready records=${prepared.length} mode=dry-run`);
  console.log("Pass --write to create the per-reference folders. Existing folders are never overwritten.");
} else {
  const collisions = prepared
    .map(({ record }) => path.join(dossierRoot, record.id))
    .filter((directory) => fs.existsSync(directory));
  if (collisions.length)
    throw new Error(`Refusing to overwrite existing reference dossiers: ${collisions.join(", ")}`);

  fs.mkdirSync(dossierRoot, { recursive: true });
  for (const item of prepared) {
    const { record, familyId, prompt, desktopPath, mobilePath, desktopSize, mobileSize } = item;
    const directory = path.join(dossierRoot, record.id);
    const stagingParent = fs.mkdtempSync(
      path.join(dossierRoot, `.staging-${record.id}-`),
    );
    const stagingDirectory = path.join(stagingParent, record.id);
    const screenshotsDirectory = path.join(stagingDirectory, "screenshots");
    try {
      fs.mkdirSync(screenshotsDirectory, { recursive: true });
      fs.copyFileSync(desktopPath, path.join(screenshotsDirectory, "desktop.png"));
      fs.copyFileSync(mobilePath, path.join(screenshotsDirectory, "mobile.png"));
      fs.writeFileSync(path.join(stagingDirectory, "design-prompt.md"), prompt);

      const referenceDna = {
        ...REFERENCE_FAMILIES[familyId],
        annotatedDescription: record.referenceNotes || record.notes,
      };
      const manifest = {
        schemaVersion: 1,
        id: record.id,
        productionEligible: false,
        referenceName: record.referenceName || record.name,
        familyId,
        source: {
          name: record.source,
          url: record.sourceUrl,
          rights: record.rights,
          rightsEvidence: "This is a LaunchLoom-owned original design study and its in-house rendered capture, stored for internal inspiration and implementation research.",
        },
        businessKinds: record.industries,
        evidence: {
          desktop: { path: "screenshots/desktop.png", capture: "full-page", viewport: { width: desktopSize.width, height: 1000 } },
          mobile: { path: "screenshots/mobile.png", capture: "full-page", viewport: { width: mobileSize.width, height: 844 } },
        },
        referenceDna,
        review: {
          status: "initial-curation",
          curator: "Codex-assisted screenshot review",
          reviewedAt: "2026-09-25",
          scope: "paired full-page evidence and transferable visual mechanics; not approval of sample business claims or production copy",
        },
      };
      fs.writeFileSync(path.join(stagingDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      loadReferenceDossier(path.relative(root, stagingDirectory), { repositoryRoot: root });
      fs.renameSync(stagingDirectory, directory);
    } finally {
      fs.rmSync(stagingParent, { recursive: true, force: true });
    }
  }
  console.log(`reference_dossier_seed=complete records=${prepared.length} mode=write rights=cleared-only`);
}
